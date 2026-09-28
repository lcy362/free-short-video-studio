import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AGNES_DOMAINS,
  DEFAULT_AGNES_DOMAIN,
  loadAgnesDomain,
  saveAgnesDomain,
  getAgnesBase,
  fetchWithDomainFailback,
} from '../studio-core/lib/api-domains';

describe('api-domains', () => {
  it('defines three domains with the expected bases', () => {
    expect(AGNES_DOMAINS.map((d) => d.id)).toEqual(['com', 'cn_bak', 'cn']);
    expect(getAgnesBase('com')).toBe('https://apihub.agnes-ai.com');
    expect(getAgnesBase('cn_bak')).toBe('https://apihub.agnes-ai.cn');
    expect(getAgnesBase('cn')).toBe('https://api.agnes-ai.cn');
  });

  it('getAgnesBase falls back to the first domain on unknown id', () => {
    expect(getAgnesBase('nope' as never)).toBe('https://apihub.agnes-ai.com');
  });

  describe('localStorage persistence', () => {
    beforeEach(() => localStorage.clear());

    it('defaults to com', () => {
      expect(DEFAULT_AGNES_DOMAIN).toBe('com');
      expect(loadAgnesDomain()).toBe('com');
    });

    it('falls back on invalid stored value', () => {
      localStorage.setItem('agnes_api_domain', 'xxx');
      expect(loadAgnesDomain()).toBe('com');
    });

    it('save + load round-trip', () => {
      saveAgnesDomain('cn_bak');
      expect(loadAgnesDomain()).toBe('cn_bak');
    });
  });

  describe('fetchWithDomainFailback', () => {
    afterEach(() => vi.restoreAllMocks());

    it('uses the primary domain when it succeeds', async () => {
      const ok = new Response('{}', { status: 200 });
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok);
      const resp = await fetchWithDomainFailback('/v1/videos', {}, 'https://apihub.agnes-ai.com');
      expect(resp.status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('https://apihub.agnes-ai.com/v1/videos', {});
    });

    it('does NOT fail over on HTTP error responses', async () => {
      const notFound = new Response('{}', { status: 404 });
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(notFound);
      const resp = await fetchWithDomainFailback('/x', {}, 'https://apihub.agnes-ai.com');
      expect(resp.status).toBe(404);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('fails over to other domains on network error', async () => {
      const ok = new Response('{}', { status: 200 });
      const spy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new TypeError('network down'))
        .mockResolvedValueOnce(ok);
      const resp = await fetchWithDomainFailback('/x', {}, 'https://apihub.agnes-ai.com');
      expect(resp.status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenLastCalledWith('https://apihub.agnes-ai.cn/x', {});
    });

    it('throws the primary error when every domain fails', async () => {
      const primaryError = new TypeError('primary down');
      const spy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(primaryError)
        .mockRejectedValue(new TypeError('backup down'));
      await expect(
        fetchWithDomainFailback('/x', {}, 'https://apihub.agnes-ai.com'),
      ).rejects.toBe(primaryError);
      expect(spy).toHaveBeenCalledTimes(3);
    });
  });
});
