# QWEN.md — контекст проекта Text-to-Speech / Speech-to-Text

Инструкции для будущих сессий с ИИ-агентом. Документ описывает **фактическое состояние кода**, а не то, что обещает README (расхождения перечислены в разделе 9).

---

## 1. Что это за проект

Локальное веб-приложение для работы с речью, три вкладки:

| Вкладка | Что делает | Бэкенд |
|---|---|---|
| **TTS** | Синтез русского текста в MP3, 5 голосов, режим подкаста, ручное ударение | Silero TTS `v5_6_ru` (+ `v3_en` для англ. фраз) |
| **STT** | Распознавание загруженного файла или записи с микрофона | OpenAI Whisper (small) |
| **DeepSeek** | Вопрос к LLM и озвучка ответа одним нажатием | DeepSeek API (внешний, опционален) |

Ключевая идея: синтез и распознавание работают **локально на CPU**, без облака. Внешняя зависимость только DeepSeek, и она необязательна.

Стек: FastAPI (Python 3.8.9) + React 18 / Vite 5 / TypeScript 5.3 / React Bootstrap.

---

## 2. Архитектура

### Backend (`backend/`)

```
main.py               — только HTTP-слой: Pydantic-модели, эндпоинты, коды ошибок
tts_service.py        — SileroTTSService: загрузка моделей, чанкинг, подкаст, склейка
stt_service.py        — STTService: Whisper + librosa
deepseek_service.py   — DeepSeekService: OpenAI-совместимый клиент
text_normalization.py — вся подготовка русского текста (сердце проекта)
tests/                — pytest
```

Сервисы — ленивые синглтоны через `get_tts_service()`, `get_stt_service()`, `get_deepseek_service()`. Модели грузятся один раз на процесс.

**Эндпоинты:**

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `/synthesize` | `SynthesizeRequest` | `audio/mpeg` |
| POST | `/transcribe` | multipart поле `audio` | `{text, filename}` |
| GET | `/health` | — | `{"status": "ok"}` |
| POST | `/ask_deepseek` | `DeepSeekRequest` | `{answer, model}` |

`SynthesizeRequest`: `text`, `speaker` (по умолчанию `kseniya`), `put_accent`, `put_yo`, `podcast_mode`, `english_mode` (`voice` | `transliterate`).

Ошибки: 400 — пустой текст/невалидный ввод, 500 — ошибка синтеза.

Запуск: `python main.py` → uvicorn на `0.0.0.0:8000` (жёстко зашито в `main.py`).

### Frontend (`frontend/src/`)

```
App.tsx                    — оркестратор: активная вкладка, глобальный loading, toast
components/TtsTab.tsx      — вкладка TTS: текст, голос, english_mode, подкаст
components/TtsResultCard.tsx
components/PodcastModePanel.tsx
components/SsmlHelpModal.tsx — справка по SSML: теги, значения, вставка примеров
components/SttTab.tsx, SttResultCard.tsx
components/DeepseekTab.tsx
components/ToastNotifier.tsx
hooks/useLocalStorage.ts   — useState с персистентностью
hooks/useRecording.ts      — запись с микрофона + конвертация в WAV
hooks/useOnlineStatus.tsx  — offline-баннер
hooks/useToastError.ts
utils/audioUtils.ts        — audioBufferToWav
utils/fileValidation.ts    — magic bytes до отправки
types/api.ts               — Speaker, EnglishMode, SynthesizeRequest и др.
```

Роутера нет — одна страница с `Tabs` из React Bootstrap. Дев-сервер на `:3000`, прокси `/api/*` → `http://localhost:8000/*` с отрезанием `/api` (`vite.config.ts`).

---

