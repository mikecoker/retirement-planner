import { defineConfig, mergeConfig } from 'vite'
import { defineConfig as defineVitestConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const viteConfig = defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
})

export default mergeConfig(viteConfig, defineVitestConfig({
  test: {
    environment: 'node',
  },
}))
