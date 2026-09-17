#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
导入 HowToCook 优质中餐菜谱到食刻数据库 (shike.db)
"""

import os
import re
import sys
import json
import hashlib
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

# 数据库路径与源数据目录
DB_PATH = Path('/opt/shike-ai/data/db/shike.db')
DISHES_DIR = Path('/tmp/HowToCook/dishes')

# 分类映射规则
CATEGORY_MAP = {
    'vegetable_dish': '素菜',
    'meat_dish': '荤菜',
    'aquatic': '水产海鲜',
    'soup': '汤羹',
    'staple': '主食',
    'breakfast': '早餐轻食',
    'semi-finished': '快手菜',
    'dessert': '甜品点心'
}

# 调味品/佐料关键词（用于标记 required=false）
SEASONING_KEYWORDS = [
    '盐', '食盐', '细盐', '粗盐', '糖', '白糖', '白砂糖', '冰糖', '红糖', '绵白糖',
    '生抽', '老抽', '酱油', '生抽酱油', '老抽酱油', '味极鲜', '料酒', '黄酒', '白酒', '啤酒',
    '油', '食用油', '植物油', '花生油', '菜籽油', '玉米油', '大豆油', '芝麻油', '香油', '橄榄油', '猪油',
    '蚝油', '耗油', '醋', '香醋', '陈醋', '白醋', '米醋', '乌醋',
    '胡椒', '黑胡椒', '白胡椒', '胡椒粉', '胡椒粒', '花椒', '花椒粉', '花椒粒', '麻椒', '藤椒',
    '鸡精', '味精', '鲜精', '蔬之鲜',
    '淀粉', '生粉', '玉米淀粉', '土豆淀粉', '红薯淀粉', '水淀粉', '小苏打', '泡打粉', '酵母',
    '葱', '大葱', '小葱', '青葱', '葱花', '葱段', '姜', '生姜', '老姜', '姜片', '姜末',
    '蒜', '大蒜', '蒜瓣', '蒜泥', '蒜末',
    '辣椒粉', '辣椒面', '干辣椒', '辣椒干', '干红辣椒', '二荆条', '小米椒', '小米辣',
    '八角', '大料', '桂皮', '肉桂', '香叶', '丁香', '小茴香', '茴香', '草果', '山奈', '豆蔻', '砂仁', '陈皮',
    '五香粉', '十三香', '孜然', '孜然粉', '咖喱', '咖喱粉', '咖喱块',
    '豆瓣酱', '郫县豆瓣', '甜面酱', '黄豆酱', '番茄酱', '沙茶酱', '芝麻酱', '排骨酱', '叉烧酱',
    '水', '清水', '饮用水', '开水', '温水', '凉水', '纯净水', '冰水', '高汤'
]

# 烹饪工具过滤词（避免把厨房工具误当做食材）
TOOL_EXACT = {
    '锅', '微波炉', '烤箱', '空气炸锅', '电饭煲', '高压锅', '蒸锅', '平底锅', '炒锅',
    '砂锅', '汤锅', '破壁机', '榨汁机', '打蛋器', '滤网', '漏勺', '夹子', '保鲜膜',
    '厨房纸', '锡纸', '烘焙纸', '油纸', '量杯', '量勺', '电子秤', '厨房秤', '冰箱',
    '保鲜袋', '保鲜盒', '电磁炉', '燃气灶', '蒸架', '蒸笼', '刮刀', '裱花嘴', '裱花袋',
    '砧板', '菜板', '削皮刀', '小刀', '菜刀', '剪刀', '筷子', '勺子', '锅铲', '盘子',
    '碟子', '大碗', '小碗', '玻璃碗'
}

FOOD_PROTECT = [
    '肉', '菜', '面', '蛋', '饭', '菇', '糖', '油', '酱', '粉', '丸', '排骨', '豆', '奶',
    '芝士', '果', '葱', '蒜', '姜', '虾', '鱼', '鸡', '鸭', '牛', '羊', '猪', '肠', '汤',
    '笋', '瓜', '椒', '醋', '盐', '米饭', '大米', '小米', '糯米', '黑米', '玉米', '西红柿', '番茄'
]

# 高质量美食图库（根据分类轮询/哈希分配）
CATEGORY_IMAGES = {
    '素菜': [
        'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500',
        'https://images.unsplash.com/photo-1584270357187-e231122a6aa5?w=500',
        'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=500',
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
        'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500',
    ],
    '荤菜': [
        'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=500',
        'https://images.unsplash.com/photo-1527477321055-436158a2b00d?w=500',
        'https://images.unsplash.com/photo-1544025162-d76694265947?w=500',
        'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=500',
        'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500',
    ],
    '水产海鲜': [
        'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500',
        'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=500',
        'https://images.unsplash.com/photo-1559847844-5315695dadae?w=500',
        'https://images.unsplash.com/photo-1534939561126-855b8675edd7?w=500',
        'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=500',
    ],
    '汤羹': [
        'https://images.unsplash.com/photo-1547592180-85f173990554?w=500',
        'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=500',
        'https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?w=500',
        'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500',
    ],
    '主食': [
        'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=500',
        'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=500',
        'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=500',
        'https://images.unsplash.com/photo-1552611052-33e04de081de?w=500',
    ],
    '早餐轻食': [
        'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=500',
        'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500',
        'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=500',
        'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=500',
    ],
    '快手菜': [
        'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=500',
        'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500',
        'https://images.unsplash.com/photo-1527477321055-436158a2b00d?w=500',
    ],
    '甜品点心': [
        'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=500',
        'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500',
        'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500',
        'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=500',
    ]
}


def is_tool_item(name: str) -> bool:
    """判断是否为烹饪工具而非食材"""
    name_clean = name.strip()
    if name_clean in TOOL_EXACT:
        return True
    tool_keywords = [
        '微波炉', '烤箱', '空气炸锅', '电饭煲', '高压锅', '蒸锅', '平底锅', '炒锅',
        '砂锅', '破壁机', '榨汁机', '打蛋器', '滤网', '保鲜膜', '厨房纸', '锡纸',
        '烘焙纸', '油纸', '量杯', '量勺', '电子秤', '厨房秤', '保鲜袋', '保鲜盒',
        '砧板', '菜板', '削皮刀', '菜刀', '剪刀', '锅铲'
    ]
    for tw in tool_keywords:
        if tw in name_clean:
            return True
    if any(name_clean.endswith(sfx) for sfx in ['小碗', '大碗', '玻璃碗', '圆盘', '盘子', '碟子', '蒸架', '蒸笼', '刮皮刀']):
        if not any(fp in name_clean for fp in FOOD_PROTECT):
            return True
    return False


def clean_name_str(name: str) -> str:
    """清理食材名"""
    name = re.sub(r'^[*-]\s*', '', name).strip()
    name = re.sub(r'^(必须配料|进阶配料|可选配料|原料|材料|主料|辅料|调料|配料|方法[一二三四1234]：)\s*', '', name).strip()
    name = name.strip('*#_ ')
    name = re.sub(r'^\d+[.、]\s*', '', name)
    return name


def parse_ingredient_line(line: str):
    """解析单行食材与用量"""
    line = line.strip()
    if not line:
        return None

    # Markdown 表格行解析
    if line.startswith('|') and line.endswith('|'):
        parts = [p.strip() for p in line.split('|')[1:-1]]
        if len(parts) >= 2:
            n = clean_name_str(parts[0])
            if n and n not in ['原料', '材料', '食材', '---', ':---', ':---:'] and not n.startswith(':'):
                amt = parts[1]
                if len(parts) >= 3 and parts[2] and parts[2] not in ['单位', '---']:
                    amt = amt + parts[2]
                return n, amt
        return None

    if not line.startswith(('-', '*', '+')) or line.startswith(('---', '***')):
        return None

    raw = re.sub(r'^[-*+]\s*', '', line).strip()
    if not raw:
        return None

    # 排除纯说明行
    if raw.endswith('：') or raw.endswith(':') or raw in ['必须配料', '进阶配料', '可选配料', '原料', '主料', '辅料', '调料']:
        return None

    # 情况 1: '生抽 75g = 15g * 5'
    m_calc_eq = re.search(r'^([^\d\s=:：]+.*?)\s+([约大约共需\d½¼⅛\.~至\-]+[a-zA-Z\u4e00-\u9fa5]*)\s*=', raw)
    if m_calc_eq:
        name = clean_name_str(m_calc_eq.group(1))
        amt = m_calc_eq.group(2).strip()
        if name and not is_tool_item(name):
            return name, amt

    # 情况 2: 'name = amount' 或 'name : amount'
    m_sep = re.split(r'\s*[:=：]\s*', raw, maxsplit=1)
    if len(m_sep) == 2 and m_sep[0] and m_sep[1]:
        name = clean_name_str(m_sep[0])
        amt = m_sep[1].strip()
        if name and not is_tool_item(name):
            return name, amt

    # 情况 3: 空格分隔 '土豆 2 个' / '生粉 80 g'
    m_qty = re.search(r'^([^\d\s=:：]+.*?)\s+([约大约共需\d½¼⅛\.~至\-]+.*)$', raw)
    if m_qty:
        name = clean_name_str(m_qty.group(1))
        amt = m_qty.group(2).strip()
        if name and not is_tool_item(name):
            return name, amt

    # 情况 4: '青菜共需 455 克'
    m_gong = re.search(r'^(.+?)(共需|约|大约)\s*(\d+.*)$', raw)
    if m_gong:
        name = clean_name_str(m_gong.group(1))
        amt = (m_gong.group(2) + m_gong.group(3)).strip()
        if name and not is_tool_item(name):
            return name, amt

    # 情况 5: 仅有食材名，默认适量
    name = clean_name_str(raw)
    if name and not is_tool_item(name) and len(name) < 30:
        return name, '适量'

    return None


def extract_title(content: str, fallback: str) -> str:
    """提取菜名"""
    m = re.search(r'^#\s+(.+)$', content, re.M)
    if m:
        raw = m.group(1).strip()
        clean = re.sub(r'的?(做法|制作指南|制作方法|简易指南|烹饪指南|家常做法)$', '', raw).strip()
        if clean:
            return clean
    return fallback


def extract_difficulty(content: str) -> str:
    """提取难度：★ 简单，★★ 中等，★★★+ 困难"""
    m = re.search(r'预估烹饪难度[：:]\s*(.+)', content)
    stars_str = ''
    if m:
        stars_str = m.group(1)
    else:
        stars = re.findall(r'★+', content)
        if stars:
            stars_str = stars[0]

    star_count = stars_str.count('★')
    if star_count == 1:
        return '简单'
    elif star_count == 2:
        return '中等'
    elif star_count >= 3:
        return '困难'
    return '简单'


CN_NUM_MAP = {
    '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '十五': 15, '二十': 20, '三十': 30, '四十': 40, '五十': 50
}


def extract_times(content: str):
    """提取烹饪用时 (prep_time, cook_time)"""
    total_min = None

    # 小时与分钟组合
    kw_match = re.search(r'(?:耗时|需要|用时|历时|约|需|全程)[^。\n]{0,20}?(\d+(?:\.\d+)?)\s*小时(?:\s*(\d+)\s*分钟)?', content)
    if kw_match:
        h = float(kw_match.group(1))
        m = float(kw_match.group(2)) if kw_match.group(2) else 0
        total_min = int(h * 60 + m)

    if total_min is None and re.search(r'(?:耗时|需要|用时|历时|约|需|全程)[^。\n]{0,20}?半\s*小时', content):
        total_min = 30

    if total_min is None:
        kw_match = re.search(r'(?:耗时|需要|用时|历时|约|需|全程)[^。\n]{0,20}?(\d+)\s*分钟', content)
        if kw_match:
            total_min = int(kw_match.group(1))

    if total_min is None:
        for k, v in sorted(CN_NUM_MAP.items(), key=lambda x: -len(x[0])):
            if re.search(rf'(?:耗时|需要|用时|历时|约|需|全程)[^。\n]{{0,20}}?{k}\s*分钟', content):
                total_min = v
                break

    if total_min is None or total_min <= 0:
        return 10, 15

    # 合理拆分备菜时间与烹饪时间
    if total_min <= 10:
        prep_time = 5
        cook_time = max(5, total_min - 5)
    elif total_min <= 20:
        prep_time = 5
        cook_time = total_min - 5
    elif total_min <= 40:
        prep_time = 10
        cook_time = total_min - 10
    elif total_min <= 60:
        prep_time = 15
        cook_time = total_min - 15
    else:
        prep_time = 20
        cook_time = total_min - 20

    return prep_time, cook_time


def extract_servings(content: str) -> int:
    """提取份数"""
    m = re.search(r'(\d+)\s*(?:个)?人(?:份|食|吃|用)?', content)
    if m:
        try:
            val = int(m.group(1))
            if 1 <= val <= 10:
                return val
        except ValueError:
            pass
    return 2


def extract_ingredients(content: str, dish_name: str):
    """提取食材列表并标注 required 属性"""
    m_calc = re.search(r'##\s*计算(.*?)(?=\n##\s+[^\#]|\Z)', content, re.S)
    m_prep = re.search(r'##\s*必备原料和工具(.*?)(?=\n##\s+[^\#]|\Z)', content, re.S)

    ings_dict = {}

    # 1. 优先解析计算部分（数量最精确）
    if m_calc:
        for line in m_calc.group(1).splitlines():
            parsed = parse_ingredient_line(line)
            if parsed:
                n, a = parsed
                if n not in ings_dict:
                    ings_dict[n] = a

    # 2. 补充必备原料部分
    if m_prep:
        in_tool_sub = False
        for line in m_prep.group(1).splitlines():
            if re.match(r'###\s*.*工具', line):
                in_tool_sub = True
                continue
            if re.match(r'###\s*.*(原料|配料|食材|主料|辅料)', line):
                in_tool_sub = False
                continue
            if in_tool_sub:
                continue
            parsed = parse_ingredient_line(line)
            if parsed:
                n, a = parsed
                if n not in ings_dict:
                    ings_dict[n] = a
                elif ings_dict[n] == '适量' and a != '适量':
                    ings_dict[n] = a

    # 兜底：如果食材为空，尝试提取菜名本身
    if not ings_dict:
        ings_dict[dish_name] = '适量'

    ingredients = []
    for name, amt in ings_dict.items():
        # 判断 required 标志
        # 如果食材名包含在菜品标题中（例如西红柿炒鸡蛋中的鸡蛋、西红柿），属于核心主料
        in_dish_title = any(token in dish_name for token in [name, name[:2]])
        is_seasoning = any(sk in name for sk in SEASONING_KEYWORDS)
        
        required = True
        if is_seasoning and not in_dish_title:
            required = False

        ingredients.append({
            'name': name,
            'amount': amt,
            'required': required
        })

    return ingredients


def extract_instructions(content: str):
    """从「## 操作」中提取操作步骤"""
    m_ops = re.search(r'##\s*操作(.*?)(?=\n##\s+[^\#]|\Z)', content, re.S)
    if not m_ops:
        return ["按照常规家常烹饪步骤制作即可。"]

    ops_text = m_ops.group(1).strip()
    steps = []

    # 数字有序列表
    for line in ops_text.splitlines():
        line = line.strip()
        m_num = re.match(r'^\d+[.、\)]\s*(.+)$', line)
        if m_num:
            s = re.sub(r'!\[.*?\]\(.*?\)', '', m_num.group(1)).strip()
            if s:
                steps.append(s)

    # 兜底无序号列表或段落
    if not steps:
        for line in ops_text.splitlines():
            line = line.strip()
            if line.startswith(('-', '*')) and not line.startswith(('---', '***')):
                s = re.sub(r'!\[.*?\]\(.*?\)', '', re.sub(r'^[-*]\s*', '', line)).strip()
                if s:
                    steps.append(s)

    if not steps:
        steps = ["按照常规家常烹饪步骤制作即可。"]

    return steps


