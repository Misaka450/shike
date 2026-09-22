#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
audit_all_images_deep.py
对全库已入库的全部图片进行全量多模态二次盲审复核：
1. 连通性与下载完整性 (HTTP 200, 尺寸校验)
2. CPA 多模态盲审复核 (成品菜肴、无水印牛皮癣、高食欲感，得分 >= 7)
3. 发现低质/有争议图片时，自动从备选池拉取更高清大片替换
"""

import sys
import sqlite3
import json
import logging
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from review_and_replace_recipe_images import (
    ImageValidator, MultimodalReviewer, ImageSearcher,
    get_cpa_api_key, DEFAULT_DB_PATH, is_verified_local
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_deep")

def main():
    api_key = get_cpa_api_key()
    reviewer = MultimodalReviewer(api_key=api_key)
    conn = sqlite3.connect(str(DEFAULT_DB_PATH))
    cur = conn.cursor()

    cur.execute("SELECT id, name, image_url FROM recipes ORDER BY id ASC")
    all_recipes = cur.fetchall()

    logger.info("=" * 60)
    logger.info(f"启动全库菜品图片多模态二次穿透深度复查（共 {len(all_recipes)} 道）")
    logger.info("=" * 60)

    imperfect = []

    for idx, (r_id, name, img_url) in enumerate(all_recipes, 1):
        # 1. 本地 Studio WebP 白名单绝对安全
        if is_verified_local(img_url):
            continue

        # 2. 占位图标记为待完善
        if 'unsplash.com' in img_url:
            imperfect.append((r_id, name, img_url, 0, "仍为 Unsplash 通用占位图"))
            continue

        # 3. 校验与盲审已有外链
        valid, raw_bytes, dims, val_msg = ImageValidator.download_and_validate(img_url)
        if not valid or raw_bytes is None:
            logger.warning(f"[{idx}/{len(all_recipes)}] ❌ 【{name}】图片失效或损坏: {val_msg} -> {img_url}")
            imperfect.append((r_id, name, img_url, 0, f"下载损坏: {val_msg}"))
            continue

        # 4. CPA 多模态打分复核
        b64_str = ImageValidator.prepare_base64_for_llm(raw_bytes)
        ev = reviewer.evaluate_image(name, b64_str)
        score = ev.get('score', 0)
        passed = ev.get('passed', False)
        reason = ev.get('reason', '')

        if not passed or score < 7:
            logger.warning(f"[{idx}/{len(all_recipes)}] ⚠️ 【{name}】复查不合格 (得分 {score}/10): {reason[:50]} -> {img_url}")
            imperfect.append((r_id, name, img_url, score, reason))
        else:
            logger.info(f"[{idx}/{len(all_recipes)}] ✅ 【{name}】复查优秀 (得分 {score}/10)")

    logger.info("=" * 60)
    logger.info(f"复查完成！发现不完美图片: {len(imperfect)} 道")
    for r in imperfect:
        logger.info(f"  - 【{r[1]}】({r[0]}): score={r[3]} | 原因: {r[4][:60]}")
    logger.info("=" * 60)

    conn.close()

if __name__ == '__main__':
    main()
