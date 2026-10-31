# 🎤 Text-to-Speech / Speech-to-Text

Веб-приложение для синтеза речи (TTS) и распознавания речи (STT) с использованием нейросетевых моделей **Silero TTS v5** и **OpenAI Whisper**. Интеграция с **DeepSeek AI** для генерации и озвучки ответов.

[![TypeScript Supported](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.8+-blue)](https://python.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 🚀 Быстрый старт

### Требования

**Backend:**
- Python 3.8+
- pip
- FastAPI, uvicorn, torch, torchaudio

**Frontend:**
- Node.js 20+ или выше
- npm >= 9.0.0

### Установка

#### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
python main.py
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Запуск приложения
Откройте http://localhost:3000 в браузере.

---

## 🌟 Возможности

### 📢 Текст в речь (TTS)
- ✅ Бесплатно и локально (без внешних API)
- ✅ 5 синтезиторов: Ксения (2), Бая, Айдар, Евгений
- ✅ Настройки: расстановка ударений, буква «Ё»
- ✅ Лимит текста: 5000 символов с визуальным индикатором
- ✅ Режим подкаста — теги `[voice:name]` и `[pause:time]`
- ✅ PWA добавление — приложение доступно офлайн
- ✅ **SSE Progress** — реальный прогресс-бар синтеза

### 🎙️ Речь в текст (STT)
- ✅ Распознавание MP3, WAV, OGG, FLAC, WEBM
- ✅ Валидация формата файла (magic bytes) перед отправкой
- ✅ Прогресс-бар для длительных операций
- ✅ Русский язык
- ✅ Копирование текста в буфер обмена
- ✅ Максимальный размер файла: 25 МБ

### 🎤 Запись с микрофона
- ✅ Запись речи прямо в браузере
- ✅ Визуальный индикатор и таймер записи
- ✅ Автоматическая конвертация webm → WAV
- ✅ Распознавание записи в текст

### 🤖 DeepSeek AI
- ✅ Задайте вопрос модели `deepseek-chat` или `deepseek-reasoner`
- ✅ Выбор системного промпта (роль ассистента)
- ✅ Озвучка ответа через TTS одним нажатием

### 🛠️ Технический стек
- **Frontend:** React 18, Vite, TypeScript 5.3, React Bootstrap
- **Backend:** FastAPI, uvicorn
- **TTS Model:** Silero TTS v5 (`v5_6_ru`, PyTorch)
- **EN TTS Model:** Silero TTS v3 (`v3_en`) — английские фразы голосом, подобранным под диктора
- **STT Model:** OpenAI Whisper (HuggingFace)
- **AI Model:** DeepSeek API
- **PWA:** ServiceWorker + Manifest

### 📱 Additional
- ✅ Toast-уведомления (react-hot-toast)
- ✅ Индикатор потери интернета (offline-banner)
- ✅ Сохранение настроек между сессиями (localStorage)
- ✅ Hover-анимации на десктопе, адаптив на мобильных

---

## 📚 Документация

- [Полная документация](docs/DOCUMENTATION.md) — API, архитектура
- [Продвинутая установка](docs/UPGRADE.md) — миграция для продакшена
- [NPM Scripts](docs/SCRIPTS.md) — все команды npm
- [Troubleshooting](docs/TROUBLESHOOTING.md) — частые проблемы

---

## 📌 Notes

### TypeScript Migration
Вся frontend часть переписана на **TypeScript** с полной типизацией:
- `[name].tsx` файлы для всех компонентов
- `src/types/api.ts` — типы для API взаимодействия
- Строго typed пропсы и state

### SSE Streaming
Синтез речи теперь использует **Server-Sent Events** для передачи прогресса:
- Backend: `/synthesize_stream` — SSE endpoint
- Frontend: `fetch()` streaming для обработки событий
- Поддержка ошибок и перезагрузки

---

## 🚧 Known Issues

1. **PowerShell 5.1+** — поддержка только в PowerShell 7+
2. **Настройка CORS в продакшене** — `allow_origins` ограничить на `localhost`
3. **Server Time** — используйте UTC для consistency

---

## 📌 Troubleshooting

### Frontend не запускается
```bash
cd frontend
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### TypeScript ошибки
```bash
npm run type-check
npm run lint
```

### Backend не отвечает
```bash
cd backend
# Проверьте наличие Python 3.8+
# Проверьте uvicorn запуска
```

---

## 📝 Changelog

### v1.1.0 — TypeScript & SSE Update
- Полная типизация React компонентов
- SSE streaming для прогресс-бара TTS
- Fix: дублирование кода в `PodcastModePanel`
- ESLint configuration for TypeScript

### v1.0.0 — Initial Release
- React + Vite Parent (TypeScript)
- FastAPI Backend
- AI Integration (DeepSeek)
- Better Error Handling (Toast)

---

## 🤝 Contributing
1. Fork the repo
2. Create feature branch
3. Ensure all tests pass
4. Submit PR

## 📜 License
MIT License — see `LICENSE` file

---

## 🙏 Acknowledgments
- Silero TTS team for model
- OpenAI Whisper
- DeepSeek AI