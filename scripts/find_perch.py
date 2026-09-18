import urllib.request, urllib.parse, re, os, base64, requests, json
from PIL import Image

dish = '清蒸鲈鱼'
url = f'https://www.xiachufang.com/search/?keyword={urllib.parse.quote(dish)}&cat=1001'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
with urllib.request.urlopen(req, timeout=10) as resp:
    html = resp.read().decode('utf-8', errors='ignore')

img_urls = re.findall(r'(https://i\d+\.chuimg\.com/[a-zA-Z0-9_]+_\d+w_\d+h\.jpg)', html)
print(f'Found {len(img_urls)} real photos for {dish}')

with open('/opt/shike-ai/.env') as f:
    for line in f:
        if line.startswith('CPA_API_KEY='):
            api_key = line.split('=', 1)[1].strip().strip('\"\'')
            break

best_score = 0
best_img_path = None

for idx, base in enumerate(img_urls[:8]):
    full_url = base + '?imageView2/2/w/800/interlace/1/q/85'
    tmp_jpg = f'/tmp/eval_perch_{idx}.jpg'
    try:
        r = urllib.request.Request(full_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(r, timeout=10) as resp:
            with open(tmp_jpg, 'wb') as f:
                f.write(resp.read())
        
        with open(tmp_jpg, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('utf-8')
        payload = {
            'model': 'gemini-3.8-flash-high',
            'messages': [
                {
                    'role': 'user',
                    'content': [
                        {'type': 'text', 'text': f'你是一位极度苛刻的美食杂志视觉总监。请对这张作为菜谱【{dish}】封面大图的图片进行严格把关。要求：菜品精准对版、整条鱼熟食蒸制、葱姜丝红椒点缀、色泽清亮油润、食欲感强、绝对无任何第三方水印/文字。以纯 JSON 输出：{{"passed": true, "score": 8, "has_watermark": false, "reason": "简评"}}'},
                        {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64}'}}
                    ]
                }
            ]
        }
        res = requests.post('http://127.0.0.1:5201/v1/chat/completions', headers={'Authorization': f'Bearer {api_key}'}, json=payload, timeout=30)
        raw_text = res.json()['choices'][0]['message']['content'].strip()
        raw_clean = re.sub(r'^```json\s*|\s*```$', '', raw_text)
        ev = json.loads(raw_clean)
        print(f'Candidate {idx}: 得分 {ev.get("score")}, 水印: {ev.get("has_watermark")}, 评语: {ev.get("reason")}')
        if not ev.get('has_watermark') and ev.get('score', 0) > best_score:
            best_score = ev.get('score', 0)
            best_img_path = tmp_jpg
    except Exception as e:
        print(f'Error candidate {idx}:', e)

print('Best score:', best_score, 'Path:', best_img_path)
