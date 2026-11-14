import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' → la build funciona en cualquier carpeta o hosting estático.
export default defineConfig({
  base: './',
  plugins: [react()],
})
