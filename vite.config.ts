import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Tauri and portable web builds resolve assets relative to the document.
  base: './',
  plugins: [react()],
  server: {
    watch: {
      ignored: ['**/src-tauri/**', '**/tmp/**', '**/release/**'],
    },
  },
})
