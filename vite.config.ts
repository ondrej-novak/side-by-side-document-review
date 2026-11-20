import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // In dev, /api goes to the .NET server (dotnet run --project server/DocumentReview.Api).
  server: { proxy: { '/api': 'http://localhost:5053' } },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], css: { modules: { classNameStrategy: 'non-scoped' } } },
})
