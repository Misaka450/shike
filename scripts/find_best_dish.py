import urllib.request, re, os, base64, requests, json
from PIL import Image

with open('/opt/shike-ai/.env') as f:
    for line in f:
        if line.startswith('CPA_API_KEY='):
            api_key = line.split('=', 1)[1].strip().strip('"\'')
            break

targets = [
    ('红烧鲤鱼', 'recipe_htc_4b2beca30f', '%E7%BA%A2%E7%83%A7%E9%B2%A4%E9%B1%BC'),
    ('蒜苔炒肉末', 'recipe_htc_b80cf09bf6', '%E8%92%9C%E8%8B%94%E7%82%92%E8%82%89%E6%9C%AB'),
    ('桂林十八酿', 'recipe_htc_5d3159e46a', '%E9%85%BF%E8%B1%86%E8%85%90'),
]

for name, slug, q_kw in targets:
    url = f'https://m.xiachufang.com/search/?keyword={q_kw}&cat=1001'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            html = resp.read().decode('utf-8')
            recipes = re.findall(r'href="/recipe/(\d+)/"', html)

        print(f'正在为【{name}】寻找最佳封面, 候选数: {len(recipes)}')
        for rid in recipes[:8]:
            c_url = f'https://m.xiachufang.com/recipe/{rid}/'
            try:
                c_req = urllib.request.Request(c_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(c_req, timeout=5) as c_resp:
                    c_html = c_resp.read().decode('utf-8')
                    covers = re.findall(r'<div class="cover[^>]*>.*?<img src="(https?://[^"]+)"', c_html, re.S)
                    if not covers:
                        covers = re.findall(r'<img [^>]*src="(https?://i2\.chuimg\.com/[^"]+)"', c_html)
                    if covers:
                        img_url = covers[0].split('?')[0] + '?imageView2/1/w/1200/h/800/q/90/format/jpg'
                        tmp_path = f'/tmp/test_{slug}_{rid}.jpg'
                        urllib.request.urlretrieve(img_url, tmp_path)
                        
                        with open(tmp_path, 'rb') as f:
                            b64 = base64.b64encode(f.read()).decode('utf-8')
                        payload = {
                            'model': 'gemini-3.8-flash-high',
                            'messages': [{
                                'role': 'user',
                                'content': [
                                    {'type': 'text', 'text': f'请审核这张【{name}】菜谱封面。请评估：1.是否是真实烹饪成菜？2.色泽与卖相是否具有强烈食欲感？3.有无刺眼文字水印？给出 1-10 分评分与简评。纯 JSON：{{"score": number, "passed": true/false, "reason": "一句话"}}'},
                                    {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64}'}}
                                ]
                            }]
                        }
                        r = requests.post('http://127.0.0.1:5201/v1/chat/completions', headers={'Authorization': f'Bearer {api_key}'}, json=payload, timeout=20)
                        raw_text = r.json()['choices'][0]['message']['content'].strip()
                        if '```json' in raw_text:
                            raw_text = raw_text.split('```json')[1].split('```')[0].strip()
                        elif '```' in raw_text:
                            raw_text = raw_text.split('```')[1].split('```')[0].strip()
                        res_j = json.loads(raw_text)
                        print(f'  {name} ({rid}): {res_j.get("score")}分, passed={res_j.get("passed")} -> {res_j.get("reason")}')
                        if res_j.get('score', 0) >= 7.5:
                            im = Image.open(tmp_path)
                            target = f'/opt/shike-ai/frontend/public/images/dishes/{slug}.webp'
                            im.save(target, 'WEBP', quality=92)
                            print(f'🎉 成功入选最佳【{name}】封面: {rid} ({res_j.get("score")}分)!')
                            break
            except Exception as e:
                continue
    except Exception as e:
        print(f'{name} 搜索失败: {e}')
