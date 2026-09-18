#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
polish_recipe_details.py
食刻菜谱数据库精细化深度治理：
1. 食材提纯：清除公式、器具、无效条目（如“份数”、“的数量”、“深一点的小铁盆”），拆分复合食材，同菜食材去重。
2. 步骤平滑：将末尾孤立的极短步骤（<=3字，如“出锅”、“关火”、“装盘”）智能合并至上一步。
3. 分类与菜系统一标准化：合并同义碎片分类（海鲜水产/水产海鲜、各类汤羹统一）。
4. 时间规范：补正冷制菜品烹饪时间为合理的制作时间（>=5分钟）。
"""

import os
import sys
import json
import re
import sqlite3
from pathlib import Path

DB_PATH = Path('/opt/shike-ai/data/db/shike.db')

# 器具与说明性词汇过滤黑名单
TOOL_AND_FORMULA_PATTERNS = [
    r'份数', r'的数量', r'量$', r'盆', r'碗', r'锅', r'簸箕', r'称',
    r'ml\s+', r'g\s+', r'颗\s+', r'头蒜\s+', r'大蒜四五瓣',
    r'有一定深度', r'根据锅', r'根据口味'
]

# 分类标准化映射
CATEGORY_MAP = {
    '海鲜水产': '水产海鲜',
    '经典主食': '主食',
    '汤羹': '靓汤羹品',
    '养生汤羹': '靓汤羹品',
    '快手菜': '家常菜',
    '减脂轻食': '轻食沙拉',
    '素食轻食': '轻食沙拉',
    '轻食烘焙': '甜品点心',
}

# 菜系标准化映射
CUISINE_MAP = {
    '粤菜家常': '粤菜',
    '粤菜精选': '粤菜',
    '粤菜传统': '粤菜',
    '粤式靓粥': '粤菜',
    '家常川味': '川菜',
    '川湘家常': '川菜',
    '本帮江浙': '江浙菜',
    '本帮风味': '江浙菜',
    '京鲁风味': '鲁菜',
    '鲁菜经典': '鲁菜',
    '家常风味': '中餐',
    '家常小炒': '中餐',
    '家常素菜': '中餐',
    '家常创新': '中餐',
    '家常主食': '中餐',
    '家常靓汤': '养生汤羹',
    '家常素汤': '养生汤羹',
    '粤菜靓汤': '粤菜',
    '快手蒸菜': '粤菜',
    '家常蒸菜': '中餐',
    '沿海家常': '中餐',
    '快手轻食': '西餐轻食',
    '快手早餐': '中餐',
    '快手主食': '中餐'
}

def clean_single_ingredient_name(name):
    n = name.strip()
    # 清理括号说明
    n = re.sub(r'[\(（].*?[\)）]', '', n)
    n = re.sub(r'^[~～\d\.\s]+', '', n)
    n = re.sub(r'[~～\*\+、，,。]', '', n)
    # 去除常见前后缀垃圾字符
    n = n.strip(' :：，,。')
    return n

def sanitize_ingredients(ings):
    cleaned = []
    seen_names = set()
    
    for item in ings:
        raw_name = item.get('name', '').strip()
        amt = item.get('amount', '适量').strip()
        req = bool(item.get('required', True))
        
        # 1. 过滤器具、公式、无意义条目
        if any(re.search(pat, raw_name) for pat in TOOL_AND_FORMULA_PATTERNS):
            continue
            
        # 2. 检查是否复合食材（如 '大蒜、小米辣'）
        sub_names = re.split(r'[,，、/]\s*', raw_name)
        for sn in sub_names:
            cname = clean_single_ingredient_name(sn)
            if not cname or len(cname) < 1 or len(cname) > 10:
                continue
            # 常见归一化
            if cname in ['蒜', '蒜瓣', '蒜头', '大蒜瓣']:
                cname = '大蒜'
            elif cname in ['小葱花', '葱花', '青葱', '大葱段', '小葱段']:
                cname = '葱'
            elif cname in ['生姜片', '姜片', '生姜末', '姜丝']:
                cname = '生姜'
                
            if cname in seen_names:
                continue
            seen_names.add(cname)
            cleaned.append({
                'name': cname,
                'amount': amt,
                'required': req
            })
            
    # 保证至少有一个主料
    if cleaned and not any(i['required'] for i in cleaned):
        cleaned[0]['required'] = True
        
    return cleaned

def smooth_instructions(insts):
    if not insts:
        return insts
        
    cleaned_steps = [s.strip() for s in insts if s.strip()]
    if len(cleaned_steps) <= 1:
        return cleaned_steps
        
    # 如果最后一步或后两步是超短收尾词（<=3字），合并到前一步
    short_tails = {'出锅', '关火', '装盘', '盛盘', '盛出', '开吃', '享用', '出锅。', '盛盘。', '成品。', '开动', '起锅'}
    
    while len(cleaned_steps) >= 2:
        last_step = cleaned_steps[-1].rstrip('。， ')
        if last_step in short_tails or len(last_step) <= 3:
            prev = cleaned_steps[-2].rstrip('。， ')
            cleaned_steps[-2] = f"{prev}，{last_step}即可。"
            cleaned_steps.pop()
        else:
            break
            
    return cleaned_steps

def main():
    if not DB_PATH.exists():
        print(f"Error: {DB_PATH} not found.")
        sys.exit(1)
        
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name, category, cuisine, difficulty, prep_time, cook_time, servings,
               ingredients, instructions, tips, image_url, created_at
        FROM recipes
    """)
    rows = cur.fetchall()
    
    print(f"📦 正在精细化治理 {len(rows)} 道菜谱...")
    
    updated_recipes = []
    polished_ing_count = 0
    smoothed_step_count = 0
    time_fixed_count = 0
    
    for r in rows:
        (rid, name, cat, cui, diff, prep, cook, servings, ings_raw, insts_raw, tips, img, created_at) = r
        
        ings = json.loads(ings_raw)
        insts = json.loads(insts_raw)
        
        # 1. 食材治理
        clean_ings = sanitize_ingredients(ings)
        if len(clean_ings) != len(ings):
            polished_ing_count += 1
            
        # 2. 步骤平滑
        orig_len = len(insts)
        smooth_insts = smooth_instructions(insts)
        if len(smooth_insts) != orig_len:
            smoothed_step_count += 1
            
        # 3. 分类与菜系统一
        std_cat = CATEGORY_MAP.get(cat, cat)
        std_cui = CUISINE_MAP.get(cui, cui)
        
        # 4. 时间规范
        fixed_prep = prep
        fixed_cook = cook
        if fixed_prep <= 0:
            fixed_prep = 5
        if fixed_cook <= 0:
            fixed_cook = 5
            time_fixed_count += 1
            
        updated_recipes.append((
            rid, name, std_cat, std_cui, diff, fixed_prep, fixed_cook, servings,
            json.dumps(clean_ings, ensure_ascii=False),
            json.dumps(smooth_insts, ensure_ascii=False),
            tips, img, created_at
        ))
        
    # 原子更新
    cur.execute("DELETE FROM recipes")
    insert_sql = """
        INSERT INTO recipes (
            id, name, category, cuisine, difficulty, prep_time, cook_time, servings,
            ingredients, instructions, tips, image_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    cur.executemany(insert_sql, updated_recipes)
    conn.commit()
    
    print(f"✨ 治理完成！")
    print(f"  · 清洗提纯食材字段: {polished_ing_count} 道菜")
    print(f"  · 平滑合并超短尾步: {smoothed_step_count} 道菜")
    print(f"  · 补正冷食/制作时间: {time_fixed_count} 道菜")
    print(f"  · 分类收敛为规范体系，数据库总菜谱数: {len(updated_recipes)} 道")
    
    conn.close()

if __name__ == '__main__':
    main()
