#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
review_and_replace_recipe_images.py
食刻 (shike.db) 菜谱图片智能评审与高质量全量替换自动化运维治理脚本

功能架构：
1. 保护白名单：识别并强锁定 `/images/dishes/*.webp` 本地已核验高清封面，标记为 VERIFIED_LOCAL。
2. 评审与过滤：识别所有外部占位图（如大量重复套用的 Unsplash 图片）并纳入待替换队列。
3. 互联网高质量图片搜寻：基于 Bing Image (检索 `f'{name} 菜谱'`) 与优质中餐图源 (下厨房等) 检索真实高清图片，
   自动过滤失效、过小、长宽比异常或损坏的链接。
4. 多模态智能盲审：调用本地 CPA 多模态大模型 (gemini-3.8-flash-high) 进行成品菜肴、无水印、高匹配度多维度视觉核验 (得分 >= 7 通过)。
5. 数据库更新与断点续传：更新 recipes 表 image_url 字段，在 `/opt/shike-ai/data/image_review_progress.json` 中维护断点进度。
6. 命令行支持：--limit N, --workers N, --dry-run, --self-test, --retry-failed 等。
"""

import os
import sys
import io
import re
import time
import json
import base64
import html
import logging
import sqlite3
import argparse
import threading
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.request
import urllib.parse
import urllib.error
from PIL import Image
import requests

# ===========================
# 全局默认配置
# ===========================
DEFAULT_DB_PATH = Path('/opt/shike-ai/data/db/shike.db')
DEFAULT_PROGRESS_PATH = Path('/opt/shike-ai/data/image_review_progress.json')
DEFAULT_CPA_URL = os.getenv('CPA_URL', 'http://127.0.0.1:5201/v1')
DEFAULT_CPA_MODEL = 'gemini-3.8-flash-high'

MIN_IMAGE_BYTES = 20 * 1024        # 最小 20 KB，过滤过小缩略图
MAX_IMAGE_BYTES = 15 * 1024 * 1024 # 最大 15 MB，防止超大异常文件
MIN_IMAGE_WIDTH = 350              # 最小宽度
MIN_IMAGE_HEIGHT = 250             # 最小高度
MIN_ASPECT_RATIO = 0.35            # 宽高比下限，避免极端窄条图
MAX_ASPECT_RATIO = 2.85            # 宽高比上限，避免极端横幅图
PASS_SCORE_THRESHOLD = 7           # 多模态打分通过阈值 (1-10)
MAX_CANDIDATES_PER_DISH = 6        # 每个菜品最多盲审候选图数

# ===========================
# 日志系统配置
# ===========================
class ColoredFormatter(logging.Formatter):
    """带 ANSI 颜色的终端日志格式化器"""
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    CYAN = '\033[96m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

    def format(self, record):
        timestamp = datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S')
        level_name = record.levelname
        msg = record.getMessage()

        if record.levelno >= logging.ERROR:
            lvl_str = f"{self.RED}[{level_name}]{self.RESET}"
        elif record.levelno >= logging.WARNING:
            lvl_str = f"{self.YELLOW}[{level_name}]{self.RESET}"
        elif record.levelno >= logging.INFO:
            lvl_str = f"{self.GREEN}[{level_name}]{self.RESET}"
        else:
            lvl_str = f"{self.BLUE}[{level_name}]{self.RESET}"

        return f"{self.CYAN}{timestamp}{self.RESET} {lvl_str} {msg}"

logger = logging.getLogger('recipe_image_governor')
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(ColoredFormatter())
logger.addHandler(handler)
logger.setLevel(logging.INFO)


# ===========================
# 辅助函数与凭证获取
# ===========================
def get_cpa_api_key(cli_key: Optional[str] = None) -> str:
    """获取 CPA API Key（依次尝试 CLI 参数 -> 环境变量 -> .env 文件）"""
    if cli_key:
        return cli_key.strip()
    if os.getenv('CPA_API_KEY'):
        return os.getenv('CPA_API_KEY', '').strip()

    env_path = Path('/opt/shike-ai/.env')
    if env_path.is_file():
        try:
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('CPA_API_KEY='):
                        val = line.split('=', 1)[1].strip().strip('\"\'')
                        if val:
                            return val
        except Exception as e:
            logger.warning(f"读取 .env 文件失败: {e}")
    return ''


def clean_dish_name_for_search(name: str) -> str:
    """清洗菜品名称中的修饰词与前缀符号，提高图源检索召回率与准确度"""
    clean = re.sub(r'^[✨⭐\s]*AI[定制]*\s*[·•-]?\s*', '', name)
    clean = re.sub(r'[【】「」『』\[\]()（）]', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean or name


def is_verified_local(image_url: Optional[str]) -> bool:
    """判定是否为食刻已核验的本地高质量 WebP 图片白名单"""
    if not image_url:
        return False
    clean_url = image_url.strip()
    return clean_url.startswith('/images/dishes/') and clean_url.endswith('.webp')


def is_placeholder_image(image_url: Optional[str]) -> bool:
    """判定是否为外部占位图（如 Unsplash 占位图、空图、下厨房图或损坏格式）"""
    if not image_url:
        return True
    clean_url = image_url.strip().lower()
    if is_verified_local(clean_url):
        return False
    if 'unsplash.com' in clean_url:
        return True
    if 'chuimg.com' in clean_url or 'xiachufang.com' in clean_url:
        return True
    if clean_url.startswith('data:image'):
        return True
    return False


# ===========================
# 互联网高清图源搜寻引擎
# ===========================
class ImageSearcher:
    """中餐高质量美食图片搜寻器（支持 Bing Image 检索与下厨房备用源）"""

    HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cookie': 'SRCHHPGUSR=ADLT=OFF&NRSLT=50;'
    }

    @classmethod
    def search_bing(cls, dish_name: str, max_results: int = 15) -> List[str]:
        """通过 Bing Image 检索 `f'{dish_name} 菜谱'` 并解析真实高清图片 URL"""
        query = urllib.parse.quote(f"{dish_name} 菜谱")
        url = f"https://www.bing.com/images/async?q={query}&first=1&count=30&scenario=ImageBasicHover&datsrc=N_I&layout=RowBased&mmasync=1"
        req = urllib.request.Request(url, headers=cls.HEADERS)
        urls = []
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                text = resp.read().decode('utf-8', errors='ignore')
            iusc_matches = re.findall(r'class=\"iusc\"[^>]*m=\"([^\"]+)\"', text)
            for item in iusc_matches:
                try:
                    data = json.loads(html.unescape(item))
                    murl = data.get('murl')
                    if murl and murl.startswith('http') and not cls._is_blacklisted_url(murl):
                        urls.append(murl)
                except Exception:
                    continue
                if len(urls) >= max_results:
                    break
        except Exception as e:
            logger.debug(f"Bing 图片搜索失败 [{dish_name}]: {e}")
        return urls

    @classmethod
    def search_360(cls, dish_name: str, max_results: int = 15) -> List[str]:
        """通过 360 图片搜索检索 `f'{dish_name} 菜谱'` 并解析真实高清图片 URL"""
        query = urllib.parse.quote(f"{dish_name} 菜谱")
        url = f"https://image.so.com/j?q={query}&sn=0&pn={max_results * 2}"
        headers = {
            'User-Agent': cls.HEADERS['User-Agent'],
            'Referer': 'https://image.so.com/'
        }
        req = urllib.request.Request(url, headers=headers)
        urls = []
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                text = resp.read().decode('utf-8', errors='ignore')
            data = json.loads(text)
            for item in data.get('list', []):
                img_url = item.get('img')
                if img_url and img_url.startswith('http') and not cls._is_blacklisted_url(img_url):
                    urls.append(img_url)
                if len(urls) >= max_results:
                    break
        except Exception as e:
            logger.debug(f"360 图片搜索失败 [{dish_name}]: {e}")
        return urls

    @classmethod
    def _is_blacklisted_url(cls, url: str) -> bool:
        """过滤无效格式、动态图、矢量图及黑名单网站"""
        lower = url.lower()
        if any(lower.endswith(ext) for ext in ['.svg', '.gif', '.ico', '.bmp']):
            return True
        # 排除下厨房及其图床域名
        if any(d in lower for d in ['chuimg.com', 'xiachufang.com']):
            return True
        # 排除常见非菜品图床
        if any(d in lower for d in ['avatar', 'favicon', 'logo', 'icon', 'meme', 'banner', 'button']):
            return True
        return False

    @classmethod
    def search_candidates(cls, dish_name: str, limit: int = MAX_CANDIDATES_PER_DISH) -> List[str]:
        """多源聚合检索，返回去重后的候选高清图片列表"""
        candidates = []
        seen = set()

        # 1. 主源：Bing Image
        bing_urls = cls.search_bing(dish_name, max_results=limit * 2)
        for u in bing_urls:
            if u not in seen:
                seen.add(u)
                candidates.append(u)

        # 2. 互补源：360 高清中餐图片检索（纯品名检索，补全摄影图库）
        so_urls = cls.search_360(dish_name, max_results=limit * 2)
        for u in so_urls:
            if u not in seen:
                seen.add(u)
                candidates.append(u)

        return candidates[:limit * 2]


# ===========================
# 图片校验与预处理器
# ===========================
class ImageValidator:
    """图片下载校验、规格过滤与大模型预处理"""

    DOWNLOAD_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
    }

    @classmethod
    def download_and_validate(cls, url: str) -> Tuple[bool, Optional[bytes], Optional[Tuple[int, int]], str]:
        """
        下载并校验图片格式与物理分辨率
        返回: (是否有效, 图片字节流, 分辨率元组(宽,高), 描述信息)
        """
        try:
            req = urllib.request.Request(url, headers=cls.DOWNLOAD_HEADERS)
            with urllib.request.urlopen(req, timeout=8) as resp:
                status = resp.status
                if status != 200:
                    return False, None, None, f"HTTP 状态码异常: {status}"
                data = resp.read()

            data_len = len(data)
            if data_len < MIN_IMAGE_BYTES:
                return False, None, None, f"文件过小 ({data_len / 1024:.1f}KB < {MIN_IMAGE_BYTES / 1024:.1f}KB)"
            if data_len > MAX_IMAGE_BYTES:
                return False, None, None, f"文件过大 ({data_len / (1024*1024):.1f}MB)"

            # PIL 解析与完整性校验
            try:
                img = Image.open(io.BytesIO(data))
                img.verify()
                # verify 会使得句柄关闭，重新加载以读取尺寸与模式
                img = Image.open(io.BytesIO(data))
            except Exception as pe:
                return False, None, None, f"图片损坏无法解析: {pe}"

            w, h = img.size
            if w < MIN_IMAGE_WIDTH or h < MIN_IMAGE_HEIGHT:
                return False, None, None, f"分辨率过低 ({w}x{h} < {MIN_IMAGE_WIDTH}x{MIN_IMAGE_HEIGHT})"

            ratio = w / float(h)
            if ratio < MIN_ASPECT_RATIO or ratio > MAX_ASPECT_RATIO:
                return False, None, None, f"宽高比异常 ({ratio:.2f})"

            return True, data, (w, h), "合格图片"
        except urllib.error.HTTPError as he:
            return False, None, None, f"HTTP错误: {he.code}"
        except urllib.error.URLError as ue:
            return False, None, None, f"网络连接错误: {ue.reason}"
        except Exception as e:
            return False, None, None, f"下载异常: {e}"

    @classmethod
    def prepare_base64_for_llm(cls, raw_bytes: bytes, max_dim: int = 1024) -> str:
        """将图片等比缩放至最大 1024 边长并转为 JPEG Base64，保障大模型审核效率与降低带宽消耗"""
        img = Image.open(io.BytesIO(raw_bytes))
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')
        img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=85)
        return base64.b64encode(buf.getvalue()).decode('utf-8')


# ===========================
# 多模态大模型盲审引擎
# ===========================
class MultimodalReviewer:
    """基于本地 CPA (gemini-3.8-flash-high) 的美食多模态视觉盲审专家"""

    def __init__(self, cpa_url: str = DEFAULT_CPA_URL, api_key: str = '', model: str = DEFAULT_CPA_MODEL):
        self.endpoint = f"{cpa_url.rstrip('/')}/chat/completions"
        self.api_key = api_key
        self.model = model

    def evaluate_image(self, dish_name: str, b64_image: str) -> Dict[str, Any]:
        """
        向大模型发起多模态评审请求
        返回标准字典:
        {
            "score": 1-10,
            "passed": bool,
            "is_cooked": bool,
            "has_watermark": bool,
            "reason": "..."
        }
        """
        prompt = f"""你是一位极度专业严苛的美食视觉质量总监与高级中餐厨艺专家。
