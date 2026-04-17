/**
 * vite.config.js — Конфигурация Vite для React-фронтенда.
 *
 * Определяет:
 *   - Плагин @vitejs/plugin-react (для JSX и Fast Refresh).
 *   - Dev-сервер на порту 3000.
 *   - Прокси /api → http://localhost:8000 — все запросы на /api/*
 *     автоматически перенаправляются на бэкенд, что устраняет CORS
 *     при локальной разработке (frontend:3000 + backend:8000).
 *
 * В продакшене (npm run build) proxy не используется —
 * статические файлы отдаются через nginx / напрямую, и запросы
 * на /api/* направляются к production-бэкенду.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Плагин для поддержки JSX/TSX и Fast Refresh
  plugins: [react()],

  // Настройки dev-сервера
  server: {
    port: 3000, // Открывать http://localhost:3000 при npm run dev

    // Прокси API-запросов на бэкенд
    // Пример: GET /api/synthesize → GET http://localhost:8000/synthesize
    proxy: {
      '/api': {
        target: 'http://localhost:8000', // FastAPI-бэкенд
        changeOrigin: true,              // Меняем заголовок Host на target
        rewrite: (path) => path.replace(/^\/api/, ''), // Убираем /api из пути
      },
    },
  },
})
