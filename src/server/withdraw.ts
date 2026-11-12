// Withdrawing an application (D87): the applicant steps back before signing. Split from
// applications.ts, which owns the Application rows (team rule 3), to keep that file under the
// 600-line cap; the write here is the same slice's.
import type { AuthzRefusal } from '@/domain/authz/policy';
import { withdrawalCheck, type WithdrawRefusal } from '@/domain/question-flow/withdraw';
import { applicationWithdrawalSchema } from '@/domain/rows/application';
import {
  getApplication,
  toApplicationView,
  type ApplicationView,
  type StoredReason,
} from './applications';
import { withAudit } from './audit';
import { authorize } from './authorize';
import { contractIdOfApplication } from './contracts';
import type { PrismaClient } from './prisma-client';
import { parseRow } from './row-rules';

export type WithdrawApplicationResult =
  | { ok: true; application: ApplicationView }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'forbidden'; refusal: AuthzRefusal }
  | { ok: false; reason: 'refused'; refusal: WithdrawRefusal };

/** Thrown inside the withdrawal's transaction when the case moved on, so nothing is written. */
class LostWithdrawalRace extends Error {
  constructor(readonly refusal: WithdrawRefusal) {
    super(refusal.code);
  }
}

/**
 * D87. The applicant (or the admin for them) withdraws an application that is not a lease yet:
 * an approved one not signed, a manual review or a company case waiting for its signatory
 * (`withdrawalCheck`). Authorized first (D73). The row becomes `withdrawn` with a `withdrawn`
 * reason, in one transaction with its audit row; the update only applies to a row still in the
 * state read and with no contract, so a signing at the same instant leaves one winner (signing
 * re-reads the decision in its own transaction, `signContract`).
 */
export async function withdrawApplication(
  db: PrismaClient,
  input: { id: string; actor: string; today: string }
): Promise<WithdrawApplicationResult> {
  const auth = await authorize(db, input.actor, 'withdraw_application', {
    application: input.id,
  });
  if (!auth.ok) {
    return auth.reason.code === 'not_found'
      ? { ok: false, reason: 'not_found' }
      : { ok: false, reason: 'forbidden', refusal: auth.reason };
  }
  const current = await getApplication(db, input.id);
  if (!current) return { ok: false, reason: 'not_found' };
  const check = withdrawalCheck(
    current.decision,
    (await contractIdOfApplication(db, input.id)) !== null
  );
  if (!check.ok) return { ok: false, reason: 'refused', refusal: check.reason };

  const reason: StoredReason = { code: 'withdrawn', params: { by: input.actor, on: input.today } };
  const data = parseRow('application', applicationWithdrawalSchema, {
    decision: 'withdrawn',
    reasons_json: JSON.stringify([...current.reasons, reason]),
    decided_on: input.today,
  });
  try {
    const row = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'application.withdrawn',
        entityType: 'application',
        entityId: input.id,
        details: { from: current.decision, by: input.actor },
      },
      async (tx) => {
        if ((await contractIdOfApplication(tx, input.id)) !== null) {
          throw new LostWithdrawalRace({
            code: 'already_signed',
            params: { decision: current.decision },
          });
        }
        const { count } = await tx.application.updateMany({
          where: { id: input.id, decision: current.decision },
          data,
        });
        if (count === 0) {
          throw new LostWithdrawalRace({
            code: 'not_withdrawable',
            params: { decision: current.decision },
          });
        }
        return tx.application.findUniqueOrThrow({ where: { id: input.id } });
      }
    );
    return { ok: true, application: toApplicationView(row) };
  } catch (error) {
    if (error instanceof LostWithdrawalRace) {
      return { ok: false, reason: 'refused', refusal: error.refusal };
    }
    throw error;
  }
}
