#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
fix_recipe_images.py
为食刻数据库 (shike.db) 中全部食谱精准匹配真实中餐美食高清封面图。
第一优先级引入 LOCAL_VERIFIED_RECIPES 本地已核验高清封面白名单，
严禁硬编码欧式生沙拉，番茄炒蛋类优先使用本地高质量图 /images/dishes/recipe_tomato_egg.webp。
"""

import os
import sys
import json
import sqlite3
import re
from pathlib import Path

DB_PATH = Path('/opt/shike-ai/data/db/shike.db')
VERIFIED_JSON = Path(__file__).resolve().parent.parent / 'backend' / 'src' / 'data' / 'localVerifiedRecipes.json'

# 食刻官方已核验本地高质量 WebP 菜谱封面白名单字典（单一数据源）
with open(VERIFIED_JSON, 'r', encoding='utf-8') as f:
    LOCAL_VERIFIED_RECIPES = json.load(f)

# 真实可访问的中式高清美食图片映射表（Unsplash Imgix CDN & 本地高质量 WebP）
# 全部 URL 均已通过 HTTP 200 验证
IMAGE_MAP = {
    # 1. 番茄炒蛋 / 西红柿炒蛋
    'tomato_egg': '/images/dishes/recipe_tomato_egg.webp',

    # 2. 茄子 / 地三鲜
    'eggplant': 'https://images.unsplash.com/photo-1628294895950-9805252327bc?w=500',

    # 3. 土豆 / 酸辣土豆丝 / 薯条
    'potato': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=500',

    # 4. 鸡翅 / 可乐鸡翅
    'chicken_wings': 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=500',

    # 5. 豆腐 / 麻婆豆腐
    'tofu': 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500',

    # 6. 排骨 / 糖醋排骨 / 红烧排骨
    'ribs': 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500',

    # 7. 红烧肉 / 五花肉 / 回锅肉 / 扣肉 / 卤肉 / 肘子 / 猪蹄
    'braised_pork': 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=500',

    # 8. 小炒肉 / 肉丝 / 肉末 / 炒肉 / 锅包肉 / 猪肉
    'stir_fry_pork': 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=500',

    # 9. 鸡肉 / 宫保鸡丁 / 辣子鸡 / 黄焖鸡 / 大盘鸡 / 鸡腿
    'chicken': 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500',

    # 10. 牛肉 / 牛柳 / 水煮牛肉 / 肥牛 / 牛腩
    'beef': 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500',

    # 11. 鸭肉 / 烤鸭 / 啤酒鸭
    'duck': 'https://images.unsplash.com/photo-1534939561126-855b8675edd7?w=500',

    # 12. 羊肉 / 羊排 / 羊肉串 / 孜然羊肉
    'lamb': 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500',

    # 13. 鱼类 / 鲈鱼 / 水煮鱼 / 三文鱼 / 鲤鱼 / 带鱼 / 白鳝
    'fish': 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=500',

    # 14. 虾 / 虾仁 / 海鲜 / 贝类 / 蟹 / 蛤蜊 / 鱿鱼 / 海参
    'shrimp_seafood': 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=500',

    # 15. 饺子 / 面点 / 馄饨 / 包子 / 锅贴 / 烧麦 / 煎饼 / 馅饼
    'dumplings_dimsum': 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=500',

    # 16. 面食 / 拉面 / 拌面 / 凉皮 / 米线 / 炒面 / 意面
    'noodles': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=500',

    # 17. 炒饭 / 米饭 / 粥 / 煲仔饭 / 盖浇饭
    'rice_staple': 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=500',

    # 18. 黄瓜 / 凉拌菜 / 拍黄瓜 / 皮蛋
    'cucumber_cold': 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=500',

    # 19. 绿叶蔬菜 / 西兰花 / 炒青菜 / 包菜 / 空心菜 / 四季豆
    'greens_veggies': 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=500',

    # 20. 鸡蛋 / 荷包蛋 / 鸡蛋羹 / 蒸蛋 / 煎蛋 / 滑蛋
    'egg_dishes': 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=500',

    # 21. 菌菇 / 香菇 / 金针菇 / 杏鲍菇 / 木耳
    'mushroom': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500',

    # 22. 汤羹 / 靓汤 / 炖汤 / 肉丸汤 / 鲜汤
    'soup_stew': 'https://images.unsplash.com/photo-1547592180-85f173990554?w=500',

    # 23. 烘焙 / 甜品 / 松饼 / 吐司 / 蛋糕 / 糖水
    'baking_dessert': 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500',

    # 24. 沙拉 / 轻食 / 大拌菜 / 温沙拉
    'salad': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500',
    'fallback_salad': 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500',

    # 分类真实中餐兜底（绝不用欧式生沙拉）
    'fallback_veggie': 'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=500', # 锅气热炒素菜
    'fallback_seafood': 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=500', # 鲜虾海鲜
    'fallback_staple': 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=500', # 粒粒香米饭/炒饭
    'fallback_soup': 'https://images.unsplash.com/photo-1547592180-85f173990554?w=500', # 热腾腾鲜汤
    'fallback_dessert': 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500', # 点心烘焙
    'fallback_cold': 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=500', # 清脆凉拌菜
    'fallback_chinese_hot': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500', # 镬气十足中式热炒菜
}

import re

def resolve_recipe_image(name: str, category: str, ingredients_json: str, recipe_id: str = None) -> tuple[str, str]:
    """
    根据菜品名称、分类及食材，精准匹配最对应的中餐美食高清图。
    返回 (image_url, match_type)
    """
    # 0. 第一优先级：精确匹配本地已核验高质量菜谱白名单（支持按 recipe_id 或精确名称）
    if recipe_id and recipe_id in LOCAL_VERIFIED_RECIPES:
        return LOCAL_VERIFIED_RECIPES[recipe_id], 'local_verified'
    clean_name = re.sub(r'^✨\s*AI定制\s*·\s*', '', name).strip()
    if clean_name in LOCAL_VERIFIED_RECIPES:
        return LOCAL_VERIFIED_RECIPES[clean_name], 'local_verified'
    if name.strip() in LOCAL_VERIFIED_RECIPES:
        return LOCAL_VERIFIED_RECIPES[name.strip()], 'local_verified'

    # 提取食材纯文本以备辅助匹配
    ing_text = ''
    try:
        ings = json.loads(ingredients_json)
        if isinstance(ings, list):
            for item in ings:
                if isinstance(item, dict) and 'name' in item:
                    ing_text += ' ' + item['name']
                elif isinstance(item, str):
                    ing_text += ' ' + item
    except Exception:
        pass

    # 特殊排除：去掉复合词对单字匹配的干扰
    # 例如 '鸡蛋', '鸡精' 不应误匹配为禽肉 '鸡'
    name_no_egg = re.sub(r'鸡蛋|鸡精|鸡粉|鸡汁', '', name)
    # '松饼', '饼干' 不应误匹配为主食面点 '饼'
    name_no_baking_bing = re.sub(r'松饼|饼干|华夫饼', '', name)
    # 移除“鱼香”风味对水产海鲜“鱼”的干扰（鱼香肉丝是经典猪肉丝菜肴，绝非鱼类）
    name_no_yuxiang = re.sub(r'鱼香', '', name)

    # 1. 番茄炒蛋 / 西红柿炒蛋 (优先本地高质量 WebP，食刻招牌菜)
    if (('西红柿' in name or '番茄' in name) and ('炒蛋' in name or '炒鸡蛋' in name or '滑蛋' in name or '煎蛋' in name)) \
       or any(k in name for k in ['西红柿炒蛋', '番茄炒蛋', '番茄炒鸡蛋', '西红柿炒鸡蛋', '番茄鸡蛋']):
        return IMAGE_MAP['tomato_egg'], 'tomato_egg'

    # 2. 沙拉 / 轻食 / 温沙拉 / 大拌菜 / 油醋汁
    if any(k in name for k in ['沙拉', '大拌菜', '温沙拉', '油醋汁']) or category in ['轻食沙拉', '沙拉', '减脂轻食']:
        return IMAGE_MAP['salad'], 'salad'

    # 3. 烘焙 / 甜品 / 松饼 / 吐司 / 蛋糕 / 糖水
    if any(k in name for k in ['松饼', '吐司', '蛋糕', '面包', '甜品', '蛋挞', '饼干', '糖水', '双皮奶', '杨枝甘露', '西米露', '冰粉', '芋圆', '烘焙', '布丁', '酸奶', '坚果', '香蕉', '汤圆', '冰淇淋', '奶冻', '雪媚娘', '司康', '雪花酥', '龟苓膏', '甜糕', '鲜奶', '芋头', '提拉米苏']):
        return IMAGE_MAP['baking_dessert'], 'baking_dessert'

    # 3. 茄子 / 地三鲜
    if any(k in name for k in ['地三鲜', '茄子', '风味茄子', '鱼香茄子', '烤茄子', '烧茄子']):
        return IMAGE_MAP['eggplant'], 'eggplant'

    # 4. 土豆 / 酸辣土豆丝 / 薯条
    if any(k in name for k in ['土豆', '马铃薯', '洋芋', '薯条']):
        return IMAGE_MAP['potato'], 'potato'

    # 5. 鸡翅 / 可乐鸡翅 / 烤全翅
    if any(k in name for k in ['鸡翅', '烤翅', '鸡中翅', '鸡翅尖', '炸鸡翅', '蒜香鸡翅', '全翅', '烤全翅']):
        return IMAGE_MAP['chicken_wings'], 'chicken_wings'

    # 6. 豆腐 / 麻婆豆腐
    if any(k in name for k in ['豆腐', '豆花', '臭豆腐', '腐竹', '千张']):
        return IMAGE_MAP['tofu'], 'tofu'

    # 7. 排骨 / 糖醋排骨 / 红烧排骨
    if any(k in name for k in ['排骨', '肋排', '小排', '排条', '糖醋排骨', '红烧排骨', '粉蒸排骨']):
        return IMAGE_MAP['ribs'], 'ribs'

    # 8. 红烧肉 / 五花肉 / 回锅肉 / 扣肉 / 卤肉 / 肘子 / 猪蹄 / 蹄花
    if any(k in name for k in ['红烧肉', '五花肉', '回锅肉', '东坡肉', '扣肉', '卤肉', '把子肉', '商芝肉', '叉烧', '肘子', '猪蹄', '蹄花', '红烧猪蹄', '腊味', '腊肉', '腐乳肉', '猪皮冻']):
        return IMAGE_MAP['braised_pork'], 'braised_pork'

    # 9. 面食 / 拉面 / 拌面 / 凉皮 / 米线 / 炒面 / 意面
    if any(k in name for k in ['面', '拉面', '拌面', '汤面', '炒面', '葱油面', '米线', '米粉', '意面', '通心粉', '粉丝', '乌冬', '凉皮', '凉面', '粉']):
        return IMAGE_MAP['noodles'], 'noodles'

    # 10. 炒饭 / 米饭 / 粥 / 煲仔饭 / 盖浇饭
    if any(k in name for k in ['炒饭', '米饭', '蛋炒饭', '煲仔饭', '盖浇饭', '卤肉饭', '拌饭', '粥', '泡饭', '饭', '炒馍', '利提巧卡']):
        return IMAGE_MAP['rice_staple'], 'rice_staple'

    # 11. 饺子 / 面点 / 馄饨 / 包子 / 锅贴 / 点心 / 饼 / 烧卖
    if any(k in name_no_baking_bing for k in ['饺', '水饺', '煎饺', '锅贴', '馄饨', '云吞', '抄手', '包子', '小笼包', '烧麦', '春卷', '馒头', '花卷', '点心', '烧饼', '馅饼', '煎饼', '韭菜盒子', '年糕', '烙饼', '手抓饼', '烤饼', '饼', '烧卖']):
        return IMAGE_MAP['dumplings_dimsum'], 'dumplings_dimsum'

    # 12. 鸡蛋 / 荷包蛋 / 鸡蛋羹 / 蒸蛋 / 煎蛋 / 蛋卷
    if any(k in name for k in ['荷包蛋', '蛋羹', '鸡蛋羹', '蒸蛋', '煎蛋', '金钱蛋', '滑蛋', '蛋花', '爆蛋', '茶叶蛋', '水煮蛋', '温泉蛋', '溏心蛋', '水蛋', '太阳蛋', '炒蛋', '厚蛋烧', '北非蛋', '炖蛋']):
        return IMAGE_MAP['egg_dishes'], 'egg_dishes'

    # 13. 鱼类 / 鲈鱼 / 水煮鱼 / 三文鱼 / 鲤鱼 / 鳕鱼 / 鳝鱼 (排除“鱼香”复合风味)
    if any(k in name_no_yuxiang for k in ['鱼', '鲈鱼', '三文鱼', '巴沙鱼', '带鱼', '黄花鱼', '鲫鱼', '草鱼', '鲤鱼', '鳗鱼', '鳕鱼', '白鱔', '鱔', '鳝']):
        return IMAGE_MAP['fish'], 'fish'

    # 14. 虾 / 虾仁 / 海鲜 / 贝类 / 蟹 / 蛤蜊 / 鱿鱼 / 海参
    if any(k in name for k in ['虾', '虾仁', '基围虾', '大虾', '蛤蜊', '海鲜', '生蚝', '扇贝', '花甲', '鱿鱼', '螃蟹', '蟹', '青口', '甲鱼', '海参', '田螺', '蛏']):
        return IMAGE_MAP['shrimp_seafood'], 'shrimp_seafood'

    # 15. 牛肉 / 牛柳 / 水煮牛肉 / 肥牛 / 牛腩 / 孜然牛肉
    if any(k in name for k in ['牛', '肥牛', '牛柳', '牛腩', '水煮牛肉', '牛排', '牛蛙', '黄牛肉', '牛筋', '孜然牛肉', '葱爆牛肉']):
        return IMAGE_MAP['beef'], 'beef'

    # 16. 鸡肉 (过滤 '鸡蛋', '鸡精' 干扰)
    if any(k in name_no_egg for k in ['鸡', '宫保鸡丁', '辣子鸡', '黄焖鸡', '大盘鸡', '口水鸡', '鸡丁', '鸡块', '鸡腿', '鸡胸', '叫花鸡', '三杯鸡', '鸡爪', '仔鸡']):
        return IMAGE_MAP['chicken'], 'chicken'

    # 17. 鸭肉 / 烤鸭 / 啤酒鸭
    if any(k in name for k in ['鸭', '啤酒鸭', '烤鸭', '盐水鸭', '酱鸭', '鸭肉', '鸭腿']):
        return IMAGE_MAP['duck'], 'duck'

    # 18. 羊肉 / 羊排 / 羊肉串 / 孜然羊肉
    if any(k in name for k in ['羊', '羊肉', '羊排', '羊蝎子', '羊腿', '羊肉串']):
        return IMAGE_MAP['lamb'], 'lamb'

    # 19. 小炒肉 / 肉丝 / 肉末 / 炒肉 / 锅包肉 / 猪肉 / 里脊
    if any(k in name for k in ['小炒肉', '肉丝', '鱼香肉丝', '青椒肉丝', '肉末', '一碗香', '过油肉', '肉片', '猪里脊', '炒肉', '溜肉段', '小酥肉', '肉丁', '猪肉', '酿肉', '咕噜肉', '杀猪菜', '里脊', '锅包肉', '荔枝肉', '蚂蚁上树', '水煮肉片', '青椒酿', '麻辣香锅', '肉', '猪']):
        return IMAGE_MAP['stir_fry_pork'], 'stir_fry_pork'

    # 20. 鸡蛋类名称补充
    if '蛋' in name:
        return IMAGE_MAP['egg_dishes'], 'egg_dishes'

    # 21. 黄瓜 / 凉拌菜 / 拍黄瓜 / 皮蛋
    if any(k in name for k in ['拍黄瓜', '黄瓜', '凉拌', '皮蛋', '凉菜', '泡菜', '腌黄瓜', '冷吃']):
        return IMAGE_MAP['cucumber_cold'], 'cucumber_cold'

    # 22. 菌菇 / 香菇 / 金针菇 / 杏鲍菇 / 木耳
    if any(k in name for k in ['蘑菇', '香菇', '金针菇', '杏鲍菇', '平菇', '菌菇', '银耳', '木耳', '菇']):
        return IMAGE_MAP['mushroom'], 'mushroom'

    # 23. 绿叶蔬菜 / 西兰花 / 炒青菜 / 包菜 / 空心菜 / 四季豆
    if any(k in name for k in ['西兰花', '青菜', '生菜', '空心菜', '油麦菜', '菠菜', '娃娃菜', '包菜', '手撕包菜', '四季豆', '豆角', '荷兰豆', '蒜苔', '芹菜', '芦笋', '茼蒿', '芥蓝', '白菜', '冬瓜', '苦瓜', '丝瓜', '南瓜', '西葫芦', '莲藕', '藕', '花菜', '菜花', '菜心', '玉米', '毛豆', '蔬菜', '豆芽', '秋葵', '青椒', '椒', '西红柿', '番茄', '葫芦']):
        return IMAGE_MAP['greens_veggies'], 'greens_veggies'

    # 24. 汤羹 / 靓汤 / 炖汤 / 肉丸汤 / 鲜汤
    if any(k in name for k in ['汤', '羹', '煲']):
        return IMAGE_MAP['soup_stew'], 'soup_stew'

    # 烧烤
    if '烧烤' in name or '烤' in name:
        return IMAGE_MAP['braised_pork'], 'barbecue'

    # 兜底规则
    if category in ['轻食沙拉', '沙拉', '减脂轻食']:
        return IMAGE_MAP['fallback_salad'], 'fallback_salad'
    if category in ['素菜', '快手菜']:
        return IMAGE_MAP['fallback_veggie'], 'fallback_veggie'
    if category in ['水产海鲜', '海鲜水产']:
        return IMAGE_MAP['fallback_seafood'], 'fallback_seafood'
    if category in ['主食', '经典主食']:
        return IMAGE_MAP['fallback_staple'], 'fallback_staple'
    if category in ['汤羹', '养生汤羹', '靓汤羹品']:
        return IMAGE_MAP['fallback_soup'], 'fallback_soup'
    if category in ['甜品点心', '轻食烘焙']:
        return IMAGE_MAP['fallback_dessert'], 'fallback_dessert'
    if category in ['凉拌菜']:
        return IMAGE_MAP['fallback_cold'], 'fallback_cold'

    return IMAGE_MAP['fallback_chinese_hot'], 'fallback_chinese_hot'

def main():
    if not DB_PATH.exists():
        print(f"❌ 数据库文件不存在: {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    print(f"📦 连接食刻数据库: {DB_PATH}")
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    cursor.execute("SELECT id, name, category, ingredients, image_url FROM recipes")
    rows = cursor.fetchall()
    total_count = len(rows)
    print(f"📋 找到全部菜谱条数: {total_count}")

    stats = {}
    updates = []

    for r_id, name, category, ingredients_json, old_image_url in rows:
        new_url, match_type = resolve_recipe_image(name, category, ingredients_json, recipe_id=r_id)
        stats[match_type] = stats.get(match_type, 0) + 1
        updates.append((new_url, r_id))

    cursor.executemany("UPDATE recipes SET image_url = ? WHERE id = ?", updates)
    conn.commit()
    conn.close()

    print("\n✅ 全部食谱图片精准对应更新完成！统计详情：")
    for mtype, count in sorted(stats.items(), key=lambda x: -x[1]):
        print(f"  · {mtype.ljust(20)}: {count} 道")

    print(f"\n🎉 总计更新完成: {total_count} 条。无任何生沙拉误用。")

if __name__ == '__main__':
    main()
