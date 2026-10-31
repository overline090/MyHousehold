-- Ce que les détails des tâches reconnaissent, et les règles de copie automatique du foyer.
ALTER TABLE "household" ADD COLUMN "detection" JSONB NOT NULL DEFAULT '{}';
