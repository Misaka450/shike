#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import requests
import re
import time

DEST = '/tmp/recipe_corpus_finetune.zip'
FILE_ID = '16_X3I3mt-eIaVx5g1ZxA0uks_fD_IBiy'

if os.path.exists(DEST) and os.path.getsize(DEST) > 600000000:
    print(f"File already downloaded: {DEST} ({os.path.getsize(DEST)} bytes)")
    sys.exit(0)

print(f"Starting download from Google Drive...")
url = f'https://drive.google.com/uc?export=download&id={FILE_ID}'
s = requests.Session()
r = s.get(url)

inputs = dict(re.findall(r'<input[^>]+name="([^"]+)"[^>]+value="([^"]+)"', r.text))
if not inputs:
    inputs = {'id': FILE_ID, 'export': 'download', 'confirm': 't'}

dl_url = 'https://drive.usercontent.google.com/download'
r2 = s.get(dl_url, params=inputs, stream=True, timeout=60)

total_size = int(r2.headers.get('Content-Length', 0))
print(f"Total size: {total_size / (1024*1024):.1f} MB")

downloaded = 0
start_time = time.time()
with open(DEST, 'wb') as f:
    for chunk in r2.iter_content(chunk_size=1024*1024*4): # 4MB chunks
        if chunk:
            f.write(chunk)
            downloaded += len(chunk)
            pct = (downloaded / total_size * 100) if total_size else 0
            mb = downloaded / (1024*1024)
            speed = mb / (time.time() - start_time + 0.001)
            print(f"Downloaded: {mb:.1f}MB ({pct:.1f}%) - {speed:.2f} MB/s", flush=True)

print(f"Download complete: {DEST} ({os.path.getsize(DEST)} bytes)")
