-- Un serveur, un foyer. Les statuts, porteurs de droits, remplacent les
-- rôles figés ; le profil gagne prénom, nom, date de naissance et photo.
--
-- Cette migration est destructrice sur un point, et c'est assumé : une
-- base qui contiendrait plusieurs foyers n'en garde que le plus ancien,
-- les autres étant supprimés avec leur contenu. Le modèle ne prévoit plus
-- qu'un foyer par machine, et laisser des foyers inatteignables en base
-- serait pire que de les retirer franchement.

-- ───────────────────────────── Statuts ──────────────────────────────

CREATE TYPE "Right" AS ENUM (
  'VIEW',
  'COMPLETE_TASKS',
  'MANAGE_TASKS',
  'MANAGE_APPOINTMENTS',
  'MANAGE_MEMBERS',
  'MANAGE_STATUSES',
  'MANAGE_SERVER'
);

CREATE TABLE "status" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rights" "Right"[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "status_pkey" PRIMARY KEY ("id")
);

-- Les quatre statuts livrés. Leurs identifiants sont fixes pour que le
-- serveur puisse les retrouver après l'installation ; ils n'ont rien de
-- secret, et ces statuts se renomment, se modifient et se suppriment
-- comme ceux que le foyer créera.
INSERT INTO "status" ("id", "name", "rights", "isDefault", "position", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000001', 'Administrateur',
   ARRAY['VIEW','COMPLETE_TASKS','MANAGE_TASKS','MANAGE_APPOINTMENTS','MANAGE_MEMBERS','MANAGE_STATUSES','MANAGE_SERVER']::"Right"[],
   false, 1, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000002', 'Adulte',
   ARRAY['VIEW','COMPLETE_TASKS','MANAGE_TASKS','MANAGE_APPOINTMENTS']::"Right"[],
   true, 2, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000003', 'Enfant',
   ARRAY['VIEW','COMPLETE_TASKS']::"Right"[],
   false, 3, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000004', 'Invité',
   ARRAY['VIEW']::"Right"[],
   false, 4, CURRENT_TIMESTAMP);

-- ────────────────────── Un seul foyer par machine ───────────────────

-- Le foyer gardé est le plus ancien encore vivant. Les autres partent
-- avec leur contenu (ON DELETE CASCADE sur toutes les tables métier).
DELETE FROM "household"
 WHERE "id" <> COALESCE(
   (SELECT "id" FROM "household" WHERE "deletedAt" IS NULL ORDER BY "createdAt" ASC LIMIT 1),
   (SELECT "id" FROM "household" ORDER BY "createdAt" ASC LIMIT 1),
   "id"
 );

-- Garde-fou : plus jamais deux foyers vivants, quelle que soit la route
-- qui tenterait d'en créer un second.
CREATE UNIQUE INDEX "household_unique_vivant" ON "household" ((TRUE)) WHERE "deletedAt" IS NULL;

-- ──────────────────────────── Comptes ───────────────────────────────

ALTER TABLE "user"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "birthDate" DATE,
  ADD COLUMN "avatarPath" TEXT,
  ADD COLUMN "statusId" UUID;

-- Le nom affiché devient prénom + nom. « Marie Dupont » se coupe au
-- premier espace ; « Marie » donne un nom vide, qu'on remplit d'un tiret
-- plutôt que de laisser NULL : la colonne est obligatoire, et un foyer
-- corrigera lui-même ce qu'il veut corriger.
UPDATE "user"
   SET "firstName" = NULLIF(SPLIT_PART("displayName", ' ', 1), ''),
       "lastName"  = NULLIF(TRIM(SUBSTRING("displayName" FROM POSITION(' ' IN "displayName") + 1)), '');

UPDATE "user" SET "firstName" = '—' WHERE "firstName" IS NULL;
UPDATE "user" SET "lastName" = '—' WHERE "lastName" IS NULL OR "lastName" = "firstName";

