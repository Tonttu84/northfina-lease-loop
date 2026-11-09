// GET /api/audit-log against a real, migrated SQLite database: a visitor gets the personal
// fields masked, the admin the stored rows. Only `db` and `next/headers` cookies are replaced.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '../../../../tests/helpers/reset-db';
import { createTestDb } from '../../../../tests/helpers/test-db';
import { MASKED } from '@/domain/audit';
import { ACTOR_COOKIE, sessionCookieValue } from '@/server/actor';
import { withAudit, type AuditLogEntry } from '@/server/audit';
import type { PrismaClient } from '@/server/prisma-client';

const holder = vi.hoisted(() => ({
  db: undefined as unknown as PrismaClient,
  cookies: new Map<string, string>(),
}));
vi.mock('@/server/db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = holder.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

const { GET } = await import('./route');

let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(holder.db);
  holder.cookies = new Map();
  await withAudit(
    holder.db,
    {
      actor: 'signatory:signatory@norvi.example.com',
      action: 'application.decided',
      entityType: 'application',
      entityId: 'app-1',
      details: {
        to: 'approved',
        by: 'signatory@norvi.example.com',
        reasons: [
          { code: 'too_young', params: { birthDate: '2009-03-10', eighteenOn: '2027-03-10' } },
        ],
      },
    },
    async () => null
  );
});

async function list(): Promise<AuditLogEntry[]> {
  const response = await GET(new Request('http://localhost/api/audit-log'), {
    params: Promise.resolve({}),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: AuditLogEntry[] }).data;
}

describe('GET /api/audit-log', () => {
  it('masks the personal fields and the signatory actor for a visitor', async () => {
    const [row] = await list();
    expect(row).toMatchObject({
      actor: `signatory:${MASKED}`,
      action: 'application.decided',
      details: {
        to: 'approved',
        by: MASKED,
        reasons: [{ code: 'too_young', params: { birthDate: MASKED, eighteenOn: MASKED } }],
      },
    });
  });

  it('shows the admin the stored row', async () => {
    holder.cookies = new Map([[ACTOR_COOKIE, sessionCookieValue('admin')]]);
    const [row] = await list();
    expect(row).toMatchObject({
      actor: 'signatory:signatory@norvi.example.com',
      details: {
        by: 'signatory@norvi.example.com',
        reasons: [{ params: { birthDate: '2009-03-10' } }],
      },
    });
  });
});
