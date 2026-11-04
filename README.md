# Text-to-Speech / Speech-to-Text

Локальное веб-приложение для синтеза и распознавания русской речи. Четыре вкладки: озвучка текста, распознавание аудио, клонирование голоса и вопросы к DeepSeek с озвучкой ответа.

Инференс идёт **на CPU, локально**: текст и аудио не отправляются в облако. Внешний сервис только DeepSeek, и он необязателен.

---

## Возможности

### Текст в речь (Silero TTS)
- 5 голосов: Ксения (2 варианта), Бая, Айдар, Евгений
- Русская нормализация текста: годы в нужном падеже, дроби, проценты, математические знаки, аббревиатуры и IT-термины
- Ручное ударение: `вод[!]а` — `[!]` ставится перед ударной гласной
- SSML: `<break>`, `<prosody>` с проверенными значениями и встроенной справкой
- Английские фразы читаются моделью `v3_en` голосом, подобранным под выбранного диктора; одиночные термины транслитерируются
- Режим подкаста: теги `[voice:aidar]`, `[pause:1.5]`, `[voice:clone:<id>]`
- Разбивка длинного текста на чанки, воспроизведение и скачивание MP3
- Лимит в интерфейсе — 5000 символов (на бэкенде ограничения длины нет)

### Речь в текст (Whisper)
- Загрузка MP3, WAV, OGG, FLAC, WEBM до 25 МБ
- Проверка сигнатуры файла (magic bytes) до отправки
- Запись с микрофона прямо в браузере: WebM → WAV без ffmpeg
- Копирование распознанного текста

### Мой голос (XTTS v2)
- Клонирование по образцу 6–30 секунд чистой речи, без дообучения
- Загрузка файла или запись с микрофона
- Список голосов, тестовый синтез, удаление
- Клонированные голоса доступны в селекте TTS и в подкастах через `[voice:clone:<id>]`
- Та же нормализация текста, что и у Silero

### DeepSeek AI
- Модели `deepseek-chat` и `deepseek-reasoner`
- Готовые системные промпты (ассистент, программист, преподаватель, копирайтер)
- Озвучка ответа одним нажатием с переходом на вкладку TTS

### Интерфейс
- Toast-уведомления вместо блокирующих Alert
- Индикатор потери интернета
- Сохранение настроек в localStorage между сессиями
- Адаптивная вёрстка, выборочный импорт Bootstrap

---

## Стек

| Слой | Технологии |
|---|---|
| Backend | FastAPI 0.104.1, uvicorn 0.24.0, Python 3.9–3.11 (проверено на 3.11.9) |
| TTS (рус.) | Silero `v5_6_ru`, torch/torchaudio 2.1.1 |
| TTS (англ.) | Silero `v3_en` |
| Клонирование | XTTS v2 (Coqui TTS 0.22.0), `transformers` 4.46.3 |
| STT | OpenAI Whisper `small`, librosa 0.10.1 |
| LLM | DeepSeek API (OpenAI-совместимый клиент) |
| Frontend | React 18, Vite 5, TypeScript 5.3+, React Bootstrap 5 |

Версии зафиксированы полным lock-файлом `backend/requirements.txt`. `transformers` нельзя обновлять до 5.x: там удалён `BeamSearchScorer`, нужный XTTS.

---

## Требования

- Python 3.9–3.11. XTTS v2 не устанавливается на 3.8 и 3.12+
- Node.js 18+ и npm
- 4 ГБ ОЗУ для Silero + Whisper; 8 ГБ, если планируется клонирование голоса
- Интернет при первом запуске — скачиваются веса моделей
- Для записи с микрофона в продакшене нужен HTTPS (ограничение браузеров)

---

## Установка

### Backend

Порядок важен: `setup.py` пакетов TTS и openai-whisper импортируют Cython и numpy при сборке, поэтому они должны уже стоять в окружении.

```bash
cd backend
py -3.11 -m venv venv
venv\Scripts\activate              # Windows
# source venv/bin/activate         # Linux / macOS

pip install --upgrade pip
pip install "Cython==3.3.1" "wheel==0.45.1" "numpy==1.24.4"
pip install --no-build-isolation -r requirements.txt
```

`requirements.txt` — полный `pip freeze`, а не список прямых зависимостей. Не редактируйте версии вручную.

### Frontend

```bash
cd frontend
npm install
```

---

## Запуск

```bash
# терминал 1
cd backend
venv\Scripts\activate
python main.py          # http://localhost:8000

# терминал 2
cd frontend
npm run dev             # http://localhost:3000
```

Vite проксирует `/api/*` на `http://localhost:8000/*`, поэтому в дев-режиме CORS не мешает.

### Что скачается при первом запуске

| Модель | Размер | Когда |
|---|---|---|
| Silero `v5_6_ru` | ≈ 141 МБ | при старте сервера |
| Silero `v3_en` | ≈ 55 МБ | при первой английской фразе |
| Whisper `small` | ≈ 500 МБ | при первом распознавании |
| XTTS v2 | пакет ≈ 2 ГБ + веса | при первом клонированном синтезе |

Кэш: `~/.cache/torch/hub/`, `~/.cache/whisper/`, Coqui — `%LOCALAPPDATA%\tts` в Windows и `~/.local/share/tts` в Linux. `COQUI_TOS_AGREED=1` сервис выставляет автоматически.

---

## API

