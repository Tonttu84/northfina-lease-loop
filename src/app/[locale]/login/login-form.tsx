'use client';

// Asking for the sign-in link (D93): the e-mail, POST /api/login, then the "sent" notice. The
// answer never says whether an account has that e-mail. While the demo tools are on the answer
// carries the link itself (D94): the form shows it, and points at the demo page's outbox.
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { responseFailureText, type FailureLabels } from '@/components/api-failure';
import { Button, Field, inputClasses, LinkButton, Notice } from '@/components/ui';
import { useHydrated } from '@/components/use-hydrated';

export type LoginFormLabels = {
  email: string;
  emailHint: string;
  emailMissing: string;
  submit: string;
  pending: string;
  sentTitle: string;
  sentBody: string;
  demoTitle: string;
  demoBody: string;
  demoOpen: string;
  demoOutbox: string;
  demoNone: string;
};

type Sent = { demoLink: { token: string; expiresOn: string } | null };

export function LoginForm({
  locale,
  demoTools,
  labels,
  failures,
}: {
  locale: string;
  /** True while the demo tools are on: the answer carries the link and the outbox exists. */
  demoTools: boolean;
  labels: LoginFormLabels;
  failures: FailureLabels;
}) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const hydrated = useHydrated();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim() === '') {
      setFieldError(labels.emailMissing);
      return;
    }
    setFieldError(null);
    setPending(true);
    setFailed(null);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setFailed(await responseFailureText(response, failures));
        return;
      }
      const body = (await response.json()) as { data: Sent };
      setSent(body.data);
    } catch {
      setFailed(failures.error);
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Notice tone="success" live title={labels.sentTitle}>
          {labels.sentBody}
        </Notice>
        {demoTools ? (
          <Notice tone="info" title={labels.demoTitle}>
            <p>{labels.demoBody}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {sent.demoLink ? (
                <LinkButton href={`/${locale}/login/${sent.demoLink.token}`} size="sm">
                  {labels.demoOpen}
                </LinkButton>
              ) : (
                <p className="text-sm">{labels.demoNone}</p>
              )}
              <Link
                href={`/${locale}/demo#demo-outbox`}
                className="font-semibold underline decoration-2 underline-offset-4"
              >
                {labels.demoOutbox}
              </Link>
            </div>
          </Notice>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {failed ? (
        <Notice tone="error" live>
          {failed}
        </Notice>
      ) : null}
      <Field id="login-email" label={labels.email} hint={labels.emailHint} error={fieldError}>
        {(control) => (
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (fieldError) setFieldError(null);
            }}
            className={inputClasses}
            {...control}
          />
        )}
      </Field>
      <Button type="submit" pending={pending} pendingLabel={labels.pending} disabled={!hydrated}>
        {labels.submit}
      </Button>
    </form>
  );
}
