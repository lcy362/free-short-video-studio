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
 * 依次尝试域名列表（串行）：只有前一个域名**网络失败**才会走到下一个，
 * 顺序是语义的一部分，所以用递归表达（Sonar S9382「循环内 await 可并行」在此不适用）。
 * `firstError` 记录主域名的原始错误，全部失败时抛出它。
 */
async function fetchFirstReachable(
  bases: readonly string[],
  path: string,
  init: RequestInit,
  firstError?: unknown,
): Promise<Response> {
  const [base, ...rest] = bases;
  try {
    return await fetch(`${base}${path}`, init);
  } catch (error) {
    const primaryError = firstError ?? error;
    if (rest.length === 0) throw primaryError;
    return fetchFirstReachable(rest, path, init, primaryError);
  }
}

/**
 * 域名故障转移：主域名出现网络错误（fetch 抛 TypeError）时依次尝试其他域名；
 * HTTP 4xx/5xx 属于有效响应，不做转移（与 demo 的 fetchWithFailback 策略一致）。
 * 全部域名均网络失败时抛出主域名的原始错误。
 */
export function fetchWithDomainFailback(
  path: string,
  init: RequestInit,
  primaryBase: string,
): Promise<Response> {
  const fallbacks = AGNES_DOMAINS.map((d) => d.base).filter((base) => base !== primaryBase);
  return fetchFirstReachable([primaryBase, ...fallbacks], path, init);
}
