#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
governance_dedup_2026.py
严格遵循 recipe-data-governance 技能规范：
1. 自动备份生产 SQLite 数据库 (shike.db.bak_YYYYMMDD_HHMMSS)
2. 清理完全重名、锅具/工具/前缀换皮同质化、以及门禁残缺广告菜谱
3. 规范修正被截断或带有营销前缀的菜名
4. 导出净菜谱至 backend/src/data/seedRecipes.json 完成版本库回流
"""

import shutil
import sqlite3
import datetime
from pathlib import Path
import subprocess

DB_PATH = Path('/opt/shike-ai/data/db/shike.db')
BACKUP_DIR = Path('/opt/shike-ai/data/db')

TO_DELETE = {
    # 1. 精确重名菜谱（保留更规范/多步/有图版本）
    'recipe-xcf-4bf8e08e6b': '粉蒸肉 (下厨房4步粗制版，保留HowToCook 14步量化版 recipe-htc-981da86bdc)',
    'recipe-xcf-4fe5c11ce9': '蒸蛋糕 (9步同质版，保留11步完整版 recipe-xcf-0da65ea09a)',
    'recipe-xcf-49806aa80b': '酸辣汤 (4步粗略版，保留7步配方完整版 recipe-xcf-adddbe64f1)',
    'recipe-xcf-3e5a10b9ba': '蒸水蛋 (下厨房4步版，鸡蛋羹同质冗余)',
    'recipe-htc-79ee25f541': '蒸水蛋 (HTC 5步版，与精选鸡蛋羹 recipe-htc-d2ffc32146 重复)',

    # 2. 锅具/工具/前缀换皮完全同质化冗余
    'recipe-htc-506e4cdc3a': '微波炉鸡蛋羹 (锅具换皮，保留标准鸡蛋羹)',
    'recipe-htc-7e00ba257f': '蒸箱鸡蛋羹 (锅具换皮，保留标准鸡蛋羹)',
    'recipe-htc-ca9fa5082f': '微波炉蒸蛋 (锅具换皮，保留标准鸡蛋羹)',
    'recipe-xcf-a67d2e13b1': '电压锅蒸蛋糕 (锅具换皮，保留标准蒸蛋糕)',
    'recipe-xcf-62b359c174': '完美电饭锅蒸蛋糕 (锅具换皮，保留标准蒸蛋糕)',
    'recipe-xcf-e7f5690af9': '宝宝蒸蛋糕 (营销换皮，保留标准蒸蛋糕)',
    'recipe-xcf-c164258910': '蒸鸡蛋糕/蒸蛋羹 (双重斜杠同质换皮，保留标准蒸蛋糕)',
    'recipe-xcf-d49342bd24': '轻盈蔬菜沙拉 (营销前缀换皮，保留18步大沙拉 recipe-xcf-d096e8aa84)',
    'recipe-xcf-9284f255a7': '土豆沙拉 (5步粗略，保留12步土豆泥沙拉 recipe-xcf-016822f37e)',
    'recipe-xcf-5dec142d50': '日式土豆沙拉 (同质5步，保留12步土豆泥沙拉 recipe-xcf-016822f37e)',
    'recipe-xcf-a9241ed8ad': '水煮蛋 (下厨房6步粗略版，保留HowToCook精准水煮蛋 recipe-htc-2a7576aa76)',
    'recipe-htc-5b68775c58': '啤酒鸭 (6步粗略版，保留13步详实版 recipe-htc-a3ed0d7ff0)',
    'recipe-xcf-46df648425': '干锅有机花菜 (同质版，保留HTC干锅花菜 recipe-htc-cad51aef4e)',
    'recipe-xcf-b3101dcf27': '有机花菜 (同质版，保留HTC干锅花菜 recipe-htc-cad51aef4e)',
    'recipe-xcf-89ca3d396d': '凉拌莴苣笋 (4种食材粗略版，保留HTC精准凉拌莴笋 recipe-htc-9bb1e71750)',
    'recipe-xcf-a7210b486b': '豆豉蒸排骨 (8步版，保留广式豆豉蒸排骨13步 recipe-xcf-366f970ff5)',
    'recipe-xcf-1919738bc6': '香芋蒸排骨 (5种食材版，保留芋头蒸排骨11种食材 recipe-xcf-2d903d832e)',
    'recipe-xcf-d873715c6b': '广式蒸排骨 (6步粗略版，保留蒸排骨11步详实版 recipe-xcf-e057f4fc8b)',
    'recipe-htc-9e43fcf8b7': '西红柿豆腐汤羹 (同质版，保留番茄豆腐汤 recipe-xcf-a66888bbb9)',
    'recipe-xcf-336b02265f': '西红柿豆腐汤 (同质版，保留番茄豆腐汤 recipe-xcf-a66888bbb9)',
    'recipe-xcf-78ff0f8234': '一人食｜番茄金针菇豆腐汤 (营销前缀同质版，保留番茄金针菇豆腐汤 recipe-xcf-a9b2e7310d)',
    'recipe-xcf-6da8d976fc': '清蒸黄鱼 (3步极简版，保留清蒸黄花鱼9步 recipe-xcf-79fea38752)',
    'recipe-xcf-0a9f2652fe': '清蒸小黄鱼 (3步极简版，保留清蒸黄花鱼9步 recipe-xcf-79fea38752)',
    'recipe-xcf-73683f863a': '芹菜炒肉 (适量党粗制，保留标准上浆版芹菜炒肉片 recipe-xcf-51a2dea92c)',
    'recipe-xcf-fda4854fa5': '胡萝卜炒肉 (3步粗略版，保留胡萝卜丝炒肉片 recipe-xcf-8da009ea59)',
    'recipe-xcf-1f8937bb11': '滑蛋 (粗略同质版，保留HTC炒滑蛋 recipe-htc-6d2fe04d50)',
    'recipe-xcf-b704020f0e': '凉拌儿菜 (5种食材粗略版，保留酸辣凉拌儿菜 recipe-xcf-d9f4d5d471)',
    'recipe-xcf-398bfab32b': '青椒炒肉 (下厨房同质版，保留精选本地WebP青椒小炒肉 recipe-pepper-pork)',
    'recipe-htc-cf1fc7155b': '皮蛋豆腐 (同图4步粗略，保留精选本地WebP皮蛋拌豆腐 recipe-century-egg-tofu)',
    'recipe-xcf-f441b44b3a': '虾仁豆腐汤 (3步极简版，保留时蔬虾仁豆腐汤 recipe-xcf-020b9dd9a4)',
    'recipe-xcf-cf8055003c': '清蒸娃娃菜粉丝 (3步极简版，保留清蒸娃娃菜6步详实 recipe-xcf-9f8c5e75c4)',
    'recipe-xcf-49510f652d': '冬瓜丸子汤 (食材带残缺字粗略版，保留冬瓜肉丸汤 recipe-winter-melon-meatball-soup)',
    'recipe-xcf-9f543ae30e': '牛油果三明治 (基础款同质，保留牛油果鸡蛋三明治 recipe-xcf-e6abdbc2f4)',
    'recipe-xcf-2d2b1f904d': '牛油果鸡蛋烤肠三明治 (同质微调版，保留牛油果鸡蛋三明治 recipe-xcf-e6abdbc2f4)',
    'recipe-xcf-58a6c90a8f': '芝士蛋火腿三明治 (同质微调版，保留爆浆芝士火腿三明治 recipe-xcf-23704c0967)',

    # 3. 门禁一票否决项（非菜谱、广告、残缺日记）
    'recipe-xcf-b2e05a6170': '沙拉汁 (调料酱汁，非菜品)',
    'recipe-xcf-44be086f27': '香蒜 (九阳不粘锅广告软文)',
    'recipe-xcf-8401b7ce7f': '桑葚膏 (8小时熬膏日记，非轻食沙拉)',
    'recipe-xcf-869f79637a': '豆角 (顿量为宜长豆角残缺日记)',
    'recipe-xcf-85aaf8d41c': '丸子汤 (小时候2块一包干丸子日记)',
    'recipe-xcf-5053e4d56d': '小炒 (没有ham用鸡胸肉残缺日记)',
    'recipe-htc-781dac92a7': '红烧鱼 (食材脏数据\"以正常老姜切\"，已有红烧鲤鱼)',
    'recipe-xcf-aff90ae176': '酸菜豆腐汤 (仅2步且食材充斥北大荒/高山岩盐品牌广告)',
    'recipe-htc-29fdff1380': '半成品意面 (微波加热料理包，食材\"人 1 顿 520g\")'
}

TO_UPDATE_NAMES = {
    'recipe-crispy-home-style-tofu': '脆皮家常豆腐',
    'recipe-htc-2a7576aa76': '水煮蛋',
    'recipe-htc-a3ed0d7ff0': '啤酒鸭'
}

def main():
    if not DB_PATH.exists():
        print(f"❌ 找不到数据库: {DB_PATH}")
        return

    # 1. 数据库安全快照备份
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    bak_path = BACKUP_DIR / f"shike.db.bak_{timestamp}"
    shutil.copy2(DB_PATH, bak_path)
    print(f"📦 [1/4] 数据库安全快照备份完成: {bak_path}")

    # 2. 执行清理与规范化
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM recipes")
    total_before = cur.fetchone()[0]

    delete_ids = list(TO_DELETE.keys())
    cur.executemany("DELETE FROM recipes WHERE id = ?", [(rid,) for rid in delete_ids])
    deleted_count = cur.rowcount
    print(f"✂️  [2/4] 执行删除冗余与重复菜谱，共剔除: {len(delete_ids)} 道")

    for rid, new_name in TO_UPDATE_NAMES.items():
        cur.execute("UPDATE recipes SET name = ? WHERE id = ?", (new_name, rid))
    print(f"🏷️  已规范化修复 {len(TO_UPDATE_NAMES)} 道菜谱名称")

    conn.commit()

    cur.execute("SELECT COUNT(*) FROM recipes")
    total_after = cur.fetchone()[0]
    conn.close()

    print(f"📊 菜谱总数: {total_before} -> {total_after} (精简 {total_before - total_after} 道)")

    # 3. 成果回流版本库
    print("🔄 [3/4] 正在导出净菜谱至版本库 seedRecipes.json...")
    res = subprocess.run(['/usr/bin/python3', '/opt/shike-ai/scripts/export_recipes.py'], capture_output=True, text=True)
    print(res.stdout.strip())
    if res.returncode != 0:
        print("❌ 导出失败:", res.stderr)
        return

    print("✅ [4/4] 治理完成！请重启 shike-api 容器以刷新内存缓存。")

if __name__ == '__main__':
    main()
