-- Détection des mises à jour, pour le serveur et pour l'application.
--
-- Rien n'est envoyé : le serveur lit une page de publications. La
-- vérification se coupe entièrement par configuration pour qui ne veut
-- aucun appel sortant.

-- CreateTable
CREATE TABLE "release_check" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "serverVersion" TEXT,
    "serverPublishedAt" TIMESTAMPTZ,
    "serverNotesUrl" TEXT,
    "appVersion" TEXT,
    "appPublishedAt" TIMESTAMPTZ,
    "appDownloadUrl" TEXT,
    "appSha256" TEXT,
    "checkedAt" TIMESTAMPTZ,
    "lastError" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "release_check_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "release_check" ADD CONSTRAINT "release_check_single_row" CHECK ("id" = 1);
