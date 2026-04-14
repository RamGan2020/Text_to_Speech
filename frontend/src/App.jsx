// App.jsx — Главный компонент приложения Text-to-Speech / Speech-to-Text
// Содержит два режима: TTS (текст → аудио) и STT (аудио → текст)

import { useState, useRef } from 'react'  // Импортируем хуки useState и useRef
import { Container, Form, Button, Alert, Spinner, Row, Col, Tabs, Tab, Card } from 'react-bootstrap'  // Импортируем компоненты Bootstrap
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

function App() {
  // === Состояния компонента (данные, которые меняются и вызывают перерисовку) ===

  // Активная вкладка: 'tts' (текст→аудио) или 'stt' (аудио→текст)
  const [activeTab, setActiveTab] = useState('tts')

  // --- Состояния для режима TTS (Text-to-Speech) ---
  // Текст в поле ввода
  const [text, setText] = useState('')
  // URL аудио-файла (blob) для плеера
  const [audioUrl, setAudioUrl] = useState(null)
  // Выбранный голос
  const [speaker, setSpeaker] = useState('kseniya')
  // Флаг расстановки ударений
  const [putAccent, setPutAccent] = useState(true)
  // Флаг расстановки буквы 'ё'
  const [putYo, setPutYo] = useState(true)

  // --- Состояния для режима STT (Speech-to-Text) ---
  // Загруженный аудио-файл
  const [sttFile, setSttFile] = useState(null)
  // Распознанный текст
  const [recognizedText, setRecognizedText] = useState('')

  // --- Общие состояния ---
  // Флаг загрузки (показывает спиннер)
  const [loading, setLoading] = useState(false)
  // Текст ошибки (null = нет ошибки)
  const [error, setError] = useState(null)

  // Ссылка на input для загрузки файла
  const fileInputRef = useRef(null)

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

  // === Обработчики событий для режима STT ===

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
  }

  // Обработчик кнопки "Копировать текст"
  const handleCopyText = () => {
    // Копируем распознанный текст в буфер обмена
    navigator.clipboard.writeText(recognizedText)
  }

  // === JSX-разметка (то, что видит пользователь) ===

  return (
    // Контейнер Bootstrap с отступами сверху/снизу
    <Container className="py-5">
      {/* Центрированный заголовок с отступом снизу */}
      <div className="text-center mb-4">
        {/* Главный заголовок страницы */}
        <h1>Text-to-Speech / Speech-to-Text</h1>
        {/* Подсказка под заголовком */}
        <p className="text-muted">Синтез речи из текста или распознавание речи из аудио</p>
      </div>

      {/* Вкладки для переключения между режимами TTS и STT */}
      <Tabs
        activeKey={activeTab}  // Активная вкладка (из состояния)
        onSelect={(k) => {  // Обработчик переключения вкладки
          setActiveTab(k)  // Обновляем состояние
          setError(null)   // Сбрасываем ошибку при переключении
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
                />
                {/* Мелкий текст под полем — счётчик символов */}
                <Form.Text className="text-muted">
                  Символов: {text.length}
                </Form.Text>
              </Form.Group>

              {/* Строка Bootstrap с настройками (отступ снизу) */}
              <Row className="mb-3">
                {/* Колонка шириной 6 из 12 (половина) — выбор голоса */}
                <Col md={6}>
                  <Form.Group>
                    {/* Метка выпадающего списка */}
                    <Form.Label>Голос</Form.Label>
                    <Form.Select value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
                      {/* Проходим по всем голосам, создаём <option> */}
                      {SPEAKERS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                {/* Колонка шириной 6 из 12 (вторая половина) — переключатели */}
                <Col md={6}>
                  <Form.Group className="d-flex flex-column justify-content-center h-100">
                    {/* Переключатель расстановки ударений */}
                    <Form.Check
                      type="switch"
                      id="put-accent"
                      label="Расстановка ударений"
                      checked={putAccent}
                      onChange={(e) => setPutAccent(e.target.checked)}
                      className="mb-2"
                    />
                    {/* Переключатель расстановки буквы Ё */}
                    <Form.Check
                      type="switch"
                      id="put-yo"
                      label="Расстановка буквы Ё"
                      checked={putYo}
                      onChange={(e) => setPutYo(e.target.checked)}
                    />
                  </Form.Group>
                </Col>
              </Row>

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
                  accept=".mp3,.wav,.ogg,.m4a,.flac"  // Разрешённые расширения
                  onChange={handleFileChange}  // Обработчик выбора файла
                  ref={fileInputRef}  // Ссылка на элемент для очистки
                />
                {/* Мелкий текст под полем — подсказка о форматах */}
                <Form.Text className="text-muted">
                  Поддерживаются форматы: MP3, WAV, OGG, M4A, FLAC
                </Form.Text>
              </Form.Group>

              {/* Показываем имя выбранного файла */}
              {sttFile && (
                <div className="mb-3">
                  <strong>Выбран файл:</strong> {sttFile.name} ({(sttFile.size / 1024).toFixed(1)} КБ)
                </div>
              )}

              {/* Контейнер для кнопок (grid, с зазором) */}
              <div className="d-grid gap-2">
                {/* Кнопка "Распознать" — основная */}
                <Button
                  variant="primary"
                  onClick={handleTranscribe}
                  disabled={loading || !sttFile}  // Отключаем, если нет файла или идёт загрузка
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
                      Распознавание...
                    </>
                  ) : (
                    'Распознать'
                  )}
                </Button>
                {/* Кнопка "Очистить" — контурная, серая */}
                <Button
                  variant="outline-secondary"
                  onClick={handleSttClear}
                  disabled={loading}
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
      </Tabs>

      {/* Блок ошибки — показывается только если есть error */}
      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}
    </Container>
  )
}

// Экспортируем компонент как default
export default App
