'use client';

import React from 'react';

interface EmotionalEmptyStateProps {
  type: 'recipes' | 'fridge' | 'filter';
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
  };
}

/**
 * 治愈手绘风美食锅与热气微矢量插画 (用于菜谱/灵感空状态)
 */
export function CookingPotIllustration({ className = 'w-32 h-32' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* 底部柔和光晕底座 */}
      <ellipse cx="80" cy="138" rx="52" ry="10" fill="currentColor" className="text-forest-900/5 dark:text-white/5" />

      {/* 温暖蒸气 1 */}
      <path
        d="M62 48C58 40 68 32 64 24"
        stroke="currentColor"
        className="text-caramel-400/70 dark:text-caramel-400/50"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* 温暖蒸气 2 */}
      <path
        d="M80 44C76 34 86 26 82 16"
        stroke="currentColor"
        className="text-caramel-500/80 dark:text-caramel-400/70"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* 温暖蒸气 3 */}
      <path
        d="M98 48C94 40 104 32 100 24"
        stroke="currentColor"
        className="text-caramel-400/70 dark:text-caramel-400/50"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* 锅盖手柄 */}
      <rect x="73" y="48" width="14" height="7" rx="3.5" fill="#C86D2C" />
      <path d="M76 55H84V59H76V55Z" fill="#9A4623" />

      {/* 锅身外壳 (双耳搪瓷铸铁锅) */}
      <rect x="36" y="70" width="88" height="52" rx="16" fill="currentColor" className="text-forest-800 dark:text-forest-700" />
      <path
        d="M36 82C36 75.3726 41.3726 70 48 70H112C118.627 70 124 75.3726 124 82V88H36V82Z"
        fill="currentColor"
        className="text-forest-700 dark:text-forest-600"
      />

      {/* 锅身左耳与右耳 */}
      <path
        d="M36 78H24C21.7909 78 20 79.7909 20 82V84C20 86.2091 21.7909 88 24 88H36V78Z"
        fill="#1C3229"
      />
      <path
        d="M124 78H136C138.209 78 140 79.7909 140 82V84C140 86.2091 138.209 88 136 88H124V78Z"
        fill="#1C3229"
      />

      {/* 锅盖边缘装饰高光 */}
      <line x1="42" y1="74" x2="118" y2="74" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" />

      {/* 锅身美味料理露出的胡萝卜与罗勒叶点缀 */}
      <circle cx="60" cy="65" r="5" fill="#E0853D" />
      <path d="M96 62C96 62 104 60 106 66C104 68 98 68 96 62Z" fill="#6F9C86" />
      <circle cx="82" cy="64" r="3.5" fill="#F59E0B" />

      {/* 锅前身可爱眨眼/微笑治愈微表情 */}
      <path
        d="M72 96C74 99 86 99 88 96"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="64" cy="92" r="2.5" fill="rgba(255,255,255,0.85)" />
      <circle cx="96" cy="92" r="2.5" fill="rgba(255,255,255,0.85)" />
      {/* 腮红 */}
      <circle cx="59" cy="96" r="3" fill="#E0853D" opacity="0.6" />
      <circle cx="101" cy="96" r="3" fill="#E0853D" opacity="0.6" />

      {/* 治愈微星光闪耀点缀 */}
      <path
        d="M130 36L132 41L137 43L132 45L130 50L128 45L123 43L128 41L130 36Z"
        fill="#F59E0B"
        opacity="0.85"
      />
      <path
        d="M26 48L27.5 52L31.5 53.5L27.5 55L26 59L24.5 55L20.5 53.5L24.5 52L26 48Z"
        fill="#C86D2C"
        opacity="0.7"
      />
    </svg>
  );
}

/**
 * 治愈手绘风智能冰箱微矢量插画 (用于冰箱空状态)
 */
