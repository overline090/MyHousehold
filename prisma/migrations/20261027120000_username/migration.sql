-- Plus d'adresse e-mail : un compte se reconnaît à son identifiant.
-- Un serveur de maison n'envoie pas de courrier, et personne n'a à y
-- donner son adresse.

DROP INDEX "user_email_idx";
ALTER TABLE "user" RENAME COLUMN "email" TO "username";
ALTER INDEX "user_email_key" RENAME TO "user_username_key";

-- Les comptes existants gardent la partie avant « @ » de leur adresse,
-- ramenée au motif des identifiants (minuscules, chiffres, . _ -, 3 à
-- 32 caractères, commence par une lettre ou un chiffre). Deux adresses
-- qui donneraient le même identifiant sont départagées par un numéro,
-- le compte le plus ancien gardant le nom nu.
WITH nettoye AS (
  SELECT
    id,
    "createdAt",
    "deletedAt",
    left(
      regexp_replace(
        regexp_replace(lower(split_part(username, '@', 1)), '[^a-z0-9._-]', '', 'g'),
        '^[._-]+', ''
      ),
      28
    ) AS base
  FROM "user"
),
complete AS (
  SELECT
    id,
    "createdAt",
    "deletedAt",
    CASE
      WHEN length(base) >= 3 THEN base
      WHEN base = '' THEN 'compte'
      ELSE rpad(base, 3, '0')
    END AS base
  FROM nettoye
),
numerote AS (
  SELECT
    id,
    "deletedAt",
    base,
    row_number() OVER (PARTITION BY base ORDER BY "createdAt", id) AS rang
  FROM complete
  WHERE "deletedAt" IS NULL
)
UPDATE "user" u
SET username = CASE WHEN n.rang = 1 THEN n.base ELSE n.base || n.rang END
FROM numerote n
WHERE u.id = n.id;

-- Comptes supprimés : une valeur hors du motif, que personne ne peut
-- saisir pour se connecter.
UPDATE "user" SET username = 'Supprimé:' || id WHERE "deletedAt" IS NOT NULL;
