
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Forces relative paths for assets (fixes 404s on custom domains/subpaths)
  server: {
    port: 3000
  },
  build: {
    outDir: 'dist'
  }
});
