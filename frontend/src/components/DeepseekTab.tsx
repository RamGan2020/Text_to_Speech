/**
 * DeepseekTab.jsx — Вкладка «DeepSeek AI» (чат-ассистент).
 *
 * Позволяет задать вопрос модели DeepSeek через API бэкенда.
 * Модель и системный промпт выбираются из выпадающих списков.
 * API-ключ вводится пользователем и передаётся в теле запроса (не сохраняется на сервере).
 *
 * Ключевая фича: кнопка «Озвучить ответ» синтезирует текст ответа в речь,
 * создаёт аудио Blob URL и переключает пользователя на вкладку TTS
 * (через коллбэк onSwitchToTts) — там аудио можно прослушать и скачать.
 */
import { useState } from 'react'
import { Card, Form, Button, Spinner, Row, Col } from 'react-bootstrap'
import { useLocalStorage } from '../hooks/useLocalStorage'

// Тип для моделей DeepSeek API
type DeepSeekModel = 'deepseek-chat' | 'deepseek-reasoner'

// Доступные модели DeepSeek API
const DEEPSEEK_MODELS: { value: DeepSeekModel; label: string }[] = [
  { value: 'deepseek-chat', label: 'deepseek-chat (быстрая)' },
  { value: 'deepseek-reasoner', label: 'deepseek-reasoner (рассуждения)' },
]

// Предустановленные системные промпты (роли ассистента)
const DEEPSEEK_SYSTEM_PROMPTS = [
  { value: '', label: '— Без системного промпта —' },
  {
    value: 'Ты — полезный ассистент. Отвечай на вопросы кратко, по делу и на русском языке.',
    label: 'Полезный ассистент (по умолчанию)',
  },
  {
    value: 'Ты — эксперт по программированию. Давай подробные, структурированные ответы с примерами кода.',
    label: 'Эксперт по программированию',
  },
  {
    value: 'Ты — преподаватель. Объясняй сложные понятия простым языком, с примерами из жизни.',
    label: 'Преподаватель',
  },
  {
    value: 'Ты — копирайтер. Пиши тексты в маркетингом стиле, убедительно и энергично.',
    label: 'Копирайтер',
  },
]

interface DeepseekTabProps {
  globalLoading: boolean;
  onGlobalLoadingChange: (loading: boolean) => void;
  onError: (error: string | null) => void;
  onSwitchToTts: (audioUrl: string) => void;
}

