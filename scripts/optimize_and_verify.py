import os, sqlite3, json, base64, requests
from PIL import Image

out_dir = '/opt/shike-ai/frontend/public/images/dishes'
db_path = '/opt/shike-ai/data/db/shike.db'

with open('/opt/shike-ai/.env') as f:
    for line in f:
        if line.startswith('CPA_API_KEY='):
            api_key = line.split('=', 1)[1].strip().strip('"\'')
            break

dish_map = {
    'recipe-tomato-egg': ('西红柿炒鸡蛋', '/opt/shike-ai/frontend/public/images/tomato_egg.webp'),
    'recipe-htc-8402a0fbca': ('蚂蚁上树', f'{out_dir}/mayishangshu.jpg'),
    'recipe-htc-0cc027f236': ('黄瓜炒肉', f'{out_dir}/huanggua_chaorou.jpg'),
    'recipe-htc-083a15958b': ('茄子炖土豆', f'{out_dir}/qiezi_dun_tudou.jpg'),
    'recipe-htc-4b2beca30f': ('红烧鲤鱼', f'{out_dir}/hongshao_liyu.jpg'),
    'recipe-htc-b80cf09bf6': ('蒜苔炒肉末', f'{out_dir}/suantai_chaorou.jpg'),
    'recipe-htc-5d3159e46a': ('桂林十八酿', f'{out_dir}/guilin_shibanliang.jpg'),
    'recipe-pork-eggplant': ('肉末风味茄子', f'{out_dir}/roumo_qiezi.jpg'),
    'recipe-mapo-tofu': ('麻婆豆腐', f'{out_dir}/recipe_mapo_tofu.jpg'),
    'recipe-steamed-shrimp': ('白灼基围虾', f'{out_dir}/recipe_steamed_shrimp.jpg'),
    'recipe-cola-wings': ('可乐鸡翅', f'{out_dir}/recipe_cola_wings.jpg'),
    'recipe-di-san-xian': ('地三鲜', f'{out_dir}/recipe-di-san-xian.jpg'),
    'recipe-yuxiang-pork': ('鱼香肉丝', f'{out_dir}/recipe-yuxiang-pork.jpg'),
    'recipe-pepper-pork': ('青椒小炒肉', f'{out_dir}/recipe-pepper-pork.jpg'),
    'recipe-garlic-broccoli': ('蒜蓉西兰花', f'{out_dir}/recipe-garlic-broccoli.jpg'),
    'recipe-potato-shreds': ('酸辣土豆丝', f'{out_dir}/recipe-potato-shreds.jpg'),
    'recipe-sweet-sour-ribs': ('糖醋排骨', f'{out_dir}/recipe-sweet-sour-ribs.jpg'),
    'recipe-pan-seared-salmon': ('香煎黑椒三文鱼', f'{out_dir}/recipe-pan-seared-salmon.jpg'),
    'recipe-garlic-steamed-shrimp': ('蒜蓉粉丝蒸大虾', f'{out_dir}/recipe-garlic-steamed-shrimp.jpg'),
    'recipe-cabbage-stir-fry': ('手撕包菜', f'{out_dir}/recipe-cabbage-stir-fry.jpg'),
}

conn = sqlite3.connect(db_path)
report = []

for rid, (name, src_file) in dish_map.items():
    if not src_file or not os.path.exists(src_file):
        print(f"Skipping {name}, {src_file} does not exist")
        continue
    
    slug = rid.replace('-', '_')
    webp_path = f'{out_dir}/{slug}.webp'
    
    try:
        im = Image.open(src_file)
        if im.mode in ('RGBA', 'P'):
            im = im.convert('RGB')
        
        w, h = im.size
        if w > 1200:
            h = int(h * (1200 / w))
            w = 1200
            im = im.resize((w, h), Image.Resampling.LANCZOS)
        
        im.save(webp_path, 'WEBP', quality=90)
        file_size_kb = os.path.getsize(webp_path) // 1024
        
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
                            'text': f'''你是一位极其苛刻的美食杂志视觉总监。
请对这张作为菜谱【{name}】封面大图的图片进行严格质量审核把关。
审核标准：
1. 菜品是否真正符合【{name}】？
2. 是否熟菜？
3. 清晰度、色彩、光影、食欲感？
请以纯 JSON 格式输出：{{"passed": true/false, "score": 1-10, "reason": "一句话简评"}}'''
                        },
                        {'type': 'image_url', 'image_url': {'url': f'data:image/webp;base64,{b64}'}}
                    ]
                }
            ]
        }
        res = requests.post('http://127.0.0.1:5201/v1/chat/completions', headers={'Authorization': f'Bearer {api_key}'}, json=payload, timeout=30)
        raw_text = res.json()['choices'][0]['message']['content'].strip()
        if '```json' in raw_text:
            raw_text = raw_text.split('```json')[1].split('```')[0].strip()
        elif '```' in raw_text:
            raw_text = raw_text.split('```')[1].split('```')[0].strip()
        eval_json = json.loads(raw_text)
        
        final_url = f'/images/dishes/{slug}.webp'
        conn.execute('UPDATE recipes SET image_url = ? WHERE id = ?', (final_url, rid))
        
        report.append({
            'name': name,
            'size': f'{file_size_kb}KB',
            'score': eval_json.get('score', 0),
            'passed': eval_json.get('passed', False),
            'reason': eval_json.get('reason', '')
        })
        print(f'✅ 【{name}】已转存入库: {eval_json.get("score")}分 ({file_size_kb}KB) - {eval_json.get("reason")}')
    except Exception as e:
        print(f'❌ 【{name}】处理出错: {e}')

conn.commit()
print('\n===== 终审完成汇总 =====')
for r in report:
    print(f'{r["name"]}: {r["score"]}分 | {r["size"]} | {r["reason"]}')
