# Text-to-Speech / Speech-to-Text Web Application

Web-приложение для синтеза речи (TTS) и распознавания речи (STT) с использованием нейросетевых моделей Silero TTS v4 и OpenAI Whisper.

## Быстрый старт

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux
pip install -r requirements.txt
python main.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Документация

- [Полная документация API и архитектуры](docs/DOCUMENTATION.md)
- [Инструкция по деплою на Linux](docs/LINUX_DEPLOY.md)

## Возможности

### Текст в речь (TTS)
- ✅ Бесплатно и локально (без внешних API)
- ✅ Нет ограничений на длину текста
- ✅ 5 голосов (3 женских, 2 мужских)
- ✅ Настройки: ударения, буква «ё»
- ✅ Воспроизведение и скачивание MP3

### Речь в текст (STT)
- ✅ Распознавание MP3, WAV, OGG, FLAC
- ✅ Русский язык
- ✅ Копирование текста в буфер обмена
- ✅ Максимальный размер файла: 25 МБ

### Запись с микрофона
- ✅ Запись речи прямо в браузере
- ✅ Визуальный индикатор и таймер записи
- ✅ Автоматическая конвертация webm → WAV
- ✅ Распознавание записи в текст
