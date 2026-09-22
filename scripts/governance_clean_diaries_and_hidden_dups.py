#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
governance_clean_diaries_and_hidden_dups.py
清理真正隐蔽的 11 道同质化、羊头狗肉带货及网络随笔日记菜谱
"""

import sqlite3
import shutil
import datetime
from pathlib import Path
import subprocess
import json

DB_PATH = Path('/opt/shike-ai/data/db/shike.db')
BACKUP_DIR = Path('/opt/shike-ai/data/db')

TO_DELETE = {
    'recipe-xcf-80c8677b20': '橄榄菜肉末炒刀豆 (与经典榄菜肉末四季豆 recipe-htc-7722114c0c 完全同质)',
    'recipe-xcf-a2f6068059': '肉末扁豆 (与椒香肉末扁豆丝 recipe-xcf-151242bd55 完全同质)',
    'recipe-xcf-e6d765a071': '凉拌豆角 (食材带\"随你喜欢豆角\"，与规范凉拌豇豆完全同质)',
    'recipe-xcf-e61518e4bd': '凉拌小萝卜 (小水萝卜即樱桃萝卜，与凉拌樱桃萝卜完全同质)',
    'recipe-xcf-458bf14ab3': '清蒸丸子 (买白记现成牛肉丸放碗里蒸，非做菜菜谱)',
    'recipe-xcf-e2bd1b6ca2': '三文鱼能量沙拉 (洗碗机程序洗菜日记，与精选三文鱼沙拉重复)',
    'recipe-xcf-273c7a0622': '酸奶蒸蛋糕 (山姆买酸奶不会挤花日记，与蒸蛋糕重复)',
    'recipe-xcf-7e2ae2ed63': '香菇糯米鸡 (土鸡外卖锡纸留言求关注日记)',
    'recipe-xcf-74343c76ab': '鸡胸肉青稞沙拉 (新元素超市带肥来个人日记)',
    'recipe-xcf-b119b4e20f': '清蒸昌鱼 (\"切成花边奖如上图\"错别字日记)',
    'recipe-xcf-00bc4b91da': '烤鸡胸肉 (挂羊头卖狗肉，实际为独角兽即食鸡胸肉便当带货日记)',
}

def clean_remaining_dirty_ingredients():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    fixes = [
        ('recipe-xcf-039e7604f3', '左右鸭脚', '鸭掌'),
        ('recipe-xcf-48775bf83d', '左右钳鱼', '钳鱼'),
        ('recipe-xcf-d4c774ea4e', '左右肉片', '猪肉片'),
        ('recipe-xcf-d6d5af9027', '左右肉馅', '猪肉末'),
        ('recipe-htc-23975ee62d', '喜欢的沙拉酱', '沙拉酱'),
        ('recipe-xcf-55a7248d65', '蛋壳量x10凉白开', '温水'),
    ]
    for rid, bad_name, good_name in fixes:
        cur.execute('SELECT ingredients FROM recipes WHERE id = ?', (rid,))
        r = cur.fetchone()
        if r:
            ings = json.loads(r[0])
            changed = False
            for item in ings:
                if item.get('name') == bad_name:
                    item['name'] = good_name
                    changed = True
            if changed:
                cur.execute('UPDATE recipes SET ingredients = ? WHERE id = ?', (json.dumps(ings, ensure_ascii=False), rid))
                print(f"🔧 修复食材残存口语词: [{rid}] {bad_name} -> {good_name}")

    # 清理清蒸狮子头的分组伪食材 (狮子头部分, 汤料部分)
    cur.execute('SELECT ingredients FROM recipes WHERE id = ?', ('recipe-xcf-1abcff0582',))
    r = cur.fetchone()
    if r:
        ings = json.loads(r[0])
        clean_ings = [i for i in ings if i.get('name') not in ['狮子头部分', '汤料部分']]
        cur.execute('UPDATE recipes SET ingredients = ? WHERE id = ?', (json.dumps(clean_ings, ensure_ascii=False), 'recipe-xcf-1abcff0582'))
        print("🔧 清理清蒸狮子头中的分组伪食材标记")

    conn.commit()
    conn.close()

def main():
    if not DB_PATH.exists():
        print("❌ 数据库不存在")
        return

    # 1. 备份
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    bak_path = BACKUP_DIR / f"shike.db.bak_final_purge_{timestamp}"
    shutil.copy2(DB_PATH, bak_path)
    print(f"📦 [1/4] 备份生产数据库: {bak_path}")

    # 2. 删除
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    placeholders = ','.join(['?'] * len(TO_DELETE))
    cur.execute(f"DELETE FROM recipes WHERE id IN ({placeholders})", list(TO_DELETE.keys()))
    del_cnt = cur.rowcount
    print(f"✂️  [2/4] 剔除隐蔽同质化与日记菜谱: {del_cnt} 道")

    conn.commit()
    cur.execute("SELECT COUNT(*) FROM recipes")
    final_count = cur.fetchone()[0]
    conn.close()
    print(f"📊 数据库当前最终净菜谱数: {final_count}")

    # 3. 修复食材
    clean_remaining_dirty_ingredients()

    # 4. 回流
    print("🔄 [4/4] 同步回流 seedRecipes.json...")
    res = subprocess.run(['/usr/bin/python3', '/opt/shike-ai/scripts/export_recipes.py'], capture_output=True, text=True)
    print(res.stdout.strip())
    print("🎯 清理彻底完成！")

if __name__ == '__main__':
    main()
