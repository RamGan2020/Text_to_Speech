// App.jsx — Главный компонент приложения Text-to-Speech / Speech-to-Text
// Содержит два режима: TTS (текст → аудио) и STT (аудио → текст)

import { useState, useRef, useEffect } from 'react'
import { Container, Form, Button, Alert, Spinner, Row, Col, Tabs, Tab, Card } from 'react-bootstrap'
import './App.css'  // Импортируем пользовательские стили

// URL backend-сервера для API-запросов
const API_URL = 'http://localhost:8000'

// Массив доступных голосов — используется для выпадающего списка TTS
const SPEAKERS = [
  // Женский голос, основной
  { value: 'kseniya', label: 'Ксения (женский)' },
  // Женский голос, альтернативный вариант
  { value: 'xenia', label: 'Ксения (вариант, женский)' },
  // Женский голос, другой тембр
  { value: 'baya', label: 'Бая (женский)' },
  // Мужской голос
  { value: 'aidar', label: 'Айдар (мужской)' },
  // Мужской голос, другой тембр
  { value: 'eugene', label: 'Евгений (мужской)' },
]

// Модели DeepSeek
const DEEPSEEK_MODELS = [
  { value: 'deepseek-chat', label: 'deepseek-chat (быстрая)' },
  { value: 'deepseek-reasoner', label: 'deepseek-reasoner (рассуждения)' },
]

// Готовые шаблоны для podcast_mode
const PODCAST_EXAMPLES = [
  {
    id: 'dialog',
    label: 'Диалог ведущих',
    text: `[voice:kseniya] Всем привет! Это наш подкаст.
[pause:0.8]
[voice:aidar] Сегодня обсудим новости по проекту.
[pause:1.2]
[voice:kseniya] Поехали!`,
  },
  {
    id: 'ad-break',
    label: 'Реклама/пауза',
    text: `[voice:eugene] Короткая пауза перед следующим блоком.
[pause:2.0]
[voice:xenia] Спасибо, что слушаете нас.`,
  },
  {
    id: 'narration',
    label: 'Озвучка с паузами',
    text: `[voice:baya] Глава первая.
[pause:1.0]
В небольшом городе началась новая история.
[pause:1.5]
И никто не знал, к чему она приведет.`,
  },
]

// Предустановленные системные промпты для DeepSeek
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
    value: 'Ты — копирайтер. Пиши тексты в маркетинговом стиле, убедительно и энергично.',
    label: 'Копирайтер',
  },
]

/**
 * Конвертирует AudioBuffer в WAV Blob
 * @param {AudioBuffer} buffer - Аудио буфер из браузера
 * @returns {Blob} WAV файл в виде Blob
 */
function audioBufferToWav(buffer) {
  // Получаем данные из каналов
  const numChannels = buffer.numberOfChannels  // Количество каналов (обычно 1 или 2)
  const sampleRate = buffer.sampleRate         // Частота дискретизации (обычно 44100 или 48000)
  const format = 1  // PCM (без сжатия)
  const bitDepth = 16  // 16-bit

  // Интерливинг каналов (чередование сэмплов левого/правого)
  const interleaved = new Float32Array(buffer.length * numChannels)
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel)
    for (let i = 0; i < buffer.length; i++) {
      interleaved[i * numChannels + channel] = channelData[i]
    }
  }

  // Конвертация float32 в int16
  const int16Data = new Int16Array(interleaved.length)
  for (let i = 0; i < interleaved.length; i++) {
    // Масштабируем float [-1, 1] в int16 [-32768, 32767]
    const s = Math.max(-1, Math.min(1, interleaved[i]))
    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }

  // Создаём WAV файл вручную (заголовок + данные)
  const dataLength = int16Data.length * 2  // 2 байта на сэмпл
  const headerLength = 44  // Стандартный WAV заголовок
  const totalLength = headerLength + dataLength
  const arrayBuffer = new ArrayBuffer(totalLength)
  const view = new DataView(arrayBuffer)

  // Запись WAV заголовка
  writeString(view, 0, 'RIFF')                          // ChunkID
  view.setUint32(4, 36 + dataLength, true)              // ChunkSize
  writeString(view, 8, 'WAVE')                          // Format
  writeString(view, 12, 'fmt ')                         // Subchunk1ID
  view.setUint32(16, 16, true)                          // Subchunk1Size (PCM = 16)
  view.setUint16(20, format, true)                      // AudioFormat (PCM = 1)
  view.setUint16(22, numChannels, true)                 // NumChannels
  view.setUint32(24, sampleRate, true)                  // SampleRate
  view.setUint32(28, sampleRate * numChannels * 2, true) // ByteRate
  view.setUint16(32, numChannels * 2, true)             // BlockAlign
  view.setUint16(34, bitDepth, true)                    // BitsPerSample
  writeString(view, 36, 'data')                         // Subchunk2ID
  view.setUint32(40, dataLength, true)                  // Subchunk2Size

  // Запись аудио-данных
  for (let i = 0; i < int16Data.length; i++) {
    view.setInt16(44 + i * 2, int16Data[i], true)
  }

  // Возвращаем как Blob
  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

