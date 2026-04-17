# Инструкция по деплою на Linux-сервер

Данная инструкция описывает процесс установки и запуска приложения на сервере с ОС Linux (Ubuntu/Debian).
Приложение включает четыре режима: TTS (синтез речи), STT (распознавание файлов), запись с микрофона и DeepSeek AI.

## Требования

- Linux (Ubuntu 20.04+ / Debian 11+)
- Python 3.8+
- Node.js 18+ и npm
- Минимум 4 ГБ ОЗУ (Silero TTS ~2 ГБ + Whisper small ~500 МБ)
- Доступ к интернету (для загрузки моделей при первом запуске и работы DeepSeek API)
- HTTPS (обязательно для записи с микрофона в продакшене)

---

## Шаг 1: Обновление системы

```bash
sudo apt update && sudo apt upgrade -y
```

---

## Шаг 2: Установка Python и зависимостей

```bash
# Установка Python 3.10 и pip
sudo apt install -y python3.10 python3.10-venv python3-pip

# Установка системных библиотек для работы аудио
sudo apt install -y libsndfile1

# Проверка версии
python3 --version
```

---

## Шаг 3: Установка Node.js и npm

```bash
# Установка Node.js 18 из репозитория NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка версий
node --version
npm --version
```

---

## Шаг 4: Клонирование проекта

```bash
cd ~
git clone <URL_РЕПОЗИТОРИЯ> tts-app
cd tts-app

# ИЛИ: загрузка проекта через SCP
# scp -r /путь/к/проекту user@server:/home/user/tts-app
```

---

## Шаг 5: Настройка Backend

```bash
cd ~/tts-app/backend

# Создание виртуального окружения
python3 -m venv venv

# Активация
source venv/bin/activate

# Обновление pip
pip install --upgrade pip

# Установка зависимостей
pip install -r requirements.txt
```

> **Важно:** При первом запуске модели будут загружены автоматически:
> - Silero TTS v4 (~100 МБ) — при первом запросе синтеза
> - OpenAI Whisper small (~500 МБ) — при первом запросе распознавания

---

## Шаг 6: Настройка Frontend

```bash
# Открытие нового терминала (или tmux-сессии)
cd ~/tts-app/frontend

# Установка зависимостей (включая sass, vitest, react-hot-toast)
npm install

# Сборка продакшн-версии (SCSS компилируется в CSS)
npm run build

# Опционально: запуск тестов
npm test
```

После сборки в папке `frontend/dist` появится готовый статический сайт.

---

## Шаг 7: Запуск Backend (production)

### Вариант A: Простой запуск

```bash
cd ~/tts-app/backend
source venv/bin/activate

# Запуск сервера на порту 8000
python main.py
```

### Вариант B: Запуск через systemd (рекомендуется)

Создайте файл сервиса:

```bash
sudo nano /etc/systemd/system/tts-backend.service
```

Содержимое файла:

```ini
[Unit]
Description=TTS/STT Backend Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/home/user/tts-app/backend
Environment="PATH=/home/user/tts-app/backend/venv/bin"
ExecStart=/home/user/tts-app/backend/venv/bin/python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Активация и запуск:

```bash
sudo systemctl daemon-reload
sudo systemctl enable tts-backend.service
sudo systemctl start tts-backend.service
sudo systemctl status tts-backend.service

# Просмотр логов
sudo journalctl -u tts-backend.service -f
```

---

## Шаг 8: Настройка Nginx для раздачи Frontend

### Установка Nginx

```bash
sudo apt install -y nginx
```

### Создание конфигурации сайта

```bash
sudo nano /etc/nginx/sites-available/tts-app
```

Содержимое файла:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Замените на свой домен или IP

    # Раздача статических файлов фронтенда
    # Vite proxy (/api → backend) в dev-режиме заменяется на nginx proxy в продакшене
    location / {
        root /home/user/tts-app/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Проксирование API-запросов на backend (TTS)
    # Все запросы с префиксом /api/* перенаправляются на бэкенд
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
    }

    # Проксирование API-запросов на backend (STT — загрузка файлов)
    location /api/transcribe {
        proxy_pass http://127.0.0.1:8000/transcribe;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 600s;
        client_max_body_size 50M;
    }

    # Health endpoint
    location /api/health {
        proxy_pass http://127.0.0.1:8000/health;
    }

    # DeepSeek AI
    location /api/ask_deepseek {
        proxy_pass http://127.0.0.1:8000/ask_deepseek;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;  # DeepSeek может отвечать долго
    }
}
```