| Метод | Путь | Описание |
|---|---|---|
| POST | `/synthesize` | Текст → MP3 |
| POST | `/transcribe` | multipart `audio` → распознанный текст |
| GET | `/health` | Проверка работоспособности |
| POST | `/ask_deepseek` | Вопрос → ответ LLM |
| POST | `/voices/register` | multipart `audio` (+ query `name`) → `voice_id` |
| GET | `/voices` | Список клонированных голосов |
| DELETE | `/voices/{voice_id}` | Удалить голос |

Пример синтеза:

```bash
curl -X POST http://localhost:8000/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Привет! Сегодня 4 ноября 2026 года.","speaker":"kseniya"}' \
  --output speech.mp3
```

Тело `/synthesize`: `text`, `speaker`, `put_accent`, `put_yo`, `podcast_mode`, `english_mode` (`voice` | `transliterate`), `voice_id`. Если задан `voice_id`, поле `speaker` игнорируется.

Ошибки: `400` — пустой или невалидный ввод, `404` — голос не найден при `DELETE /voices/{id}`, `500` — ошибка модели (в том числе неизвестный `voice_id` при синтезе).

---

## Тесты

### Backend — только из каталога `backend/` и интерпретатором venv

```bash
cd backend
venv\Scripts\python.exe -m pytest tests -q
```

119 тестов: 118 проходят, 1 известный провал — `TestSTTService::test_transcribe_calls_whisper` использует путь `/tmp/test.mp3`, и `os.unlink` в `finally` не находит файл на Windows. Это дефект теста, а не сервиса.

Системный `python -m pytest` может не найти pytest, а запуск из корня репозитория падает на импорте `tts_service`.

### Frontend

```bash
cd frontend
npm run type-check   # tsc --noEmit, должен быть чистым
npm test             # vitest run — 3 теста audioUtils
npm run lint         # eslint: 0 ошибок, 1 warning fast-refresh
```

CI в репозитории нет — проверки запускаются вручную.

---

## Структура проекта

```
backend/
  main.py                 HTTP-слой и Pydantic-модели
  tts_service.py          Silero: модели, чанки, подкаст, склейка
  stt_service.py          Whisper + librosa
  voice_clone_service.py  XTTS v2 и реестр голосов
  deepseek_service.py     клиент DeepSeek
  text_normalization.py   нормализация русского текста
  voices/                 образцы голосов (в git не попадает)
  tests/                  pytest
frontend/src/
  App.tsx                 вкладки, глобальное состояние
  components/             TtsTab, SttTab, DeepseekTab, VoiceCloneTab и карточки
  hooks/                  useRecording, useLocalStorage, useOnlineStatus, useToastError
  utils/                  audioUtils (WAV), fileValidation (magic bytes)
  types/api.ts            типы запросов и ответов
docs/
  DOCUMENTATION.md        архитектура и API
  LINUX_DEPLOY.md         деплой на Ubuntu/Debian
  TROUBLESHOOTING.md      частые проблемы (частично устарел)
  SCRIPTS.md              npm-команды (частично устарел)
```

---

## Ограничения

- **Только CPU.** GPU не используется: `torch.device('cpu')` захардкожен, XTTS запускается с `gpu=False`. Клонированный синтез на CPU заметно медленнее Silero.
- **Запросы к моделям сериализованы.** `run_in_threadpool` не блокирует event loop, но `threading.Lock` в каждом сервисе выстраивает параллельные запросы в очередь.
- **Нет аутентификации, лимитов и квот.** CORS открыт (`allow_origins=["*"]` вместе с `allow_credentials=True` — комбинация, которую браузеры не поддерживают). Для локального запуска это нормально, для публичного — нет.
- **Нет Docker и CI.** Есть инструкция `docs/LINUX_DEPLOY.md`, но не контейнеризация.
- **Документация без CI-проверки.** README, `QWEN.md` и `docs/` синхронизированы с кодом на 2026-11-04, но автоматической сверки нет — при изменении API обновляйте их вручную. PWA и SSE в проекте отсутствуют: синтез — обычный `fetch` с ожиданием всего blob, прогресс распознавания — эмуляция таймером.
- **Лимит 5000 символов — только в UI.**

---

## Лицензия

Файла `LICENSE` в репозитории нет. Важно учитывать лицензии моделей:

- Silero `v5_6_ru` — **CC BY-NC 4.0**, коммерческое использование запрещено. MIT только у `v5_cis_base`.
- XTTS v2 (Coqui TTS) — **CPML**, также некоммерческая.
- OpenAI Whisper — MIT.

Для коммерческого использования потребуется заменить модели или получить отдельную лицензию.

---

## Changelog

### v1.2.0 — клонирование голоса
- Вкладка «Мой голос»: регистрация образца 6–30 сек, список, тест, удаление
- API: `POST /voices/register`, `GET /voices`, `DELETE /voices/{voice_id}`, поле `voice_id` в `/synthesize`
- Подкасты с клоном: `[voice:clone:<id>]`
- XTTS v2 с ленивой загрузкой, ресемплинг 24 → 48 кГц при склейке с Silero
- `requirements.txt` переведён на полный lock

### v1.1.1 — конкурентность
- `run_in_threadpool` для тяжёлых эндпоинтов
- Уникальные временные файлы вместо фиксированного имени
- `threading.Lock` для инференса TTS/STT

### v1.1.0 — TypeScript
- Фронтенд переведён на TypeScript со строгим режимом
- Компоненты и хуки разделены по файлам

### v1.0.0 — первая версия
- FastAPI + React/Vite
- Silero TTS, Whisper STT, DeepSeek
