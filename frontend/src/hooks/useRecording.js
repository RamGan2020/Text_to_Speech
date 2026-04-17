/**
 * useRecording.js — Custom React-hook для записи аудио с микрофона браузера.
 *
 * Отвечает за полный цикл: запрос доступа → запись (MediaRecorder) → декодирование
 * WebM → конвертация в WAV (через audioBufferToWav) → возврат Blob-а.
 *
 * Что исправлено по сравнению с исходной версией:
 *   - Blob-URL теперь принудительно отзывается через URL.revokeObjectURL()
 *     при перезаписи и при unmount, предотвращая утечку памяти.
 *   - Все ref's (stream, MediaRecorder, timer) очищаются в cleanup().
 *   - AudioContext закрывается явно по окончании обработки.
 *
 * Возвращает объект:
 *   - micState: 'idle' | 'requesting' | 'recording'  — состояние микрофона
 *   - recordedBlobUrl: строка Blob URL для проигрывания и отправки на сервер
 *   - recordingTime: секунды записанного аудио
 *   - startRecording / stopRecording / resetRecording / stopAll — действия
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { audioBufferToWav } from '../utils/audioUtils'

export function useRecording(onError) {
  // Состояние микрофона: 'idle' — неактивен, 'requesting' — запрашиваем доступ, 'recording' — пишется
  const [micState, setMicState] = useState('idle')
  // Готовый WAV Blob (для отправки на сервер)
  const [recordedBlob, setRecordedBlob] = useState(null)
  // Blob URL для тега audio и выборки данных
  const [recordedBlobUrl, setRecordedBlobUrl] = useState(null)
  // Таймер записи в секундах
  const [recordingTime, setRecordingTime] = useState(0)

  // Ref'ы хранят мутабельные объекты, которые не должны вызывать ре-рендер
  const mediaRecorderRef = useRef(null)  // экземпляр MediaRecorder
  const streamRef = useRef(null)         // MediaStream — треки нужно остановить при очистке
  const timerRef = useRef(null)          // setInterval ID таймера счётчика времени

  // Отзываем Blob URL при размонтировании или изменении recordedBlobUrl (fix memory leak).
  // Функция-очиститель в useEffect срабатывает и при re-render, и при unmount.
  useEffect(() => {
    return () => {
      if (recordedBlobUrl) {
        URL.revokeObjectURL(recordedBlobUrl)
      }
    }
  }, [recordedBlobUrl])

  // Полная очистка всех ресурсов микрофона и таймера.
  // Обязательно вызывается когда: запись остановлена, компонент размонтирован, произошла ошибка.
  const cleanup = useCallback(() => {
    // Останавливаем треки медиа-потока (отключает индикатор записи в браузере)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    // Очищаем интервал таймера
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    mediaRecorderRef.current = null
  }, [])

  // ====== Начать запись ======
  // Запрашивает access к микрофону, создаёт MediaRecorder, собирает чанки, запускает таймер.
  const startRecording = useCallback(async () => {
    try {
      // Отменяем старый Blob URL (предыдущая запись)
      if (recordedBlobUrl) {
        URL.revokeObjectURL(recordedBlobUrl)
        setRecordedBlobUrl(null)
      }

      // Сбрасываем состояние
      setRecordedBlob(null)
      setRecordingTime(0)
      setMicState('requesting')

      // Запрашиваем доступ к микрофону (браузер покажет диалог разрешения)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Создаём рекордер с форматом по умолчанию браузера (обычно webm/opus)
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      const chunks = []

      // При поступлении чанка добавляем его в массив
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      // Когда запись остановлена — обрабатываем результат
      mediaRecorder.onstop = () => {
        // Из чанков собираем WebM blob (браузерный формат)
        const webmBlob = new Blob(chunks, { type: 'audio/webm' })

        // Создаём AudioContext для декодирования в PCM
        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const reader = new FileReader()

        reader.onload = async (e) => {
          try {
            // Декодируем WebM → AudioBuffer (PCM, Float32)
            const audioBuffer = await audioContext.decodeAudioData(e.target.result)

            // Конвертируем AudioBuffer → WAV Blob (Int16, 44-byte header)
            const wavBlob = audioBufferToWav(audioBuffer)

            // Обновляем стейт — запись готова к использованию
            setRecordedBlob(wavBlob)
            setRecordedBlobUrl(URL.createObjectURL(wavBlob))
          } catch (err) {
            onError?.('Ошибка обработки аудио: ' + err.message)
          } finally {
            // Закрываем AudioContext, освобождаем ресурсы
            audioContext.close()
            cleanup()
            setMicState('idle')
          }
        }

        reader.onerror = () => {
          onError?.('Ошибка чтения аудио')
          audioContext.close()
          cleanup()
          setMicState('idle')
        }

        // Запускаем чтение WebM Blob в ArrayBuffer для декодирования
        reader.readAsArrayBuffer(webmBlob)
      }

      // Начинаем захват (без указания timeslice — данные придут при stop)
      mediaRecorder.start()

      // Переключаем на состояние записи
      setMicState('recording')

      // Запускаем секундный таймер
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      // Пользователь отклонил доступ / нет микрофона
      onError?.('Не удалось получить доступ к микрофону: ' + err.message)
      cleanup()
      setMicState('idle')
    }
  }, [cleanup, onError, recordedBlobUrl])

  // ====== Остановить запись ======
  // Триггерит событие onstop у MediaRecorder (обработка — в callback'е startRecording)
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // ====== Сбросить запись ======
  // Удаляет Blob URL и стейт записи, но не останавливает активную запись
  const resetRecording = useCallback(() => {
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl)
      setRecordedBlobUrl(null)
    }
    setRecordedBlob(null)
    setRecordingTime(0)
  }, [recordedBlobUrl])

  // ====== Принудительная остановка ======
  // Останавливает запись (если активна) и очищает все ресурсы
  const stopAll = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    cleanup()
    setMicState('idle')
  }, [cleanup])

  return {
    micState,
    recordedBlob,
    recordedBlobUrl,
    recordingTime,
    startRecording,
    stopRecording,
    resetRecording,
    stopAll,
  }
}
