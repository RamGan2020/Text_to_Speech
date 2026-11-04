# Troubleshooting Guide

Актуально на 2026-11-04. Проект — FastAPI + React, четыре вкладки: TTS, STT, DeepSeek, клонирование голоса.

---

## Общие проблемы

### Frontend не запускается

**Ошибка:** `error in console`, dev-сервер не поднимается
1. Проверьте Node.js: нужен **18+** (рекомендуется 20 LTS). Vite 5 не работает на старых версиях.
   ```bash
   node --version
   ```
2. Переустановите зависимости по lock-файлу:
   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

**Ошибка:** `Cannot find module 'tsconfig.json'`
- Запускайте команды из каталога `frontend/`, там лежат `tsconfig.json` и `tsconfig.node.json`.
- Не переносите `tsconfig.json` в корень репозитория.

**Ошибка:** ошибки TypeScript
```bash
cd frontend
npm run type-check
```

### Backend не запускается

**Ошибка:** `Python Interpreter not found`
- Нужен Python **3.9–3.11**: пакет XTTS v2 не устанавливается на 3.8 и 3.12+.
- В Windows проще создать venv явно:
  ```bash
  py -3.11 -m venv venv
  ```

**Ошибка:** `No matching distribution found for TTS==0.22.0`
- Причина та же: Python 3.8 или 3.12+. Пересоздайте venv на 3.11:
  ```bash
  py -3.11 -m venv venv        # Windows
  python3.11 -m venv venv      # Linux / macOS
  ```

**Ошибка:** `ModuleNotFoundError: No module named 'pkg_resources'` при сборке openai-whisper
- Ставьте с `--no-build-isolation`, чтобы использовался setuptools из venv:
  ```bash
  pip install --upgrade pip
  pip install "Cython==3.3.1" "wheel==0.45.1" "numpy==1.24.4"
  pip install --no-build-isolation -r requirements.txt
  ```

**Ошибка:** `ModuleNotFoundError: No module named 'numpy'` или `'Cython'` при сборке TTS
- `setup.py` пакетов TTS и openai-whisper импортируют numpy/Cython на этапе сборки.
  Установите их **до** основного `pip install` (команды выше), затем повторите.

**Ошибка:** `[Errno 10048] error while attempting to bind on address ('0.0.0.0', 8000)` (Windows)
- Порт 8000 занят старым процессом:
  ```bash
  netstat -ano | findstr :8000   # PID в последней колонке
  taskkill /PID <PID> /F
  ```
- Либо запустите на другом порту: `uvicorn main:app --port 8001`.
  Тогда обновите `target` в `frontend/vite.config.ts`, иначе прокси продолжит ходить на 8000.

**Ошибка:** `Address already in use` (Linux/macOS)
```bash
lsof -ti:8000 | xargs kill
```

### Ошибки установки TTS / XTTS v2

**Ошибка:** `No module named 'TTS'` при нажатии «Проверить» во вкладке «Мой голос»
- Пакет Coqui TTS не установлен в том окружении, где запущен backend.
- Backend должен работать из venv: `venv\Scripts\python.exe main.py`, а не глобальным Python.
- После `pip install` бэкенд нужно перезапустить.

**Ошибка:** `AssertionError: Speaker not in the supported list [...]` при старте
- Устаревший кэш `torch.hub`: в `C:\Users\<user>\.cache\torch\hub\snakers4_silero-models_master` лежит копия репозитория, где ещё нет `v5_6_ru`.
- В `_load_model()` есть fallback на `force_reload=True`; это разовая перекачка ~141 МБ. Если ошибка повторяется — удалите каталог кэша вручную и запустите снова.
- Это не проблема версии torch и не проблема голоса.

**Долго грузится первый синтез клонированным голосом**
- Нормально: при первом вызове XTTS v2 скачивает веса ~1.8 ГБ. Каталог кэша: Windows — `%LOCALAPPDATA%\tts`, Linux — `~/.local/share/tts`, macOS — `~/Library/Application Support/tts`.
- Пакет TTS с зависимостями занимает ~2 ГБ, поэтому импорт ленивый: модель грузится только при первом клонированном синтезе.
- На CPU синтез фразы может занимать десятки секунд.

