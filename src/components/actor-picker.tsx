'use client';

// "Continue as": picks the actor (D17), a demo tool beside the sign-in link (D93). Posts the choice to /api/actor,
// which sets the cookie, then refreshes so the server components read the new actor.
// The page passes in the customers, the current actor and the translated labels. The button is
// disabled until hydration: before it, the browser would send the form as a native GET.
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Button, cx, inputClasses } from '@/components/ui';
import { useHydrated } from '@/components/use-hydrated';

export type ActorPickerLabels = {
  label: string;
  anonymous: string;
  admin: string;
  submit: string;
  clear: string;
  error: string;
};

export function ActorPicker({
  customers,
  current,
  labels,
  onDark = false,
}: {
  customers: readonly { id: string; name: string }[];
  current: string;
  labels: ActorPickerLabels;
  /** True on the teal staff strip: light label and an outlined light button. */
  onDark?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(current === 'anonymous' ? '' : current);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();

  function send(init: RequestInit) {
    startTransition(async () => {
      const response = await fetch('/api/actor', init).catch(() => null);
      setFailed(!response?.ok);
      if (response?.ok) router.refresh();
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === '') {
      send({ method: 'DELETE' });
      return;
    }
    send({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: selected }),
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cx(
        'flex flex-wrap items-center gap-2 text-sm',
        // On the staff strip: the rest of the row, never less than its widest part (the select's
        // 6 rem or the button), else the strip wraps it onto a row of its own.
        onDark && 'min-w-min flex-1 justify-end'
      )}
    >
      <label
        htmlFor="actor-picker"
        className={cx('font-semibold', onDark ? 'max-sm:sr-only' : 'text-ink-muted')}
      >
        {labels.label}
      </label>
      <select
        id="actor-picker"
        name="actor"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        // 6 rem to start with and never narrower, so the chosen name still shows; it grows into the
        // room the button leaves, and the button goes under it when there is none.
        className={cx(
          inputClasses,
          'min-h-9 w-auto max-w-56 min-w-24 flex-1 basis-24 py-1 text-sm'
        )}
      >
        <option value="">{labels.anonymous}</option>
        <option value="admin">{labels.admin}</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name}
          </option>
        ))}
      </select>
      <Button
        type="submit"
        variant={onDark ? 'onDark' : 'secondary'}
        size="sm"
        pending={pending}
        disabled={!hydrated}
        // The row does not wrap and the select gives way first: the label stays whole.
        className="shrink-0"
      >
        {selected === '' && current !== 'anonymous' ? labels.clear : labels.submit}
      </Button>
      {failed ? (
        <span role="alert" className={onDark ? 'font-semibold' : 'text-danger-ink'}>
          {labels.error}
        </span>
      ) : null}
    </form>
  );
}
