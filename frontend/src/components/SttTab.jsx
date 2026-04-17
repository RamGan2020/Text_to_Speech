/**
 * SttTab.jsx — Вкладка «Речь в Текст» (OpenAI Whisper small).
 *
 * Два способа ввода аудио:
 *   1. Загрузка файла (MP3, WAV, OGG, FLAC, WEBM) — передаётся напрямую на сервер.
 *   2. Запись с микрофона — WebM → декодирование в WAV → отправка на сервер.
 *
 * Результат распознавания передаётся через коллбэк в App,
 * который рендерит карточку SttResultCard с текстом и кнопкой копирования.
 */
import { useRef } from 'react'
import { Card, Form, Button, Spinner } from 'react-bootstrap'
import { useRecording } from '../hooks/useRecording'

/**
 * SttTab
 *
 * @param {boolean} props.globalLoading — глобальный флаг загрузки
 * @param {(v: boolean) => void} props.onGlobalLoadingChange — установить глобальную загрузку
 * @param {(msg: string | null) => void} props.onError — показать ошибку вкладки STT
 * @param {(text: string) => void} props.onSetRecognizedText — передать распознанный текст в App
 */
export default function SttTab({ globalLoading, onGlobalLoadingChange, onError, onSetRecognizedText }) {
  // Ref к input[type=file] — позволяет прочитать выбранный файл и сбросить значение
  const fileInputRef = useRef(null)

  // Хук useRecording инкапсулирует всю логику записи микрофона:
  // запрос доступа, MediaRecorder, конвертация WebM → WAV, управление Blob URL
  const {
    micState,          // 'idle' | 'requesting' | 'recording'
    recordedBlobUrl,   // Blob URL готового WAV — для плеера и отправки на сервер
    recordingTime,     // длительность записи в секундах (для таймера)
    startRecording,    // начать запись
    stopRecording,     // остановить запись (триггерит .onstop → обработка)
    resetRecording,    // сбросить результат (отменяет Blob URL и стейт)
  } = useRecording(onError)

  // Форматирует секунды в MM:SS (например, 75 → "01:15")
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // При выборе файла сбрасываем ошибку и предыдущий результат
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      onError?.(null)
      onSetRecognizedText?.('')
    }
  }

  // === Отправить файл на распознавание (/api/transcribe) ===
  const handleTranscribe = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      onError?.('Выберите аудио-файл для распознавания')
      return
    }

    onGlobalLoadingChange?.(true)
    onError?.(null)

    try {
      const formData = new FormData()
      formData.append('audio', file)

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка распознавания')
      }

      const data = await response.json()
      onSetRecognizedText?.(data.text)
    } catch (err) {
      onError?.(err.message || 'Произошла ошибка при распознавании')
    } finally {
      onGlobalLoadingChange?.(false)
    }
  }

  // === Отправить запись с микрофона на распознавание ===
  // recordedBlobUrl — Blob URL WAV-файла. Сначала fetch'им оттуда Blob,
  // затем кладём в FormData и отправляем на тот же эндпоинт.
  const handleTranscribeRecording = async () => {
    if (!recordedBlobUrl) {
      onError?.('Нет записанного аудио')
      return
    }

    onGlobalLoadingChange?.(true)
    onError?.(null)

    try {
      // Получаем реальный Blob по Blob URL
      const response = await fetch(recordedBlobUrl)
      const blob = await response.blob()
      const formData = new FormData()
      formData.append('audio', blob, 'recording.wav')

      const resp = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!resp.ok) {
        const errorData = await resp.json()
        throw new Error(errorData.detail || 'Ошибка распознавания')
      }

      const data = await resp.json()
      onSetRecognizedText?.(data.text)
    } catch (err) {
      onError?.(err.message || 'Произошла ошибка при распознавании')
    } finally {
      onGlobalLoadingChange?.(false)
    }
  }

  // === Очистить форму STT ===
  const handleSttClear = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
    onSetRecognizedText?.('')
    onError?.(null)
    resetRecording()
  }

  return (
    <>
      <Card className="shadow-sm">
        <Card.Body>
          {/* Зона загрузки файла */}
          <Form.Group className="mb-3">
            <Form.Label>Аудио-файл</Form.Label>
            <Form.Control
              type="file"
              accept=".mp3,.wav,.ogg,.flac,.webm"
              onChange={handleFileChange}
              ref={fileInputRef}
            />
            <Form.Text className="text-muted">
              Поддерживаются форматы: MP3, WAV, OGG, FLAC, WEBM
            </Form.Text>
          </Form.Group>

          {/* Зона записи с микрофона */}
          <Form.Group className="mb-3">
            <Form.Label>Запись с микрофона</Form.Label>

            <div className="d-flex align-items-center gap-3 mb-3">
              {/* Кнопка «Начать запись» — показана только когда ничего не происходит */}
              {micState === 'idle' && !recordedBlobUrl && (
                <Button
                  variant="outline-danger"
                  onClick={startRecording}
                  disabled={globalLoading}
                >
                  🎤 Начать запись
                </Button>
              )}

              {/* Спиннер «Доступ...» — браузер ещё не ответил на getUserMedia */}
              {micState === 'requesting' && (
                <Button variant="outline-secondary" disabled>
                  <Spinner
                    as="span"
                    animation="border"
                    size="sm"
                    className="me-2"
                  />
                  Доступ...
                </Button>
              )}

              {/* Индикатор активной записи: пульсирующий круг + таймер + кнопка «Остановить» */}
              {micState === 'recording' && (
                <>
                  <div className="recording-indicator">
                    <div className="pulse-circle"></div>
                  </div>
                  <span className="recording-time">{formatTime(recordingTime)}</span>
                  <Button variant="danger" onClick={stopRecording}>
                    ⏹ Остановить
                  </Button>
                </>
              )}

              {/* Бейдж с длительностью + кнопка сброса (после записи, до отправки) */}
              {recordedBlobUrl && micState === 'idle' && (
                <>
                  <span className="badge bg-success">
                    ✓ {formatTime(recordingTime)}
                  </span>
                  <Button
                    variant="outline-secondary"
                    onClick={resetRecording}
                    size="sm"
                  >
                    ✕
                  </Button>
                </>
              )}
            </div>

            {/* Аудио-плеер для прослушивания записанного перед отправкой */}
            {recordedBlobUrl && micState === 'idle' && (
              <audio
                controls
                src={recordedBlobUrl}
                className="w-100 mb-3"
              >
                Ваш браузер не поддерживает аудио элемент.
              </audio>
            )}
          </Form.Group>

          {/* Кнопки действий */}
          <div className="d-grid gap-2">
            {/* «Распознать файл» — показана только если файл выбран */}
            {fileInputRef.current?.files?.[0] && (
              <Button
                variant="primary"
                onClick={handleTranscribe}
                disabled={globalLoading}
                size="lg"
              >
                {globalLoading ? (
                  <>
                    <Spinner
                      as="span"
                      animation="border"
                      size="sm"
                      role="status"
                      className="me-2"
                    />
                    Распознавание...
                  </>
                ) : (
                  'Распознать файл'
                )}
              </Button>
            )}

            {/* «Распознать запись» — показана после записи микрофона */}
            {recordedBlobUrl && (
              <Button
                variant="success"
                onClick={handleTranscribeRecording}
                disabled={globalLoading}
                size="lg"
              >
                {globalLoading ? (
                  <>
                    <Spinner
                      as="span"
                      animation="border"
                      size="sm"
                      role="status"
                      className="me-2"
                    />
                    Распознавание...
                  </>
                ) : (
                  'Распознать запись'
                )}
              </Button>
            )}

            {/* Кнопка очистки — неактивна во время активной записи */}
            <Button
              variant="outline-secondary"
              onClick={handleSttClear}
              disabled={globalLoading || micState === 'recording'}
            >
              Очистить
            </Button>
          </div>
        </Card.Body>
      </Card>
    </>
  )
}
