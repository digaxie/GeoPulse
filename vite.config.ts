import path from 'node:path'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

function normalizeBasePath(value?: string) {
  const trimmed = value?.trim()

  if (!trimmed || trimmed === '/') {
    return '/'
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const basePath = normalizeBasePath(env.VITE_APP_BASE_PATH)

  return {
    base: basePath,
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/')

            if (!normalizedId.includes('node_modules')) {
              return undefined
            }

            if (normalizedId.includes('/node_modules/ol/')) {
              return 'openlayers'
            }

            if (normalizedId.includes('/node_modules/react/')
              || normalizedId.includes('/node_modules/react-dom/')
              || normalizedId.includes('/node_modules/react-router-dom/')) {
              return 'react-vendor'
            }

            if (normalizedId.includes('/node_modules/@supabase/')) {
              return 'supabase'
            }

            if (normalizedId.includes('/node_modules/hls.js/')) {
              return 'hls'
            }

            if (normalizedId.includes('/node_modules/zustand/')
              || normalizedId.includes('/node_modules/zod/')) {
              return 'state'
            }

            return 'vendor'
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
      exclude: [...configDefaults.exclude, '.codex-*/**', 'twitter-canli-deneme/**'],
      coverage: {
        reporter: ['text', 'html'],
      },
    },
  }
})
