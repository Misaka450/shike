import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectRecipeImage, RECIPE_IMAGE_MAP } from '../recipeImage.js';

describe('selectRecipeImage（食谱封面图精准智能对应）', () => {
  it('番茄炒蛋/西红柿炒蛋优先使用本地高质量 WebP 封面', () => {
    assert.equal(selectRecipeImage('西红柿炒鸡蛋'), '/images/dishes/recipe_tomato_egg.webp');
    assert.equal(selectRecipeImage('番茄炒蛋'), '/images/dishes/recipe_tomato_egg.webp');
    assert.equal(selectRecipeImage('西红柿炒蛋'), '/images/dishes/recipe_tomato_egg.webp');
  });

  it('官方已核验核心菜品优先匹配本地高质量 WebP 大片', () => {
    assert.equal(selectRecipeImage('地三鲜'), '/images/dishes/recipe_di_san_xian.webp');
    assert.equal(selectRecipeImage('酸辣土豆丝'), '/images/dishes/recipe_potato_shreds.webp');
    assert.equal(selectRecipeImage('麻婆豆腐'), '/images/dishes/recipe_mapo_tofu.webp');
    assert.equal(selectRecipeImage('可乐鸡翅'), '/images/dishes/recipe_cola_wings.webp');
    assert.equal(selectRecipeImage('糖醋排骨'), '/images/dishes/recipe_sweet_sour_ribs.webp');
    assert.equal(selectRecipeImage('青椒小炒肉'), '/images/dishes/recipe_pepper_pork.webp');
    assert.equal(selectRecipeImage('白灼基围虾'), '/images/dishes/recipe_steamed_shrimp.webp');
    assert.equal(selectRecipeImage('蚂蚁上树'), '/images/dishes/recipe_htc_8402a0fbca.webp');
    assert.equal(selectRecipeImage('茄子炖土豆'), '/images/dishes/recipe_htc_083a15958b_v2.webp');
    assert.equal(selectRecipeImage('红烧鲤鱼'), '/images/dishes/recipe_htc_4b2beca30f.webp');
    assert.equal(selectRecipeImage('蒜苔炒肉末'), '/images/dishes/recipe_htc_b80cf09bf6.webp');
    assert.equal(selectRecipeImage('黄瓜炒肉'), '/images/dishes/recipe_htc_0cc027f236.webp');
  });

  it('支持传入 recipeId 强锁定本地核验大片', () => {
    assert.equal(selectRecipeImage('创新地三鲜', '家常菜', [], 'recipe-di-san-xian'), '/images/dishes/recipe_di_san_xian.webp');
    assert.equal(selectRecipeImage('东北大乱炖', '家常菜', [], 'recipe-htc-083a15958b'), '/images/dishes/recipe_htc_083a15958b_v2.webp');
  });

  it('非白名单茄子类匹配通用茄子图', () => {
    assert.equal(selectRecipeImage('风味茄子煲'), RECIPE_IMAGE_MAP.eggplant);
    assert.equal(selectRecipeImage('烤茄子'), RECIPE_IMAGE_MAP.eggplant);
  });

  it('非白名单土豆类匹配通用土豆图', () => {
    assert.equal(selectRecipeImage('炸薯条'), RECIPE_IMAGE_MAP.potato);
    assert.equal(selectRecipeImage('香煎土豆块'), RECIPE_IMAGE_MAP.potato);
  });

  it('非白名单豆腐类匹配通用豆腐图', () => {
    assert.equal(selectRecipeImage('家常豆腐'), RECIPE_IMAGE_MAP.tofu);
    assert.equal(selectRecipeImage('香煎豆腐'), RECIPE_IMAGE_MAP.tofu);
  });

  it('非白名单鸡翅类匹配通用鸡翅图', () => {
    assert.equal(selectRecipeImage('奥尔良烤翅'), RECIPE_IMAGE_MAP.chicken_wings);
    assert.equal(selectRecipeImage('蒜香鸡翅'), RECIPE_IMAGE_MAP.chicken_wings);
  });

  it('鸡肉类正确匹配且不受鸡蛋干扰', () => {
    assert.equal(selectRecipeImage('宫保鸡丁'), RECIPE_IMAGE_MAP.chicken);
    assert.equal(selectRecipeImage('经典黄焖鸡'), RECIPE_IMAGE_MAP.chicken);
    assert.equal(selectRecipeImage('广式白切鸡'), RECIPE_IMAGE_MAP.chicken);
    // 鸡蛋羹不应误判为鸡肉，而应命中蛋类
    assert.equal(selectRecipeImage('鸡蛋羹'), RECIPE_IMAGE_MAP.egg_dishes);
    assert.equal(selectRecipeImage('微波炉蒸蛋'), RECIPE_IMAGE_MAP.egg_dishes);
  });

  it('非白名单排骨类匹配通用排骨图', () => {
    assert.equal(selectRecipeImage('红烧排骨'), RECIPE_IMAGE_MAP.ribs);
    assert.equal(selectRecipeImage('粉蒸排骨'), RECIPE_IMAGE_MAP.ribs);
  });

  it('红烧肉与五花肉匹配红烧肉图', () => {
    assert.equal(selectRecipeImage('回锅肉'), RECIPE_IMAGE_MAP.braised_pork);
    assert.equal(selectRecipeImage('红烧五花肉'), RECIPE_IMAGE_MAP.braised_pork);
  });

  it('非白名单小炒肉与肉丝匹配炒肉图', () => {
    assert.equal(selectRecipeImage('农家小炒肉片'), RECIPE_IMAGE_MAP.stir_fry_pork);
    assert.equal(selectRecipeImage('京酱肉丝'), RECIPE_IMAGE_MAP.stir_fry_pork);
  });

  it('牛肉类匹配牛肉图', () => {
    assert.equal(selectRecipeImage('水煮牛肉'), RECIPE_IMAGE_MAP.beef);
    assert.equal(selectRecipeImage('葱爆牛肉'), RECIPE_IMAGE_MAP.beef);
  });

  it('非白名单水产鱼虾匹配对应海鲜图', () => {
    assert.equal(selectRecipeImage('清蒸鲈鱼'), RECIPE_IMAGE_MAP.fish);
    assert.equal(selectRecipeImage('白灼大虾仁'), RECIPE_IMAGE_MAP.shrimp_seafood);
  });

  it('面食、炒饭与点心面食匹配对应高清图', () => {
    assert.equal(selectRecipeImage('葱油拌面'), RECIPE_IMAGE_MAP.noodles);
    assert.equal(selectRecipeImage('扬州炒饭'), RECIPE_IMAGE_MAP.rice_staple);
    assert.equal(selectRecipeImage('三鲜水饺'), RECIPE_IMAGE_MAP.dumplings_dimsum);
  });

  it('烘焙甜品正确匹配松饼与甜点图', () => {
    assert.equal(selectRecipeImage('香蕉燕麦低卡松饼'), RECIPE_IMAGE_MAP.baking_dessert);
    assert.equal(selectRecipeImage('焦糖香蕉烤吐司'), RECIPE_IMAGE_MAP.baking_dessert);
  });

  it('沙拉与轻食类菜谱精准匹配沙拉高清图', () => {
    assert.equal(selectRecipeImage('三文鱼轻食温沙拉'), RECIPE_IMAGE_MAP.salad);
    assert.equal(selectRecipeImage('经典蔬菜沙拉'), RECIPE_IMAGE_MAP.salad);
    assert.equal(selectRecipeImage('鸡胸肉沙拉'), RECIPE_IMAGE_MAP.salad);
    assert.equal(selectRecipeImage('东北大拌菜'), RECIPE_IMAGE_MAP.salad);
    assert.equal(selectRecipeImage('油醋汁时蔬'), RECIPE_IMAGE_MAP.salad);
  });

  it('轻食沙拉分类兜底返回沙拉封面图', () => {
    assert.equal(selectRecipeImage('自选活力轻食碗', '轻食沙拉'), RECIPE_IMAGE_MAP.fallback_salad);
    assert.equal(selectRecipeImage('低卡营养餐', '沙拉'), RECIPE_IMAGE_MAP.fallback_salad);
    assert.equal(selectRecipeImage('塑形减脂餐', '减脂轻食'), RECIPE_IMAGE_MAP.fallback_salad);
  });

  it('未命中特定关键词时按分类正确兜底', () => {
    const veggieFallback = selectRecipeImage('神秘时蔬小炒', '素菜');
    assert.equal(veggieFallback, RECIPE_IMAGE_MAP.fallback_veggie);

    const meatFallback = selectRecipeImage('秘制特色炒菜', '家常菜');
    assert.equal(meatFallback, RECIPE_IMAGE_MAP.fallback_chinese_hot);
  });
});
