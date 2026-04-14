// App.jsx — Главный компонент приложения Text-to-Speech
// Содержит всю логику интерфейса: ввод текста, настройки голоса, синтез, воспроизведение, скачивание

import { useState } from 'react'  // Импортируем хук useState для управления состоянием
import { Container, Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap'  // Импортируем компоненты Bootstrap
import './App.css'  // Импортируем пользовательские стили

// URL backend-сервера для API-запросов
const API_URL = 'http://localhost:8000'

// Массив доступных голосов — используется для выпадающего списка
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

  // Текст в поле ввода
  const [text, setText] = useState('')
  // URL аудио-файла (blob) для плеера
  const [audioUrl, setAudioUrl] = useState(null)
  // Флаг загрузки (показывает спиннер)
  const [loading, setLoading] = useState(false)
  // Текст ошибки (null = нет ошибки)
  const [error, setError] = useState(null)
  // Выбранный голос
  const [speaker, setSpeaker] = useState('kseniya')
  // Флаг расстановки ударений
  const [putAccent, setPutAccent] = useState(true)
  // Флаг расстановки буквы 'ё'
  const [putYo, setPutYo] = useState(true)

  // === Обработчики событий ===

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
          speaker: speaker,                // Выбранный голос
          put_accent: putAccent,  // Флаг расстановки ударений
          put_yo: putYo,          // Флаг расстановки буквы 'ё'
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

  // Обработчик кнопки "Очистить" — сбрасывает все поля
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

  // === JSX-разметка (то, что видит пользователь) ===

  return (
    // Контейнер Bootstrap с отступами сверху/снизу
    <Container className="py-5">
      {/* Центрированный заголовок с отступом снизу */}
      <div className="text-center mb-4">
        {/* Главный заголовок страницы */}
        <h1>Text to Speech</h1>
        {/* Подсказка под заголовком */}
        <p className="text-muted">Введите текст для озвучивания</p>
      </div>

      {/* Карточка Bootstrap с лёгкой тенью */}
      <div className="card shadow-sm">
        {/* Содержимое карточки */}
        <div className="card-body">
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
        </div>
      </div>

      {/* Блок ошибки — показывается только если есть error */}
      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}

      {/* Блок результата — показывается только если есть audioUrl */}
      {audioUrl && (
        <div className="card shadow-sm mt-3">
          <div className="card-body">
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
          </div>
        </div>
      )}
    </Container>
  )
}

// Экспортируем компонент как default
export default App
