import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Electron loads dist/index.html through file://, so packaged assets must be
  // relative to the document rather than rooted at /.
  base: './',
  plugins: [react()],
})
