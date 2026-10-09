import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages project site: https://isaac99kr.github.io/br/
export default defineConfig({
  plugins: [react()],
  base: '/br/',
})
