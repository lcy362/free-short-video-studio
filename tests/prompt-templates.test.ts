import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseScenesJson,
} from '../studio-core/lib/prompt-templates';

describe('prompt-templates', () => {
  it('system prompt requires JSON-only output', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('valid JSON');
    expect(p).toContain('visualPrompt');
  });

  it('user prompt includes idea, scene count and default language fallback', () => {
    const p = buildUserPrompt({ idea: 'a cat story', sceneCount: 3, locale: 'xx' });
    expect(p).toContain('Creative idea: a cat story');
    expect(p).toContain('Number of scenes: 3');
    expect(p).toContain('Narration language: English');
    expect(p).not.toContain('Visual style');
  });

  it('user prompt includes style description for known styles', () => {
    const p = buildUserPrompt({ idea: 'x', sceneCount: 2, style: 'cinematic', locale: 'en' });
    expect(p).toContain('cinematic style, film grain');
  });

  describe('parseScenesJson', () => {
    it('parses a plain JSON object', () => {
      const raw = JSON.stringify({
        scenes: [{ title: 'T', visualPrompt: 'V', narration: 'N' }],
      });
      const { scenes } = parseScenesJson(raw);
      expect(scenes).toEqual([{ title: 'T', visualPrompt: 'V', narration: 'N' }]);
    });

    it('strips markdown code fences', () => {
      const raw = '```json\n{"scenes":[{"title":"A"}]}\n```';
      const { scenes } = parseScenesJson(raw);
      expect(scenes[0].title).toBe('A');
    });

    it('extracts the JSON object from surrounding text', () => {
      const raw = 'Here you go: {"scenes":[{"title":"B"}]} hope it helps';
      const { scenes } = parseScenesJson(raw);
      expect(scenes[0].title).toBe('B');
    });

    it('fills defaults for missing fields', () => {
      const raw = '{"scenes":[{},{"title":42}]}';
      const { scenes } = parseScenesJson(raw);
      expect(scenes[0]).toEqual({ title: 'Scene 1', visualPrompt: '', narration: '' });
      expect(scenes[1].title).toBe('42');
    });

    it('throws when scenes array is missing', () => {
      expect(() => parseScenesJson('{"foo":1}')).toThrow(/missing "scenes"/);
    });

    it('throws on unparseable input', () => {
      expect(() => parseScenesJson('not json at all')).toThrow();
    });
  });
});
