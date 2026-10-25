import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  build: {
    // Servi en statique par Nest : un Raspberry Pi sert des fichiers
    // sans effort, le rendu serveur lui coûterait du processeur à
    // chaque page.
    outDir: '../web-dist',
    emptyOutDir: true,
  },
  server: {
    // En développement, l'API tourne à côté.
    proxy: {
      '/api': 'http://localhost:3000',
      '/setup/': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/app-release': 'http://localhost:3000',
    },
  },
});
