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
});