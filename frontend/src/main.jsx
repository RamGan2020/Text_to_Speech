/**
 * main.jsx — Точка входа React-приложения.
 *
 * Этот файл:
 *   1. Импортирует CSS Bootstrap (через node_modules, установлен пакет)
 *   2. Рендерит компонент App в DOM-элемент <div id="root"> из index.html
 *   3. Оборачивает в React.StrictMode — включает дополнительные проверки при разработке:
 *      - Двойной вызов конструкторов и useEffect (только в dev-mode)
 *      - Предупреждения о небезопасных жизненных циклах
 */
import React from 'react'             // Нужен для JSX-трансляции (React 17+)
import ReactDOM from 'react-dom/client' // Новый API рендеринга (React 18)
import App from './App.jsx'            // Корневой компонент приложения
import 'bootstrap/dist/css/bootstrap.min.css' // CSS-фреймворк Bootstrap 5.3

// Создаём React root в элементе с id="root" и рендерим приложение
ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode — режим разработки с дополнительными проверками.
  // В продакшене (npm run build) эти проверки отключены автоматически.
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
