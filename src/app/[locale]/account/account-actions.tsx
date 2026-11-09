'use client';

// The account page's two actions (D93): a new confirmation link (POST /api/login with the
// account's own e-mail; the answer carries the link while the demo tools are on, D94) and
// signing out (DELETE /api/actor, then the home page).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { responseFailureText, type FailureLabels } from '@/components/api-failure';
import { Button, LinkButton, Notice } from '@/components/ui';
import { useHydrated } from '@/components/use-hydrated';

export type AccountActionLabels = {
  resend: string;
  resendPending: string;
  resentTitle: string;
  resentBody: string;
  demoOpen: string;
  demoOutbox: string;
  signOut: string;
  signOutPending: string;
};

type Sent = { demoLink: { token: string; expiresOn: string } | null };

export function AccountActions({
  locale,
  email,
  emailConfirmed,
  demoTools,
  labels,
  failures,
}: {
  locale: string;
  email: string;
  emailConfirmed: boolean;
  demoTools: boolean;
  labels: AccountActionLabels;
  failures: FailureLabels;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<'resend' | 'signOut' | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const hydrated = useHydrated();

  async function resend() {
    setPending('resend');
    setFailed(null);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) setFailed(await responseFailureText(response, failures));
      else setSent(((await response.json()) as { data: Sent }).data);
    } catch {
      setFailed(failures.error);
    } finally {
      setPending(null);
    }
  }

  async function signOut() {
    setPending('signOut');
    setFailed(null);
    try {
      const response = await fetch('/api/actor', { method: 'DELETE' });
      if (!response.ok) {
        setFailed(await responseFailureText(response, failures));
        setPending(null);
        return;
      }
      router.push(`/${locale}`);
      router.refresh();
    } catch {
      setFailed(failures.error);
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {failed ? (
        <Notice tone="error" live>
          {failed}
        </Notice>
      ) : null}
      {sent ? (
        <Notice tone="success" live title={labels.resentTitle}>
          <p>{labels.resentBody}</p>
          {demoTools ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {sent.demoLink ? (
                <LinkButton href={`/${locale}/login/${sent.demoLink.token}`} size="sm">
                  {labels.demoOpen}
                </LinkButton>
              ) : null}
              <Link
                href={`/${locale}/demo#demo-outbox`}
                className="font-semibold underline decoration-2 underline-offset-4"
              >
                {labels.demoOutbox}
              </Link>
            </div>
          ) : null}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {emailConfirmed ? null : (
          <Button
            variant="secondary"
            onClick={resend}
            pending={pending === 'resend'}
            pendingLabel={labels.resendPending}
            disabled={!hydrated || pending !== null}
          >
            {labels.resend}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={signOut}
          pending={pending === 'signOut'}
          pendingLabel={labels.signOutPending}
          disabled={!hydrated || pending !== null}
        >
          {labels.signOut}
        </Button>
      </div>
    </div>
  );
}
