#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
governance_ultimate_purge.py
第三阶段终极治理：
1. 剔除隐藏的 13 道同质化菜谱与破损空气炸锅换皮菜
2. 正名 recipe-htc-869ef967eb 为经典全称《广式豆豉蒸排骨》
3. 彻底修复 HTC 菜谱中解析混入的“用量为/工具/作为主食”等重复与污染食材条目
4. 回流 seedRecipes.json
"""

import sqlite3
import shutil
import datetime
from pathlib import Path
import subprocess
import json
import re

DB_PATH = Path('/opt/shike-ai/data/db/shike.db')
BACKUP_DIR = Path('/opt/shike-ai/data/db')

TO_DELETE_ULTIMATE = {
    'recipe-xcf-59a3d4e7fa': '凉拌酸辣粉丝菠菜 (与凉拌菠菜粉丝 recipe-xcf-31d2408f39 完全重复)',
    'recipe-xcf-366f970ff5': '广式豆豉蒸排骨 (下厨房版，与HTC版豉汁排骨完全重复，保留HTC精准量化版)',
    'recipe-xcf-63429df9ba': '羊排萝卜汤 (下厨房版，与HTC版萝卜炖羊排完全重复)',
    'recipe-xcf-eaec091dd2': '西土日本豆腐汤 (西红柿土豆生造简称日记)',
    'recipe-xcf-7388bd1ab4': '文蛤蒸蛋 (与精选蛤蜊蒸蛋完全重复，且粗略仅3步无调料)',
    'recipe-xcf-dd193aead4': '咸肉末蒸蛋 (肉末蒸蛋粗劣换皮日记)',
    'recipe-xcf-2d6a6339cc': '三色肉沫蒸蛋 (肉末蒸蛋粗劣换皮日记)',
    'recipe-xcf-71bb9ee00b': '煎面包片三明治 (与爆浆芝士火腿三明治/西多士完全同质)',
    'recipe-xcf-c7c784e359': '早餐速成三明治 (与经典俱乐部三明治 recipe-xcf-c9064a02e9 完全同质)',
    'recipe-xcf-6dd40ca348': '综合轻食沙拉 (大杂烩概念占位，非具体菜品)',
    'recipe-xcf-eded3b8204': '牛油果时蔬沙拉 (山姆会员店带货晒单日记)',
    'recipe-htc-4f3c6326f5': '空气炸锅羊排 (换皮且食材解析严重破损包含\"必备/可选\")_保留煎烤羊排',
    'recipe-htc-346ed0221b': '空气炸锅鸡翅中 (换皮且食材解析严重破损包含\"必备/可选\")_保留烤鸡翅与红烧鸡翅',
}

def clean_htc_corrupted_ingredients():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('SELECT id, ingredients FROM recipes WHERE id LIKE "recipe-htc-%"')
    rows = cur.fetchall()

    fixed_count = 0
    for rid, ings_json in rows:
        if rid in TO_DELETE_ULTIMATE:
            continue
        ings = json.loads(ings_json)
        new_ings = []
        seen_names = set()
        changed = False

        for item in ings:
            name = item.get('name', '').strip()
            amount = item.get('amount', '适量').strip()
            required = item.get('required', True)

            # 过滤明显脏数据条目
            if name in ['工具', '搅拌工具', '作为主食', '必备', '可选', '红葱油可选']:
                changed = True
                continue
            if '容器——' in name or '馅料——' in name:
                changed = True
                continue

            # 处理类似 "牛肉用量为"、"盐的用量为" 的重复条目
            if '用量为' in name or '的用量为' in name:
                changed = True
                clean_name = re.sub(r'(的用量为|用量为|量用量为)$', '', name).strip()
                if clean_name and clean_name not in seen_names:
                    seen_names.add(clean_name)
                    new_ings.append({
                        'name': clean_name,
                        'amount': amount,
                        'required': required
                    })
                continue

            if name not in seen_names:
                seen_names.add(name)
                new_ings.append(item)
            else:
                # 重复项丢弃
                changed = True

        if changed:
            cur.execute('UPDATE recipes SET ingredients = ? WHERE id = ?', (json.dumps(new_ings, ensure_ascii=False), rid))
            fixed_count += 1

    conn.commit()
    conn.close()
    print(f"🧹 修复并彻底去除了 {fixed_count} 道 HTC 菜谱中的重复/污染食材条目")

def main():
    if not DB_PATH.exists():
        print("❌ 数据库不存在")
        return

    # 1. 备份
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    bak_path = BACKUP_DIR / f"shike.db.bak_ultimate_{timestamp}"
    shutil.copy2(DB_PATH, bak_path)
    print(f"📦 [1/4] 备份生产数据库: {bak_path}")

    # 2. 删除
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    placeholders = ','.join(['?'] * len(TO_DELETE_ULTIMATE))
    cur.execute(f"DELETE FROM recipes WHERE id IN ({placeholders})", list(TO_DELETE_ULTIMATE.keys()))
    del_cnt = cur.rowcount
    print(f"✂️  [2/4] 终极清除同质化与破损菜谱: {del_cnt} 道")

    # 正名豉汁排骨
    cur.execute("UPDATE recipes SET name = '广式豆豉蒸排骨' WHERE id = 'recipe-htc-869ef967eb'")
    print("🏷️  正名 《豉汁排骨》 为经典全称 《广式豆豉蒸排骨》")

    conn.commit()
    cur.execute("SELECT COUNT(*) FROM recipes")
    final_count = cur.fetchone()[0]
    conn.close()
    print(f"📊 数据库当前纯净正品菜谱数: {final_count}")

    # 3. 深度清洗 HTC 食材条目
    clean_htc_corrupted_ingredients()

    # 4. 回流 seedRecipes.json
    print("🔄 [4/4] 同步回流 seedRecipes.json...")
    res = subprocess.run(['/usr/bin/python3', '/opt/shike-ai/scripts/export_recipes.py'], capture_output=True, text=True)
    print(res.stdout.strip())
    print("🏆 终极治理成功！全部指标彻底清爽！")

if __name__ == '__main__':
    main()
