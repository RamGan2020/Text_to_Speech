/**
 * VoiceCloneTab.tsx — Вкладка «Мой голос»: клонирование голоса через XTTS v2.
 *
 * Позволяет пользователю:
 *   1. Загрузить (или записать с микрофона) образец голоса 6–30 секунд
 *      чистой речи — бэкенд сохраняет его и возвращает voice_id.
 *   2. Увидеть список зарегистрированных голосов и удалить лишние.
 *   3. Проверить голос — синтезировать тестовую фразу и прослушать.
 *
 * Зарегистрированные голоса доступны в TtsTab как опции «★ <имя> (клон)»
 * и в подкасте через тег [voice:clone:<voice_id>].
 *
 * Стейт-управление: список голосов хранится в App и передаётся пропсами,
 * чтобы TtsTab сразу видел новые голоса после регистрации.
 */
import { useState, useEffect } from 'react'
import { Card, Form, Button, Spinner, Row, Col } from 'react-bootstrap'
import { useRecording } from '../hooks/useRecording'
import { validateAudioFile } from '../utils/fileValidation'
import type { VoiceInfo } from '../types/api'

interface VoiceCloneTabProps {
  voices: VoiceInfo[];
  /** Перезагрузить список голосов из бэкенда (после регистрации/удаления) */
  onVoicesChanged: () => void;
  globalLoading: boolean;
  onGlobalLoadingChange: (loading: boolean) => void;
  onError: (error: string | null) => void;
}

