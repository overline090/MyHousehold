-- Assistant d'installation : état et codes d'appariement.
--
-- L'état vit côté serveur parce qu'on change d'appareil en cours de
-- route (le réseau se configure depuis un téléphone connecté au point
-- d'accès du Pi, la suite depuis un ordinateur) et qu'une coupure de
-- courant doit reprendre où elle en était.

-- CreateEnum
CREATE TYPE "SetupPairingPurpose" AS ENUM ('IMPORT', 'CLAIM');

-- CreateTable
CREATE TABLE "server_setup" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "setupToken" TEXT NOT NULL,
    "firstBootAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "networkDone" BOOLEAN NOT NULL DEFAULT false,
    "importDone" BOOLEAN NOT NULL DEFAULT false,
    "pendingImport" JSONB,
    "householdId" UUID,
    "adminUserId" UUID,
    "completedAt" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "server_setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setup_pairing" (
    "code" TEXT NOT NULL,
    "purpose" "SetupPairingPurpose" NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setup_pairing_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "setup_pairing_expiresAt_idx" ON "setup_pairing"("expiresAt");

-- Une seule ligne d'état possible : la contrainte évite qu'un bug ou une
-- écriture manuelle en crée une seconde, qui donnerait deux assistants
-- avec deux vérités.
ALTER TABLE "server_setup" ADD CONSTRAINT "server_setup_single_row" CHECK ("id" = 1);
