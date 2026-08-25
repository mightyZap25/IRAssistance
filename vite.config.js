import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [react()],
    resolve: {
        alias: {
            '@mantine/core': path.resolve(__dirname, 'node_modules/@mantine/core')
        }
    },
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
                target: 'http://192.168.0.11:8069',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/odoo-api/, '')
            }
        }
    }
})