export default function VoiceCloneTab({
  voices,
  onVoicesChanged,
  globalLoading,
  onGlobalLoadingChange,
  onError,
}: VoiceCloneTabProps) {
  // Имя нового голоса (сохраняется в реестре бэкенда)
  const [voiceName, setVoiceName] = useState<string>('')
  // Файл, выбранный через input[type=file]
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  // Локальный URL тестового синтеза (аудио-плеер «проверки» голоса)
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null)
  // Текст для тестового синтеза
  const [testText, setTestText] = useState<string>('Привет! Это мой клонированный голос.')

  // Хук записи с микрофона — WAV получается готовым к отправке
  const {
    micState,
    recordedBlob,
    recordedBlobUrl,
    recordingTime,
    startRecording,
    stopRecording,
    resetRecording,
  } = useRecording((msg) => onError(msg))

  // Локальный флаг загрузки регистрации/удаления/проверки
  const [busy, setBusy] = useState<boolean>(false)

  // Локальный busy дублируем в глобальный loading — блокируем другие вкладки
  // во время тяжёлых операций (синтез XTTS на CPU занимает десятки секунд)
  useEffect(() => {
    onGlobalLoadingChange?.(busy)
  }, [busy, onGlobalLoadingChange])

  const isLoading = globalLoading || busy

  // Отзываем Blob URL тестового аудио при размонтировании (защита от утечки памяти)
  useEffect(() => {
    return () => {
      if (testAudioUrl) URL.revokeObjectURL(testAudioUrl)
    }
  }, [testAudioUrl])

  // === Регистрация голоса: общий обработчик для файла и записи с микрофона ===
  const handleRegister = async (file: File) => {
    onError?.(null)
    setBusy(true)
    try {
      // Клиентская валидация: magic bytes + размер (как в STT)
      const ext = file.name.split('.').pop()?.toLowerCase() || 'wav'
      const check = await validateAudioFile(file, ext)
      if (!check.valid) {
        onError?.(check.error || 'Некорректный аудио-файл')
        return
      }

      const formData = new FormData()
      formData.append('audio', file)
      if (voiceName.trim()) formData.append('name', voiceName.trim())

      const response = await fetch('/api/voices/register', {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка регистрации голоса')
      }
      const result = await response.json()
      onVoicesChanged?.()          // Обновляем список в App → появится в TtsTab
      setSelectedFile(null)        // Сбрасываем форму
      resetRecording()
      setVoiceName('')
      onError?.(null)
      // Тост об успехе придёт через родителя? Нет — показываем через onError нельзя,
      // поэтому успех отображаем появлением голоса в списке ниже.
      void result
    } catch (err: unknown) {
      onError?.(err instanceof Error ? err.message : 'Произошла ошибка при регистрации голоса')
    } finally {
      setBusy(false)
    }
  }

  // Кнопка «Сохранить голос» — приоритет: выбранный файл, иначе запись с микрофона
  const handleRegisterClick = () => {
    if (selectedFile) {
      handleRegister(selectedFile)
    } else if (recordedBlob) {
      handleRegister(new File([recordedBlob], 'recording.wav', { type: 'audio/wav' }))
    } else {
      onError?.('Выберите аудио-файл или запишите речь с микрофона')
    }
  }

  // === Удаление голоса ===
  const handleDelete = async (voiceId: string) => {
    onError?.(null)
    setBusy(true)
    try {
      const response = await fetch(`/api/voices/${voiceId}`, { method: 'DELETE' })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка удаления голоса')
      }
      onVoicesChanged?.()
    } catch (err: unknown) {
      onError?.(err instanceof Error ? err.message : 'Произошла ошибка при удалении')
    } finally {
      setBusy(false)
    }
  }

  // === Проверка голоса: тестовый синтез ===
  const handleTest = async (voiceId: string) => {
    if (!testText.trim()) {
      onError?.('Введите текст для проверки голоса')
      return
    }
    onError?.(null)
    setBusy(true)
    try {
      const response = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testText,
          speaker: 'kseniya',     // Игнорируется — есть voice_id
          put_accent: true,
          put_yo: true,
          podcast_mode: false,
          english_mode: 'voice',
          voice_id: voiceId,
        }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка синтеза')
      }
      if (testAudioUrl) URL.revokeObjectURL(testAudioUrl)  // Старый URL отзываем
      const blob = await response.blob()
      setTestAudioUrl(URL.createObjectURL(blob))
    } catch (err: unknown) {
      onError?.(err instanceof Error ? err.message : 'Произошла ошибка при проверке голоса')
    } finally {
      setBusy(false)
    }
  }

  const formatDuration = (sec?: number) =>
    sec === undefined ? '' : ` · ${Math.round(sec)} сек`

  return (
    <>
      {/* ===== Карточка регистрации нового голоса ===== */}
      <Card className="shadow-sm">
        <Card.Body>
          <h5 className="card-title">Новый голос</h5>
          <Form.Text className="text-muted d-block mb-3">
            Запишите 6–30 секунд чистой речи без музыки и посторонних шумов —
            чем чище образец, тем точнее клонирование.
          </Form.Text>

          <Form.Group className="mb-3">
            <Form.Label>Имя голоса (необязательно)</Form.Label>
            <Form.Control
              type="text"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              placeholder="Например: «Мой голос»"
            />
          </Form.Group>

          <Row className="mb-3">
            {/* Вариант 1: загрузка файла */}
            <Col xs={12} md={6} className="mb-3 mb-md-0">
              <Form.Label>Загрузить файл (MP3, WAV, OGG, FLAC, WEBM)</Form.Label>
              <Form.Control
                type="file"
                accept=".mp3,.wav,.ogg,.flac,.webm,audio/*"
                onChange={(e) => setSelectedFile((e.target as HTMLInputElement).files?.[0] ?? null)}
              />
              {selectedFile && (
                <Form.Text className="text-muted d-block">
                  Выбран: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)} МБ)
                </Form.Text>
              )}
            </Col>

            {/* Вариант 2: запись с микрофона */}
            <Col xs={12} md={6}>
              <Form.Label>Или записать с микрофона</Form.Label>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                {micState !== 'recording' ? (
                  <Button
                    variant="outline-primary"
                    onClick={startRecording}
                    disabled={isLoading}
                    size="sm"
                  >
                    🎤 Начать запись
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    onClick={stopRecording}
                    size="sm"
                  >
                    ⏹ Остановить ({recordingTime} с)
                  </Button>
                )}
                {recordedBlob && micState !== 'recording' && (
                  <Button
                    variant="outline-secondary"
                    onClick={resetRecording}
                    disabled={isLoading}
                    size="sm"
                  >
                    Сбросить запись
                  </Button>
                )}
              </div>
              {recordedBlobUrl && micState !== 'recording' && (
                <audio controls src={recordedBlobUrl} className="w-100 mt-2" />
              )}
            </Col>
          </Row>

          <div className="d-grid">
            <Button
              variant="primary"
              onClick={handleRegisterClick}
              disabled={isLoading}
              size="lg"
            >
              {busy ? (
                <>
                  <Spinner as="span" animation="border" size="sm" role="status" className="me-2" />
                  Сохранение...
                </>
              ) : (
                'Сохранить голос'
              )}
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* ===== Карточка списка голосов ===== */}
      <Card className="shadow-sm mt-3">
        <Card.Body>
          <h5 className="card-title">Мои голоса</h5>
          {voices.length === 0 ? (
            <Form.Text className="text-muted">
              Пока нет зарегистрированных голосов. Сохраните первый образец выше —
              он появится в списке голосов на вкладке «Текст в речь»
              и в тегах подкаста как <code>[voice:clone:{'<id>'}]</code>.
            </Form.Text>
          ) : (
            <>
              {/* Текст для проверки голоса */}
              <Form.Group className="mb-3">
                <Form.Label>Текст для проверки</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                />
              </Form.Group>

              {voices.map((voice) => (
                <Card key={voice.voice_id} className="mb-2 border">
                  <Card.Body className="py-2">
                    <Row className="align-items-center g-2">
                      <Col xs={12} sm>
                        <strong>★ {voice.name}</strong>
                        {formatDuration(voice.duration_sec)}
                        <Form.Text className="text-muted d-block">
                          <code>clone:{voice.voice_id.slice(0, 8)}…</code>
                        </Form.Text>
                      </Col>
                      <Col xs="auto">
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={() => handleTest(voice.voice_id)}
                          disabled={isLoading}
                        >
                          Проверить
                        </Button>{' '}
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleDelete(voice.voice_id)}
                          disabled={isLoading}
                        >
                          Удалить
                        </Button>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              ))}
            </>
          )}

          {/* Плеер результата проверки */}
          {testAudioUrl && (
            <div className="mt-3">
              <h6>Результат проверки</h6>
              <audio controls src={testAudioUrl} className="w-100 mb-2" />
            </div>
          )}
        </Card.Body>
      </Card>
    </>
  )
}
