/**
 * useOnlineStatus.js — Custom hook, отслеживающий онлайн/оффлайн статус браузера.
 *
 * Зачем: приложение работает с сетью (TTS/STT API). Если сеть пропала,
 * пользователь должен видеть уведомление и не пытаться отправить запрос.
 *
 * Использование:
 *   const { isOnline } = useOnlineStatus()
 *   if (!isOnline) — показать заглушку / заблокировать кнопки
 *
 * Также экспортирует компонент <OfflineBanner> для показа плашки в UI.
 */
import { useState, useEffect } from 'react'
import { Alert } from 'react-bootstrap'

/**
 * Хук возвращает boolean: true = онлайн, false = оффлайн
 * @returns {{ isOnline: boolean }}
 */
export function useOnlineStatus() {
  // Начальное значение — из navigator.onLine
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    // Слушатели событий online/offline браузера
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { isOnline }
}

/**
 * OfflineBanner — плашка с предупреждением, показываемая при потере сети.
 *
 * Размещается в верхней части страницы (position fixed), перекрывая контент.
 * Автоматически скрывается при восстановлении соединения.
 */
export function OfflineBanner() {
  const { isOnline } = useOnlineStatus()

  if (isOnline) return null

  return (
    <Alert
      variant="warning"
      className="text-center m-0 py-2"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        borderRadius: 0,
        marginBottom: 0,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      ⚠️ Нет подключения к интернету. Приложение не сможет обрабатывать запросы.
    </Alert>
  )
}
