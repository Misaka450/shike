#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
governance_precision_polishing.py
精益求精治理工程：
1. 剔除第二批确认的 28 道同质化/残缺/网络日记菜谱
2. 规范化修正菜品命名 (肉末茄子, 黄骨鱼炖豆腐汤)
3. Line 2: 食材前缀切词残损与尾部数量粘连深度修复，调料 required 属性校准
4. Line 3: 步骤与小贴士 (Tips) 广告牛皮癣、外部链接及格式控制字符清除
5. 同步回流 seedRecipes.json
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

TO_DELETE_PRECISION = {
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
    'recipe-xcf-b2f6d64200': '菜黄骨鱼炖豆腐汤 (前缀截断，且与黄骨鱼炖豆腐汤完全重复)',

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

NAMES_UPDATE = {
    'recipe-pork-eggplant': '肉末茄子',
    'recipe-xcf-4774739e9c': '黄骨鱼炖豆腐汤',
}

def sanitize_ingredients(ings):
    prefix_pattern = r'^(小把|大颗|小扎|瓷勺|大勺|小勺|茶匙|汤匙|小撮|撮|滴|个|克|瓣|根|只|勺|片|块|碗|包|盒|把)'
    seasonings = {'米酒', '料酒', '黄酒', '白糖', '盐', '食用油', '香油', '淀粉', '鸡精', '味精', '生抽', '老抽'}
    
    cleaned = []
    for item in ings:
        name = item.get('name', '').strip()
        amount = item.get('amount', '适量').strip()
        required = item.get('required', True)

        # 修复具体特殊脏数据
        if name == '左右就好鳜鱼':
            name = '鳜鱼'
        elif name == '撮百里香':
            name = '百里香'
        elif name == '文鱼250g':
            name = '三文鱼'
            amount = '250g'
        elif name == '食用油500ml':
            name = '食用油'
            amount = '500ml'
        elif name == '香菜叶10g':
            name = '香菜叶'
            amount = '10g'
        elif name == '盐 25g':
            name = '盐'
            amount = '25g'
        else:
            # 去除前缀量词
            m = re.match(prefix_pattern, name)
            if m and len(name) > len(m.group(0)):
                matched_prefix = m.group(0)
                name = name[len(matched_prefix):]
                if amount in ['适量', '少许', ''] or not amount:
                    amount = matched_prefix

        # 去除单双引号杂质 (如 '猪皮 -> 猪皮)
        name = name.strip('\'"“”‘’')

        # 调料 required 校准
        if name in seasonings:
            required = False

        cleaned.append({
            'name': name,
            'amount': amount,
            'required': required
        })
    return cleaned

def sanitize_instructions(insts):
    cleaned = []
    for s in insts:
        # 去除换行与多余空格
        s = re.sub(r'[\r\n\t]+', ' ', s)
        s = re.sub(r'\s{2,}', ' ', s)
        # 去除步骤中的 emoji
        s = re.sub(r'[\U00010000-\U0010ffff]', '', s)
        s = s.strip(' ；，,。')
        if s:
            cleaned.append(s + '。')
    return cleaned

def sanitize_tips(tips):
    if not tips:
        return ''
    # 清除公众号/APP推广/外链等
    t = re.sub(r'http[s]?://[^\s，。]+', '', tips)
    t = re.sub(r'(欢迎关注|微信公众号|APP：|App Store|下载APP|小红书|淘口令|方子量为).*', '', t)
    t = re.sub(r'[\r\n\t]+', ' ', t)
    t = re.sub(r'\s{2,}', ' ', t)
    return t.strip()

def main():
    if not DB_PATH.exists():
        print("❌ 数据库文件不存在")
        return

    # 1. 备份
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    bak_path = BACKUP_DIR / f"shike.db.bak_precision_{timestamp}"
    shutil.copy2(DB_PATH, bak_path)
    print(f"📦 [1/5] 备份生产数据库: {bak_path}")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 2. 删除重复与劣质菜谱
    placeholders = ','.join(['?'] * len(TO_DELETE_PRECISION))
    cur.execute(f"DELETE FROM recipes WHERE id IN ({placeholders})", list(TO_DELETE_PRECISION.keys()))
    del_count = cur.rowcount
    print(f"✂️  [2/5] 深度剔除同质化与违规菜谱: {del_count} 道")

    # 3. 菜名更新
    for rid, new_name in NAMES_UPDATE.items():
        cur.execute("UPDATE recipes SET name = ? WHERE id = ?", (new_name, rid))
    print(f"🏷️  [3/5] 规范化更新 {len(NAMES_UPDATE)} 道菜品名称")

    # 4. 全量结构化清洗 (Line 2 & Line 3)
    cur.execute("SELECT id, ingredients, instructions, tips FROM recipes")
    rows = cur.fetchall()
    print(f"🧹 [4/5] 正在对剩余 {len(rows)} 道菜谱执行逐条精炼与去噪...")

    for rid, ings_json, insts_json, tips in rows:
        try:
            ings = json.loads(ings_json)
            cleaned_ings = sanitize_ingredients(ings)
        except:
            cleaned_ings = []

        try:
            insts = json.loads(insts_json)
            cleaned_insts = sanitize_instructions(insts)
        except:
            cleaned_insts = []

        cleaned_tips = sanitize_tips(tips)

        cur.execute("""
            UPDATE recipes 
            SET ingredients = ?, instructions = ?, tips = ?
            WHERE id = ?
        """, (
            json.dumps(cleaned_ings, ensure_ascii=False),
            json.dumps(cleaned_insts, ensure_ascii=False),
            cleaned_tips,
            rid
        ))

    conn.commit()

    cur.execute("SELECT COUNT(*) FROM recipes")
    final_count = cur.fetchone()[0]
    conn.close()
    print(f"✨ 数据库处理完毕，当前正品菜谱数: {final_count}")

    # 5. 回流 seedRecipes.json
    print("🔄 [5/5] 同步回流 seedRecipes.json...")
    res = subprocess.run(['/usr/bin/python3', '/opt/shike-ai/scripts/export_recipes.py'], capture_output=True, text=True)
    print(res.stdout.strip())
    print("🎉 精益求精治理工程圆满完成！")

if __name__ == '__main__':
    main()
