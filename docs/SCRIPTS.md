# NPM Scripts Cheat Sheet

Все команды frontend выполняются из каталога `frontend/`.

## Development

| Команда | Описание |
|---------|----------|
| `npm run dev` | Dev-сервер Vite на http://localhost:3000 с прокси `/api` → `http://localhost:8000` |
| `npm run build` | Production-сборка в `dist/` |
| `npm run preview` | Локальный просмотр собранного `dist/` |
| `npm run type-check` | `tsc --noEmit`, проверка типов без генерации файлов |

## Linting

| Команда | Описание |
|---------|----------|
| `npm run lint` | ESLint по `src/**/*.ts,tsx` |

Скрипта `lint:fix` в `package.json` **нет**. Автоисправление запускается напрямую:

```bash
npx eslint src --ext .ts,.tsx --fix
```

Ожидаемое состояние `npm run lint`: **0 ошибок, 1 warning** `react-refresh/only-export-components` в `hooks/useOnlineStatus.tsx`. Warning не блокирует сборку.

## Testing

| Команда | Описание |
|---------|----------|
| `npm test` | Однократный прогон Vitest (`vitest run`), сейчас 3 теста `audioUtils` |
| `npm run test:watch` | Vitest в режиме наблюдения |

Backend-тесты запускаются отдельно, только из `backend/` и интерпретатором venv:

```bash
cd backend
venv\Scripts\python.exe -m pytest tests -q
```

Ожидаемо: `118 passed, 1 failed`. Известный провал — `TestSTTService::test_transcribe_calls_whisper` (путь `/tmp/test.mp3` на Windows). Подробнее — в `TROUBLESHOOTING.md`.

## TypeScript

| Команда | Описание |
|---------|----------|
| `npm run type-check` | Проверка типов без генерации (`tsc --noEmit`) |

## Useful Commands

### Clean Install
```bash
cd frontend
rmdir /s /q node_modules      # Windows;  rm -rf node_modules — Linux/macOS
npm cache clean --force
npm ci
```

`npm ci` использует `package-lock.json` и ставит ровно зафиксированные версии. `npm install` допустим, но может обновить lock-файл.

### Type Safety
```bash
npm run type-check
```

### Lint
```bash
npm run lint
```

### Build for Production
```bash
npm run build
```

Сборка кладёт статику в `frontend/dist/`. Прокси `/api` из `vite.config.ts` — только для dev-сервера; в продакшене тот же путь должен проксировать nginx или другой reverse proxy на backend.

### Verify Build
```bash
npm run preview
```

---

## Backend Commands

### Первичная установка
```bash
cd backend
py -3.11 -m venv venv
venv\Scripts\activate
pip install --upgrade pip
pip install "Cython==3.3.1" "wheel==0.45.1" "numpy==1.24.4"
pip install --no-build-isolation -r requirements.txt
```

### Запуск
```bash
# Windows (из активированного venv)
python main.py

# Без активации
venv\Scripts\python.exe main.py

# Linux / macOS
source venv/bin/activate
python main.py
```

Сервер слушает `0.0.0.0:8000`; порт зашит в `backend/main.py`.

---

## Environment Variables

### Backend
```env
# Необязательно: ключ можно передать в теле запроса /ask_deepseek
DEEPSEEK_API_KEY=your_key_here
```

Больше переменных окружения проект не использует. `COQUI_TOS_AGREED=1` сервис выставляет сам перед загрузкой XTTS.

### Frontend
Файл `.env` не нужен. Адрес backend задан в `frontend/vite.config.ts`:

```ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  },
}
```

Переменная `VITE_API_URL` в коде не используется — не добавляйте её в `.env` в расчёте на смену адреса.