def extract_tips(content: str) -> str:
    """提取小贴士与技巧"""
    m = re.search(r'##\s*(?:附加内容|技巧|小贴士|贴士|注意事项)(.*?)(?=\n##\s+[^\#]|\Z)', content, re.S)
    if not m:
        return ''

    raw = m.group(1).strip()
    raw = re.sub(r'```[\s\S]*?```', '', raw)
    raw = re.sub(r'<[^>]+>', '', raw)
    raw = re.sub(r'!\[.*?\]\(.*?\)', '', raw)
    raw = re.sub(r'如果您遵循本指南.*?(?:Issue|Pull request|PR).*?[。\.]?', '', raw, flags=re.S)
    raw = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', raw)

    lines = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        line = re.sub(r'^[-*+]\s*', '', line)
        line = re.sub(r'^\d+[.、\)]\s*', '', line)
        if any(skip_kw in line for skip_kw in ['Issue', 'Pull request', 'GitHub', '参考资料', '做法步骤_下厨房']):
            continue
        if line:
            lines.append(line)

    return '；'.join(lines)


def get_image_url(category: str, dish_name: str) -> str:
    """根据分类和菜名哈希分配高质量美食占位图"""
    img_list = CATEGORY_IMAGES.get(category, CATEGORY_IMAGES['素菜'])
    h = int(hashlib.md5(dish_name.encode('utf-8')).hexdigest(), 16)
    return img_list[h % len(img_list)]


