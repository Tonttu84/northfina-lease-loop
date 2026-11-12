// The contract of the sign-in routes (D93, D94): bodies, params and responses, for the route
// table in routes.ts and the route files. Contract first (team rule 2).
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import {
  accountEmailSchema,
  accountRoleSchema,
  loginTokenValueSchema,
} from '@/domain/rows/account';

/** Body of `POST /api/login`: the e-mail to send the sign-in link to; an account is made for a new one (D107). */
export const loginBodySchema = z.strictObject({ email: accountEmailSchema });

export const loginTokenParamsSchema = z.object({ token: loginTokenValueSchema });

/**
 * `POST /api/login` always answers this, whether the e-mail had an account or the request just
 * made one (D107: an unknown e-mail signs up), so nothing tells a visitor which e-mails had
 * accounts. `demoLink` is the link itself, only while the demo tools are on: the demo's
 * stand-in for the e-mail (D94).
 */
export const loginRequestedSchema = z.object({
  sent: z.literal(true),
  demoLink: z
    .object({
      token: loginTokenValueSchema,
      expiresOn: isoDateSchema,
    })
    .nullable(),
});

export const loginLinkOutcomeSchema = z.enum(['valid', 'used', 'expired']);

/** `GET /api/login/[token]`: the link's state today and whose it is, the e-mail masked. */
export const loginLinkStateSchema = z.object({
  outcome: loginLinkOutcomeSchema,
  emailMasked: z.string(),
  sentOn: isoDateSchema,
  expiresOn: isoDateSchema,
});

/** `POST /api/login/[token]`: signed in as `actor`; `confirmedNow` when this link confirmed the e-mail. */
export const signedInSchema = z.object({
  actor: z.string().min(1),
  emailConfirmed: z.literal(true),
  confirmedNow: z.boolean(),
});

/** An account as the account page and the header read it. */
export const accountSchema = z.object({
  id: z.string(),
  customerId: z.string().nullable(),
  role: accountRoleSchema,
  email: z.string(),
  emailConfirmed: z.boolean(),
  confirmedOn: isoDateSchema.nullable(),
});
export type AccountView = z.infer<typeof accountSchema>;
