// vite.config.js — Конфигурация сборщика Vite для frontend-приложения
import { defineConfig } from 'vite'  // Импортируем хелпер для типизированной конфигурации
import react from '@vitejs/plugin-react'  // Импортируем плагин для поддержки React (JSX)

// Экспортируем конфигурацию через defineConfig (даёт автодополнение в IDE)
export default defineConfig({
  plugins: [react()],  // Подключаем плагин React для обработки JSX
  server: {
    port: 3000,  // Порт dev-сервера — 3000
    proxy: {
      '/api': {  // Запросы, начинающиеся с /api, будут проксироваться
        target: 'http://localhost:8000',  // На backend-сервер (FastAPI)
        changeOrigin: true,  // Меняем заголовок Host на целевой сервер
        rewrite: (path) => path.replace(/^\/api/, '')  // Убираем префикс /api из пути
      }
    }
  }
})
