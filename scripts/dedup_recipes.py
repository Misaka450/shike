#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
dedup_recipes.py
对食刻数据库 (shike.db) 执行语义指纹去重与品质优选：
1. 计算每道菜品的核心语义指纹（去除形容修饰词与语序倒装）。
2. 在雷同组内按品质优选规则保留 1 道最优菜谱：
   - 优先级 1: 拥有本地已核验高质量 WebP (/images/dishes/...) 的菜谱（绝对保留）；
   - 优先级 2: 结构化程度高、步骤详实、无网络营销黑话的 HowToCook / 精选内置菜谱；
   - 优先级 3: 食材与用量最标准的版本。
3. 彻底删除组内其余换皮同质化冗余菜谱。
"""

import sqlite3
import re
import json
from collections import defaultdict
from pathlib import Path

DB_PATH = Path('/opt/shike-ai/data/db/shike.db')

def get_dish_fingerprint(name):
    # 去除括号及其中内容
    n = re.sub(r'【.*?】|\[.*?\]|（.*?）|\(.*?\)', '', name)
    # 去除前缀修饰
    n = re.sub(r'^(超简单|快手|好吃到哭|秘制|自制|私房|家常|巨好吃|绝绝子|减脂必备|懒人|香喷喷的|下饭的|超级下饭的|美味|简单|经典|正宗|特级|神仙|网红|一学就会|两步搞定的|美味的|风味|传统|鲜美|清脆|爽口|低卡|无油|减脂|必学|独家|特色|创新|手剥|粒粒|黄金|『.*?』|月子餐：|少油绝味|超级|清爽|夏日开胃菜\s*)+', '', n)
    # 去除后缀修饰
    n = re.sub(r'(的做法|的家常做法|简单做|超下饭|附万能蘸料|附酱汁|——.*|\d+人份|（减脂餐）|简单美味|内附酱汁做法)+$', '', n)
    n = n.strip(' !！~～,，。-_')

    # 核心经典菜语义映射表
    if re.search(r'肉末.*茄子|茄子.*肉末', n):
        return '肉末茄子'
    if re.search(r'拍.*黄瓜|黄瓜.*拍|凉拌.*黄瓜|黄瓜.*凉拌', n):
        return '凉拌拍黄瓜'
    if re.search(r'黄焖鸡', n):
        return '黄焖鸡'
    if re.search(r'油焖.*大虾|大虾.*油焖', n):
        return '油焖大虾'
    if re.search(r'可乐.*鸡翅', n):
        return '可乐鸡翅'
    if re.search(r'鱼香.*肉丝', n):
        return '鱼香肉丝'
    if re.search(r'鱼香.*茄子', n):
        return '鱼香茄子'
    if re.search(r'麻婆.*豆腐', n):
        return '麻婆豆腐'
    if re.search(r'青椒.*小炒肉|小炒肉', n):
        return '青椒小炒肉'
    if re.search(r'酸辣.*土豆丝|土豆丝', n) and '凉拌' not in n:
        return '酸辣土豆丝'
    if re.search(r'手撕.*包菜|干煸.*包菜|炒.*包菜', n):
        return '手撕包菜'
    if re.search(r'白灼.*虾', n):
        return '白灼基围虾'
    if re.search(r'蒜蓉.*西兰花|炒.*西兰花', n):
        return '蒜蓉西兰花'
    if re.search(r'糖醋.*排骨', n):
        return '糖醋排骨'
    if re.search(r'红烧.*排骨', n):
        return '红烧排骨'
    if re.search(r'红烧.*肉|东坡肉', n):
        return '红烧肉'
    if re.search(r'回锅肉', n):
        return '回锅肉'
    if re.search(r'番茄.*炒.*蛋|西红柿.*炒.*蛋|番茄.*炒.*鸡蛋|西红柿.*炒.*鸡蛋', n):
        return '西红柿炒鸡蛋'
    if re.search(r'西红柿.*蛋.*汤|番茄.*蛋.*汤', n):
        return '西红柿鸡蛋汤'
    if re.search(r'紫菜.*蛋.*汤', n):
        return '紫菜蛋花汤'
    if re.search(r'鲫鱼.*豆腐.*汤', n):
        return '鲫鱼豆腐汤'
    if re.search(r'排骨.*玉米.*汤|玉米.*排骨.*汤', n):
        return '玉米排骨汤'
    if re.search(r'凉拌.*木耳', n):
        return '凉拌木耳'
    if re.search(r'凉拌.*藕|炝拌.*藕', n):
        return '凉拌藕片'
    if re.search(r'凉拌.*莴笋', n):
        return '凉拌莴笋'
    if re.search(r'凉拌.*皮蛋|皮蛋.*拌.*豆腐', n):
        return '皮蛋拌豆腐'
    if re.search(r'清蒸.*鲈鱼', n):
        return '清蒸鲈鱼'
    if re.search(r'蒜蓉.*粉丝.*蒸.*虾|蒜蓉.*蒸.*虾', n):
        return '蒜蓉粉丝蒸虾'
    if re.search(r'香菇.*滑鸡|香菇.*蒸.*鸡', n):
        return '香菇滑鸡'
    if re.search(r'蒸.*肉饼', n):
        return '蒸肉饼'
    if re.search(r'金枪鱼.*沙拉', n):
        return '金枪鱼沙拉'
    if re.search(r'鸡胸.*沙拉', n):
        return '鸡胸肉沙拉'
    if re.search(r'牛油果.*沙拉', n):
        return '牛油果沙拉'
    if re.search(r'土豆泥.*沙拉', n):
        return '土豆泥沙拉'
    if re.search(r'蒜苔.*炒.*肉', n):
        return '蒜苔炒肉'
    if re.search(r'黄瓜.*炒.*肉', n):
        return '黄瓜炒肉'
    if re.search(r'地三鲜', n):
        return '地三鲜'
    if re.search(r'蚂蚁上树', n):
        return '蚂蚁上树'
    if re.search(r'蛋炒饭', n):
        return '蛋炒饭'
    if re.search(r'葱油.*面', n):
        return '葱油拌面'
    if re.search(r'蚝油.*生菜', n):
        return '蚝油生菜'
    if re.search(r'炒.*青菜', n):
        return '炒青菜'
    if re.search(r'烤.*茄子', n):
        return '烤茄子'
    if re.search(r'口水鸡', n):
        return '口水鸡'
    if re.search(r'水煮.*牛肉', n):
        return '水煮牛肉'
    if re.search(r'水煮.*肉片', n):
        return '水煮肉片'
    if re.search(r'西红柿.*牛腩|番茄.*牛腩', n):
        return '番茄炖牛腩'
    if re.search(r'土豆.*炖.*牛|牛.*炖.*土豆', n):
        return '土豆炖牛肉'
        
    return n

def calculate_quality_score(recipe):
    """
    计算菜谱品质分，用于在重复组中择优：
    - 拥有本地已核验 WebP 封面: +1000 分
    - 内置经典菜谱 (recipe-* 但非 recipe-htc / recipe-xcf): +500 分
    - HowToCook 精准量化菜谱 (recipe-htc-*): +300 分
    - 步骤字数详实、无占位符残缺: +10~50 分
    - 带有“~2个”、“个茄子”等残缺字符: -100 分
    """
    rid, name, cat, img, ings_json, inst_json = recipe
    score = 0
    
    # 1. 图片品质权重
    if img and img.startswith('/images/dishes/'):
        score += 1000
    elif img and img.startswith('/images/'):
        score += 800
        
    # 2. 来源规范权重
    if not rid.startswith('recipe-htc-') and not rid.startswith('recipe-xcf-') and not rid.startswith('ai-recipe-'):
        score += 500
    elif rid.startswith('recipe-htc-'):
        score += 300
    
    # 3. 菜名纯净度（越短、越少花哨词越正宗）
    if len(name) <= 6:
        score += 50
    elif len(name) > 10:
        score -= 30
        
    # 4. 食材解析质量（识别出明显残缺的打低分）
    try:
        ings = json.loads(ings_json)
        for i in ings:
            n = i.get('name', '')
            # 类似 '个茄子', '克肉末', '瓣蒜' 这种前缀丢失的脏数据
            if re.match(r'^(个|克|瓣|根|只|勺|碗|包|盒)[a-zA-Z\u4e00-\u9fa5]+', n):
                score -= 40
            if '~' in n:
                score -= 20
    except:
        pass
        
    # 5. 步骤详实度
    try:
        insts = json.loads(inst_json)
        total_len = sum(len(s) for s in insts)
        if 80 <= total_len <= 300:
            score += 30
    except:
        pass

    return score

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, category, image_url, ingredients, instructions FROM recipes")
    all_recipes = cursor.fetchall()
    
    total_before = len(all_recipes)
    print(f"📦 启动前数据库菜谱总数: {total_before}")
    
    groups = defaultdict(list)
    for r in all_recipes:
        fp = get_dish_fingerprint(r[1])
        groups[fp].append(r)
        
    dup_groups = {k: v for k, v in groups.items() if len(v) > 1}
    print(f"🔍 识别到 {len(dup_groups)} 个同质化菜谱组。")
    
    to_delete_ids = []
    retained_details = []
    
    for fp, items in dup_groups.items():
        # 按品质分从高到低排序
        items.sort(key=calculate_quality_score, reverse=True)
        winner = items[0]
        losers = items[1:]
        
        retained_details.append({
            'group': fp,
            'winner': f"{winner[1]} ({winner[0]}) [图: {winner[3][:40]}...]",
            'removed': [f"{x[1]} ({x[0]})" for x in losers]
        })
        
        for x in losers:
            to_delete_ids.append(x[0])
            
    print(f"\n✂️ 即将彻底清理剔除 {len(to_delete_ids)} 道多余冗余菜谱...")
    
    cursor.executemany("DELETE FROM recipes WHERE id = ?", [(rid,) for rid in to_delete_ids])
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM recipes")
    total_after = cursor.fetchone()[0]
    print(f"🎉 语义去重完成！数据库菜谱总数由 {total_before} 精简至 {total_after} 道（已根除 {total_before - total_after} 道重复项）。")
    
    print("\n--- 代表性去重保留示范 ---")
    for item in retained_details[:10]:
        print(f"【{item['group']}】")
        print(f"  ✅ 最优保留: {item['winner']}")
        print(f"  🗑️ 已合并删除: {', '.join(item['removed'])}")
        
    conn.close()

if __name__ == '__main__':
    main()
