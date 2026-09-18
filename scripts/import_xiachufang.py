#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
import_xiachufang.py
从下厨房 150 万真实食谱语料库中精选 300~500 道高质量、高结构化家常食谱并导入食刻数据库。
重点补齐：轻食沙拉、爽口凉拌、健康蒸菜、快手滚汤、家常下饭炒菜。
"""

import os
import sys
import json
import re
import hashlib
import zipfile
import sqlite3
from pathlib import Path
from datetime import datetime

ZIP_PATH = Path('/tmp/recipe_corpus_finetune.zip')
DB_PATH = Path('/opt/shike-ai/data/db/shike.db')

# 调味品佐料关键词（用于标记 required=false）
SEASONING_KEYWORDS = set([
    '盐', '食盐', '细盐', '糖', '白糖', '白砂糖', '冰糖', '红糖',
    '生抽', '老抽', '酱油', '味极鲜', '料酒', '黄酒', '白酒', '蒸鱼豉油',
    '油', '食用油', '植物油', '花生油', '菜籽油', '玉米油', '大豆油', '芝麻油', '香油', '橄榄油', '猪油',
    '蚝油', '耗油', '醋', '香醋', '陈醋', '白醋', '米醋', '油醋汁',
    '胡椒', '黑胡椒', '白胡椒', '胡椒粉', '花椒', '花椒粉', '花椒油', '麻油',
    '鸡精', '味精', '蔬之鲜',
    '淀粉', '生粉', '玉米淀粉', '土豆淀粉', '水淀粉',
    '葱', '大葱', '小葱', '葱花', '葱段', '姜', '生姜', '老姜', '姜片', '姜末', '姜丝',
    '蒜', '大蒜', '蒜瓣', '蒜泥', '蒜末',
    '辣椒粉', '干辣椒', '辣椒干', '小米椒', '小米辣', '熟芝麻', '白芝麻',
    '八角', '桂皮', '香叶', '水', '清水', '温水', '开水', '高汤'
])

# 常用度量单位
UNITS = r'(?:克|g|kg|千克|斤|两|ml|毫升|升|l|个|只|根|块|片|条|段|瓣|把|勺|匙|茶匙|汤匙|大勺|小勺|碗|盒|罐|包|袋|枚|颗|粒|头|支|张|适量|少许|若干)'

def parse_ingredient(raw_str):
    raw = raw_str.strip()
    # 清除前后多余标点
    raw = re.sub(r'^[·\-\*\+•\s]+', '', raw)
    
    # 模式 A: "食材 数量" 或 "食材: 数量"
    m_split = re.split(r'[\s:：=\t]+', raw, maxsplit=1)
    if len(m_split) == 2 and m_split[0] and m_split[1]:
        part1, part2 = m_split[0].strip(), m_split[1].strip()
        # 判断哪部分是数量，哪部分是名称
        if re.search(r'[\d一二三四五六七八九十两半适量少许]', part2):
            name, amt = part1, part2
        elif re.search(r'[\d一二三四五六七八九十两半适量少许]', part1):
            name, amt = part2, part1
        else:
            name, amt = part1, part2
        return clean_name(name), clean_amt(amt)
    
    # 模式 B: 前置数量 "300克对虾", "2个鸡蛋", "半根黄瓜", "适量盐"
    m_prefix = re.match(r'^([约大约共需\d½¼⅛\.~至\-]+' + UNITS + r'*|[一二三四五六七八九十两半几适量少许若干]+' + UNITS + r'*)(.+)$', raw)
    if m_prefix:
        amt, name = m_prefix.group(1).strip(), m_prefix.group(2).strip()
        if len(name) >= 1:
            return clean_name(name), clean_amt(amt)
            
    # 模式 C: 后置数量 "对虾300克", "鸡蛋2个", "盐少许"
    m_suffix = re.match(r'^(.+?)([\d½¼⅛\.~至\-]+' + UNITS + r'+|[一二三四五六七八九十两半几适量少许若干]+' + UNITS + r'+|适量|少许|若干)$', raw)
    if m_suffix:
        name, amt = m_suffix.group(1).strip(), m_suffix.group(2).strip()
        if len(name) >= 1:
            return clean_name(name), clean_amt(amt)

    return clean_name(raw), '适量'

def clean_name(name):
    name = re.sub(r'[\(（].*?[\)）]', '', name)
    name = re.sub(r'^[0-9\.\s]+', '', name)
    name = name.strip('*#_ \t')
    return name

def clean_amt(amt):
    amt = amt.strip('*#_ \t()（）')
    return amt if amt else '适量'

def clean_dish_name(name, dish):
    # 过滤花哨的前缀后缀，如 "快手简单！西班牙金枪鱼沙拉【附独家酱汁】" -> "西班牙金枪鱼沙拉"
    clean = re.sub(r'【.*?】|\[.*?\]|（.*?）|\(.*?\)', '', name)
    clean = re.sub(r'^(超简单|快手|好吃到哭|秘制|自制|私房|家常|巨好吃|绝绝子|减脂必备|懒人|香喷喷的|烹饪\s*\|\s*)+', '', clean)
    clean = re.sub(r'(的做法|的家常做法|简单做|超下饭|附万能蘸料|附酱汁|——.*|\d+人份)+$', '', clean)
    clean = clean.strip(' !！~～,，。-_')
    
    # 如果清洗后名字太长(>12字)，且 dish 字段有效且不为 Unknown，则优先用 dish
    if len(clean) > 12 and dish and dish != 'Unknown' and len(dish) <= 10:
        return dish.strip()
    if len(clean) < 2 and dish and dish != 'Unknown':
        return dish.strip()
    return clean if clean else (dish if dish != 'Unknown' else name)

# 分类规则
TARGET_CATEGORIES = {
    '轻食沙拉': {
        'keywords': ['沙拉', '油醋汁', '大拌菜', '温沙拉', '轻食碗', '鸡胸肉沙拉', '减脂沙拉', '金枪鱼沙拉', '土豆泥沙拉', '牛油果沙拉', '三明治'],
        'exclude': ['色拉油', '面团', '烘焙', '酥', '蛋糕', '月饼', '饼干'],
        'cuisine': '西餐轻食',
        'target_count': 90
    },
    '凉拌菜': {
        'keywords': ['凉拌', '拌黄瓜', '拍黄瓜', '拌木耳', '口水鸡', '手撕鸡', '捞汁', '麻酱拌', '老醋', '红油百叶', '爽口黄瓜', '拌腐竹', '蒜泥白肉'],
        'cuisine': '经典凉菜',
        'target_count': 90
    },
    '少油蒸菜': {
        'keywords': ['蒸鲈鱼', '蒸鳕鱼', '蒸鱼', '蒸肉饼', '蒸蛋', '蒸排骨', '蒸滑鸡', '清蒸', '蒜蓉粉丝蒸', '酿香菇', '粉蒸肉', '蒸娃娃菜', '蒸南瓜'],
        'cuisine': '粤菜家常',
        'target_count': 75
    },
    '快手滚汤': {
        'keywords': ['蛋花汤', '生滚汤', '肥牛汤', '丸子汤', '酸辣汤', '萝卜汤', '菌菇汤', '丝瓜汤', '豆腐汤', '裙带菜汤', '西红柿蛋汤', '蛤蜊汤'],
        'cuisine': '养生汤羹',
        'target_count': 75
    },
    '家常菜': {
        'keywords': ['小炒', '炒肉', '肉末', '酸豆角', '干豆腐', '木须肉', '荷塘小炒', '手撕包菜', '花菜', '农家', '腊肉', '滑蛋牛肉', '西红柿炒蛋', '宫保', '黑椒牛肉'],
        'cuisine': '中餐',
        'target_count': 90
    }
}

def main():
    if not ZIP_PATH.exists():
        print(f"Error: {ZIP_PATH} not found.")
        sys.exit(1)
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM recipes")
    existing_names = set(r[0] for r in cursor.fetchall())
    print(f"当前数据库已有食谱数: {len(existing_names)}")
    
    # 动态导入选图工具
    sys.path.append('/opt/shike-ai/backend/src/utils')
    from fix_recipe_images import resolve_recipe_image
    
    collected_by_cat = {k: [] for k in TARGET_CATEGORIES}
    seen_names = set(existing_names)
    
    print("开始从下厨房语料库中清洗筛选目标食谱...")
    with zipfile.ZipFile(ZIP_PATH, 'r') as z:
        with z.open('recipe_corpus_finetune.json') as f:
            total_lines = 0
            for line in f:
                total_lines += 1
                try:
                    data = json.loads(line.decode('utf-8'))
                except:
                    continue
                
                raw_name = data.get('name', '').strip()
                dish = data.get('dish', '').strip()
                raw_ings = data.get('recipeIngredient', [])
                raw_steps = data.get('recipeInstructions', [])
                
                # 质量过滤准则
                if not raw_name or len(raw_ings) < 3 or len(raw_steps) < 2:
                    continue
                # 步骤字数太少视为水数据
                if sum(len(s) for s in raw_steps) < 25:
                    continue
                    
                name = clean_dish_name(raw_name, dish)
                if not name or len(name) < 2 or len(name) > 16:
                    continue
                if name in seen_names:
                    continue
                
                # 匹配目标分类
                matched_cat = None
                for cat, conf in TARGET_CATEGORIES.items():
                    if len(collected_by_cat[cat]) >= conf['target_count']:
                        continue
                    if 'exclude' in conf and any(ex in name for ex in conf['exclude']):
                        continue
                    if any(kw in name or (dish != 'Unknown' and kw in dish) or any(kw in k for k in data.get('keywords', [])) for kw in conf['keywords']):
                        matched_cat = cat
                        break
                        
                if not matched_cat:
                    continue
                
                # 结构化食材
                ingredients = []
                for item in raw_ings:
                    ing_name, ing_amt = parse_ingredient(item)
                    if not ing_name or len(ing_name) > 15:
                        continue
                    is_seasoning = any(sk in ing_name for sk in SEASONING_KEYWORDS)
                    ingredients.append({
                        'name': ing_name,
                        'amount': ing_amt,
                        'required': not is_seasoning
                    })
                
                # 必须至少有 1 个主食材
                if not any(i['required'] for i in ingredients) or len(ingredients) < 3:
                    continue
                    
                # 清洗步骤
                instructions = [re.sub(r'^\d+[\.、\s]+', '', s).strip() for s in raw_steps if s.strip()]
                if len(instructions) < 2:
                    continue
                    
                # 估算耗时
                prep_time = 5
                cook_time = 10
                if matched_cat == '少油蒸菜':
                    cook_time = 15
                elif matched_cat == '快手滚汤':
                    cook_time = 10
                elif matched_cat == '凉拌菜':
                    prep_time = 8
                    cook_time = 2
                elif matched_cat == '轻食沙拉':
                    prep_time = 10
                    cook_time = 5
                
                recipe_id = f"recipe-xcf-{hashlib.md5(name.encode('utf-8')).hexdigest()[:10]}"
                cuisine = TARGET_CATEGORIES[matched_cat]['cuisine']
                tips = data.get('description', '').strip()
                if not tips:
                    tips = f"精选自下厨房经典好评做法，掌握火候与调味比例风味更佳。"
                elif len(tips) > 150:
                    tips = tips[:145] + '...'
                    
                image_url, match_type = resolve_recipe_image(name, matched_cat, json.dumps(ingredients), recipe_id)
                
                recipe_obj = {
                    'id': recipe_id,
                    'name': name,
                    'category': matched_cat,
                    'cuisine': cuisine,
                    'difficulty': '简单' if len(instructions) <= 4 else '中等',
                    'prep_time': prep_time,
                    'cook_time': cook_time,
                    'servings': 2,
                    'ingredients': ingredients,
                    'instructions': instructions,
                    'tips': tips,
                    'image_url': image_url,
                    'created_at': datetime.now().isoformat()
                }
                
                collected_by_cat[matched_cat].append(recipe_obj)
                seen_names.add(name)
                
                # 检查是否全部收齐
                if all(len(collected_by_cat[c]) >= TARGET_CATEGORIES[c]['target_count'] for c in TARGET_CATEGORIES):
                    print(f"已全部达标收齐目标数量！扫描行数: {total_lines}")
                    break

    # 统计与写入
    total_new = sum(len(v) for v in collected_by_cat.values())
    print(f"\n清洗筛选完成，共获得优质食谱 {total_new} 道：")
    for cat, items in collected_by_cat.items():
        print(f"  · {cat}: {len(items)} 道")
        
    insert_sql = """
    INSERT OR IGNORE INTO recipes (
        id, name, category, cuisine, difficulty, prep_time, cook_time,
        servings, ingredients, instructions, tips, image_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    
    insert_data = []
    for cat, items in collected_by_cat.items():
        for r in items:
            insert_data.append((
                r['id'], r['name'], r['category'], r['cuisine'], r['difficulty'],
                r['prep_time'], r['cook_time'], r['servings'],
                json.dumps(r['ingredients'], ensure_ascii=False),
                json.dumps(r['instructions'], ensure_ascii=False),
                r['tips'], r['image_url'], r['created_at']
            ))
            
    cursor.executemany(insert_sql, insert_data)
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM recipes")
    final_count = cursor.fetchone()[0]
    print(f"\n🎉 成功写入食刻数据库！全库食谱总量由 {len(existing_names)} 增至 {final_count} 道（净增 {final_count - len(existing_names)} 道）。")
    conn.close()

if __name__ == '__main__':
    main()