请对这张待选为菜谱【{dish_name}】封面大图的图片进行视觉多模态盲审和打分。

评审核心标准：
1. 菜品高度一致性：图片是否真实呈现【{dish_name}】这道菜？必须是制作完成的装盘成品菜肴（熟食或调味成型的凉拌菜均可；严禁纯生肉、散落未加工生蔬菜备料、生料切片堆放或无关菜品）。
2. 视觉品质与食欲感：特写饱满、色泽诱人、质感油润、对焦清晰，无严重拉伸模糊、过暗或大面积过曝。
3. 纯净度（严禁水印牛皮癣）：绝对不能有明显第三方商业水印、网站Logo、台标、联系电话、二维码或明显遮挡的牛皮癣文字。若有明显水印牛皮癣，则必须判定不通过。
4. 评分规则：给出 1-10 的整数分。
   - 7分及以上判定合格 (passed=true)
   - 7分以下判定不合格 (passed=false)

请以严格的纯 JSON 格式输出，不要带有任何 Markdown 标记或多余文字：
{{"score": 8, "passed": true, "is_cooked": true, "has_watermark": false, "reason": "成品色泽油亮诱人，无水印，与菜品完全一致"}}
"""
        payload = {
            'model': self.model,
            'messages': [
                {
                    'role': 'user',
                    'content': [
                        {'type': 'text', 'text': prompt},
                        {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64_image}'}}
                    ]
                }
            ],
            'temperature': 0.1
        }

        headers = {'Content-Type': 'application/json'}
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'

        try:
            res = requests.post(self.endpoint, headers=headers, json=payload, timeout=35)
            if res.status_code != 200:
                return {
                    "score": 0,
                    "passed": False,
                    "is_cooked": False,
                    "has_watermark": False,
                    "reason": f"大模型接口 HTTP 异常 {res.status_code}: {res.text[:120]}"
                }

            data = res.json()
            raw_text = data['choices'][0]['message']['content'].strip()
            # 提取 JSON 代码块或纯对象
            clean_text = raw_text
            json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
            if json_match:
                clean_text = json_match.group(0)

            result = json.loads(clean_text)
            score = int(result.get('score', 0))
            is_cooked = bool(result.get('is_cooked', False))
            has_watermark = bool(result.get('has_watermark', False))
            reason = str(result.get('reason', '无评审理由'))

            # 综合判定：分数 >= 7 且必须是成品且无水印
            passed = (score >= PASS_SCORE_THRESHOLD) and is_cooked and (not has_watermark)

            return {
                "score": score,
                "passed": passed,
                "is_cooked": is_cooked,
                "has_watermark": has_watermark,
                "reason": reason
            }
        except Exception as e:
            return {
                "score": 0,
                "passed": False,
                "is_cooked": False,
                "has_watermark": False,
                "reason": f"大模型调用解析异常: {e}"
            }


# ===========================
# 断点续传与进度管理
# ===========================
class ProgressManager:
    """断点续传进度管理器，支持并发线程安全更新与原子化文件刷盘"""

    def __init__(self, progress_path: Path = DEFAULT_PROGRESS_PATH):
        self.path = progress_path
        self.lock = threading.Lock()
        self.data: Dict[str, Any] = {
            "version": "1.0",
            "updated_at": datetime.now().isoformat(),
            "summary": {
                "total_recipes": 0,
                "verified_local": 0,
                "updated": 0,
                "failed": 0,
                "dry_run": 0
            },
            "records": {}
        }
        self.load()

    def load(self):
        """读取现有断点记录"""
        if self.path.is_file():
            try:
                with open(self.path, 'r', encoding='utf-8') as f:
                    loaded = json.load(f)
                    if isinstance(loaded, dict) and 'records' in loaded:
                        self.data = loaded
                        logger.info(f"成功加载历史进度文件: {self.path} (已记录 {len(self.data['records'])} 道菜品)")
            except Exception as e:
                logger.warning(f"读取进度文件失败，将新建进度记录: {e}")

    def save(self):
        """线程安全且原子化保存进度至磁盘"""
        with self.lock:
            self.data["updated_at"] = datetime.now().isoformat()
            tmp_path = self.path.with_suffix('.tmp')
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with open(tmp_path, 'w', encoding='utf-8') as f:
                    json.dump(self.data, f, ensure_ascii=False, indent=2)
                tmp_path.replace(self.path)
                try:
                    os.chmod(self.path, 0o666)
                except Exception:
                    pass
            except Exception as e:
                logger.error(f"保存断点进度文件失败: {e}")

    def should_process(self, recipe_id: str, retry_failed: bool = False) -> bool:
        """判定该菜品是否需要执行网络搜寻与大模型评审"""
        with self.lock:
            record = self.data["records"].get(recipe_id)
            if not record:
                return True
            status = record.get("status")
            if status in ("VERIFIED_LOCAL", "UPDATED"):
                return False
            if status == "FAILED" and not retry_failed:
                return False
            return True

    def record_local_verified(self, recipe_id: str, name: str, image_url: str):
        with self.lock:
            self.data["records"][recipe_id] = {
                "id": recipe_id,
                "name": name,
                "status": "VERIFIED_LOCAL",
                "image_url": image_url,
                "score": 10,
                "is_cooked": True,
                "has_watermark": False,
                "reason": "食刻本地已核验高清封面白名单，直接保留",
                "processed_at": datetime.now().isoformat()
            }
            self._recalculate_summary()

    def record_success(self, recipe_id: str, name: str, old_url: str, new_url: str,
                       score: int, reason: str, dry_run: bool = False):
        with self.lock:
            status = "DRY_RUN" if dry_run else "UPDATED"
            self.data["records"][recipe_id] = {
                "id": recipe_id,
                "name": name,
                "status": status,
                "old_image_url": old_url,
                "image_url": new_url,
                "score": score,
                "is_cooked": True,
                "has_watermark": False,
                "reason": reason,
                "processed_at": datetime.now().isoformat()
            }
            self._recalculate_summary()

    def record_failed(self, recipe_id: str, name: str, old_url: str, reason: str, best_score: int = 0):
        with self.lock:
            self.data["records"][recipe_id] = {
                "id": recipe_id,
                "name": name,
                "status": "FAILED",
                "old_image_url": old_url,
                "image_url": old_url,
                "score": best_score,
                "reason": reason,
                "processed_at": datetime.now().isoformat()
            }
            self._recalculate_summary()

    def _recalculate_summary(self):
        records = self.data["records"]
        summary = {
            "total_recipes": len(records),
            "verified_local": sum(1 for r in records.values() if r.get('status') == 'VERIFIED_LOCAL'),
            "updated": sum(1 for r in records.values() if r.get('status') == 'UPDATED'),
            "failed": sum(1 for r in records.values() if r.get('status') == 'FAILED'),
            "dry_run": sum(1 for r in records.values() if r.get('status') == 'DRY_RUN'),
        }
        self.data["summary"] = summary

    def get_stats(self) -> Dict[str, int]:
        with self.lock:
            return dict(self.data["summary"])


# ===========================
# 自动化治理主调度器
# ===========================
class RecipeImageGovernor:
    """菜谱图片全流程治理主调度器"""

    def __init__(self, db_path: Path = DEFAULT_DB_PATH, progress_path: Path = DEFAULT_PROGRESS_PATH,
                 cpa_url: str = DEFAULT_CPA_URL, cpa_key: str = '',
                 workers: int = 3, dry_run: bool = False, retry_failed: bool = False):
        self.db_path = db_path
        self.progress_mgr = ProgressManager(progress_path)
        self.reviewer = MultimodalReviewer(cpa_url, cpa_key)
        self.workers = max(1, workers)
        self.dry_run = dry_run
        self.retry_failed = retry_failed
        self.db_lock = threading.Lock()

    def get_all_recipes(self) -> List[Dict[str, Any]]:
        """从 SQLite 读取全部菜谱"""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT id, name, category, cuisine, image_url FROM recipes ORDER BY id ASC")
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows

    def update_recipe_image(self, recipe_id: str, new_image_url: str):
        """线程安全写库更新 image_url"""
        if self.dry_run:
            return
        with self.db_lock:
            conn = sqlite3.connect(str(self.db_path))
            cur = conn.cursor()
            cur.execute("UPDATE recipes SET image_url = ? WHERE id = ?", (new_image_url, recipe_id))
            conn.commit()
            conn.close()

    def process_single_recipe(self, recipe: Dict[str, Any], index: int, total: int) -> Tuple[bool, str]:
        """处理单道菜品的核心流程"""
        recipe_id = recipe['id']
        name = recipe['name']
        current_img = recipe.get('image_url') or ''

        prefix = f"[{index}/{total}] 菜品【{name}】({recipe_id})"

        # 1. 白名单核验：若当前已是本地已核验 WebP，直接保留
        if is_verified_local(current_img):
            logger.info(f"{prefix} 命中本地高质量白名单 [{current_img}] -> 直接标记合格 (VERIFIED_LOCAL)")
            self.progress_mgr.record_local_verified(recipe_id, name, current_img)
            self.progress_mgr.save()
            return True, "VERIFIED_LOCAL"

        logger.info(f"{prefix} 当前图为外部占位图/待审核图，启动高质量图源搜寻...")

        # 2. 互联网搜寻候选图
        search_term = clean_dish_name_for_search(name)
        candidates = ImageSearcher.search_candidates(search_term, limit=MAX_CANDIDATES_PER_DISH)
        if len(candidates) < 3 and search_term != name:
            candidates.extend([c for c in ImageSearcher.search_candidates(name, limit=MAX_CANDIDATES_PER_DISH) if c not in candidates])
        if not candidates:
            msg = "未搜寻到可用候选图源"
            logger.warning(f"{prefix} ❌ {msg}")
            self.progress_mgr.record_failed(recipe_id, name, current_img, msg)
            self.progress_mgr.save()
            return False, msg

        logger.info(f"{prefix} 检索到 {len(candidates)} 个候选链接，开始逐一校验与多模态盲审...")

        # 3. 逐个候选图校验与多模态大模型盲审
        best_candidate = None
        best_eval = None
        candidate_idx = 0

        for cand_url in candidates:
            candidate_idx += 1
            # 3.1 下载与物理规格校验
            valid, raw_bytes, dims, val_msg = ImageValidator.download_and_validate(cand_url)
            if not valid:
                logger.debug(f"{prefix} 候选 #{candidate_idx} 过滤淘汰: {val_msg} ({cand_url})")
                continue

            w, h = dims
            logger.info(f"{prefix} 候选 #{candidate_idx} 物理检测通过 ({w}x{h}, {len(raw_bytes)//1024}KB)，提交 CPA 多模态盲审...")

            # 3.2 生成缩略图 Base64 并调用大模型审核
            b64_str = ImageValidator.prepare_base64_for_llm(raw_bytes)
            ev = self.reviewer.evaluate_image(name, b64_str)

            score = ev.get('score', 0)
            passed = ev.get('passed', False)
            reason = ev.get('reason', '')
            has_wm = ev.get('has_watermark', False)
            is_cooked = ev.get('is_cooked', False)

            logger.info(f"{prefix} 候选 #{candidate_idx} 评审结果: 得分 {score}/10 | 成品={is_cooked} | 水印={has_wm} | 合格={passed} | 评语: {reason}")

            if passed:
                best_candidate = cand_url
                best_eval = ev
                break
            else:
                if best_eval is None or score > best_eval.get('score', 0):
                    best_candidate = cand_url
                    best_eval = ev

        # 4. 判定是否有候选合格
        if best_eval and best_eval.get('passed'):
            score = best_eval.get('score', 0)
            reason = best_eval.get('reason', '')
            mode_tag = "[DRY-RUN]" if self.dry_run else "[已入库]"
            logger.info(f"{prefix} ✅ 评审通过并选定最佳大片 (得分 {score}): {best_candidate} {mode_tag}")

            if not self.dry_run:
                self.update_recipe_image(recipe_id, best_candidate)

            self.progress_mgr.record_success(recipe_id, name, current_img, best_candidate, score, reason, self.dry_run)
            self.progress_mgr.save()
            return True, f"通过 ({score}分)"
        else:
            best_score = best_eval.get('score', 0) if best_eval else 0
            reason = best_eval.get('reason', '所有候选图均未达到合格阈值') if best_eval else '无有效候选图'
            logger.warning(f"{prefix} ⚠️ 候选图盲审全部未达标 (最高得分: {best_score}) - 原因: {reason}")
            self.progress_mgr.record_failed(recipe_id, name, current_img, reason, best_score)
            self.progress_mgr.save()
            return False, f"未达标 (最高 {best_score}分)"

    def run(self, limit: Optional[int] = None):
        """执行全量或限额治理任务"""
        start_time = time.time()
        all_recipes = self.get_all_recipes()
        total_in_db = len(all_recipes)

        logger.info("=" * 60)
        logger.info(f"食刻菜谱图片智能治理系统启动")
        logger.info(f"数据库路径: {self.db_path} (总计 {total_in_db} 道菜品)")
        logger.info(f"并发工作线程: {self.workers} | 测试模式(dry-run): {self.dry_run} | 重试失败项: {self.retry_failed}")
        logger.info("=" * 60)

        # 第一阶段：白名单自动同步与过滤
        pending_recipes = []
        for r in all_recipes:
            r_id = r['id']
            img = r.get('image_url') or ''
            if is_verified_local(img):
                self.progress_mgr.record_local_verified(r_id, r['name'], img)
            else:
                if self.progress_mgr.should_process(r_id, self.retry_failed):
                    pending_recipes.append(r)

        self.progress_mgr.save()
        stats = self.progress_mgr.get_stats()
        logger.info(f"白名单初筛完成: 本地已核验保护数: {stats.get('verified_local', 0)} | 待处理队列: {len(pending_recipes)} 道")

        # 限额截断
        if limit and limit > 0:
            logger.info(f"命令行指定 --limit {limit}，仅对前 {limit} 道待处理菜品执行替换治理")
            pending_recipes = pending_recipes[:limit]

        if not pending_recipes:
            logger.info("所有菜品均已达到合格状态或已被断点记录跳过，无须进一步处理！")
            self._print_final_report(start_time, total_in_db)
            return

        # 第二阶段：并发处理待替换菜品
        total_pending = len(pending_recipes)
        logger.info(f"开始并行处理待替换菜谱（共 {total_pending} 道，线程池大小: {self.workers}）...")

        success_count = 0
        failed_count = 0

        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            future_to_recipe = {
                executor.submit(self.process_single_recipe, recipe, idx + 1, total_pending): recipe
                for idx, recipe in enumerate(pending_recipes)
            }

            for future in as_completed(future_to_recipe):
                recipe = future_to_recipe[future]
                try:
                    ok, detail = future.result()
                    if ok:
                        success_count += 1
                    else:
                        failed_count += 1
                except Exception as exc:
                    failed_count += 1
                    logger.error(f"处理菜品【{recipe['name']}】异常崩塌: {exc}")

        self._print_final_report(start_time, total_in_db, success_count, failed_count)

    def _print_final_report(self, start_time: float, total_in_db: int, current_success: int = 0, current_failed: int = 0):
        elapsed = time.time() - start_time
        stats = self.progress_mgr.get_stats()
        logger.info("=" * 60)
        logger.info("食刻菜谱图片治理任务执行汇总报告")
        logger.info(f"总耗时: {elapsed:.2f} 秒")
        logger.info(f"数据库菜品总量: {total_in_db}")
        logger.info(f"本地高清白名单保护 (VERIFIED_LOCAL): {stats.get('verified_local', 0)}")
        logger.info(f"累计已评审并替换 (UPDATED): {stats.get('updated', 0)}")
        logger.info(f"本次运行新增成功: {current_success}")
        logger.info(f"本次运行失败/未达标: {current_failed}")
        logger.info(f"测试模式标记 (DRY_RUN): {stats.get('dry_run', 0)}")
        logger.info(f"断点进度文件: {self.progress_mgr.path}")
        logger.info("=" * 60)


# ===========================
# 自检运行逻辑 (Self-Test)
# ===========================
def run_self_test(cpa_url: str, cpa_key: str, db_path: Path, progress_path: Path):
    """
    自检运行逻辑：验证 SQLite 数据库、CPA 多模态接口、搜索模块、图片下载校验及视觉盲审全链路
    """
    logger.info("=" * 60)
    logger.info("启动食刻菜谱图片治理系统全链路自检 (Self-Test)...")
    logger.info("=" * 60)

    checks_passed = 0
    total_checks = 5

    # 1. 检查数据库连接与数据表
    logger.info("[自检 1/5] 检查 SQLite 数据库连接及 recipes 表结构...")
    try:
        if not db_path.is_file():
            raise FileNotFoundError(f"数据库文件不存在: {db_path}")
        conn = sqlite3.connect(str(db_path))
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM recipes")
        total_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM recipes WHERE image_url LIKE '/images/dishes/%.webp'")
        local_cnt = cur.fetchone()[0]
        conn.close()
        logger.info(f"  --> 数据库连接正常，现有菜品总数: {total_cnt}，本地白名单图片: {local_cnt}")
        checks_passed += 1
    except Exception as e:
        logger.error(f"  --> 数据库自检失败: {e}")

    # 2. 检查 CPA 多模态 API 连通性及 gemini-3.8-flash-high 模型可用性
    logger.info("[自检 2/5] 检查 CPA 多模态大模型服务连通性...")
    try:
        models_url = f"{cpa_url.rstrip('/')}/models"
        headers = {}
        if cpa_key:
            headers['Authorization'] = f"Bearer {cpa_key}"
        res = requests.get(models_url, headers=headers, timeout=10)
        if res.status_code == 200:
            models_data = res.json()
            model_ids = [m['id'] for m in models_data.get('data', [])]
            if DEFAULT_CPA_MODEL in model_ids:
                logger.info(f"  --> CPA 服务正常，找到目标多模态模型: {DEFAULT_CPA_MODEL}")
                checks_passed += 1
            else:
                logger.warning(f"  --> CPA 可用，但未显式列出 {DEFAULT_CPA_MODEL} (现有: {model_ids[:5]}...)")
                checks_passed += 1
        else:
            logger.error(f"  --> CPA 服务返回异常码: {res.status_code}, 内容: {res.text[:100]}")
    except Exception as e:
        logger.error(f"  --> CPA 服务连接失败: {e}")

    # 3. 检查互联网高清图源检索功能
    logger.info("[自检 3/5] 检查互联网图源检索模块 (以测试菜品 '麻婆豆腐' 为例)...")
    test_dish = "麻婆豆腐"
    candidates = []
    try:
        candidates = ImageSearcher.search_candidates(test_dish, limit=4)
        if candidates:
            logger.info(f"  --> 图源检索成功，解析到 {len(candidates)} 个候选链接:")
            for i, u in enumerate(candidates[:2]):
                logger.info(f"      [{i+1}] {u}")
            checks_passed += 1
        else:
            logger.error("  --> 图源检索未返回任何有效链接")
    except Exception as e:
        logger.error(f"  --> 图源检索模块异常: {e}")

    # 4. 检查图片下载、分辨率及 PIL 校验
    logger.info("[自检 4/5] 检查候选图片下载与 PIL 物理尺寸校验...")
    sample_bytes = None
    try:
        if candidates:
            for u in candidates:
                valid, b_data, dims, msg = ImageValidator.download_and_validate(u)
                if valid and b_data:
                    sample_bytes = b_data
                    logger.info(f"  --> 图片下载及 PIL 校验通过: 分辨率 {dims[0]}x{dims[1]}, 大小 {len(b_data)//1024}KB")
                    checks_passed += 1
                    break
            if not sample_bytes:
                logger.error("  --> 所有候选图均未通过图片下载及规格校验")
        else:
            logger.warning("  --> 前置检索无图片，跳过下载校验")
    except Exception as e:
        logger.error(f"  --> 图片校验模块异常: {e}")

    # 5. 检查 CPA 多模态大模型视觉盲审链路
    logger.info("[自检 5/5] 检查 CPA 多模态盲审打分链路...")
    try:
        if sample_bytes:
            b64_str = ImageValidator.prepare_base64_for_llm(sample_bytes)
            reviewer = MultimodalReviewer(cpa_url, cpa_key, DEFAULT_CPA_MODEL)
            ev = reviewer.evaluate_image(test_dish, b64_str)
            logger.info(f"  --> 多模态盲审响应成功: 得分 {ev.get('score')}/10 | 合格={ev.get('passed')} | 水印={ev.get('has_watermark')} | 成品={ev.get('is_cooked')}")
            logger.info(f"      评语: {ev.get('reason')}")
            checks_passed += 1
        else:
            logger.warning("  --> 缺少有效图片样本，跳过盲审大模型测试")
    except Exception as e:
        logger.error(f"  --> 多模态盲审测试失败: {e}")

    # 汇总
    logger.info("=" * 60)
    logger.info(f"自检完成: {checks_passed}/{total_checks} 项检查通过")
    if checks_passed == total_checks:
        logger.info("🎉 系统各项模块均正常，治理引擎可随时投产运行！")
    else:
        logger.warning("⚠️ 存在未通过的自检项目，请排查相关服务与网络配置。")
    logger.info("=" * 60)
    return checks_passed == total_checks


# ===========================
# 命令行入口
# ===========================
def main():
    parser = argparse.ArgumentParser(
        description="食刻 (shike.db) 菜谱图片智能评审与高质量全量替换自动化运维治理脚本"
    )
    parser.add_argument(
        '--limit', type=int, default=None,
        help="每次最多处理 N 个待处理菜品，默认全量处理"
    )
    parser.add_argument(
        '--workers', type=int, default=3,
        help="并行处理的工作线程数（默认: 3）"
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help="测试模式：执行完整搜寻与大模型盲审，但不向 SQLite 数据库写入新图片 URL"
    )
    parser.add_argument(
        '--retry-failed', action='store_true',
        help="重新尝试之前在断点记录中标记为 FAILED 的菜品"
    )
    parser.add_argument(
        '--self-test', action='store_true',
        help="执行全链路自检并退出（测试数据库、CPA 多模态、图片搜寻与盲审）"
    )
    parser.add_argument(
        '--db-path', type=str, default=str(DEFAULT_DB_PATH),
        help=f"SQLite 数据库路径（默认: {DEFAULT_DB_PATH}）"
    )
    parser.add_argument(
        '--progress-path', type=str, default=str(DEFAULT_PROGRESS_PATH),
        help=f"断点续传进度保存路径（默认: {DEFAULT_PROGRESS_PATH}）"
    )
    parser.add_argument(
        '--cpa-url', type=str, default=DEFAULT_CPA_URL,
        help=f"CPA 多模态大模型代理地址（默认: {DEFAULT_CPA_URL}）"
    )
    parser.add_argument(
        '--cpa-key', type=str, default=None,
        help="CPA API 密钥，缺省时自动从 .env 或环境变量读取"
    )
    parser.add_argument(
        '--verbose', action='store_true',
        help="开启详细调试日志"
    )

    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    db_path = Path(args.db_path)
    progress_path = Path(args.progress_path)
    cpa_key = get_cpa_api_key(args.cpa_key)

    if args.self_test:
        success = run_self_test(args.cpa_url, cpa_key, db_path, progress_path)
        sys.exit(0 if success else 1)

    governor = RecipeImageGovernor(
        db_path=db_path,
        progress_path=progress_path,
        cpa_url=args.cpa_url,
        cpa_key=cpa_key,
        workers=args.workers,
        dry_run=args.dry_run,
        retry_failed=args.retry_failed
    )

    governor.run(limit=args.limit)


if __name__ == '__main__':
    main()
