'use client';

import React from 'react';
import { InventoryItem } from '@/lib/types';
import { Sparkles, AlertTriangle, Snowflake, Apple, Wine, Package, ChevronRight } from 'lucide-react';

export type StorageZoneId = 'all' | 'cold_main' | 'cold_drawer' | 'door_shelf' | 'freezer' | 'pantry';

export interface StorageZoneMeta {
  id: StorageZoneId;
  name: string;
  subtitle: string;
  tempHint: string;
  icon: React.ReactNode;
  match: (item: InventoryItem) => boolean;
}

export const STORAGE_ZONES: StorageZoneMeta[] = [
  {
    id: 'cold_main',
    name: '冷藏主室',
    subtitle: '熟食 · 蛋奶 · 剩菜',
    tempHint: '4°C 恒温',
    icon: <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />,
    match: (item) => {
      const loc = item.storage_location || '';
      return (
        (loc.includes('冷藏') || loc.includes('保鲜')) &&
        !loc.includes('抽屉') &&
        !loc.includes('门')
      );
    },
  },
  {
    id: 'cold_drawer',
    name: '果蔬保鲜抽屉',
    subtitle: '鲜蔬 · 水果 · 菌菇',
    tempHint: '高湿控水',
    icon: <Apple className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
    match: (item) => {
      const loc = item.storage_location || '';
      return loc.includes('抽屉') || loc.includes('果蔬');
    },
  },
  {
    id: 'door_shelf',
    name: '门侧置物架',
    subtitle: '调味品 · 酱料 · 饮品',
    tempHint: '随手速取',
    icon: <Wine className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
    match: (item) => {
      const loc = item.storage_location || '';
      return loc.includes('门') || loc.includes('侧架');
    },
  },
  {
    id: 'freezer',
    name: '深冷速冻室',
    subtitle: '牛羊肉 · 鲜鱼虾 · 速冻面点',
    tempHint: '-18°C 锁鲜',
    icon: <Snowflake className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />,
    match: (item) => {
      const loc = item.storage_location || '';
      return loc.includes('冷冻');
    },
  },
  {
    id: 'pantry',
    name: '常温干燥架',
    subtitle: '根茎杂粮 · 干货 · 调料',
    tempHint: '避光通风',
    icon: <Package className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />,
    match: (item) => {
      const loc = item.storage_location || '';
      return loc.includes('常温') || loc.includes('储物') || (!loc.includes('冷') && !loc.includes('门'));
    },
  },
];

interface FridgeStorageMapProps {
  items: InventoryItem[];
  selectedZone: StorageZoneId;
  onSelectZone: (zoneId: StorageZoneId) => void;
}

