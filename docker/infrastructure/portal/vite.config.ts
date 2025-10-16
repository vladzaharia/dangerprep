import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import devServer from '@hono/vite-dev-server'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'
import viteCompression from 'vite-plugin-compression'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isProduction = mode === 'production'
  const isDevelopment = command === 'serve'

  const plugins = [
    // Hono dev server for development - only handle API routes
    devServer({
      entry: 'src/server/index.ts',
      exclude: [
        /^\/$/, // Exclude root path
        /^\/(?!api).*/, // Exclude all non-API paths
      ],
    }),

    // React with standard plugin - optimized for React 19 and Vite 7
    react({
      // Standard React plugin options for React 19 and Vite 7
      // Vite 7: Improved React integration with better performance
      jsxRuntime: 'automatic',
    }),
  ]

  // Add production-only plugins
  if (isProduction) {
    plugins.push(
      // PWA capabilities
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
        manifest: {
          name: 'DangerPrep Portal',
          short_name: 'DangerPrep',
          description: 'Emergency preparedness hotspot management portal',
          theme_color: '#1f2937',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/api\./i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),

      // Compression for production
      viteCompression({
        verbose: true,
        disable: false,
        threshold: 1025,
        algorithm: 'gzip',
        ext: '.gz',
      }),

      // Bundle analyzer for production builds
      visualizer({
        filename: 'dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }) as any
    )
  }

  return {
    plugins,

    // Path resolution
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },

    // Development server configuration
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      allowedHosts: ['localhost', '127.0.0.1', 'portal.danger.diy', 'portal.argos.surf', 'portal.danger'],
      // Vite 7: Warmup options for faster development startup
      warmup: {
        clientFiles: ['./src/main.tsx', './src/App.tsx'],
        ssrFiles: ['./src/server/index.ts'],
      },
    },

    // Preview server configuration
    preview: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
    },

    // Build configuration
    build: {
      target: 'es2022', // Vite 7: baseline-widely-available
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: isDevelopment,
      minify: isProduction ? 'esbuild' : false,
      cssMinify: isProduction,
    },

    // Dependency optimization
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@fortawesome/react-fontawesome',
        '@awesome.me/kit-a765fc5647',
        '@awesome.me/webawesome',
      ],
      exclude: ['@vite/client', '@vite/env'],
      // Vite 7: Force optimization for better performance
      force: isProduction,
    },

    // Environment variables
    define: {
      __DEV__: isDevelopment,
      __PROD__: isProduction,
      'process.env.NODE_ENV': JSON.stringify(mode),
    },

    // CSS optimization
    css: {
      // Enable CSS modules with optimized class names
      modules: {
        localsConvention: 'camelCaseOnly',
        generateScopedName: isProduction
          ? '[hash:base64:5]'
          : '[name]__[local]__[hash:base64:5]',
      },
      // PostCSS configuration for modern CSS features
      postcss: {
        plugins: [],
      },
      // Enable CSS code splitting
      devSourcemap: isDevelopment,
    },

    // Performance optimizations for Vite 7
    esbuild: {
      // Drop console and debugger in production
      drop: isProduction ? ['console', 'debugger'] : [],
      // Vite 7: Target ES2022 for baseline-widely-available compatibility
      target: 'es2022',
      // Enable top-level await and other modern features
      supported: {
        'top-level-await': true,
      },
      // JSX configuration
      jsx: 'automatic',
      jsxDev: isDevelopment,
    },

    // SSR configuration for Hono
    ssr: {
      external: ['react', 'react-dom'],
      noExternal: ['@awesome.me/webawesome'],
    },
  }
})
