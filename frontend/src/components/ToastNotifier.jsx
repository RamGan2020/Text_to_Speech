/**
 * ToastNotifier.jsx — Обёртка над react-hot-toast для показа уведомлений
 * об ошибках и успехах во всех вкладках приложения.
 *
 * Заменяет громоздкие Alert-блоки на всплывающие toast-уведомления:
 *   - Красные (error) — ошибки запросов, валидации, сети.
 *   - Зелёные (success) — успешное завершение синтеза/транскрипции.
 *
 * Использование:
 *   <Toaster /> — в App.jsx (отображает toast-контейнер вверху страницы)
 *   import toast from 'react-hot-toast'
 *   toast.error('Сообщение')  /  toast.success('Сообщение')
 */
import { Toaster } from 'react-hot-toast'

export default function ToastNotifier() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        // Стили для стандартных (не-custom) тостов
        style: {
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          fontSize: '0.95rem',
        },
        // Настройки ошибки
        error: {
          duration: 6000,  // Ошибки висят 6 секунд
          iconTheme: {
            primary: '#dc3545', // Bootstrap danger
            secondary: '#fff',
          },
        },
        // Настройки успеха
        success: {
          duration: 4000,  // Успехи исчезают быстрее
          iconTheme: {
            primary: '#198754', // Bootstrap success
            secondary: '#fff',
          },
        },
        // Настройки загрузки (loading)
        loading: {
          duration: Infinity, // Пока явный dismiss
        },
      }}
    />
  )
}
