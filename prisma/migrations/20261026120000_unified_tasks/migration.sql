-- Tout est une tâche. Récurrente, de fond ou ponctuelle : seule change
-- la façon dont elle est due.
--
-- Les compteurs deviennent des tâches de fond, et leurs événements des
-- occurrences faites : ce n'était pas une autre nature d'objet, et deux
-- listes là où le foyer n'en vit qu'une était une erreur. Rien n'est
-- perdu — chaque remise à zéro reste, datée et signée.
--
-- Les catégories, texte libre recopié sur chaque tâche, deviennent des
-- groupes. Les points disparaissent.

CREATE TYPE "TaskKind" AS ENUM ('SCHEDULED', 'BACKGROUND', 'ONE_OFF');

-- ───────────────────────── Groupes de tâches ────────────────────────

CREATE TABLE "task_group" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#0F766E',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "task_group_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_group_householdId_idx" ON "task_group"("householdId");

ALTER TABLE "task_group"
  ADD CONSTRAINT "task_group_householdId_fkey" FOREIGN KEY ("householdId")
  REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────── task_definition devient task ──────────────────

ALTER TABLE "task_definition" RENAME TO "task";
ALTER TABLE "task" RENAME CONSTRAINT "task_definition_pkey" TO "task_pkey";
ALTER TABLE "task" RENAME CONSTRAINT "task_definition_householdId_fkey" TO "task_householdId_fkey";
ALTER INDEX "task_definition_householdId_isActive_idx" RENAME TO "task_householdId_isActive_idx";
ALTER INDEX "task_definition_householdId_updatedAt_idx" RENAME TO "task_householdId_updatedAt_idx";

ALTER TABLE "task"
  ADD COLUMN "kind" "TaskKind" NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN "groupId" UUID,
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxIntervalSeconds" INTEGER,
  ADD COLUMN "warnRatio" DECIMAL(3,2) NOT NULL DEFAULT 0.8,
  ADD COLUMN "dueDate" DATE,
  ALTER COLUMN "rrule" DROP NOT NULL;

-- ───────────── Les compteurs deviennent des tâches de fond ──────────

INSERT INTO "task" (
    "id", "householdId", "title", "description", "category", "kind", "priority",
    "maxIntervalSeconds", "warnRatio", "assignmentMode", "graceHours", "points",
    "isActive", "createdById", "createdAt", "updatedAt", "deletedAt"
)
SELECT
    c."id", c."householdId", c."title", c."description", c."category", 'BACKGROUND', 0,
    c."targetIntervalSeconds", c."warnRatio", c."assignmentMode", 24, 0,
    c."isActive", c."createdById", c."createdAt", c."updatedAt", c."deletedAt"
  FROM "counter_definition" c;

-- ───────── Les clés étrangères suivent le changement de nom ─────────

ALTER TABLE "task_assignee" RENAME COLUMN "taskDefinitionId" TO "taskId";
ALTER TABLE "task_assignee" RENAME CONSTRAINT "task_assignee_taskDefinitionId_fkey" TO "task_assignee_taskId_fkey";

ALTER TABLE "task_occurrence" RENAME COLUMN "taskDefinitionId" TO "taskId";
ALTER TABLE "task_occurrence" RENAME CONSTRAINT "task_occurrence_taskDefinitionId_fkey" TO "task_occurrence_taskId_fkey";
ALTER INDEX "task_occurrence_taskDefinitionId_scheduledFor_key" RENAME TO "task_occurrence_taskId_scheduledFor_key";

-- Une tâche de fond n'a pas de date, mais un délai.
ALTER TABLE "task_occurrence"
  ALTER COLUMN "scheduledFor" DROP NOT NULL,
  ALTER COLUMN "dueAt" DROP NOT NULL;

-- ─────────── Les remises à zéro deviennent des occurrences ──────────

INSERT INTO "task_occurrence" (
    "id", "taskId", "householdId", "scheduledFor", "dueAt",
    "status", "completedAt", "completedById", "note",
    "createdAt", "updatedAt", "deletedAt"
)
SELECT
    e."id", e."counterDefinitionId", e."householdId", NULL, NULL,
    'DONE', e."occurredAt", e."recordedById", e."note",
    e."createdAt", e."updatedAt", e."deletedAt"
  FROM "counter_event" e;

DROP TABLE "counter_event";
DROP TABLE "counter_definition";

-- ───────────────── Les catégories deviennent des groupes ────────────

INSERT INTO "task_group" ("id", "householdId", "name", "position", "updatedAt")
SELECT gen_random_uuid(), t."householdId", t."category", 0, CURRENT_TIMESTAMP
  FROM "task" t
 WHERE t."category" IS NOT NULL AND t."category" <> ''
 GROUP BY t."householdId", t."category";

UPDATE "task" t
   SET "groupId" = g."id"
  FROM "task_group" g
 WHERE g."householdId" = t."householdId" AND g."name" = t."category";

ALTER TABLE "task"
  DROP COLUMN "category",
  DROP COLUMN "points",
  DROP COLUMN "durationMinutes";

ALTER TABLE "task"
  ADD CONSTRAINT "task_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "task_group"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "task_householdId_kind_isActive_idx" ON "task"("householdId", "kind", "isActive");
CREATE INDEX "task_groupId_idx" ON "task"("groupId");

-- ───────────────────────────── Énumérations ─────────────────────────

-- « compteur remis à zéro » devient « tâche de fond faite ». Le type est
-- recréé : PostgreSQL sait ajouter une valeur, pas en retirer une.
CREATE TYPE "ActivityVerb_nouveau" AS ENUM (
  'TASK_COMPLETED',
  'TASK_SKIPPED',
  'TASK_MISSED',
  'BACKGROUND_TASK_DONE',
  'APPOINTMENT_CREATED',
  'MEMBER_JOINED',
  'MEMBER_ACCOUNT_DELETED',
  'MEMBER_STATUS_CHANGED',
  'ADMIN_RIGHTS_TRANSFERRED'
);

ALTER TABLE "activity_log"
  ALTER COLUMN "verb" TYPE "ActivityVerb_nouveau"
  USING (CASE "verb"::TEXT
    WHEN 'COUNTER_RESET' THEN 'BACKGROUND_TASK_DONE'
    ELSE "verb"::TEXT
  END)::"ActivityVerb_nouveau";

DROP TYPE "ActivityVerb";
ALTER TYPE "ActivityVerb_nouveau" RENAME TO "ActivityVerb";

-- Un rappel ne vise plus un compteur : il vise une occurrence, comme
-- pour toutes les autres tâches.
DELETE FROM "reminder" WHERE "targetType"::TEXT = 'COUNTER';

CREATE TYPE "ReminderTargetType_nouveau" AS ENUM ('APPOINTMENT', 'TASK_OCCURRENCE');

ALTER TABLE "reminder"
  ALTER COLUMN "targetType" TYPE "ReminderTargetType_nouveau"
  USING ("targetType"::TEXT)::"ReminderTargetType_nouveau";

DROP TYPE "ReminderTargetType";
ALTER TYPE "ReminderTargetType_nouveau" RENAME TO "ReminderTargetType";

ALTER TABLE "notification_preference" DROP COLUMN "countersEnabled";
