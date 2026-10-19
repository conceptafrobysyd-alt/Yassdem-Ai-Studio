-- CreateTable
CREATE TABLE "Settings" (
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
    "usdToEur" REAL NOT NULL DEFAULT 1,
    "logoSize" INTEGER NOT NULL DEFAULT 15,
    "logoOpacity" REAL NOT NULL DEFAULT 0.8,
    "logoPosition" TEXT NOT NULL DEFAULT 'bottom-right',
    "passwordHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'product',
    "description" TEXT NOT NULL DEFAULT '',
    "parameters" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" REAL,
    "role" TEXT NOT NULL DEFAULT 'SOURCE',
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Media_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sourceMediaId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'generation',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "prompt" TEXT NOT NULL DEFAULT '',
    "parameters" TEXT NOT NULL DEFAULT '{}',
    "budgetMonth" TEXT NOT NULL,
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "actualCostCents" INTEGER,
    "reservedCents" INTEGER NOT NULL DEFAULT 0,
    "providerRequested" BOOLEAN NOT NULL DEFAULT false,
    "providerTaskId" TEXT,
    "outputMediaId" TEXT,
    "errorCode" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "Job"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Job_status_createdAt_idx" ON "Job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_budgetMonth_idx" ON "Job"("budgetMonth");
