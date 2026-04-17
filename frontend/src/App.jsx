/**
 * App.jsx — Корневой контейнер приложения TTS/STT/DeepSeek.
 *
 * После рефакторинга это тонкий «оркестратор»:
 *   - Хранит глобальное состояние (загрузка, ошибки, результаты)
 *   - Рендерит вкладки React-Bootstrap
 *   - Делегирует бизнес-логику дочерним компонентам:
 *       TtsTab, SttTab, DeepseekTab
 *   - Показывает карточки результатов (TtsResultCard, SttResultCard)
 *   - Передаёт коллбэки в дочерние компоненты для связи между ними
 */
import { useState, useEffect } from 'react'
import { Container, Tabs, Tab, Alert, Card, Form, Button } from 'react-bootstrap'
import './App.css'
// Импорт рефакторенных компонентов — каждый вкладка в своём файле
import TtsTab from './components/TtsTab'
import SttTab from './components/SttTab'
import DeepseekTab from './components/DeepseekTab'

/** App — главный компонент, рендерится в main.jsx */
export default function App() {
  // Ключ выбранной вкладки: 'tts' | 'stt' | 'deepseek'
  const [activeTab, setActiveTab] = useState('tts')
  // Глобальный флаг загрузки — блокирует элементы интерфейса во всех вкладках
  const [loading, setLoading] = useState(false)
  // Сообщения об ошибках для каждой вкладки отдельно (чтобы не перемешивались)
  const [ttsError, setTtsError] = useState(null)
  const [sttError, setSttError] = useState(null)
  const [deepseekError, setDeepseekError] = useState(null)
  // Распознанный текст из STT — передаётся в SttTab и отображается через SttResultCard
  const [recognizedText, setRecognizedText] = useState('')
  // URL синтезированного аудио из функции «Озвучить ответ» во вкладке DeepSeek
  const [ttsAudioUrl, setTtsAudioUrl] = useState(null)

  // При монтировании определяем десктоп/мобилку для CSS-классов на body
  useEffect(() => {
    document.body.classList.remove('desktop-ui', 'mobile-ui')
    const mode = window.innerWidth < 768 ? 'mobile' : 'desktop'
    document.body.classList.add(`${mode}-ui`)
  }, [])

  // Вызывается из DeepseekTab при нажатии «Озвучить ответ» —
  // синтезирует речь из ответа и переключает пользователя на TTS-вкладку
  const handleSwitchToTtsWithAudio = (audioUrl) => {
    setTtsAudioUrl(audioUrl)
    setActiveTab('tts')
  }

  return (
    <Container className="py-5">
      {/* Заголовок страницы */}
      <div className="text-center mb-4">
        <h1>Text-to-Speech / Speech-to-Text</h1>
        <p className="text-muted">Синтез речи из текста или распознавание речи из аудио</p>
      </div>

      {/* Вкладки: переключают вкладки и сбрасывают ошибки при переключении */}
      <Tabs
        activeKey={activeTab}
        onSelect={(k) => {
          setActiveTab(k)
          // При смене вкладки убираем ошибки — они относятся к предыдущей
          setTtsError(null)
          setSttError(null)
          setDeepseekError(null)
        }}
        className="mb-3"
        variant="pills"
      >
        {/* ТТК Вкладка: Текст в Речь (Silero TTS) */}
        <Tab eventKey="tts" title="Текст в речь">
          <TtsTab
            globalLoading={loading}
            onGlobalLoadingChange={setLoading}
            onError={setTtsError}
          />
          {/* Карточка с результатом синтеза — появляется при озвучивании ответа из DeepSeek */}
          {ttsAudioUrl && (
            <TtsResultCard audioUrl={ttsAudioUrl} />
          )}
        </Tab>

        {/* Вкладка: Речь в Текст (OpenAI Whisper) */}
        <Tab eventKey="stt" title="Речь в текст">
          <SttTab
            globalLoading={loading}
            onGlobalLoadingChange={setLoading}
            onError={setSttError}
            onSetRecognizedText={setRecognizedText}
          />
          {/* Карточка с распознанным текстом — появляется после получения результата */}
          {recognizedText && <SttResultCard text={recognizedText} />}
        </Tab>

        {/* Вкладка: DeepSeek — чат-ассистент с возможностью озвучки ответов */}
        <Tab eventKey="deepseek" title="DeepSeek AI">
          <DeepseekTab
            globalLoading={loading}
            onGlobalLoadingChange={setLoading}
            onError={setDeepseekError}
            onSwitchToTts={handleSwitchToTtsWithAudio}
          />
        </Tab>
      </Tabs>

      {/* Блоки ошибок для каждой вкладки — отображаются отдельно, не перекрывая друг друга */}
      {ttsError && (
        <Alert variant="danger" className="mt-3">{ttsError}</Alert>
      )}
      {sttError && (
        <Alert variant="danger" className="mt-3">{sttError}</Alert>
      )}
      {deepseekError && (
        <Alert variant="danger" className="mt-3">{deepseekError}</Alert>
      )}
    </Container>
  )
}

/** TtsResultCard — карточка с аудио-плеером и кнопкой скачивания MP3 */
function TtsResultCard({ audioUrl }) {
  // Фиксируем URL в стейте, чтобы avoid re-creation при ре-рендерах родителя
  const [url] = useState(audioUrl)

  // Скачиваем аудио через программный клик по ссылке <a>
  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = url
    a.download = 'speech.mp3'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Card className="shadow-sm mt-3">
      <Card.Body>
        <h5 className="card-title">Результат</h5>
        <audio controls src={url} className="w-100 mb-3">
          Ваш браузер не поддерживает аудио элемент.
        </audio>
        <div className="d-grid">
          <Button variant="success" onClick={handleDownload}>
            Скачать MP3
          </Button>
        </div>
      </Card.Body>
    </Card>
  )
}

/** SttResultCard — карточка с распознанным текстом и кнопкой копирования */
function SttResultCard({ text }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
  }

  return (
    <Card className="shadow-sm mt-3">
      <Card.Body>
        <h5 className="card-title">Распознанный текст</h5>
        <Form.Control
          as="textarea"
          rows={10}
          value={text}
          readOnly
          className="mb-3"
          style={{ resize: 'vertical', minHeight: '200px' }}
        />
        <div className="d-grid">
          <Button variant="info" onClick={handleCopy}>
            Копировать текст
          </Button>
        </div>
      </Card.Body>
    </Card>
  )
}
