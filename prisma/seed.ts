// Fills the database from the data pack. Run by `npm run db:setup` (via `prisma db seed`).
// Safe to run again: it only adds assets, customers, company signatories and accounts that
// are missing and never overwrites your changes. The signatories are valid from the seed day
// (D46); the accounts start unconfirmed (D93).
import { loadAssets, loadCustomers } from '@/data/load';
import { seedAccounts } from '@/server/accounts';
import { seedAssets } from '@/server/assets';
import { seedCustomers } from '@/server/customers';
import { createPrismaClient } from '@/server/prisma-client';
import { seedSignatories } from '@/server/signatories';
import { todayIso } from '@/server/today';

const db = createPrismaClient();
try {
  const assets = await seedAssets(db, await loadAssets());
  console.log(`🌱 Seeded ${assets.created} new assets (${assets.skipped} were already there).`);
  const pack = await loadCustomers();
  const customers = await seedCustomers(db, pack);
  console.log(
    `🌱 Seeded ${customers.created} new customers (${customers.skipped} were already there).`
  );
  const signatories = await seedSignatories(db, pack, todayIso());
  console.log(
    `🌱 Seeded ${signatories.created} new company signatories (${signatories.skipped} companies had theirs).`
  );
  const accounts = await seedAccounts(db, pack);
  console.log(
    `🌱 Seeded ${accounts.created} new accounts (${accounts.skipped} were already there).`
  );
} finally {
  await db.$disconnect();
}
