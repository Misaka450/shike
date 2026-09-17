/** @type {import('next').NextConfig} */
const nextConfig = {
  // 产出 standalone 版本：Docker 镜像只需拷贝最小依赖集，体积大幅减小
  output: 'standalone',
  // 构建阶段不再跳过 ESLint 检查：让代码问题尽早暴露，而不是被静默吞掉
  eslint: {
    ignoreDuringBuilds: false,
  },
  // 类型错误继续阻断构建
  typescript: {
    ignoreBuildErrors: false,
  },
  // 关闭 X-Powered-By 响应头，减少框架指纹信息暴露
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // 全局安全响应头（详见审计报告 SEC-11）
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // 禁止浏览器猜测文件类型，防止把上传内容当脚本执行
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // 禁止本站被其他网站用 iframe 嵌套，防点击劫持
          { key: 'X-Frame-Options', value: 'DENY' },
          // 跨站跳转时不泄露完整来源地址
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // 只允许本站使用摄像头（拍冰箱照片需要），其余敏感能力一律关闭
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
  async rewrites() {
    // 【关键修复 SEC-03】
    // rewrites 是由 Next 服务器进程「在容器内部」执行的，
    // 因此目标必须是 Docker 服务名（shike-api），写成 127.0.0.1 会指向 Next 容器自己，导致所有 API 请求失败。
    const apiInternal = process.env.API_INTERNAL_URL || 'http://127.0.0.1:8081';
    return [
      {
        source: '/api/:path*',
        destination: `${apiInternal}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;