export default function DeepseekTab({
  globalLoading,
  onGlobalLoadingChange,
  onError,
  onSwitchToTts,
}: DeepseekTabProps) {
  // API-ключ DeepSeek — хранится в компоненте, не отправляется на сервер отдельно.
  // При запросе передаётся в теле JSON (бэкенд создаёт OpenAI SDK client).
  const [apiKey, setApiKey] = useState<string>('')
  // Текст вопроса
  const [question, setQuestion] = useState<string>('')
  // Текст ответа от DeepSeek — отображается в textarea для чтения/копирования
  const [answer, setAnswer] = useState<string>('')
  // Локальный флаг загрузки для запроса к DeepSeek (не блокирует остальной интерфейс)
  const [loading, setLoading] = useState<boolean>(false)
  // Локальная ошибка (не пересекается с onError — это для UI-сообщений компонента)
  const [localError, setLocalError] = useState<string | null>(null)
  // Модель DeepSeek — сохраняется в localStorage для персистентности
  const [model, setModel] = useLocalStorage<DeepSeekModel>('ds-model', 'deepseek-chat')
  // Системный промпт — сохраняется в localStorage (выбранная роль ассистента)
  const [systemPrompt, setSystemPrompt] = useLocalStorage<string>('ds-system-prompt', '')

  // Блокировка кнопки «Озвучить ответ» — учитывает как локальную, так и глобальную загрузку
  const isLoading = loading || globalLoading

  // === Отправить вопрос к DeepSeek (/api/ask_deepseek) ===
  const handleAsk = async () => {
    if (!question.trim()) {
      setLocalError('Введите вопрос')
      return
    }

    setLoading(true)
    setLocalError(null)
    setAnswer('')   // Очищаем предыдущий ответ

    try {
      const response = await fetch('/api/ask_deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          api_key: apiKey || undefined,     // Пустой ключ → бэкенд использует значение по умолчанию
          system_prompt: systemPrompt || undefined,
          model,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка запроса к DeepSeek')
      }

      const data = await response.json()
      setAnswer(data.answer)
    } catch (err: unknown) {
      setLocalError((err instanceof Error) ? err.message : 'Произошла ошибка при запросе к DeepSeek')
    } finally {
      setLoading(false)
    }
  }

  // === Озвучить ответ DeepSeek ===
  // 1. Синтезирует ответ в MP3 (/api/synthesize).
  // 2. Создаёт Blob URL.
  // 3. Вызывает onSwitchToTts(audioUrl) — App переключает вкладку на TTS и показывает результат.
  const handleSynthesizeAnswer = async () => {
    if (!answer) {
      onError?.('Нет ответа для озвучивания')
      return
    }

    onGlobalLoadingChange?.(true)
    onError?.(null)

    try {
      const response = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: answer,
          speaker: 'kseniya',     // Жёстко заданный голос по умолчанию
          put_accent: true,
          put_yo: true,
          podcast_mode: false,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка синтеза')
      }

      const blob = await response.blob()
      const audioUrl = URL.createObjectURL(blob)

      if (onSwitchToTts) {
        onSwitchToTts(audioUrl)
      }
    } catch (err: unknown) {
      onError?.((err instanceof Error) ? err.message : 'Произошла ошибка при синтезе')
    } finally {
      onGlobalLoadingChange?.(false)
    }
  }

  // === Очистить форму ===
  const handleClear = () => {
    setQuestion('')
    setAnswer('')
    setLocalError(null)
  }

  // Копировать текст ответа в буфер обмена (Clipboard API)
  const handleCopy = () => {
    navigator.clipboard.writeText(answer)
  }

  return (
    <>
      <Card className="shadow-sm">
        <Card.Body>
          {/* Поле ввода API-ключа */}
          <Form.Group className="mb-3">
            <Form.Label>API-ключ DeepSeek</Form.Label>
            <Form.Control
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
            <Form.Text className="text-muted">
              Ключ не сохраняется. Получите на{' '}
              <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer">
                platform.deepseek.com
              </a>
            </Form.Text>
          </Form.Group>

          {/* Настройки: модель и системный промпт в одну строку */}
          <Row className="mb-3">
            <Col xs={12} md={6}>
              <Form.Group>
                <Form.Label>Модель</Form.Label>
                <Form.Select value={model} onChange={(e) => setModel(e.target.value as DeepSeekModel)}>
                  {DEEPSEEK_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col xs={12} md={6}>
              <Form.Group>
                <Form.Label>Системный промпт</Form.Label>
                <Form.Select value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}>
                  {DEEPSEEK_SYSTEM_PROMPTS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
          </Row>

          {/* Поле ввода вопроса */}
          <Form.Group className="mb-3">
            <Form.Label>Вопрос</Form.Label>
            <Form.Control
              as="textarea"
              rows={5}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Задайте вопрос..."
              style={{ resize: 'vertical', minHeight: '120px' }}
            />
          </Form.Group>

          {/* Кнопки: Задать вопрос / Очистить */}
          <div className="d-grid gap-2">
            <Button
              variant="primary"
              onClick={handleAsk}
              disabled={loading}
              size="lg"
            >
              {loading ? (
                <>
                  <Spinner
                    as="span"
                    animation="border"
                    size="sm"
                    role="status"
                    className="me-2"
                  />
                  Запрос...
                </>
              ) : (
                'Задать вопрос'
              )}
            </Button>
            <Button
              variant="outline-secondary"
              onClick={handleClear}
              disabled={loading}
            >
              Очистить
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* Карточка с ответом DeepSeek */}
      {answer && (
        <Card className="shadow-sm mt-3">
          <Card.Body>
            <h5 className="card-title">Ответ DeepSeek</h5>
            <Form.Control
              as="textarea"
              rows={10}
              value={answer}
              readOnly
              style={{ resize: 'vertical', minHeight: '200px' }}
              className="mb-3"
            />
            <div className="d-grid gap-2">
              {/* Копировать ответ в буфер */}
              <Button variant="info" onClick={handleCopy}>
                Копировать
              </Button>
              {/* Озвучить ответ — синтезирует текст и переключает на вкладку TTS */}
              <Button
                variant="success"
                onClick={handleSynthesizeAnswer}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Spinner
                      as="span"
                      animation="border"
                      size="sm"
                      className="me-2"
                    />
                    Синтез...
                  </>
                ) : (
                  'Озвучить ответ'
                )}
              </Button>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Локальное сообщение об ошибке (отдельный блок, не через Alert) */}
      {localError && (
        <div className="text-danger mt-2">{localError}</div>
      )}
    </>
  )
}