import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Expone en la red LAN para acceso desde otros dispositivos
    port: 5173,
    proxy: {
      // Redirige todas las llamadas /api del frontend al backend Express
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
