import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base '/' → rutas absolutas (necesario para la PWA y el service worker en Vercel).
export default defineConfig({
  base: '/',
  plugins: [react()],
})
