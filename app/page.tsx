'use client';

import { useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import StudioClient from '@/studio-core/StudioClient';
import zhMessages from '@/studio-core/messages/zh.json';
import enMessages from '@/studio-core/messages/en.json';
import StudioLanding from '@/components/StudioLanding';

export default function Home() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  const messages = locale === 'zh' ? zhMessages : enMessages;

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Shanghai" now={new Date()}>
      <StudioLanding locale={locale} onLocaleChange={setLocale} />
    </NextIntlClientProvider>
  );
}
