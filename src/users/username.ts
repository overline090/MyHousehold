import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

/**
 * L'identifiant d'un compte : ce qu'on tape pour se connecter, à la
 * place d'une adresse e-mail. Un serveur de maison n'envoie pas de
 * courrier, et personne n'a à y donner son adresse.
 *
 * Minuscules, chiffres, point, tiret, tiret bas ; 3 à 32 caractères.
 * « Marie » et « marie » sont le même compte.
 */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function IsUsername() {
  return applyDecorators(
    ApiProperty({ example: 'marie', pattern: USERNAME_PATTERN.source }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizeUsername(value) : value,
    ),
    IsString(),
    Matches(USERNAME_PATTERN, {
      message:
        "L'identifiant fait 3 à 32 caractères : lettres, chiffres, point, tiret ou tiret bas.",
    }),
  );
}
