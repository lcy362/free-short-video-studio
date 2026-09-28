import { describe, it, expect, afterEach, vi } from 'vitest';
import { splitScenes, ChatApiError } from '../studio-core/lib/chat-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const REQ = { idea: 'a cat story', sceneCount: 2, style: 'anime' as const, locale: 'en' };

describe('chat-api splitScenes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts the chat model with system+user messages and returns scenes', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                scenes: [
                  { title: 'T1', visualPrompt: 'V1', narration: 'N1' },
                  { title: 'T2', visualPrompt: 'V2', narration: 'N2' },
                ],
              }),
            },
          },
        ],
      }),
    );
    const scenes = await splitScenes('key', REQ);
    expect(scenes).toHaveLength(2);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('agnes-2.5-flash');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toContain('a cat story');
  });

  it('maps 401 to invalid_api_key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 401));
    await expect(splitScenes('key', REQ)).rejects.toMatchObject({ code: 'invalid_api_key' });
  });

  it('maps 429 to rate_limited', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 429));
    await expect(splitScenes('key', REQ)).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('wraps other HTTP errors as upstream_error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('server exploded', { status: 500 }),
    );
    await expect(splitScenes('key', REQ)).rejects.toMatchObject({
      code: 'upstream_error',
      message: expect.stringContaining('server exploded'),
    });
  });

  it('throws empty_response on empty content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '' } }] }),
    );
    await expect(splitScenes('key', REQ)).rejects.toMatchObject({ code: 'empty_response' });
  });

  it('wraps JSON parse failures as parse_error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'garbage' } }] }),
    );
    await expect(splitScenes('key', REQ)).rejects.toMatchObject({ code: 'parse_error' });
  });

  it('throws parse_error when the scenes array is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: JSON.stringify({ scenes: [] }) } }],
      }),
    );
    await expect(splitScenes('key', REQ)).rejects.toBeInstanceOf(ChatApiError);
  });

  it('tolerates fenced JSON from the LLM', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: '```json\n{"scenes":[{"title":"A","visualPrompt":"V","narration":"N"}]}\n```',
            },
          },
        ],
      }),
    );
    const scenes = await splitScenes('key', REQ);
    expect(scenes[0].title).toBe('A');
  });
});
