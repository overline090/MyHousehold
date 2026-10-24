import { z } from 'zod';

/**
 * Configuration validée au démarrage. Un serveur qui démarre avec une
 * configuration incomplète échoue plus tard, au pire moment : on préfère
 * refuser de démarrer.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // 32 octets en base64 font 44 caractères. On refuse plus court : un
  // secret de 8 caractères donne une fausse impression de sécurité.
  MH_JWT_SECRET: z.string().min(32),

  // Chiffre les identifiants d'agenda. Pas encore lu par le code (la
  // synchronisation d'agenda arrive en v0.5), mais exigé dès maintenant :
  // la clé doit être fixée et sauvegardée AVANT que des identifiants
  // soient chiffrés avec elle, sinon ils deviennent irrécupérables.
  MH_ENCRYPTION_KEY: z.string().min(32),

  MH_PUBLIC_URL: z.string().url(),
  MH_ALLOW_REGISTRATION: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  MH_DEFAULT_TIMEZONE: z.string().default('Europe/Paris'),
  MH_EXPOSE_DOCS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  MH_ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  MH_REFRESH_TOKEN_TTL: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 24 * 3600),

  MH_GOOGLE_CLIENT_ID: z.string().optional(),
  MH_GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export type AppConfig = z.infer<typeof schema>;

export function validateConfig(raw: Record<string, unknown>): AppConfig {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Configuration invalide. Corrigez votre fichier .env (voir .env.example) :\n${details}`,
    );
  }
  return parsed.data;
}
