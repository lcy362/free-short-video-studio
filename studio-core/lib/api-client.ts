/**
 * API client with locale-aware domain selection and failback.
 *
 * - zh locale  → primary: apihub.agnes-ai.cn,  fallback: apihub.agnes-ai.com
 * - non-zh     → primary: apihub.agnes-ai.com, fallback: apihub.agnes-ai.cn
 *
 * Rules:
 * - Only retry on **network errors** (fetch throws TypeError).
 * - NOT on HTTP error responses (4xx, 5xx) — those are valid server responses.
 * - Only retry **once** with the alternate domain.
 * - If both domains fail, the error from the primary attempt is thrown.
 */

const DOMAIN_CN = 'apihub.agnes-ai.cn';
const DOMAIN_COM = 'apihub.agnes-ai.com';

function getPrimaryDomain(locale: string): string {
  return locale === 'zh' ? DOMAIN_CN : DOMAIN_COM;
}

function getFallbackDomain(locale: string): string {
  return locale === 'zh' ? DOMAIN_COM : DOMAIN_CN;
}

function buildUrl(domain: string, path: string): string {
  return `https://${domain}${path}`;
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
  const primary = getPrimaryDomain(locale);
  const fallback = getFallbackDomain(locale);

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
