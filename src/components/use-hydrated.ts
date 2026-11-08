// False in the server HTML and until React has hydrated the page, true afterwards. A button that
// answers a click with `fetch` is disabled until then: a click on the server HTML would be lost,
// and a submit button in a form would send the form as a native GET.
import { useSyncExternalStore } from 'react';

const noSubscription = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );
}
