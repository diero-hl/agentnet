import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: './client',
  build: {
    outDir: 'dist',
  },
  server: {
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
});