export default function FridgeStorageMap({
  items,
  selectedZone,
  onSelectZone,
}: FridgeStorageMapProps) {
  // 分区统计
  const zoneStats = React.useMemo(() => {
    const stats: Record<
      StorageZoneId,
      { count: number; urgentCount: number; sampleNames: string[] }
    > = {
      all: { count: items.length, urgentCount: 0, sampleNames: [] },
      cold_main: { count: 0, urgentCount: 0, sampleNames: [] },
      cold_drawer: { count: 0, urgentCount: 0, sampleNames: [] },
      door_shelf: { count: 0, urgentCount: 0, sampleNames: [] },
      freezer: { count: 0, urgentCount: 0, sampleNames: [] },
      pantry: { count: 0, urgentCount: 0, sampleNames: [] },
    };

    items.forEach((item) => {
      const isUrgent = (item.days_remaining ?? 99) <= 2;
      if (isUrgent) {
        stats.all.urgentCount += 1;
      }

      let matched = false;
      for (const zone of STORAGE_ZONES) {
        if (zone.match(item)) {
          stats[zone.id].count += 1;
          if (isUrgent) stats[zone.id].urgentCount += 1;
          if (stats[zone.id].sampleNames.length < 3) {
            stats[zone.id].sampleNames.push(item.name);
          }
          matched = true;
          break;
        }
      }

      // 未命中任何特征归入冷藏主室兜底
      if (!matched) {
        stats.cold_main.count += 1;
        if (isUrgent) stats.cold_main.urgentCount += 1;
        if (stats.cold_main.sampleNames.length < 3) {
          stats.cold_main.sampleNames.push(item.name);
        }
      }
    });

    return stats;
  }, [items]);

  const activeZoneMeta = STORAGE_ZONES.find((z) => z.id === selectedZone);

  return (
    <div className="bg-white dark:bg-[#1E201D] rounded-3xl p-5 sm:p-6 border border-[#1C1D1B]/[0.06] dark:border-white/[0.08] shadow-card space-y-4">
      {/* 头部标题与全景快捷重置 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 dark:border-stone-800 pb-3.5">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-forest-600 animate-pulse" />
            <h2 className="font-bold text-sm sm:text-base text-stone-900 dark:text-stone-100 tracking-tight">
              冰箱物理分层收纳地图
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-forest-50 dark:bg-forest-950/40 text-forest-800 dark:text-forest-300 font-mono border border-forest-200/50">
              物理空间孪生
            </span>
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            点击对应物理温区舱位，秒级定位深处食材，告别翻箱倒柜
          </p>
        </div>

        {/* 全冰箱概览按钮 */}
        <button
          type="button"
          onClick={() => onSelectZone('all')}
          className={`flex items-center justify-between sm:justify-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
            selectedZone === 'all'
              ? 'bg-forest-900 dark:bg-forest-700 text-white shadow-soft font-semibold'
              : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-stone-700'
          }`}
        >
          <span>查看全冰箱 ({items.length} 样)</span>
          {zoneStats.all.urgentCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-mono animate-pulse">
              <AlertTriangle className="w-2.5 h-2.5" />
              {zoneStats.all.urgentCount} 临期
            </span>
          )}
        </button>
      </div>

      {/* 现代智能双门/十字门拟真冰箱物理透视图 */}
      <div className="relative rounded-2xl bg-stone-100/70 dark:bg-stone-900/60 p-3 sm:p-4 border border-stone-200/80 dark:border-stone-800 shadow-inner space-y-3">
        {/* 冷藏区 (上部大舱 + 门架) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-stone-500 dark:text-stone-400">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
              <span>上层 · 保鲜冷藏区 (2℃ ~ 6℃)</span>
            </div>
            <span className="text-[10px] font-mono text-stone-400">冷气微循环</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* 左/中：冷藏主室 (占 2 列) */}
            <div
              onClick={() => onSelectZone(selectedZone === 'cold_main' ? 'all' : 'cold_main')}
              className={`sm:col-span-2 p-3.5 rounded-2xl cursor-pointer transition-all border text-left relative group ${
                selectedZone === 'cold_main'
                  ? 'bg-sky-50/90 dark:bg-sky-950/40 border-sky-400 dark:border-sky-600 shadow-ambient-emerald ring-2 ring-sky-500/20'
                  : 'bg-white/95 dark:bg-[#1E201D] border-black/[0.05] dark:border-white/[0.06] hover:border-sky-300 dark:hover:border-sky-700 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-sky-100/80 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-300" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                      冷藏主室 (上中层)
                    </span>
                    <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">
                      熟食 · 剩菜 · 鲜牛奶 · 鸡蛋
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {zoneStats.cold_main.urgentCount > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-medium border border-rose-200 dark:border-rose-900 animate-pulse">
                      {zoneStats.cold_main.urgentCount} 临期
                    </span>
                  )}
                  <span
                    className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                      selectedZone === 'cold_main'
                        ? 'bg-sky-600 text-white'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    {zoneStats.cold_main.count} 样
                  </span>
                </div>
              </div>

              {/* 食材预览微标签 */}
              {zoneStats.cold_main.sampleNames.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {zoneStats.cold_main.sampleNames.map((name, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-stone-50 dark:bg-stone-800/80 text-[10px] text-stone-600 dark:text-stone-300 border border-black/[0.03] dark:border-white/[0.04]"
                    >
                      {name}
                    </span>
                  ))}
                  {zoneStats.cold_main.count > 3 && (
                    <span className="text-[10px] text-stone-400 self-center">
                      +{zoneStats.cold_main.count - 3}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 右侧：门侧调味饮品架 */}
            <div
              onClick={() => onSelectZone(selectedZone === 'door_shelf' ? 'all' : 'door_shelf')}
              className={`p-3.5 rounded-2xl cursor-pointer transition-all border text-left relative group ${
                selectedZone === 'door_shelf'
                  ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 shadow-ambient-caramel ring-2 ring-amber-500/20'
                  : 'bg-white/95 dark:bg-[#1E201D] border-black/[0.05] dark:border-white/[0.06] hover:border-amber-300 dark:hover:border-amber-700 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-7 h-7 rounded-xl bg-amber-100/80 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                    <Wine className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100">门侧架</span>
                    <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">调料 · 饮品</p>
                  </div>
                </div>

                <span
                  className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                    selectedZone === 'door_shelf'
                      ? 'bg-amber-600 text-white'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  {zoneStats.door_shelf.count} 样
                </span>
              </div>

              {zoneStats.door_shelf.sampleNames.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {zoneStats.door_shelf.sampleNames.map((name, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 rounded bg-stone-50 dark:bg-stone-800/80 text-[10px] text-stone-600 dark:text-stone-300 border border-black/[0.03]"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 果蔬锁鲜抽屉 (横向全宽大抽屉) */}
          <div
            onClick={() => onSelectZone(selectedZone === 'cold_drawer' ? 'all' : 'cold_drawer')}
            className={`p-3.5 rounded-2xl cursor-pointer transition-all border text-left relative group ${
              selectedZone === 'cold_drawer'
                ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-600 shadow-ambient-emerald ring-2 ring-emerald-500/20'
                : 'bg-white/95 dark:bg-[#1E201D] border-black/[0.05] dark:border-white/[0.06] hover:border-emerald-300 dark:hover:border-emerald-700 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <Apple className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                      果蔬控湿锁鲜抽屉
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100/70 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-medium">
                      恒湿保脆
                    </span>
                  </div>
                  <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">
                    生菜 · 番茄 · 菌菇 · 黄瓜 · 浆果
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {zoneStats.cold_drawer.urgentCount > 0 && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-medium border border-rose-200 dark:border-rose-900 animate-pulse">
                    {zoneStats.cold_drawer.urgentCount} 临期
                  </span>
                )}
                <span
                  className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                    selectedZone === 'cold_drawer'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  {zoneStats.cold_drawer.count} 样
                </span>
              </div>
            </div>

            {zoneStats.cold_drawer.sampleNames.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {zoneStats.cold_drawer.sampleNames.map((name, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md bg-stone-50 dark:bg-stone-800/80 text-[10px] text-stone-600 dark:text-stone-300 border border-black/[0.03]"
                  >
                    {name}
                  </span>
                ))}
                {zoneStats.cold_drawer.count > 3 && (
                  <span className="text-[10px] text-stone-400 self-center">
                    +{zoneStats.cold_drawer.count - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 冷冻区与常温储物 (下部双舱) */}
        <div className="pt-2 border-t border-dashed border-stone-200 dark:border-stone-800 space-y-1.5">
          <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-stone-500 dark:text-stone-400">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>下层 · 深冷速冻 & 常温储物</span>
            </div>
            <span className="text-[10px] font-mono text-stone-400">-18℃ 结晶速冻</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* 深冷速冻室 */}
            <div
              onClick={() => onSelectZone(selectedZone === 'freezer' ? 'all' : 'freezer')}
              className={`p-3.5 rounded-2xl cursor-pointer transition-all border text-left relative group ${
                selectedZone === 'freezer'
                  ? 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 shadow-ambient-emerald ring-2 ring-blue-500/20'
                  : 'bg-white/95 dark:bg-[#1E201D] border-black/[0.05] dark:border-white/[0.06] hover:border-blue-300 dark:hover:border-blue-700 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-blue-100/80 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                    <Snowflake className="w-3.5 h-3.5 text-blue-600 dark:text-blue-300" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                      深冷速冻室 (-18℃)
                    </span>
                    <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">
                      牛排 · 排骨 · 鲜虾 · 速冻面点
                    </p>
                  </div>
                </div>

                <span
                  className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                    selectedZone === 'freezer'
                      ? 'bg-blue-600 text-white'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  {zoneStats.freezer.count} 样
                </span>
              </div>

              {zoneStats.freezer.sampleNames.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {zoneStats.freezer.sampleNames.map((name, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-stone-50 dark:bg-stone-800/80 text-[10px] text-stone-600 dark:text-stone-300 border border-black/[0.03]"
                    >
                      {name}
                    </span>
                  ))}
                  {zoneStats.freezer.count > 3 && (
                    <span className="text-[10px] text-stone-400 self-center">
                      +{zoneStats.freezer.count - 3}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 常温干燥储物 */}
            <div
              onClick={() => onSelectZone(selectedZone === 'pantry' ? 'all' : 'pantry')}
              className={`p-3.5 rounded-2xl cursor-pointer transition-all border text-left relative group ${
                selectedZone === 'pantry'
                  ? 'bg-stone-100 dark:bg-stone-800 border-stone-400 dark:border-stone-500 shadow-soft ring-2 ring-stone-500/20'
                  : 'bg-white/95 dark:bg-[#1E201D] border-black/[0.05] dark:border-white/[0.06] hover:border-stone-300 dark:hover:border-stone-700 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0">
                    <Package className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                      常温干燥区 (避光)
                    </span>
                    <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">
                      大米 · 面粉 · 土豆洋葱 · 干货
                    </p>
                  </div>
                </div>

                <span
                  className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                    selectedZone === 'pantry'
                      ? 'bg-stone-700 text-white'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  {zoneStats.pantry.count} 样
                </span>
              </div>

              {zoneStats.pantry.sampleNames.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {zoneStats.pantry.sampleNames.map((name, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-stone-50 dark:bg-stone-800/80 text-[10px] text-stone-600 dark:text-stone-300 border border-black/[0.03]"
                    >
                      {name}
                    </span>
                  ))}
                  {zoneStats.pantry.count > 3 && (
                    <span className="text-[10px] text-stone-400 self-center">
                      +{zoneStats.pantry.count - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 底部当前选中的温区状态微条 */}
      {selectedZone !== 'all' && activeZoneMeta && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-forest-50/80 dark:bg-forest-950/40 border border-forest-200/60 dark:border-forest-800/50 text-xs">
          <div className="flex items-center gap-2 truncate">
            {activeZoneMeta.icon}
            <span className="font-semibold text-forest-900 dark:text-forest-100">
              已聚焦【{activeZoneMeta.name}】
            </span>
            <span className="text-forest-700/80 dark:text-forest-400 truncate">
              · {activeZoneMeta.tempHint} · 共 {zoneStats[selectedZone].count} 样
            </span>
          </div>

          <button
            type="button"
            onClick={() => onSelectZone('all')}
            className="text-forest-800 dark:text-forest-300 font-medium hover:underline shrink-0 ml-2"
          >
            还原全部
          </button>
        </div>
      )}
    </div>
  );
}
