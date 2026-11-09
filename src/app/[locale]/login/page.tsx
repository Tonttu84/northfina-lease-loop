// Sign in (D93): type the e-mail of an account, get a sign-in link. No password: the link is
// the proof the e-mail is the visitor's, and opening it confirms the e-mail. Someone already
// signed in is pointed at their account page.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Card, LinkButton, Notice, PageHeader } from '@/components/ui';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { ANONYMOUS_ACTOR, readActor } from '@/server/actor';
import { db } from '@/server/db';
import { demoToolsOn } from '@/server/demo-tools';
import { LoginForm } from './login-form';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/login'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('login.title') }) };
}

export default async function LoginPage({ params }: PageProps<'/[locale]/login'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);
  const actor = await readActor(db);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('login.title')} intro={t('login.intro')} />
      {actor !== ANONYMOUS_ACTOR ? (
        <Notice tone="info" className="mb-6">
          <p>{t('login.alreadySignedIn')}</p>
          <LinkButton href={`/${locale}/account`} size="sm" className="mt-3">
            {t('login.toAccount')}
          </LinkButton>
        </Notice>
      ) : null}
      <Card as="section" title={t('login.form.title')} titleId="login-form">
        <LoginForm
          locale={locale}
          demoTools={demoToolsOn()}
          labels={{
            email: t('login.form.email'),
            emailHint: t('login.form.emailHint'),
            emailMissing: t('login.form.emailMissing'),
            submit: t('login.form.submit'),
            pending: t('login.form.pending'),
            sentTitle: t('login.sent.title'),
            sentBody: t('login.sent.body'),
            demoTitle: t('login.demo.title'),
            demoBody: t('login.demo.body'),
            demoOpen: t('login.demo.open'),
            demoOutbox: t('login.demo.outbox'),
            demoNone: t('login.demo.none'),
          }}
          failures={{
            error: t('login.form.error'),
            RATE_LIMITED: t('login.form.rateLimited'),
            VALIDATION_ERROR: t('login.form.invalidEmail'),
          }}
        />
      </Card>
      <p className="mt-6 text-sm text-ink-muted">{t('login.noPassword')}</p>
    </div>
  );
}
