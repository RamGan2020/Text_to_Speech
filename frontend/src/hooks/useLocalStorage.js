/**
 * useLocalStorage.js — Custom hook для сохранения и чтения настроек
 * из localStorage браузера.
 *
 * Зачем: пользователь выбирает голос, модель DeepSeek, системный промпт
 * и другие параметры. При перезагрузке страницы они не должны сбрасываться.
 *
 * Использование:
 *   const [voice, setVoice] = useLocalStorage('tts-voice', 'kseniya')
 *   const [model, setModel] = useLocalStorage('ds-model', 'deepseek-chat')
 */
import { useState, useEffect } from 'react'

const STORAGE_PREFIX = 'tts-app-' // Префикс для всех ключей, чтобы избежать коллизий

/**
 * @param {string} key — имя ключа (без префикса)
 * @param {*} defaultValue — значение по умолчанию (если ключа ещё нет в localStorage)
 * @returns {[value, setValue]} — кортект [текущее_значение, функция_установки]
 */
export function useLocalStorage(key, defaultValue) {
  const storageKey = STORAGE_PREFIX + key

  // Инициализация: пытаемся прочитать из localStorage, иначе — default value
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        // Пробуем распарсить JSON (для объектов/массивов)
        return JSON.parse(stored)
      }
      return typeof defaultValue === 'function' ? defaultValue() : defaultValue
    } catch {
      // Ошибка чтения (например, битый JSON) — fallback на default
      return typeof defaultValue === 'function' ? defaultValue() : defaultValue
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
 * @param {string} key — имя ключа (без префикса)
 */
export function clearLocalStorage(key) {
  localStorage.removeItem(STORAGE_PREFIX + key)
}

/**
 * Утилита: очистить все настройки приложения
 */
export function clearAllAppSettings() {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(STORAGE_PREFIX)) {
      localStorage.removeItem(key)
    }
  })
}
