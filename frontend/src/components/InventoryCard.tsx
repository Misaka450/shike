'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { InventoryItem } from '@/lib/types';

export interface FreshnessInfo {
  percent: number;
  label: string;
  barGradient: string;
  textColor: string;
  statusBg: string;
}

/**
 * 根据 days_remaining 计算保鲜度
 * - >5天为极鲜 100%~80% 翡翠绿
 * - 3~5天为良好 75%~50% 抹茶绿
 * - 1~2天为赏味临界 45%~20% 焦糖色
 * - <=0天为已到期 10% 赭红色
 */
export function getFreshnessGauge(days: number): FreshnessInfo {
  if (days > 5) {
    const percent = Math.min(100, Math.max(80, 80 + Math.round((days - 5) * 4)));
    return {
      percent,
      label: '极鲜',
      barGradient: 'from-emerald-400 via-emerald-500 to-teal-500',
      textColor: 'text-emerald-700 dark:text-emerald-400',
      statusBg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/50',
    };
  } else if (days >= 3) {
    const percent = Math.round(50 + ((days - 3) / 2) * 25);
    return {
      percent,
      label: '良好',
      barGradient: 'from-lime-500 via-forest-500 to-forest-600',
      textColor: 'text-forest-700 dark:text-forest-400',
      statusBg: 'bg-forest-50 text-forest-700 dark:bg-forest-950/40 dark:text-forest-300 border-forest-200/50',
    };
  } else if (days >= 1) {
    const percent = days === 1 ? 25 : 45;
    return {
      percent,
      label: '赏味临界',
      barGradient: 'from-amber-400 via-caramel-500 to-amber-600',
      textColor: 'text-caramel-700 dark:text-caramel-400',
      statusBg: 'bg-caramel-50 text-caramel-700 dark:bg-caramel-950/40 dark:text-caramel-300 border-caramel-200/50',
    };
  } else {
    return {
      percent: 10,
      label: '已到期',
      barGradient: 'from-rose-500 via-rose-600 to-red-600',
      textColor: 'text-rose-600 dark:text-rose-400',
      statusBg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200/50',
    };
  }
}

interface InventoryCardProps {
  item: InventoryItem;
  onConsume: (id: number, name: string) => void;
  onRemove: (id: number, name: string) => void;
  swipedCardId: number | null;
  setSwipedCardId: (id: number | null) => void;
}

const ACTION_WIDTH = 140; // 70px each for 2 action buttons

