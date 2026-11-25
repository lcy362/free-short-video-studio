'use client';

import { useLocale, useTranslations } from 'next-intl';
import { trackGetKeyClick } from '../lib/analytics';

/** 失败态上的站内下一步。文案在 demo.helpLinks，路径相对当前语言。 */
export default function DemoErrorLinks({ code }: Readonly<{ code: string }>) {
  const t = useTranslations('demo');
  const locale = useLocale();
  const queue = /queue|polltimeout/i.test(code);
  // 单镜/图像产出 invalid_api_key，多镜编排产出 invalidApiKey，两种都要给领 Key 入口
  const key = /^invalid_?api_?key$/i.test(code);

  return (
    <p className="text-xs pt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      {queue && (
        <a className="text-accent hover:text-ink underline underline-offset-2" href={`/${locale}/faq/jimeng`}>
          {t('helpLinks.queue')}
        </a>
      )}
      {key && (
        <a
          className="text-accent hover:text-ink underline underline-offset-2"
          href={`/${locale}/guides/api-key`}
          onClick={() => trackGetKeyClick({ from: 'error' })}
        >
          {t('helpLinks.key')}
        </a>
      )}
      <a className="text-accent hover:text-ink underline underline-offset-2" href={`/${locale}/faq/troubleshooting`}>
        {t('helpLinks.trouble')}
      </a>
    </p>
  );
}