-- Le rôle dans le foyer gardé devient un statut. Un administrateur de
-- l'instance ou un propriétaire devient « Administrateur ».
UPDATE "user" u
   SET "statusId" = CASE
     WHEN u."isServerAdmin" THEN '00000000-0000-4000-8000-000000000001'::UUID
     WHEN m."role" = 'OWNER' THEN '00000000-0000-4000-8000-000000000001'::UUID
     WHEN m."role" = 'ADULT' THEN '00000000-0000-4000-8000-000000000002'::UUID
     WHEN m."role" = 'CHILD' THEN '00000000-0000-4000-8000-000000000003'::UUID
     ELSE '00000000-0000-4000-8000-000000000004'::UUID
   END
  FROM "household_member" m
 WHERE m."userId" = u."id" AND m."deletedAt" IS NULL;

-- Un compte sans appartenance au foyer gardé (il était dans un foyer
-- supprimé, ou n'en avait aucun) reçoit le statut le plus prudent.
UPDATE "user" SET "statusId" = '00000000-0000-4000-8000-000000000004'::UUID WHERE "statusId" IS NULL;

ALTER TABLE "user"
  ALTER COLUMN "firstName" SET NOT NULL,
  ALTER COLUMN "lastName" SET NOT NULL,
  ALTER COLUMN "statusId" SET NOT NULL,
  DROP COLUMN "displayName",
  DROP COLUMN "isServerAdmin";

ALTER TABLE "user"
  ADD CONSTRAINT "user_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "status"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "user_statusId_idx" ON "user"("statusId");

-- ─────────────────────────── Invitations ────────────────────────────

ALTER TABLE "invite" ADD COLUMN "statusId" UUID;

UPDATE "invite" SET "statusId" = CASE "role"
    WHEN 'OWNER' THEN '00000000-0000-4000-8000-000000000001'::UUID
    WHEN 'ADULT' THEN '00000000-0000-4000-8000-000000000002'::UUID
    WHEN 'CHILD' THEN '00000000-0000-4000-8000-000000000003'::UUID
    ELSE '00000000-0000-4000-8000-000000000004'::UUID
  END;

ALTER TABLE "invite"
  ALTER COLUMN "statusId" SET NOT NULL,
  DROP COLUMN "role";

ALTER TABLE "invite"
  ADD CONSTRAINT "invite_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "status"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ──────────────── Appartenances : il n'y en a plus ──────────────────

DROP TABLE "household_member";
DROP TYPE "HouseholdRole";

-- ─────────────────────────── Fil d'activité ─────────────────────────

-- Deux verbes changent de nom. Le type est recréé plutôt qu'étendu :
-- PostgreSQL sait ajouter une valeur à une énumération, pas en retirer
-- une, et « rôle changé » n'a plus de sens. La conversion se fait dans
-- le USING, donc dans la même transaction que la migration.
CREATE TYPE "ActivityVerb_nouveau" AS ENUM (
  'TASK_COMPLETED',
  'TASK_SKIPPED',
  'TASK_MISSED',
  'COUNTER_RESET',
  'APPOINTMENT_CREATED',
  'MEMBER_JOINED',
  'MEMBER_ACCOUNT_DELETED',
  'MEMBER_STATUS_CHANGED',
  'ADMIN_RIGHTS_TRANSFERRED'
);

ALTER TABLE "activity_log"
  ALTER COLUMN "verb" TYPE "ActivityVerb_nouveau"
  USING (CASE "verb"::TEXT
    WHEN 'MEMBER_ROLE_CHANGED' THEN 'MEMBER_STATUS_CHANGED'
    WHEN 'OWNERSHIP_TRANSFERRED' THEN 'ADMIN_RIGHTS_TRANSFERRED'
    ELSE "verb"::TEXT
  END)::"ActivityVerb_nouveau";

DROP TYPE "ActivityVerb";
ALTER TYPE "ActivityVerb_nouveau" RENAME TO "ActivityVerb";
