'use client';

import React, { useState, useEffect } from 'react';
import { X, BookOpen, Star, Calendar, Trash2 } from 'lucide-react';
import { getStoredScrapbookEntries, ScrapbookEntry } from './CookingScrapbookModal';

interface ScrapbookGalleryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export default function ScrapbookGalleryDrawer({
  isOpen,
  onClose,
  onToast,
}: ScrapbookGalleryDrawerProps) {
  const [entries, setEntries] = useState<ScrapbookEntry[]>([]);

  useEffect(() => {
    if (isOpen) {
      setEntries(getStoredScrapbookEntries());
    }
  }, [isOpen]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('确定要删除这张美食手账拍立得吗？')) return;
    const filtered = entries.filter((item) => item.id !== id);
    setEntries(filtered);
    localStorage.setItem('shike_scrapbook_entries_v1', JSON.stringify(filtered));
    onToast('已删除手账条目');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#FAFAF7] dark:bg-[#1E201D] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-modal border border-black/10 dark:border-white/10 space-y-4 max-h-[88vh] overflow-y-auto">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-stone-800 pb-3.5">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-forest-100 dark:bg-forest-900/40 text-forest-700 dark:text-forest-300 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">
                双人美食手账册 · 柴米油盐记
              </h3>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                已记录 {entries.length} 顿温馨下厨回忆
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 手账列表 */}
        {entries.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
              手账册还是空白的
            </p>
            <p className="text-xs text-stone-400 max-w-xs mx-auto">
              做完一道菜点击「下厨完成」，系统将自动为你生成专属的拍立得手账长图！
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#252724] border border-stone-200 dark:border-stone-700/80 shadow-card space-y-2.5 relative group"
              >
                {/* 拍立得照片缩略图 */}
                <div className="relative rounded-xl overflow-hidden aspect-[4/3] bg-stone-100 dark:bg-stone-800">
                  <img
                    src={entry.imageUrl}
                    alt={entry.recipeName}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] text-white font-mono">
                    {entry.mealPeriodName}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(entry.id, e)}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-600"
                    title="删除"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* 文字信息 */}
                <div className="space-y-1 text-left">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100 truncate">
                      {entry.recipeName}
                    </h4>
                    <div className="flex items-center text-amber-500 text-xs">
                      {Array.from({ length: entry.rating }).map((_, i) => (
                        <Star key={i} className="w-3 h-3 fill-amber-500" />
                      ))}
                    </div>
                  </div>

                  <p className="text-[11px] text-stone-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{entry.cookedAt}</span>
                    <span>· {entry.chefName}</span>
                  </p>

                  {entry.note && (
                    <p className="text-xs text-stone-600 dark:text-stone-300 italic bg-stone-50 dark:bg-stone-800/60 p-2 rounded-xl border border-black/[0.03]">
                      “{entry.note}”
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