**Ошибка:** `Образец слишком короткий` / `слишком длинный`
- XTTS принимает образец **6–30 секунд** чистой речи без музыки и шума.
- Форматы: MP3, WAV, OGG, FLAC, WEBM. **M4A отклоняется** — сконвертируйте файл.

**Ошибка:** `Не удалось прочитать аудио-файл`
- Файл повреждён или расширение не соответствует содержимому. Frontend проверяет magic bytes, но при прямом вызове API проверка не сработает.

### CORS Errors

**Ошибка:** `Access-Control-Allow-Origin`
- В дев-режиме фронтенд ходит на `/api/*`, а Vite проксирует на `http://localhost:8000` — CORS не участвует. Если запросы идут напрямую на 8000, проверьте `vite.config.ts`.
- В `backend/main.py` стоит `allow_origins=["*"]`, но вместе с `allow_credentials=True` браузеры такую комбинацию не принимают. Для продакшена задайте конкретный origin и уберите credentials, если cookies не нужны.

### Import errors

**Ошибка:** `Import cannot find module`
- Перезапустите dev-сервер.
- Очистите кэш Vite:
  ```bash
  cd frontend
  rm -rf node_modules/.vite
  ```
  В Windows: `rmdir /s /q node_modules\.vite`.

---

## TypeScript Specific

### Type errors

**Ошибка:** `Type is not assignable`
- Проверьте типы в `frontend/src/types/api.ts`.
- Все пропсы компонентов типизированы; `any` в проекте не используется.

**Ошибка:** `Cannot find module`
- Проверьте пути в `frontend/tsconfig.json` и что файл действительно существует.

### Linting

**Ошибка:** ESLint warnings
```bash
cd frontend
npm run lint
```

Скрипта `lint:fix` в `package.json` нет. Автоисправление — вручную:
```bash
npx eslint src --ext .ts,.tsx --fix
```

Ожидаемое состояние: **0 ошибок, 1 warning** `react-refresh/only-export-components` в `useOnlineStatus.tsx`. Это не блокирует сборку.

ESLint также печатает предупреждение, что установленный TypeScript 5.9 новее официально поддерживаемого `@typescript-eslint` 6.x. На проверку это не влияет.

---

## Прогресс синтеза и распознавания

**SSE в проекте нет.** Эндпоинта `/synthesize_stream` не существует.

- **Синтез TTS:** обычный `POST /synthesize`, браузер ждёт весь MP3-blob. Прогресс не передаётся, кнопка показывает спиннер. Долгий текст и XTTS на CPU могут отвечать десятки секунд — это нормально.
- **Распознавание STT:** прогресс-бар — **эмуляция таймером** на фронтенде (растёт до 80%, потом прыгает на 100% по ответу). Реального прогресса с сервера нет.
- **DeepSeek:** обычный `POST /ask_deepseek`, ждёт полный ответ.

Если запрос «висит», проверьте:
1. `curl http://localhost:8000/health` → `{"status": "ok"}`.
2. Что backend запущен из venv и модель догрузилась (в консоли есть `Модель ... загружена`).
3. Network tab браузера: запрос ушёл на `/api/...`, а не на несуществующий путь.

**Ошибка:** `Failed to fetch`
- Backend не слушает 8000 или упал при загрузке модели.
- Прокси в `vite.config.ts` должен указывать на `http://localhost:8000`.

---

## Performance Issues

### Медленный первый синтез
**Почему:** при старте скачивается и загружается Silero `v5_6_ru` (~141 МБ); при первом распознавании — Whisper `small` (~500 МБ); при первом клоне — XTTS v2 (~1.8 ГБ).
**Решение:** держите backend запущенным — модели остаются в памяти процесса и повторно не грузятся.

### Высокое потребление памяти
**Почему:** Silero + Whisper занимают несколько ГБ; XTTS добавляет ещё ~4 ГБ при синтезе.
**Решение:** для клонирования нужно около 8 ГБ ОЗУ. Закройте другие тяжёлые процессы; GPU в проекте не используется (`torch.device('cpu')`, XTTS с `gpu=False`).

