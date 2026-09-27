import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ADMIN_BASE_PATH lets the console live under a sub-path (e.g. /Casa-Te/admin/ on GitHub Pages).
export default defineConfig({
  base: process.env.ADMIN_BASE_PATH || '/',
  plugins: [react()],
  server: { port: 5173 },
  build: { sourcemap: true },
});
