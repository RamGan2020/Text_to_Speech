/**
 * TtsTab.tsx — Вкладка «Текст в Речь» (Silero TTS / клонированный голос).
 *
 * Позволяет пользователю:
 *   1. Ввести текст и синтезировать его в MP3-аудио (бэкенд /api/synthesize).
 *   2. Выбрать один из пяти голосов Silero (kseniya, xenia, baya, aidar, eugene)
 *      или клонированный голос из вкладки «Мой голос» (значение clone:<voice_id>).
 *   3. Включить режим подкаста — использовать теги [voice:] и [pause:]
 *      для создания многоголосых сценариев.
 *   4. Выбрать, как читать английские слова — английским голосом,
 *      подобранным под диктора, или тем же голосом (транслитерация).
 *
 * Стейт-управление:
 *   - Собственное состояние: текст, голос, настройки, локальный audioUrl.
 *   - Глобальный loading получает из App через пропс (для блокировки во время
 *     синтеза аудио из ответа DeepSeek).
 *   - Список клонированных голосов приходит пропсом из App.
 */
import { useState, useRef, useEffect } from 'react'
import { Card, Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap'
import PodcastModePanel from './PodcastModePanel'
import SsmlHelpModal from './SsmlHelpModal'
import { useLocalStorage } from '../hooks/useLocalStorage'
import type { EnglishMode, SpeakerOption, VoiceInfo } from '../types/api'

// Доступные голоса Silero TTS — ключи должны совпадать с бэкендом (tts_service.py).
// Клонированные голоса добавляются динамически из пропса voices (значения clone:<id>).
const SPEAKERS: SpeakerOption[] = [
  { value: 'kseniya', label: 'Ксения (женский)' },
  { value: 'xenia', label: 'Ксения (вариант, женский)' },
  { value: 'baya', label: 'Бая (женский)' },
  { value: 'aidar', label: 'Айдар (мужской)' },
  { value: 'eugene', label: 'Евгений (мужской)' },
]

interface TtsTabProps {
  voices: VoiceInfo[];
  globalLoading: boolean;
  onGlobalLoadingChange: (loading: boolean) => void;
  onError: (error: string | null) => void;
}

export default function TtsTab({ voices, globalLoading, onGlobalLoadingChange, onError }: TtsTabProps) {
  // Текст, введённый пользователем в textarea
  const [text, setText] = useState<string>('')
  // Blob URL синтезированного MP3 — для аудио-плеера и скачивания
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  // Настройки TTS — сохраняются в localStorage для персистентности
  // Голос по умолчанию: kseniya; для клона значение 'clone:<voice_id>'
  const [speaker, setSpeaker] = useLocalStorage<string>('tts-speaker', 'kseniya')
  // Выбранный голос для тега [voice:] в режиме подкаста
  const [templateVoice, setTemplateVoice] = useLocalStorage<string>('tts-template-voice', 'kseniya')
  // Значение паузы для тега [pause:]
  const [pauseTemplateValue, setPauseTemplateValue] = useState<string>('1.0')
  // Опции синтеза — расстановка ударений (put_accent)
  const [putAccent, setPutAccent] = useLocalStorage<boolean>('tts-put-accent', true)
  // Опции синтеза — автозамена «Е» на «Ё» в нужных позициях
  const [putYo, setPutYo] = useLocalStorage<boolean>('tts-put-yo', true)
  // Флаг режима подкаста — включает панель PodcastModePanel
  const [podcastMode, setPodcastMode] = useLocalStorage<boolean>('tts-podcast-mode', false)
  // Способ произношения английских слов: английский голос или транслитерация
  const [englishMode, setEnglishMode] = useLocalStorage<EnglishMode>('tts-english-mode', 'voice')
  // Модальное окно со справкой по SSML
  const [showSsmlHelp, setShowSsmlHelp] = useState(false)

  // Максимальная длина текста для синтеза (защита от перегрузки сервера)
  const MAX_TEXT_LENGTH = 5000

  // Ref для textarea — нужен для вставки тегов в позицию курсора
  const textInputRef = useRef<HTMLTextAreaElement>(null)

  // Опции выбора голоса: пресеты Silero + клонированные голоса из вкладки «Мой голос»
  const speakerOptions: SpeakerOption[] = [
    ...SPEAKERS,
    ...voices.map((v) => ({ value: `clone:${v.voice_id}`, label: `★ ${v.name} (клон)` })),
  ]

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

    // Разбор выбранного голоса: клон ('clone:<id>') или пресет Silero
    const isClone = speaker.startsWith('clone:')
    const voice_id = isClone ? speaker.slice('clone:'.length) : null

    try {
      const response = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          speaker: isClone ? 'kseniya' : speaker,  // Для клона speaker игнорируется
          put_accent: putAccent,
          put_yo: putYo,
          podcast_mode: podcastMode,
          english_mode: englishMode,
          voice_id,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка синтеза')
      }

      // Бэкенд возвращает аудио как binary blob. Создаём URL для плеера.
      const blob = await response.blob()
      setAudioUrl(URL.createObjectURL(blob))
    } catch (err: unknown) {
      onError?.((err instanceof Error) ? err.message : 'Произошла ошибка при синтезе')
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
  const insertIntoTextAtCursor = (insertText: string) => {
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
            <Form.Text className="text-muted d-block">
              Ударение: <code>вод[!]а</code> — знак ставится перед ударной гласной
            </Form.Text>
            <Form.Text className="text-muted d-block">
              SSML: <code>{'<break time="1s"/>'}</code>,{' '}
              <code>{'<prosody rate="x-slow">…</prosody>'}</code>{' '}
              <Button
                variant="link"
                size="sm"
                className="p-0 align-baseline"
                onClick={() => setShowSsmlHelp(true)}
              >
                все возможности
              </Button>
            </Form.Text>
          </Form.Group>

          {/* Настройки: голос (слева) и переключатели (справа) */}
          <Row className="mb-3">
            <Col xs={12} md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Голос</Form.Label>
                <Form.Select value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
                  {speakerOptions.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </Form.Select>
                {speaker.startsWith('clone:') && (
                  <Form.Text className="text-muted">
                    Клонированный голос (XTTS v2). Синтез медленнее, чем у Silero.
                  </Form.Text>
                )}
              </Form.Group>
              <Form.Group>
                <Form.Label>Английские слова</Form.Label>
                <Form.Select
                  value={englishMode}
                  onChange={(e) => setEnglishMode(e.target.value as EnglishMode)}
                >
                  <option value="voice">Английским голосом (подобран под диктора)</option>
                  <option value="transliterate">Тем же голосом (транслитерация)</option>
                </Form.Select>
                <Form.Text className="text-muted">
                  {englishMode === 'voice'
                    ? 'Естественное произношение, но тембр может немного отличаться.'
                    : 'Диктор не меняется, но английские слова звучат с акцентом.'}
                </Form.Text>
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
                {voices.length > 0 && (
                  <> Клонированные голоса: <code>[voice:clone:{'<id>'}]</code></>
                )}
              </Alert>
              <PodcastModePanel
                speakers={speakerOptions}
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
      {/* Модальное окно со всеми значениями SSML */}
      <SsmlHelpModal
        show={showSsmlHelp}
        onHide={() => setShowSsmlHelp(false)}
        onInsert={(snippet) => {
          insertIntoTextAtCursor(snippet)
          onError?.(null)
        }}
      />
    </>
  )
}
