'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Maximize2,
  ShoppingCart,
  Zap,
  Copy,
  Receipt,
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
import { compressImage, dataUrlToFile } from '@/lib/imageCompress';
import {
  matchIngredientKnowledge,
  searchIngredientSuggestions,
  IngredientKnowledge,
} from '@/lib/ingredientKnowledge';
import {
  calculateMissingIngredients,
  generateShoppingListText,
  copyToClipboard,
} from '@/lib/shoppingList';
import { getMealPeriod, MealPeriodInfo } from '@/lib/mealPeriod';
import { playTimerDoneSound, playCookSuccessSound, playShutterSound } from '@/lib/sound';
import EmotionalEmptyState from '@/components/EmotionalEmptyState';
import KitchenCookMode from '@/components/KitchenCookMode';
import FridgeStorageMap, { StorageZoneId, STORAGE_ZONES } from '@/components/FridgeStorageMap';
import InventoryCard from '@/components/InventoryCard';

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
  const [selectedZone, setSelectedZone] = useState<StorageZoneId>('all');
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [swipedCardId, setSwipedCardId] = useState<number | null>(null);

  // Recommendations State
  const [recipes, setRecipes] = useState<RecipeRecommendation[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeRecommendation | null>(null);
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  // 场景与时序化动态餐段
  const [mealPeriod, setMealPeriod] = useState<MealPeriodInfo>(() => getMealPeriod(new Date(), 0));

  // 灵感流场景胶囊筛选
  type RecipeFilterKey = 'all' | 'quick' | 'soup' | 'light' | 'urgent';
  const [recipeFilter, setRecipeFilter] = useState<RecipeFilterKey>('all');

  // 灶台大字专注下厨模式状态
  const [isKitchenCookMode, setIsKitchenCookMode] = useState<boolean>(false);

  // 实时更新餐段（每分钟校准一次）
  useEffect(() => {
    setMealPeriod(getMealPeriod(new Date(), inventory.length));
    const timer = setInterval(() => {
      setMealPeriod(getMealPeriod(new Date(), inventory.length));
    }, 60000);
    return () => clearInterval(timer);
  }, [inventory.length]);

  // 灵感流智能场景胶囊分类数量统计
  const filterCounts = useMemo(() => {
    return {
      all: recipes.length,
      quick: recipes.filter((r) => (r.cook_time || 0) <= 15).length,
      soup: recipes.filter(
        (r) => (r.category && r.category.includes('汤')) || (r.name && r.name.includes('汤'))
      ).length,
      light: recipes.filter((r) => {
        const text = `${r.category || ''} ${r.cuisine || ''} ${r.name || ''}`;
        return /沙拉|轻食|素|减脂|低卡/.test(text);
      }).length,
      urgent: recipes.filter(
        (r) =>
          (r.urgency_boost && r.urgency_boost > 0) ||
          (r.matched_ingredients &&
            r.matched_ingredients.some(
              (m) => m.urgency_level === 'red' || m.urgency_level === 'yellow'
            ))
      ).length,
    };
  }, [recipes]);

  // 经场景胶囊实时平滑过滤后的推荐列表
  const displayedRecipes = useMemo(() => {
    if (recipeFilter === 'quick') {
      return recipes.filter((r) => (r.cook_time || 0) <= 15);
    }
    if (recipeFilter === 'soup') {
      return recipes.filter(
        (r) => (r.category && r.category.includes('汤')) || (r.name && r.name.includes('汤'))
      );
    }
    if (recipeFilter === 'light') {
      return recipes.filter((r) => {
        const text = `${r.category || ''} ${r.cuisine || ''} ${r.name || ''}`;
        return /沙拉|轻食|素|减脂|低卡/.test(text);
      });
    }
    if (recipeFilter === 'urgent') {
      return recipes.filter(
        (r) =>
          (r.urgency_boost && r.urgency_boost > 0) ||
          (r.matched_ingredients &&
            r.matched_ingredients.some(
              (m) => m.urgency_level === 'red' || m.urgency_level === 'yellow'
            ))
      );
    }
    return recipes;
  }, [recipes, recipeFilter]);

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
  const [scanMode, setScanMode] = useState<'fridge' | 'receipt'>('fridge');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressStats, setCompressStats] = useState<{
    originalSize: number;
    compressedSize: number;
  } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<FridgeScanResult | null>(null);
  const [selectedScanItems, setSelectedScanItems] = useState<Record<number, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 【修复 MEM-01】统一在预览地址变化时释放上一个 blob URL（Base64 URL 无需释放）
  useEffect(() => {
    if (!previewUrl || !previewUrl.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Manual Add Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('蔬菜类');
  const [newItemQty, setNewItemQty] = useState('1个');
  const [newItemLocation, setNewItemLocation] = useState('冷藏室');
  const [newItemDays, setNewItemDays] = useState(5);

  // 生鲜常识库模糊匹配与智能推荐
  const matchedKnowledge = useMemo(
    () => matchIngredientKnowledge(newItemName),
    [newItemName]
  );
  const knowledgeSuggestions = useMemo(
    () => searchIngredientSuggestions(newItemName, 4),
    [newItemName]
  );

  const applyIngredientKnowledge = (k: IngredientKnowledge) => {
    setNewItemName(k.name);
    setNewItemCategory(k.category);
    setNewItemLocation(k.location);
    setNewItemDays(k.shelfLifeDays);
    showToast(`已按常识预填「${k.name}」：${k.category} · ${k.location} · 推荐保质${k.shelfLifeDays}天`);
  };

  const calculatedExpiryDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (Number(newItemDays) || 3));
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }, [newItemDays]);

  // 菜谱详情缺少食材差额计算
  const modalMissing = useMemo(
    () => (selectedRecipe ? calculateMissingIngredients(selectedRecipe, inventory) : []),
    [selectedRecipe, inventory]
  );

  const handleCopyShoppingList = async () => {
    if (!selectedRecipe || modalMissing.length === 0) return;
    const text = generateShoppingListText(selectedRecipe, modalMissing);
    const success = await copyToClipboard(text);
    if (success) {
      showToast('已复制清单，直接发给微信或便签即可照着买！');
    } else {
      showToast('复制失败，请重试');
    }
  };

  // Cooking Timer State
  const [cookingTimer, setCookingTimer] = useState<number>(120);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [cookingMessage, setCookingMessage] = useState<string | null>(null);
  const [isCookingSuccess, setIsCookingSuccess] = useState<boolean>(false);

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
      // 【修复 UX-02】旧实现静默吞掉加载失败，用户只看到一片空白却不知道发生了什么
      if (err?.code === 'SESSION_EXPIRED') {
        showToast('登录已过期，请重新登录');
        setShowAuthModal(true);
      } else {
        showToast(err?.message || '加载数据失败，请稍后重试');
      }
    } finally {
      setLoadingInventory(false);
      setLoadingRecipes(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshData();
      showToast('推荐已更新');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

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
        playTimerDoneSound();
      }
    }, 1000);

    return () => clearInterval(interval);
    // cookingTimer 在这里只作为本次计时的起点快照，不需要进入依赖数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimerRunning]);

  // 识图多模态链路加速：端侧等比智能压缩 (拍照 / 上传)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 前端格式校验
    if (!file.type.startsWith('image/')) {
      showToast('请选择 JPG / PNG / WebP 格式的图片');
      e.target.value = '';
      return;
    }

    try {
      setIsCompressing(true);
      const originalBytes = file.size;

      // 利用 HTML5 Canvas 端侧等比智能压缩至最大宽高 1280px，质量 0.82
      const compressedDataUrl = await compressImage(file, 1280, 0.82);
      const compressedFile = dataUrlToFile(
        compressedDataUrl,
        (file.name || 'fridge_scan').replace(/\.[^.]+$/, '') + '.webp'
      );

      setSelectedFile(compressedFile);
      setPreviewUrl(compressedDataUrl);
      setScanResult(null);

      const compressedBytes = Math.round((compressedDataUrl.length * 3) / 4);
      setCompressStats({
        originalSize: originalBytes,
        compressedSize: compressedBytes,
      });

      const origMB = (originalBytes / 1024 / 1024).toFixed(1);
      const compKB = Math.round(compressedBytes / 1024);
      showToast(`已完成端侧智能压缩（${origMB}MB → ${compKB}KB），多模态识别极速就绪！`);
    } catch (err: any) {
      // 容灾降级：使用原文件
      if (file.size > MAX_UPLOAD_BYTES) {
        showToast(
          `图片过大（${(file.size / 1024 / 1024).toFixed(1)}MB），请压缩到 ${(
            MAX_UPLOAD_BYTES /
            1024 /
            1024
          ).toFixed(0)}MB 以内`
        );
        e.target.value = '';
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setScanResult(null);
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  const handleImageUpload = handleFileSelect;
  const handleFileChange = handleFileSelect;

  // Trigger AI Scan
  const handleStartScan = async () => {
    if (!selectedFile && !previewUrl) return;
    try {
      setIsScanning(true);
      // 优先传输已在端侧完成智能压缩的 Base64 数据或压缩文件，并带上识别模式
      const res = await scanFridgeImage(previewUrl || selectedFile!, scanMode);
      setScanResult(res);
      // Select all by default
      const initialSelected: Record<number, boolean> = {};
      res.items.forEach((_, idx) => {
        initialSelected[idx] = true;
      });
      setSelectedScanItems(initialSelected);
      if (scanMode === 'receipt') {
        showToast(`已从小票/订单解析提取到 ${res.items.length} 种生鲜食材！`);
      } else {
        showToast(`成功识别到 ${res.items.length} 种食材！`);
      }
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
  const handleDeleteItem = async (
    id: number,
    name: string,
    actionType: 'consume' | 'remove' = 'consume'
  ) => {
    try {
      await deleteInventoryItem(id);
      if (actionType === 'consume') {
        showToast(`已标记消耗「${name}」`);
      } else {
        showToast(`已从冰箱移出「${name}」`);
      }
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
      setIsCookingSuccess(true);
      playCookSuccessSound();
      setCookingMessage(`🎉 成功烹饪「${recipe.name}」，已自动扣减在库消耗食材！`);
      showToast(`已扣减「${recipe.name}」所用食材`);
      await refreshData();
      setTimeout(() => {
        setSelectedRecipe(null);
        setIsKitchenCookMode(false);
        setCookingMessage(null);
        setIsCookingSuccess(false);
      }, 2500);
    } catch (err: any) {
      showToast(err.message || '扣库失败');
      setIsCookingSuccess(false);
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
        setIsKitchenCookMode(false);
      }
      showToast('已删除该 AI 菜谱');
    } catch (err: any) {
      showToast(err.message || '删除菜谱失败，请稍后重试');
    }
  };

  // Filter Inventory by Storage Zone
  const filteredInventory = inventory.filter((item) => {
    if (selectedZone === 'all') return true;
    const targetZone = STORAGE_ZONES.find((z) => z.id === selectedZone);
    if (!targetZone) return true;
    return targetZone.match(item);
  });

  return (
    <div className="min-h-screen bg-[#FAFAF7] dark:bg-[#141514] text-[#1C1D1B] dark:text-[#EDEDE8] pb-24 lg:pb-12 antialiased selection:bg-[#EBF3EE] selection:text-[#1B382B]">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-[#1C1D1B]/95 dark:bg-[#EDEDE8]/95 backdrop-blur-md text-[#FAFAF7] dark:text-[#141514] text-xs sm:text-sm font-medium shadow-modal transition-all animate-bounce flex items-center gap-2 border border-white/10">
          <Sparkles className="w-3.5 h-3.5 text-caramel-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#FAFAF7]/85 dark:bg-[#141514]/85 backdrop-blur-md border-b border-[#1C1D1B]/[0.06] dark:border-white/[0.08] px-4 lg:px-8 py-2.5 sm:py-3.5 transition-colors">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <img
              src="/images/logo.webp"
              alt="食刻 AI Logo"
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl object-cover shadow-soft border border-[#1C1D1B]/[0.08] shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-[#1C1D1B] dark:text-[#EDEDE8]">食刻 AI</span>
                <span className="hidden sm:inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full bg-forest-50 dark:bg-forest-950/80 text-forest-700 dark:text-forest-300 border border-forest-200/60 dark:border-forest-800/60">
                  智能冰箱管家
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 hidden sm:block">拍一拍冰箱，今天吃什么交给 AI</p>
            </div>
          </div>

          {/* KPI Capsule & Action */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-100/80 dark:bg-stone-800/60 text-xs font-medium text-stone-600 dark:text-stone-300 border border-stone-200/50 dark:border-stone-700/50">
              <span className="w-2 h-2 rounded-full bg-forest-600"></span>
              <span>在库 {summary.total} 种</span>
              {summary.yellow_warning > 0 && (
                <>
                  <span className="text-stone-300 dark:text-stone-600">·</span>
                  <span className="text-caramel-600 dark:text-caramel-400 font-medium">{summary.yellow_warning} 赏味提醒</span>
                </>
              )}
            </div>

            {/* AI 菜谱按钮：移动端在下方主标题旁已有专属大按钮，此处在移动端隐藏，消除重复堆叠；桌面端保留 */}
            <button
              onClick={handleTriggerAiChef}
              disabled={isAiGenerating}
              className="hidden sm:flex group btn-shimmer-caramel items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-caramel-500 via-caramel-600 to-caramel-500 bg-[length:200%_auto] hover:bg-right hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 text-white text-xs font-medium shadow-ambient-caramel transition-all duration-300 active:scale-95"
              title={`根据冰箱现有食材，让 AI 大厨现场设计 ${AI_RECIPE_COUNT} 道菜谱`}
            >
              <Sparkles className={`w-3.5 h-3.5 text-amber-200 transition-transform duration-300 ${isAiGenerating ? 'animate-spin' : 'group-hover:rotate-12 group-hover:scale-110 group-active:-rotate-12'}`} />
              <span className="relative z-10">{isAiGenerating ? '定制中…' : 'AI 菜谱'}</span>
            </button>

            <button
              onClick={() => setActiveTab('scan')}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-forest-800 hover:bg-forest-900 text-white text-xs font-medium shadow-soft transition-all active:scale-95"
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-100/90 dark:bg-stone-800/80 hover:bg-stone-200/80 text-stone-700 dark:text-stone-200 text-xs font-medium transition-all active:scale-95 border border-stone-200/60 dark:border-stone-700/60 shadow-xs"
                title="登录后可跨电脑、手机实时同步冰箱数据"
              >
                <User className="w-3.5 h-3.5 text-stone-500" />
                <span className="sm:hidden">登录</span>
                <span className="hidden sm:inline">登录 / 同步</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2 bg-forest-50/90 dark:bg-forest-950/80 text-forest-800 dark:text-forest-200 border border-forest-200/70 dark:border-forest-800/70 pl-2.5 pr-2 py-1 rounded-full text-xs font-medium shadow-xs">
                <span className="relative flex h-2 w-2 shrink-0 items-center justify-center" title="数据多端实时同步中">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-forest-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-forest-600 dark:bg-forest-400" />
                </span>
                <span className="truncate max-w-[80px] sm:max-w-none text-xs">{userProfile.nickname || userProfile.username}</span>
                <button
                  onClick={handleLogout}
                  className="ml-0.5 text-stone-400 hover:text-rose-500 transition-colors shrink-0 p-0.5"
                  title="退出登录"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <div className="max-w-6xl mx-auto hidden lg:flex items-center gap-1.5 pt-3">
          <button
            onClick={() => setActiveTab('recipes')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeTab === 'recipes'
                ? 'bg-forest-900 text-white shadow-soft dark:bg-forest-700'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100/80 dark:hover:bg-stone-800/60'
            }`}
          >
            今日灵感推荐 ({recipes.length})
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeTab === 'inventory'
                ? 'bg-forest-900 text-white shadow-soft dark:bg-forest-700'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100/80 dark:hover:bg-stone-800/60'
            }`}
          >
            智能冰箱库存 ({inventory.length})
          </button>
          <button
            onClick={() => setActiveTab('scan')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeTab === 'scan'
                ? 'bg-forest-900 text-white shadow-soft dark:bg-forest-700'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100/80 dark:hover:bg-stone-800/60'
            }`}
          >
            拍照全景识图
          </button>
        </div>
      </header>

      {/* Main Content Area - 模态框打开时的单反景深虚化 (Depth-of-Field Blur) */}
      <main
        className={`max-w-6xl mx-auto px-4 lg:px-8 pt-5 transition-all duration-300 ${
          selectedRecipe || showAddModal || showAuthModal
            ? 'scale-[0.985] blur-[2px] opacity-90 pointer-events-none select-none'
            : ''
        }`}
      >
        {/* Urgent Expiring Alert Banner (Global) - 优雅的天然赏味期卡片 */}
        {summary.yellow_warning > 0 && (
          <div
            onClick={() => {
              setActiveTab('inventory');
              setSelectedZone('all');
            }}
            className="mb-6 p-4 rounded-2xl bg-caramel-50/70 dark:bg-caramel-900/20 border border-caramel-200/60 dark:border-caramel-800/40 flex items-center justify-between cursor-pointer hover:bg-caramel-100/60 dark:hover:bg-caramel-900/30 transition-all shadow-soft group"
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-caramel-100 dark:bg-caramel-800/50 flex items-center justify-center text-caramel-600 dark:text-caramel-300 shrink-0 shadow-xs">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <div>
                <span className="font-medium text-xs sm:text-sm text-stone-900 dark:text-stone-100">
                  有 {summary.yellow_warning} 种食材迎来最佳赏味期，建议优先享用
                </span>
                <p className="text-[11px] text-caramel-700/80 dark:text-caramel-300/80 mt-0.5">
                  已在菜谱推荐引擎中获得最高优先契合度
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium text-caramel-700 dark:text-caramel-300 shrink-0 group-hover:translate-x-0.5 transition-transform">
              <span>查看食材</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
        )}

        {/* TAB 1: RECIPES & INSPIRATION */}
        {activeTab === 'recipes' && (
          <div className="space-y-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-forest-100/80 dark:bg-forest-900/40 text-forest-800 dark:text-forest-300 text-[11px] font-semibold mb-1.5 border border-forest-200/50 dark:border-forest-800/40">
                  <span>{mealPeriod.icon}</span>
                  <span>{mealPeriod.tag}</span>
                  <span className="text-forest-600/70 dark:text-forest-400/70 text-[10px] tabular-nums">({mealPeriod.timeRange})</span>
                </div>
                <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                  {mealPeriod.title}
                </h1>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  {mealPeriod.subtitle}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  title="刷新推荐菜谱"
                  className="text-xs text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100 flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-full bg-stone-100/80 hover:bg-stone-200/80 dark:bg-stone-800/60 dark:hover:bg-stone-700/60 border border-stone-200/60 dark:border-stone-700/60 transition-all active:scale-90 shadow-xs"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-forest-700 dark:text-forest-400' : ''}`} />
                  <span className="hidden sm:inline">{isRefreshing ? '刷新中…' : '刷新推荐'}</span>
                </button>

                {/* AI 菜谱按钮：点击后由大厨根据冰箱现有食材现场生成 3 道菜谱 */}
                <button
                  onClick={handleTriggerAiChef}
                  disabled={isAiGenerating}
                  title={`根据冰箱现有食材，让 AI 大厨现场设计 ${AI_RECIPE_COUNT} 道菜谱`}
                  className="group btn-shimmer-caramel flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-caramel-500 via-caramel-600 to-caramel-500 bg-[length:200%_auto] hover:bg-right hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 text-white text-xs font-medium shadow-ambient-caramel transition-all duration-300 ease-spring active:scale-95"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-amber-200 transition-transform duration-300 ${isAiGenerating ? 'animate-spin' : 'group-hover:rotate-12 group-hover:scale-110 group-active:-rotate-12'}`} />
                  <span className="relative z-10">{isAiGenerating ? '生成中…' : 'AI 菜谱'}</span>
                </button>
              </div>
            </div>

            {/* 灵感流智能场景横滑筛选胶囊 (Contextual Filter Pills) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
              {[
                { id: 'all' as const, label: '全部灵感', icon: '✨', count: filterCounts.all },
                { id: 'quick' as const, label: '15分钟快手', icon: '⚡', count: filterCounts.quick },
                { id: 'soup' as const, label: '暖胃汤羹', icon: '🍲', count: filterCounts.soup },
                { id: 'light' as const, label: '减脂轻食', icon: '🥗', count: filterCounts.light },
                { id: 'urgent' as const, label: '优先赏味', icon: '⏳', count: filterCounts.urgent },
              ].map((pill) => {
                const isSelected = recipeFilter === pill.id;
                return (
                  <button
                    key={pill.id}
                    onClick={() => setRecipeFilter(pill.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 ${
                      isSelected
                        ? 'bg-forest-900 text-white shadow-soft dark:bg-forest-700'
                        : 'bg-white dark:bg-[#1E201D] text-stone-600 dark:text-stone-400 border border-[#1C1D1B]/[0.06] dark:border-white/[0.08] hover:bg-stone-50 dark:hover:bg-stone-800/60'
                    }`}
                  >
                    <span>{pill.icon}</span>
                    <span>{pill.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                      }`}
                    >
                      {pill.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 加载中提示 */}
            {loadingRecipes && recipes.length === 0 && (
              <div className="bg-white dark:bg-[#1E201D] rounded-3xl p-12 text-center border border-[#1C1D1B]/[0.06] dark:border-white/[0.08] shadow-card">
                <div className="w-8 h-8 border-2 border-forest-200 border-t-forest-600 rounded-full animate-spin mx-auto mb-3" />
                <span className="font-medium text-sm text-stone-700 dark:text-stone-200">正在为你挑选合适的菜谱…</span>
              </div>
            )}

            {/* 全局空状态提示 (带治愈手绘插画与行动按钮) */}
            {!loadingRecipes && recipes.length === 0 && (
              <EmotionalEmptyState
                type="recipes"
                title="暂时没有可推荐的菜谱"
                description="先拍一张冰箱照片或手动录入食材，大厨将即刻为你搭配适合的美味灵感！"
                primaryAction={{
                  label: '去拍照录入',
                  icon: <Camera className="w-3.5 h-3.5" />,
                  onClick: () => {
                    playShutterSound();
                    setActiveTab('scan');
                  },
                }}
                secondaryAction={{
                  label: 'AI 菜谱定制',
                  icon: <Sparkles className="w-3.5 h-3.5" />,
                  onClick: handleTriggerAiChef,
                }}
              />
            )}

            {/* 场景筛选结果为空时的治愈空状态插画与微文案 */}
            {!loadingRecipes && recipes.length > 0 && displayedRecipes.length === 0 && (
              <EmotionalEmptyState
                type="filter"
                title="没有找到该分类的菜谱"
                description="没有找到该分类的菜谱，看看全部推荐，或点击「AI 菜谱」让大厨现场设计"
                primaryAction={{
                  label: 'AI 菜谱',
                  icon: <Sparkles className="w-3.5 h-3.5" />,
                  onClick: handleTriggerAiChef,
                }}
                secondaryAction={{
                  label: '查看全部灵感',
                  icon: <Utensils className="w-3.5 h-3.5" />,
                  onClick: () => setRecipeFilter('all'),
                }}
              />
            )}

            {/* 库存有食材、但没有任何固定菜谱匹配得上时，引导用户使用 AI 定制 */}
            {!loadingRecipes &&
              inventory.length > 0 &&
              recipes.length > 0 &&
              recipes.every((r) => r.score === 0) && (
                <div className="p-4 rounded-2xl bg-forest-50/80 dark:bg-forest-950/60 border border-forest-200/70 dark:border-forest-800/60 flex items-center gap-3 shadow-soft">
                  <span className="w-8 h-8 rounded-xl bg-forest-100 dark:bg-forest-900 flex items-center justify-center text-forest-700 dark:text-forest-300 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="font-medium text-xs sm:text-sm text-forest-900 dark:text-forest-200">
                      没有找到契合现有食材的固定菜谱
                    </span>
                    <p className="text-[11px] text-forest-700/80 dark:text-forest-400 mt-0.5">
                      点击「AI 菜谱」按钮，让大厨按你现有的食材一次设计 {AI_RECIPE_COUNT} 道
                    </p>
                  </div>
                </div>
              )}

            {/* Recipe Grid - 杂志大图质感，卡片留白与呼吸感 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedRecipes.map((recipe) => (
                <div
                  key={recipe.id}
                  onClick={() => {
                    setSelectedRecipe(recipe);
                    setIsKitchenCookMode(false);
                    setCookingTimer((recipe.cook_time || 5) * 60);
                    setIsTimerRunning(false);
                  }}
                  className="group bg-white dark:bg-[#1E201D] rounded-3xl p-4 sm:p-5 border border-[#1C1D1B]/[0.06] dark:border-white/[0.08] shadow-card hover:shadow-card-hover transition-all duration-300 ease-spring-soft hover:-translate-y-1 active:scale-[0.985] cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    {/* Visual & Badges with Ambient Color Glow */}
                    <div className="relative mb-4">
                      {/* 菜品封面环境氛围背光 (Ambient Color Glow) - 投射大半径高斯模糊漫射光 */}
                      <div className="absolute -inset-1.5 rounded-2xl overflow-hidden pointer-events-none blur-xl opacity-25 group-hover:opacity-45 transition-opacity duration-500">
                        <img
                          src={recipe.image_url || '/images/dishes/recipe_tomato_egg.webp'}
                          alt=""
                          aria-hidden="true"
                          tabIndex={-1}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover scale-110"
                        />
                      </div>

                      <div className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-800">
                        <img
                          src={recipe.image_url || '/images/dishes/recipe_tomato_egg.webp'}
                          alt={recipe.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                          loading="lazy"
                          onError={(e: any) => {
                            if (!e.target.src.endsWith('/images/dishes/recipe_tomato_egg.webp')) {
                              e.target.src = '/images/dishes/recipe_tomato_egg.webp';
                            }
                          }}
                        />
                        {/* 渐变遮罩增强文字清晰度 */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

                        {/* Match Rate Pill - 高级毛玻璃徽章 */}
                        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[#1C1D1B]/75 backdrop-blur-md text-white text-[11px] font-medium flex items-center gap-1.5 border border-white/10 shadow-sm">
                          <Sparkles className="w-3 h-3 text-caramel-300" />
                          <span>匹配率 {Math.round((recipe.match_rate || 0.8) * 100)}%</span>
                        </div>

                        {/* AI 生成专属徽章 / 赏味优先徽章 */}
                        {recipe.id.startsWith('ai-recipe-') ? (
                          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                            <div className="px-2.5 py-1 rounded-full bg-gradient-to-r from-caramel-500 to-caramel-600 text-white text-[10px] font-medium flex items-center gap-1 shadow-sm">
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>AI 定制</span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteRecipe(recipe.id, e)}
                              title="删除 AI 菜谱"
                              className="w-6 h-6 rounded-full bg-black/45 hover:bg-rose-500 text-white/90 hover:text-white backdrop-blur-md transition-all shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 border border-white/10"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          recipe.urgency_boost > 0 && (
                            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-caramel-500 text-white text-[10px] font-medium backdrop-blur-sm shadow-sm">
                              赏味优先
                            </div>
                          )
                        )}

                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] text-white/95 font-medium">
                          <span className="px-2.5 py-0.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                            {recipe.difficulty}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-black/40 backdrop-blur-md flex items-center gap-1 border border-white/10">
                            <Clock className="w-3 h-3" />
                            <span>{recipe.cook_time}分钟</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <h3 className="font-bold text-base text-stone-900 dark:text-stone-100 group-hover:text-forest-700 dark:group-hover:text-forest-400 transition-colors">
                      {recipe.name}
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 line-clamp-2 leading-relaxed">
                      {recipe.tips || '经典家常下饭美味，主辅料契合度极佳。'}
                    </p>

                    {/* Matched Ingredients Chips - 温润自然标签，带食材微标签压印质感 */}
                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                      {recipe.matched_ingredients && recipe.matched_ingredients.length > 0 ? (
                        recipe.matched_ingredients.map((m, idx) => (
                          <span
                            key={idx}
                            className={`text-[10px] px-2.5 py-0.5 rounded-lg font-medium transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] border ${
                              m.urgency_level === 'yellow' || m.urgency_level === 'red'
                                ? 'bg-caramel-50 dark:bg-caramel-900/30 text-caramel-700 dark:text-caramel-300 border-caramel-200/80 dark:border-caramel-800/60'
                                : 'bg-forest-50 dark:bg-forest-950/60 text-forest-700 dark:text-forest-300 border-forest-200/80 dark:border-forest-800/60'
                            }`}
                          >
                            ✓ {m.recipe_ingredient}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] border border-black/[0.04] dark:border-white/[0.06]">
                          需备常见调料
                        </span>
                      )}
                    </div>

                    {/* 差额食材清单提示（匹配率未达 100% 时精准展示缺少清单） */}
                    {(() => {
                      const missingList = calculateMissingIngredients(recipe, inventory);
                      if (missingList.length > 0 && (recipe.match_rate || 0) < 1) {
                        return (
                          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/50 rounded-xl px-2.5 py-1.5 shadow-xs">
                            <ShoppingCart className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span className="truncate">
                              缺 {missingList.length} 样：{missingList.slice(0, 3).map((m) => m.name).join('、')}
                              {missingList.length > 3 ? ' 等' : ''}
                            </span>
                          </div>
                        );
                      }
                      if ((recipe.match_rate || 0) >= 1) {
                        return (
                          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-emerald-800 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/50 rounded-xl px-2.5 py-1.5 shadow-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>食材全部齐备 · 随时可下厨</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                    <span className="text-[11px] text-stone-400 dark:text-stone-500">{recipe.category}</span>
                    <span className="text-xs font-medium text-forest-700 dark:text-forest-400 flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
                      <span>查看下厨步骤</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: FRIDGE SCAN & RECEIPT OCR */}
        {activeTab === 'scan' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center space-y-3">
              <div>
                <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                  {scanMode === 'receipt' ? '买菜小票 / 订单截图一键扫入' : '冰箱全景多模态识别'}
                </h1>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  {scanMode === 'receipt'
                    ? '支持超市纸质小票（山姆、大润发等）及盒马/朴朴/美团订单截图，AI 自动剥离杂质批量入库'
                    : '拍一张冰箱整层照片，AI 自动批量提取食材、分类及建议存放周期'}
                </p>
              </div>

              {/* 识别模式切换胶囊 */}
              <div className="flex justify-center pt-1">
                <div className="inline-flex p-1 rounded-2xl bg-stone-100/90 dark:bg-stone-800/80 border border-stone-200/70 dark:border-stone-700/60 shadow-inner">
                  <button
                    type="button"
                    onClick={() => {
                      setScanMode('fridge');
                      if (!isScanning) {
                        setScanResult(null);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                      scanMode === 'fridge'
                        ? 'bg-white dark:bg-[#1E201D] text-forest-900 dark:text-forest-200 shadow-xs font-semibold'
                        : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>📸 拍冰箱内部</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScanMode('receipt');
                      if (!isScanning) {
                        setScanResult(null);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                      scanMode === 'receipt'
                        ? 'bg-white dark:bg-[#1E201D] text-amber-900 dark:text-amber-200 shadow-xs font-semibold'
                        : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>🧾 扫小票 / 订单截图</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Upload Box */}
            <div className="bg-white dark:bg-[#1E201D] rounded-3xl p-6 border border-[#1C1D1B]/[0.06] dark:border-white/[0.08] shadow-card text-center">
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
              />

              {isCompressing && (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <div className="w-9 h-9 border-3 border-forest-600 border-t-transparent rounded-full animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                      端侧等比智能画质压缩中...
                    </p>
                    <p className="text-xs text-stone-400 mt-1">
                      HTML5 Canvas 智能降采样并输出 WebP，识图多模态链路大幅提速
                    </p>
                  </div>
                </div>
              )}

              {!isCompressing && !previewUrl ? (
                <div
                  onClick={() => {
                    playShutterSound();
                    fileInputRef.current?.click();
                  }}
                  className="border-2 border-dashed border-stone-200 dark:border-stone-700/80 hover:border-forest-600/70 rounded-2xl p-9 cursor-pointer transition-all bg-stone-50/50 dark:bg-stone-800/20 hover:bg-forest-50/30 dark:hover:bg-forest-950/20 flex flex-col items-center justify-center gap-3.5 group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-forest-50 dark:bg-forest-900/40 text-forest-700 dark:text-forest-300 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
                    {scanMode === 'receipt' ? (
                      <Receipt className="w-7 h-7 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <UploadCloud className="w-7 h-7" />
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-stone-800 dark:text-stone-200">
                      {scanMode === 'receipt'
                        ? '点击上传小票或订单截图'
                        : '点击上传或直接拍照'}
                    </span>
                    <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                      {scanMode === 'receipt'
                        ? '山姆/盒马/朴朴/美团订单截图均可 · AI 自动过滤塑料袋等非食品'
                        : '支持高清手机原图 · 端侧自动智能等比压缩与提速'}
                    </p>
                  </div>
                </div>
              ) : !isCompressing && previewUrl ? (
                <div className="space-y-4">
                  <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-stone-100 dark:bg-stone-800 max-h-[360px] mx-auto border border-stone-200/80 dark:border-stone-700">
                    <img src={previewUrl} alt="预览图片" className="w-full h-full object-cover" />

                    {/* 压缩体积优化微标签 */}
                    {compressStats && (
                      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md text-white text-[11px] font-mono shadow-sm border border-white/10 z-10">
                        <Zap className="w-3.5 h-3.5 text-caramel-300" />
                        <span>
                          智能压缩 {(compressStats.originalSize / 1024 / 1024).toFixed(1)}MB →{' '}
                          {Math.round(compressStats.compressedSize / 1024)}KB (降幅{' '}
                          {Math.round(
                            (1 - compressStats.compressedSize / compressStats.originalSize) * 100
                          )}
                          %)
                        </span>
                      </div>
                    )}

                    {/* 动态激光雷达扫描波 (根据模式呈现不同主题辉光) */}
                    {isScanning && (
                      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
                        {/* 微弱雷达环境阴影与半透明底色遮罩 */}
                        <div
                          className={`absolute inset-0 backdrop-blur-[0.5px] ${
                            scanMode === 'receipt'
                              ? 'bg-amber-950/25 mix-blend-multiply'
                              : 'bg-emerald-950/25 mix-blend-multiply'
                          }`}
                        />
                        {/* 微弱雷达网格标线 */}
                        <div
                          className="absolute inset-0 opacity-20"
                          style={{
                            backgroundImage:
                              scanMode === 'receipt'
                                ? 'linear-gradient(to right, rgba(217, 119, 6, 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(217, 119, 6, 0.35) 1px, transparent 1px)'
                                : 'linear-gradient(to right, rgba(16, 185, 129, 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(16, 185, 129, 0.35) 1px, transparent 1px)',
                            backgroundSize: '24px 24px',
                          }}
                        />
                        {/* 动态激光扫描束：自上而下反复平滑扫掠 */}
                        <div className="absolute left-0 right-0 h-28 -mt-14 animate-laser-sweep pointer-events-none">
                          {/* 拖尾辉光渐变 */}
                          <div
                            className={`w-full h-full bg-gradient-to-b from-transparent ${
                              scanMode === 'receipt'
                                ? 'via-amber-500/25'
                                : 'via-emerald-500/25'
                            } to-transparent`}
                          />
                          {/* 核心激光扫描线 */}
                          <div
                            className={`absolute top-1/2 left-0 right-0 -translate-y-1/2 h-[2.5px] bg-gradient-to-r from-transparent ${
                              scanMode === 'receipt'
                                ? 'via-amber-400 shadow-[0_0_16px_3px_rgba(217,119,6,0.9),0_0_32px_8px_rgba(180,83,9,0.45)]'
                                : 'via-emerald-400 shadow-[0_0_16px_3px_rgba(16,185,129,0.9),0_0_32px_8px_rgba(5,150,105,0.45)]'
                            } to-transparent`}
                          />
                        </div>
                        {/* 多模态 AI 识别质感浮动标识 */}
                        <div
                          className={`absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/65 backdrop-blur-md border text-xs font-mono ${
                            scanMode === 'receipt'
                              ? 'border-amber-500/40 text-amber-300'
                              : 'border-emerald-500/40 text-emerald-400'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full animate-ping ${
                              scanMode === 'receipt' ? 'bg-amber-400' : 'bg-emerald-400'
                            }`}
                          />
                          <span className="tracking-wider font-semibold">
                            {scanMode === 'receipt'
                              ? 'AI OCR RECEIPT PARSING...'
                              : 'AI LIDAR SCANNING...'}
                          </span>
                        </div>
                      </div>
                    )}

                    <button
                      disabled={isScanning}
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                        setScanResult(null);
                        setCompressStats(null);
                      }}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-md hover:bg-black/80 transition-colors shadow-sm disabled:opacity-30 disabled:pointer-events-none z-10"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {!scanResult && (
                    <button
                      disabled={isScanning}
                      onClick={handleStartScan}
                      className={`w-full py-3.5 rounded-2xl text-white font-medium text-sm shadow-soft transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 ${
                        scanMode === 'receipt'
                          ? 'bg-amber-700 hover:bg-amber-800'
                          : 'bg-forest-800 hover:bg-forest-900'
                      }`}
                    >
                      {isScanning ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                          <span>
                            {scanMode === 'receipt'
                              ? 'AI 正在智能解析小票明细并过滤杂质...'
                              : 'AI 正在全景分析食材...'}
                          </span>
                        </>
                      ) : (
                        <>
                          {scanMode === 'receipt' ? (
                            <Receipt className="w-4 h-4 text-amber-200" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-caramel-300" />
                          )}
                          <span>
                            {scanMode === 'receipt'
                              ? '开始解析小票并提取生鲜'
                              : '开始 AI 智能识别'}
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            {/* Scan Results Bottom Sheet / Card */}
            {scanResult && (
              <div className="bg-white dark:bg-[#1E201D] rounded-3xl p-5 sm:p-6 border border-[#1C1D1B]/[0.06] dark:border-white/[0.08] shadow-card space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm sm:text-base text-stone-900 dark:text-stone-100">
                        {scanMode === 'receipt' ? '小票/订单解析清单' : '识别食材清单'} · 共 {scanResult.items.length} 样
                      </h3>
                      {scanMode === 'receipt' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50 font-medium">
                          已自动过滤非食品
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">{scanResult.summary}</p>
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
                    className="text-xs text-forest-700 dark:text-forest-400 font-medium hover:underline"
                  >
                    全选/反选
                  </button>
                </div>

                <div className="divide-y divide-stone-100 dark:divide-stone-800 max-h-[300px] overflow-y-auto pr-1">
                  {scanResult.items.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedScanItems((prev) => ({
                          ...prev,
                          [idx]: !prev[idx],
                        }));
                      }}
                      className="py-3 flex items-center justify-between cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/40 px-2.5 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                            selectedScanItems[idx]
                              ? 'bg-forest-700 border-forest-700 text-white'
                              : 'border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800'
                          }`}
                        >
                          {selectedScanItems[idx] && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs sm:text-sm text-stone-900 dark:text-stone-100">{item.name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                              {item.category}
                            </span>
                          </div>
                          <span className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5 block">
                            {item.storage_location} · 建议 {item.recommended_storage_days} 天内享用
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-stone-600 dark:text-stone-300 tabular-nums">
                        {item.estimated_quantity}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleConfirmBatchIngest}
                  className={`w-full py-3.5 rounded-2xl text-white font-medium text-sm shadow-soft transition-all active:scale-98 flex items-center justify-center gap-2 ${
                    scanMode === 'receipt'
                      ? 'bg-amber-700 hover:bg-amber-800'
                      : 'bg-forest-800 hover:bg-forest-900'
                  }`}
                >
                  {scanMode === 'receipt' ? (
                    <Receipt className="w-4 h-4 text-amber-200" />
                  ) : null}
                  <span>
                    确认将选中的生鲜批量入库 (
                    {Object.values(selectedScanItems).filter(Boolean).length} 件)
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: INVENTORY */}
        {activeTab === 'inventory' && (
          <div className="space-y-6">
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                  智能家庭在库看板
                </h1>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  智能赏味期三级温润提醒，单手触达即可标记烹饪消耗
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-forest-900 dark:bg-forest-700 hover:bg-forest-800 text-white text-xs font-medium shadow-soft transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>手动录入</span>
              </button>
            </div>

            {/* 冰箱物理分层收纳地图 (Interactive Storage Twin) */}
            {inventory.length > 0 && (
              <FridgeStorageMap
                items={inventory}
                selectedZone={selectedZone}
                onSelectZone={setSelectedZone}
              />
            )}

            {/* Segmented Location Filter - 快捷胶囊协同 */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {[
                { id: 'all' as StorageZoneId, label: `全部 (${inventory.length})` },
                { id: 'cold_main' as StorageZoneId, label: '冷藏主室' },
                { id: 'cold_drawer' as StorageZoneId, label: '果蔬保鲜抽屉' },
                { id: 'door_shelf' as StorageZoneId, label: '门侧置物架' },
                { id: 'freezer' as StorageZoneId, label: '深冷速冻室' },
                { id: 'pantry' as StorageZoneId, label: '常温干燥架' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedZone(tab.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
                    selectedZone === tab.id
                      ? 'bg-forest-900 dark:bg-forest-700 text-white shadow-soft font-semibold'
                      : 'bg-white dark:bg-[#1E201D] text-stone-600 dark:text-stone-400 border border-[#1C1D1B]/[0.06] dark:border-white/[0.08] hover:bg-stone-50 dark:hover:bg-stone-800/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Inventory List */}
            {loadingInventory && inventory.length === 0 ? (
              <div className="bg-white dark:bg-[#1E201D] rounded-3xl p-12 text-center border border-[#1C1D1B]/[0.06] dark:border-white/[0.08] shadow-card">
                <div className="w-8 h-8 border-2 border-forest-200 border-t-forest-600 rounded-full animate-spin mx-auto mb-3" />
                <span className="font-medium text-sm text-stone-700 dark:text-stone-200">正在读取冰箱库存…</span>
              </div>
            ) : inventory.length === 0 ? (
              <EmotionalEmptyState
                type="fridge"
                title="当前冰箱暂无食材"
                description="冰箱空空如也，生活正在等待被新鲜填满。拍一张冰箱照片即可快速全景智能录入！"
                primaryAction={{
                  label: '去拍照录入',
                  icon: <Camera className="w-3.5 h-3.5" />,
                  onClick: () => {
                    playShutterSound();
                    setActiveTab('scan');
                  },
                }}
                secondaryAction={{
                  label: '手动快速录入',
                  icon: <Plus className="w-3.5 h-3.5" />,
                  onClick: () => setShowAddModal(true),
                }}
              />
            ) : filteredInventory.length === 0 ? (
              <EmotionalEmptyState
                type="fridge"
                title="该储物区暂无食材"
                description="当前分区整洁清爽，也可以点击切换查看全部食材或录入新食材。"
                primaryAction={{
                  label: '查看全部食材',
                  onClick: () => setSelectedZone('all'),
                }}
                secondaryAction={{
                  label: '录入新食材',
                  icon: <Plus className="w-3.5 h-3.5" />,
                  onClick: () => setShowAddModal(true),
                }}
              />
            ) : (
              <div
                onClick={() => swipedCardId && setSwipedCardId(null)}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {filteredInventory.map((item) => (
                  <InventoryCard
                    key={item.id}
                    item={item}
                    onConsume={(id, name) => handleDeleteItem(id, name, 'consume')}
                    onRemove={(id, name) => handleDeleteItem(id, name, 'remove')}
                    swipedCardId={swipedCardId}
                    setSwipedCardId={setSwipedCardId}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* FOOTER 致谢区块 (食刻温暖自然风) */}
        <footer className="mt-16 sm:mt-20 pt-8 pb-28 lg:pb-10 border-t border-forest-100/60 dark:border-forest-900/40 text-center select-none">
          {/* 生态胶囊徽章 */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-forest-50 dark:bg-forest-950/80 text-forest-700 dark:text-forest-300 border border-forest-200/60 dark:border-forest-800/60 text-xs font-medium mb-2.5 shadow-xs">
            <span className="text-xs">🌱</span>
            <span>开源生态致谢</span>
          </div>

          <p className="text-xs text-stone-500 dark:text-stone-400 max-w-md mx-auto mb-5 leading-relaxed">
            食刻 AI 的菜谱灵感、量化下厨步骤与经典家常风味建立在开源社区的贡献之上
          </p>

          <div className="max-w-md mx-auto text-left">
            <a
              href="https://github.com/Anduin2017/HowToCook"
              target="_blank"
              rel="noopener noreferrer"
              className="group p-4 rounded-2xl bg-white/90 dark:bg-[#1E201D] hover:bg-white dark:hover:bg-[#232622] border border-[#1C1D1B]/[0.06] dark:border-white/[0.08] hover:border-forest-400/50 shadow-card hover:shadow-card-hover transition-all duration-300 flex items-center justify-between gap-3 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-forest-50 dark:bg-forest-900/40 border border-forest-100 dark:border-forest-800/50 flex items-center justify-center text-forest-700 dark:text-forest-300 shrink-0 group-hover:scale-105 transition-all duration-300">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-forest-600 shrink-0"></span>
                    <h4 className="text-xs font-semibold text-stone-800 dark:text-stone-200 group-hover:text-forest-700 dark:group-hover:text-forest-400 transition-colors truncate">
                      HowToCook 程序员做饭指南
                    </h4>
                  </div>
                  <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5 truncate pl-3">
                    严谨量化的中餐开源菜谱
                  </p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-stone-400 group-hover:text-forest-600 dark:group-hover:text-forest-400 group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
            </a>
          </div>
        </footer>
      </main>

      {/* 灶台大字专注下厨模式 (Kitchen Cook Mode 全屏大字专注台) */}
      {selectedRecipe && isKitchenCookMode && (
        <KitchenCookMode
          recipe={selectedRecipe}
          onExit={() => setIsKitchenCookMode(false)}
          onClose={() => {
            setSelectedRecipe(null);
            setIsKitchenCookMode(false);
          }}
          cookingTimer={cookingTimer}
          setCookingTimer={setCookingTimer}
          isTimerRunning={isTimerRunning}
          setIsTimerRunning={setIsTimerRunning}
          onCook={handleCook}
          isCookingSuccess={isCookingSuccess}
          cookingMessage={cookingMessage}
        />
      )}

      {/* COOKING WALKTHROUGH DRAWER / MODAL */}
      {selectedRecipe && !isKitchenCookMode && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-[#1E201D] rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-modal border border-[#1C1D1B]/[0.08] dark:border-white/[0.08]">
            {/* Modal Header */}
            <div className="relative aspect-[16/9] sm:aspect-[21/9] bg-stone-100 dark:bg-stone-800">
              <img
                src={selectedRecipe.image_url || '/images/dishes/recipe_tomato_egg.webp'}
                alt={selectedRecipe.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e: any) => {
                  if (!e.target.src.endsWith('/images/dishes/recipe_tomato_egg.webp')) {
                    e.target.src = '/images/dishes/recipe_tomato_egg.webp';
                  }
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/30 pointer-events-none" />
              <div className="absolute top-3.5 right-3.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsKitchenCookMode(true)}
                  className="px-2.5 py-1.5 rounded-full bg-black/50 hover:bg-forest-800 text-white/95 flex items-center gap-1.5 backdrop-blur-md transition-all shadow-sm border border-white/10 text-xs font-medium"
                  title="进入灶台大字专注下厨模式"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-caramel-300" />
                  <span className="hidden sm:inline">灶台大字模式</span>
                  <span className="sm:hidden">大字</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedRecipe(null);
                    setIsKitchenCookMode(false);
                  }}
                  className="w-8 h-8 rounded-full bg-black/50 text-white/90 hover:text-white flex items-center justify-center backdrop-blur-md hover:bg-black/75 transition-all shadow-sm border border-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="absolute bottom-4 left-5 right-5 text-white">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-forest-700/90 backdrop-blur-sm font-medium border border-white/10">
                    {selectedRecipe.category}
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-black/45 backdrop-blur-md border border-white/10">
                    {selectedRecipe.difficulty} · {selectedRecipe.cook_time}分钟
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold mt-1.5 tracking-tight text-white drop-shadow-sm">
                  {selectedRecipe.name}
                </h2>
              </div>
            </div>

            {/* Modal Scroll Content */}
            <div className="p-5 sm:p-7 overflow-y-auto space-y-6 flex-1">
              {/* Toast Feedback inside modal */}
              {cookingMessage && (
                <div className="p-3.5 rounded-2xl bg-forest-50 dark:bg-forest-950/80 border border-forest-200/80 dark:border-forest-800 text-forest-800 dark:text-forest-200 text-xs sm:text-sm font-medium flex items-center gap-2.5 shadow-soft animate-bounce">
                  <CheckCircle2 className="w-4 h-4 text-forest-600 dark:text-forest-400 shrink-0" />
                  <span>{cookingMessage}</span>
                </div>
              )}

              {/* Ingredients Breakdown */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 tracking-wider">
                    食材备料清单
                  </h4>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-stone-400 dark:text-stone-500">
                      共 {selectedRecipe.ingredients.length} 样
                    </span>
                    {modalMissing.length > 0 ? (
                      <span className="text-amber-700 dark:text-amber-300 font-medium">
                        · 缺 {modalMissing.length} 样需补齐
                      </span>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                        · 冰箱食材已全备齐
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {selectedRecipe.ingredients.map((ing, idx) => {
                    const isMissing = modalMissing.some(
                      (m) =>
                        m.name.toLowerCase().includes(ing.name.toLowerCase()) ||
                        ing.name.toLowerCase().includes(m.name.toLowerCase())
                    );
                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                          isMissing
                            ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/80 dark:border-amber-800/50 text-amber-950 dark:text-amber-200'
                            : 'bg-stone-50 dark:bg-stone-800/50 border-black/[0.04] dark:border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] text-stone-800 dark:text-stone-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {isMissing ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-forest-600 dark:text-forest-400 shrink-0" />
                          )}
                          <span className="font-medium truncate">{ing.name}</span>
                        </div>
                        <span
                          className={`tabular-nums shrink-0 ml-1 ${
                            isMissing
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-stone-400 dark:text-stone-500'
                          }`}
                        >
                          {ing.amount}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 差额买菜补货清单卡片与一键生成 */}
                {modalMissing.length > 0 && (
                  <div className="p-4 rounded-2xl bg-amber-50/85 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 shadow-soft space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-amber-950 dark:text-amber-100">
                          <ShoppingCart className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          <span>差额买菜补货清单 · 缺少 {modalMissing.length} 样食材</span>
                        </div>
                        <p className="text-[11px] text-amber-800/80 dark:text-amber-400">
                          从看到买到做，一键复制清单发给微信或备忘录照着买
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleCopyShoppingList}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-medium text-xs shadow-soft transition-all flex items-center justify-center gap-1.5 shrink-0"
                        title="一键复制买菜清单到剪贴板"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>🛒 生成买菜补货清单</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {modalMissing.map((item, idx) => (
                        <div
                          key={idx}
                          className="px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-stone-800/90 border border-amber-200/70 dark:border-amber-900/50 flex items-center gap-2 text-xs shadow-2xs"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          <span className="font-medium text-stone-900 dark:text-stone-100">{item.name}</span>
                          <span className="text-[11px] text-amber-700 dark:text-amber-400 font-mono">
                            {item.amount || '适量'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Step By Step Instructions - 舒展行距与大字号，便于厨房远距离扫读 */}
              <div>
                <h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 tracking-wider mb-3">
                  分步烹饪指南 (适合厨房扫读)
                </h4>
                <div className="space-y-4">
                  {selectedRecipe.instructions.map((step, idx) => (
                    <div key={idx} className="flex gap-3.5 items-start p-3 rounded-2xl bg-stone-50/60 dark:bg-stone-800/30 border border-stone-200/40 dark:border-stone-800/40">
                      <span className="w-6 h-6 rounded-full bg-forest-100 dark:bg-forest-900/60 text-forest-800 dark:text-forest-300 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                        {idx + 1}
                      </span>
                      <p className="text-sm sm:text-base text-stone-800 dark:text-stone-200 leading-relaxed font-normal">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kitchen Timer Widget - 温暖质感灶台计时器 */}
              <div
                className={`p-4 sm:p-5 rounded-2xl transition-all duration-300 flex items-center justify-between shadow-soft border ${
                  cookingTimer === 0
                    ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 animate-zero-alarm'
                    : 'bg-caramel-50/60 dark:bg-caramel-950/30 border-caramel-200/60 dark:border-caramel-800/40'
                }`}
              >
                <div>
                  <span
                    className={`text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      cookingTimer === 0
                        ? 'text-rose-700 dark:text-rose-300'
                        : 'text-caramel-800 dark:text-caramel-300'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    {cookingTimer === 0 ? '倒计时完成 · 请注意火候' : '灶台倒计时助手'}
                  </span>
                  <div
                    className={`text-3xl font-bold font-mono tabular-nums mt-1 tracking-wider transition-colors ${
                      cookingTimer === 0
                        ? 'text-rose-600 dark:text-rose-400 font-extrabold'
                        : 'text-stone-900 dark:text-stone-100'
                    }`}
                  >
                    {Math.floor(cookingTimer / 60)
                      .toString()
                      .padStart(2, '0')}
                    :{(cookingTimer % 60).toString().padStart(2, '0')}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    {/* 运行时的呼吸脉冲波纹环，让用户在厨房 1 米开外一眼即知正在倒计时 */}
                    {isTimerRunning && (
                      <span className="absolute -inset-1 rounded-full bg-forest-600/30 dark:bg-forest-500/40 animate-timer-ripple pointer-events-none" />
                    )}
                    <button
                      onClick={() => setIsTimerRunning(!isTimerRunning)}
                      className={`relative w-11 h-11 rounded-full text-white flex items-center justify-center shadow-ambient-emerald transition-all active:scale-90 ${
                        isTimerRunning
                          ? 'bg-forest-700 hover:bg-forest-800 ring-2 ring-forest-500/30'
                          : 'bg-forest-800 hover:bg-forest-900'
                      }`}
                      title={isTimerRunning ? '暂停计时' : '开始计时'}
                    >
                      {isTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setIsTimerRunning(false);
                      setCookingTimer((selectedRecipe.cook_time || 5) * 60);
                    }}
                    className="w-11 h-11 rounded-full bg-stone-200/80 dark:bg-stone-700/80 text-stone-700 dark:text-stone-200 flex items-center justify-center hover:bg-stone-300 dark:hover:bg-stone-600 transition-all active:scale-90"
                    title="重置时间"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Bottom Action */}
            <div className="p-4 sm:p-5 border-t border-stone-100 dark:border-stone-800 bg-[#FAFAF7] dark:bg-[#141514] flex flex-col sm:flex-row gap-3">
              {selectedRecipe.id.startsWith('ai-recipe-') && (
                <button
                  type="button"
                  onClick={() => handleDeleteRecipe(selectedRecipe.id)}
                  className="py-3 px-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 active:scale-98 text-rose-600 dark:text-rose-300 font-medium text-xs sm:text-sm border border-rose-200/80 dark:border-rose-800/50 transition-all flex items-center justify-center gap-1.5 shadow-soft"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>删除此 AI 菜谱</span>
                </button>
              )}
              <button
                onClick={() => handleCook(selectedRecipe)}
                disabled={isCookingSuccess}
                className={`flex-1 py-3.5 px-5 rounded-2xl text-white font-medium text-sm sm:text-base shadow-ambient-emerald transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 ${
                  isCookingSuccess
                    ? 'bg-emerald-600 scale-[1.02] shadow-emerald-500/25 ring-2 ring-emerald-400/50'
                    : 'bg-forest-900 hover:bg-forest-950 dark:bg-forest-700 dark:hover:bg-forest-600'
                }`}
              >
                {isCookingSuccess ? (
                  <>
                    <Check className="w-5 h-5 text-white animate-bounce" />
                    <span className="font-semibold tracking-wide">开饭啦！食材已自动扣减</span>
                  </>
                ) : (
                  <>
                    <Utensils className="w-4 h-4 text-caramel-300" />
                    <span>完成下厨 · 自动同步扣减食材库存</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL ADD INGREDIENT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#1E201D] rounded-3xl p-6 shadow-modal border border-[#1C1D1B]/[0.08] dark:border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3.5">
              <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">手动录入食材</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-7 h-7 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualAdd} className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">食材名称</label>
                  {matchedKnowledge && (
                    <span className="text-[11px] text-forest-700 dark:text-forest-400 font-medium">
                      💡 已识别：{matchedKnowledge.category} · 推荐保质{matchedKnowledge.shelfLifeDays}天
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="如：西红柿、土豆、五花肉、大虾"
                  value={newItemName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewItemName(val);
                    const k = matchIngredientKnowledge(val);
                    if (k) {
                      setNewItemCategory(k.category);
                      setNewItemLocation(k.location);
                      setNewItemDays(k.shelfLifeDays);
                    }
                  }}
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent text-xs focus:outline-none focus:border-forest-600 dark:focus:border-forest-400 transition-colors"
                />

                {/* 智能生鲜常识联想建议 */}
                {knowledgeSuggestions.length > 0 && !matchedKnowledge && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-stone-400">常识联想：</span>
                    {knowledgeSuggestions.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => applyIngredientKnowledge(item)}
                        className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-[11px] text-stone-600 dark:text-stone-300 hover:bg-forest-50 dark:hover:bg-forest-950/40 hover:text-forest-700 dark:hover:text-forest-300 transition-colors"
                      >
                        {item.name} ({item.shelfLifeDays}天)
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">分类</label>
                  <select
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="w-full mt-1.5 px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent text-xs focus:outline-none focus:border-forest-600 dark:focus:border-forest-400 transition-colors"
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
                  <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">预估份量</label>
                  <input
                    type="text"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(e.target.value)}
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent text-xs focus:outline-none focus:border-forest-600 dark:focus:border-forest-400 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">存放位置</label>
                  <select
                    value={newItemLocation}
                    onChange={(e) => setNewItemLocation(e.target.value)}
                    className="w-full mt-1.5 px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent text-xs focus:outline-none focus:border-forest-600 dark:focus:border-forest-400 transition-colors"
                  >
                    <option>冷藏室</option>
                    <option>冷藏抽屉</option>
                    <option>冷冻室</option>
                    <option>冰箱门架</option>
                    <option>常温储物</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">保存天数</label>
                    <span className="text-[10px] text-stone-400">至 {calculatedExpiryDate}</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={newItemDays}
                    onChange={(e) => setNewItemDays(Number(e.target.value))}
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent text-xs focus:outline-none focus:border-forest-600 dark:focus:border-forest-400 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-3 rounded-2xl bg-forest-800 hover:bg-forest-900 text-white font-medium text-xs sm:text-sm shadow-soft transition-all active:scale-98"
              >
                确认录入
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Auth Modal (Login / Register) */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1E201D] rounded-3xl p-6 w-full max-w-sm shadow-modal border border-[#1C1D1B]/[0.08] dark:border-white/[0.08] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-forest-50 dark:bg-forest-900/50 text-forest-700 dark:text-forest-300 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm sm:text-base text-stone-900 dark:text-stone-100">
                  {authMode === 'login' ? '登录食刻 AI' : '注册新账号'}
                </h3>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-500 dark:text-stone-400 mt-2.5 leading-relaxed">
              {authMode === 'login'
                ? '登录后可跨电脑、手机随时查看和管理同一个冰箱，数据永不丢失。'
                : '自定义一个专属用户名即可，注册后当前设备上的食材将自动归入你的账号。'}
            </p>

            <form onSubmit={handleAuthSubmit} className="space-y-3.5 mt-4">
              {authError && (
                <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/90 dark:border-rose-800/50 text-xs text-rose-600 dark:text-rose-300 flex items-start gap-2.5 animate-in fade-in duration-150">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-500 mt-0.5" />
                  <div className="leading-snug">
                    <p className="font-semibold">
                      {authError.includes('锁定') ? '🔒 登录防爆破安全保护已触发' : '验证提示'}
                    </p>
                    <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-0.5">{authError}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">用户名</label>
                <input
                  type="text"
                  required
                  placeholder="如：baobao / kaikai"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent text-xs focus:outline-none focus:border-forest-600 dark:focus:border-forest-400 transition-colors"
                />
              </div>

              {authMode === 'register' && (
                <div>
                  <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">个性昵称 (选填)</label>
                  <input
                    type="text"
                    placeholder="如：大厨包包"
                    value={authNickname}
                    onChange={(e) => setAuthNickname(e.target.value)}
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent text-xs focus:outline-none focus:border-forest-600 dark:focus:border-forest-400 transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">密码</label>
                <input
                  type="password"
                  required
                  placeholder="至少6位密码"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent text-xs focus:outline-none focus:border-forest-600 dark:focus:border-forest-400 transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">安全验证码</label>
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    className="text-[11px] text-forest-700 dark:text-forest-400 hover:underline flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${captchaLoading ? 'animate-spin' : ''}`} />
                    <span>换一张</span>
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type="text"
                    required
                    placeholder="输入计算结果"
                    value={captchaCode}
                    onChange={(e) => setCaptchaCode(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent text-xs focus:outline-none focus:border-forest-600 dark:focus:border-forest-400 transition-colors"
                  />
                  <div
                    onClick={loadCaptcha}
                    title="点击更换验证码"
                    className="cursor-pointer flex-shrink-0 relative rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 hover:border-forest-500 transition-all bg-stone-50 dark:bg-stone-800/80 flex items-center justify-center min-w-[124px] h-[42px] shadow-sm select-none"
                  >
                    {captchaLoading ? (
                      <div className="flex items-center gap-1.5 text-stone-400 text-[11px]">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-forest-600" />
                        <span>加载中...</span>
                      </div>
                    ) : captchaData?.svg ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`data:image/svg+xml;utf8,${encodeURIComponent(captchaData.svg)}`}
                        alt="验证码"
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    ) : (
                      <span className="text-[11px] text-stone-400">点击获取</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isAuthSubmitting}
                className="w-full mt-2 py-3.5 rounded-2xl bg-forest-800 hover:bg-forest-900 disabled:opacity-50 text-white font-medium text-xs sm:text-sm shadow-soft transition-all active:scale-98"
              >
                {isAuthSubmitting ? '处理中...' : authMode === 'login' ? '立即登录并同步' : '完成注册并自动登录'}
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs">
              <span className="text-stone-500 dark:text-stone-400">
                {authMode === 'login' ? '还没有账号？' : '已有账号？'}
              </span>
              <button
                type="button"
                onClick={() => switchAuthMode(authMode === 'login' ? 'register' : 'login')}
                className="text-forest-700 dark:text-forest-400 font-medium hover:underline"
              >
                {authMode === 'login' ? '免费注册一个' : '直接登录'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION DOCK */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FAFAF7]/90 dark:bg-[#141514]/90 backdrop-blur-md border-t border-[#1C1D1B]/[0.06] dark:border-white/[0.08] px-4 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] flex items-center justify-around shadow-modal">
        <button
          onClick={() => setActiveTab('recipes')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
            activeTab === 'recipes' ? 'text-forest-800 dark:text-forest-300' : 'text-stone-400 dark:text-stone-500'
          }`}
        >
          <ChefHat className="w-5 h-5" />
          <span>灵感</span>
        </button>

        {/* Big Shutter Camera Center Button */}
        <div className="relative -top-3">
          {/* 常态柔和呼吸光晕环 */}
          <div className="absolute -inset-1.5 rounded-full bg-forest-600/30 dark:bg-forest-500/35 blur-sm animate-pulse-glow pointer-events-none" />
          <button
            onClick={() => setActiveTab('scan')}
            aria-label="拍冰箱入库"
            className="relative w-12 h-12 rounded-full bg-gradient-to-tr from-forest-900 via-forest-800 to-forest-700 hover:from-forest-800 hover:to-forest-600 text-white flex items-center justify-center shadow-ambient-emerald border-2 border-white/20 active:scale-85 transition-transform duration-150 ease-out"
          >
            <Camera className="w-5 h-5 transition-transform duration-150 active:scale-90" />
          </button>
        </div>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
            activeTab === 'inventory' ? 'text-forest-800 dark:text-forest-300' : 'text-stone-400 dark:text-stone-500'
          }`}
        >
          <Refrigerator className="w-5 h-5" />
          <span>库存</span>
        </button>
      </nav>
    </div>
  );
}
