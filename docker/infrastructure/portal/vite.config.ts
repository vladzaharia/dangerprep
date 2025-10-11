import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
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

    // React with SWC - optimized for React 19 and Vite 7
    react({
      // SWC options optimized for React 19 and Vite 7
      // Vite 7: Improved SWC integration with better performance
      jsxImportSource: 'react',
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
      port: 3001,
      host: '0.0.0.0',
      strictPort: true,
      // Vite 7: Warmup options for faster development startup
      warmup: {
        clientFiles: ['./src/main.tsx', './src/App.tsx'],
        ssrFiles: ['./src/server/index.ts'],
      },
    },

    // Preview server configuration
    preview: {
      port: 3001,
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

      // Rollup options for advanced bundling
      rollupOptions: {
        output: {
          // Manual chunk splitting for optimal caching
          manualChunks: (id) => {
            // React and React DOM
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor'
            }

            // FontAwesome icons
            if (id.includes('@fortawesome')) {
              return 'icons-vendor'
            }

            // UI libraries (WebAwesome, Shoelace)
            if (id.includes('@awesome.me/webawesome') || id.includes('@shoelace-style')) {
              return 'ui-vendor'
            }

            // Router
            if (id.includes('react-router')) {
              return 'vendor'
            }

            // Other node_modules
            if (id.includes('node_modules')) {
              return 'vendor'
            }

            // App code organization
            if (id.includes('/src/components/')) {
              return 'components'
            }
            if (id.includes('/src/pages/')) {
              return 'pages'
            }
            if (id.includes('/src/hooks/')) {
              return 'hooks'
            }
            if (id.includes('/src/utils/')) {
              return 'utils'
            }

            // Default case - return undefined to let Vite handle it
            return undefined
          },

          // Asset file naming with organized directories
          assetFileNames: (assetInfo) => {
            const fileName = assetInfo.names?.[0] || 'asset'
            const info = fileName.split('.')
            const extType = info[info.length - 1]

            if (/\.(woff|woff2|eot|ttf|otf)$/.test(fileName)) {
              return 'assets/fonts/[name]-[hash][extname]'
            }
            if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico)$/.test(fileName)) {
              return 'assets/images/[name]-[hash][extname]'
            }
            return `assets/${extType}/[name]-[hash][extname]`
          },

          // JavaScript chunk naming
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
        },
      },
    },

    // Dependency optimization
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@fortawesome/react-fontawesome',
        '@fortawesome/free-solid-svg-icons',
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
