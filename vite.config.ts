import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The extension can be loaded from either `dist` or the project root.
  // Relative assets keep nested popup.html paths valid in both cases.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: { app: 'index.html', popup: 'popup.html', sidepanel: 'sidepanel.html', privacy: 'privacy.html' } },
  },
})
