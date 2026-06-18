import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/gateway/',
  // WSL / Windows-mounted drives (/mnt/d) emit no inotify events, so Vite's
  // watcher misses edits and HMR never fires. Poll instead.
  server: {
    watch: { usePolling: true, interval: 120 },
  },
})
