/**
 * useToastError.js — Custom hook, который превращает onError-коллбэк
 * в toast.error(), сохраняя при этом setState-вызов для родительского компонента.
 *
 * Цель: компоненты вкладок продолжают вызывать onError('сообщение'),
 * но вместо Alert теперь появляется Toast. При этом Alert-блоки в App.jsx
 * сохраняются для совместимости — toast дублирует сообщение, а не заменяет.
 *
 * Использование:
 *   const { onError: showToastError } = useToastError()
 *   TtsTab onError={showToastError}
 */
import { useCallback } from 'react'
import toast from 'react-hot-toast'

/**
 * Возвращает обёртку, которая вызывает toast.error() и опционально
 * передаёт сообщение дальше в родительский onError коллбэк.
 *
 * @param {(msg: string|null) => void} [parentOnError] — родительский коллбэк (setTtsError и т.п.)
 * @returns {(msg: string|null) => void} — функция onError с toast
 */
export function useToastError(parentOnError) {
  return useCallback(
    (msg) => {
      if (msg) {
        toast.error(msg)
      }
      parentOnError?.(msg)
    },
    [parentOnError]
  )
}

/**
 * Аналогично для успешных уведомлений.
 *
 * @param {() => void} [onSuccess] — дополнительный коллбэк при успехе
 * @returns {(msg: string) => void}
 */
export function useToastSuccess(onSuccess) {
  return useCallback(
    (msg) => {
      toast.success(msg)
      onSuccess?.()
    },
    [onSuccess]
  )
}
