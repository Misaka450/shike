'use client';

import React, { useState } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Minimize2,
  Clock,
  Sparkles,
  ListFilter,
  Plus,
} from 'lucide-react';
import { RecipeRecommendation } from '@/lib/types';

interface KitchenCookModeProps {
  recipe: RecipeRecommendation;
  onExit: () => void;
  onClose: () => void;
  cookingTimer: number;
  setCookingTimer: React.Dispatch<React.SetStateAction<number>>;
  isTimerRunning: boolean;
  setIsTimerRunning: React.Dispatch<React.SetStateAction<boolean>>;
  onCook: (recipe: RecipeRecommendation) => Promise<void>;
  isCookingSuccess: boolean;
  cookingMessage: string | null;
}

export default function KitchenCookMode({
  recipe,
  onExit,
  onClose,
  cookingTimer,
  setCookingTimer,
  isTimerRunning,
  setIsTimerRunning,
  onCook,
  isCookingSuccess,
  cookingMessage,
}: KitchenCookModeProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [viewMode, setViewMode] = useState<'step' | 'all'>('step');

  const totalSteps = recipe.instructions.length;
  const currentStep = recipe.instructions[currentStepIndex] || '';

  const addTimerSeconds = (sec: number) => {
    setCookingTimer((prev) => prev + sec);
  };

  const handleNextStep = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#121412] text-stone-100 flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* 顶部导航与大字模式状态栏 */}
      <header className="px-4 sm:px-8 py-3.5 sm:py-4 border-b border-white/10 bg-[#181A18]/90 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-stone-200 text-xs sm:text-sm font-medium transition-all"
            title="退出大字模式返回普通视图"
          >
            <Minimize2 className="w-4 h-4 text-caramel-400" />
            <span className="hidden sm:inline">退出大字模式</span>
            <span className="sm:hidden">退出大字</span>
          </button>

          <div className="h-4 w-px bg-white/15" />

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-forest-800 text-forest-200 text-xs font-semibold border border-forest-600/40">
              灶台模式
            </span>
            <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-[160px] sm:max-w-xs md:max-w-md">
              {recipe.name}
            </h2>
          </div>
        </div>

        {/* 顶部操作快捷项 */}
        <div className="flex items-center gap-2">
          {/* 切换食材备料抽屉 */}
          <button
            onClick={() => setShowIngredients(!showIngredients)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all active:scale-95 ${
              showIngredients
                ? 'bg-caramel-500 text-white shadow-soft'
                : 'bg-white/10 hover:bg-white/15 text-stone-300'
            }`}
          >
            <ListFilter className="w-4 h-4" />
            <span>备料清单 ({recipe.ingredients.length})</span>
          </button>

          {/* 切换单步专注 / 全部展开 */}
          <button
            onClick={() => setViewMode(viewMode === 'step' ? 'all' : 'step')}
            className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-stone-300 text-xs font-medium transition-all"
          >
            <span>{viewMode === 'step' ? '全部步骤' : '单步专注'}</span>
          </button>

          {/* 彻底关闭 */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-stone-300 hover:text-white flex items-center justify-center transition-all ml-1"
            title="关闭模态框"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 大进度条指示 */}
      <div className="w-full bg-stone-900 h-1.5">
        <div
          className="bg-gradient-to-r from-forest-500 to-caramel-500 h-full transition-all duration-300 ease-out"
          style={{ width: `${Math.round(((currentStepIndex + 1) / totalSteps) * 100)}%` }}
        />
      </div>

      {/* 主体烹饪体验区 */}
      <div className="flex-1 overflow-y-auto flex flex-col p-4 sm:p-8 lg:p-10 max-w-5xl mx-auto w-full justify-between">
        {/* Toast / 成功提示 */}
        {cookingMessage && (
          <div className="p-4 sm:p-5 rounded-3xl bg-forest-900/90 border border-forest-500/50 text-white text-base sm:text-lg font-bold flex items-center gap-3 shadow-ambient-emerald animate-bounce mb-6">
            <CheckCircle2 className="w-6 h-6 text-forest-300 shrink-0" />
            <span>{cookingMessage}</span>
          </div>
        )}

        {/* 食材备料快速悬浮卡片 (若展开) */}
        {showIngredients && (
          <div className="mb-6 p-4 sm:p-6 rounded-3xl bg-[#1C1E1B] border border-white/10 shadow-modal animate-in slide-in-from-top-4 duration-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-caramel-300 tracking-wider">
                食材备料快速扫读 ({recipe.ingredients.length} 样)
              </h4>
              <button
                onClick={() => setShowIngredients(false)}
                className="text-xs text-stone-400 hover:text-white"
              >
                收起
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {recipe.ingredients.map((ing, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between text-sm"
                >
                  <span className="font-semibold text-stone-200">{ing.name}</span>
                  <span className="text-caramel-400 font-mono">{ing.amount}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 步骤内容展示 */}
        {viewMode === 'step' ? (
          /* 单步专注大字模式：超大字号 24px~32px+，适合 1 米开外厨房立姿扫读 */
          <div className="my-auto py-6 sm:py-10 space-y-6">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-forest-700 to-forest-900 text-forest-100 font-black text-xl sm:text-2xl flex items-center justify-center shrink-0 shadow-soft border border-forest-500/40">
                {currentStepIndex + 1}
              </span>
              <div>
                <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">
                  第 {currentStepIndex + 1} 步 · 共 {totalSteps} 步
                </span>
                <div className="text-sm text-caramel-400 font-medium">专注当前烹饪指令</div>
              </div>
            </div>

            {/* 核心大字指令 (>= 22px) */}
            <div className="p-6 sm:p-8 rounded-3xl bg-white/[0.04] border border-white/[0.08] shadow-card">
              <p className="text-2xl sm:text-3xl lg:text-4xl text-stone-50 font-semibold leading-relaxed sm:leading-loose tracking-wide">
                {currentStep}
              </p>
            </div>

            {/* 湿手防误触大按键：上一步 / 下一步 */}
            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={handlePrevStep}
                disabled={currentStepIndex === 0}
                className="flex-1 h-14 sm:h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-30 disabled:hover:bg-white/10 text-stone-200 font-bold text-base sm:text-lg flex items-center justify-center gap-2 transition-all border border-white/5"
              >
                <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                <span>上一步</span>
              </button>

              <button
                onClick={handleNextStep}
                disabled={currentStepIndex === totalSteps - 1}
                className="flex-1 h-14 sm:h-16 rounded-2xl bg-forest-800 hover:bg-forest-700 active:scale-95 disabled:opacity-30 disabled:hover:bg-forest-800 text-white font-bold text-base sm:text-lg flex items-center justify-center gap-2 transition-all shadow-ambient-emerald border border-forest-600/40"
              >
                <span>下一步</span>
                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>
        ) : (
          /* 全部步骤大字平铺列表 */
          <div className="space-y-4 my-4">
            {recipe.instructions.map((step, idx) => (
              <div
                key={idx}
                onClick={() => setCurrentStepIndex(idx)}
                className={`p-5 sm:p-6 rounded-3xl border transition-all cursor-pointer ${
                  currentStepIndex === idx
                    ? 'bg-forest-950/60 border-forest-600/60 ring-2 ring-forest-500/30'
                    : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex gap-4 items-start">
                  <span
                    className={`w-9 h-9 rounded-xl font-bold text-base flex items-center justify-center shrink-0 mt-1 ${
                      currentStepIndex === idx
                        ? 'bg-forest-700 text-white'
                        : 'bg-white/10 text-stone-400'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <p className="text-xl sm:text-2xl text-stone-100 font-medium leading-relaxed">
                    {step}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 底部功能栏：巨型灶台倒计时助手 + 完成打勾结算 */}
        <div className="pt-6 border-t border-white/10 space-y-4">
          <div
            className={`p-4 sm:p-6 rounded-3xl transition-all duration-300 flex flex-col md:flex-row items-center justify-between gap-4 border ${
              cookingTimer === 0
                ? 'bg-rose-950/70 border-rose-500/80 animate-zero-alarm ring-2 ring-rose-500/40'
                : 'bg-white/[0.04] border-white/[0.08]'
            }`}
          >
            {/* 巨型倒计时字号 */}
            <div className="text-center md:text-left">
              <div
                className={`text-xs sm:text-sm font-semibold flex items-center justify-center md:justify-start gap-2 ${
                  cookingTimer === 0 ? 'text-rose-300 font-bold' : 'text-caramel-400'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>{cookingTimer === 0 ? '⏰ 倒计时归零！请注意关火或起锅' : '巨型灶台倒计时助手'}</span>
              </div>
              <div
                className={`text-5xl sm:text-6xl lg:text-7xl font-mono font-black tabular-nums tracking-widest mt-1 ${
                  cookingTimer === 0 ? 'text-rose-400' : 'text-white'
                }`}
              >
                {Math.floor(cookingTimer / 60)
                  .toString()
                  .padStart(2, '0')}
                :{(cookingTimer % 60).toString().padStart(2, '0')}
              </div>
            </div>

            {/* 快速增减与巨大控制按钮 (湿手点击设计) */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {/* 快捷增时 */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => addTimerSeconds(60)}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-90 text-xs sm:text-sm font-semibold text-stone-200 transition-all"
                  title="加 1 分钟"
                >
                  +1分
                </button>
                <button
                  onClick={() => addTimerSeconds(180)}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-90 text-xs sm:text-sm font-semibold text-stone-200 transition-all"
                  title="加 3 分钟"
                >
                  +3分
                </button>
                <button
                  onClick={() => addTimerSeconds(300)}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-90 text-xs sm:text-sm font-semibold text-stone-200 transition-all"
                  title="加 5 分钟"
                >
                  +5分
                </button>
              </div>

              {/* 巨大开始/暂停按钮 */}
              <button
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                className={`h-14 sm:h-16 px-6 sm:px-8 rounded-full text-white font-bold text-base sm:text-lg flex items-center justify-center gap-2 shadow-ambient-emerald transition-all active:scale-90 ${
                  isTimerRunning
                    ? 'bg-rose-700 hover:bg-rose-800 ring-2 ring-rose-500/40'
                    : 'bg-forest-700 hover:bg-forest-600 ring-2 ring-forest-500/40'
                }`}
              >
                {isTimerRunning ? (
                  <>
                    <Pause className="w-5 h-5 sm:w-6 sm:h-6" />
                    <span>暂停</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 sm:w-6 sm:h-6" />
                    <span>开始</span>
                  </>
                )}
              </button>

              {/* 重置 */}
              <button
                onClick={() => {
                  setIsTimerRunning(false);
                  setCookingTimer((recipe.cook_time || 5) * 60);
                }}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/10 hover:bg-white/20 text-stone-300 hover:text-white flex items-center justify-center transition-all active:scale-90"
                title="重置为菜谱建议烹饪时间"
              >
                <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>

          {/* 底部完成烹饪大按钮 */}
          <button
            onClick={() => onCook(recipe)}
            disabled={isCookingSuccess}
            className="w-full h-14 sm:h-16 rounded-2xl bg-gradient-to-r from-forest-600 via-forest-700 to-forest-600 hover:brightness-110 active:scale-98 text-white font-bold text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-ambient-emerald transition-all border border-forest-500/40"
          >
            <Sparkles className="w-5 h-5 text-caramel-300" />
            <span>完成烹饪 · 自动扣减食材库存</span>
          </button>
        </div>
      </div>
    </div>
  );
}