export default function InventoryCard({
  item,
  onConsume,
  onRemove,
  swipedCardId,
  setSwipedCardId,
}: InventoryCardProps) {
  const isRed = item.urgency_level === 'red';
  const isYellow = item.urgency_level === 'yellow';
  const gauge = getFreshnessGauge(item.days_remaining);

  const isOpen = swipedCardId === item.id;
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // 当其他卡片激活滑动时，自动平滑复位收起本卡片
  useEffect(() => {
    if (!isOpen && offsetX !== 0) {
      setOffsetX(0);
    }
  }, [isOpen, offsetX]);

  const touchStartRef = useRef<{
    x: number;
    y: number;
    startOffset: number;
  } | null>(null);
  const isHorizontalRef = useRef<boolean | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      startOffset: isOpen ? -ACTION_WIDTH : 0,
    };
    isHorizontalRef.current = null;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    // 智能判定手势方向：区分横向滑动手势与纵向页面滚动
    if (isHorizontalRef.current === null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        isHorizontalRef.current = Math.abs(dx) >= Math.abs(dy);
      }
    }

    if (!isHorizontalRef.current) {
      return; // 纵向滚动放行，不拦截
    }

    let currentX = touchStartRef.current.startOffset + dx;
    // 阻尼回弹限制：向右滑加阻尼，向左滑超过操作区加阻尼
    if (currentX > 0) {
      currentX = currentX * 0.15;
    } else if (currentX < -ACTION_WIDTH) {
      currentX = -ACTION_WIDTH + (currentX + ACTION_WIDTH) * 0.2;
    }

    setOffsetX(currentX);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (!touchStartRef.current) return;

    // 手势阈值判断：左滑超过 60px 吸附展开，否则平滑归位
    if (offsetX < -60) {
      setOffsetX(-ACTION_WIDTH);
      setSwipedCardId(item.id);
    } else {
      setOffsetX(0);
      if (isOpen) {
        setSwipedCardId(null);
      }
    }

    touchStartRef.current = null;
    isHorizontalRef.current = null;
  };

  const handleCardClick = () => {
    if (offsetX !== 0 || isOpen) {
      setOffsetX(0);
      setSwipedCardId(null);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-card hover:shadow-card-hover select-none group">
      {/* 移动端手势滑出层：右侧两个操作色块按钮【做掉/消耗】（翡翠绿）与【移出】（玫瑰红） */}
      <div className="absolute inset-y-0 right-0 flex items-stretch z-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOffsetX(0);
            setSwipedCardId(null);
            onConsume(item.id, item.name);
          }}
          className="w-[70px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white flex flex-col items-center justify-center gap-1 transition-colors px-1 text-center"
          title="做掉/消耗"
        >
          <Check className="w-4 h-4" />
          <span className="text-[11px] font-semibold tracking-tight">消耗</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOffsetX(0);
            setSwipedCardId(null);
            onRemove(item.id, item.name);
          }}
          className="w-[70px] bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white flex flex-col items-center justify-center gap-1 transition-colors px-1 text-center"
          title="移出"
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-[11px] font-semibold tracking-tight">移出</span>
        </button>
      </div>

      {/* 前景卡片主体：支持触摸平滑位移与阻尼弹簧回弹 */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardClick}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging
            ? 'none'
            : 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        className={`relative z-10 p-4 rounded-2xl bg-white dark:bg-[#1E201D] border transition-colors duration-200 cursor-pointer sm:cursor-default ${
          isRed
            ? 'border-rose-300/80 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/20'
            : isYellow
            ? 'border-caramel-300/80 dark:border-caramel-900/40 bg-caramel-50/30 dark:bg-caramel-950/20'
            : 'border-[#1C1D1B]/[0.06] dark:border-white/[0.08]'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`w-2 h-10 rounded-full shrink-0 ${
                isRed
                  ? 'bg-rose-500 animate-slow-pulse'
                  : isYellow
                  ? 'bg-caramel-500 animate-slow-pulse'
                  : 'bg-forest-600'
              }`}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">
                  {item.name}
                </span>
                <span className="text-[10px] text-stone-500 dark:text-stone-400 px-2 py-0.5 bg-stone-100 dark:bg-stone-800 rounded-md shrink-0">
                  {item.category}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-stone-400 dark:text-stone-500 mt-1 flex-wrap">
                <span>{item.quantity}</span>
                <span>·</span>
                <span>{item.storage_location}</span>
                <span>·</span>
                <span
                  className={`font-medium inline-flex items-center gap-1 ${
                    isRed
                      ? 'text-rose-600 dark:text-rose-400'
                      : isYellow
                      ? 'text-caramel-600 dark:text-caramel-400'
                      : 'text-forest-700 dark:text-forest-400'
                  }`}
                >
                  {(isRed || isYellow) && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full inline-block animate-ping ${
                        isRed ? 'bg-rose-500' : 'bg-caramel-500'
                      }`}
                    />
                  )}
                  <span>
                    {item.days_remaining <= 0
                      ? '已到期'
                      : `最佳赏味剩 ${item.days_remaining} 天`}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* 桌面端常规快速操作按钮（移动端向左轻滑亦可露出消耗与移出操作） */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onConsume(item.id, item.name);
              }}
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-stone-400 dark:text-stone-500 hover:text-forest-700 dark:hover:text-forest-300 hover:bg-forest-50 dark:hover:bg-forest-950/60 transition-colors flex items-center gap-1 active:scale-95"
              title="标记吃完"
            >
              <Check className="w-4 h-4" />
              <span className="text-[11px]">吃完</span>
            </button>
          </div>
        </div>

        {/* 卡片底部嵌入一条精致极细（高度约 3.5px~4px）的圆角保鲜度微进度槽与渐变进度条 */}
        <div className="mt-3 pt-2.5 border-t border-stone-100 dark:border-stone-800/80">
          <div className="flex items-center justify-between text-[11px] mb-1.5 leading-none">
            <span className="text-stone-400 dark:text-stone-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-forest-400/60 dark:bg-forest-500/60" />
              <span className="text-[10.5px]">风味保鲜度</span>
            </span>
            <div className="flex items-center gap-1.5 font-mono">
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${gauge.statusBg}`}
              >
                {gauge.label}
              </span>
              <span
                className={`text-[11px] font-bold tabular-nums ${gauge.textColor}`}
              >
                {gauge.percent}%
              </span>
            </div>
          </div>
          <div className="w-full h-[3.5px] bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${gauge.barGradient} transition-all duration-500`}
              style={{ width: `${gauge.percent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
