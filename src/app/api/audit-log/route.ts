// GET /api/audit-log: the 50 newest audit rows, newest first. Public, as the audit page is; anyone
// but the admin gets the personal fields masked (docs/features/security.md), the stored rows and
// their hashes untouched.
import { redactAuditEntry } from '@/domain/audit';
import { ADMIN_ACTOR, readActor } from '@/server/actor';
import { handleRoute, ok } from '@/server/api-response';
import { listAuditLog } from '@/server/audit';
import { db } from '@/server/db';

export const GET = handleRoute(async () => {
  const [rows, actor] = await Promise.all([listAuditLog(db, 50), readActor(db)]);
  return ok(actor === ADMIN_ACTOR ? rows : rows.map(redactAuditEntry));
});
