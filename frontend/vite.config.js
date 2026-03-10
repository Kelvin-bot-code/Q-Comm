import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl() // <--- Adds HTTPS support
  ],
  server: {
    host: true, // Exposes the server to your local network
    port: 5173  // Keeps the port consistent
  }
})