// The account page (D93): who is signed in, their e-mail and whether it is confirmed, a new
// confirmation link, sign out, and the way to their leases. Nobody signed in: a pointer to the
// login page. `read_account` (D73): one's own account, or the back office's for the admin.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Badge, Card, DefinitionList, LinkButton, Notice, PageHeader } from '@/components/ui';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { accountOfActor } from '@/server/accounts';
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { authorize } from '@/server/authorize';
import { getCustomer } from '@/server/customers';
import { db } from '@/server/db';
import { demoToolsOn } from '@/server/demo-tools';
import { AccountActions } from './account-actions';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/account'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: t('meta.pageTitle', { page: t('account.title') }) };
}

export default async function AccountPage({
  params,
  searchParams,
}: PageProps<'/[locale]/account'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);
  const actor = await readActor(db);
  const isAdmin = actor === ADMIN_ACTOR;
  const page = (body: React.ReactNode) => (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title={t('account.title')} intro={t('account.intro')} />
      {body}
    </div>
  );

  const auth = await authorize(
    db,
    actor,
    'read_account',
    isAdmin ? { none: true } : { customer: actor }
  );
  if (!auth.ok) {
    return page(
      <Notice tone="info">
        <p>{t('account.signedOut')}</p>
        <LinkButton href={`/${locale}/login`} size="sm" className="mt-3">
          {t('account.toLogin')}
        </LinkButton>
      </Notice>
    );
  }

  const [account, customer] = await Promise.all([
    accountOfActor(db, actor),
    isAdmin ? null : getCustomer(db, actor),
  ]);
  if (!account) {
    // An actor the picker chose that has no account row (a database seeded before D93).
    return page(<Notice tone="warning">{t('account.noAccount', { actor })}</Notice>);
  }
  const { welcome } = await searchParams;
  const name = isAdmin ? t('account.backOffice') : (customer?.name ?? actor);

  const items = [
    { label: t('account.name'), value: name },
    { label: t('account.email'), value: account.email },
    {
      label: t('account.emailStatus'),
      value: (
        <Badge tone={account.emailConfirmed ? 'success' : 'warning'}>
          {account.emailConfirmed ? t('account.confirmed') : t('account.unconfirmed')}
        </Badge>
      ),
    },
    ...(account.confirmedOn
      ? [{ label: t('account.confirmedOn'), value: formatIsoDate(account.confirmedOn, locale) }]
      : []),
  ];

  return page(
    <>
      {welcome === '1' ? (
        <Notice tone="success" className="mb-6" live>
          {t('account.welcome', { name })}
        </Notice>
      ) : null}
      <Card as="section" title={t('account.card.title')} titleId="account-details">
        <DefinitionList items={items} className="mb-6" />
        {account.emailConfirmed ? null : (
          <Notice tone="warning" className="mb-6">
            {t('account.unconfirmedNote')}
          </Notice>
        )}
        <AccountActions
          locale={locale}
          email={account.email}
          emailConfirmed={account.emailConfirmed}
          demoTools={demoToolsOn()}
          labels={{
            resend: t('account.resend'),
            resendPending: t('account.resendPending'),
            resentTitle: t('login.sent.title'),
            resentBody: t('login.sent.body'),
            demoOpen: t('login.demo.open'),
            demoOutbox: t('login.demo.outbox'),
            signOut: t('account.signOut'),
            signOutPending: t('account.signOutPending'),
          }}
          failures={{ error: t('account.error'), RATE_LIMITED: t('login.form.rateLimited') }}
        />
      </Card>
      <div className="mt-6 flex flex-wrap gap-3">
        <LinkButton href={`/${locale}/leases`} variant="secondary">
          {t(isAdmin ? 'nav.leasesAdmin' : 'nav.leases')}
        </LinkButton>
      </div>
    </>
  );
}
