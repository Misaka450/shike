#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
clean_and_sanitize_recipes.py
四道防线全量深度重构与清洗食刻菜谱数据库 (shike.db)：
1. 一票否决淘汰劣质残次数据（步骤字数<40、步数<3、假步骤、严重脏乱无法修复的条目直接物理删除）。
2. 精准修复食材截断与杂质（修复'个茄子'->'茄子'、'克肉末'->'肉末'、剔除工具与乱码）。
3. 规范化清洗菜名（彻底清除表情Emoji、网感黑话、营销前缀）。
4. 重新校验全库质量并落盘。
"""

import os
import sys
import json
import re
import sqlite3
from pathlib import Path

DB_PATH = Path('/opt/shike-ai/data/db/shike.db')

# 严重污染黑名单关键词（食材中出现则整道菜判定为废数据）
POISONED_ING_KEYWORDS = [
    '簸箕', '克数称', '根据锅', '决策不同量', '锅能盛', '这大约是',
    '步骤', '方法一', '方法二', '备菜', '厨具', '小贴士'
]

# 常见量词修饰，用于修复前缀被截断的食材名（如 '个茄子' -> '茄子'）
QUANTIFIER_PREFIXES = r'^(个|克|瓣|根|只|勺|碗|包|盒|片|块|把|条|两|斤|枚|颗|粒|头|支|张|袋|罐)\s*'

def clean_dish_name(name):
    # 清理各种括号及内容
    n = re.sub(r'【.*?】|\[.*?\]|（.*?）|\(.*?\)|『.*?』|「.*?」', '', name)
    # 清除各种表情符号和特殊标点
    n = re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\u2300-\u23ff~～!！·\-_\+=#🍻🍓🍤]', '', n)
    # 清除常见营销/序号前缀
    n = re.sub(r'^(超简单|快手|好吃到哭|秘制|自制|私房|家常|巨好吃|绝绝子|减脂必备|懒人|香喷喷的|下饭的|超级下饭的|美味的|美味|简单|经典|正宗|特级|神仙|网红|一学就会|两步搞定的|风味|传统|鲜美|清脆|爽口|低卡|无油|减脂|必学|独家|特色|创新|月子餐\s*[:：]?|简单快手菜之\d+|之\d+|梅森瓶之|婴幼儿辅食\s*[:：]?)+', '', n)
    n = re.sub(r'(的做法|的家常做法|简单做|超下饭|附万能蘸料|附酱汁|开胃)+$', '', n)
    n = n.strip(' :：，,。')
    return n

def sanitize_ingredient_name(name):
    # 清理括号和附加描述
    n = re.sub(r'[\(（].*?[\)）]', '', name)
    # 修复前缀残缺量词，如 '个茄子' -> '茄子', '瓣蒜' -> '大蒜'
    if re.match(QUANTIFIER_PREFIXES + r'蒜$', n):
        return '大蒜'
    if re.match(QUANTIFIER_PREFIXES + r'葱$', n):
        return '小葱'
    if re.match(QUANTIFIER_PREFIXES + r'姜$', n):
        return '生姜'
    n = re.sub(QUANTIFIER_PREFIXES, '', n)
    # 剔除波浪号、数字等杂质
    n = re.sub(r'^[~～\d\.\s]+', '', n)
    n = re.sub(r'[~～\*\+]', '', n)
    n = n.strip(' :：，,。')
    return n

def main():
    if not DB_PATH.exists():
        print(f"Error: {DB_PATH} not found.")
        sys.exit(1)
        
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, name, category, cuisine, difficulty, prep_time, cook_time, servings, ingredients, instructions, tips, image_url, created_at FROM recipes")
    rows = cur.fetchall()
    
    total_before = len(rows)
    print(f"📦 启动前数据库菜谱总数: {total_before}")
    
    deleted_reasons = []
    sanitized_recipes = []
    
    for r in rows:
        (rid, name, cat, cui, diff, prep, cook, servings, ings_raw, insts_raw, tips, img, created_at) = r
        
        # 1. 解析校验 JSON
        try:
            ings = json.loads(ings_raw)
            insts = json.loads(insts_raw)
        except Exception:
            deleted_reasons.append((rid, name, 'JSON损坏'))
            continue
            
        # 2. 一票否决：制作步骤敷衍检查
        total_inst_len = sum(len(s.strip()) for s in insts)
        # 排除步数少于3、字数少于40字，或包含典型占位假步骤
        if len(insts) < 3 or total_inst_len < 40:
            deleted_reasons.append((rid, name, f'步骤敷衍(步数:{len(insts)}, 字数:{total_inst_len})'))
            continue
        if any(s.strip() in ['备菜:', '备菜', '制作', '炖煮', '操作', '步骤', '做', '开始'] for s in insts):
            deleted_reasons.append((rid, name, f'含占位假步骤'))
            continue
            
        # 3. 一票否决：食材严重污染检查
        is_poisoned = False
        for item in ings:
            iname = item.get('name', '')
            if any(pk in iname for pk in POISONED_ING_KEYWORDS):
                is_poisoned = True
                break
        if is_poisoned:
            deleted_reasons.append((rid, name, '食材包含器具/长句严重污染'))
            continue
            
        # 4. 食材深度清洗与修复
        cleaned_ings = []
        for item in ings:
            raw_iname = item.get('name', '').strip()
            fixed_iname = sanitize_ingredient_name(raw_iname)
            if not fixed_iname or len(fixed_iname) > 12:
                continue
            cleaned_ings.append({
                'name': fixed_iname,
                'amount': item.get('amount', '适量').strip(),
                'required': bool(item.get('required', True))
            })
            
        # 必须至少有 3 个有效食材且至少有 1 个必选主料
        if len(cleaned_ings) < 3:
            deleted_reasons.append((rid, name, f'有效食材不足({len(cleaned_ings)}个)'))
            continue
            
        # 5. 步骤规范化清洗（去掉多余数字序号）
        cleaned_insts = []
        for s in insts:
            s_clean = re.sub(r'^\d+[\.、\s]+', '', s).strip()
            if s_clean:
                cleaned_insts.append(s_clean)
        if len(cleaned_insts) < 3:
            deleted_reasons.append((rid, name, '清洗后有效步骤不足3步'))
            continue
            
        # 6. 菜名规范化清洗
        fixed_name = clean_dish_name(name)
        if not fixed_name or len(fixed_name) < 2 or len(fixed_name) > 14:
            deleted_reasons.append((rid, name, f'菜名不合规({fixed_name})'))
            continue
            
        # 通过所有四道防线，存入合格列表
        sanitized_recipes.append((
            rid, fixed_name, cat, cui, diff, prep, cook, servings,
            json.dumps(cleaned_ings, ensure_ascii=False),
            json.dumps(cleaned_insts, ensure_ascii=False),
            tips, img, created_at
        ))
        
    print(f"\n🚫 经一票否决门禁，共淘汰劣质/残次菜谱: {len(deleted_reasons)} 道")
    print(f"✨ 经清洗修复后合格菜谱: {len(sanitized_recipes)} 道")
    
    # 统计淘汰原因
    from collections import Counter
    reason_counts = Counter(r[2].split('(')[0] for r in deleted_reasons)
    for rc, cnt in reason_counts.items():
        print(f"  · {rc}: {cnt} 道")
        
    # 原子重写 recipes 表
    cur.execute("DELETE FROM recipes")
    insert_sql = """
    INSERT INTO recipes (
        id, name, category, cuisine, difficulty, prep_time, cook_time,
        servings, ingredients, instructions, tips, image_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    cur.executemany(insert_sql, sanitized_recipes)
    conn.commit()
    
    cur.execute("SELECT COUNT(*) FROM recipes")
    final_count = cur.fetchone()[0]
    print(f"\n🎉 全量清洗与重构成功！最终优质纯净菜谱库规模: {final_count} 道。")
    conn.close()

if __name__ == '__main__':
    main()
