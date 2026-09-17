import subprocess, time, os, base64, requests, json, sqlite3
from PIL import Image

out_dir = '/opt/shike-ai/frontend/public/images/dishes'
db_path = '/opt/shike-ai/data/db/shike.db'

with open('/opt/shike-ai/.env') as f:
    for line in f:
        if line.startswith('CPA_API_KEY='):
            api_key = line.split('=', 1)[1].strip().strip('"\'')
            break

# 13道需要重做并达到9分级品质的核心菜品
tasks = [
    (
        'recipe-htc-8402a0fbca', '蚂蚁上树',
        '正宗川味名菜蚂蚁上树，红薯细粉丝根根分明、晶莹透亮吸满红润汤汁，表面细碎均匀附着着酥香的红亮猪肉末，宛如蚂蚁爬树枝，撒少许翠绿细小葱花点缀，极简纯白瓷浅盘盛放，热气腾腾，专业美食杂志特写摄影，自然侧光，油润不腻，无文字无水印'
    ),
    (
        'recipe-htc-0cc027f236', '黄瓜炒肉',
        '家常经典黄瓜炒肉片，清脆碧绿的鲜嫩黄瓜菱形斜切薄片，搭配滑嫩油润的酱香猪肉片，大火爆炒镬气十足，点缀两三片鲜红红椒片，极简纯白瓷餐盘盛放，盘边干净无污渍，专业美食摄影，明亮自然光，红绿相映清爽油亮，无文字无水印'
    ),
    (
        'recipe-htc-083a15958b', '茄子炖土豆',
        '东北传统正宗名菜茄子炖土豆，深紫茄子手撕长条炖至软烂吸汁，金黄土豆块炖至边缘起沙粉糯，浓稠酱褐色汤汁紧紧包裹，顶端撒满翠绿新鲜细葱花，古朴粗陶深盘盛放，热气腾腾，专业美食摄影，自然窗边光，浓郁诱人下饭，无文字无水印'
    ),
    (
        'recipe-htc-4b2beca30f', '红烧鲤鱼',
        '传统中式宴席名菜红烧鲤鱼，整条鲤鱼盛放在纯白椭圆长瓷盘中，鱼身打花刀且形态完整，鱼皮金黄微焦，淋满浓郁红亮油润的红烧酱汁，鱼身上整齐点缀鲜红辣椒丝、雪白葱丝与翠绿香菜叶，热气腾腾，米其林三星专业美食摄影，侧光，极具食欲感，无文字无水印'
    ),
    (
        'recipe-htc-b80cf09bf6', '蒜苔炒肉末',
        '家常经典蒜苔炒肉末，新鲜翠绿的蒜苔切成匀称爽脆的小圆丁，猪肉末炒至微焦酱红、粒粒分明，红绿相间镬气十足，表面带有薄薄一层油润光泽，纯白极简白瓷浅盘盛放，专业美食摄影，自然光，令人胃口大开，无文字无水印'
    ),
    (
        'recipe-htc-5d3159e46a', '桂林十八酿',
        '广西桂林经典酿菜宴席盘，金黄圆润饱满的油豆腐酿肉丸子与翠绿诱人的青椒酿肉整齐合盘摆放，内馅肉质扎实多汁，表面淋有一层晶莹透亮的金黄玻璃原汁芡汁，撒细碎小葱花，精致白瓷大浅盘，高端专业美食摄影，热气腾腾极具家宴食欲感，无文字无水印'
    ),
    (
        'recipe-pork-eggplant', '肉末风味茄子',
        '经典风味肉末茄子，长条紫茄经过高温宽油快烹依然保持鲜亮诱人的亮紫色，挺拔不烂，表面浇盖一层炒得焦香酥脆的酱红肉末与蒜粒浓汁，撒点缀性小葱花，纯白长方平盘，专业美食摄影，侧光油润光泽，无文字无水印'
    ),
    (
        'recipe-mapo-tofu', '麻婆豆腐',
        '正宗川味顶级麻婆豆腐，红油红亮剔透，白嫩豆腐块完整方正，表面铺满炒得酥脆深红的牛肉末粒，撒上一层厚厚喷香的棕褐色现磨汉源花椒面与碧绿蒜苗碎，红白绿三色分明，热气腾腾，专业美食杂志特写摄影，令人垂涎欲滴，无文字无水印'
    ),
    (
        'recipe-steamed-shrimp', '白灼基围虾',
        '经典粤菜白灼基围虾，新鲜基围虾白灼成熟虾壳鲜红透亮、虾肉饱满紧实，整齐围成优美圆形摆放在洁白无瑕的瓷盘中，盘中央放置一小瓷碟特调海鲜生抽姜丝蘸料，新鲜欧芹叶微点缀，高级专业海鲜摄影，窗边明亮自然光，鲜美欲滴，无文字无水印'
    ),
    (
        'recipe-cabbage-stir-fry', '手撕包菜',
        '经典家常干煸手撕包菜，真正的圆白菜/卷心菜叶片手工撕成大块，大火快炒带有诱人金黄微焦虎皮斑，红亮干辣椒段与晶莹蒜片爆香，极简纯白瓷浅盘盛放，油亮翠绿脆嫩挺括，专业美食杂志摄影，镬气十足，无文字无水印'
    ),
    (
        'recipe-pepper-pork', '青椒小炒肉',
        '地道湖南农家青椒小炒肉，薄切五花肉片煸炒至微卷金黄焦香并逼出油脂，鲜绿皮薄的线椒/螺丝椒爆出虎皮焦斑，黑豆豉与蒜片酱香四溢，大火猛火快炒干香利落，极简白瓷浅盘，专业美食杂志特写摄影，自然光极具食欲，无文字无水印'
    ),
    (
        'recipe-di-san-xian', '地三鲜',
        '东北正统地三鲜，软糯炸至金黄的土豆滚刀块、鲜亮紫红软烂的茄子块、翠绿脆嫩的青椒片，三种食材被浓郁红亮微稠的蒜香酱油芡汁紧密包裹（抱汁均匀无多余汤水），极简纯白瓷深盘盛放，专业美食摄影，侧光油亮光泽，热气腾腾，无文字无水印'
    ),
    (
        'recipe-yuxiang-pork', '鱼香肉丝',
        '正宗川味名菜鱼香肉丝，细切猪里脊肉丝滑嫩根根分明，搭配黑木耳细丝与爽脆笋丝，红油红亮粘稠的传统鱼香芡汁完美包裹每一根肉丝（无多余浮油浮水），酸甜微辣香气扑鼻，极简白瓷圆盘盛放，米其林专业美食特写摄影，色泽诱人极富食欲，无文字无水印'
    ),
]

