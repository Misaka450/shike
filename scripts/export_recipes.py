#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
export_recipes.py
将治理后的 SQLite 生产数据库中的全部净菜谱导出为版本库可复现的 JSON 种子文件：
backend/src/data/seedRecipes.json
"""

import json
import sqlite3
from pathlib import Path

DB_PATH = Path('/opt/shike-ai/data/db/shike.db')
OUTPUT_PATH = Path('/opt/shike-ai/backend/src/data/seedRecipes.json')

def export_recipes():
    if not DB_PATH.exists():
        print(f"❌ 数据库不存在: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT id, name, category, cuisine, difficulty, prep_time, cook_time,
               servings, ingredients, instructions, tips, image_url
        FROM recipes
        WHERE owner_id IS NULL AND id NOT LIKE 'ai-recipe-%'
        ORDER BY id
    """)
    rows = cur.fetchall()
    recipes = []

    for row in rows:
        try:
            ingredients = json.loads(row['ingredients'])
        except Exception:
            ingredients = []
        try:
            instructions = json.loads(row['instructions'])
        except Exception:
            instructions = []

        recipes.append({
            "id": row['id'],
            "name": row['name'],
            "category": row['category'] or '家常菜',
            "cuisine": row['cuisine'] or '中餐',
            "difficulty": row['difficulty'] or '简单',
            "prep_time": int(row['prep_time'] or 10),
            "cook_time": int(row['cook_time'] or 15),
            "servings": int(row['servings'] or 2),
            "ingredients": ingredients,
            "instructions": instructions,
            "tips": row['tips'] or '',
            "image_url": row['image_url'] or ''
        })

    conn.close()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(recipes, f, ensure_ascii=False, indent=2)

    print(f"✅ 成功导出 {len(recipes)} 道菜谱至: {OUTPUT_PATH}")
    file_size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"📦 文件大小: {file_size_kb:.1f} KB")

if __name__ == '__main__':
    export_recipes()
