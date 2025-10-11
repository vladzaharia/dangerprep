import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { apiPlugin } from './src/server/vite-plugin-api'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Enable React 19 features
      jsxRuntime: 'automatic',
    }),
    // Add API middleware for development
    apiPlugin(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          webawesome: ['@awesome.me/webawesome'],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    strictPort: false,
  },
  preview: {
    port: 3000,
    host: true,
    strictPort: true,
  },
  // Environment variables configuration
  envPrefix: 'VITE_',
  define: {
    // Ensure we're building for production
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
})
