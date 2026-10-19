-- CreateTable
CREATE TABLE "Mannequin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "parameters" TEXT NOT NULL DEFAULT '{}',
    "referenceMediaId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Look" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "mannequinId" TEXT,
    "garmentMediaIds" TEXT NOT NULL DEFAULT '[]',
    "parameters" TEXT NOT NULL DEFAULT '{}',
    "outputMediaId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Look_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Look_mannequinId_fkey" FOREIGN KEY ("mannequinId") REFERENCES "Mannequin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Look_projectId_createdAt_idx" ON "Look"("projectId", "createdAt");

