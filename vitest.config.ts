import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// 测试范围与 sonar-project.properties 的 sources/coverage.exclusions 对齐：
// - 只统计业务源码：app/、components/、studio-core/（不含 messages 生成物与类型壳）
// - 排除（如实说明，见 sonar.coverage.exclusions）：
//   * app/layout.tsx / app/page.tsx —— Next.js 路由壳（generateStaticParams / metadata），无逻辑可测
//   * studio-core/StudioClient.tsx —— 顶层装配器：把 lib/*（已 100% 覆盖）与各面板组件接线，
//     单测只能 mock 全部依赖，无真实逻辑可验证
//   * components/StudioLanding.tsx —— 营销落地壳：静态文案 + 组合 StudioClient/ThemeToggle
//   * studio-core/lib/ffmpeg-service.ts —— ffmpeg.wasm 深度绑定浏览器运行时，mock 无意义
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'studio-core/**/*.{ts,tsx}'],
      exclude: [
        'app/layout.tsx',
        'app/page.tsx',
        'components/StudioLanding.tsx',
        'studio-core/StudioClient.tsx',
        'studio-core/lib/ffmpeg-service.ts',
        'studio-core/messages/**',
        '**/*.d.ts',
        '**/node_modules/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
