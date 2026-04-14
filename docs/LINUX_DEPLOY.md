# Инструкция по деплою на Linux-сервер

Данная инструкция описывает процесс установки и запуска приложения на сервере с ОС Linux (Ubuntu/Debian).

## Требования

- Linux (Ubuntu 20.04+ / Debian 11+)
- Python 3.8+
- Node.js 18+ и npm
- Минимум 4 ГБ ОЗУ (модель Silero TTS требует ~2 ГБ)
- Доступ к интернету (для загрузки модели при первом запуске)

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
sudo apt install -y libsndfile1 ffmpeg

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
# Переход в домашнюю директорию
cd ~

# Клонирование репозитория (если проект в Git)
git clone <URL_РЕПОЗИТОРИЯ> tts-app
cd tts-app

# ИЛИ: загрузка проекта через SCP
# scp -r /путь/к/проекту user@server:/home/user/tts-app
```

---

## Шаг 5: Настройка Backend

```bash
# Переход в папку backend
cd ~/tts-app/backend

# Создание виртуального окружения
python3 -m venv venv

# Активация виртуального окружения
source venv/bin/activate

# Обновление pip
pip install --upgrade pip

# Установка зависимостей
pip install -r requirements.txt
```

> **Важно:** При первом запуске модель Silero TTS (~100 МБ) будет загружена автоматически.

---

## Шаг 6: Настройка Frontend

```bash
# Открытие нового термина (или tmux-сессии)
# Переход в папку frontend
cd ~/tts-app/frontend

# Установка зависимостей
npm install

# Сборка продакшн-версии
npm run build
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
Description=TTS Backend Service
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
# Перезагрузка systemd
sudo systemctl daemon-reload

# Включение автозапуска
sudo systemctl enable tts-backend.service

# Запуск сервиса
sudo systemctl start tts-backend.service

# Проверка статуса
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
    location / {
        root /home/user/tts-app/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Проксирование API-запросов на backend
    location /synthesize {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;  # Увеличиваем таймаут для длинных текстов
    }

    location /health {
        proxy_pass http://127.0.0.1:8000;
    }
}
```

### Активация сайта

```bash
# Создание символической ссылки
sudo ln -s /etc/nginx/sites-available/tts-app /etc/nginx/sites-enabled/

# Удаление дефолтного сайта (опционально)
sudo rm /etc/nginx/sites-enabled/default

# Проверка конфигурации
sudo nginx -t

# Перезапуск Nginx
sudo systemctl restart nginx
```

---

## Шаг 9: Настройка брандмауэра

```bash
# Разрешение HTTP-трафика
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp  # Если будет HTTPS

# Включение брандмауэра
sudo ufw enable

# Проверка статуса
sudo ufw status
```

---

## Шаг 10: Настройка HTTPS (опционально, через Let's Encrypt)

```bash
# Установка Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получение SSL-сертификата
sudo certbot --nginx -d your-domain.com

# Автоматическое обновление
sudo certbot renew --dry-run
```

---

## Проверка работоспособности

### Проверка Backend

```bash
# Запрос к health-эндпоинту
curl http://localhost:8000/health

# Ожидаемый ответ: {"status": "ok"}
```

### Проверка через браузер

Откройте в браузере: `http://your-server-ip`

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
# Переход в папку проекта
cd ~/tts-app

# Обновление из Git (если используется)
git pull

# Обновление backend-зависимостей
cd backend
source venv/bin/activate
pip install -r requirements.txt

# Обновление frontend-зависимостей
cd ../frontend
npm install
npm run build

# Перезапуск backend
sudo systemctl restart tts-backend.service
```

---

## Устранение проблем

### Backend не запускается

```bash
# Проверка логов
sudo journalctl -u tts-backend.service --no-pager | tail -50

# Проверка, занят ли порт 8000
sudo lsof -i :8000

# Проверка прав доступа
ls -la ~/tts-app/backend/
```

### Модель не загружается

```bash
# Проверка свободного места
df -h

# ОЗУ может быть недостаточно — модель требует ~2 ГБ
free -h
```

### Nginx отдаёт 502 Bad Gateway

```bash
# Проверка, работает ли backend
sudo systemctl status tts-backend.service

# Проверка логов Nginx
sudo tail -f /var/log/nginx/error.log
```

---

## Мониторинг

```bash
# Загрузка CPU
top

# Загрузка ОЗУ
free -h

# Место на диске
df -h

# Логи backend
sudo journalctl -u tts-backend.service -f
```

---

## Резервное копирование

```bash
# Создание бэкапа проекта
tar -czf tts-backup-$(date +%Y%m%d).tar.gz ~/tts-app/

# Копирование на удалённый сервер
scp tts-backup-*.tar.gz user@backup-server:/backups/
```
