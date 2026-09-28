// Agnes API 域名选择与故障转移（2026-09 迁移）
// 对齐源项目 agnes-video-generator/core/config.py 的 AGNES_DOMAIN_MAP：
//   - com    → https://apihub.agnes-ai.com    国际站（官方文档域名）
//   - cn_bak → https://apihub.agnes-ai.cn     备用线路（国际/国内 Key 均可用）
//   - cn     → https://api.agnes-ai.cn        国内站（需国内站专属 Key）
// 两个域名共享任务库（video_id 跨域可查），切换域名不影响断点续传。

export type AgnesDomainId = 'com' | 'cn_bak' | 'cn';

export interface AgnesDomain {
  id: AgnesDomainId;
  base: string;
  /** i18n key（studio 命名空间） */
  labelKey: string;
}

export const AGNES_DOMAINS: AgnesDomain[] = [
  { id: 'com', base: 'https://apihub.agnes-ai.com', labelKey: 'domainCom' },
  { id: 'cn_bak', base: 'https://apihub.agnes-ai.cn', labelKey: 'domainCnBak' },
  { id: 'cn', base: 'https://api.agnes-ai.cn', labelKey: 'domainCn' },
];

export const DEFAULT_AGNES_DOMAIN: AgnesDomainId = 'com';

const DOMAIN_STORAGE_KEY = 'agnes_api_domain';

export function loadAgnesDomain(): AgnesDomainId {
  if (typeof window === 'undefined') return DEFAULT_AGNES_DOMAIN;
  const saved = localStorage.getItem(DOMAIN_STORAGE_KEY);
  return saved === 'com' || saved === 'cn_bak' || saved === 'cn'
    ? saved
    : DEFAULT_AGNES_DOMAIN;
}

export function saveAgnesDomain(id: AgnesDomainId): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DOMAIN_STORAGE_KEY, id);
}

export function getAgnesBase(id: AgnesDomainId): string {
  return AGNES_DOMAINS.find((d) => d.id === id)?.base || AGNES_DOMAINS[0].base;
}

/**
 * 域名故障转移：主域名出现网络错误（fetch 抛 TypeError）时依次尝试其他域名；
 * HTTP 4xx/5xx 属于有效响应，不做转移（与 demo 的 fetchWithFailback 策略一致）。
 * 全部域名均网络失败时抛出主域名的原始错误。
 */
export async function fetchWithDomainFailback(
  path: string,
  init: RequestInit,
  primaryBase: string,
): Promise<Response> {
  try {
    return await fetch(`${primaryBase}${path}`, init);
  } catch (primaryError) {
    for (const d of AGNES_DOMAINS) {
      if (d.base === primaryBase) continue;
      try {
        return await fetch(`${d.base}${path}`, init);
      } catch {
        // 该域名也网络失败，继续尝试下一个
      }
    }
    throw primaryError;
  }
}
