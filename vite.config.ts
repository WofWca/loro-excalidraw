import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import zipPack from "vite-plugin-zip-pack";

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    process: { env: { NODE_ENV: "development" } }
  },
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    zipPack({ outFileName: "excalidraw.xdc", outDir: 'dist-xdc' }),
  ],
  optimizeDeps: {
    include: ['@excalidraw/excalidraw']
  },
})
