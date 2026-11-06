'use client';

import { useState } from 'react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import StudioLanding from '@/components/StudioLanding';
import zhMessages from '@/studio-core/messages/zh.json';
import enMessages from '@/studio-core/messages/en.json';

/**
 * studio-core 的文案包含 `studio` + `demo` 两个命名空间（图像 / 简单视频面板用 demo），
 * 其中 `demo.image.samplePrompts` 是字符串数组，不符合 next-intl 的
 * AbstractIntlMessages 类型签名（运行期完全合法，组件通过 useMessages 读取）。
 * 因此在 Provider 边界做一次类型断言。
 */
const MESSAGES = { zh: zhMessages, en: enMessages } as const;

export default function Home() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  const messages = MESSAGES[locale] as unknown as AbstractIntlMessages;

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Shanghai" now={new Date()}>
      <StudioLanding locale={locale} onLocaleChange={setLocale} />
    </NextIntlClientProvider>
  );
}
