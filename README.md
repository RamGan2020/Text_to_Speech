# Text-to-Speech Web Application

Web-приложение для синтеза речи (text-to-speech) с использованием модели Silero TTS v4.

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

- ✅ Бесплатно и локально (без внешних API)
- ✅ Нет ограничений на длину текста
- ✅ 5 голосов (3 женских, 2 мужских)
- ✅ Настройки: ударения, буква «ё»
- ✅ Воспроизведение и скачивание MP3
