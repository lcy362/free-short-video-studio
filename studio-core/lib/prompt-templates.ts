// Studio LLM Prompt 模板
// 用于场景拆分，将用户创意转化为 N 个场景的视觉提示词

import type { SceneSplitRequest } from '../types';

/** 风格描述映射（英文，注入 prompt，避免依赖 i18n 影响 LLM 输出质量） */
const STYLE_DESCRIPTIONS: Record<string, string> = {
  cinematic: 'cinematic style, film grain, dramatic lighting, shallow depth of field, movie-like composition',
  realistic: 'photorealistic, natural lighting, documentary realism, high detail',
  anime: 'anime style, vibrant colors, cel shading, expressive characters',
  documentary: 'documentary footage style, natural lighting, observational camera, authentic atmosphere',
  fantasy: 'fantasy art style, magical atmosphere, ethereal lighting, imaginative surreal elements',
};

/** 语言名称映射（让 LLM 用对应语言写旁白） */
const LOCALE_LANG: Record<string, string> = {
  zh: '简体中文',
  en: 'English',
  ru: 'Русский',
  ja: '日本語',
  ko: '한국어',
  ms: 'Bahasa Melayu',
  id: 'Bahasa Indonesia',
  de: 'Deutsch',
  fr: 'Français',
  nl: 'Nederlands',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
};

/**
 * 构建场景拆分的 system prompt
 */
export function buildSystemPrompt(): string {
  return `You are a professional video director and screenwriter. Your task is to split a creative idea into multiple scenes for AI video generation.

Rules:
1. Each scene must be a self-contained visual segment (3-5 seconds when generated).
2. The visualPrompt must be a detailed English description suitable for an AI video model — include camera movement, lighting, mood, composition, and subject details. Do NOT include any dialogue or text overlay in the visualPrompt.
3. The narration should be a short voiceover line (1-2 sentences) for this scene, written in the specified language.
4. Scenes should flow naturally as a coherent story.
5. Avoid abrupt transitions; ensure visual continuity between consecutive scenes.

You must respond with ONLY valid JSON, no markdown fences, no extra text.`;
}

/**
 * 构建场景拆分的 user prompt
 */
export function buildUserPrompt(req: SceneSplitRequest): string {
  const styleDesc = req.style ? STYLE_DESCRIPTIONS[req.style] : '';
  const lang = LOCALE_LANG[req.locale] || 'English';
  const styleLine = styleDesc ? `\nVisual style for all scenes: ${styleDesc}.` : '';

  return `Creative idea: ${req.idea}
Number of scenes: ${req.sceneCount}
Narration language: ${lang}${styleLine}

Return a JSON object with this exact structure:
{
  "scenes": [
    {
      "title": "short scene title in ${lang}",
      "visualPrompt": "detailed English visual description for AI video generation",
      "narration": "voiceover line in ${lang}"
    }
  ]
}

Generate exactly ${req.sceneCount} scenes. Respond with JSON only.`;
}

/**
 * 解析 LLM 返回的 JSON，容错处理（去 markdown fence、去多余文本）
 */
export function parseScenesJson(raw: string): { scenes: Array<{ title: string; visualPrompt: string; narration: string }> } {
  let text = raw.trim();

  // 去除可能的 markdown code fence
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  }

  // 尝试提取第一个 JSON 对象
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    text = text.slice(jsonStart, jsonEnd + 1);
  }

  const parsed = JSON.parse(text);

  if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
    throw new Error('Invalid response: missing "scenes" array');
  }

  return {
    scenes: parsed.scenes.map((s: any, i: number) => ({
      title: String(s.title || `Scene ${i + 1}`),
      visualPrompt: String(s.visualPrompt || ''),
      narration: String(s.narration || ''),
    })),
  };
}