### Запросы выполняются по очереди
**Почему:** `run_in_threadpool` не блокирует event loop, но `threading.Lock` в TTS/STT/XTTS-сервисах сериализует инференс — модели не потокобезопасны.
**Решение:** это ожидаемое поведение для CPU. Для параллельной обработки нужен GPU или очередь задач с несколькими воркерами.

---

## Тесты

### Backend
```bash
cd backend
venv\Scripts\python.exe -m pytest tests -q
```

Ожидаемо: **118 passed, 1 failed**. Падает `TestSTTService::test_transcribe_calls_whisper`: мок подставляет путь `/tmp/test.mp3`, и `os.unlink` в `finally` не находит файл на Windows. Это дефект теста, а не сервиса.

Если pytest не найден — вы запускаете системный Python, а не venv. Из корня репозитория тесты падают на импорте `tts_service` — запускайте только из `backend/`.

### Frontend
```bash
cd frontend
npm test             # vitest run, 3 теста audioUtils
npm run type-check   # tsc --noEmit
npm run lint
```

---

## Микрофон

**Ошибка:** браузер не даёт доступ к микрофону
- Разрешение выдаётся на origin. Для `localhost` исключение есть, для IP-адреса в локальной сети нужен **HTTPS**.
- Проверьте, что в системе есть микрофон и браузер не блокирует его в настройках сайта.
- Запись идёт через `MediaRecorder` (WebM/Opus), затем конвертируется в WAV в браузере. Если конвертация падает — обновите браузер.

**Ошибка:** запись есть, но распознавание пустое
- Слишком тихая запись или тишина. Проверьте уровень микрофона.
- Файл больше 25 МБ не принимается.

---

## DeepSeek

**Ошибка:** `API-ключ DeepSeek не указан`
- Передайте ключ в поле интерфейса или задайте `DEEPSEEK_API_KEY` перед запуском backend. Backend вернёт `400`.

**Ошибка:** `Неверный API-ключ DeepSeek`
- Ключ отозван или скопирован с пробелами. Проверьте на platform.deepseek.com. Внутри DeepSeek отвечает 401, но backend отдаёт `500` с текстом ошибки.

**Ошибка:** `Превышен лимит запросов DeepSeek`
- Подождите и повторите; проверьте баланс аккаунта. Внутри DeepSeek отвечает 429, backend отдаёт `500`.

Важно: сервер кэширует последний использованный ключ в памяти процесса. При многопользовательском запуске запрос без ключа может использовать ключ предыдущего пользователя — не выкладывайте сервис наружу без доработки.

---

## Quick Fixes

### Полная переустановка backend
```bash
cd backend
rmdir /s /q venv                  # Windows;  rm -rf venv — Linux/macOS
py -3.11 -m venv venv
venv\Scripts\activate
pip install --upgrade pip
pip install "Cython==3.3.1" "wheel==0.45.1" "numpy==1.24.4"
pip install --no-build-isolation -r requirements.txt
python main.py
```

### Полная переустановка frontend
```bash
cd frontend
rmdir /s /q node_modules          # Windows;  rm -rf node_modules — Linux/macOS
npm cache clean --force
npm ci
npm run dev
```

### Очистить кэш Vite
```bash
cd frontend
rmdir /s /q node_modules\.vite    # Windows
rm -rf node_modules/.vite         # Linux/macOS
```

Удаление `venv` и `node_modules` необратимо для локальных правок в них; исходный код и настройки не затрагиваются.

---

## Debugging Tips

### Check Backend
```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

### Check Frontend
Дев-сервер печатает `Local: http://localhost:3000`.

### Check Browser Console
- F12 → Console: красные ошибки.
- Network: статусы 400/404/500 и путь запроса (`/api/...`).

---

## Common Port Conflicts

### Port 3000 busy
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux / macOS
lsof -ti:3000 | xargs kill
```

### Port 8000 busy
См. раздел «Backend не запускается».

---

## Environment Issues

### Версия Node.js
```bash
node --version
```
Нужно **18+**, рекомендуется 20 LTS.

### Версия Python
```bash
python --version
```
Нужно **3.9–3.11**. Проверено на 3.11.9. Python 3.12+ не подходит из-за XTTS v2.
