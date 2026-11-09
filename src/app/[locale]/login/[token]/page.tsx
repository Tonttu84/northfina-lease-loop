// The sign-in link's page (D93): whose link it is (the e-mail masked), whether it still works
// today, and the button that opens it. Whoever holds the link signs in: in production the link
// arrives by e-mail, here it comes from the login page's answer or the demo page's outbox (D94).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Card, DefinitionList, LinkButton, Notice, PageHeader } from '@/components/ui';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { loginLinkState } from '@/server/accounts';
import { loginTokenValueSchema } from '@/domain/rows/account';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { LoginLinkForm } from './login-link-form';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/login/[token]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('login.link.title') }) };
}

export default async function LoginLinkPage({ params }: PageProps<'/[locale]/login/[token]'>) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);
  const today = await todayForRequest();
  const page = (body: React.ReactNode) => (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('login.link.title')} intro={t('login.link.intro')} />
      {body}
    </div>
  );

  const state = loginTokenValueSchema.safeParse(token).success
    ? await loginLinkState(db, token, today)
    : null;
  if (!state) {
    return page(
      <Notice tone="warning">
        <p>{t('login.link.notFound')}</p>
        <LinkButton href={`/${locale}/login`} size="sm" className="mt-3">
          {t('login.link.again')}
        </LinkButton>
      </Notice>
    );
  }

  const items = [
    { label: t('login.link.for'), value: state.emailMasked },
    { label: t('login.link.sentOn'), value: formatIsoDate(state.sentOn, locale) },
    { label: t('login.link.worksUntil'), value: formatIsoDate(state.expiresOn, locale) },
  ];

  return page(
    <Card as="section" title={t('login.link.cardTitle')} titleId="login-link">
      <DefinitionList items={items} className="mb-6" />
      {state.outcome === 'valid' ? (
        <>
          <p className="mb-4 text-ink-muted">{t('login.link.confirms')}</p>
          <LoginLinkForm
            token={token}
            locale={locale}
            labels={{ submit: t('login.link.submit'), pending: t('login.link.pending') }}
            failures={{
              error: t('login.link.error'),
              LOGIN_LINK_NOT_FOUND: t('login.link.notFound'),
              LOGIN_LINK_USED: t('login.link.used'),
              LOGIN_LINK_EXPIRED: t('login.link.expired'),
            }}
          />
        </>
      ) : (
        <Notice tone="warning">
          <p>{t(state.outcome === 'used' ? 'login.link.used' : 'login.link.expired')}</p>
          <LinkButton href={`/${locale}/login`} size="sm" className="mt-3">
            {t('login.link.again')}
          </LinkButton>
        </Notice>
      )}
    </Card>
  );
}
