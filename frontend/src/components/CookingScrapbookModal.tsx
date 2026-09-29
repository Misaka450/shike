'use client';

import React, { useState, useRef, useEffect } from 'react';
import { RecipeRecommendation } from '@/lib/types';
import { Camera, Sparkles, Star, Download, X, Heart, BookOpen, Check } from 'lucide-react';
import { compressImage } from '@/lib/imageCompress';

export interface ScrapbookEntry {
  id: string;
  recipeName: string;
  recipeCategory: string;
  imageUrl: string;
  cookedAt: string;
  mealPeriodName: string;
  chefName: string;
  rating: number;
  note: string;
  ingredientsCount: number;
}

const STORAGE_KEY = 'shike_scrapbook_entries_v1';

export function getStoredScrapbookEntries(): ScrapbookEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveScrapbookEntry(entry: ScrapbookEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getStoredScrapbookEntries();
    const updated = [entry, ...existing.filter((e) => e.id !== entry.id)].slice(0, 100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save scrapbook entry:', err);
  }
}

interface CookingScrapbookModalProps {
  recipe: RecipeRecommendation;
  mealPeriodName?: string;
  currentUser?: { username?: string; nickname?: string } | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export default function CookingScrapbookModal({
  recipe,
  mealPeriodName = '治愈晚餐',
  currentUser,
  onClose,
  onToast,
}: CookingScrapbookModalProps) {
  const [photoUrl, setPhotoUrl] = useState<string>(recipe.image_url || '/images/default-dish.webp');
  const [rating, setRating] = useState<number>(5);
  const [note, setNote] = useState<string>('热气腾腾出锅，香气扑鼻，这一顿给生活加满元气！');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [hasSaved, setHasSaved] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chefName = currentUser?.nickname || currentUser?.username || '大厨包包 & 恺恺';

  // 当日格式化日期
  const todayStr = React.useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  }, []);

  // 更换真实照片
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 1200, 0.85);
      setPhotoUrl(compressed);
      onToast('已更新成品照片！');
    } catch {
      onToast('照片处理失败，请重试');
    }
  };

  // 保存到本地手账记录
  useEffect(() => {
    const entry: ScrapbookEntry = {
      id: `${recipe.id}-${Date.now()}`,
      recipeName: recipe.name,
      recipeCategory: recipe.category,
      imageUrl: photoUrl,
      cookedAt: todayStr,
      mealPeriodName,
      chefName,
      rating,
      note,
      ingredientsCount: recipe.ingredients?.length || 0,
    };
    saveScrapbookEntry(entry);
    setHasSaved(true);
  }, []);

  // 纯前端 Canvas 渲染并导出高质量拍立得图片
  const handleExportPolaroid = async () => {
    try {
      setIsExporting(true);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      // 拍立得卡片尺寸 (800 x 1060)
      const width = 800;
      const height = 1060;
      canvas.width = width;
      canvas.height = height;

      // 1. 底卡温润燕麦米白纸张底色
      ctx.fillStyle = '#FAF8F5';
      ctx.fillRect(0, 0, width, height);

      // 微纸张纹理质感边框
      ctx.strokeStyle = 'rgba(28, 29, 27, 0.08)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, width - 2, height - 2);

      // 2. 加载并绘制成品照片
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = photoUrl;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => {
          // 容灾兜底
          resolve();
        };
      });

      // 照片绘制区域
      const photoX = 50;
      const photoY = 50;
      const photoW = 700;
      const photoH = 560;

      // 照片外阴影底框
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(photoX, photoY, photoW, photoH);

      if (img.width > 0) {
        // 等比裁剪居中绘制
        const imgRatio = img.width / img.height;
        const targetRatio = photoW / photoH;
        let sWidth = img.width;
        let sHeight = img.height;
        let sx = 0;
        let sy = 0;

        if (imgRatio > targetRatio) {
          sWidth = img.height * targetRatio;
          sx = (img.width - sWidth) / 2;
        } else {
          sHeight = img.width / targetRatio;
          sy = (img.height - sHeight) / 2;
        }
        ctx.drawImage(img, sx, sy, sWidth, sHeight, photoX, photoY, photoW, photoH);
      } else {
        ctx.fillStyle = '#E5E7EB';
        ctx.fillRect(photoX, photoY, photoW, photoH);
      }

      // 照片内边框
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.lineWidth = 1;
      ctx.strokeRect(photoX, photoY, photoW, photoH);

      // 3. 拍立得下部生活手账信息区 (Y: 650)
      const textStartY = 660;

      // 菜谱名称
      ctx.fillStyle = '#1C1D1B';
      ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif';
      ctx.fillText(recipe.name, 60, textStartY);

      // 日期与餐段
      ctx.fillStyle = '#8C827A';
      ctx.font = '500 18px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillText(`${todayStr} · ${mealPeriodName} · 共消灭 ${recipe.ingredients?.length || 3} 样食材`, 60, textStartY + 38);

      // 主理人温情微标
      ctx.fillStyle = '#1B382B';
      ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillText(`👨‍🍳 主理人：${chefName}`, 60, textStartY + 78);

      // 星级评分
      let starStr = '';
      for (let i = 0; i < rating; i++) starStr += '★ ';
      for (let i = rating; i < 5; i++) starStr += '☆ ';
      ctx.fillStyle = '#D97706';
      ctx.font = '24px sans-serif';
      ctx.fillText(starStr.trim(), 60, textStartY + 118);

      // 手记心声便签 (带柔和淡背景)
      const noteBoxY = textStartY + 140;
      ctx.fillStyle = '#F2EFEB';
      ctx.beginPath();
      ctx.roundRect(60, noteBoxY, 680, 80, 16);
      ctx.fill();

      ctx.fillStyle = '#44403C';
      ctx.font = 'italic 18px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      // 单行截断展示
      const displayNote = note.length > 32 ? note.slice(0, 31) + '…' : note;
      ctx.fillText(`“ ${displayNote} ”`, 85, noteBoxY + 48);

      // 4. 右下角复古深红火漆印邮戳
      const stampCenterX = 680;
      const stampCenterY = 960;
      const stampRadius = 45;

      ctx.strokeStyle = 'rgba(185, 28, 28, 0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(stampCenterX, stampCenterY, stampRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(185, 28, 28, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(stampCenterX, stampCenterY, stampRadius - 5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(185, 28, 28, 0.85)';
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('食刻 AI', stampCenterX, stampCenterY - 12);
      ctx.font = '600 11px sans-serif';
      ctx.fillText('柴米油盐', stampCenterX, stampCenterY + 6);
      ctx.font = '10px monospace';
      ctx.fillText(todayStr.slice(0, 4), stampCenterX, stampCenterY + 22);
      ctx.textAlign = 'left';

      // 底部品牌微注
      ctx.fillStyle = '#A8A29E';
      ctx.font = '12px monospace';
      ctx.fillText('SHIKE AI · FOOD SCRAPBOOK', 60, height - 35);

      // 导出下载
      const dataUrl = canvas.toDataURL('image/png', 0.95);
      const link = document.createElement('a');
      link.download = `食刻手账-${recipe.name}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      onToast('已生成拍立得手账长图并开始下载！');
    } catch (err: any) {
      console.error(err);
      onToast('生成手账图片失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#FAFAF7] dark:bg-[#1C1D1B] rounded-3xl p-5 sm:p-6 shadow-modal border border-black/10 dark:border-white/10 space-y-4 max-h-[92vh] overflow-y-auto">
        {/* 顶部标题与关闭 */}
        <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-stone-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">
                生活拍立得 · 美食手账
              </h3>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                恭喜下厨大功告成！记录属于两个人的烟火气瞬间
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

        {/* 拍立得实物卡片预览 */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#252724] border border-stone-200 dark:border-stone-700/80 shadow-card space-y-3.5 relative overflow-hidden">
          {/* 照片区域 */}
          <div className="relative rounded-xl overflow-hidden aspect-[4/3] bg-stone-100 dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 group">
            <img src={photoUrl} alt={recipe.name} className="w-full h-full object-cover" />

            {/* 快捷换图按钮浮层 */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-1.5 rounded-full bg-white/90 text-stone-900 text-xs font-medium shadow-md flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>换一张真实成品照</span>
              </button>
            </div>

            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handlePhotoSelect}
              className="hidden"
            />
          </div>

          {/* 拍立得手写信息区 */}
          <div className="space-y-2 pt-1 text-left">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-lg text-stone-900 dark:text-stone-100">
                  {recipe.name}
                </h4>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                  {todayStr} · {mealPeriodName} · 消耗 {recipe.ingredients?.length || 3} 样在库食材
                </p>
              </div>

              {/* 星级打分 */}
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-0.5 text-amber-500 hover:scale-110 active:scale-95 transition-transform"
                    title={`打 ${star} 星`}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        star <= rating ? 'fill-amber-500 text-amber-500' : 'text-stone-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-forest-800 dark:text-forest-300 font-medium">
              👨‍🍳 主理人：{chefName}
            </div>

            {/* 心得手记输入 */}
            <div className="mt-2">
              <label className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 block mb-1">
                今晚的美食手记心得：
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={45}
                placeholder="记录今晚的味道感受…"
                className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-800 text-xs focus:outline-none focus:border-forest-600 dark:focus:border-forest-400"
              />
            </div>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 rounded-2xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-700 dark:text-stone-300 text-xs font-medium transition-all flex items-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>更换实拍图</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 text-xs font-medium hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-all"
            >
              稍后查看
            </button>
            <button
              type="button"
              disabled={isExporting}
              onClick={handleExportPolaroid}
              className="px-5 py-2.5 rounded-2xl bg-forest-800 hover:bg-forest-900 text-white text-xs font-semibold shadow-soft flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? '导出中...' : '保存拍立得手账'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
