import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock('@/studio-core/lib/analytics', () => ({
  trackApiKeySaved: vi.fn(),
  trackGetKeyClick: vi.fn(),
}));

import { trackApiKeySaved } from '@/studio-core/lib/analytics';
import { DEFAULT_AGNES_DOMAIN } from '@/studio-core/lib/api-domains';
import ApiKeyPanel from '@/studio-core/ApiKeyPanel';

const mocked = vi.mocked(trackApiKeySaved);

/** 模拟真实父组件：保存后 apiKey 会回传到 props */
function Harness() {
  const [key, setKey] = useState('');
  return (
    <ApiKeyPanel
      apiKey={key}
      hasKey={!!key}
      saveKey={setKey}
      clearKey={() => setKey('')}
      domain={DEFAULT_AGNES_DOMAIN}
      onDomainChange={() => {}}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('ApiKeyPanel（保存 Key 转化埋点去重）', () => {
  it('重复保存同一个 Key 只算一次转化，换成新 Key 再算一次', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('apiKey.label');
    const save = screen.getByText('apiKey.save');

    await user.type(input, 'sk-first');
    await user.click(save);
    await user.click(save);
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked).toHaveBeenCalledWith({ source: 'manual' });

    await user.clear(input);
    await user.type(input, 'sk-second');
    await user.click(save);
    expect(mocked).toHaveBeenCalledTimes(2);
  });
});
