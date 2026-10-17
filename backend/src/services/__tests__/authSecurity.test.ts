import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, getClientIp, createCaptcha, verifyAndConsumeCaptcha } from '../authSecurity.js';
import { config } from '../../config.js';
import { app } from '../../app.js';

describe('authSecurity & IP识别加固 (SEC-01, SEC-02, SEC-04)', () => {
  it('isPrivateIp 正确识别各类内网与公网 IP', () => {
    assert.equal(isPrivateIp('127.0.0.1'), true);
    assert.equal(isPrivateIp('10.0.0.1'), true);
    assert.equal(isPrivateIp('172.18.0.3'), true); // docker bridge
    assert.equal(isPrivateIp('172.16.0.1'), true);
    assert.equal(isPrivateIp('172.31.255.255'), true);
    assert.equal(isPrivateIp('172.32.0.1'), false);
    assert.equal(isPrivateIp('192.168.1.1'), true);
    assert.equal(isPrivateIp('::1'), true);
    assert.equal(isPrivateIp('::ffff:172.18.0.3'), true);
    assert.equal(isPrivateIp('::ffff:203.0.113.195'), false);
    assert.equal(isPrivateIp('203.0.113.195'), false);
    assert.equal(isPrivateIp('8.8.8.8'), false);
  });

  it('getClientIp 在 TRUST_PROXY 开启时能优先提取首个非内网客户端 IP，防止代理 IP 误锁 DoS', () => {
    const origTrust = config.TRUST_PROXY;
    config.TRUST_PROXY = true;
    try {
      // 模拟请求带有包含前端容器代理 IP 的 X-Forwarded-For: 203.0.113.5, 172.18.0.3
      const mockContext1 = {
        req: {
          header: (name: string) => {
            if (name.toLowerCase() === 'x-forwarded-for') return '203.0.113.5, 172.18.0.3';
            return undefined;
          },
        },
        env: {},
      } as any;
      assert.equal(getClientIp(mockContext1), '203.0.113.5');

      // 前端内网代理位于最左侧时，仍能提取首个非内网客户端真实 IP
      const mockContext2 = {
        req: {
          header: (name: string) => {
            if (name.toLowerCase() === 'x-forwarded-for') return '172.18.0.2, 198.51.100.7';
            return undefined;
          },
        },
        env: {},
      } as any;
      assert.equal(getClientIp(mockContext2), '198.51.100.7');

      // 全为内网 IP（本地开发/内网测试）时退避使用首个 IP
      const mockContext3 = {
        req: {
          header: (name: string) => {
            if (name.toLowerCase() === 'x-forwarded-for') return '192.168.1.50, 172.18.0.3';
            return undefined;
          },
        },
        env: {},
      } as any;
      assert.equal(getClientIp(mockContext3), '192.168.1.50');
    } finally {
      config.TRUST_PROXY = origTrust;
    }
  });

  it('CORS 中间件严禁对未授权域名返回白名单，必须拒绝 (SEC-04)', async () => {
    // 未授权域名
    const resForbidden = await app.request('/health', {
      method: 'GET',
      headers: {
        Origin: 'https://evil-attacker.com',
      },
    });
    assert.equal(resForbidden.headers.get('access-control-allow-origin'), null);

    // 授权白名单域名
    const allowedOrigin = config.CORS_ORIGINS[0];
    const resAllowed = await app.request('/health', {
      method: 'GET',
      headers: {
        Origin: allowedOrigin,
      },
    });
    assert.equal(resAllowed.headers.get('access-control-allow-origin'), allowedOrigin);
  });

  it('createCaptcha 采用纯矢量路径渲染，彻底杜绝纯文本 <text> 正则提取 (SEC-01)', () => {
    const { captcha_key, svg } = createCaptcha();
    assert.ok(captcha_key.startsWith('cap_'));
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('<path'));

    // 核心安全断言：严禁包含任何 <text> 标签
    const textMatches = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)];
    assert.equal(textMatches.length, 0, 'SVG 验证码中绝不能包含明文 <text> 标签');
  });

  it('verifyAndConsumeCaptcha 正确校验且一次性作废 (SEC-03)', () => {
    const { captcha_key } = createCaptcha();
    // 错误输入
    assert.equal(verifyAndConsumeCaptcha(captcha_key, 'wrong_code'), false);
    // 已被消费，再次用任何码都应返回 false
    assert.equal(verifyAndConsumeCaptcha(captcha_key, 'wrong_code'), false);
  });
});
