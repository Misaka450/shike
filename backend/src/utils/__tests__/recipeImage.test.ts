import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectRecipeImage, RECIPE_IMAGE_MAP } from '../recipeImage.js';

describe('selectRecipeImage（食谱封面图精准智能对应）', () => {
  it('番茄炒蛋/西红柿炒蛋优先使用本地高清 WebP 封面', () => {
    assert.equal(selectRecipeImage('西红柿炒鸡蛋'), '/images/tomato_egg.webp');
    assert.equal(selectRecipeImage('番茄炒蛋'), '/images/tomato_egg.webp');
    assert.equal(selectRecipeImage('西红柿炒蛋'), '/images/tomato_egg.webp');
  });

  it('地三鲜与茄子类匹配茄子高清图', () => {
    const url = selectRecipeImage('地三鲜');
    assert.equal(url, RECIPE_IMAGE_MAP.eggplant);
    assert.equal(selectRecipeImage('风味茄子煲'), RECIPE_IMAGE_MAP.eggplant);
  });

  it('土豆类精准匹配土豆高清图', () => {
    assert.equal(selectRecipeImage('酸辣土豆丝'), RECIPE_IMAGE_MAP.potato);
  });

  it('豆腐与麻婆豆腐匹配麻婆豆腐图', () => {
    assert.equal(selectRecipeImage('麻婆豆腐'), RECIPE_IMAGE_MAP.tofu);
    assert.equal(selectRecipeImage('家常豆腐'), RECIPE_IMAGE_MAP.tofu);
  });

  it('鸡翅与可乐鸡翅匹配鸡翅图', () => {
    assert.equal(selectRecipeImage('可乐鸡翅'), RECIPE_IMAGE_MAP.chicken_wings);
    assert.equal(selectRecipeImage('奥尔良烤翅'), RECIPE_IMAGE_MAP.chicken_wings);
  });

  it('鸡肉类正确匹配且不受鸡蛋干扰', () => {
    assert.equal(selectRecipeImage('宫保鸡丁'), RECIPE_IMAGE_MAP.chicken);
    assert.equal(selectRecipeImage('经典黄焖鸡'), RECIPE_IMAGE_MAP.chicken);
    assert.equal(selectRecipeImage('广式白切鸡'), RECIPE_IMAGE_MAP.chicken);
    // 鸡蛋羹不应误判为鸡肉，而应命中蛋类
    assert.equal(selectRecipeImage('鸡蛋羹'), RECIPE_IMAGE_MAP.egg_dishes);
    assert.equal(selectRecipeImage('微波炉蒸蛋'), RECIPE_IMAGE_MAP.egg_dishes);
  });

  it('排骨类匹配排骨图', () => {
    assert.equal(selectRecipeImage('糖醋排骨'), RECIPE_IMAGE_MAP.ribs);
    assert.equal(selectRecipeImage('红烧排骨'), RECIPE_IMAGE_MAP.ribs);
  });

  it('红烧肉与五花肉匹配红烧肉图', () => {
    assert.equal(selectRecipeImage('回锅肉'), RECIPE_IMAGE_MAP.braised_pork);
    assert.equal(selectRecipeImage('红烧五花肉'), RECIPE_IMAGE_MAP.braised_pork);
  });

  it('小炒肉与肉丝匹配小炒肉图', () => {
    assert.equal(selectRecipeImage('青椒小炒肉'), RECIPE_IMAGE_MAP.stir_fry_pork);
    assert.equal(selectRecipeImage('鱼香肉丝'), RECIPE_IMAGE_MAP.stir_fry_pork);
  });

  it('牛肉类匹配牛肉图', () => {
    assert.equal(selectRecipeImage('水煮牛肉'), RECIPE_IMAGE_MAP.beef);
    assert.equal(selectRecipeImage('葱爆牛肉'), RECIPE_IMAGE_MAP.beef);
  });

  it('水产鱼虾匹配对应海鲜图', () => {
    assert.equal(selectRecipeImage('清蒸鲈鱼'), RECIPE_IMAGE_MAP.fish);
    assert.equal(selectRecipeImage('白灼基围虾'), RECIPE_IMAGE_MAP.shrimp_seafood);
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

  it('未命中特定关键词时使用真实中餐分类兜底，严禁返回欧式生蔬菜沙拉', () => {
    const veggieFallback = selectRecipeImage('神秘时蔬小炒', '素菜');
    assert.notEqual(veggieFallback, 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500');
    assert.notEqual(veggieFallback, 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500');
    assert.equal(veggieFallback, RECIPE_IMAGE_MAP.fallback_veggie);

    const meatFallback = selectRecipeImage('秘制特色炒菜', '家常菜');
    assert.equal(meatFallback, RECIPE_IMAGE_MAP.fallback_chinese_hot);
  });
});
