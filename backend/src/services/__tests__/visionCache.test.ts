import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearVisionCache } from '../visionService.js';

describe('visionService（多模态识图本地哈希缓存）', () => {
  it('clearVisionCache 可正常清空缓存', () => {
    assert.doesNotThrow(() => clearVisionCache());
  });
});
