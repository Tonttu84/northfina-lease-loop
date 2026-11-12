-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birth_date" TEXT,
    "country" TEXT,
    "city" TEXT,
    "email" TEXT NOT NULL,
    "employment" TEXT,
    "monthly_net_income_cents" INTEGER,
    "business_id" TEXT,
    "vat_registered" BOOLEAN,
    "annual_revenue_cents" INTEGER,
    "applicant_can_sign" BOOLEAN,
    "beneficial_owners_json" TEXT,
    "is_pep" BOOLEAN NOT NULL,
    "story" TEXT NOT NULL,
    "preferred_locale" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_Customer" ("annual_revenue_cents", "applicant_can_sign", "beneficial_owners_json", "birth_date", "business_id", "city", "country", "created_at", "email", "employment", "id", "is_pep", "monthly_net_income_cents", "name", "preferred_locale", "story", "type", "updated_at", "vat_registered") SELECT "annual_revenue_cents", "applicant_can_sign", "beneficial_owners_json", "birth_date", "business_id", "city", "country", "created_at", "email", "employment", "id", "is_pep", "monthly_net_income_cents", "name", "preferred_locale", "story", "type", "updated_at", "vat_registered" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
