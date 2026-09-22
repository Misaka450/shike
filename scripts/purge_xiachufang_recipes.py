#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
purge_xiachufang_recipes.py
按用户明确指令：彻底删除所有从下厨房 (recipe-xcf-*) 导入的菜谱，
仅保留 HowToCook 精确量化菜谱 (recipe-htc-*) 以及系统自带的高清精选/内置菜谱 (recipe-*)。
"""

import sqlite3
import shutil
import datetime
from pathlib import Path
import subprocess

DB_PATH = Path('/opt/shike-ai/data/db/shike.db')
BACKUP_DIR = Path('/opt/shike-ai/data/db')

def main():
    if not DB_PATH.exists():
        print("❌ 数据库不存在")
        return

    # 1. 备份
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    bak_path = BACKUP_DIR / f"shike.db.bak_remove_xcf_{timestamp}"
    shutil.copy2(DB_PATH, bak_path)
    print(f"📦 [1/3] 备份生产数据库: {bak_path}")

    # 2. 删除所有 recipe-xcf-*
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM recipes WHERE id LIKE 'recipe-xcf-%'")
    xcf_count = cur.fetchone()[0]

    cur.execute("DELETE FROM recipes WHERE id LIKE 'recipe-xcf-%'")
    deleted = cur.rowcount
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM recipes")
    final_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM recipes WHERE id LIKE 'recipe-htc-%'")
    htc_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM recipes WHERE id NOT LIKE 'recipe-htc-%'")
    builtin_count = cur.fetchone()[0]

    conn.close()

    print(f"✂️  [2/3] 已彻底删除全部下厨房菜谱: 共 {deleted} 道")
    print(f"📊 数据库当前最终菜谱总数: {final_count} 道")
    print(f"   - HowToCook (精确量化菜谱): {htc_count} 道")
    print(f"   - 食刻精选/内置 (本地高清/标杆菜谱): {builtin_count} 道")

    # 3. 回流 seedRecipes.json
    print("🔄 [3/3] 同步更新 seedRecipes.json...")
    res = subprocess.run(['/usr/bin/python3', '/opt/shike-ai/scripts/export_recipes.py'], capture_output=True, text=True)
    print(res.stdout.strip())
    print("🎉 下厨房菜谱已彻底出清！全库实现极高纯净度！")

if __name__ == '__main__':
    main()
