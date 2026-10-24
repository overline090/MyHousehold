-- Suppression de la notion d'exclusion et de départ volontaire : la seule
-- sortie d'un foyer est désormais la suppression du compte.
--
-- MEMBER_LEFT disparaît de l'énumération, remplacé par
-- MEMBER_ACCOUNT_DELETED. La conversion se fait dans le USING du
-- changement de type : les lignes existantes ne peuvent pas être mises à
-- jour avant, puisque la nouvelle valeur n'existe pas encore, et la
-- conversion directe échouerait sur toute installation de la v0.1 ayant
-- déjà enregistré un départ.

-- AlterEnum
BEGIN;
CREATE TYPE "ActivityVerb_new" AS ENUM ('TASK_COMPLETED', 'TASK_SKIPPED', 'TASK_MISSED', 'COUNTER_RESET', 'APPOINTMENT_CREATED', 'MEMBER_JOINED', 'MEMBER_ACCOUNT_DELETED', 'MEMBER_ROLE_CHANGED', 'OWNERSHIP_TRANSFERRED');
ALTER TABLE "activity_log" ALTER COLUMN "verb" TYPE "ActivityVerb_new" USING (
  CASE WHEN "verb"::text = 'MEMBER_LEFT' THEN 'MEMBER_ACCOUNT_DELETED' ELSE "verb"::text END
)::"ActivityVerb_new";
ALTER TYPE "ActivityVerb" RENAME TO "ActivityVerb_old";
ALTER TYPE "ActivityVerb_new" RENAME TO "ActivityVerb";
DROP TYPE "public"."ActivityVerb_old";
COMMIT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "isServerAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Sur un serveur déjà installé, le compte le plus ancien devient
-- administrateur de l'instance : quelqu'un doit pouvoir supprimer un
-- compte dont le titulaire n'est plus joignable.
UPDATE "user" SET "isServerAdmin" = true
WHERE "id" = (
  SELECT "id" FROM "user" WHERE "deletedAt" IS NULL ORDER BY "createdAt" ASC LIMIT 1
);
