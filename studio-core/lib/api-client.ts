/**
 * API client with locale-aware domain selection and failback.
 *
 * - 用户在本站 Key 面板显式选过域名（`agnes_api_domain`）→ 以该域名为准，
 *   其余 Agnes 域名做网络故障转移（对齐源项目 AGNES_DOMAIN_MAP）；
 * - 未选择过 → 沿用 locale 默认（zh → apihub.agnes-ai.cn，其他 → apihub.agnes-ai.com）。
 *
 * Rules:
 * - Only retry on **network errors** (fetch throws TypeError).
 * - NOT on HTTP error responses (4xx, 5xx) — those are valid server responses.
 * - Only retry **once** with the alternate domain.
 * - If both domains fail, the error from the primary attempt is thrown.
 */

import { AGNES_DOMAINS, loadAgnesDomain } from './api-domains';

const DOMAIN_CN = 'apihub.agnes-ai.cn';
const DOMAIN_COM = 'apihub.agnes-ai.com';

const DOMAIN_STORAGE_KEY = 'agnes_api_domain';

function getPrimaryDomain(locale: string): string {
  return locale === 'zh' ? DOMAIN_CN : DOMAIN_COM;
}

function getFallbackDomain(locale: string): string {
  return locale === 'zh' ? DOMAIN_COM : DOMAIN_CN;
}

function buildUrl(domain: string, path: string): string {
  return `https://${domain}${path}`;
}

/** 用户是否在本地显式选择过域名（未选择时不该覆盖 locale 默认行为） */
function hasStoredDomain(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = window.localStorage.getItem(DOMAIN_STORAGE_KEY);
    return saved === 'com' || saved === 'cn_bak' || saved === 'cn';
  } catch {
    return false;
  }
}

/** 主域名 + 备用域名（显式选择优先，其余域名顺序兜底） */
export function resolveApiDomains(locale: string): { primary: string; fallback: string } {
  if (hasStoredDomain()) {
    const selected = AGNES_DOMAINS.find((d) => d.id === loadAgnesDomain()) ?? AGNES_DOMAINS[0];
    const primary = selected.base.replace('https://', '');
    const fallback = AGNES_DOMAINS.map((d) => d.base.replace('https://', ''))
      .find((base) => base !== primary) ?? getFallbackDomain(locale);
    return { primary, fallback };
  }
  return { primary: getPrimaryDomain(locale), fallback: getFallbackDomain(locale) };
}

/**
 * Fetch the given API path with automatic domain failback on network errors.
 *
 * @param path  - API path (e.g. '/v1/videos', '/agnesapi?video_id=xxx')
 * @param init  - Standard fetch RequestInit
 * @param locale - Current locale string (e.g. 'zh', 'en')
 * @returns Response from the successful fetch
 * @throws Only if BOTH primary and fallback domains fail with network errors
 */
export async function fetchWithFailback(
  path: string,
  init: RequestInit,
  locale: string,
): Promise<Response> {
  const { primary, fallback } = resolveApiDomains(locale);

  try {
    return await fetch(buildUrl(primary, path), init);
  } catch (primaryError) {
    // Network error (fetch TypeError) — retry once with fallback domain
    try {
      return await fetch(buildUrl(fallback, path), init);
    } catch {
      // Both failed — throw the primary error for upstream handling
      throw primaryError;
    }
  }
}
