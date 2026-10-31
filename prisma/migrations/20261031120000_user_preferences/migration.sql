-- Les préférences d'affichage de chacun : disposition de l'accueil, menu
-- replié, thème. Elles suivent le compte d'un appareil à l'autre.
ALTER TABLE "user" ADD COLUMN "preferences" JSONB NOT NULL DEFAULT '{}';
