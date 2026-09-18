import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { InventoryItem } from '../../schemas/index.js';

// 使用内存数据库，避免单元测试污染本地数据文件
process.env.DB_PATH = ':memory:';

// 动态导入：保证上面的 DB_PATH 在模块初始化之前就已经生效
const { generateAiRecipes } = await import('../recipeService.js');

const originalFetch = globalThis.fetch;

/** 构造一条模拟的库存记录 */
function makeInventoryItem(name: string): InventoryItem {
  return {
    id: 1,
    user_id: 'guest_test',
    name,
    category: '蔬菜',
    quantity: '2个',
    unit: '',
    storage_location: '冷藏',
    confidence: 1,
    storage_days: 3,
    expiry_date: '2099-12-31',
    added_at: '2026-09-17T00:00:00.000Z',
    status: 'active',
    updated_at: '2026-09-17T00:00:00.000Z',
    urgency_level: 'green',
    days_remaining: 5,
  };
}

/** 构造一道结构合法的菜谱（模拟模型输出的单个元素） */
function makeRecipeJson(name: string) {
  return {
    name,
    category: '家常菜',
    cuisine: '中餐',
    difficulty: '简单',
    prep_time: 5,
    cook_time: 10,
    servings: 2,
    ingredients: [{ name: '西红柿', amount: '2个', required: true }],
    instructions: ['第一步', '第二步'],
    tips: '小技巧',
  };
}

/** 伪造 CPA 接口的响应，content 模拟模型产出的文本 */
function mockCpaResponse(content: string): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
}

describe('generateAiRecipes（AI 菜谱生成与解析）', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('模型返回 3 道菜谱时应全部解析成功', async () => {
    mockCpaResponse(
      JSON.stringify({
        recipes: [makeRecipeJson('菜A'), makeRecipeJson('菜B'), makeRecipeJson('菜C')],
      })
    );

    const result = await generateAiRecipes('usr_test', [makeInventoryItem('西红柿')], undefined, 3);

    assert.equal(result.length, 3);
    assert.ok(result[0].name.includes('菜A'));
    assert.ok(result[0].id.startsWith('ai-recipe-'));
  });

  it('模型只返回单个菜谱对象时应能兼容（自动包装为数组）', async () => {
    mockCpaResponse(JSON.stringify(makeRecipeJson('独苗菜')));

    const result = await generateAiRecipes('usr_test', [makeInventoryItem('西红柿')], undefined, 3);

    assert.equal(result.length, 1);
    assert.ok(result[0].name.includes('独苗菜'));
  });

  it('模型直接返回数组时应能兼容', async () => {
    mockCpaResponse(JSON.stringify([makeRecipeJson('菜A'), makeRecipeJson('菜B')]));

    const result = await generateAiRecipes('usr_test', [makeInventoryItem('西红柿')], undefined, 3);

    assert.equal(result.length, 2);
  });

  it('模型返回结构非法时应整体丢弃，避免脏数据进入数据库', async () => {
    // ingredients 是字符串而不是数组，属于典型的结构错误
    mockCpaResponse(
      JSON.stringify({ recipes: [{ ...makeRecipeJson('坏菜'), ingredients: '西红柿' }] })
    );

    const result = await generateAiRecipes('usr_test', [makeInventoryItem('西红柿')], undefined, 3);

    assert.equal(result.length, 0);
  });

  it('模型输出带 Markdown 代码围栏时应能正确清洗', async () => {
    mockCpaResponse(
      '```json\n' + JSON.stringify({ recipes: [makeRecipeJson('围栏菜')] }) + '\n```'
    );

    const result = await generateAiRecipes('usr_test', [makeInventoryItem('西红柿')], undefined, 3);

    assert.equal(result.length, 1);
  });

  it('库存为空时应直接返回空数组，且不调用模型', async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch;

    const result = await generateAiRecipes('usr_test', [], undefined, 3);

    assert.equal(result.length, 0);
    assert.equal(called, false);
  });

  it('匹配率应按真实库存计算（同义词也算命中）', async () => {
    mockCpaResponse(JSON.stringify({ recipes: [makeRecipeJson('番茄菜')] }));

    const result = await generateAiRecipes('usr_test', [makeInventoryItem('番茄')], undefined, 3);

    assert.equal(result.length, 1);
    // 冰箱里的「番茄」与菜谱里的「西红柿」属同义词，应当匹配上，匹配率为 100%
    assert.equal(result[0].match_rate, 1);
  });

  it('模型返回数量超过请求值时应按请求数量截断', async () => {
    mockCpaResponse(
      JSON.stringify({
        recipes: [
          makeRecipeJson('菜A'),
          makeRecipeJson('菜B'),
          makeRecipeJson('菜C'),
          makeRecipeJson('菜D'),
        ],
      })
    );

    const result = await generateAiRecipes('usr_test', [makeInventoryItem('西红柿')], undefined, 2);

    assert.equal(result.length, 2);
  });
});