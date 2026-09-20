#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
sync_local_verified.py
扫描 /opt/shike-ai/frontend/public/images/dishes/ 下所有的本地高质量 WebP，
同步更新 backend/src/utils/recipeImage.ts 中的 LOCAL_VERIFIED_RECIPES，
以及 scripts/fix_recipe_images.py 中的 LOCAL_VERIFIED_RECIPES。
确保凡是在本地有专属大片的菜品，无论是按 ID 还是按菜品名，都第一优先级强锁定。
"""

import os
import re
import json
import sqlite3
from pathlib import Path

DISHES_DIR = Path('/opt/shike-ai/frontend/public/images/dishes')
DB_PATH = Path('/opt/shike-ai/data/db/shike.db')
VERIFIED_JSON = Path('/opt/shike-ai/backend/src/data/localVerifiedRecipes.json')

def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, name, image_url FROM recipes")
    all_recipes = cur.fetchall()
    
    # 建立映射
    # 1. 现有文件列表
    webp_files = set(f.name for f in DISHES_DIR.glob('*.webp'))
    print(f"本地 dishes/ 目录下高质量 WebP 文件总数: {len(webp_files)}")
    
    # 构建精准白名单字典
    verified_map = {}
    
    for r_id, name, img in all_recipes:
        slug = r_id.replace('-', '_')
        target_webp = f"{slug}.webp"
        
        # 特殊别名对应
        alias_webps = {
            'recipe-century-egg-tofu': 'recipe_pidan_tofu.webp',
            'recipe-banana-yogurt-bowl': 'recipe_banana_yogurt_bowl.webp',
            'recipe-xcf-7235540446': 'recipe_tomato_beef_soup.webp',
            'recipe-steamed-perch': 'recipe_steamed_perch.webp',
            'recipe-htc-18a0e88383': 'recipe_gongbao_chicken.webp',
            'recipe-htc-a05e25287e': 'recipe_congyou_mian.webp',
            'recipe-htc-ea76d29630': 'recipe_shoupa_pork.webp',
            'recipe-htc-2b2201feea': 'recipe_shuizhu_beef.webp',
            'recipe-xcf-ba97ce4689': 'recipe_tuna_salad.webp',
            'recipe-xcf-ede4f494ca': 'recipe_avocado_salad.webp',
            'recipe-xcf-7435f3dfd6': 'recipe_chicken_quinoa_salad.webp',
            'recipe-egg-drop-soup': 'recipe_egg_drop_soup.webp',
            'recipe-corn-ribs-soup': 'recipe_corn_ribs_soup.webp',
            'recipe-htc-cf80ef201c': 'recipe_steamed_egg.webp',
            'recipe-xcf-a46c243bc5': 'recipe_steamed_pork_patty.webp',
        }
        
        chosen_file = None
        if target_webp in webp_files:
            chosen_file = target_webp
        elif r_id in alias_webps and alias_webps[r_id] in webp_files:
            chosen_file = alias_webps[r_id]
            
        if chosen_file:
            rel_path = f"/images/dishes/{chosen_file}"
            verified_map[r_id] = rel_path
            verified_map[name] = rel_path
            # 更新数据库
            cur.execute("UPDATE recipes SET image_url = ? WHERE id = ?", (rel_path, r_id))
            
    conn.commit()
    
    # 同步单一数据源 localVerifiedRecipes.json
    if VERIFIED_JSON.exists():
        with open(VERIFIED_JSON, 'r', encoding='utf-8') as f:
            current_json = json.load(f)
    else:
        current_json = {}
    current_json.update(verified_map)
    with open(VERIFIED_JSON, 'w', encoding='utf-8') as f:
        json.dump(current_json, f, ensure_ascii=False, indent=2)
    print(f"✅ 白名单单一数据源已同步更新: {len(current_json)} 条")

    cur.execute("SELECT COUNT(*) FROM recipes WHERE image_url LIKE '/images/dishes/%'")
    cnt = cur.fetchone()[0]
    print(f"✅ 数据库已强锁定本地高质量大片菜品数: {cnt} 道")
    conn.close()

if __name__ == '__main__':
    main()
