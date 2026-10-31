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
- Установите Python 3.8+
- В Windows: https://python.org/downloads/

**Ошибка:** "venv not created"
```bash
cd backend
python -m venv venv
```

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
pip install -r requirements.txt
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