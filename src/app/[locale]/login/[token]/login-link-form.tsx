'use client';

// Opening the sign-in link: POST /api/login/:token sets the signed session cookie (D92) and
// confirms the e-mail (D93), then the account page. The button, not the page load, signs in:
// a link opened by a mail scanner must not use it up.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { responseFailureText, type FailureLabels } from '@/components/api-failure';
import { Button, Notice } from '@/components/ui';
import { useHydrated } from '@/components/use-hydrated';

export function LoginLinkForm({
  token,
  locale,
  labels,
  failures,
}: {
  token: string;
  locale: string;
  labels: { submit: string; pending: string };
  failures: FailureLabels;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const hydrated = useHydrated();

  async function signIn() {
    setPending(true);
    setFailed(null);
    try {
      const response = await fetch(`/api/login/${token}`, { method: 'POST' });
      if (!response.ok) {
        setFailed(await responseFailureText(response, failures));
        setPending(false);
        return;
      }
      router.push(`/${locale}/account?welcome=1`);
      router.refresh();
    } catch {
      setFailed(failures.error);
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {failed ? (
        <Notice tone="error" live>
          {failed}
        </Notice>
      ) : null}
      <Button onClick={signIn} pending={pending} pendingLabel={labels.pending} disabled={!hydrated}>
        {labels.submit}
      </Button>
    </div>
  );
}
