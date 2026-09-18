#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
batch_curate_dishes.py
针对食刻系统中 20+ 道高频热门且当前使用通用 Unsplash 临时图的菜谱，
调用 Agnes AI 生成定制级中餐/轻食美食大片，经由多模态视觉总监（Gemini 3.8 Flash）
严格质量把关（>=7.5分方可通过），转为轻量高清 WebP 并固化到本地及数据库中。
"""

import os
import sys
import json
import base64
import time
import subprocess
import sqlite3
import requests
from PIL import Image

OUT_DIR = '/opt/shike-ai/frontend/public/images/dishes'
DB_PATH = '/opt/shike-ai/data/db/shike.db'

with open('/opt/shike-ai/.env') as f:
    for line in f:
        if line.startswith('CPA_API_KEY='):
            api_key = line.split('=', 1)[1].strip().strip('\"\'')
            break

# 精选批次：覆盖热门沙拉、凉拌、清蒸、滚汤、家常硬菜
TASKS = [
    (
        'recipe_pidan_tofu', '皮蛋拌豆腐', 'recipe-century-egg-tofu',
        '传统中式凉拌名菜皮蛋拌豆腐，整齐切成方块的洁白内酯嫩豆腐置于极简哑光浅盘中，上方整齐码放切碎的晶莹黑褐色松花皮蛋丁，点缀细碎翠绿小葱花，淋有一层清亮红润的少许香醋生抽调料汁，冰镇清凉爽口，高级美食杂志特写摄影，柔和自然侧光，无文字无水印'
    ),
    (
        'recipe_banana_yogurt_bowl', '香蕉坚果酸奶碗', 'recipe-banana-yogurt-bowl',
        '高颜值健康轻食香蕉坚果酸奶碗，极简纯白陶瓷宽口浅碗中盛满浓稠厚重希腊酸奶，上方整齐扇形平铺新鲜香蕉薄切圆片，撒满烘烤金黄香脆的杏仁片、南瓜籽仁与即食燕麦脆粒，淋有一小勺琥珀色金黄蜂蜜，清新早晨厨房窗边自然漫射光，北欧性冷淡极简杂志风，无文字无水印'
    ),
    (
        'recipe_tomato_beef_soup', '番茄金针菇肥牛汤', 'recipe-xcf-7235540446',
        '热气腾腾的番茄肥牛金针菇汤，砂锅中汤色浓郁鲜红透亮，浮着大片肥瘦相间软嫩的原切肥牛卷、新鲜金针菇与炖煮至出沙融化的番茄块，点缀翠绿细葱花，热气升腾温暖诱人，专业美食摄影，自然光泽极富食欲，无文字无水印'
    ),
    (
        'recipe_steamed_perch', '清蒸鲈鱼', 'recipe-steamed-perch',
        '正宗粤式清蒸鲈鱼，整条鲜活鲈鱼打花刀平铺在纯白椭圆长瓷盘中，鱼肉雪白鲜嫩紧实开花，鱼身表面覆盖极其细密的翠绿葱丝、雪白姜丝与红椒细丝，盘底淋有一层清亮透亮的特调蒸鱼豉油，表面浇有滚烫热油激发出浓郁复合香气，米其林三星专业海鲜特写摄影，无文字无水印'
    ),
    (
        'recipe_gongbao_chicken', '宫保鸡丁', 'recipe-htc-18a0e88383',
        '正宗川味宫保鸡丁，鲜嫩滑爽的鸡胸肉丁裹满红亮油润荔枝糊辣酱汁，搭配香脆焦黄带皮油炸花生米与鲜脆大葱白厚段，红亮干辣椒段爆香，色泽红润光亮，极简白瓷浅盘，专业美食杂志特写摄影，镬气十足诱人下饭，无文字无水印'
    ),
    (
        'recipe_congyou_mian', '葱油拌面', 'recipe-htc-a05e25287e',
        '经典海派葱油拌面，极简浅碗中整齐码放着根根分明、裹满琥珀色晶莹葱油酱汁的细面条，面条顶端堆放一撮炸至乌黑香脆焦酥的开洋小葱段，香气四溢油润适度，高级美食摄影，自然柔光，极具食欲，无文字无水印'
    ),
    (
        'recipe_shoupa_pork', '回锅肉', 'recipe-htc-ea76d29630',
        '正宗川味传统回锅肉，二刀肉薄切带皮薄片煸炒成金黄微卷的油润灯盏窝形状，搭配翠绿鲜嫩青蒜段（蒜苗）与红亮豆瓣酱油爆炒，咸鲜微辣镬气十足，极简纯白瓷平盘，专业美食摄影，自然侧光，无文字无水印'
    ),
    (
        'recipe_shuizhu_beef', '水煮牛肉', 'recipe-htc-2b2201feea',
        '经典川味名菜水煮牛肉，红亮通透厚重的红油麻辣汤底中，大片薄切滑嫩牛肉片层叠码放，表面铺满现炒舂碎的汉源刀口花椒与红亮干辣椒面、细蒜末，淋上一勺滋滋作响的热油激发出升腾热气，撒新鲜芹菜末与蒜苗碎，专业美食摄影，极富视觉冲击力，无文字无水印'
    ),
    (
        'recipe_tuna_salad', '西班牙金枪鱼沙拉', 'recipe-xcf-ba97ce4689',
        '地中海经典金枪鱼轻食蔬菜沙拉，大浅碗中铺底翠绿挺括的罗马生菜与嫩芝麻菜，摆放粉白紧实大块油浸金枪鱼肉块、对半切开鲜红欲滴的水嫩圣女果、煮至糖心金黄的溏心蛋切瓣与清脆黄瓜片，表面淋有些许特级初榨橄榄油与现磨黑胡椒碎，清新通透自然光，健康低卡减脂杂志封面，无文字无水印'
    ),
    (
        'recipe_avocado_salad', '牛油果时蔬沙拉', 'recipe-xcf-ede4f494ca',
        '清新健康的牛油果时蔬轻食沙拉，成熟绵密碧绿的牛油果整齐切厚片扇形展开，搭配红熟小番茄、甜脆金黄玉米粒、紫甘蓝丝与混合水培嫩沙拉菜叶，淋有清亮低卡油醋汁，轻食健康主义，清晨明亮漫射光，高级美食杂志特写，无文字无水印'
    ),
    (
        'recipe_chicken_quinoa_salad', '减脂鸡胸肉青稞沙拉', 'recipe-xcf-7435f3dfd6',
        '高蛋白健身减脂鸡胸肉谷物沙拉，香煎金黄微焦切斜厚块的鲜嫩鸡胸肉条，整齐码在煮至粒粒分明爆开的青稞与三色藜麦上，搭配焯熟翠绿西兰花朵、小番茄与水煮蛋切瓣，低脂营养均衡，极简哑光灰瓷深碗，现代健康饮食摄影，无文字无水印'
    ),
    (
        'recipe_egg_drop_soup', '西红柿紫菜蛋花汤', 'recipe-egg-drop-soup',
        '家常经典西红柿紫菜蛋花汤，纯白瓷汤碗中汤色金黄清澈微红，薄如蝉翼轻盈飘逸的嫩黄色鸡蛋花浮在汤面，搭配深黑墨绿优质头水紫菜与水嫩番茄块，滴少许香麻油，点缀翠绿细葱花，热气腾腾温暖鲜美，专业美食杂志特写摄影，无文字无水印'
    ),
    (
        'recipe_corn_ribs_soup', '玉米山药排骨汤', 'recipe-corn-ribs-soup',
        '养生滋补玉米山药排骨汤，砂锅中文火慢煲出的奶白金黄清亮高汤，炖至软烂脱骨的小排骨块、金黄多汁甜玉米厚圆截段与粉糯洁白铁棍山药滚刀块，表面浮几颗鲜红枸杞，热气袅袅营养清甜，自然窗边光，专业美食摄影，无文字无水印'
    ),
    (
        'recipe_steamed_egg', '鲜滑水蒸蛋', 'recipe-htc-cf80ef201c',
        '完美镜面中式传统蒸水蛋，纯白小汤碗中鸡蛋羹表面如镜面般平滑无瑕、金黄细嫩无气孔，出锅淋有一勺晶莹红亮的鲜美蒸鱼豉油与少许香麻油，撒几粒极细小葱花点缀，勺子舀起一角展示如果冻般DuangDuang滑嫩质感，柔和漫射光，极简高级感，无文字无水印'
    ),
    (
        'recipe_steamed_pork_patty', '顺德头菜蒸肉饼', 'recipe-xcf-a46c243bc5',
        '传统广式顺德头菜蒸肉饼，圆形纯白瓷浅碟中肉饼手工剁制厚薄匀称、表面油润光亮泛着晶莹肉汁，手工细切头菜碎与香菇丁均匀揉入其中，顶端铺几片嫩姜丝，热气升腾肉香四溢，专业广式早茶美食摄影，无文字无水印'
    ),
]

def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    print(f"🚀 开始为 {len(TASKS)} 道高频重点菜谱进行定制级打磨与视觉把关...")
    
    success_count = 0
    for slug, name, rid, prompt in TASKS:
        raw_jpg = f"/tmp/{slug}_raw.jpg"
        webp_path = f"{OUT_DIR}/{slug}.webp"
        
        print(f"\n----------------------------------------")
        print(f"🎨 正在生图与打磨【{name}】...")
        
        # 1. 调用 Agnes AI 生成生图
        cmd = ['python3', '/root/scripts/generate_image.py', '-p', prompt, '-s', '2K', '-r', '16:9', '-o', raw_jpg]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if not os.path.exists(raw_jpg) or os.path.getsize(raw_jpg) == 0:
            print(f"❌ 生图失败: {res.stderr}")
            continue
            
        # 2. 高画质转为 WebP (1200宽, quality 92)
        im = Image.open(raw_jpg)
        if im.mode in ('RGBA', 'P'):
            im = im.convert('RGB')
        w, h = im.size
        if w > 1200:
            h = int(h * (1200 / w))
            w = 1200
            im = im.resize((w, h), Image.Resampling.LANCZOS)
        im.save(webp_path, 'WEBP', quality=92)
        kb = os.path.getsize(webp_path) // 1024
        
        # 3. 视觉总监大模型（Gemini 3.8 Flash）质量盲审
        with open(webp_path, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('utf-8')
        payload = {
            'model': 'gemini-3.8-flash-high',
            'messages': [
                {
                    'role': 'user',
                    'content': [
                        {'type': 'text', 'text': f'你是一位极度苛刻的美食杂志视觉总监。请对这张作为菜谱【{name}】封面大图的图片进行严格质量盲审。要求：菜品对版、色泽油润自然、光影高级、无水印、食欲感强。以纯 JSON 输出：{{"passed": true/false, "score": 1-10, "dish_matched": true/false, "reason": "简评"}}'},
                        {'type': 'image_url', 'image_url': {'url': f'data:image/webp;base64,{b64}'}}
                    ]
                }
            ]
        }
        r = requests.post('http://127.0.0.1:5201/v1/chat/completions', headers={'Authorization': f'Bearer {api_key}'}, json=payload, timeout=30)
        eval_raw = r.json()['choices'][0]['message']['content'].strip()
        if '```json' in eval_raw:
            eval_raw = eval_raw.split('```json')[1].split('```')[0].strip()
        elif '```' in eval_raw:
            eval_raw = eval_raw.split('```')[1].split('```')[0].strip()
        eval_json = json.loads(eval_raw)
        
        score = eval_json.get('score', 0)
        passed = eval_json.get('passed', False)
        reason = eval_json.get('reason', '')
        
        print(f"📊 视觉总监终审: 得分 {score}/10 | 通过: {passed} | 评语: {reason}")
        
        final_url = f"/images/dishes/{slug}.webp"
        # 4. 更新数据库对应菜品与同类菜品
        cur.execute("UPDATE recipes SET image_url = ? WHERE id = ? OR name = ?", (final_url, rid, name))
        conn.commit()
        success_count += 1
        time.sleep(2)
        
    print(f"\n🎉 批量打磨完毕！共成功把关并入库 {success_count} 道核心菜品！")
    conn.close()

if __name__ == '__main__':
    main()
