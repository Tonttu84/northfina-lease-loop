// The write schemas of the `Account` and `LoginToken` rows (prisma/schema.prisma, D93, D94),
// parsed on the server before every write (D23).
import { z } from 'zod';
import { signatoryEmailSchema } from './signatory';
import { idSchema, isoDateSchema, ON_VALID_FIELDS } from './fields';

export const accountRoleSchema = z.enum(['customer', 'admin']);
export type AccountRole = z.infer<typeof accountRoleSchema>;

/** An e-mail as stored: trimmed, lower case (the same rule as a signatory's). */
export const accountEmailSchema = signatoryEmailSchema;

export const accountRowSchema = z
  .strictObject({
    id: idSchema.optional(),
    /** The customer the account signs in as; null for the back office account. */
    customer_id: idSchema.nullable(),
    role: accountRoleSchema,
    email: accountEmailSchema,
    email_confirmed: z.boolean(),
    confirmed_on: isoDateSchema.nullable(),
  })
  .refine((row) => (row.role === 'admin') === (row.customer_id === null), {
    message: 'the admin account has no customer, a customer account has one',
    path: ['customer_id'],
    ...ON_VALID_FIELDS,
  })
  .refine((row) => row.email_confirmed === (row.confirmed_on !== null), {
    message: 'a confirmed e-mail has its day, an unconfirmed one none',
    path: ['confirmed_on'],
    ...ON_VALID_FIELDS,
  });

/** The columns opening the first link sets. */
export const accountConfirmationUpdateSchema = z.strictObject({
  email_confirmed: z.literal(true),
  confirmed_on: isoDateSchema,
});

/** A SHA-256 as hex. */
export const tokenHashSchema = z.string().regex(/^[0-9a-f]{64}$/, 'a token hash is 64 hex digits');

/** The token itself: 24 random bytes as base64url. */
export const loginTokenValueSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{32,64}$/, 'a token is 32 to 64 url-safe characters');

export const loginTokenRowSchema = z
  .strictObject({
    id: idSchema.optional(),
    account_id: idSchema,
    token_hash: tokenHashSchema,
    /** The token in clear, only while the demo tools are on (D94); null in production. */
    demo_token: loginTokenValueSchema.nullable(),
    sent_on: isoDateSchema,
    expires_on: isoDateSchema,
    used_on: isoDateSchema.nullable(),
  })
  .refine((row) => row.sent_on < row.expires_on, {
    message: 'a link expires after the day it is sent',
    path: ['expires_on'],
    ...ON_VALID_FIELDS,
  });

/** The one column opening the link sets. */
export const loginTokenUsedUpdateSchema = z.strictObject({
  used_on: isoDateSchema,
});
