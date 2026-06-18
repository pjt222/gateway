import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'node:os'

// WSL / Windows-mounted drives (/mnt/...) emit no inotify events, so Vite's
// watcher misses edits and HMR never fires there. Polling fixes that but is
// CPU/IO-heavy, so enable it ONLY under WSL - native Linux/macOS/Windows keep
// the default event-driven watcher.
const isWSL =
  process.platform === 'linux' &&
  (/microsoft/i.test(os.release()) || !!process.env.WSL_DISTRO_NAME)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/gateway/',
  server: {
    watch: isWSL ? { usePolling: true, interval: 120 } : undefined,
  },
})
