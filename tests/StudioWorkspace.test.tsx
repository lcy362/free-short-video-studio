import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useMessages: () => ({
    demo: { image: { samplePrompts: ['i1'] }, video: { samplePrompts: ['v1'] } },
  }),
  useLocale: () => 'zh',
}));

const studioClientSpy = vi.hoisted(() => vi.fn());
vi.mock('@/studio-core/StudioClient', () => ({
  default: (props: unknown) => {
    studioClientSpy(props);
    return null;
  },
}));

import StudioWorkspace from '@/studio-core/StudioWorkspace';

type ClientProps = {
  embedded: boolean;
  apiKey: string;
  hasKey: boolean;
  domain: string;
  onDomainChange: (id: string) => void;
};

function lastClientProps(): ClientProps {
  const calls = studioClientSpy.mock.calls;
  return calls[calls.length - 1][0] as ClientProps;
}

function panel(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  studioClientSpy.mockClear();
});

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('StudioWorkspace · 面板与 Key 门禁', () => {
  it('默认 simple：三个面板常驻挂载，仅当前面板可见', () => {
    render(<StudioWorkspace />);
    expect(screen.getByRole('tab', { name: 'tabs.simple' })).toHaveAttribute('aria-selected', 'true');
    expect(panel('studio-panel-simple')).not.toHaveAttribute('hidden');
    expect(panel('studio-panel-image')).toHaveAttribute('hidden');
    expect(panel('studio-panel-creative')).toHaveAttribute('hidden');

    // 三个面板都挂载（切 tab 不卸载），且 image/simple 共用同一份 Key 提示
    expect(screen.getAllByText('tabs.simpleHint')).toHaveLength(1);
    expect(screen.getAllByText('apiKeyRequired')).toHaveLength(2);
    expect(screen.getAllByText('apiKey.hint')).toHaveLength(3);
  });

  it('未填 Key 时创意视频仍以 embedded 模式挂载', () => {
    render(<StudioWorkspace />);
    const props = lastClientProps();
    expect(props.embedded).toBe(true);
    expect(props.apiKey).toBe('');
    expect(props.hasKey).toBe(false);
    expect(props.domain).toBe('com');
    expect(typeof props.onDomainChange).toBe('function');
  });

  it('localStorage 里已有 Key 时三个面板都进入可生成状态', () => {
    localStorage.setItem('agnes_api_key', 'sk-local');
    render(<StudioWorkspace />);

    expect(screen.queryByText('apiKeyRequired')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'image.generate', hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'video.generate', hidden: true }),
    ).toBeInTheDocument();
    expect(lastClientProps().apiKey).toBe('sk-local');
    expect(lastClientProps().hasKey).toBe(true);
  });
});

describe('StudioWorkspace · tab 与 URL 同步', () => {
  it('合法 ?tab= 覆盖 defaultTab', async () => {
    window.history.replaceState(null, '', '/?tab=creative');
    render(<StudioWorkspace defaultTab="simple" />);
    await waitFor(() => expect(panel('studio-panel-creative')).not.toHaveAttribute('hidden'));
    expect(panel('studio-panel-simple')).toHaveAttribute('hidden');
    expect(screen.getByRole('tab', { name: 'tabs.creative' })).toHaveAttribute('aria-selected', 'true');
  });

  it('非法 ?tab= 保持默认模式', () => {
    window.history.replaceState(null, '', '/?tab=unknown');
    render(<StudioWorkspace />);
    expect(panel('studio-panel-simple')).not.toHaveAttribute('hidden');
    expect(window.location.search).toBe('?tab=unknown');
  });

  it('点击 tab 切换面板并把 ?tab= 写进地址栏', async () => {
    render(<StudioWorkspace />);
    await userEvent.click(screen.getByRole('tab', { name: 'tabs.image' }));

    expect(window.location.search).toBe('?tab=image');
    expect(panel('studio-panel-image')).not.toHaveAttribute('hidden');
    expect(panel('studio-panel-simple')).toHaveAttribute('hidden');
    expect(screen.getByText('tabs.imageHint')).toBeInTheDocument();
  });

  it('syncUrl=false 时切换 tab 不改动地址栏', async () => {
    render(<StudioWorkspace syncUrl={false} />);
    await userEvent.click(screen.getByRole('tab', { name: 'tabs.creative' }));
    expect(window.location.search).toBe('');
    expect(panel('studio-panel-creative')).not.toHaveAttribute('hidden');
  });

  it('defaultTab=creative 时直接落在创意视频', () => {
    render(<StudioWorkspace defaultTab="creative" />);
    expect(panel('studio-panel-creative')).not.toHaveAttribute('hidden');
    expect(panel('studio-panel-simple')).toHaveAttribute('hidden');
  });
});

describe('StudioWorkspace · API 域名托管', () => {
  it('切换域名写入 localStorage 并同步给 StudioClient', async () => {
    render(<StudioWorkspace />);
    await userEvent.click(screen.getByRole('button', { name: 'domainCn' }));

    expect(localStorage.getItem('agnes_api_domain')).toBe('cn');
    expect(lastClientProps().domain).toBe('cn');
  });

  it('水合时从 localStorage 恢复域名偏好', async () => {
    localStorage.setItem('agnes_api_domain', 'cn_bak');
    render(<StudioWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'domainCnBak' })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(lastClientProps().domain).toBe('cn_bak');
  });
});
