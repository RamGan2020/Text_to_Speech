# Troubleshooting Guide

## Общие проблемы

### Frontend не запускается / ошибка в консоли

**Ошибка:** "error in console"
1. Убедитесь что Node.js >= 20.x
2. Перезапустите frontend:
```bash
cd frontend
npm install
npm run dev
```

**Ошибка:** "Cannot find module 'tsconfig.json'"
- Убедитесь что `tsconfig.json` существует в `./`
- Проверьте ссылки в `tsconfig.json`

**Ошибка:** "TypeScript errors"
```bash
npm run type-check
```

### Backend не запускается

**Ошибка:** "Python Interpreter not found"
- Установите Python 3.9–3.11 (XTTS v2/TTS не встаёт на 3.8 и 3.12+)
- В Windows: https://python.org/downloads/ (выбирайте 3.11)

**Ошибка:** `No matching distribution found for TTS==0.22.0`
- Вы используете Python 3.8 или 3.12+. Создайте venv на Python 3.11:
```bash
py -3.11 -m venv venv   # Windows
python3.11 -m venv venv # Linux/Mac
```

**Ошибка:** "venv not created"
```bash
cd backend
python -m venv venv
```

**Ошибка:** `[Errno 10048] error while attempting to bind on address ('0.0.0.0', 8000)` (Windows)
- Порт 8000 занят старым процессом бэкенда. Найдите и завершите его:
```bash
netstat -ano | findstr :8000   # смотрим PID в последней колонке
taskkill /PID <PID> /F
```
- Либо запустите на другом порту: `uvicorn main:app --port 8001`

### Ошибки установки TTS / XTTS v2

**Ошибка:** `ModuleNotFoundError: No module named 'pkg_resources'` при сборке openai-whisper
- Ставьте с флагом `--no-build-isolation` (используется setuptools из venv, а не изолированный):
```bash
pip install wheel "numpy==1.24.4" Cython
pip install --no-build-isolation -r requirements.txt
```

**Ошибка:** `ModuleNotFoundError: No module named 'numpy'` (или 'Cython') при сборке TTS
- `setup.py` пакета TTS импортирует numpy/Cython на этапе сборки.
  Сначала установите их в venv (см. команду выше), потом повторите установку.

**Ошибка:** `No module named 'TTS'` при нажатии «Проверить» (клонирование голоса)
- Пакет `TTS` (Coqui) не установлен в том окружении, где запущен backend.
- Backend должен быть запущен **из venv**: `venv\Scripts\python main.py` (а не глобальным python).
- После `pip install` бэкенд нужно перезапустить, чтобы Python подхватил новый модуль.

**Долго грузится первый синтез клонированным голосом**
- Нормально: при первом вызове XTTS v2 скачивает модель ~1.8 ГБ в `%USERPROFILE%\.cache\tts`.
- На CPU синтез фразы занимает десятки секунд.

### CORS Errors

**Ошибка:** "Access-Control-Allow-Origin"
- Проверьте `main.py` CORS настройки
- В продакшене ограничить `allow_origins`

### Import errors

**Ошибка:** "Import cannot find module"
- Перезапустите dev-сервер
- Очистите кэш: `rm -rf node_modules/.vite`

---

## TypeScript Specific

### Type errors

**Ошибка:** "Type is not assignable"
- Проверьте типы в `src/types/api.ts`
- Убедитесь что дженерики правильно используются

**Ошибка:** "Cannot find module"
- Проверьте пути в `tsconfig.json`
- Убедитесь что файл существует

### Linting Errors

**Ошибка:** ESLint warnings
```bash
npm run lint
```

Fix with:
```bash
npm run lint:fix
```

---

## SSE Streaming Issues

### Progress бар не работает

**Причина:** SSE не подключается
1. Проверьте backend `/synthesize_stream` работает
2. Проверьте CORS прокси в `vite.config.ts`
3. В консоли браузера найдите error

**Ошибка:** "Failed to fetch"
- Проверьте backend слушается на 8000
- Проверьте proxy настройки в `vite.config.ts`

---

## Performance Issues

### Slow TTS Synthesis
**Почему:** Первый запуск медленно (загрузка модели ~1000-5000ms)
**Решение:** Запуск backend один раз — модель кэшируется

### High Memory
**Почему:** PyTorch потребляет память при загрузке
**Решение:** Настройте `shared_memory` (опционально)

---

## Quick Fixes

### Everything Broken
```bash
cd frontend
npm install
cd ../backend
# build-зависимости для сборки TTS/whisper, затем весь lock:
pip install "Cython==3.3.1" "wheel==0.45.1" "numpy==1.24.4"
pip install --no-build-isolation -r requirements.txt
python main.py
cd ../frontend
npm run dev
```

### Clear Cache
```bash
cd frontend
rm -rf node_modules ~/.npm/_cacache
npm cache clean --force
npm install
```

### Reset
```bash
cd backend
rm -rf venv
cd ..
cd frontend
rm -rf node_modules
```

---

## Debugging Tips

### Check Backend
```bash
# Check if backend is listening
curl http://localhost:8000/health
# Should return: {"status": "ok"}
```

### Check Frontend
```bash
# Check Vite dev server
# Should show: "Local: http://localhost:3000"
```

### Check Browser Console
- F12 → Console
- Check for red errors
- Look for 404/500 in Network tab

---

## Common Port Conflicts

### Port 3000 busy
```bash
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac:
lsof -ti:3000
kill <PID>
```

### Port 8000 busy
(из предыдущего раздела)

---

## Environment Issues

### Node 20+ Required
```bash
# Check version
node --version

# Should be 17.0.0
```

### Python 3.8+ Required
```bash
python --version
```