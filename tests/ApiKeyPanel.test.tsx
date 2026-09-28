import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import ApiKeyPanel, { useApiKey } from '@/studio-core/ApiKeyPanel';

describe('useApiKey', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('初始从 localStorage 读入；无 key 时 hasKey=false', () => {
    const { result } = renderHook(() => useApiKey());
    expect(result.current.apiKey).toBe('');
    expect(result.current.hasKey).toBe(false);
  });

  it('saveKey 写 localStorage 并更新状态', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => result.current.saveKey('sk-test'));
    expect(localStorage.getItem('agnes_api_key')).toBe('sk-test');
    expect(result.current.hasKey).toBe(true);
    expect(result.current.apiKey).toBe('sk-test');
  });

  it('clearKey 移除 localStorage 并清空状态', () => {
    localStorage.setItem('agnes_api_key', 'sk-old');
    const { result } = renderHook(() => useApiKey());
    act(() => result.current.clearKey());
    expect(localStorage.getItem('agnes_api_key')).toBeNull();
    expect(result.current.hasKey).toBe(false);
    expect(result.current.apiKey).toBe('');
  });
});

describe('ApiKeyPanel', () => {
  const baseProps = {
    apiKey: '',
    hasKey: false,
    saveKey: vi.fn(),
    clearKey: vi.fn(),
    domain: 'com' as const,
    onDomainChange: vi.fn(),
  };

  it('无 key 时默认展开，含输入框与域名选择', () => {
    render(<ApiKeyPanel {...baseProps} />);
    expect(screen.getByLabelText('apiKey.label')).toBeInTheDocument();
    expect(screen.getByText('domainLabel')).toBeInTheDocument();
    expect(screen.getByText('apiKey.localOnly')).toBeInTheDocument();
  });

  it('保存按钮：空输入禁用，非空点击触发 saveKey（trim 后）', async () => {
    const user = userEvent.setup();
    const saveKey = vi.fn();
    render(<ApiKeyPanel {...baseProps} saveKey={saveKey} />);

    const saveBtn = screen.getByText('apiKey.save');
    expect(saveBtn).toBeDisabled();

    const input = screen.getByLabelText('apiKey.label');
    await user.type(input, '  sk-abc  ');
    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);
    expect(saveKey).toHaveBeenCalledWith('sk-abc');
  });

  it('showKey 切换明文/密文', async () => {
    const user = userEvent.setup();
    render(<ApiKeyPanel {...baseProps} />);

    const input = screen.getByLabelText('apiKey.label');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByLabelText('apiKey.show'));
    expect(input).toHaveAttribute('type', 'text');
    // 切换后 aria-label 变为 hide
    expect(screen.getByLabelText('apiKey.hide')).toBeInTheDocument();
  });

  it('hasKey=true 时默认折叠（CSS 收起），点头部展开；显示清空按钮', async () => {
    const user = userEvent.setup();
    const { container } = render(<ApiKeyPanel {...baseProps} apiKey="sk-saved" hasKey={true} />);

    // 折叠是 CSS 收起（max-h-0），内容仍挂在 DOM 里
    const body = container.querySelector('#apikey-panel-body') as HTMLElement;
    expect(body.className).toContain('max-h-0');
    expect(screen.getByLabelText('apiKey.saved')).toBeInTheDocument();

    // 头部按钮的可访问名称含「apiKey.title apiKey.saved」（内含带 aria-label 的状态点），用正则匹配
    await user.click(screen.getByRole('button', { name: /apiKey.title/ }));
    expect(body.className).toContain('max-h-[36rem]');
    expect(screen.getByText('apiKey.clear')).toBeInTheDocument();
  });

  it('clearKey 点击触发回调', async () => {
    const user = userEvent.setup();
    const clearKey = vi.fn();
    render(<ApiKeyPanel {...baseProps} apiKey="sk-saved" hasKey={true} clearKey={clearKey} />);
    await user.click(screen.getByRole('button', { name: /apiKey.title/ }));
    await user.click(screen.getByText('apiKey.clear'));
    expect(clearKey).toHaveBeenCalledTimes(1);
  });

  it('域名三选一：aria-pressed 高亮当前，点击切换回调', async () => {
    const user = userEvent.setup();
    const onDomainChange = vi.fn();
    render(<ApiKeyPanel {...baseProps} domain="com" onDomainChange={onDomainChange} />);

    const comBtn = screen.getByRole('button', { name: 'domainCom' });
    const cnBtn = screen.getByRole('button', { name: 'domainCn' });
    expect(comBtn).toHaveAttribute('aria-pressed', 'true');
    expect(cnBtn).toHaveAttribute('aria-pressed', 'false');

    await user.click(cnBtn);
    expect(onDomainChange).toHaveBeenCalledWith('cn');
  });
});
