/**
 * useToastError.ts — Custom hook, который превращает onError-коллбэк
 * в toast.error(), сохраняя при этом setState-вызов для родительского компонента.
 *
 * Цель: компоненты вкладок продолжают вызывать onError('сообщение'),
 * но вместо Alert теперь появляется Toast. При этом Alert-блоки в App.tsx
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
 * @param parentOnError — родительский коллбэк (setTtsError и т.п.)
 * @returns функция onError с toast
 */
export function useToastError(parentOnError?: (msg: string | null) => void) {
  return useCallback(
    (msg: string | null) => {
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
 * @param onSuccess — дополнительный коллбэк при успехе
 * @returns функция onSuccess с toast
 */
export function useToastSuccess(onSuccess?: () => void) {
  return useCallback(
    (msg: string) => {
      toast.success(msg)
      onSuccess?.()
    },
    [onSuccess]
  )
}
