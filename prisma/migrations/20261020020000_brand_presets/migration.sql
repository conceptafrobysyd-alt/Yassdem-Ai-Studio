-- CreateTable
CREATE TABLE "BrandPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "logoMediaId" TEXT,
    "logoSize" INTEGER NOT NULL DEFAULT 15,
    "logoOpacity" REAL NOT NULL DEFAULT 0.8,
    "logoPosition" TEXT NOT NULL DEFAULT 'bottom-right',
    "logoFade" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandPreset_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "Media" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "theme" TEXT NOT NULL DEFAULT 'light',
    "contentLocale" TEXT NOT NULL DEFAULT 'fr',
    "preferredStyles" TEXT NOT NULL DEFAULT '[]',
    "customStyles" TEXT NOT NULL DEFAULT '[]',
    "hijab" BOOLEAN NOT NULL DEFAULT false,
    "activeLogoId" TEXT,
    "preferredResolution" INTEGER NOT NULL DEFAULT 1080,
    "preferredFormat" TEXT NOT NULL DEFAULT '9:16',
    "defaultProvider" TEXT NOT NULL DEFAULT 'local',
    "monthlyBudgetCents" INTEGER NOT NULL DEFAULT 0,
    "providerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "replicateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "usdToEur" REAL NOT NULL DEFAULT 1,
    "logoSize" INTEGER NOT NULL DEFAULT 15,
    "logoOpacity" REAL NOT NULL DEFAULT 0.8,
    "logoPosition" TEXT NOT NULL DEFAULT 'bottom-right',
    "logoFade" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("activeLogoId", "contentLocale", "createdAt", "customStyles", "defaultProvider", "hijab", "id", "locale", "logoOpacity", "logoPosition", "logoSize", "monthlyBudgetCents", "passwordHash", "preferredFormat", "preferredResolution", "preferredStyles", "providerEnabled", "replicateEnabled", "theme", "updatedAt", "usdToEur") SELECT "activeLogoId", "contentLocale", "createdAt", "customStyles", "defaultProvider", "hijab", "id", "locale", "logoOpacity", "logoPosition", "logoSize", "monthlyBudgetCents", "passwordHash", "preferredFormat", "preferredResolution", "preferredStyles", "providerEnabled", "replicateEnabled", "theme", "updatedAt", "usdToEur" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BrandPreset_logoMediaId_idx" ON "BrandPreset"("logoMediaId");

