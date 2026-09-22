#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
resolve_14_imperfect_recipes.py
针对食刻菜谱中剩余 14 道疑难/跨文化/多义词菜品，利用精确品名、英文原名与美食摄影同义词进行靶向攻坚治理。
"""

import sys
import sqlite3
import json
import logging
from pathlib import Path
from review_and_replace_recipe_images import (
    ImageSearcher, ImageValidator, MultimodalReviewer,
    get_cpa_api_key, DEFAULT_DB_PATH, DEFAULT_PROGRESS_PATH
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("resolve_14")

TARGET_RECIPES = {
    'recipe-htc-833ae2c819': ('印度葫芦丸子', ['Lauki Kofta curry', 'Lauki Kofta recipe', '印度蔬菜丸子咖喱']),
    'recipe-htc-9ec2c26c02': ('利提巧卡', ['Litti Chokha recipe', 'Litti Chokha authentic dish', '利提巧卡']),
    'recipe-htc-b05ce0489c': ('印度土豆花菜', ['Aloo Gobi recipe authentic', 'Aloo Gobi dish', '印式咖喱土豆花菜']),
    'recipe-htc-59a19a6035': ('黄油鸡', ['Butter Chicken authentic curry', 'Murgh Makhani authentic', '印度黄油鸡咖喱']),
    'recipe-htc-db6a89ffe7': ('牛排', ['香煎西冷牛排 高清', '黑椒牛排 西餐成品', '安格斯牛排 摄影']),
    'recipe-htc-f4529a0193': ('蒜蓉炒芹菜', ['蒜蓉西芹 清炒', '蒜蓉芹菜', '清炒西芹']),
    'recipe-htc-f584ce40ec': ('蛏抱蛋', ['蛏子煎蛋', '海鲜蛏子煎蛋', '蛏子抱蛋 烘蛋']),
    'recipe-htc-535486e4c8': ('酱炖蟹', ['东北酱炖蟹', '家常酱炒螃蟹', '酱香海蟹']),
    'recipe-htc-0a96f985a2': ('鲤鱼炖白菜', ['白菜炖鲤鱼 家常', '鲤鱼炖白菜 粉条', '红烧鲤鱼炖白菜']),
    'recipe-black-pepper-king-oyster': ('黑椒手撕杏鲍菇', ['黑椒杏鲍菇', '黑椒手撕杏鲍菇', '酱汁黑椒杏鲍菇']),
    'recipe-htc-1223b89e8c': ('燕麦鸡蛋饼', ['蔬菜燕麦鸡蛋饼', '燕麦蛋饼 减脂', '燕麦鸡蛋软饼']),
    'recipe-htc-405df04baa': ('咖啡椰奶冻', ['双色咖啡椰奶冻', '咖啡椰汁糕', '椰汁咖啡果冻']),
    'recipe-htc-816afbd212': ('玛格丽特饼干', ['玛格丽特小饼干 曲奇', '法式玛格丽特饼干', '玛格丽特饼干 烘焙']),
    'recipe-salmon-salad': ('三文鱼轻食温沙拉', ['香煎三文鱼温沙拉', '三文鱼牛油果沙拉', '三文鱼轻食沙拉'])
}

def main():
    api_key = get_cpa_api_key()
    reviewer = MultimodalReviewer(api_key=api_key)
    db_path = DEFAULT_DB_PATH
    progress_path = DEFAULT_PROGRESS_PATH

    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()

    progress_data = {"version": "1.0", "summary": {}, "records": {}}
    if progress_path.is_file():
        try:
            with open(progress_path, 'r', encoding='utf-8') as f:
                progress_data = json.load(f)
        except Exception:
            pass

    records = progress_data.get('records', {})
    success_count = 0

    logger.info("=" * 60)
    logger.info("启动 14 道疑难菜品精准攻坚替换")
    logger.info("=" * 60)

    for r_id, (dish_name, queries) in TARGET_RECIPES.items():
        logger.info(f"\n>>> 正在攻坚处理: 【{dish_name}】({r_id})")
        
        candidates = []
        seen = set()
        for q in queries:
            c1 = ImageSearcher.search_bing(q, max_results=6)
            c2 = ImageSearcher.search_360(q, max_results=6)
            for u in c1 + c2:
                if u and u.startswith('http') and u not in seen:
                    if not any(b in u.lower() for b in ['chuimg.com', 'xiachufang.com', 'nipic.com', '58pic.com', 'huitu.com', '699pic.com']):
                        seen.add(u)
                        candidates.append(u)

        logger.info(f"  收集到 {len(candidates)} 个候选链接，开始多模态甄别...")
        
        approved_url = None
        best_eval = None

        for cand_url in candidates[:16]:
            valid, raw_bytes, dims, val_msg = ImageValidator.download_and_validate(cand_url)
            if not valid or raw_bytes is None:
                continue
            
            b64_str = ImageValidator.prepare_base64_for_llm(raw_bytes)
            ev = reviewer.evaluate_image(dish_name, b64_str)
            score = ev.get('score', 0)
            passed = ev.get('passed', False)
            reason = ev.get('reason', '')
            
            logger.info(f"    - 得分 {score}/10 | 合格={passed} | 水印={ev.get('has_watermark')} | 评语: {reason[:40]}")
            
            if passed:
                approved_url = cand_url
                best_eval = ev
                break
            else:
                if best_eval is None or score > best_eval.get('score', 0):
                    best_eval = ev

        if approved_url and best_eval is not None:
            score = best_eval.get('score', 8)
            reason = best_eval.get('reason', '审核通过')
            cur.execute("UPDATE recipes SET image_url = ? WHERE id = ?", (approved_url, r_id))
            conn.commit()
            
            records[r_id] = {
                "id": r_id,
                "name": dish_name,
                "status": "UPDATED",
                "image_url": approved_url,
                "score": score,
                "is_cooked": True,
                "has_watermark": False,
                "reason": reason
            }
            success_count += 1
            logger.info(f"  ✅ 【{dish_name}】替换成功 (得分: {score}) -> {approved_url[:80]}")
        else:
            logger.warning(f"  ⚠️ 【{dish_name}】本轮候选未达标 (最高得分: {best_eval.get('score') if best_eval else 0})")

    conn.close()

    # 更新进度文件汇总
    progress_data['records'] = records
    summary = {
        "total_recipes": len(records),
        "verified_local": sum(1 for r in records.values() if r.get('status') == 'VERIFIED_LOCAL'),
        "updated": sum(1 for r in records.values() if r.get('status') == 'UPDATED'),
        "failed": sum(1 for r in records.values() if r.get('status') == 'FAILED'),
        "dry_run": 0
    }
    progress_data['summary'] = summary
    with open(progress_path, 'w', encoding='utf-8') as f:
        json.dump(progress_data, f, ensure_ascii=False, indent=2)

    logger.info("=" * 60)
    logger.info(f"攻坚治理结束: 成功替换 {success_count}/{len(TARGET_RECIPES)} 道！")
    logger.info(f"全库累计更新: {summary['updated']} 道 | 本地白名单: {summary['verified_local']} 道 | 剩余: {summary['failed']} 道")
    logger.info("=" * 60)

if __name__ == '__main__':
    main()
