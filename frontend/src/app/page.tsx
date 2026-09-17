'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ChefHat,
  Camera,
  Refrigerator,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Plus,
  Play,
  Pause,
  RotateCcw,
  X,
  Utensils,
  Check,
  UploadCloud,
  ChevronRight,
  User,
  LogOut,
  RefreshCw,
  Heart,
  ExternalLink,
  BookOpen,
  Trash2,
} from 'lucide-react';
import {
  InventoryItem,
  InventorySummary,
  RecipeRecommendation,
  FridgeScanResult,
} from '@/lib/types';
import {
  getInventory,
  batchAddInventory,
  deleteInventoryItem,
  scanFridgeImage,
  getRecommendations,
  generateAiRecipes,
  cookRecipe,
  deleteRecipe,
  getCurrentUser,
  loginUser,
  registerUser,
  logoutUser,
  fetchCaptcha,
  MAX_UPLOAD_BYTES,
} from '@/lib/api';

/** 点击「AI 菜谱」按钮时一次生成的菜谱数量 */
const AI_RECIPE_COUNT = 3;

export default function ShikeApp() {
  const [activeTab, setActiveTab] = useState<'recipes' | 'scan' | 'inventory'>('recipes');

  // Inventory State
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary>({
    total: 0,
    red_urgent: 0,
    yellow_warning: 0,
    green_safe: 0,
  });
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [loadingInventory, setLoadingInventory] = useState(false);

  // Recommendations State
  const [recipes, setRecipes] = useState<RecipeRecommendation[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeRecommendation | null>(null);
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  // User Auth State
  const [userProfile, setUserProfile] = useState<{
    user_id: string;
    username?: string;
    nickname?: string;
    is_guest: boolean;
  }>({ user_id: '', nickname: '访客', is_guest: true });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authNickname, setAuthNickname] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [captchaData, setCaptchaData] = useState<{ captcha_key: string; svg: string } | null>(null);
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadCaptcha = async () => {
    try {
      setCaptchaLoading(true);
      const data = await fetchCaptcha();
      setCaptchaData(data);
      setCaptchaCode('');
    } catch (err: any) {
      console.error('Failed to load captcha:', err);
    } finally {
      setCaptchaLoading(false);
    }
  };

  const switchAuthMode = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setAuthError(null);
    setCaptchaCode('');
    loadCaptcha();
  };

  useEffect(() => {
    if (showAuthModal) {
      setAuthError(null);
      setCaptchaCode('');
      loadCaptcha();
    }
  }, [showAuthModal]);

  // Scanning State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<FridgeScanResult | null>(null);
  const [selectedScanItems, setSelectedScanItems] = useState<Record<number, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual Add Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('蔬菜类');
  const [newItemQty, setNewItemQty] = useState('1个');
  const [newItemLocation, setNewItemLocation] = useState('冷藏室');
  const [newItemDays, setNewItemDays] = useState(5);

  // Cooking Timer State
  const [cookingTimer, setCookingTimer] = useState<number>(120);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [cookingMessage, setCookingMessage] = useState<string | null>(null);

  // Toast / Feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    // 连续弹出提示时先清掉上一个定时器，避免"上一条提示把新提示提前关掉"
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
  };

  // Initial Data Fetch
  const refreshData = async () => {
    try {
      setLoadingInventory(true);
      const inv = await getInventory();
      // 首个接口调用会确保访客会话已建立（必要时服务端会签发新身份），
      // 因此在请求之后再同步界面上的用户资料才是准确的
      setUserProfile(getCurrentUser());
      setInventory(inv.items || []);
      setSummary(inv.summary || { total: 0, red_urgent: 0, yellow_warning: 0, green_safe: 0 });

      setLoadingRecipes(true);
      // 这里只做本地推荐计算；AI 现场定制改为用户点击按钮时按需触发，
      // 避免以前那样"每次刷新页面都可能调用一次大模型"（PER-01）
      const rec = await getRecommendations();
      setRecipes(rec.recommendations || []);
    } catch (err: any) {
      console.error('Failed to load initial data:', err);
    } finally {
      setLoadingInventory(false);
      setLoadingRecipes(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // 灶台倒计时
  // 【性能优化 PER-06】只在开始/暂停时建立定时器，剩余秒数由「截止时间戳」推算。
  // 旧实现把 cookingTimer 放进依赖数组，导致每秒都要销毁并重建一个定时器。
  const timerDeadlineRef = useRef(0);

  useEffect(() => {
    if (!isTimerRunning) return;

    timerDeadlineRef.current = Date.now() + cookingTimer * 1000;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((timerDeadlineRef.current - Date.now()) / 1000));
      setCookingTimer(remaining);
      if (remaining <= 0) {
        setIsTimerRunning(false);
      }
    }, 1000);

    return () => clearInterval(interval);
    // cookingTimer 在这里只作为本次计时的起点快照，不需要进入依赖数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimerRunning]);

  // Handle Photo Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 【体验与安全】前端先做一轮校验，避免用户白等上传后才被服务端拒绝
    if (!file.type.startsWith('image/')) {
      showToast('请选择 JPG / PNG / WebP 格式的图片');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      showToast(`图片过大（${(file.size / 1024 / 1024).toFixed(1)}MB），请压缩到 5MB 以内`);
      e.target.value = '';
      return;
    }

    // 释放上一次创建的预览地址，避免浏览器内存持续增长
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setScanResult(null);
  };

  // Trigger AI Scan
  const handleStartScan = async () => {
    if (!selectedFile) return;
    try {
      setIsScanning(true);
      const res = await scanFridgeImage(selectedFile);
      setScanResult(res);
      // Select all by default
      const initialSelected: Record<number, boolean> = {};
      res.items.forEach((_, idx) => {
        initialSelected[idx] = true;
      });
      setSelectedScanItems(initialSelected);
      showToast(`成功识别到 ${res.items.length} 种食材！`);
    } catch (err: any) {
      showToast(err.message || '识别失败，请重试');
    } finally {
      setIsScanning(false);
    }
  };

  // Batch Ingest
  const handleConfirmBatchIngest = async () => {
    if (!scanResult) return;
    const itemsToIngest = scanResult.items
      .filter((_, idx) => selectedScanItems[idx])
      .map((item) => ({
        name: item.name,
        category: item.category,
        quantity: item.estimated_quantity || '1份',
        storage_location: item.storage_location || '冷藏室',
        storage_days: item.recommended_storage_days || 5,
      }));

    if (itemsToIngest.length === 0) {
      showToast('请至少勾选一种食材');
      return;
    }

    try {
      await batchAddInventory(itemsToIngest);
      showToast(`已成功将 ${itemsToIngest.length} 种食材入库！`);
      setScanResult(null);
      setSelectedFile(null);
      setPreviewUrl(null);
      await refreshData();
      setActiveTab('inventory');
    } catch (err: any) {
      showToast(err.message || '批量入库失败');
    }
  };

  // Consume / Delete Inventory Item
  const handleDeleteItem = async (id: number, name: string) => {
    try {
      await deleteInventoryItem(id);
      showToast(`已标记消耗「${name}」`);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || '操作失败');
    }
  };

  // Manual Add Item
  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    try {
      await batchAddInventory([
        {
          name: newItemName.trim(),
          category: newItemCategory,
          quantity: newItemQty,
          storage_location: newItemLocation,
          storage_days: Number(newItemDays),
        },
      ]);
      showToast(`成功录入食材「${newItemName}」`);
      setNewItemName('');
      setShowAddModal(false);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || '录入失败');
    }
  };

  // Handle Auth Submit (Login / Register)
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!authUsername.trim() || !authPassword.trim()) {
      const msg = '请输入用户名和密码';
      setAuthError(msg);
      showToast(msg);
      return;
    }
    if (!captchaCode.trim()) {
      const msg = '请输入图形验证码';
      setAuthError(msg);
      showToast(msg);
      return;
    }
    // 注册时先在前端校验密码长度，避免无谓的请求往返（与后端规则保持一致）
    if (authMode === 'register' && authPassword.trim().length < 6) {
      const msg = '密码长度至少 6 位';
      setAuthError(msg);
      showToast(msg);
      return;
    }

    try {
      setIsAuthSubmitting(true);
      let resUser;
      if (authMode === 'register') {
        resUser = await registerUser(
          authUsername.trim(),
          authPassword.trim(),
          authNickname.trim(),
          captchaData?.captcha_key,
          captchaCode.trim()
        );
        showToast(`🎉 欢迎加入，${resUser.nickname || resUser.username}！已同步本地食材`);
      } else {
        resUser = await loginUser(
          authUsername.trim(),
          authPassword.trim(),
          captchaData?.captcha_key,
          captchaCode.trim()
        );
        showToast(`欢迎回来，${resUser.nickname || resUser.username}！`);
      }
      setUserProfile(resUser);
      setShowAuthModal(false);
      setAuthPassword('');
      setCaptchaCode('');
      setAuthError(null);
      await refreshData();
    } catch (err: any) {
      const errMsg = err.message || '操作失败';
      setAuthError(errMsg);
      showToast(errMsg);
      // Refresh captcha automatically after any failed attempt
      loadCaptcha();
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    // 服务端立即作废当前令牌 → 清理本地数据 → 自动申请一个新的访客会话继续可用
    await logoutUser();
    setUserProfile(getCurrentUser());
    showToast('已退出登录，恢复本地独立访客模式');
    await refreshData();
  };

  // 让 AI 大厨根据现有食材现场设计菜谱（点击按钮才触发，一次生成 3 道）
  const handleTriggerAiChef = async () => {
    if (inventory.length === 0) {
      showToast('冰箱还是空的，先拍一张冰箱照片或录入食材吧！');
      return;
    }

    try {
      setIsAiGenerating(true);
      showToast(`AI 大厨正在为你设计 ${AI_RECIPE_COUNT} 道菜谱，请稍候…`);

      const aiRecipes = await generateAiRecipes(undefined, AI_RECIPE_COUNT);

      if (aiRecipes.length === 0) {
        showToast('AI 大厨暂时无法提供服务，请稍后重试');
        return;
      }

      // 新生成的菜谱置顶展示；同时移除列表中上一批 AI 菜谱，避免反复生成后越堆越多
      setRecipes((prev) => [
        ...aiRecipes,
        ...prev.filter((r) => !r.id.startsWith('ai-recipe-')),
      ]);

      // 自动打开第一道，方便用户立刻查看食材与步骤
      setSelectedRecipe(aiRecipes[0]);
      setCookingTimer((aiRecipes[0].cook_time || 5) * 60);
      setIsTimerRunning(false);

      showToast(`AI 大厨已为你定制 ${aiRecipes.length} 道菜谱！`);
    } catch (err: any) {
      showToast(err.message || 'AI 菜谱定制失败，请稍后重试');
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Cook Recipe & Deduct
  const handleCook = async (recipe: RecipeRecommendation) => {
    try {
      await cookRecipe(recipe.id, true);
      setCookingMessage(`🎉 成功烹饪「${recipe.name}」，已自动扣减在库消耗食材！`);
      showToast(`已扣减「${recipe.name}」所用食材`);
      await refreshData();
      setTimeout(() => {
        setSelectedRecipe(null);
        setCookingMessage(null);
      }, 2500);
    } catch (err: any) {
      showToast(err.message || '扣库失败');
    }
  };

  // Delete AI Recipe
  const handleDeleteRecipe = async (recipeId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!window.confirm('确定要删除这道 AI 定制菜谱吗？')) {
      return;
    }
    try {
      await deleteRecipe(recipeId);
      setRecipes((prev) => prev.filter((r) => r.id !== recipeId));
      if (selectedRecipe && selectedRecipe.id === recipeId) {
        setSelectedRecipe(null);
      }
      showToast('已删除该 AI 菜谱');
    } catch (err: any) {
      showToast(err.message || '删除菜谱失败，请稍后重试');
    }
  };

  // Filter Inventory
  const filteredInventory = inventory.filter((item) => {
    if (selectedLocation === 'all') return true;
    if (selectedLocation === 'fridge') return item.storage_location.includes('冷藏');
    if (selectedLocation === 'freezer') return item.storage_location.includes('冷冻');
    if (selectedLocation === 'pantry') return !item.storage_location.includes('冷');
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] pb-24 lg:pb-12 antialiased selection:bg-emerald-100 selection:text-emerald-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-slate-900/90 backdrop-blur-md text-white text-sm font-medium shadow-lg transition-all animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-4 lg:px-8 py-2.5 sm:py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <img
              src="/images/logo.webp"
              alt="食刻 AI Logo"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover shadow-sm border border-slate-200/60 shrink-0"
            />
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold text-sm sm:text-base tracking-tight text-slate-900">食刻 AI</span>
                <span className="text-[10px] sm:text-[11px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  智能冰箱管家
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">拍一拍冰箱，今天吃什么交给 AI</p>
            </div>
          </div>

          {/* KPI Capsule & Action */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-xs font-medium text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>在库 {summary.total} 种</span>
              {summary.yellow_warning > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-amber-600 font-semibold">{summary.yellow_warning} 临期急需</span>
                </>
              )}
            </div>

            <button
              onClick={handleTriggerAiChef}
              disabled={isAiGenerating}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white text-xs font-semibold shadow-sm shadow-amber-500/10 transition-all active:scale-95"
              title={`根据冰箱现有食材，让 AI 大厨现场设计 ${AI_RECIPE_COUNT} 道菜谱`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
              <span>{isAiGenerating ? '生成中…' : 'AI 菜谱'}</span>
            </button>

            <button
              onClick={() => setActiveTab('scan')}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>拍冰箱入库</span>
            </button>

            {/* User Profile / Auth Button */}
            {userProfile.is_guest ? (
              <button
                onClick={() => {
                  setAuthMode('login');
                  setShowAuthModal(true);
                }}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all active:scale-95 border border-slate-200"
                title="登录后可跨电脑、手机实时同步冰箱数据"
              >
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span className="sm:hidden">登录</span>
                <span className="hidden sm:inline">登录 / 多端同步</span>
              </button>
            ) : (
              <div className="flex items-center gap-1 sm:gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 shrink-0"></span>
                <span className="truncate max-w-[70px] sm:max-w-none">{userProfile.nickname || userProfile.username}</span>
                <button
                  onClick={handleLogout}
                  className="ml-0.5 sm:ml-1 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                  title="退出登录"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <div className="max-w-6xl mx-auto hidden lg:flex items-center gap-2 pt-3">
          <button
            onClick={() => setActiveTab('recipes')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeTab === 'recipes'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            今日灵感推荐 ({recipes.length})
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeTab === 'inventory'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            智能冰箱库存 ({inventory.length})
          </button>
          <button
            onClick={() => setActiveTab('scan')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeTab === 'scan'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            拍照全景识图
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 lg:px-8 pt-5">
        {/* Urgent Expiring Alert Banner (Global) */}
        {summary.yellow_warning > 0 && (
          <div
            onClick={() => {
              setActiveTab('inventory');
              setSelectedLocation('all');
            }}
            className="mb-5 p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/80 flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition-all"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <div>
                <span className="font-semibold text-xs text-amber-900">
                  有 {summary.yellow_warning} 种食材即将到期建议优先吃掉！
                </span>
                <p className="text-[11px] text-amber-700/80">已在菜谱推荐引擎中获得最高匹配权重</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium text-amber-800">
              <span>立即查看</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
        )}

        {/* TAB 1: RECIPES & INSPIRATION */}
        {activeTab === 'recipes' && (
          <div className="space-y-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-slate-900">
                  今晚吃什么？
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  基于冰箱现有 {inventory.length} 种食材，智能优先消耗临期与高契合度菜谱
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={refreshData}
                  className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 py-2"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">刷新推荐</span>
                </button>

                {/* AI 菜谱按钮：点击后由大厨根据冰箱现有食材现场生成 3 道菜谱 */}
                <button
                  onClick={handleTriggerAiChef}
                  disabled={isAiGenerating}
                  title={`根据冰箱现有食材，让 AI 大厨现场设计 ${AI_RECIPE_COUNT} 道菜谱`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                  <span>{isAiGenerating ? '生成中…' : 'AI 菜谱'}</span>
                </button>
              </div>
            </div>

            {/* 加载中提示 */}
            {loadingRecipes && recipes.length === 0 && (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80">
                <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3" />
                <span className="font-semibold text-sm text-slate-700">正在为你挑选合适的菜谱…</span>
              </div>
            )}

            {/* 空状态提示 */}
            {!loadingRecipes && recipes.length === 0 && (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80">
                <ChefHat className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <span className="font-semibold text-sm text-slate-700">暂时没有可推荐的菜谱</span>
                <p className="text-xs text-slate-400 mt-1">
                  先拍一张冰箱照片或手动录入食材，之后可以点「AI 菜谱」让大厨现场设计
                </p>
              </div>
            )}

            {/* 库存有食材、但没有任何固定菜谱匹配得上时，引导用户使用 AI 定制 */}
            {!loadingRecipes &&
              inventory.length > 0 &&
              recipes.length > 0 &&
              recipes.every((r) => r.score === 0) && (
                <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="font-semibold text-xs text-emerald-900">
                      没有找到契合现有食材的固定菜谱
                    </span>
                    <p className="text-[11px] text-emerald-700/80">
                      点击「AI 菜谱」按钮，让大厨按你现有的食材一次设计 {AI_RECIPE_COUNT} 道
                    </p>
                  </div>
                </div>
              )}

            {/* Recipe Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {recipes.map((recipe) => (
                <div
                  key={recipe.id}
                  onClick={() => {
                    setSelectedRecipe(recipe);
                    setCookingTimer((recipe.cook_time || 5) * 60);
                    setIsTimerRunning(false);
                  }}
                  className="group bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    {/* Visual & Badges */}
                    <div className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-slate-100 mb-3.5">
                      <img
                        src={recipe.image_url || '/images/tomato_egg.webp'}
                        alt={recipe.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e: any) => {
                          e.target.src = '/images/tomato_egg.webp';
                        }}
                      />
                      {/* Match Rate Pill */}
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-semibold flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        <span>匹配率 {Math.round((recipe.match_rate || 0.8) * 100)}%</span>
                      </div>

                      {/* AI 生成的菜谱用专属徽章标识；固定菜谱则按需显示"消耗临期" */}
                      {recipe.id.startsWith('ai-recipe-') ? (
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
                          <div className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>AI 定制</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteRecipe(recipe.id, e)}
                            title="删除 AI 菜谱"
                            className="w-5 h-5 rounded-full bg-black/40 hover:bg-rose-500 text-white/80 hover:text-white backdrop-blur-md transition-all shadow-sm flex items-center justify-center hover:scale-110 active:scale-95"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ) : (
                        recipe.urgency_boost > 0 && (
                          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                            消耗临期
                          </div>
                        )
                      )}

                      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-[11px] text-white/90 font-medium">
                        <span className="px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm">
                          {recipe.difficulty}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{recipe.cook_time}分钟</span>
                        </span>
                      </div>
                    </div>

                    <h3 className="font-bold text-base text-slate-900 group-hover:text-emerald-700 transition-colors">
                      {recipe.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {recipe.tips || '经典家常下饭美味，主辅料契合度极佳。'}
                    </p>

                    {/* Matched Ingredients Chips */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {recipe.matched_ingredients && recipe.matched_ingredients.length > 0 ? (
                        recipe.matched_ingredients.map((m, idx) => (
                          <span
                            key={idx}
                            className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                              m.urgency_level === 'yellow' || m.urgency_level === 'red'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            ✓ {m.recipe_ingredient}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                          需备常见调料
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">{recipe.category}</span>
                    <span className="text-xs font-semibold text-emerald-700 flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
                      <span>查看下厨步骤</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: FRIDGE SCAN */}
        {activeTab === 'scan' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center">
              <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-slate-900">
                冰箱全景多模态识别
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                拍一张冰箱整层照片，AI 自动批量提取食材、分类及建议存放周期
              </p>
            </div>

            {/* Upload Box */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm text-center">
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />

              {!previewUrl ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-emerald-500/80 rounded-2xl p-8 cursor-pointer transition-all bg-slate-50/50 hover:bg-emerald-50/20 flex flex-col items-center justify-center gap-3"
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-slate-800">
                      点击上传或直接拍照
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5">支持普通手机实拍照片</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-slate-100 max-h-[360px] mx-auto border border-slate-200">
                    <img src={previewUrl} alt="冰箱预览" className="w-full h-full object-cover" />
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                        setScanResult(null);
                      }}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {!scanResult && (
                    <button
                      disabled={isScanning}
                      onClick={handleStartScan}
                      className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2"
                    >
                      {isScanning ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                          <span>AI 正在全景分析食材...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>开始 AI 智能识别</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Scan Results Bottom Sheet / Card */}
            {scanResult && (
              <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      已识别到 {scanResult.items.length} 种食材
                    </h3>
                    <p className="text-[11px] text-slate-500">{scanResult.summary}</p>
                  </div>
                  <button
                    onClick={() => {
                      const allSelected = Object.values(selectedScanItems).every(Boolean);
                      const next: Record<number, boolean> = {};
                      scanResult.items.forEach((_, idx) => {
                        next[idx] = !allSelected;
                      });
                      setSelectedScanItems(next);
                    }}
                    className="text-xs text-emerald-700 font-semibold"
                  >
                    全选/反选
                  </button>
                </div>

                <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                  {scanResult.items.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedScanItems((prev) => ({
                          ...prev,
                          [idx]: !prev[idx],
                        }));
                      }}
                      className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                            selectedScanItems[idx]
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {selectedScanItems[idx] && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-slate-900">{item.name}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                              {item.category}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {item.storage_location} · 建议 {item.recommended_storage_days} 天内吃完
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-slate-600 tabular-nums">
                        {item.estimated_quantity}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleConfirmBatchIngest}
                  className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition-all"
                >
                  确认添加入库 (
                  {Object.values(selectedScanItems).filter(Boolean).length} 件)
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: INVENTORY */}
        {activeTab === 'inventory' && (
          <div className="space-y-5">
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-slate-900">
                  智能家庭在库看板
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  已按保质期设立三级警戒灯，单手点击即可标记消耗
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>手动录入</span>
              </button>
            </div>

            {/* Segmented Location Filter */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { id: 'all', label: `全部 (${inventory.length})` },
                { id: 'fridge', label: '冷藏室' },
                { id: 'freezer', label: '冷冻室' },
                { id: 'pantry', label: '常温储物' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedLocation(tab.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                    selectedLocation === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Inventory List */}
            {loadingInventory && inventory.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80">
                <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3" />
                <span className="font-semibold text-sm text-slate-700">正在读取冰箱库存…</span>
              </div>
            ) : filteredInventory.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80">
                <Refrigerator className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <span className="font-semibold text-sm text-slate-700">当前冰箱暂无食材</span>
                <p className="text-xs text-slate-400 mt-1">拍一张冰箱照片即可快速全景录入！</p>
                <button
                  onClick={() => setActiveTab('scan')}
                  className="mt-4 px-4 py-2 rounded-full bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>去拍照录入</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredInventory.map((item) => {
                  const isUrgent = item.urgency_level === 'yellow' || item.urgency_level === 'red';
                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-2xl bg-white border transition-all flex items-center justify-between ${
                        isUrgent ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-10 rounded-full ${
                            item.urgency_level === 'red'
                              ? 'bg-red-500'
                              : item.urgency_level === 'yellow'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-slate-900">{item.name}</span>
                            <span className="text-[10px] text-slate-500 px-1.5 py-0.2 bg-slate-100 rounded">
                              {item.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span>{item.quantity}</span>
                            <span>·</span>
                            <span>{item.storage_location}</span>
                            <span>·</span>
                            <span
                              className={`font-medium ${
                                item.urgency_level === 'red'
                                  ? 'text-red-600'
                                  : item.urgency_level === 'yellow'
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                              }`}
                            >
                              {item.days_remaining <= 0
                                ? '已到期'
                                : `剩 ${item.days_remaining} 天`}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteItem(item.id, item.name)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-1"
                        title="标记吃完"
                      >
                        <Check className="w-4 h-4" />
                        <span className="text-[11px]">吃完</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* FOOTER 致谢区块 (食刻清新自然风) */}
        <footer className="mt-16 sm:mt-20 pt-8 pb-28 lg:pb-10 border-t border-emerald-100/60 text-center select-none">
          {/* 生态胶囊徽章 */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70 text-xs font-semibold mb-2.5 shadow-xs">
            <span className="text-xs">🌱</span>
            <span>开源生态致谢</span>
          </div>

          <p className="text-xs text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
            食刻 AI 的菜谱灵感、量化下厨步骤与经典家常风味建立在开源社区的贡献之上
          </p>

          {/* 双列自适应轻量卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-3xl mx-auto text-left">
            {/* 卡片 1: HowToCook 程序员做饭指南 */}
            <a
              href="https://github.com/Anduin2017/HowToCook"
              target="_blank"
              rel="noopener noreferrer"
              className="group p-4 rounded-2xl bg-white/90 hover:bg-white border border-slate-200/80 hover:border-emerald-300 shadow-sm hover:shadow-md hover:shadow-emerald-500/5 transition-all duration-200 flex items-center justify-between gap-3 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 group-hover:scale-105 group-hover:bg-emerald-100/80 transition-all duration-200">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                    <h4 className="text-xs font-semibold text-slate-800 group-hover:text-emerald-700 transition-colors truncate">
                      HowToCook 程序员做饭指南
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate pl-3">
                    严谨量化的中餐开源菜谱
                  </p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
            </a>

            {/* 卡片 2: 下厨房开源语料库 */}
            <a
              href="https://counterfactual-recipe-generation.github.io/dataset_en.html"
              target="_blank"
              rel="noopener noreferrer"
              className="group p-4 rounded-2xl bg-white/90 hover:bg-white border border-slate-200/80 hover:border-amber-300 shadow-sm hover:shadow-md hover:shadow-amber-500/5 transition-all duration-200 flex items-center justify-between gap-3 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0 group-hover:scale-105 group-hover:bg-amber-100/80 transition-all duration-200">
                  <Utensils className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                    <h4 className="text-xs font-semibold text-slate-800 group-hover:text-amber-700 transition-colors truncate">
                      下厨房开源语料库
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate pl-3">
                    经典中式家常风味数据
                  </p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
            </a>
          </div>
        </footer>
      </main>

      {/* COOKING WALKTHROUGH DRAWER / MODAL */}
      {selectedRecipe && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="relative aspect-[16/9] sm:aspect-[21/9] bg-slate-100">
              <img
                src={selectedRecipe.image_url || '/images/tomato_egg.webp'}
                alt={selectedRecipe.name}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setSelectedRecipe(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-3 left-4 right-4 text-white">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 font-semibold">
                    {selectedRecipe.category}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm">
                    {selectedRecipe.difficulty} · {selectedRecipe.cook_time}分钟
                  </span>
                </div>
                <h2 className="text-xl font-bold mt-1">{selectedRecipe.name}</h2>
              </div>
            </div>

            {/* Modal Scroll Content */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Toast Feedback inside modal */}
              {cookingMessage && (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-bounce">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{cookingMessage}</span>
                </div>
              )}

              {/* Ingredients Breakdown */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  食材备料清单
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {selectedRecipe.ingredients.map((ing, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                    >
                      <span className="font-semibold text-slate-800">{ing.name}</span>
                      <span className="text-slate-400">{ing.amount}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step By Step Instructions */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  分步烹饪指南 (适合厨房扫读)
                </h4>
                <div className="space-y-3">
                  {selectedRecipe.instructions.map((step, idx) => (
                    <div key={idx} className="flex gap-3 items-start">
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-sm text-slate-800 leading-relaxed font-medium">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kitchen Timer Widget */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold">灶台倒计时助手</span>
                  <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                    {Math.floor(cookingTimer / 60)
                      .toString()
                      .padStart(2, '0')}
                    :{(cookingTimer % 60).toString().padStart(2, '0')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsTimerRunning(!isTimerRunning)}
                    className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 shadow-sm transition-all"
                  >
                    {isTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                  <button
                    onClick={() => {
                      setIsTimerRunning(false);
                      setCookingTimer((selectedRecipe.cook_time || 5) * 60);
                    }}
                    className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-300 transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Bottom Action */}
            <div className="p-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row gap-2.5">
              {selectedRecipe.id.startsWith('ai-recipe-') && (
                <button
                  type="button"
                  onClick={() => handleDeleteRecipe(selectedRecipe.id)}
                  className="py-3 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 font-semibold text-xs sm:text-sm border border-rose-200/80 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                  <span>删除此 AI 菜谱</span>
                </button>
              )}
              <button
                onClick={() => handleCook(selectedRecipe)}
                className="flex-1 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Utensils className="w-4 h-4 text-emerald-400" />
                <span>完成下厨 · 自动同步扣减食材库存</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL ADD INGREDIENT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">手动录入食材</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualAdd} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">食材名称</label>
                <input
                  type="text"
                  required
                  placeholder="如：西红柿、土豆、五花肉"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">分类</label>
                  <select
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-600"
                  >
                    <option>蔬菜类</option>
                    <option>肉禽蛋类</option>
                    <option>水产类</option>
                    <option>豆制品</option>
                    <option>乳制品</option>
                    <option>调味品</option>
                    <option>主食面点</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">预估份量</label>
                  <input
                    type="text"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(e.target.value)}
                    className="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">存放位置</label>
                  <select
                    value={newItemLocation}
                    onChange={(e) => setNewItemLocation(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-600"
                  >
                    <option>冷藏室</option>
                    <option>冷藏抽屉</option>
                    <option>冷冻室</option>
                    <option>冰箱门架</option>
                    <option>常温储物</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">保存天数</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={newItemDays}
                    onChange={(e) => setNewItemDays(Number(e.target.value))}
                    className="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all"
              >
                确认录入
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Auth Modal (Login / Register) */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900">
                  {authMode === 'login' ? '登录食刻 AI' : '注册新账号'}
                </h3>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-2">
              {authMode === 'login'
                ? '登录后可跨电脑、手机随时查看和管理同一个冰箱，数据永不丢失。'
                : '自定义一个专属用户名即可，注册后当前设备上的食材将自动归入你的账号。'}
            </p>

            <form onSubmit={handleAuthSubmit} className="space-y-3.5 mt-4">
              {authError && (
                <div className="p-3 rounded-2xl bg-red-50 border border-red-200/90 text-xs text-red-600 flex items-start gap-2.5 animate-in fade-in duration-150">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
                  <div className="leading-snug">
                    <p className="font-semibold">
                      {authError.includes('锁定') ? '🔒 登录防爆破安全保护已触发' : '验证提示'}
                    </p>
                    <p className="text-[11px] text-red-700 mt-0.5">{authError}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700">用户名</label>
                <input
                  type="text"
                  required
                  placeholder="如：baobao / kaikai"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-600"
                />
              </div>

              {authMode === 'register' && (
                <div>
                  <label className="text-xs font-semibold text-slate-700">个性昵称 (选填)</label>
                  <input
                    type="text"
                    placeholder="如：大厨包包"
                    value={authNickname}
                    onChange={(e) => setAuthNickname(e.target.value)}
                    className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-600"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700">密码</label>
                <input
                  type="password"
                  required
                  placeholder="至少6位密码"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">安全验证码</label>
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    className="text-[11px] text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${captchaLoading ? 'animate-spin' : ''}`} />
                    <span>换一张</span>
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    required
                    placeholder="输入计算结果"
                    value={captchaCode}
                    onChange={(e) => setCaptchaCode(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-600"
                  />
                  <div
                    onClick={loadCaptcha}
                    title="点击更换验证码"
                    className="cursor-pointer flex-shrink-0 relative rounded-xl overflow-hidden border border-slate-200 hover:border-emerald-500 transition-all bg-slate-50 flex items-center justify-center min-w-[124px] h-[40px] shadow-sm select-none"
                  >
                    {captchaLoading ? (
                      <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        <span>加载中...</span>
                      </div>
                    ) : captchaData?.svg ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: captchaData.svg }}
                        className="flex items-center justify-center"
                      />
                    ) : (
                      <span className="text-[11px] text-slate-400">点击获取</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isAuthSubmitting}
                className="w-full mt-2 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-xs shadow-sm transition-all"
              >
                {isAuthSubmitting ? '处理中...' : authMode === 'login' ? '立即登录并同步' : '完成注册并自动登录'}
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {authMode === 'login' ? '还没有账号？' : '已有账号？'}
              </span>
              <button
                type="button"
                onClick={() => switchAuthMode(authMode === 'login' ? 'register' : 'login')}
                className="text-emerald-700 font-bold hover:underline"
              >
                {authMode === 'login' ? '免费注册一个' : '直接登录'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION DOCK */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-slate-200/80 px-4 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] flex items-center justify-around">
        <button
          onClick={() => setActiveTab('recipes')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
            activeTab === 'recipes' ? 'text-emerald-700' : 'text-slate-400'
          }`}
        >
          <ChefHat className="w-5 h-5" />
          <span>灵感</span>
        </button>

        {/* Big Shutter Camera Center Button */}
        <button
          onClick={() => setActiveTab('scan')}
          className="relative -top-3 w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all"
        >
          <Camera className="w-6 h-6" />
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
            activeTab === 'inventory' ? 'text-emerald-700' : 'text-slate-400'
          }`}
        >
          <Refrigerator className="w-5 h-5" />
          <span>库存</span>
        </button>
      </nav>
    </div>
  );
}
