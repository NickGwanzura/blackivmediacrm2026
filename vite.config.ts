
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Forces relative paths for assets (fixes 404s on custom domains/subpaths)
  server: {
    port: 3000,
    proxy: {
      '/health': 'http://localhost:8080',
      '/sync': 'http://localhost:8080',
      '/delete': 'http://localhost:8080',
      '/force-push': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist'
  }
});
