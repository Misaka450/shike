#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
re_review_early_batch.py
针对第一批（前期的 48 条）菜品，按当前最高质检标准执行全面再检索与多模态甄选：
1. 引入小红书精选美食摄影与多角度检索（小红书/美食摄影/精选菜谱）
2. 扩充候选池至 25+ 并发过滤商业带编号硬水印
3. CPA 视觉盲审打分：若获得更高分（如 8-9 分精装成品大片）则升级替换
"""

import sys
import os
import json
import logging
import sqlite3
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

from review_and_replace_recipe_images import (
    ImageSearcher, ImageValidator, MultimodalReviewer,
    get_cpa_api_key, clean_dish_name_for_search,
    DEFAULT_DB_PATH, DEFAULT_PROGRESS_PATH
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("re_review_early")

TARGET_RECIPE_IDS = [
    "recipe-banana-toast",
    "ai-recipe-1790094403208-1",
    "recipe-bean-pork-belly",
    "recipe-banana-pancake",
    "recipe-braised-prawns",
    "recipe-cantonese-cured-meat-rice",
    "recipe-chicken-breast-salad",
    "ai-recipe-1790094403208-3",
    "recipe-cucumber-salad",
    "recipe-cumin-onion-chicken",
    "recipe-fried-green-beans",
    "recipe-crispy-home-style-tofu",
    "recipe-garlic-chicken-wings",
    "recipe-garlic-steamed-eggplant",
    "recipe-htc-002791b8aa",
    "recipe-golden-egg-fried-rice",
    "recipe-garlic-water-spinach",
    "recipe-htc-05478ea127",
    "recipe-htc-0225d2a009",
    "recipe-htc-016402ac3a",
    "recipe-htc-0856952afa",
    "recipe-htc-052f59b0c4",
    "recipe-htc-0f91931d69",
    "recipe-htc-104c1ded1e",
    "recipe-htc-0ce1e1de2b",
    "recipe-htc-10d3876f6d",
    "recipe-htc-17f3626e1e",
    "recipe-htc-17c144ace1",
    "recipe-htc-1945f8c72f",
    "recipe-htc-19d112d9c5",
    "recipe-htc-1c92009b96",
    "recipe-htc-1a0ea20dad",
    "recipe-htc-1deba890df",
    "recipe-htc-1223b89e8c",
    "recipe-htc-1e999830af",
    "recipe-htc-21169af395",
    "recipe-htc-20b02c3ad9",
    "recipe-htc-23975ee62d",
    "recipe-htc-24db9ed023",
    "recipe-htc-26cbb39f29",
    "recipe-htc-28d880578c",
    "recipe-htc-2d6cfb5481",
    "recipe-htc-2ad6b00df4",
    "recipe-htc-2f6425366d",
    "recipe-htc-3117052102",
    "recipe-htc-2cc1671ca7",
    "recipe-htc-32d55a687c",
    "recipe-htc-2e8f8f59aa"
]

def process_dish(recipe_info, reviewer, current_rec):
    r_id = recipe_info["id"]
    dish_name = recipe_info["name"]
    clean_name = clean_dish_name_for_search(dish_name)
    curr_score = current_rec.get("score", 7) if current_rec else 7
    curr_url = current_rec.get("image_url", "") if current_rec else ""

    logger.info(f"[{r_id}] 开始复审【{dish_name}】 (当前得分: {curr_score})")

    candidates = []
    seen = {curr_url}

    def add_urls(urls):
        for u in urls:
            if u and u.startswith("http") and u not in seen:
                if not any(b in u.lower() for b in ["chuimg.com", "xiachufang.com", "nipic.com", "58pic.com", "huitu.com", "699pic.com"]):
                    seen.add(u)
                    candidates.append(u)

    # 1. 小红书精选美食摄影图源
    add_urls(ImageSearcher.search_360(f"{clean_name} 小红书", max_results=6))
    add_urls(ImageSearcher.search_bing(f"{clean_name} 小红书", max_results=6))

    # 2. 纯菜品名与高清美食摄影
    add_urls(ImageSearcher.search_360(f"{clean_name} 美食摄影", max_results=6))
    add_urls(ImageSearcher.search_bing(f"{clean_name} 美食摄影", max_results=6))
    add_urls(ImageSearcher.search_360(clean_name, max_results=6))
    add_urls(ImageSearcher.search_bing(clean_name, max_results=6))

    best_candidate = None
    best_score = curr_score
    best_eval = None

    for cand_url in candidates[:18]:
        valid, raw_bytes, dims, val_msg = ImageValidator.download_and_validate(cand_url)
        if not valid or raw_bytes is None:
            continue

        b64_str = ImageValidator.prepare_base64_for_llm(raw_bytes)
        ev = reviewer.evaluate_image(clean_name, b64_str)
        score = ev.get("score", 0)
        passed = ev.get("passed", False)
        reason = ev.get("reason", "")

        if passed and score > best_score:
            best_candidate = cand_url
            best_score = score
            best_eval = ev
            logger.info(f"  ✨ [{dish_name}] 发现更优质大片 (得分 {score}/10 > {curr_score}): {reason[:40]}")
            if score >= 9:
                break

    if best_candidate and best_score > curr_score:
        return {
            "status": "UPGRADED",
            "id": r_id,
            "name": dish_name,
            "old_url": curr_url,
            "new_url": best_candidate,
            "old_score": curr_score,
            "new_score": best_score,
            "reason": best_eval.get("reason", "") if best_eval else ""
        }
    else:
        return {
            "status": "KEPT",
            "id": r_id,
            "name": dish_name,
            "curr_url": curr_url,
            "score": curr_score
        }

def main():
    api_key = get_cpa_api_key()
    reviewer = MultimodalReviewer(api_key=api_key)

    conn = sqlite3.connect(str(DEFAULT_DB_PATH))
    cur = conn.cursor()

    progress_data = {"version": "1.0", "summary": {}, "records": {}}
    if DEFAULT_PROGRESS_PATH.is_file():
        with open(DEFAULT_PROGRESS_PATH, "r", encoding="utf-8") as f:
            progress_data = json.load(f)
    records = progress_data.get("records", {})

    # 提取目标 48 道菜品详情
    cur.execute("SELECT id, name, image_url FROM recipes WHERE id IN ({})".format(
        ",".join(f"'{i}'" for i in TARGET_RECIPE_IDS)
    ))
    db_map = {row[0]: {"id": row[0], "name": row[1], "image_url": row[2]} for row in cur.fetchall()}

    logger.info("=" * 60)
    logger.info(f"启动前批次 {len(TARGET_RECIPE_IDS)} 道菜品高标准二次精选升级")
    logger.info("=" * 60)

    upgraded_count = 0
    kept_count = 0

    with ThreadPoolExecutor(max_workers=5) as executor:
        future_map = {}
        for r_id in TARGET_RECIPE_IDS:
            if r_id in db_map:
                f = executor.submit(process_dish, db_map[r_id], reviewer, records.get(r_id, {}))
                future_map[f] = r_id

        for future in as_completed(future_map):
            res = future.result()
            r_id = res["id"]
            dish_name = res["name"]

            if res["status"] == "UPGRADED":
                upgraded_count += 1
                new_url = res["new_url"]
                new_score = res["new_score"]
                cur.execute("UPDATE recipes SET image_url = ? WHERE id = ?", (new_url, r_id))
                conn.commit()

                if r_id in records:
                    records[r_id]["image_url"] = new_url
                    records[r_id]["score"] = new_score
                    records[r_id]["reason"] = res["reason"]
                logger.info(f"  🏆 【{dish_name}】升级成功: {res['old_score']}分 -> {new_score}分")
            else:
                kept_count += 1
                logger.info(f"  👌 【{dish_name}】保持原高质图 (得分: {res['score']})")

    conn.close()

    # 更新进度汇总
    progress_data["records"] = records
    with open(DEFAULT_PROGRESS_PATH, "w", encoding="utf-8") as f:
        json.dump(progress_data, f, ensure_ascii=False, indent=2)

    logger.info("=" * 60)
    logger.info(f"前批次精选升级完成！升级大片: {upgraded_count} 道 | 保持原优质大片: {kept_count} 道")
    logger.info("=" * 60)

if __name__ == "__main__":
    main()
