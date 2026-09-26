#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
recipe_governance.py
食刻菜谱数据库质量治理改进实施脚本：
1. 清洗菜名中的换行控制符、多余空格、成语前缀、引流废话，去重'凯撒沙拉'；
2. 剔除食材中的器具词（搅拌机、密封袋、打蛋器等），修复截断食材，拆解复合词'葱姜蒜'；
3. 剥离步骤中的外链URL、引流文字、'第一步：'等机械前缀，修复断句；
4. 激活本地 public/images/dishes/ 目录下所有已存在的高清 WebP 本地封面；
5. 纠偏烹饪时间异常（如煮泡面220分钟、皮冻1420分钟，将冷藏/浸泡时间从 cook_time 移入 prep_time，快手菜5-30分钟，炖煮焖菜30-90分钟）；
6. 标准化 Category 与 Cuisine；
7. 校准核心主料 required: true，调味料 required: false。
"""

import os
import re
import json
import sqlite3
from pathlib import Path

DB_PATH = Path('/opt/shike-ai/data/db/shike.db')
DISHES_DIR = Path('/opt/shike-ai/frontend/public/images/dishes')

# 器具/容器/杂质黑名单（纯工具条目将被彻底剔除）
UTENSIL_BLACKLIST = {
    '搅拌机', '密封袋', '打蛋器', '破壁机', '料理机', '榨汁机', '空气炸锅',
    '烤箱', '微波炉', '保鲜膜', '保鲜袋', '铝箔纸', '锡纸', '烘焙纸',
    '刮刀', '电子秤', '量勺', '模具', '冰淇淋模具', '筷子或牙签', '牙签',
    '煲汤盅', '小铁盆', '筛网', '纸杯', '厨房纸', '厨房纸巾', '按', 'g',
    '片', '【主材】', '【辅材】', '【调料】', '【主料】', '【配料】', '【酱汁】',
    '主料', '辅料', '调料', '食材如图', '适量', '少许'
}

# 调味料黑名单（一律 required: false）
SEASONINGS = {
    '盐', '食盐', '细盐', '粗盐', '白糖', '糖', '冰糖', '红糖', '生抽', '老抽',
    '酱油', '生抽酱油', '老抽酱油', '料酒', '黄酒', '绍兴黄酒', '花雕酒', '料酒黄酒',
    '蚝油', '香醋', '米醋', '白醋', '陈醋', '镇江香醋', '康乐醋', '香醋米醋',
    '鸡精', '味精', '鲜味汁', '蒸鱼豉油', '白胡椒粉', '黑胡椒粉', '黑胡椒碎',
    '胡椒粉', '白胡椒', '黑胡椒', '花椒粉', '花椒面', '十三香', '五香粉',
    '香油', '芝麻油', '花椒油', '辣椒油', '红油', '淀粉', '生粉', '玉米淀粉',
    '土豆淀粉', '红薯淀粉', '水淀粉', '食用油', '花生油', '大豆油', '色拉油',
    '植物油', '花椒', '八角', '大料', '桂皮', '香叶', '草果', '丁香',
    '豆瓣酱', '郫县豆瓣酱', '黄豆酱', '甜面酱', '甜面酱豆瓣酱', '蒜蓉辣酱',
    '番茄酱', '番茄沙司', '沙拉酱', '千岛酱', '油醋汁', '芥末', '青芥辣',
    '熟芝麻', '熟白芝麻', '白芝麻', '黑芝麻', '小葱', '大葱', '葱', '大蒜',
    '蒜', '生姜', '姜', '蒜末', '姜末', '葱花', '姜丝', '蒜片', '葱白',
    '干辣椒', '辣椒段', '小米辣', '小尖椒', '泡椒', '五香', '孜然', '孜然粉',
    '孜然粒', '咖喱粉', '咖喱块', '白芝麻粒', '橄榄油', '猪油', '黄油', '黄油块',
    '泡打粉', '小苏打', '酵母', '干酵母', '枸杞', '食盐适量', '少许盐', '适量生抽'
}

# 核心主料清单（必定 required: true）
CORE_MAINS = {
    '西红柿', '番茄', '鸡蛋', '黄瓜', '猪里脊', '黑木耳', '木耳', '胡萝卜',
    '五花肉', '猪五花肉', '青椒', '嫩豆腐', '老豆腐', '豆腐', '土豆', '茄子',
    '西兰花', '鸡翅', '鸡中翅', '排骨', '猪小排', '三文鱼', '基围虾', '大虾',
    '鲜虾', '虾仁', '包菜', '圆白菜', '牛肉', '牛里脊', '肥牛', '牛腩',
    '鲈鱼', '鲈鱼一条', '鸡胸肉', '鸡肉', '鸡腿', '鸡大腿', '鸭肉', '水鸭',
    '羊肉', '羊排', '鲫鱼', '草鱼', '鲤鱼', '带鱼', '花蛤', '蛤蜊', '白蛤',
    '生蚝', '扇贝', '香蕉', '吐司', '白吐司', '全麦吐司', '面包', '面条',
    '意面', '意大利面', '面', '挂面', '米饭', '大米', '燕麦', '青稞', '藜麦',
    '金针菇', '香菇', '口蘑', '白玉菇', '杏鲍菇', '牛肉末', '猪肉末', '肉末',
    '肉丝', '猪肉', '豆角', '豇豆', '芹菜', '菠菜', '油菜', '生菜', '娃娃菜',
    '大白菜', '白菜', '冬瓜', '南瓜', '苦瓜', '丝瓜', '黄瓜片', '粉丝',
    '红薯粉', '宽粉', '腐竹', '千张', '豆腐皮', '豆干', '毛豆', '荷兰豆',
    '山药', '莲藕', '藕', '白萝卜', '青萝卜', '粉丝一把', '龙口粉丝', '咸鸭蛋',
    '皮蛋', '松花蛋', '金枪鱼', '油浸金枪鱼', '牛油果', '章鱼', '章鱼烧', '肉饼',
    '培根', '火腿', '香肠', '腊肉', '墨鱼', '鱿鱼', '田螺', '羊肉卷', '肥牛卷'
}

# 分类标准化映射
CATEGORY_MAP = {
    '川菜': '家常菜',
    '湘菜': '家常菜',
    '东北菜': '家常菜',
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
    '粤菜靓汤': '粤菜',
    '快手蒸菜': '粤菜',
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
    '家常靓汤': '中餐',
    '家常素汤': '中餐',
    '家常蒸菜': '中餐',
    '沿海家常': '中餐',
    '快手轻食': '西餐轻食',
    '快手早餐': '中餐',
    '快手主食': '中餐',
    '北方家常': '中餐',
    '经典凉菜': '中餐',
    '养生汤羹': '中餐',
}

# 本地 WebP 封面映射 (精确 ID 映射)
LOCAL_WEBP_IMAGE_MAP = {
    'recipe-tomato-egg': '/images/dishes/recipe_tomato_egg.webp',
    'recipe-yuxiang-pork': '/images/dishes/recipe_yuxiang_pork.webp',
    'recipe-pepper-pork': '/images/dishes/recipe_pepper_pork.webp',
    'recipe-mapo-tofu': '/images/dishes/recipe_mapo_tofu.webp',
    'recipe-di-san-xian': '/images/dishes/recipe_di_san_xian.webp',
    'recipe-garlic-broccoli': '/images/dishes/recipe_garlic_broccoli.webp',
    'recipe-cola-wings': '/images/dishes/recipe_cola_wings.webp',
    'recipe-pan-seared-salmon': '/images/dishes/recipe_pan_seared_salmon.webp',
    'recipe-steamed-shrimp': '/images/dishes/recipe_steamed_shrimp.webp',
    'recipe-garlic-steamed-shrimp': '/images/dishes/recipe_garlic_steamed_shrimp.webp',
    'recipe-potato-shreds': '/images/dishes/recipe_potato_shreds.webp',
    'recipe-cabbage-stir-fry': '/images/dishes/recipe_cabbage_stir_fry.webp',
    'recipe-pork-eggplant': '/images/dishes/recipe_pork_eggplant.webp',
    'recipe-sweet-sour-ribs': '/images/dishes/recipe_sweet_sour_ribs.webp',
    'recipe-corn-ribs-soup': '/images/dishes/recipe_corn_ribs_soup.webp',
    'recipe-egg-drop-soup': '/images/dishes/recipe_egg_drop_soup.webp',
    'recipe-banana-yogurt-bowl': '/images/dishes/recipe_banana_yogurt_bowl.webp',
    'recipe-beef-tomato-soup': '/images/dishes/recipe_tomato_beef_soup.webp',
    'recipe-century-egg-tofu': '/images/dishes/recipe_pidan_tofu.webp',
    'recipe-kung-pao-chicken': '/images/dishes/recipe_gongbao_chicken.webp',
    'recipe-scallion-oil-noodles': '/images/dishes/recipe_congyou_mian.webp',
    'recipe-steamed-seabass': '/images/dishes/recipe_steamed_perch.webp',
    'recipe-clam-steamed-egg': '/images/dishes/recipe_steamed_egg.webp',
    'recipe-garlic-sprout-pork': '/images/dishes/suantai_chaorou.webp',
    'recipe-htc-8402a0fbca': '/images/dishes/recipe_htc_8402a0fbca.webp',
    'recipe-htc-0cc027f236': '/images/dishes/recipe_htc_0cc027f236.webp',
    'recipe-htc-083a15958b': '/images/dishes/recipe_htc_083a15958b_v2.webp',
    'recipe-htc-4b2beca30f': '/images/dishes/recipe_htc_4b2beca30f.webp',
    'recipe-htc-b80cf09bf6': '/images/dishes/recipe_htc_b80cf09bf6.webp',
    'recipe-htc-5d3159e46a': '/images/dishes/recipe_htc_5d3159e46a.webp',
    'recipe-htc-e4e758f6e2': '/images/dishes/recipe_shoupa_pork.webp',
    'recipe-htc-7df101a70c': '/images/dishes/recipe_shuizhu_beef.webp',
    'recipe-htc-cf1fc7155b': '/images/dishes/recipe_pidan_tofu.webp',
    'recipe-htc-d2ffc32146': '/images/dishes/recipe_steamed_egg.webp',
    'recipe-htc-d3a0bb2911': '/images/dishes/recipe_egg_drop_soup.webp',
    'recipe-xcf-7e3525c959': '/images/dishes/recipe_steamed_pork_patty.webp',
    'recipe-xcf-ba9c51aaa9': '/images/dishes/recipe_tuna_salad.webp',
    'recipe-xcf-eded3b8204': '/images/dishes/recipe_avocado_salad.webp',
    'recipe-xcf-74343c76ab': '/images/dishes/recipe_chicken_quinoa_salad.webp',
}

# 特定菜名直接匹配本地 WebP
NAME_TO_WEBP_MAP = {
    '西红柿炒鸡蛋': '/images/dishes/recipe_tomato_egg.webp',
    '鱼香肉丝': '/images/dishes/recipe_yuxiang_pork.webp',
    '青椒小炒肉': '/images/dishes/recipe_pepper_pork.webp',
    '麻婆豆腐': '/images/dishes/recipe_mapo_tofu.webp',
    '地三鲜': '/images/dishes/recipe_di_san_xian.webp',
    '蒜蓉西兰花': '/images/dishes/recipe_garlic_broccoli.webp',
    '可乐鸡翅': '/images/dishes/recipe_cola_wings.webp',
    '香煎黑椒三文鱼': '/images/dishes/recipe_pan_seared_salmon.webp',
    '白灼基围虾': '/images/dishes/recipe_steamed_shrimp.webp',
    '蒜蓉粉丝蒸大虾': '/images/dishes/recipe_garlic_steamed_shrimp.webp',
    '酸辣土豆丝': '/images/dishes/recipe_potato_shreds.webp',
    '手撕包菜': '/images/dishes/recipe_cabbage_stir_fry.webp',
    '肉末风味茄子': '/images/dishes/recipe_pork_eggplant.webp',
    '糖醋排骨': '/images/dishes/recipe_sweet_sour_ribs.webp',
    '玉米山药排骨汤': '/images/dishes/recipe_corn_ribs_soup.webp',
    '西红柿紫菜蛋花汤': '/images/dishes/recipe_egg_drop_soup.webp',
    '香蕉坚果酸奶碗': '/images/dishes/recipe_banana_yogurt_bowl.webp',
    '番茄金针菇肥牛汤': '/images/dishes/recipe_tomato_beef_soup.webp',
    '皮蛋拌豆腐': '/images/dishes/recipe_pidan_tofu.webp',
    '皮蛋豆腐': '/images/dishes/recipe_pidan_tofu.webp',
    '宫保鸡丁': '/images/dishes/recipe_gongbao_chicken.webp',
    '葱油拌面': '/images/dishes/recipe_congyou_mian.webp',
    '清蒸鲈鱼': '/images/dishes/recipe_steamed_perch.webp',
    '回锅肉': '/images/dishes/recipe_shoupa_pork.webp',
    '水煮牛肉': '/images/dishes/recipe_shuizhu_beef.webp',
    '西班牙金枪鱼沙拉': '/images/dishes/recipe_tuna_salad.webp',
    '牛油果时蔬沙拉': '/images/dishes/recipe_avocado_salad.webp',
    '减脂鸡胸肉青稞沙拉': '/images/dishes/recipe_chicken_quinoa_salad.webp',
    '鸡胸肉青稞沙拉': '/images/dishes/recipe_chicken_quinoa_salad.webp',
    '鲜滑水蒸蛋': '/images/dishes/recipe_steamed_egg.webp',
    '蒸水蛋': '/images/dishes/recipe_steamed_egg.webp',
    '鸡蛋羹': '/images/dishes/recipe_steamed_egg.webp',
    '蛤蜊蒸蛋': '/images/dishes/recipe_steamed_egg.webp',
    '顺德头菜蒸肉饼': '/images/dishes/recipe_steamed_pork_patty.webp',
    '蒸肉饼': '/images/dishes/recipe_steamed_pork_patty.webp',
    '茄子炖土豆': '/images/dishes/recipe_htc_083a15958b_v2.webp',
    '黄瓜炒肉': '/images/dishes/recipe_htc_0cc027f236.webp',
    '红烧鲤鱼': '/images/dishes/recipe_htc_4b2beca30f.webp',
    '桂林十八酿': '/images/dishes/recipe_htc_5d3159e46a.webp',
    '蚂蚁上树': '/images/dishes/recipe_htc_8402a0fbca.webp',
    '蒜苔炒肉末': '/images/dishes/recipe_htc_b80cf09bf6.webp',
    '蒜苔炒肉丝': '/images/dishes/suantai_chaorou.webp',
}

# 菜名具体清洗映射
EXACT_NAME_REPLACEMENTS = {
    '外焦里嫩家常豆腐': '家常豆腐',
    '手撕手剥包菜': '手撕包菜',
    '让身体更轻盈的瘦身沙拉1': '轻盈蔬菜沙拉',
    '《深夜食堂》土豆沙拉': '日式土豆沙拉',
    '轻食沙拉系列': '综合轻食沙拉',
    '夏天就要吃凉菜，清爽解腻': '凉拌鲜白蛤',
    '好吃不胖快手凉拌菠菜粉丝': '凉拌菠菜粉丝',
    '酸甜可口的凉拌鸭脚': '酸辣凉拌鸭掌',
    '又好吃的凉拌儿菜': '凉拌儿菜',
    '蒸蛋糕\n': '蒸蛋糕',
    '鲜甜美味的蛤蜊丝瓜汤': '蛤蜊丝瓜汤',
    '百变开胃酸辣汤': '酸辣汤',
    '最营养的羊肉山药胡萝卜汤': '羊肉山药胡萝卜汤',
    '助消化瘦身有机酸菜豆腐汤': '酸菜豆腐汤',
    '酥脆炸鸡块？': '香酥炸鸡块',
    '超快手家常豇豆炒肉': '豇豆炒肉',
    '超级下饭菜：毛豆炒肉': '毛豆炒肉',
    '菠菜核桃仁 养生菜健身餐': '菠菜拌核桃仁',
    '各种维C沙拉＋章鱼烧': '维C时蔬沙拉',
    '得到爸爸真传的川味粉蒸肉': '川味粉蒸肉',
    '版豆豉鱼蒸排骨': '豆豉鱼蒸排骨',
    '不加油的豆豉剁椒蒸排骨': '豆豉剁椒蒸排骨',
    '超级拌饭三丁炒肉酱': '三丁炒肉酱',
    '鲜到没朋友的蛤蜊裙带菜汤': '蛤蜊裙带菜汤',
    '清蒸鳜鱼快手菜': '清蒸鳜鱼',
    '华夫饼铁具版帕尼尼': '帕尼尼',
    '又香又糯的粉蒸肉': '粉蒸肉',
    '微波炉版生蚝蒸蛋': '生蚝蒸蛋',
    '可爱版蒸蛋': '蒸水蛋',
    '方便版蘑菇豆腐汤': '蘑菇豆腐汤',
    '宝宝辅食': '脊骨萝卜肉泥米糊',
    '寝室版番茄豆腐汤': '番茄豆腐汤',
    '厨房小白版：辣椒炒肉拌饭': '辣椒炒肉拌饭',
    '超简版酸豆角': '肉沫酸豆角',
}

def clean_dish_name(name: str) -> str:
    n = name.strip().replace('\r', '').replace('\n', '').replace('\t', '')
    if n in EXACT_NAME_REPLACEMENTS:
        return EXACT_NAME_REPLACEMENTS[n]
    
    # 清理成语前缀和引流废话
    n = re.sub(r'【.*?】|\[.*?\]|（.*?）|\(.*?\)|『.*?』|「.*?」', '', n)
    n = re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\u2300-\u23ff~～!！?？·\-_\+=#🍻🍓🍤]', '', n)
    n = re.sub(r'^(超简单|快手|好吃到哭|秘制|自制|私房|家常|巨好吃|绝绝子|减脂必备|懒人|香喷喷的|下饭的|超级下饭的|美味的|美味|正宗|特级|神仙|网红|一学就会|两步搞定的|鲜美|清脆|低卡|无油|必学|独家|特色|创新|月子餐\s*[:：]?|简单快手菜之\d+|之\d+|梅森瓶之|婴幼儿辅食\s*[:：]?)+', '', n)
    n = re.sub(r'^(外焦里嫩|鲜嫩多汁|外酥里嫩|色香味俱全|香气扑鼻|清爽可口|酸甜可口|皮脆肉嫩|入口即化|酥脆可口|鲜美爽口|软糯香甜|爽脆开胃|酸辣爽口|咸鲜适口)+', '', n)
    n = re.sub(r'(的做法|的家常做法|简单做|超下饭|附万能蘸料|附酱汁|开胃)+$', '', n)
    n = re.sub(r'\s+', '', n)
    return n.strip(' :：，,。')

def clean_and_dismantle_ingredients(ings: list, dish_name: str) -> list:
    cleaned = []
    seen_names = set()
    
    for ing in ings:
        raw_name = ing.get('name', '').strip().replace('\r', '').replace('\n', '').replace('\t', '')
        amount = str(ing.get('amount', '适量')).strip()
        required = bool(ing.get('required', False))
        
        # 1. 过滤纯器具词与残片
        if raw_name in UTENSIL_BLACKLIST:
            continue
        if any(tool in raw_name for tool in ['搅拌机', '密封袋', '打蛋器', '破壁机', '料理机', '榨汁机', '空气炸锅', '烤箱', '保鲜膜', '铝箔纸', '锡纸', '烘焙纸', '刮刀', '电子秤', '模具', '冰淇淋模具', '筷子或牙签', '煲汤盅']):
            # 如果是量杯橄榄油 / 量杯芝士碎这种带工具前缀的食材
            raw_name = re.sub(r'^(量杯|小碗|盆)\s*', '', raw_name)
            if raw_name in UTENSIL_BLACKLIST or not raw_name:
                continue
        
        # 2. 修复前缀截断与杂质
        # 去完整括号附带说明
        raw_name = re.sub(r'[\(（【\[].*?[\)）】\]]', '', raw_name)
        # 去未闭合括号说明
        raw_name = re.sub(r'[\(（【\[].*$', '', raw_name)
        raw_name = re.sub(r'[\)）\]』」】]', '', raw_name)
        # 去表情
        raw_name = re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\u2300-\u23ff~～!！?？#🍝🍋🍄🍙]', '', raw_name)
        
        # 修复具体特殊截断与模糊词
        specific_fixes = {
            '茶匙约3克盐': '盐',
            '茶匙约1克白胡椒粉': '白胡椒粉',
            '分之一片世棒午餐肉': '午餐肉',
            '分之一朵西蓝花': '西兰花',
            '中等个头三个土豆': '土豆',
            '三文鱼等': '三文鱼',
            '盐等调料': '盐',
            '醋 麻油等调料': '香醋',
            '约10克豆豉': '豆豉',
            '上等糯米': '糯米',
            '金华火腿最佳': '金华火腿',
            '中粉小麦粉': '面粉',
            '小麦粉': '面粉',
            '和面粉等量玉米淀粉': '玉米淀粉',
            '和玉米淀粉等量面粉': '面粉',
            '中等大的红椒': '红椒',
            '牛羊鱼虾等肉类': '肉类',
            '香菜按照个人口味': '香菜',
            '河粉料可按': '河粉',
            '辣椒油等调味包': '辣椒油',
            '蛋挞液约': '蛋挞液',
            '荷兰豆大约': '荷兰豆',
            '腊肠约': '腊肠',
            '漓泉啤酒': '啤酒',
            '花生油醋酱': '油醋汁',
            'mustard': '芥末酱',
            '温水': '水',
            '葱花': '小葱',
        }
        if raw_name in specific_fixes:
            raw_name = specific_fixes[raw_name]
            
        # 单字补全与无效词过滤
        if raw_name in ['约', '按', '片', '注', '人', '1', '等', '之', '淹过鸡蛋约']:
            continue
        if raw_name == '菜' and '包菜' in dish_name:
            raw_name = '包菜'
        elif raw_name == '香' and '丸子' in dish_name:
            raw_name = '香葱'
        elif raw_name == '香' and '牛蛙' in dish_name:
            raw_name = '香菜'
        elif raw_name == '笋' and any(k in dish_name for k in ['笋', '酸辣汤']):
            raw_name = '冬笋'
        elif raw_name == '鸡' and '鸡' in dish_name:
            raw_name = '鸡肉'

        # 量词截断修复
        if re.match(r'^(个|克|瓣|根|只|勺|碗|包|盒|片|块|把|条|两|斤|枚|颗|粒|头|支|张|袋|罐)\s*', raw_name):
            if re.match(r'^(瓣|片|个)\s*蒜$', raw_name):
                raw_name = '大蒜'
            elif re.match(r'^(根|棵)\s*葱$', raw_name):
                raw_name = '小葱'
            elif re.match(r'^(片|块)\s*姜$', raw_name):
                raw_name = '生姜'
            else:
                raw_name = re.sub(r'^(个|克|瓣|根|只|勺|碗|包|盒|片|块|把|条|两|斤|枚|颗|粒|头|支|张|袋|罐)\s*', '', raw_name)
        
        raw_name = raw_name.strip(' :：，,。-_~～*+ ')
        if not raw_name or raw_name in UTENSIL_BLACKLIST:
            continue
            
        # 3. 拆解复合词 '葱姜蒜' / '葱姜' / '姜蒜' / '葱蒜'
        if '葱姜蒜' in raw_name or raw_name in ['葱、姜、蒜', '姜葱蒜']:
            sub_items = [
                ('小葱', '适量', False),
                ('生姜', '适量', False),
                ('大蒜', '适量', False),
            ]
            for s_name, s_amt, s_req in sub_items:
                if s_name not in seen_names:
                    seen_names.add(s_name)
                    cleaned.append({'name': s_name, 'amount': s_amt, 'required': s_req})
            continue
            
        if '葱姜花椒水' in raw_name:
            sub_items = [
                ('小葱', '适量', False),
                ('生姜', '适量', False),
                ('花椒', '适量', False),
            ]
            for s_name, s_amt, s_req in sub_items:
                if s_name not in seen_names:
                    seen_names.add(s_name)
                    cleaned.append({'name': s_name, 'amount': s_amt, 'required': s_req})
            continue

        if '葱姜' in raw_name:
            sub_items = [
                ('小葱', '适量', False),
                ('生姜', '适量', False),
            ]
            for s_name, s_amt, s_req in sub_items:
                if s_name not in seen_names:
                    seen_names.add(s_name)
                    cleaned.append({'name': s_name, 'amount': s_amt, 'required': s_req})
            continue

        if '姜蒜' in raw_name or '蒜姜' in raw_name:
            sub_items = [
                ('生姜', '适量', False),
                ('大蒜', '适量', False),
            ]
            for s_name, s_amt, s_req in sub_items:
                if s_name not in seen_names:
                    seen_names.add(s_name)
                    cleaned.append({'name': s_name, 'amount': s_amt, 'required': s_req})
            continue

        if raw_name in ['葱蒜']:
            sub_items = [
                ('小葱', '适量', False),
                ('大蒜', '适量', False),
            ]
            for s_name, s_amt, s_req in sub_items:
                if s_name not in seen_names:
                    seen_names.add(s_name)
                    cleaned.append({'name': s_name, 'amount': s_amt, 'required': s_req})
            continue
            
        if '葱姜蒜生抽盐鸡精' in raw_name:
            sub_items = [
                ('小葱', '适量', False),
                ('生姜', '适量', False),
                ('大蒜', '适量', False),
                ('生抽', '1勺', False),
                ('盐', '少许', False),
                ('鸡精', '少许', False),
            ]
            for s_name, s_amt, s_req in sub_items:
                if s_name not in seen_names:
                    seen_names.add(s_name)
                    cleaned.append({'name': s_name, 'amount': s_amt, 'required': s_req})
            continue

        # 4. 校准 required
        # 调味料 100% 设为 required: false，绝不作为主料
        if raw_name in SEASONINGS or any(s in raw_name for s in ['鸡精', '鸡粉', '鸡汁', '十三香', '五香粉', '白胡椒', '黑胡椒', '豆瓣酱', '甜面酱', '生抽', '老抽', '料酒', '蚝油', '香醋', '米醋', '陈醋', '香油', '芝麻油', '花椒油', '辣椒油', '淀粉', '生粉', '大蒜', '生姜', '小葱', '大葱', '蒜末', '姜末', '葱花']):
            required = False
        elif raw_name in CORE_MAINS:
            required = True
        elif any(core in raw_name for core in ['肉', '排骨', '鸡', '鸭', '鱼', '虾', '三文鱼', '豆腐', '鸡蛋', '牛肉', '牛腩', '肥牛', '面条', '米饭', '土豆', '茄子', '番茄', '西红柿']):
            # 排除调味品误判
            if not any(bad in raw_name for bad in ['鸡精', '鸡粉', '鸡汁', '鸡油', '鱼露', '鱼香', '肉骨茶料']):
                required = True
        elif len(raw_name) >= 2 and raw_name in dish_name:
            if raw_name not in SEASONINGS and not any(bad in raw_name for bad in ['油', '盐', '糖', '醋', '酱', '粉', '汁', '葱', '姜', '蒜']):
                required = True
                
        if raw_name not in seen_names:
            seen_names.add(raw_name)
            cleaned.append({
                'name': raw_name,
                'amount': amount if amount else '适量',
                'required': required
            })
            
    # 确保一道菜至少有 1 个 required: true
    if cleaned and not any(item['required'] for item in cleaned):
        cleaned[0]['required'] = True
        
    return cleaned

def clean_instructions(insts: list) -> list:
    cleaned = []
    
    url_pat = re.compile(r'https?://\S+|www\.\S+|[a-zA-Z0-9\.\-]+\.(?:com|cn|org|net|html|php)\b')
    md_link_pat = re.compile(r'\[(.*?)\]\((https?://\S+)\)')
    prefix_pat = re.compile(r'^(第[一二三四五六七八九十\d]+步[：:、\s]|步骤[一二三四五六七八九十\d]+[：:、\s]|\d+[\.、:：]\s*)')
    drainage_pat = re.compile(r'(关注.*?公众号|微信公众号|加微信|\+WX\w+|加我私信|扫描二维码|欢迎关注|我的主页|厨友|交作业|详细牛肉腌制方法参考链接|点链接有详细制作方法)')

    for raw in insts:
        s = raw.strip()
        # 1. 纯引流或空条目直接丢弃
        if s in ['【公众号：极致食鲜】', '食材如图：', '食材如图']:
            continue
        if re.search(r'^(欢迎关注|扫描二维码|更多美食菜谱与视频，请关注|有问题加微信)', s):
            continue
            
        # 2. 剥离 Markdown 链接 -> 取内文
        s = md_link_pat.sub(r'\1', s)
        # 剥离外链 URL
        s = url_pat.sub('', s)
        # 剥离引流文字
        s = drainage_pat.sub('', s)
        s = re.sub(r'图中中牛排所搭配的【芝麻菜沙拉拼盘】、【红酒酱汁】可关注公众号看详细文章。?', '', s)
        s = re.sub(r'详细.*?制作方法参考链接食谱?', '', s)
        s = re.sub(r'点链接有详细制作方法?', '', s)
        
        # 3. 剥离机械前缀
        s = prefix_pat.sub('', s).strip()
        
        # 4. 修复换行与断句
        s = s.replace('\r', '').replace('\n', '，')
        s = re.sub(r'，+', '，', s)
        s = s.strip(' ，、；:：')
        if not s:
            continue
            
        # 结尾补全标点
        if not s.endswith(('。', '！', '!', '？', '?')):
            s += '。'
            
        cleaned.append(s)
        
    # 5. 平滑极短结尾步骤（如单独的“出锅装盘。”）合并至上一步
    if len(cleaned) >= 2:
        last = cleaned[-1]
        if last in ['出锅。', '装盘。', '出锅装盘。', '起锅装盘。', '关火。', '即可出锅。', '开吃。', '完成开吃！', '开吃！', '即可食用。']:
            cleaned.pop()
            cleaned[-1] = cleaned[-1].rstrip('。！!') + '，' + last
            
    return cleaned

def calibrate_times(rid: str, name: str, category: str, prep: int, cook: int) -> tuple[int, int]:
    # 明确异常时间的特殊菜品
    special_cases = {
        'recipe-htc-c33132c3f7': (3, 5),     # 煮泡面加蛋
        'recipe-htc-28d880578c': (480, 60),  # 猪皮冻
        'recipe-htc-fe985a84c1': (120, 15),  # 披萨饼皮
        'recipe-htc-5ea20d64b0': (240, 80),  # 酱牛肉
        'recipe-htc-e22ef31de1': (120, 15),  # 无骨鸡爪
        'recipe-htc-4e19db091e': (120, 35),  # 红芸豆拌饭
        'recipe-htc-c74dbe888f': (120, 20),  # 鹰嘴豆炸饼
        'recipe-htc-f1da572c6e': (60, 30),   # 烤箱版巴斯克芝士蛋糕
        'recipe-htc-b4bc9ab7f6': (20, 35),   # 贵州辣子鸡
        'recipe-htc-016402ac3a': (180, 10),  # 酸奶意式奶冻
        'recipe-htc-aa378bf9d7': (15, 50),   # 排骨苦瓜汤
        'recipe-htc-d0010c4839': (120, 10),  # 凉粉
        'recipe-htc-ce5bbd0096': (180, 5),   # 奥利奥冰淇淋
        'recipe-htc-d7a8afc7fa': (20, 85),   # 带把肘子
        'recipe-htc-47550791d1': (60, 45),   # 银耳莲子粥
        'recipe-htc-54f072ac45': (90, 25),   # 基础牛奶面包
        'recipe-htc-1e999830af': (90, 35),   # 奥尔良风味烤鸡腿
        'recipe-htc-aab0f7e2fd': (20, 75),   # 柱候牛腩
        'recipe-htc-0225d2a009': (20, 70),   # 广式萝卜牛腩
        'recipe-htc-16b69a01ca': (15, 35),   # 猪肉烩酸菜
        'recipe-htc-b3b384dbcc': (20, 50),   # 罗宋汤
        'recipe-htc-88374162c5': (60, 60),   # 腊八粥
        'recipe-htc-d00ea96e85': (45, 15),   # 手工水饺
        'recipe-htc-5120330c86': (90, 25),   # 无厨师机蜂蜜面包
        'recipe-htc-6d617249f7': (30, 75),   # 商芝肉
        'recipe-htc-5d51fe1317': (30, 75),   # 梅菜扣肉
        'recipe-htc-364ee1415a': (20, 80),   # 虎皮肘子
        'recipe-htc-383669bf41': (15, 35),   # 红烧鱼头
        'recipe-htc-55e7d4a605': (30, 15),   # 韭菜盒子
        'recipe-htc-a2c69344e9': (15, 15),   # 尖叫牛蛙
        'recipe-htc-c114d7c308': (15, 15),   # 水煮肉片
        'recipe-htc-b9f6aa0564': (20, 15),   # 水煮鱼
        'recipe-htc-7ffed7f6c3': (20, 85),   # 老妈蹄花
        'recipe-htc-cff0989fa3': (20, 35),   # 血浆鸭
        'recipe-htc-2d6cfb5481': (30, 45),   # 戚风蛋糕
        'recipe-htc-50cc795274': (60, 10),   # 炸鲜奶
    }
    if rid in special_cases:
        return special_cases[rid]
        
    p, c = prep, cook
    
    # 凉拌菜 / 沙拉 / 轻食：烹饪时间 2-5 分钟
    if category in ['凉拌菜', '轻食沙拉'] or '沙拉' in name or '凉拌' in name or '拍黄瓜' in name:
        if c > 15:
            p += (c - 5)
            c = 5
        elif c < 2:
            c = 2
        p = max(p, 5)
        return p, c
        
    # 快手菜 / 小炒 / 滚汤 / 蒸菜：5-30 分钟
    is_quick = category in ['家常菜', '快手滚汤', '少油蒸菜', '水产海鲜', '早餐轻食'] or any(k in name for k in ['炒', '煎', '汤', '蒸', '拌面', '泡面'])
    is_stew = any(k in name for k in ['炖', '焖', '煲', '卤', '酱', '蹄花', '肘子', '牛腩', '排骨汤', '老火汤', '红烧肉'])
    
    if is_stew:
        # 炖煮焖菜：30-90 分钟
        if c > 90:
            p += (c - 80)
            c = 80
        elif c < 30:
            c = 35
    elif is_quick:
        # 快手菜：5-30 分钟
        if c > 30:
            p += (c - 20)
            c = 20
        elif c < 5:
            c = 8
            
    p = max(p, 3)
    c = max(c, 2)
    return p, c

def standardize_category_cuisine(rid: str, name: str, cat: str, cui: str) -> tuple[str, str]:
    new_cat = CATEGORY_MAP.get(cat, cat)
    new_cui = CUISINE_MAP.get(cui, cui)
    
    # 精确菜品菜系纠偏
    if rid == 'recipe-yuxiang-pork' or '鱼香肉丝' in name:
        new_cat = '家常菜'
        new_cui = '川菜'
    elif rid == 'recipe-pepper-pork' or '青椒小炒肉' in name:
        new_cat = '家常菜'
        new_cui = '湘菜'
    elif rid == 'recipe-mapo-tofu' or '麻婆豆腐' in name:
        new_cat = '家常菜'
        new_cui = '川菜'
    elif rid == 'recipe-di-san-xian' or '地三鲜' in name:
        new_cat = '家常菜'
        new_cui = '东北菜'
    elif '蚂蚁上树' in name:
        new_cat = '家常菜'
        new_cui = '川菜'
    elif '水煮牛肉' in name or '水煮肉片' in name:
        new_cat = '荤菜'
        new_cui = '川菜'
    elif '宫保鸡丁' in name:
        new_cat = '家常菜'
        new_cui = '川菜'
    elif '回锅肉' in name:
        new_cat = '家常菜'
        new_cui = '川菜'
        
    return new_cat, new_cui

def select_image(rid: str, name: str, current_img: str) -> str:
    # 优先精确本地 WebP 映射
    if rid in LOCAL_WEBP_IMAGE_MAP:
        return LOCAL_WEBP_IMAGE_MAP[rid]
    if name in NAME_TO_WEBP_MAP:
        return NAME_TO_WEBP_MAP[name]
    return current_img

def main():
    if not DB_PATH.exists():
        print(f"Error: {DB_PATH} not found.")
        return
        
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # 1. 先去重 '凯撒沙拉'：删除质量较差的 recipe-xcf-2ec2953023
    cur.execute("DELETE FROM recipes WHERE id = 'recipe-xcf-2ec2953023'")
    print("✅ 已去重删除冗余『凯撒沙拉』(recipe-xcf-2ec2953023)")
    
    # 读取全库菜谱
    cur.execute("SELECT id, name, category, cuisine, difficulty, prep_time, cook_time, servings, ingredients, instructions, tips, image_url, created_at, owner_id FROM recipes")
    rows = cur.fetchall()
    print(f"📦 正在治理清洗 {len(rows)} 道菜谱...")
    
    updated_count = 0
    for r in rows:
        (rid, name, cat, cui, diff, prep, cook, servings, ings_raw, insts_raw, tips, img, created_at, owner_id) = r
        
        # 1. 菜名清洗
        new_name = clean_dish_name(name)
        
        # 2. 分类与菜系标准化
        new_cat, new_cui = standardize_category_cuisine(rid, new_name, cat, cui)
        
        # 3. 烹饪时间纠偏
        new_prep, new_cook = calibrate_times(rid, new_name, new_cat, prep, cook)
        
        # 4. 步骤清洗
        try:
            insts = json.loads(insts_raw)
        except Exception:
            insts = [insts_raw]
        new_insts = clean_instructions(insts)
        
        # 5. 食材清洗、拆解与校准
        if rid == 'recipe-htc-405df04baa':
            new_ings = [
                {'name': '椰汁', 'amount': '200ml', 'required': True},
                {'name': '淡奶油', 'amount': '100ml', 'required': True},
                {'name': '咖啡液', 'amount': '30ml', 'required': True},
                {'name': '吉利丁片', 'amount': '10g', 'required': True},
                {'name': '白糖', 'amount': '15g', 'required': False},
            ]
        else:
            try:
                ings = json.loads(ings_raw)
            except Exception:
                ings = []
            new_ings = clean_and_dismantle_ingredients(ings, new_name)
        
        # 6. 本地 WebP 封面激活
        new_img = select_image(rid, new_name, img)
        
        # 更新数据库
        cur.execute("""
            UPDATE recipes SET
                name = ?,
                category = ?,
                cuisine = ?,
                prep_time = ?,
                cook_time = ?,
                ingredients = ?,
                instructions = ?,
                image_url = ?
            WHERE id = ?
        """, (
            new_name,
            new_cat,
            new_cui,
            new_prep,
            new_cook,
            json.dumps(new_ings, ensure_ascii=False),
            json.dumps(new_insts, ensure_ascii=False),
            new_img,
            rid
        ))
        updated_count += 1
        
    conn.commit()
    print(f"🎉 成功完成全量治理更新 {updated_count} 道菜谱！")
    
    # 统计治理后指标
    cur.execute("SELECT COUNT(*) FROM recipes WHERE image_url LIKE '/images/dishes/%'")
    local_img_cnt = cur.fetchone()[0]
    print(f"🖼️ 本地高清 WebP 封面激活覆盖数: {local_img_cnt} 道")
    
    cur.execute("SELECT COUNT(*) FROM recipes WHERE cook_time > 90")
    over_cnt = cur.fetchone()[0]
    print(f"⏱️ 烹饪时间 > 90 分钟的异常菜谱数: {over_cnt} 道")
    
    cur.execute("SELECT category, count(*) FROM recipes GROUP BY category ORDER BY count(*) DESC")
    print("📊 治理后 Category 分布:")
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]}")
        
    cur.execute("SELECT cuisine, count(*) FROM recipes GROUP BY cuisine ORDER BY count(*) DESC")
    print("📊 治理后 Cuisine 分布:")
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]}")
        
    conn.close()

if __name__ == '__main__':
    main()
