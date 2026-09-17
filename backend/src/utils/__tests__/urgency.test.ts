import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDaysRemaining, computeUrgency } from '../urgency.js';

/** 把日期格式化为 YYYY-MM-DD（按本地时区，避免时区偏移导致断言飘移） */
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 取相对今天偏移若干天的日期字符串 */
function daysFromToday(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toDateString(date);
}

describe('calculateDaysRemaining（剩余保质期天数计算）', () => {
  it('今天是到期日应返回 0', () => {
    assert.equal(calculateDaysRemaining(daysFromToday(0)), 0);
  });

  it('明天到期应返回 1', () => {
    assert.equal(calculateDaysRemaining(daysFromToday(1)), 1);
  });

  it('7 天后到期应返回 7', () => {
    assert.equal(calculateDaysRemaining(daysFromToday(7)), 7);
  });

  it('昨天已过期应返回 -1', () => {
    assert.equal(calculateDaysRemaining(daysFromToday(-1)), -1);
  });
});

describe('computeUrgency（三级警戒灯判定）', () => {
  it('已过期判为红灯', () => {
    assert.equal(computeUrgency(-3), 'red');
  });

  it('今天到期判为红灯', () => {
    assert.equal(computeUrgency(0), 'red');
  });

  it('剩 1 天判为黄灯', () => {
    assert.equal(computeUrgency(1), 'yellow');
  });

  it('剩 2 天判为黄灯', () => {
    assert.equal(computeUrgency(2), 'yellow');
  });

  it('剩 3 天判为绿灯', () => {
    assert.equal(computeUrgency(3), 'green');
  });

  it('剩 30 天判为绿灯', () => {
    assert.equal(computeUrgency(30), 'green');
  });
});