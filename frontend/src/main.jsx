// main.jsx — Точка входа React-приложения
// Этот файл инициализирует React-приложение и вставляет его в HTML-элемент

import React from 'react'  // Импортируем React (нужен для JSX-трансляции)
import ReactDOM from 'react-dom/client'  // Импортируем ReactDOM для рендеринга в DOM
import App from './App.jsx'  // Импортируем главный компонент приложения
import 'bootstrap/dist/css/bootstrap.min.css'  // Импортируем CSS Bootstrap для стилей

// Создаём корень React-приложения в элементе с id="root" (из index.html)
ReactDOM.createRoot(document.getElementById('root')).render(
  // React.StrictMode — режим разработки с дополнительными проверками
  <React.StrictMode>
    <App />  {/* Рендерим главный компонент приложения */}
  </React.StrictMode>,
)