## 3. Запуск

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows;  source venv/bin/activate — Linux/Mac
pip install -r requirements.txt
python main.py
```

Первый запуск скачивает модели в кэш:
- Silero `v5_6_ru` ≈ 141 МБ → `~/.cache/torch/hub/snakers4_silero-models_master/src/silero/model/`
- Silero `v3_en` ≈ 55 МБ (лениво, при первом английском фразе)
- Whisper small → `~/.cache/whisper/`

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

---

## 4. Тесты и проверки

### Backend — **запускать только из каталога `backend/`**

```bash
cd backend
python -m pytest tests -q
```

Из корня репозитория падает с `ModuleNotFoundError: No module named 'tts_service'` — в тестах кривой `sys.path` (`os.path.join(os.path.dirname(__file__), '..', 'backend')`).

Состояние на 2026-10-31: **78 тестов, 77 проходят, 1 известный провал** — `TestSTTService::test_transcribe_calls_whisper` подставляет путь `/tmp/test.mp3`, и `os.unlink` в `finally` не находит файл на Windows. Это дефект теста, **не сервиса**; не «чинить» рабочий `stt_service.py` под него.

### Frontend

```bash
cd frontend
npm run type-check   # tsc --noEmit, должен быть чистым
npm test             # vitest run — 3 теста audioUtils
npm run lint         # eslint
```

CI нет. Перед отчётом о готовности прогоняйте оба набора.

---

## 5. Соглашения кода

### Python

- Комментарии и docstring — **по-русски**, подробные, почти построчные в сервисах. Соблюдайте этот стиль при правках соседнего кода.
- Типизация: `from __future__ import annotations`, `Optional`, `List`, `Dict`.
- Ошибки — `ValueError` в сервисах, `HTTPException` в `main.py`.
- Новые зависимости добавлять только в `backend/requirements.txt` с пином и комментарием (стек намеренно заморожен на 2023, см. раздел 8).

### TypeScript / React

- Строгий режим: `strict`, `noUnusedLocals`, `noUnusedParameters`.
- Стиль: без точек с запятой, одинарные кавычки, `import type` для типов.
- Состояние с персистентностью — только через `useLocalStorage`, ключи с префиксом `tts-`.
- Blob URL обязательно отзывать: `URL.revokeObjectURL` в cleanup и при перезаписи.
- Все пропсы типизированы; `any` не использовать.
- Стили — Bootstrap через `bootstrap-custom.scss` (выборочный импорт), не полный CSS. **Новый компонент react-bootstrap требует импорта своего partial**: например, `Modal` без `@import "bootstrap/scss/modal"` открывается как блок на всю страницу без затемнения и кнопки закрытия.

---

## 6. `text_normalization.py` — порядок правил критичен

Silero вырезает все символы вне своего алфавита (`_~|!+,-.:;?абвгдежзийклмнопрстуфхцчшщъыьэюяё–… `): латиницу, цифры, `₽ $ № * / \ = ^` и скобки. Поэтому весь текст проходит нормализацию. Порядок в `normalize_for_tts()` менять нельзя:

1. `_normalize_symbols` — знаки `=`, `−`, `^`, `÷`, `±`, `≈`, `≠` и деление слэшем словами; `+` и `*` **не заменяются** (`+` остаётся маркером ударения, `*` модель просто вырезает). Минус/дефис и слэш различаются по контексту.
2. `[!]` → `+` (`_MANUAL_STRESS_RE`) — **после** знаков, иначе `+` стал бы словом «плюс».
3. `normalize_numbers` — сначала `_russian_years`, затем цифры/дроби.
4. `_ACCUSATIVE_FEMININE_RE` — «пройти одна целая» → «пройти одну целую».
5. Транслитерация латиницы (словарь `_TERMS` → аббревиатуры → правила).

**SSML.** Теги `<break>`, `<prosody>`, `<speak>` защищаются заглушками в приватной области Unicode до нормализации и восстанавливаются после. Сегмент с тегами не делится по языкам и не режется на чанки: он целиком уходит в `apply_tts(ssml_text=wrap_ssml(...))`. `wrap_ssml` добавляет обёртку `<speak>` и экранирует одиночные `&` — без обёртки Silero падает с `Invalid XML format`.

Что уже поддержано:

- **Годы**: `в 2026 году` → «в две тысячи двадцать шестом году»; диапазоны `с 2020 по 2026 год`; десятилетия `1990-х годах`.
- **Дроби**: запятая — всегда дробь (`1,356` → «одна целая триста пятьдесят шесть тысячных»); точка с двумя знаками — версия (`3.12` → «три точка один два»); `1,0` → «одна целая».
- **Проценты**: `5%` → «пять процентов», `5,5%` → «пять целых пять десятых процента».
- **Ручное ударение**: `[!]` прямо перед ударной гласной (`вод[!]а` → `вод+а`). Работает и при `put_accent=True` — маркер Silero перебивает автоматику.
- **Английский**: `split_by_language` в `tts_service.py` отправляет фразы от двух слов в `v3_en` с голосом из `ENGLISH_VOICE_BY_SPEAKER`; одиночные термины транслитерируются.

Порог и константы: `ENGLISH_SPAN_MIN_WORDS = 2`, `LANGUAGE_SWITCH_PAUSE_MS = 120`, `ENGLISH_VOICE_BY_SPEAKER` (kseniya→en_11, xenia→en_41, baya→en_95, aidar→en_89, eugene→en_106 — подобраны по медианной высоте тона).

---

## 7. Подкаст-режим

`[voice:kseniya]`, `[pause:1.5]`, `[pause:500ms]`, `[pause:1s]`.
Парсинг — `_parse_podcast_script` в `tts_service.py`, происходит **до** нормализации текста, иначе теги бы ломались. Неизвестный голос заменяется голосом по умолчанию с сообщением в лог.

---

## 8. Подводные камни (проверено на практике)

1. **`+` — маркер ударения Silero**, а не символ плюса. В `_SYMBOLS` он намеренно **не** заменяется (решение пользователя), поэтому `2+2` не проговаривается как «два плюс два»; `[!]` — рекомендуемый синтаксис ударения.
2. **Устаревший кэш `torch.hub`**: на машине, где проект уже запускался, копия репозитория Silero может не знать `v5_6_ru` → `AssertionError: Speaker not in the supported list`. В `_load_model` есть fallback на `force_reload=True`; это разовая перекачка ~141 МБ.
3. **`num2words` 0.5.14 не умеет русские порядковые**: `to='year'` и `case=` игнорируются. Порядковые и знаменатели дробей собираются вручную (`_ordinal_words`, `_inflect_ordinal`, `_russian_fraction`).
4. **Кусок без букв и цифр** (например, одинокое «.») роняет Silero с `ValueError` — в `synthesize` такие куски пропускаются.
5. **Текст только из символов** («. . .») проходит проверку на непустоту в `main.py`, но после нормализации не содержит букв: кусок пропускается, и `torch.cat` по пустому списку падает. Проверки «есть хотя бы одна буква» нет ни на фронте, ни на бэке.
6. **CPU-инференс блокирует event loop**: эндпоинты объявлены `async def`, но внутри синхронный тяжёлый код. Параллельные запросы выполняются последовательно. Для одного пользователя нормально, для сервиса — нет.
7. **`.gitignore` игнорирует `test_*.py`** — каталог `backend/tests/` **не отслеживается git**. Не утверждайте, что тесты закоммичены; при просьбе о коммите предупредите и предложите исключение `!backend/tests/`.
8. **Стек заморожен на октябре 2023**: Python 3.8.9 (EOL), torch 2.1.1 (есть CVE в `torch.load`), fastapi 0.104.1, numpy 1.24.4, librosa 0.9.2. Обновление torch/numpy/Python требует перепроверки `v5_6_ru`, это отдельная миграция.
9. **Лицензия Silero `v5_6_ru` — CC BY-NC 4.0**, коммерческое использование запрещено. MIT только у `v5_cis_base`.
10. **`torch.hub.load` качает модель из сети** — первый запуск без интернета невозможен.

---

## 9. Документация: что врёт

README и часть docs описывают несуществующее. Проверяйте код, а не текст:

| Утверждение | Реальность |
|---|---|
| PWA: ServiceWorker + Manifest | Нет ни `public/`, ни манифеста, ни регистрации SW |
| SSE `/synthesize_stream`, реальный прогресс | Эндпоинта нет; синтез — обычный `fetch` с ожиданием всего blob. Прогресс STT — эмуляция таймером |
| Лицензия MIT | Silero под CC BY-NC 4.0; файла `LICENSE` нет |
| Ссылка на `docs/UPGRADE.md` | Файла нет |
| `npm run lint:fix` в `docs/SCRIPTS.md` | Скрипта нет в `package.json` |

Источник истины по API и архитектуре — `docs/DOCUMENTATION.md`, но и его сверяйте с кодом.

---

## 10. Куда добавлять изменения

| Задача | Файлы |
|---|---|
| Новое правило русского текста | `backend/text_normalization.py` + `backend/tests/test_text_normalization.py` |
| Новый голос Silero | `SPEAKERS` в `TtsTab.tsx`, whitelist `['kseniya', ...]` в `tts_service.synthesize`, `ENGLISH_VOICE_BY_SPEAKER` |
| Новый эндпоинт | `backend/main.py` (Pydantic-модель + обработчик), тип в `frontend/src/types/api.ts` |
| Новая настройка UI | `useLocalStorage` с ключом `tts-*`, поле в `SynthesizeRequest` |
| Тег сценария подкаста | регулярка `\[(voice|pause|break)\s*:\s*([^\]]+)\]` и `_parse_podcast_script` в `tts_service.py` |
| Стили | `bootstrap-custom.scss` и `App.css` |

При правках текста всегда добавляйте тест в `test_text_normalization.py` — это самый дешёвый способ не сломать падежи, дроби и ударения.

---

## 11. Ограничения и безопасность

- Аутентификации, лимитов и квот нет. CORS: `allow_origins=["*"]` вместе с `allow_credentials=True` — комбинация, которую браузеры не поддерживают.
- Ключ DeepSeek передаётся либо через переменную окружения `DEEPSEEK_API_KEY`, либо в теле запроса (клиент может прислать свой). Не логируйте ключи.
- Сервер слушает `0.0.0.0:8000` — при запуске вне localhost это доступно в сети.
- Файлы STT: максимум 25 МБ, форматы mp3/wav/ogg/flac/webm, m4a отклоняется. Временные файлы удаляются в `finally`.
- GPU не используется: `torch.device('cpu')` захардкожен в `tts_service.py` и `stt_service.py`.
