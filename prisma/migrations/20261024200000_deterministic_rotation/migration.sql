-- Le tour de rôle est désormais déduit de la position de l'occurrence
-- dans la série, et non d'un compteur stocké.
--
-- Un compteur dérive : il avance à chaque génération, donc regénérer une
-- série après un changement de règle, ou supprimer une occurrence future,
-- redistribuait les tours sans que personne ne comprenne pourquoi. La
-- position dans la série, elle, est stable et reproductible.

-- AlterTable
ALTER TABLE "task_definition" DROP COLUMN "rotationCursor";
