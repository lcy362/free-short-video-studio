// Agnes Chat API 封装（前端直连）
// 用于 LLM 场景拆分，兼容 OpenAI Chat Completions 格式

import { buildSystemPrompt, buildUserPrompt, parseScenesJson } from './prompt-templates';
import type { SceneSplitRequest, SceneSplitItem } from '../types';

const CHAT_API_URL = 'https://apihub.agnes-ai.com/v1/chat/completions';
const CHAT_MODEL = 'agnes-2.0-flash';

/**
 * 调用 Agnes Chat API 拆分场景
 * @returns 场景列表
 */
export async function splitScenes(
  apiKey: string,
  request: SceneSplitRequest,
): Promise<SceneSplitItem[]> {
  const resp = await fetch(CHAT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(request) },
      ],
      temperature: 0.7,
    }),
  });

  if (resp.status === 401) {
    throw new ChatApiError('invalid_api_key', 'Invalid API Key');
  }
  if (resp.status === 429) {
    throw new ChatApiError('rate_limited', 'API rate limited, please retry later');
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new ChatApiError('upstream_error', `Chat API error (${resp.status}): ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';

  if (!content) {
    throw new ChatApiError('empty_response', 'Chat API returned empty content');
  }

  try {
    const parsed = parseScenesJson(content);
    if (parsed.scenes.length === 0) {
      throw new ChatApiError('parse_error', 'Scene split result is empty');
    }
    return parsed.scenes;
  } catch (e) {
    if (e instanceof ChatApiError) throw e;
    throw new ChatApiError('parse_error', `Failed to parse scene JSON: ${(e as Error).message}`);
  }
}

/** Chat API 自定义错误 */
export class ChatApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ChatApiError';
  }
}