> **Важно:** фронтенд использует относительные пути `/api/*` (через Vite proxy при разработке).
> В продакшене nginx берёт на себя роль прокси — все запросы `/api/*` перенаправляются на бэкенд.

### Активация сайта

```bash
sudo ln -s /etc/nginx/sites-available/tts-app /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

## Шаг 9: Настройка HTTPS для микрофона

> **Важно:** Запись с микрофона (MediaRecorder API) работает только через HTTPS или на localhost.
> Для продакшена обязательно настройте HTTPS.

```bash
# Установка Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получение SSL-сертификата
sudo certbot --nginx -d your-domain.com

# Автоматическое обновление
sudo certbot renew --dry-run
```

---

## Шаг 10: Настройка брандмауэра

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

---

## Проверка работоспособности

### Проверка Backend

```bash
# Запрос к health-эндпоинту (nginx проксирует /api/health → /health)
curl http://localhost:8000/health
# Или через nginx:
curl https://your-domain.com/api/health

# Ожидаемый ответ: {"status": "ok"}
```

### Проверка через браузер

Откройте в браузере: `https://your-domain.com`

### Проверка записи с микрофона

1. Откройте вкладку «Речь в текст»
2. Нажмите «Начать запись»
3. Разрешите доступ к микрофону
4. Скажите что-нибудь и нажмите «Остановить»
5. Нажмите «Распознать запись»

---

## Управление сервисом

```bash
# Остановка backend
sudo systemctl stop tts-backend.service

# Перезапуск backend
sudo systemctl restart tts-backend.service

# Просмотр логов в реальном времени
sudo journalctl -u tts-backend.service -f

# Пересборка фронтенда после изменений
cd ~/tts-app/frontend && npm run build
```

---

## Обновление приложения

```bash
cd ~/tts-app

# Обновление из Git (если используется)
git pull

# Обновление backend-зависимостей
cd backend
source venv/bin/activate
pip install -r requirements.txt

# Обновление frontend-зависимостей и сборка
cd ../frontend
npm install        # Установит новые пакеты (toast, vitest, sass)
npm run build

# Перезапуск backend
sudo systemctl restart tts-backend.service
```

---

## Устранение проблем

### Backend не запускается

```bash
sudo journalctl -u tts-backend.service --no-pager | tail -50
sudo lsof -i :8000
ls -la ~/tts-app/backend/
```

### Модель не загружается

```bash
# Проверка свободного места (модели скачиваются при первом запуске)
df -h

# ОЗУ может быть недостаточно — модели требуют ~2.5 ГБ в сумме
free -h
```

### Ошибка распознавания (STT)

```bash
sudo journalctl -u tts-backend.service | grep "Whisper"
sudo journalctl -u tts-backend.service | grep -i error
```

### Не работает запись с микрофона

```bash
# MediaRecorder API не работает через HTTP (кроме localhost)
# Убедитесь, что сайт открыт через HTTPS

# Проверьте консоль браузера (F12) на ошибки
# Убедитесь, что браузер поддерживает MediaRecorder API
```

### Nginx отдаёт 502 Bad Gateway

```bash
sudo systemctl status tts-backend.service
sudo tail -f /var/log/nginx/error.log
```

### Ошибка при сборке фронтенда (SCSS)

```bash
# Убедитесь, что sass установлен
cd ~/tts-app/frontend
npm list sass

# При необходимости переустановите зависимости
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## Мониторинг

```bash
top         # Загрузка CPU
free -h     # Загрузка ОЗУ
df -h       # Место на диске
sudo journalctl -u tts-backend.service -f  # Логи backend
```

---

## Резервное копирование

```bash
# Создание бэкапа проекта
tar -czf tts-backup-$(date +%Y%m%d).tar.gz ~/tts-app/

# Копирование на удалённый сервер
scp tts-backup-*.tar.gz user@backup-server:/backups/
```
