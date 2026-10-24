// Depuis Prisma 7, l'URL de connexion utilisée par les commandes de
// migration vit ici et non plus dans le bloc datasource du schéma, et le
// fichier .env n'est plus chargé automatiquement.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Lu via process.env plutôt que via env() de Prisma, pour que
  // `prisma generate` fonctionne sans base configurée.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