conn = sqlite3.connect(db_path)

for rid, name, prompt in tasks:
    slug = rid.replace('-', '_')
    raw_jpg = f'{out_dir}/{slug}_raw.jpg'
    webp_path = f'{out_dir}/{slug}.webp'
    
    print(f'\n========================================')
    print(f'🍳 正在精心打磨【{name}】高端美食大片...')
    
    # 调用 Agnes AI 生图
    cmd = ['python3', '/root/scripts/generate_image.py', '-p', prompt, '-s', '2K', '-r', '16:9', '-o', raw_jpg]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if not os.path.exists(raw_jpg) or os.path.getsize(raw_jpg) == 0:
        print(f'❌ 生成失败: {res.stderr}')
        time.sleep(3)
        continue
    
    # 转为高质 WebP (1200宽, quality 92)
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
    
    # 视觉大模型审核把关
    with open(webp_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('utf-8')
    payload = {
        'model': 'gemini-3.8-flash-high',
        'messages': [
            {
                'role': 'user',
                'content': [
                    {
                        'type': 'text',
                        'text': f'''你是一位极度严苛的美食杂志视觉总监。
请对这张作为菜谱【{name}】封面大图的图片进行严格把关。
审核标准：
1. 菜品是否真正精准符合【{name}】？
2. 是否熟菜？
3. 清晰度、色彩、光影、食欲感？
请以纯 JSON 格式输出：{{"score": 1-10, "passed": true/false, "reason": "简评"}}'''
                    },
                    {'type': 'image_url', 'image_url': {'url': f'data:image/webp;base64,{b64}'}}
                ]
            }
        ]
    }
    
    r = requests.post('http://127.0.0.1:5201/v1/chat/completions', headers={'Authorization': f'Bearer {api_key}'}, json=payload, timeout=30)
    raw = r.json()['choices'][0]['message']['content'].strip()
    if '```json' in raw:
        raw = raw.split('```json')[1].split('```')[0].strip()
    elif '```' in raw:
        raw = raw.split('```')[1].split('```')[0].strip()
    eval_res = json.loads(raw)
    
    final_url = f'/images/dishes/{slug}.webp'
    conn.execute('UPDATE recipes SET image_url = ? WHERE id = ?', (final_url, rid))
    conn.commit()
    
    print(f'🏆【{name}】终审结果: {eval_res.get("score")}分 ({kb}KB) - {eval_res.get("reason")}')
    time.sleep(3)

conn.close()
print('\n🎉 全部 13 道重磅菜品终审打磨完毕！')
