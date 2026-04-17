/**
 * App.tsx — Корневой контейнер приложения TTS/STT/DeepSeek.
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
import { Container, Tabs, Tab } from 'react-bootstrap'
import './App.css'
// Импорт рефакторенных компонентов — каждая вкладка в своём файле
import TtsTab from './components/TtsTab'
import SttTab from './components/SttTab'
import DeepseekTab from './components/DeepseekTab'
import TtsResultCard from './components/TtsResultCard'
import SttResultCard from './components/SttResultCard'
// Toast-уведомления — заменяют Alert-блоки (но Alert оставлен для совместимости)
import ToastNotifier from './components/ToastNotifier'

import { useToastError } from './hooks/useToastError'
import { OfflineBanner } from './hooks/useOnlineStatus'

type ActiveTab = 'tts' | 'stt' | 'deepseek';

/** App — главный компонент, рендерится в main.tsx */
export default function App() {
  // Ключ выбранной вкладки: 'tts' | 'stt' | 'deepseek'
  const [activeTab, setActiveTab] = useState<ActiveTab>('tts')
  // Глобальный флаг загрузки — блокирует элементы интерфейса во всех вкладках
  const [loading, setLoading] = useState<boolean>(false)
  // Сообщения об ошибках для каждой вкладки (хранятся для совместимости с Alert,
  // но основная доставка — через toast)
  const [_ttsError, setTtsError] = useState<string | null>(null)
  const [_sttError, setSttError] = useState<string | null>(null)
  const [_deepseekError, setDeepseekError] = useState<string | null>(null)
  // Распознанный текст из STT — передаётся в SttTab и отображается через SttResultCard
  const [recognizedText, setRecognizedText] = useState<string>('')
  // URL синтезированного аудио из функции «Озвучить ответ» во вкладке DeepSeek
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null)

  // Обёртки над onError, которые выводят toast.error() + обновляют стейт
  const ttsOnError = useToastError(setTtsError)
  const sttOnError = useToastError(setSttError)
  const deepseekOnError = useToastError(setDeepseekError)

  // При монтировании определяем десктоп/мобилку для CSS-классов на body
  useEffect(() => {
    document.body.classList.remove('desktop-ui', 'mobile-ui')
    const mode = window.innerWidth < 768 ? 'mobile' : 'desktop'
    document.body.classList.add(`${mode}-ui`)
  }, [])

  // Вызывается из DeepseekTab при нажатии «Озвучить ответ» —
  // синтезирует речь из ответа и переключает пользователя на TTS-вкладку
  const handleSwitchToTtsWithAudio = (audioUrl: string) => {
    setTtsAudioUrl(audioUrl)
    setActiveTab('tts')
  }

  return (
    <Container className="py-5">
      <OfflineBanner />
      {/* Заголовок страницы */}
      <div className="text-center mb-4">
        <h1>Text-to-Speech / Speech-to-Text</h1>
        <p className="text-muted">Синтез речи из текста или распознавание речи из аудио</p>
      </div>

      {/* Вкладки: переключают вкладки и сбрасывают ошибки при переключении */}
      <Tabs
        activeKey={activeTab}
        onSelect={(k) => {
          const newTab = k === 'stt' || k === 'deepseek' ? k : 'tts';
          setActiveTab(newTab);
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
            onError={ttsOnError}
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
            onError={sttOnError}
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
            onError={deepseekOnError}
            onSwitchToTts={handleSwitchToTtsWithAudio}
          />
        </Tab>
      </Tabs>

      {/* Toast-уведомления — заменяют inline Alert-блоки */}
      <ToastNotifier />
    </Container>
)
}
