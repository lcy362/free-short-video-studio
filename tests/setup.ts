import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom 缺失的浏览器 API（ffmpeg/录制/对象 URL 等按需补齐）
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
}
