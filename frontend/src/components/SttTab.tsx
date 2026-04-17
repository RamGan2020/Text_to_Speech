/**
 * SttTab.tsx — Вкладка «Речь в Текст» (OpenAI Whisper small).
 *
 * Два способа ввода аудио:
 *   1. Загрузка файла (MP3, WAV, OGG, FLAC, WEBM) — передаётся напрямую на сервер.
 *   2. Запись с микрофона — WebM → декодирование в WAV → отправка на сервер.
 *
 * Результат распознавания передаётся через коллбэк в App,
 * который рендерит карточку SttResultCard с текстом и кнопкой копирования.
 */
import { useRef, useState } from 'react'
import { Card, Form, Button, Spinner, ProgressBar } from 'react-bootstrap'
import { useRecording } from '../hooks/useRecording'
import { validateAudioFile } from '../utils/fileValidation'

interface SttTabProps {
  globalLoading: boolean;
  onGlobalLoadingChange: (loading: boolean) => void;
  onError: (error: string | null) => void;
  onSetRecognizedText: (text: string) => void;
}

export default function SttTab({ globalLoading, onGlobalLoadingChange, onError, onSetRecognizedText }: SttTabProps) {
  // Ref к input[type=file] — позволяет прочитать выбранный файл и сбросить значение
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Выбранный файл (для отображения размера и информации)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  // Индикатор прогресса для долгих операций (эмуляция)
  const [progress, setProgress] = useState<number>(0)
  // Показывать ли прогресс-бар
  const [showProgress, setShowProgress] = useState<boolean>(false)

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
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // При выборе файла — валидация + сброс предыдущего результата
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      setSelectedFile(null)
      return
    }

    // Определяем формат по расширению
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const validFormats = ['mp3', 'wav', 'ogg', 'flac', 'webm']

    if (!validFormats.includes(ext)) {
      onError?.(`Неподдерживаемый формат: .${ext}. Используйте: ${validFormats.join(', ')}`)
      setSelectedFile(null)
      return
    }

    // Проверяем сигнатуру файла (magic bytes) и размер
    const result = await validateAudioFile(file, ext)
    if (!result.valid) {
      onError?.(result.error || 'Файл не прошёл проверку')
      setSelectedFile(null)
      return
    }

    onError?.(null)
    onSetRecognizedText?.('')
    setSelectedFile(file)
  }

  // === Отправить файл на распознавание (/api/transcribe) ===
  const handleTranscribe = async () => {
    const file = selectedFile
    if (!file) {
      onError?.('Выберите аудио-файл для распознавания')
      return
    }

    onGlobalLoadingChange?.(true)
    onError?.(null)

    // Эмуляция прогресса: транскрипция занимает время, показываем прогресс-бар.
    // Начинаем с 10%, постепенно поднимаем до ~80% за 30 секунд.
    setShowProgress(true)
    setProgress(10)

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + Math.floor(Math.random() * 5) + 1
        return Math.min(next, 80) // Не доходить до 100% до завершения
      })
    }, 2000)

    try {
      const formData = new FormData()
      formData.append('audio', file)

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)
      setProgress(100)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка распознавания')
      }

      const data = await response.json()
      onSetRecognizedText?.(data.text)
    } catch (err: unknown) {
      onError?.((err instanceof Error) ? err.message : 'Произошла ошибка при распознавании')
    } finally {
      onGlobalLoadingChange?.(false)
      // Скрываем прогресс-бар с задержкой для плавного исчезновения
      setTimeout(() => {
        setShowProgress(false)
        setProgress(0)
      }, 500)
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
    setShowProgress(true)
    setProgress(10)

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + Math.floor(Math.random() * 5) + 1
        return Math.min(next, 80)
      })
    }, 2000)

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

      clearInterval(progressInterval)
      setProgress(100)

      if (!resp.ok) {
        const errorData = await resp.json()
        throw new Error(errorData.detail || 'Ошибка распознавания')
      }

      const data = await resp.json()
      onSetRecognizedText?.(data.text)
    } catch (err: unknown) {
      onError?.((err instanceof Error) ? err.message : 'Произошла ошибка при распознавании')
    } finally {
      onGlobalLoadingChange?.(false)
      setTimeout(() => {
        setShowProgress(false)
        setProgress(0)
      }, 500)
    }
  }

  // === Очистить форму STT ===
  const handleSttClear = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
    onSetRecognizedText?.('')
    onError?.(null)
    resetRecording()
    setSelectedFile(null)
    setShowProgress(false)
    setProgress(0)
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

            {/* Информация о выбранном файле (имя + размер) */}
            {selectedFile && (
              <div className="mt-2 p-2 bg-light rounded">
                <strong>📄 {selectedFile.name}</strong>
                <span className="text-muted ms-2">
                  ({(selectedFile.size / 1024).toFixed(1)} КБ)
                </span>
              </div>
            )}
          </Form.Group>

          {/* Прогресс-бар для долгих операций */}
          {showProgress && (
            <div className="mb-3">
              <ProgressBar
                now={progress}
                label={`${progress}%`}
                animated={!globalLoading}
                className="mb-1"
              />
              <small className="text-muted">
                Распознавание может занять до нескольких минут...
              </small>
            </div>
          )}

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
            {selectedFile && (
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
