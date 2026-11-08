// The flag every cookie of ours carries beyond its own (docs/features/security.md): `Secure` on
// a production build, where the site is served over https. Local development is plain http, and
// a Secure cookie would never come back there, so the flag follows the build, not a setting.
export function secureFlag(env: Record<string, string | undefined> = process.env): string {
  return env.NODE_ENV === 'production' ? '; Secure' : '';
}
