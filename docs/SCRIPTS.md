# NPM Scripts Cheat Sheet

## Development

| Команда | Описание |
|---------|----------|
| `npm run dev` | Запуск dev-сервера Vite на http://localhost:3000 |
| `npm run build` | Сборка production-версии в `dist/` |
| `npm run preview` | Локальный просмотр production-сборки |
| `npm run type-check` | Проверка TypeScript код без генерации |

## Linting & Validation

| Команда | Описание |
|---------|----------|
| `npm run lint` | ESLint проверка кода |
| `npm run lint:fix` | Автоматический фикс linting ошибок |

## Testing

| Команда | Описание |
|---------|----------|
| `npm test` | Запуск тестов (vitest) |
| `npm run test:watch` | watcher mode для тестов |

## TypeScript

| Команда | Описание |
|---------|----------|
| `npm run type-check` | Проверка типов без генерации |

## Useful Commands

### Clean Install
```bash
cd frontend
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Type Safety
```bash
npm run type-check
```

### Lint & Fix
```bash
npm run lint
```

### Build for Production
```bash
npm run build
```

### Verify Build
```bash
npm run preview
```

---

## Backend Commands

```bash
cd backend
# Windows
venv\Scripts\activate
python main.py

# Linux/Mac
source venv/bin/activate
python main.py
```

---

## Environment Variables

### Frontend (.env)
```env
# API Proxy (от hash-router)
VITE_API_URL=http://localhost:8000
```

### Backend (.env)
```env
# DeepSeek API Keys
DEEPSEEK_API_KEY=your_key_here
```