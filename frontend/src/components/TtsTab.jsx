/**
 * TtsTab.jsx — Вкладка «Текст в Речь» (Silero TTS).
 *
 * Позволяет пользователю:
 *   1. Ввести текст и синтезировать его в MP3-аудио (бэкенд /api/synthesize).
 *   2. Выбрать один из пяти голосов Silero (kseniya, xenia, baya, aidar, eugene).
 *   3. Включить режим подкаста — использовать теги [voice:] и [pause:]
 *      для создания многоголосых сценариев.
 *
 * Стейт-управление:
 *   - Собственное состояние: текст, голос, настройки, локальный audioUrl.
 *   - Глобальный loading получает из App через пропс (для блокировки во время
 *     синтеза аудио из ответа DeepSeek).
 */
import { useState, useRef, useEffect } from 'react'
import { Card, Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap'
import PodcastModePanel from './PodcastModePanel'
import { useLocalStorage } from '../hooks/useLocalStorage'

// Доступные голоса Silero TTS — ключи должны совпадать с бэкендом (tts_service.py).
const SPEAKERS = [
  { value: 'kseniya', label: 'Ксения (женский)' },
  { value: 'xenia', label: 'Ксения (вариант, женский)' },
  { value: 'baya', label: 'Бая (женский)' },
  { value: 'aidar', label: 'Айдар (мужской)' },
  { value: 'eugene', label: 'Евгений (мужской)' },
]

/**
 * TtsTab
 *
 * @param {boolean} props.globalLoading — глобальный флаг загрузки (из App)
 * @param {(v: boolean) => void} props.onGlobalLoadingChange — установить глобальную загрузку
 * @param {(msg: string | null) => void} props.onError — показать ошибку вкладки TTS
 */
export default function TtsTab({ globalLoading, onGlobalLoadingChange, onError }) {
  // Текст, введённый пользователем в textarea
  const [text, setText] = useState('')
  // Blob URL синтезированного MP3 — для аудио-плеера и скачивания
  const [audioUrl, setAudioUrl] = useState(null)

  // Настройки TTS — сохраняются в localStorage для персистентности
  // Голос по умолчанию: kseniya
  const [speaker, setSpeaker] = useLocalStorage('tts-speaker', 'kseniya')
  // Выбранный голос для тега [voice:] в режиме подкаста
  const [templateVoice, setTemplateVoice] = useLocalStorage('tts-template-voice', 'kseniya')
  // Значение паузы для тега [pause:]
  const [pauseTemplateValue, setPauseTemplateValue] = useState('1.0')
  // Опции синтеза — расстановка ударений (put_accent)
  const [putAccent, setPutAccent] = useLocalStorage('tts-put-accent', true)
  // Опции синтеза — автозамена «Е» на «Ё» в нужных позициях
  const [putYo, setPutYo] = useLocalStorage('tts-put-yo', true)
  // Флаг режима подкаста — включает панель PodcastModePanel
  const [podcastMode, setPodcastMode] = useLocalStorage('tts-podcast-mode', false)

  // Максимальная длина текста для синтеза (защита от перегрузки сервера)
  const MAX_TEXT_LENGTH = 5000

  // Ref для textarea — нужен для вставки тегов в позицию курсора
  const textInputRef = useRef(null)

  // Отзываем Blob URL при размонтировании компонента (предотвращаем утечку памяти)
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  // === Обработчик: отправить запрос на синтез речи ===
  const handleSynthesize = async () => {
    if (!text.trim()) {
      onError?.('Введите текст для озвучивания')
      return
    }
    if (text.length > MAX_TEXT_LENGTH) {
      onError?.(`Текст слишком длинный (максимум ${MAX_TEXT_LENGTH.toLocaleString('ru-RU')} символов). Сократите текст и попробуйте снова.`)
      return
    }
    onError?.(null)            // Сброс предыдущей ошибки
    onGlobalLoadingChange?.(true)  // Начинаем загрузку — блокируем интерфейс
    setAudioUrl(null)          // Убираем старый аудио-результат

    try {
      const response = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          speaker,
          put_accent: putAccent,
          put_yo: putYo,
          podcast_mode: podcastMode,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка синтеза')
      }

      // Бэкенд возвращает аудио как binary blob. Создаём URL для плеера.
      const blob = await response.blob()
      setAudioUrl(URL.createObjectURL(blob))
    } catch (err) {
      onError?.(err.message || 'Произошла ошибка при синтезе')
    } finally {
      onGlobalLoadingChange?.(false)
    }
  }

  // === Обработчик: очистить форму ===
  const handleClear = () => {
    setText('')
    setAudioUrl(null)
    onError?.(null)
  }

  // === Скачивание MP3 ===
  // Программный клик по невидимой ссылке <a download="speech.mp3">.
  const handleDownload = () => {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = 'speech.mp3'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // === Утилита: вставить текст в позицию курсора textarea ===
  // Если textarea не виден (ref null), добавляем в конец строки.
  const insertIntoTextAtCursor = (insertText) => {
    const textarea = textInputRef.current
    if (!textarea) {
      setText((prev) => `${prev}${prev ? '\n' : ''}${insertText}`)
      return
    }

    const start = textarea.selectionStart ?? text.length
    const end = textarea.selectionEnd ?? text.length
    const nextText = `${text.slice(0, start)}${insertText}${text.slice(end)}`
    setText(nextText)

    // requestAnimationFrame гарантирует, что React уже обновил DOM
    // — textarea перерисовался с новым текстом, поэтому setSelectionRange сработает.
    requestAnimationFrame(() => {
      textarea.focus()
      const pos = start + insertText.length
      textarea.setSelectionRange(pos, pos)
    })
  }

  // Обработчик кнопки [voice] — вставляет тег [voice:kseniya] в позицию курсора
  const handleInsertVoiceTag = () => {
    insertIntoTextAtCursor(`[voice:${templateVoice}] `)
    onError?.(null)
  }

  // Обработчик кнопки [pause] — вставляет тег [pause:1.0] в позицию курсора
  const handleInsertPauseTag = () => {
    const value = pauseTemplateValue.trim()
    if (!value) {
      onError?.('Введите время паузы (например: 1.5, 1.5s или 500ms)')
      return
    }
    insertIntoTextAtCursor(`[pause:${value}] `)
    onError?.(null)
  }

  // Используем глобальный флаг загрузки (общий для всех вкладок)
  const isLoading = globalLoading

  return (
    <>
      <Card className="shadow-sm">
        <Card.Body>
          {/* Поле ввода текста */}
          <Form.Group className="mb-3">
            <Form.Label>Текст</Form.Label>
            <Form.Control
              as="textarea"
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Введите текст, который хотите озвучить..."
              style={{ resize: 'vertical', minHeight: '200px' }}
              ref={textInputRef}
            />
            <Form.Text className={`text-muted ${text.length > MAX_TEXT_LENGTH ? 'text-danger fw-bold' : text.length > MAX_TEXT_LENGTH * 0.8 ? 'text-warning fw-bold' : ''}`}>
              Символов: {text.length} / {MAX_TEXT_LENGTH.toLocaleString('ru-RU')}
              {text.length > MAX_TEXT_LENGTH && ' — Превышен лимит!'}
            </Form.Text>
          </Form.Group>

          {/* Настройки: голос (слева) и переключатели (справа) */}
          <Row className="mb-3">
            <Col xs={12} md={6}>
              <Form.Group>
                <Form.Label>Голос</Form.Label>
                <Form.Select value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
                  {SPEAKERS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col xs={12} md={6}>
              <Form.Group className="d-flex flex-column justify-content-center h-100">
                <Form.Check
                  type="switch"
                  id="put-accent"
                  label="Расстановка ударений"
                  checked={putAccent}
                  onChange={(e) => setPutAccent(e.target.checked)}
                  className="mb-2"
                />
                <Form.Check
                  type="switch"
                  id="put-yo"
                  label="Расстановка буквы Ё"
                  checked={putYo}
                  onChange={(e) => setPutYo(e.target.checked)}
                />
                <Form.Check
                  type="switch"
                  id="podcast-mode"
                  label="Режим подкаста"
                  checked={podcastMode}
                  onChange={(e) => setPodcastMode(e.target.checked)}
                  className="mt-2"
                />
              </Form.Group>
            </Col>
          </Row>

          {/* Панель подкаста — появляется только при podcastMode=true */}
          {podcastMode && (
            <>
              <Alert variant="info" className="mb-3">
                В режиме подкаста можно использовать теги, например:{' '}
                <code>[voice:aidar]</code> Текст... <code>[pause:1.5]</code>
              </Alert>
              <PodcastModePanel
                speakers={SPEAKERS}
                templateVoice={templateVoice}
                onTemplateVoiceChange={(e) => setTemplateVoice(e.target.value)}
                pauseTemplateValue={pauseTemplateValue}
                onPauseTemplateValueChange={(e) => setPauseTemplateValue(e.target.value)}
                onInsertVoiceTag={handleInsertVoiceTag}
                onInsertPauseTag={handleInsertPauseTag}
                onInsertExample={setText}
                loading={isLoading}
              />
            </>
          )}

          {/* Кнопки управления: Обработать / Очистить */}
          <div className="d-grid gap-2">
            <Button
              variant="primary"
              onClick={handleSynthesize}
              disabled={isLoading}
              size="lg"
            >
              {isLoading ? (
                <>
                  <Spinner as="span" animation="border" size="sm" role="status" className="me-2" />
                  Синтез...
                </>
              ) : (
                'Обработать'
              )}
            </Button>
            <Button
              variant="outline-secondary"
              onClick={handleClear}
              disabled={isLoading}
            >
              Очистить
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* Карточка результата — аудио-плеер + кнопка скачивания */}
      {audioUrl && (
        <Card className="shadow-sm mt-3">
          <Card.Body>
            <h5 className="card-title">Результат</h5>
            <audio controls src={audioUrl} className="w-100 mb-3">
              Ваш браузер не поддерживает аудио элемент.
            </audio>
            <div className="d-grid">
              <Button variant="success" onClick={handleDownload}>
                Скачать MP3
              </Button>
            </div>
          </Card.Body>
        </Card>
      )}
    </>
  )
}
