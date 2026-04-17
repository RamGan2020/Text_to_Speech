/**
 * useLocalStorage.ts — Custom hook для сохранения и чтения настроек
 * из localStorage браузера.
 *
 * Зачем: пользователь выбирает голос, модель DeepSeek, системный промпт
 * и другие параметры. При перезагрузке страницы они не должны сбрасываться.
 *
 * Использование:
 *   const [voice, setVoice] = useLocalStorage('tts-voice', 'kseniya')
 *   const [model, setModel] = useLocalStorage('ds-model', 'deepseek-chat')
 */
import { useState, useEffect, Dispatch, SetStateAction } from 'react'

const STORAGE_PREFIX = 'tts-app-' // Префикс для всех ключей, чтобы избежать коллизий

/**
 * @param key — имя ключа (без префикса)
 * @param defaultValue — значение по умолчанию (если ключа ещё нет в localStorage)
 * @returns кортект [текущее_значение, функция_установки]
 */
export function useLocalStorage<T>(
  key: string, 
  defaultValue: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = STORAGE_PREFIX + key

  // Инициализация: пытаемся прочитать из localStorage, иначе — default value
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        // Пробуем распарсить JSON (для объектов/массивов)
        return JSON.parse(stored) as T
      }
      return typeof defaultValue === 'function' ? (defaultValue as () => T)() : defaultValue
    } catch {
      // Ошибка чтения (например, битый JSON) — fallback на default
      return typeof defaultValue === 'function' ? (defaultValue as () => T)() : defaultValue
    }
  })

  // При каждом изменении value — сохраняем в localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // localStorage может быть отключён или переполнен — молча игнорируем
    }
  }, [storageKey, value])

  return [value, setValue]
}

/**
 * Утилита: удалить ключ из localStorage
 * @param key — имя ключа (без префикса)
 */
export function clearLocalStorage(key: string): void {
  localStorage.removeItem(STORAGE_PREFIX + key)
}

/**
 * Утилита: очистить все настройки приложения
 */
export function clearAllAppSettings(): void {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(STORAGE_PREFIX)) {
      localStorage.removeItem(key)
    }
  })
}
