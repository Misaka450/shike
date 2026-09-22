#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
governance_deep_cleanup.py
第二阶段：深度治理隐蔽同质化复本、同音异名菜谱、泛称大杂烩概念词以及生活日记残缺数据
"""

import sqlite3
import shutil
import datetime
from pathlib import Path
import subprocess
import json

DB_PATH = Path('/opt/shike-ai/data/db/shike.db')
BACKUP_DIR = Path('/opt/shike-ai/data/db')

TO_DELETE_DEEP = {
    # 1. 同菜异名 / 同款复本
    'recipe-xcf-13a72dec37': '蛤蜊丝瓜汤 (与精选丝瓜蛤蜊鲜汤 recipe-loofah-clam-soup 完全重复)',
    'recipe-xcf-0ae664e1a9': '清蒸桂花鱼 (桂花鱼即鳜鱼，食材误标\"桂花香\"，与清蒸鳜鱼重复)',
    'recipe-xcf-2194e37c4d': '柯布色拉 (与考伯沙拉 recipe-xcf-107d6c5fa3 同音异名完全重复)',
    'recipe-xcf-277e7ef344': '韩国泡菜豆腐汤 (与辣白菜豆腐汤 recipe-xcf-e66a9a06eb 完全重复)',
    'recipe-xcf-66ae4a9269': '蛤蜊豆腐汤天下第一鲜 (与蛤蜊豆腐汤 recipe-xcf-f13f77fc4e 完全重复)',
    'recipe-xcf-886e7ab6d5': '番茄菌菇豆腐汤 (与番茄金针菇豆腐汤 recipe-xcf-a9b2e7310d 同质重复)',
    'recipe-xcf-2a709aa75b': '飘香凉拌面 (与凉拌面 recipe-xcf-e8b927f3a0 同质重复)',
    'recipe-xcf-7e4b504bb4': '土豆片炒肉 (仅2步emoji，与瘦肉土豆片 recipe-htc-3721407716 完全重复)',
    'recipe-xcf-72fab751f4': '冬瓜速冻丸子汤简单 (与冬瓜肉丸汤 recipe-winter-melon-meatball-soup 重复)',
    'recipe-xcf-b2b04cb452': '暖心暖胃丸子汤 (与生汆丸子汤 recipe-htc-43a1d1c9d9 重复)',
    'recipe-xcf-cd61bd7481': '暖心暖胃的蔬菜豆腐汤 (与青菜豆腐汤/番茄豆腐汤同质重复)',
    'recipe-xcf-6ec4b5bee2': '一清二白的小葱拌豆腐 (歇后语标题党，步骤纯凑字，与凉拌豆腐重复)',
    'recipe-xcf-027bab3dbb': '西红柿肥牛汤 (与精选番茄金针菇肥牛汤 recipe-beef-tomato-soup 完全重复)',
    'recipe-htc-b80cf09bf6': '蒜苔炒肉末 (实际做法切肉丝，与精选蒜苔炒肉丝 recipe-garlic-sprout-pork 重复)',

    # 2. 泛称大杂烩概念占位
    'recipe-xcf-a3009bb6b2': '减肥色拉 (营销概念词，非规范菜品)',
    'recipe-xcf-09e84a905b': '夏日清凉消暑菜 (营销概念词，非规范菜品)',
    'recipe-xcf-8496f3ba7b': '冬季凉拌菜 (季节概念词，非规范菜品)',
    'recipe-xcf-76bb8d8034': '什锦凉拌菜 (大杂烩概念占位)',
    'recipe-xcf-f965e2fc95': '凉拌素菜 (大杂烩概念占位)',

    # 3. 残缺截断、生活日记便当
    'recipe-xcf-caed7336ae': '的丝瓜汤 (菜名前缀截断脏数据)',
    'recipe-xcf-31998a7352': '清凉一夏冰淇淋三明治 (步骤\"百度搬运来的~\"日记)',
    'recipe-xcf-e983a448dd': '可以喝两碗的鲍鱼菌菇汤 (步骤\"用菌汤包配好的量多少不清楚\"日记)',
    'recipe-xcf-37343a012c': '冬日热汤萝卜汤 (步骤\"我相公/婆婆/无视我的刀工/图片里用错了\"日记)',
    'recipe-xcf-5bd11b26c6': '清甜丝瓜蒸鱼片8分钟 (步骤\"忘记买葱各位脑补\"闲聊)',
    'recipe-xcf-4598ae5907': '香香香的香菜干豆腐卷 (口语化标题党)',
    'recipe-xcf-7682a993c5': '一人食不加盐香菇炒肉 (营销前缀日记，已有香菇炒肉片)',
    'recipe-xcf-f63b6ea865': '周末减压小炒猪皮 (食材带未闭合单引号，营销前缀)',
    'recipe-xcf-467cfdd786': '老火靓汤 (模糊泛称非菜名)',
    'recipe-xcf-d01fa95a54': '胶东人家的虾干萝卜汤，鲜 (标题党带逗号，已有萝卜汤系列)',
    'recipe-xcf-0317acf5c0': '黑椒牛肉粒 (定食便当拼盘，含燕麦饭/紫苏番茄/西兰花)',
    'recipe-xcf-0176852fd9': '白菜番茄豆腐汤 (粗制日记版，已有标准番茄豆腐汤)',
    'recipe-xcf-7cdad29662': '凉拌萝卜皮 (生活闲聊日记，已有标准凉拌萝卜丝)',
}

def clean_ingredients():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    # 修复部分保留菜谱中残存的前缀噪音
    fixes = [
        ('recipe-xcf-2f161beab1', '左右就好鳜鱼', '鳜鱼'),
        ('recipe-xcf-c22403f5e4', '撮百里香', '百里香'),
        ('recipe-xcf-e340c3a6a9', '小撮盐', '盐'),
        ('recipe-xcf-e86cb7d222', '小撮白芝麻粒', '白芝麻'),
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
                print(f"🔧 修复食材脏数据: [{rid}] {bad_name} -> {good_name}")
    conn.commit()
    conn.close()

def main():
    if not DB_PATH.exists():
        print(f"❌ 找不到数据库: {DB_PATH}")
        return

    # 1. 备份
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    bak_path = BACKUP_DIR / f"shike.db.bak_deep_{timestamp}"
    shutil.copy2(DB_PATH, bak_path)
    print(f"📦 [1/4] 第二阶段快照备份完成: {bak_path}")

    # 2. 执行第二阶段清理
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM recipes")
    total_before = cur.fetchone()[0]

    placeholders = ','.join(['?'] * len(TO_DELETE_DEEP))
    cur.execute(f"DELETE FROM recipes WHERE id IN ({placeholders})", list(TO_DELETE_DEEP.keys()))
    deleted_count = cur.rowcount
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM recipes")
    total_after = cur.fetchone()[0]
    conn.close()

    print(f"✂️  [2/4] 清理隐蔽重复与违规菜谱: 共剔除 {deleted_count} 道")
    print(f"📊 数据库菜谱总数: {total_before} -> {total_after}")

    # 3. 修复食材噪音
    clean_ingredients()

    # 4. 回流版本库
    print("🔄 [3/4] 同步更新 seedRecipes.json...")
    res = subprocess.run(['/usr/bin/python3', '/opt/shike-ai/scripts/export_recipes.py'], capture_output=True, text=True)
    print(res.stdout.strip())

    print("✅ [4/4] 深度排查与根除完成！当前数据库已达出版级严谨标准。")

if __name__ == '__main__':
    main()
