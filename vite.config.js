import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000', // تم التعديل إلى المنفذ 4000 المطابق للسيرفر
        changeOrigin: true,
        secure: false,
      },
    },
  },
})