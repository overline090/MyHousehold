import { z } from 'zod';

/**
 * Configuration validée au démarrage. Un serveur qui démarre avec une
 * configuration incomplète échoue plus tard, au pire moment : on préfère
 * refuser de démarrer.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(3000),
  // L'écoute HTTP : la machine elle-même et un reverse proxy. Avec
  // docker-compose (réseau de l'hôte), 127.0.0.1 — le réseau local
  // passe par HTTPS.
  MH_HTTP_HOST: z.string().default('0.0.0.0'),
  // L'écoute HTTPS du réseau local, celle que le téléphone joint, avec
  // le certificat auto-signé du serveur.
  MH_HTTPS_PORT: z.coerce.number().int().positive().default(3443),
  // Annonce du serveur sur le Wi-Fi (mDNS), pour que l'app le trouve
  // seule.
  MH_MDNS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

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

  // Vérification des mises à jour. Rien n'est envoyé : le serveur lit
  // une page de publications. Se coupe pour qui ne veut aucun appel
  // sortant.
  MH_UPDATE_CHECK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  MH_RELEASES_URL: z
    .string()
    .url()
    .default('https://api.github.com/repos/overline090/MyHousehold/releases/latest'),
  MH_APP_RELEASES_URL: z
    .string()
    .url()
    .default(
      'https://api.github.com/repos/overline090/MyHousehold-android/releases/latest',
    ),

  MH_NETWORK_SETUP_SOCKET: z.string().optional(),

  // Volume de données à côté de la base : photos de profil aujourd'hui,
  // miroir de l'APK demain. Une sauvegarde doit prendre les deux — c'est
  // dit dans docs/self-hosting.md.
  MH_DATA_DIR: z.string().default('./data'),

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
