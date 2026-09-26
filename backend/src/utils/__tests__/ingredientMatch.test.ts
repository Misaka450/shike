import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isIngredientMatch } from '../ingredientMatch.js';

describe('isIngredientMatch（食材名匹配）', () => {
  it('名称完全相同应匹配', () => {
    assert.equal(isIngredientMatch('西红柿', '西红柿'), true);
  });

  it('同义词（番茄 / 西红柿）应匹配', () => {
    assert.equal(isIngredientMatch('番茄', '西红柿'), true);
  });

  it('包含关系应匹配（土鸡蛋 / 鸡蛋）', () => {
    assert.equal(isIngredientMatch('土鸡蛋', '鸡蛋'), true);
  });

  it('同组肉类应互相匹配（五花肉 / 猪里脊，同属猪肉类）', () => {
    assert.equal(isIngredientMatch('五花肉', '猪里脊'), true);
  });

  it('大小写与首尾空格应被忽略', () => {
    assert.equal(isIngredientMatch('  TOMATO  ', 'tomato'), true);
  });

  it('无关食材不应匹配（西红柿 / 牛肉）', () => {
    assert.equal(isIngredientMatch('西红柿', '牛肉'), false);
  });

  it('空字符串不应匹配任何食材（防止脏数据把全部菜谱判为匹配）', () => {
    assert.equal(isIngredientMatch('', '西红柿'), false);
    assert.equal(isIngredientMatch('西红柿', ''), false);
    assert.equal(isIngredientMatch('   ', '西红柿'), false);
  });

  it('不同肉类的同名制品不应互相匹配（牛肉末 / 猪肉末）', () => {
    // 回归用例：旧实现走模糊包含判断，"牛肉末"会因包含"肉末"被算进"猪肉"分组，
    // 于是冰箱里的猪肉末会被当成牛肉末的替代品
    assert.equal(isIngredientMatch('牛肉末', '猪肉末'), false);
    assert.equal(isIngredientMatch('猪肉末', '牛肉末'), false);
  });

  it('不同肉类的同名部位不应互相匹配（牛排 / 猪排）', () => {
    assert.equal(isIngredientMatch('牛排', '猪排'), false);
    assert.equal(isIngredientMatch('猪排', '牛排'), false);
  });

  it('带修饰词的写法仍应匹配到同义词（有机土豆 / 马铃薯）', () => {
    // 非标准叫法走模糊兜底路径，保证没有回归
    assert.equal(isIngredientMatch('有机土豆', '马铃薯'), true);
  });

  it('同义词词典内严格以分组为准，洋葱与葱不匹配（修复 LOG-01）', () => {
    assert.equal(isIngredientMatch('洋葱', '葱'), false);
    assert.equal(isIngredientMatch('葱', '洋葱'), false);
    assert.equal(isIngredientMatch('洋葱', '大葱'), false);
    assert.equal(isIngredientMatch('香葱', '洋葱'), false);
    assert.equal(isIngredientMatch('紫洋葱', '洋葱'), true);
    assert.equal(isIngredientMatch('大葱', '小葱'), true);
  });

  it('牛肉末与通用肉末不应互相匹配（修复 LOG-01）', () => {
    assert.equal(isIngredientMatch('牛肉末', '肉末'), false);
    assert.equal(isIngredientMatch('肉末', '牛肉末'), false);
    assert.equal(isIngredientMatch('猪肉末', '肉末'), true);
    assert.equal(isIngredientMatch('肉末', '猪肉末'), true);
  });

  it('带修饰词时互斥保护仍然生效（有机洋葱与葱、有机牛肉末与肉末）', () => {
    assert.equal(isIngredientMatch('有机洋葱', '葱'), false);
    assert.equal(isIngredientMatch('葱', '有机洋葱'), false);
    assert.equal(isIngredientMatch('有机洋葱', '小葱'), false);
    assert.equal(isIngredientMatch('新鲜洋葱', '香葱'), false);
    assert.equal(isIngredientMatch('有机牛肉末', '肉末'), false);
    assert.equal(isIngredientMatch('肉末', '有机牛肉末'), false);
    assert.equal(isIngredientMatch('有机牛肉末', '猪肉末'), false);
    assert.equal(isIngredientMatch('有机洋葱', '洋葱'), true);
  });
});