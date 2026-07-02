import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [react()],
    define: {
        'process.env': {}
    },
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://localhost:5050',
                changeOrigin: true,
                secure: false
            },
            '/odoo-api': {
                target: 'http://192.168.0.7:8069',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/odoo-api/, '')
            }
        }
    }
})
