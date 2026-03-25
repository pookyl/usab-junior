import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    process.env.ANALYZE_BUNDLE === '1'
      ? visualizer({
          filename: 'dist/bundle-analysis.html',
          gzipSize: true,
          brotliSize: true,
          open: false,
        })
      : null,
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts';
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router/') ||
            id.includes('/react-router-dom/')
          ) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  define: {
    __VERCEL_GIT_COMMIT_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? null),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    proxy: {
      // Forward /api/* to the local Node.js rankings API server
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
})