/**
 * Записывает строку в DataView
 */
function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

function App() {
  const [uiMode] = useState(() => {
    return window.innerWidth < 768 ? 'mobile' : 'desktop';
  });

  useEffect(() => {
    document.body.classList.remove('desktop-ui', 'mobile-ui');
    document.body.classList.add(`${uiMode}-ui`);
  }, [uiMode]);

  const [activeTab, setActiveTab] = useState('tts')

  // --- Состояния для режима TTS (Text-to-Speech) ---
  // Текст в поле ввода
  const [text, setText] = useState('')
  // URL аудио-файла (blob) для плеера
  const [audioUrl, setAudioUrl] = useState(null)
  // Выбранный голос
  const [speaker, setSpeaker] = useState('kseniya')
  // Выбранный голос для вставки voice-тега в текст
  const [templateVoice, setTemplateVoice] = useState('kseniya')
  // Значение паузы для вставки тега [pause:...]
  const [pauseTemplateValue, setPauseTemplateValue] = useState('1.0')
  // Флаг расстановки ударений
  const [putAccent, setPutAccent] = useState(true)
  // Флаг расстановки буквы 'ё'
  const [putYo, setPutYo] = useState(true)
  // Режим подкаста (поддержка тегов [voice:...] и [pause:...])
  const [podcastMode, setPodcastMode] = useState(false)

  // --- Состояния для режима STT (Speech-to-Text) ---
  // Загруженный аудио-файл
  const [sttFile, setSttFile] = useState(null)
  // Распознанный текст
  const [recognizedText, setRecognizedText] = useState('')

  // --- Состояния для режима DeepSeek ---
  // API-ключ DeepSeek
  const [deepseekApiKey, setDeepseekApiKey] = useState('')
  // Текст вопроса к DeepSeek
  const [deepseekQuestion, setDeepseekQuestion] = useState('')
  // Системный промпт (выбранный из списка или свой)
  const [deepseekSystemPrompt, setDeepseekSystemPrompt] = useState('')
  // Ответ от DeepSeek
  const [deepseekAnswer, setDeepseekAnswer] = useState('')
  // Флаг загрузки ответа
  const [deepseekLoading, setDeepseekLoading] = useState(false)
  // Ошибка DeepSeek
  const [deepseekError, setDeepseekError] = useState(null)
  // Модель DeepSeek
  const [deepseekModel, setDeepseekModel] = useState('deepseek-chat')

  // --- Состояния для записи с микрофона ---
  // Состояние записи: 'idle' (покой), 'requesting' (запрос доступа), 'recording' (запись)
  const [micState, setMicState] = useState('idle')
  // Записанный аудио-Blob (webm)
  const [recordedBlob, setRecordedBlob] = useState(null)
  // Таймер записи (секунды)
  const [recordingTime, setRecordingTime] = useState(0)
  // Ссылка на MediaRecorder
  const mediaRecorderRef = useRef(null)
  // Ссылка на поток микрофона
  const streamRef = useRef(null)
  // Ссылка на интервал таймера
  const timerRef = useRef(null)

  // --- Общие состояния ---
  // Флаг загрузки (показывает спиннер)
  const [loading, setLoading] = useState(false)
  // Текст ошибки (null = нет ошибки)
  const [error, setError] = useState(null)

  // Ссылка на input для загрузки файла
  const fileInputRef = useRef(null)
  // Ссылка на textarea TTS для вставки шаблонов в позицию курсора
  const textInputRef = useRef(null)

  // === Обработчики событий для режима TTS ===

  // Обработчик кнопки "Обработать" — запускает синтез речи
  const handleSynthesize = async () => {
    // Проверяем, что текст не пустой (после удаления пробелов)
    if (!text.trim()) {
      // Устанавливаем сообщение об ошибке
      setError('Введите текст для озвучивания')
      // Прерываем выполнение — не отправляем пустой запрос
      return
    }

    // Включаем режим загрузки (показываем спиннер)
    setLoading(true)
    // Сбрасываем предыдущую ошибку
    setError(null)
    // Сбрасываем предыдущий результат аудио
    setAudioUrl(null)

    try {
      // Отправляем POST-запрос на backend для синтеза речи
      const response = await fetch(`${API_URL}/synthesize`, {
        method: 'POST',  // HTTP-метод — POST
        headers: {
          // Указываем, что отправляем JSON
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({  // Превращаем объект настроек в JSON-строку
          text: text,                   // Текст для озвучивания
          speaker: speaker,             // Выбранный голос
          put_accent: putAccent,        // Флаг расстановки ударений
          put_yo: putYo,                // Флаг расстановки буквы 'ё'
          podcast_mode: podcastMode,    // Режим подкаста с тегами [voice]/[pause]
        }),
      })

      // Если HTTP-ответ содержит ошибку (статус не 2xx)
      if (!response.ok) {
        // Читаем тело ошибки из JSON
        const errorData = await response.json()
        // Выбрасываем ошибку с сообщением
        throw new Error(errorData.detail || 'Ошибка синтеза')
      }

      // Получаем бинарные данные MP3-файла
      const blob = await response.blob()
      // Создаём временный URL для blob-объекта
      const url = URL.createObjectURL(blob)
      // Сохраняем URL в состояние — появится аудио-плеер
      setAudioUrl(url)
    } catch (err) {
      // Если произошла ошибка запроса или обработки
      // Устанавливаем сообщение об ошибке
      setError(err.message || 'Произошла ошибка при синтезе')
    } finally {
      // Выключаем режим загрузки (в любом случае — успех или ошибка)
      setLoading(false)
    }
  }

  // Обработчик кнопки "Очистить" — сбрасывает все поля TTS
  const handleClear = () => {
    // Очищаем текст в поле ввода
    setText('')
    // Убираем предыдущий результат аудио
    setAudioUrl(null)
    // Сбрасываем сообщение об ошибке
    setError(null)
  }

  // Обработчик кнопки "Скачать MP3" — скачивает аудио-файл
  const handleDownload = () => {
    // Если есть URL аудио (синтез прошёл успешно)
    if (audioUrl) {
      // Создаём невидимую ссылку <a>
      const a = document.createElement('a')
      // Устанавливаем URL аудио-файла
      a.href = audioUrl
      // Указываем имя файла при скачивании
      a.download = 'speech.mp3'
      // Добавляем ссылку в DOM (невидимо)
      document.body.appendChild(a)
      // Программно кликаем по ссылке — начинается скачивание
      a.click()
      // Удаляем ссылку из DOM
      document.body.removeChild(a)
    }
  }

  // Вставить готовый шаблон podcast-режима в поле текста
  const handleInsertPodcastExample = (exampleText) => {
    setText(exampleText)
    setError(null)
  }

  // Вставить фрагмент в textarea по позиции курсора (или в конец, если нет фокуса)
  const insertIntoTextAtCursor = (insertText) => {
    const textarea = textInputRef.current
    if (!textarea) {
      setText(prev => `${prev}${prev ? '\n' : ''}${insertText}`)
      return
    }

    const start = textarea.selectionStart ?? text.length
    const end = textarea.selectionEnd ?? text.length
    const nextText = `${text.slice(0, start)}${insertText}${text.slice(end)}`
    setText(nextText)

    // Восстанавливаем фокус и ставим курсор после вставленного фрагмента
    requestAnimationFrame(() => {
      textarea.focus()
      const pos = start + insertText.length
      textarea.setSelectionRange(pos, pos)
    })
  }

  // Вставить тег выбранного голоса
  const handleInsertVoiceTag = () => {
    insertIntoTextAtCursor(`[voice:${templateVoice}] `)
    setError(null)
  }

  // Вставить тег паузы с введенной длительностью
  const handleInsertPauseTag = () => {
    const value = pauseTemplateValue.trim()
    if (!value) {
      setError('Введите время паузы (например: 1.5, 1.5s или 500ms)')
      return
    }
    insertIntoTextAtCursor(`[pause:${value}] `)
    setError(null)
  }

  // === Обработчики событий для режима STT ===

  // === Обработчики для DeepSeek ===

  // Задать вопрос DeepSeek
  const handleAskDeepseek = async () => {
    if (!deepseekQuestion.trim()) {
      setDeepseekError('Введите вопрос')
      return
    }

    setDeepseekLoading(true)
    setDeepseekError(null)
    setDeepseekAnswer('')

    try {
      const response = await fetch(`${API_URL}/ask_deepseek`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: deepseekQuestion,
          api_key: deepseekApiKey || undefined,
          system_prompt: deepseekSystemPrompt || undefined,
          model: deepseekModel,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка запроса к DeepSeek')
      }

      const data = await response.json()
      setDeepseekAnswer(data.answer)
    } catch (err) {
      setDeepseekError(err.message || 'Произошла ошибка при запросе к DeepSeek')
    } finally {
      setDeepseekLoading(false)
    }
  }

  // Озвучить ответ DeepSeek
  const handleSynthesizeDeepseekAnswer = async () => {
    if (!deepseekAnswer) {
      setDeepseekError('Нет ответа для озвучивания')
      return
    }

    setLoading(true)
    setError(null)
    setAudioUrl(null)

    try {
      const response = await fetch(`${API_URL}/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: deepseekAnswer,
          speaker: speaker,
          put_accent: putAccent,
          put_yo: putYo,
          podcast_mode: false,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка синтеза')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)

      // Переключаемся на вкладку TTS для прослушивания
      setActiveTab('tts')
    } catch (err) {
      setError(err.message || 'Произошла ошибка при синтезе')
    } finally {
      setLoading(false)
    }
  }

  // Очистить DeepSeek
  const handleDeepseekClear = () => {
    setDeepseekQuestion('')
    setDeepseekAnswer('')
    setDeepseekError(null)
  }

  // Копировать ответ DeepSeek
  const handleCopyDeepseekAnswer = () => {
    navigator.clipboard.writeText(deepseekAnswer)
  }

  // Обработчик выбора файла для распознавания
  const handleFileChange = (e) => {
    // Получаем выбранный файл из input
    const file = e.target.files[0]
    if (file) {
      // Сохраняем файл в состояние
      setSttFile(file)
      // Сбрасываем предыдущий результат
      setRecognizedText('')
      // Сбрасываем ошибку
      setError(null)
    }
  }

  // Обработчик кнопки "Распознать" — запускает STT
  const handleTranscribe = async () => {
    // Проверяем, что файл выбран
    if (!sttFile) {
      // Устанавливаем сообщение об ошибке
      setError('Выберите аудио-файл для распознавания')
      // Прерываем выполнение
      return
    }

    // Включаем режим загрузки (показываем спиннер)
    setLoading(true)
    // Сбрасываем предыдущую ошибку
    setError(null)
    // Сбрасываем предыдущий результат
    setRecognizedText('')

    try {
      // Создаём объект FormData для отправки файла (multipart/form-data)
      const formData = new FormData()
      // Добавляем файл в FormData (ключ "audio" — должен совпадать с backend)
      formData.append('audio', sttFile)

      // Отправляем POST-запрос на endpoint /transcribe
      const response = await fetch(`${API_URL}/transcribe`, {
        method: 'POST',  // HTTP-метод — POST
        body: formData,  // Отправляем FormData с файлом
      })

      // Если HTTP-ответ содержит ошибку (статус не 2xx)
      if (!response.ok) {
        // Читаем тело ошибки из JSON
        const errorData = await response.json()
        // Выбрасываем ошибку с сообщением
        throw new Error(errorData.detail || 'Ошибка распознавания')
      }

      // Читаем JSON-ответ с распознанным текстом
      const data = await response.json()
      // Сохраняем распознанный текст в состояние
      setRecognizedText(data.text)
    } catch (err) {
      // Если произошла ошибка запроса или обработки
      // Устанавливаем сообщение об ошибке
      setError(err.message || 'Произошла ошибка при распознавании')
    } finally {
      // Выключаем режим загрузки (в любом случае — успех или ошибка)
      setLoading(false)
    }
  }

  // Обработчик кнопки "Очистить" для STT
  const handleSttClear = () => {
    // Сбрасываем файл
    setSttFile(null)
    // Сбрасываем распознанный текст
    setRecognizedText('')
    // Сбрасываем ошибку
    setError(null)
    // Очищаем value input-элемента
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    // Сбрасываем запись с микрофона
    setRecordedBlob(null)
    setRecordingTime(0)
    setMicState('idle')
    // Останавливаем запись, если она идёт
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    // Останавливаем поток микрофона
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    // Очищаем интервал таймера
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // Обработчик кнопки "Копировать текст"
  const handleCopyText = () => {
    // Копируем распознанный текст в буфер обмена
    navigator.clipboard.writeText(recognizedText)
  }

  // === Обработчики записи с микрофона ===

  // Начать запись с микрофона
  const startRecording = async () => {
    try {
      // Сбрасываем предыдущую запись
      setRecordedBlob(null)
      setRecordingTime(0)

      // Запрашиваем доступ к микрофону
      setMicState('requesting')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Сохраняем ссылку на поток
      streamRef.current = stream

      // Создаём MediaRecorder
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      // Массив для хранения чанков аудио
      const chunks = []

      // Обработчик получения данных
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      // Обработчик окончания записи
      mediaRecorder.onstop = () => {
        // Создаём Blob из записанных чанков
        const webmBlob = new Blob(chunks, { type: 'audio/webm' })

        // Конвертируем webm в WAV через AudioContext (без ffmpeg)
        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const reader = new FileReader()

        reader.onload = async (e) => {
          try {
            // Декодируем webm в AudioBuffer
            const audioBuffer = await audioContext.decodeAudioData(e.target.result)

            // Конвертируем AudioBuffer в WAV Blob
            const wavBlob = audioBufferToWav(audioBuffer)

            // Сохраняем WAV Blob в состояние
            setRecordedBlob(wavBlob)
          } catch (err) {
            setError('Ошибка обработки аудио: ' + err.message)
          } finally {
            // Возвращаем состояние в покой
            setMicState('idle')
            // Останавливаем поток микрофона
            if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop())
              streamRef.current = null
            }
            // Очищаем интервал таймера
            if (timerRef.current) {
              clearInterval(timerRef.current)
              timerRef.current = null
            }
            audioContext.close()
          }
        }

        reader.onerror = () => {
          setError('Ошибка чтения аудио')
          setMicState('idle')
        }

        // Читаем blob как ArrayBuffer
        reader.readAsArrayBuffer(webmBlob)
      }

      // Начинаем запись
      mediaRecorder.start()
      setMicState('recording')

      // Запускаем таймер записи
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } catch (err) {
      // Если ошибка (пользователь отклонил запрос и т.д.)
      setError('Не удалось получить доступ к микрофону: ' + err.message)
      setMicState('idle')
    }
  }

  // Остановить запись
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      // Останавливаем MediaRecorder — вызовется onstop
      mediaRecorderRef.current.stop()
    }
  }

  // Распознать записанное аудио
  const transcribeRecording = async () => {
    if (!recordedBlob) {
      setError('Нет записанного аудио')
      return
    }

    // Включаем режим загрузки
    setLoading(true)
    setError(null)
    setRecognizedText('')

    try {
      // Создаём FormData для отправки
      const formData = new FormData()
      // Отправляем как WAV файл
      formData.append('audio', recordedBlob, 'recording.wav')

      // Отправляем на backend
      const response = await fetch(`${API_URL}/transcribe`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка распознавания')
      }

      const data = await response.json()
      setRecognizedText(data.text)
    } catch (err) {
      setError(err.message || 'Произошла ошибка при распознавании')
    } finally {
      setLoading(false)
    }
  }

  // Форматирование времени записи (мм:сс)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // === JSX-разметка (то, что видит пользователь) ===

  return (
    // Контейнер Bootstrap с отступами сверху/снизу
    <Container className="py-5">
      <div className="text-center mb-4">
        <h1>Text-to-Speech / Speech-to-Text</h1>
        <p className="text-muted">Синтез речи из текста или распознавание речи из аудио</p>
      </div>

      {/* Вкладки для переключения между режимами TTS и STT */}
      <Tabs
        activeKey={activeTab}  // Активная вкладка (из состояния)
        onSelect={(k) => {  // Обработчик переключения вкладки
          setActiveTab(k)  // Обновляем состояние
          setError(null)   // Сбрасываем ошибку TTS/STT при переключении
          setDeepseekError(null)  // Сбрасываем ошибку DeepSeek
        }}
        className="mb-3"  // Отступ снизу
        variant="pills"  // Стиль вкладок — "таблетки"
      >
        {/* Вкладка TTS — синтез речи (текст → аудио) */}
        <Tab eventKey="tts" title="Текст в речь">
          {/* Карточка Bootstrap с лёгкой тенью */}
          <Card className="shadow-sm">
            {/* Содержимое карточки */}
            <Card.Body>
              {/* Группа формы с отступом снизу */}
              <Form.Group className="mb-3">
                {/* Метка поля ввода */}
                <Form.Label>Текст</Form.Label>
                <Form.Control
                  // Рендерим как многострочное поле, а не input
                  as="textarea"
                  // Высота поля — 10 строк
                  rows={10}
                  // Привязываем значение к состоянию text
                  value={text}
                  // Обновляем состояние при вводе
                  onChange={(e) => setText(e.target.value)}
                  // Текст-подсказка
                  placeholder="Введите текст, который хотите озвучить..."
                  // Можно менять высоту, минимум 200px
                  style={{ resize: 'vertical', minHeight: '200px' }}
                  ref={textInputRef}
                />
                {/* Мелкий текст под полем — счётчик символов */}
                <Form.Text className="text-muted">
                  Символов: {text.length}
                </Form.Text>
              </Form.Group>

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
                  <Form.Group className={uiMode === 'desktop' ? 'd-flex flex-column justify-content-center h-100' : ''}>
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

              {podcastMode && (
                <>
                  <Alert variant="info" className="mb-3">
                    В режиме подкаста можно использовать теги, например:
                    {' '}
                    <code>[voice:aidar]</code>
                    {' '}
                    Текст...
                    {' '}
                    <code>[pause:1.5]</code>
                  </Alert>

                  <Card className="mb-3 border-info-subtle">
                    <Card.Body>
                      <h6 className="mb-2">Вставка тега голоса</h6>
                      <Row className="g-2 mb-3">
                        <Col xs={12} sm={8}>
                          <Form.Select
                            value={templateVoice}
                            onChange={(e) => setTemplateVoice(e.target.value)}
                          >
                            {SPEAKERS.map((s) => (
                              <option key={`template-${s.value}`} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </Form.Select>
                        </Col>
                        <Col xs={12} sm={4}>
                          <div className="d-grid">
                            <Button
                              variant="outline-primary"
                              onClick={handleInsertVoiceTag}
                              disabled={loading}
                              size="sm"
                            >
                              [voice]
                            </Button>
                          </div>
                        </Col>
                      </Row>

                      <h6 className="mb-2">Вставка тега паузы</h6>
                      <Row className="g-2 mb-3">
                        <Col xs={7} sm={8}>
                          <Form.Control
                            type="text"
                            value={pauseTemplateValue}
                            onChange={(e) => setPauseTemplateValue(e.target.value)}
                            placeholder="1.5, 1.5s, 500ms"
                            size="sm"
                          />
                        </Col>
                        <Col xs={5} sm={4}>
                          <div className="d-grid">
                            <Button
                              variant="outline-primary"
                              onClick={handleInsertPauseTag}
                              disabled={loading}
                              size="sm"
                            >
                              [pause]
                            </Button>
                          </div>
                        </Col>
                      </Row>

                      <h6 className="mb-2">Примеры</h6>
                      <div className="d-grid gap-2">
                        {PODCAST_EXAMPLES.map((example) => (
                          <Button
                            key={example.id}
                            variant="outline-info"
                            onClick={() => handleInsertPodcastExample(example.text)}
                            disabled={loading}
                            size="sm"
                          >
                            {example.label}
                          </Button>
                        ))}
                      </div>
                    </Card.Body>
                  </Card>
                </>
              )}

              {/* Контейнер для кнопок (grid, с зазором) */}
              <div className="d-grid gap-2">
                {/* Кнопка "Обработать" — основная, большая */}
                <Button
                  variant="primary"
                  onClick={handleSynthesize}
                  disabled={loading}
                  size="lg"
                >
                  {loading ? (
                    <>
                      {/* Спиннер загрузки — крутящийся круг */}
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        role="status"
                        className="me-2"
                      />
                      Синтез...
                    </>
                  ) : (
                    'Обработать'
                  )}
                </Button>
                {/* Кнопка "Очистить" — контурная, серая */}
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

          {/* Блок результата TTS — показывается только если есть audioUrl */}
          {audioUrl && (
            <Card className="shadow-sm mt-3">
              <Card.Body>
                {/* Заголовок карточки результата */}
                <h5 className="card-title">Результат</h5>
                {/* Аудио-плеер */}
                <audio controls src={audioUrl} className="w-100 mb-3">
                  {/* Фоллбэк для старых браузеров */}
                  Ваш браузер не поддерживает аудио элемент.
                </audio>
                {/* Контейнер для кнопки скачивания */}
                <div className="d-grid">
                  {/* Зелёная кнопка скачивания */}
                  <Button variant="success" onClick={handleDownload}>
                    Скачать MP3
                  </Button>
                </div>
              </Card.Body>
            </Card>
          )}
        </Tab>

        {/* Вкладка STT — распознавание речи (аудио → текст) */}
        <Tab eventKey="stt" title="Речь в текст">
          {/* Карточка Bootstrap с лёгкой тенью для загрузки файла */}
          <Card className="shadow-sm">
            {/* Содержимое карточки */}
            <Card.Body>
              {/* Группа формы для загрузки файла */}
              <Form.Group className="mb-3">
                {/* Метка поля загрузки */}
                <Form.Label>Аудио-файл</Form.Label>
                {/* Поле загрузки файла — принимает только аудио-форматы */}
                <Form.Control
                  type="file"
                  accept=".mp3,.wav,.ogg,.flac,.webm"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                />
                {/* Мелкий текст под полем — подсказка о форматах */}
                <Form.Text className="text-muted">
                  Поддерживаются форматы: MP3, WAV, OGG, FLAC, WEBM
                </Form.Text>
              </Form.Group>

              {/* Показываем имя выбранного файла */}
              {sttFile && (
                <div className="mb-3">
                  <strong>Выбран файл:</strong> {sttFile.name} ({(sttFile.size / 1024).toFixed(1)} КБ)
                </div>
              )}

              {/* Разделитель */}
              <hr />

              {/* Секция записи с микрофона */}
              <Form.Group className="mb-3">
                <Form.Label>Запись с микрофона</Form.Label>

                <div className={`d-flex align-items-center gap-3 mb-3 ${uiMode === 'mobile' ? 'flex-wrap' : ''}`}>
                  {micState === 'idle' && !recordedBlob && (
                    <Button
                      variant="outline-danger"
                      onClick={startRecording}
                      disabled={loading}
                      size={uiMode === 'mobile' ? 'md' : 'lg'}
                    >
                      {uiMode === 'mobile' ? '🎤 Запись' : '🎤 Начать запись'}
                    </Button>
                  )}

                  {micState === 'requesting' && (
                    <Button variant="outline-secondary" disabled size="md">
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        className="me-2"
                      />
                      Доступ...
                    </Button>
                  )}

                  {micState === 'recording' && (
                    <>
                      <div className="recording-indicator">
                        <div className="pulse-circle"></div>
                      </div>
                      <span className="recording-time">{formatTime(recordingTime)}</span>
                      <Button
                        variant="danger"
                        onClick={stopRecording}
                        size={uiMode === 'mobile' ? 'md' : 'lg'}
                      >
                        {uiMode === 'mobile' ? '⏹' : '⏹ Остановить'}
                      </Button>
                    </>
                  )}

                  {recordedBlob && micState === 'idle' && (
                    <>
                      <span className="badge bg-success">
                        ✓ {formatTime(recordingTime)}
                      </span>
                      <Button
                        variant="outline-secondary"
                        onClick={() => {
                          setRecordedBlob(null)
                          setRecordingTime(0)
                        }}
                        size="sm"
                      >
                        ✕
                      </Button>
                    </>
                  )}
                </div>

                {/* Аудиоплеер для прослушивания записи */}
                {recordedBlob && (
                  <audio
                    controls
                    src={URL.createObjectURL(recordedBlob)}
                    className="w-100 mb-3"
                  >
                    Ваш браузер не поддерживает аудио элемент.
                  </audio>
                )}
              </Form.Group>

              {/* Контейнер для кнопок (grid, с зазором) */}
              <div className="d-grid gap-2">
                {/* Кнопка "Распознать файл" — если выбран файл */}
                {sttFile && (
                  <Button
                    variant="primary"
                    onClick={handleTranscribe}
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
                        Распознавание...
                      </>
                    ) : (
                      'Распознать файл'
                    )}
                  </Button>
                )}

                {/* Кнопка "Распознать запись" — если есть запись */}
                {recordedBlob && (
                  <Button
                    variant="success"
                    onClick={transcribeRecording}
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
                        Распознавание...
                      </>
                    ) : (
                      'Распознать запись'
                    )}
                  </Button>
                )}

                {/* Кнопка "Очистить" */}
                <Button
                  variant="outline-secondary"
                  onClick={handleSttClear}
                  disabled={loading || micState === 'recording'}
                >
                  Очистить
                </Button>
              </div>
            </Card.Body>
          </Card>

          {/* Блок результата STT — показывается только если есть распознанный текст */}
          {recognizedText && (
            <Card className="shadow-sm mt-3">
              <Card.Body>
                {/* Заголовок карточки результата */}
                <h5 className="card-title">Распознанный текст</h5>
                {/* Поле с текстом — только для чтения */}
                <Form.Control
                  as="textarea"
                  rows={10}
                  value={recognizedText}
                  readOnly  // Только для чтения — нельзя редактировать
                  style={{ resize: 'vertical', minHeight: '200px' }}
                  className="mb-3"
                />
                {/* Контейнер для кнопки копирования */}
                <div className="d-grid">
                  {/* Синяя кнопка копирования в буфер обмена */}
                  <Button variant="info" onClick={handleCopyText}>
                    Копировать текст
                  </Button>
                </div>
              </Card.Body>
            </Card>
          )}
        </Tab>

        {/* Вкладка DeepSeek — вопрос к AI и озвучка ответа */}
        <Tab eventKey="deepseek" title="DeepSeek AI">
          <Card className="shadow-sm">
            <Card.Body>
              {/* API-ключ */}
              <Form.Group className="mb-3">
                <Form.Label>API-ключ DeepSeek</Form.Label>
                <Form.Control
                  type="password"
                  value={deepseekApiKey}
                  onChange={(e) => setDeepseekApiKey(e.target.value)}
                  placeholder="sk-..."
                />
                <Form.Text className="text-muted">
                  Ключ не сохраняется. Получите на{' '}
                  <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer">
                    platform.deepseek.com
                  </a>
                </Form.Text>
              </Form.Group>

              <Row className="mb-3">
                <Col xs={12} md={6}>
                  <Form.Group>
                    <Form.Label>Модель</Form.Label>
                    <Form.Select value={deepseekModel} onChange={(e) => setDeepseekModel(e.target.value)}>
                      {DEEPSEEK_MODELS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Group>
                    <Form.Label>Системный промпт</Form.Label>
                    <Form.Select value={deepseekSystemPrompt} onChange={(e) => setDeepseekSystemPrompt(e.target.value)}>
                      {DEEPSEEK_SYSTEM_PROMPTS.map((p) => (
                        <option key={`prompt-${p.value}`} value={p.value}>{p.label}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-3">
                <Form.Label>Вопрос</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={uiMode === 'mobile' ? 4 : 5}
                  value={deepseekQuestion}
                  onChange={(e) => setDeepseekQuestion(e.target.value)}
                  placeholder="Задайте вопрос..."
                  style={{ resize: 'vertical', minHeight: uiMode === 'mobile' ? '100px' : '120px' }}
                />
              </Form.Group>

              <div className="d-grid gap-2">
                <Button
                  variant="primary"
                  onClick={handleAskDeepseek}
                  disabled={deepseekLoading}
                  size="lg"
                >
                  {deepseekLoading ? (
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
                  onClick={handleDeepseekClear}
                  disabled={deepseekLoading}
                >
                  Очистить
                </Button>
              </div>
            </Card.Body>
          </Card>

          {deepseekAnswer && (
            <Card className="shadow-sm mt-3">
              <Card.Body>
                <h5 className="card-title">Ответ DeepSeek</h5>
                <Form.Control
                  as="textarea"
                  rows={uiMode === 'mobile' ? 6 : 10}
                  value={deepseekAnswer}
                  readOnly
                  style={{ resize: 'vertical', minHeight: uiMode === 'mobile' ? '150px' : '200px' }}
                  className="mb-3"
                />
                <div className="d-grid gap-2">
                  <Button variant="info" onClick={handleCopyDeepseekAnswer}>
                    Копировать
                  </Button>
                  <Button variant="success" onClick={handleSynthesizeDeepseekAnswer} disabled={loading}>
                    {loading ? (
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
        </Tab>
      </Tabs>

      {/* Блоки ошибок — показываются только если есть error или deepseekError */}
      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}
      {deepseekError && (
        <Alert variant="danger" className="mt-3">
          {deepseekError}
        </Alert>
      )}
    </Container>
  )
}

// Экспортируем компонент как default
export default App