export function FridgeIllustration({ className = 'w-32 h-32' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* 底部柔和光晕底座 */}
      <ellipse cx="80" cy="142" rx="48" ry="8" fill="currentColor" className="text-forest-900/5 dark:text-white/5" />

      {/* 冰箱主体柜身 */}
      <rect
        x="42"
        y="24"
        width="76"
        height="112"
        rx="14"
        fill="currentColor"
        className="text-stone-100 dark:text-stone-800"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* 冷藏室门 (上半段) */}
      <path
        d="M45 27C45 26 46 25 47 25H113C114 25 115 26 115 27V72H45V27Z"
        fill="currentColor"
        className="text-white dark:text-[#252824]"
      />
      {/* 分隔缝隙 */}
      <line x1="43" y1="74" x2="117" y2="74" stroke="currentColor" className="text-stone-300 dark:text-stone-700" strokeWidth="2.5" />

      {/* 冷冻室门 (下半段) */}
      <path
        d="M45 76H115V122C115 129 109 135 102 135H58C51 135 45 129 45 122V76Z"
        fill="currentColor"
        className="text-stone-50 dark:text-[#222521]"
      />

      {/* 把手 (拉丝木质/焦糖色质感) */}
      <rect x="50" y="44" width="4.5" height="18" rx="2.25" fill="#CD7438" />
      <rect x="50" y="86" width="4.5" height="22" rx="2.25" fill="#CD7438" />

      {/* 冰箱贴小画: 绿色健康小嫩芽 */}
      <rect x="88" y="38" width="18" height="20" rx="3" fill="#E2ECE6" className="dark:fill-forest-900" />
      <path
        d="M97 52V44M97 46C99 44 103 44 104 47C104 49 101 50 97 48"
        stroke="#36634F"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* 磁铁纽扣 */}
      <circle cx="97" cy="36" r="2.2" fill="#E0853D" />

      {/* 微笑治愈表情 */}
      <path
        d="M74 104C77 107 83 107 86 104"
        stroke="currentColor"
        className="text-stone-400 dark:text-stone-500"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="71" cy="100" r="2" fill="currentColor" className="text-stone-400 dark:text-stone-500" />
      <circle cx="89" cy="100" r="2" fill="currentColor" className="text-stone-400 dark:text-stone-500" />

      {/* 闪耀小星芒 */}
      <path
        d="M128 32L129.5 36.5L134 38L129.5 39.5L128 44L126.5 39.5L122 38L126.5 36.5L128 32Z"
        fill="#36634F"
        opacity="0.8"
      />
      <path
        d="M28 66L29.5 70.5L34 72L29.5 73.5L28 78L26.5 73.5L22 72L26.5 70.5L28 66Z"
        fill="#CD7438"
        opacity="0.75"
      />
    </svg>
  );
}

export default function EmotionalEmptyState({
  type,
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmotionalEmptyStateProps) {
  return (
    <div className="bg-white dark:bg-[#1E201D] rounded-3xl p-8 sm:p-12 text-center border border-[#1C1D1B]/[0.06] dark:border-white/[0.08] shadow-card flex flex-col items-center justify-center transition-all duration-300">
      <div className="mb-4 transform hover:scale-105 transition-transform duration-300 cursor-default">
        {type === 'fridge' ? <FridgeIllustration /> : <CookingPotIllustration />}
      </div>

      <h3 className="font-bold text-base sm:text-lg text-stone-800 dark:text-stone-100 tracking-tight">
        {title}
      </h3>

      <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto mt-1.5 leading-relaxed">
        {description}
      </p>

      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-4 py-2 rounded-full text-xs font-medium text-stone-600 dark:text-stone-300 bg-stone-100/90 dark:bg-stone-800/80 hover:bg-stone-200 dark:hover:bg-stone-700/80 border border-stone-200/60 dark:border-stone-700/60 transition-all active:scale-95 flex items-center gap-1.5 shadow-xs"
            >
              {secondaryAction.icon}
              <span>{secondaryAction.label}</span>
            </button>
          )}

          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className="btn-shimmer-forest px-5 py-2 rounded-full bg-forest-900 hover:bg-forest-800 dark:bg-forest-700 dark:hover:bg-forest-600 text-white text-xs font-medium shadow-ambient-emerald transition-all active:scale-95 flex items-center gap-1.5"
            >
              {primaryAction.icon}
              <span>{primaryAction.label}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