def main():
    if not DB_PATH.exists():
        print(f"错误: 数据库文件未找到: {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    if not DISHES_DIR.exists():
        print(f"错误: HowToCook dishes 目录未找到: {DISHES_DIR}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 读取已存在的菜品名称（用于去重）
    cursor.execute("SELECT name FROM recipes")
    existing_names = set(row[0].strip() for row in cursor.fetchall())

    scanned_count = 0
    skipped_count = 0
    imported_count = 0

    now_iso = datetime.now(timezone.utc).isoformat()

    # 扫描分类目录
    for cat_dir_name, cat_display_name in CATEGORY_MAP.items():
        cat_path = DISHES_DIR / cat_dir_name
        if not cat_path.exists():
            continue

        for md_file in sorted(cat_path.rglob('*.md')):
            # 显式忽略 template 目录
            if 'template' in md_file.parts:
                continue

            scanned_count += 1
            content = md_file.read_text(encoding='utf-8')

            # 解析各项字段
            name = extract_title(content, md_file.stem)
            
            # 幂等性检查：若已存在同名菜谱则跳过
            if name in existing_names:
                skipped_count += 1
                continue

            recipe_id = f"recipe-htc-{hashlib.md5(name.encode('utf-8')).hexdigest()[:10]}"
            category = cat_display_name
            cuisine = '中餐'
            difficulty = extract_difficulty(content)
            prep_time, cook_time = extract_times(content)
            servings = extract_servings(content)
            ingredients = extract_ingredients(content, name)
            instructions = extract_instructions(content)
            tips = extract_tips(content)
            image_url = get_image_url(category, name)

            # 插入数据库
            cursor.execute(
                """
                INSERT INTO recipes (
                    id, name, category, cuisine, difficulty, prep_time, cook_time,
                    servings, ingredients, instructions, tips, image_url, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    recipe_id,
                    name,
                    category,
                    cuisine,
                    difficulty,
                    prep_time,
                    cook_time,
                    servings,
                    json.dumps(ingredients, ensure_ascii=False),
                    json.dumps(instructions, ensure_ascii=False),
                    tips,
                    image_url,
                    now_iso
                )
            )

            existing_names.add(name)
            imported_count += 1

    conn.commit()

    # 查询入库后最新总记录数
    cursor.execute("SELECT COUNT(*) FROM recipes")
    total_recipes = cursor.fetchone()[0]
    conn.close()

    print("=" * 45)
    print("HowToCook 优质中餐菜谱导入完成！")
    print(f"- 扫描到的 Markdown 文件数: {scanned_count}")
    print(f"- 成功解析并入库的菜谱数: {imported_count}")
    print(f"- 跳过已存在的菜谱数: {skipped_count}")
    print(f"- 入库后 recipes 表的最新总记录数: {total_recipes}")
    print("=" * 45)


if __name__ == '__main__':
    main()
