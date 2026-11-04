# QWEN.md — контекст проекта Text-to-Speech / Speech-to-Text

Инструкции для будущих сессий с ИИ-агентом. Документ описывает **фактическое состояние кода**. Если README или `docs/` расходятся с кодом — верьте коду и обновляйте документ.

Проверено: 2026-11-04.

---

## 1. Что это за проект

Локальное веб-приложение для работы с речью, четыре вкладки:

| Вкладка | Что делает | Бэкенд |
|---|---|---|
| **Текст в речь** | Синтез русского текста в MP3, 5 голосов Silero, режим подкаста, SSML, ручное ударение, английские фразы | Silero `v5_6_ru` + `v3_en` |
| **Речь в текст** | Распознавание загруженного файла или записи с микрофона | OpenAI Whisper `small` |
| **DeepSeek AI** | Вопрос к LLM и озвучка ответа одним нажатием | DeepSeek API (внешний, опционален) |
| **Мой голос** | Клонирование голоса по образцу 6–30 секунд, список голосов, тест | XTTS v2 (Coqui TTS) |

Ключевая идея: синтез, клонирование и распознавание работают **локально на CPU**, без облака. Внешняя зависимость только DeepSeek, и она необязательна.

Стек: FastAPI + Python 3.11.9 (пакет XTTS требует 3.9–3.11) + React 18 / Vite 5 / TypeScript 5.3+ / React Bootstrap.

---

## 2. Архитектура

### Backend (`backend/`)

```
main.py                 — только HTTP-слой: Pydantic-модели, эндпоинты, коды ошибок
tts_service.py          — SileroTTSService: модели, чанкинг, языковая маршрутизация, подкаст, склейка
stt_service.py          — STTService: Whisper + librosa
deepseek_service.py     — DeepSeekService: OpenAI-совместимый клиент
voice_clone_service.py  — VoiceCloneService: XTTS v2, реестр голосов, регистрация образцов
text_normalization.py   — вся подготовка русского текста (сердце проекта)
voices/                 — рантайм-данные: <uuid>.wav + voices.json (в git не попадает)
tests/                  — pytest, отслеживается git
```

Сервисы — ленивые синглтоны через `get_tts_service()`, `get_stt_service()`, `get_deepseek_service()`, `get_voice_clone_service()`. Модели грузятся один раз на процесс, XTTS и `v3_en` — при первом использовании.

**Эндпоинты:**

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `/synthesize` | `SynthesizeRequest` | `audio/mpeg` |
| POST | `/transcribe` | multipart поле `audio` | `{text, filename}` |
| GET | `/health` | — | `{"status": "ok"}` |
| POST | `/ask_deepseek` | `DeepSeekRequest` | `{answer, model}` |
| POST | `/voices/register` | multipart `audio` + query `name` | `{voice_id, name, duration_sec}` |
| GET | `/voices` | — | `{voices: [...]}` |
| DELETE | `/voices/{voice_id}` | — | `{status, voice_id}` |

`SynthesizeRequest`: `text`, `speaker` (по умолчанию `kseniya`), `put_accent`, `put_yo`, `podcast_mode`, `english_mode` (`voice` | `transliterate`), `voice_id` (клонированный голос; если задан — `speaker` игнорируется).

Ошибки: 400 — пустой текст/невалидный ввод, 500 — ошибка синтеза/распознавания (включая неизвестный `voice_id`), 404 — голос не найден при `DELETE /voices/{id}`.

Запуск: `python main.py` → uvicorn на `0.0.0.0:8000` (жёстко зашито в `main.py`).

### Frontend (`frontend/src/`)

```
App.tsx                       — оркестратор: активная вкладка, глобальный loading, список голосов, toast
components/TtsTab.tsx         — текст, голос (пресет или clone:<id>), english_mode, подкаст, SSML
components/TtsResultCard.tsx
components/PodcastModePanel.tsx
components/SsmlHelpModal.tsx  — справка по SSML: теги, значения, вставка примеров
components/SttTab.tsx, SttResultCard.tsx
components/DeepseekTab.tsx
components/VoiceCloneTab.tsx  — регистрация/удаление/проверка клонированного голоса
components/ToastNotifier.tsx
hooks/useLocalStorage.ts      — useState с персистентностью
hooks/useRecording.ts         — запись с микрофона + конвертация в WAV
hooks/useOnlineStatus.tsx     — offline-баннер
hooks/useToastError.ts
utils/audioUtils.ts           — audioBufferToWav
utils/fileValidation.ts       — magic bytes до отправки
types/api.ts                  — Speaker, EnglishMode, SynthesizeRequest, VoiceInfo и др.
```

Роутера нет — одна страница с `Tabs` из React Bootstrap. Дев-сервер на `:3000`, прокси `/api/*` → `http://localhost:8000/*` с отрезанием `/api` (`vite.config.ts`).

---

## 3. Запуск

### Backend

```bash
cd backend
py -3.11 -m venv venv
venv\Scripts\activate          # Windows;  source venv/bin/activate — Linux/Mac
pip install --upgrade pip
pip install "Cython==3.3.1" "wheel==0.45.1" "numpy==1.24.4"
pip install --no-build-isolation -r requirements.txt
python main.py
```

Две ступени установки обязательны: `setup.py` пакетов TTS и openai-whisper при сборке импортируют Cython и numpy, поэтому они должны уже стоять в окружении. `requirements.txt` — полный lock (`pip freeze`), а не список прямых зависимостей; версии вручную не править.

Первый запуск скачивает модели (нужен интернет):
- Silero `v5_6_ru` ≈ 141 МБ → `~/.cache/torch/hub/snakers4_silero-models_master/src/silero/model/`
- Silero `v3_en` ≈ 55 МБ — лениво, при первой английской фразе
- Whisper `small` ≈ 500 МБ → `~/.cache/whisper/`
- XTTS v2 — лениво, при первом клонированном синтезе; пакет TTS с зависимостями ≈ 2 ГБ, веса качаются отдельно в `%LOCALAPPDATA%\tts` (Windows) или `~/.local/share/tts` (Linux). `COQUI_TOS_AGREED=1` сервис выставляет сам.

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

---

## 4. Тесты и проверки

### Backend — **только из каталога `backend/` и только интерпретатором venv**

```bash
cd backend
venv\Scripts\python.exe -m pytest tests -q
```

Системный `python -m pytest` падает с `No module named pytest`; запуск из корня — с `ModuleNotFoundError: No module named 'tts_service'`. Тестовые файлы сами добавляют `backend` в `sys.path`.

Состояние на 2026-11-04: **119 тестов, 118 проходят, 1 известный провал** — `TestSTTService::test_transcribe_calls_whisper` подставляет путь `/tmp/test.mp3`, и `os.unlink` в `finally` не находит файл на Windows. Это дефект теста, **не сервиса**; не «чинить» рабочий `stt_service.py` под него.

Наборы: `test_text_normalization.py` (нормализация, языки, SSML), `test_services.py` (чанки, подкаст, модель), `test_voice_clone.py` (реестр, валидация, path traversal, интеграция с подкастом).

### Frontend

```bash
cd frontend
npm run type-check   # tsc --noEmit — должен быть чистым
npm test             # vitest run — 3 теста audioUtils
npm run lint         # eslint: 0 ошибок; 1 warning fast-refresh в useOnlineStatus.tsx
```

CI нет. Перед отчётом о готовности прогоняйте оба набора.

---

## 5. Соглашения кода

### Python

- Комментарии и docstring — **по-русски**, подробные, почти построчные в сервисах. Соблюдайте стиль соседнего кода.
- Типизация: `from __future__ import annotations`, `Optional`, `List`, `Dict`.
- Ошибки — `ValueError` в сервисах, `HTTPException` в `main.py`.
- Зависимости — только в `backend/requirements.txt` (lock-файл). Обновление пакета = перегенерация `pip freeze` и проверка XTTS/Silero, а не правка одной строки.
- Блокирующий инференс вызывается из `main.py` через `run_in_threadpool`; внутри сервисов — под `threading.Lock`, потому что модели не потокобезопасны.

### TypeScript / React

- Строгий режим: `strict`, `noUnusedLocals`, `noUnusedParameters`.
- Стиль: без точек с запятой, одинарные кавычки, `import type` для типов.
- Персистентность — только через `useLocalStorage`. Хук сам добавляет префикс `tts-app-`, поэтому ключ `'tts-speaker'` хранится как `tts-app-tts-speaker`; ключи DeepSeek — `ds-model`, `ds-system-prompt`.
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

Что поддержано:

- **Годы**: `в 2026 году` → «в две тысячи двадцать шестом году»; диапазоны `с 2020 по 2026 год`; десятилетия `1990-х годах`.
- **Дроби**: запятая — всегда дробь (`1,356` → «одна целая триста пятьдесят шесть тысячных»); точка с двумя знаками — версия (`3.12` → «три точка один два»); `1,0` → «одна целая».
- **Проценты**: `5%` → «пять процентов», `5,5%` → «пять целых пять десятых процента».
- **Ручное ударение**: `[!]` прямо перед ударной гласной (`вод[!]а` → `вод+а`). Работает и при `put_accent=True` — маркер Silero перебивает автоматику.
- **Английский**: `split_by_language` в `tts_service.py` отправляет фразы от двух слов в `v3_en` с голосом из `ENGLISH_VOICE_BY_SPEAKER`; одиночные термины транслитерируются.

Порог и константы: `ENGLISH_SPAN_MIN_WORDS = 2`, `LANGUAGE_SWITCH_PAUSE_MS = 120`, `ENGLISH_VOICE_BY_SPEAKER` (kseniya→en_11, xenia→en_41, baya→en_95, aidar→en_89, eugene→en_106 — подобраны по медианной высоте тона).

**Отличие для XTTS.** Клонированный голос нормализуется тем же `normalize_for_tts`, но перед этим: вырезаются SSML-теги, `[!]` удаляется (у XTTS нет маркера ударения), `2+2` превращается в «2 плюс 2», а оставшиеся `+` между буквами убираются без разрыва слова. Язык XTTS всегда `ru`, поэтому английские фразы в режиме клона читаются русским произношением.

---

## 7. Подкаст-режим

Теги: `[voice:kseniya]`, `[voice:clone:<voice_id>]`, `[pause:1.5]`, `[pause:500ms]`, `[pause:1s]`, `[break:...]`.

Парсинг — `_parse_podcast_script` в `tts_service.py`, происходит **до** нормализации текста, иначе теги бы ломались. `break` обрабатывается как пауза. Неизвестный голос заменяется голосом по умолчанию с сообщением в лог. Голос по умолчанию — выбранный в UI; если задан `voice_id`, реплики без тега читает клон. Клипы XTTS (24 кГц) ресемплятся до 48 кГц и склеиваются с Silero.

---

## 8. Клонирование голоса (XTTS v2)

- Реестр — `backend/voices/voices.json` (`voice_id` → `name`, `duration_sec`, `created_at`), образцы — `backend/voices/<uuid>.wav`. Каталог в `.gitignore`.
- `voice_id` — строгий UUID v4; путь строится только из валидированного id. Это защита от path traversal, на неё есть тест.
- Ограничения образца: ≤ 25 МБ, 6–30 секунд, форматы mp3/wav/ogg/flac/webm; m4a отклоняется. Ресемпл в 22050 Гц.
- Реестр пишется атомарно (`mkstemp` + `os.replace`); битый JSON не роняет сервис — стартуем с пустого реестра.
- `TTS` импортируется лениво внутри `_get_model()`, чтобы приложение и тесты работали без 2 ГБ зависимостей.
- Клонированный синтез идёт под отдельным `_inference_lock`; при подкасте блокировки берутся в порядке TTS → clone, обратного порядка нет.

---

## 9. Подводные камни (проверено на практике)

1. **`+` — маркер ударения Silero**, а не символ плюса. В `_SYMBOLS` он намеренно **не** заменяется (решение пользователя), поэтому `2+2` не проговаривается как «два плюс два»; `[!]` — рекомендуемый синтаксис ударения.
2. **Устаревший кэш `torch.hub`**: на машине, где проект уже запускался, копия репозитория Silero может не знать `v5_6_ru` → `AssertionError: Speaker not in the supported list`. В `_load_model` есть fallback на `force_reload=True`; это разовая перекачка ~141 МБ.
3. **`num2words` 0.5.14 не умеет русские порядковые**: `to='year'` и `case=` игнорируются. Порядковые и знаменатели дробей собираются вручную (`_ordinal_words`, `_inflect_ordinal`, `_russian_fraction`).
4. **Кусок без букв и цифр** (например, одинокое «.») роняет Silero с `ValueError` — в `synthesize` такие куски пропускаются.
5. **Текст только из символов** («. . .») проходит проверку на непустоту в `main.py`, но после нормализации не содержит букв: куски пропускаются, и `torch.cat` по пустому списку падает. Проверки «есть хотя бы одна буква» нет ни на фронте, ни на бэке.
6. **Инференс сериализован**: `run_in_threadpool` не даёт заблокировать event loop, но `threading.Lock` в каждом сервисе означает, что параллельные запросы встают в очередь. CPU при синтезе загружен полностью; XTTS на CPU медленнее Silero в разы.
7. **Стек нельзя обновлять по одному пакету**: Python 3.9–3.11 (XTTS не ставится на 3.8/3.12), torch/torchaudio 2.1.1 (CVE в `torch.load`), `transformers` строго 4.x — в 5.x убрали `BeamSearchScorer`, нужный XTTS, `librosa` 0.10.1. Обновление требует перепроверки обеих моделей.
8. **Лицензии**: Silero `v5_6_ru` — CC BY-NC 4.0 (коммерческое использование запрещено), XTTS v2 — CPML (тоже некоммерческая). Файла `LICENSE` в репозитории нет. MIT только у Silero `v5_cis_base`.
9. **`torch.hub.load` и Coqui качают модели из сети** — первый запуск без интернета невозможен.
10. **Имя клонированного голоса из UI не доходит**: `POST /voices/register` объявляет `name` как query-параметр, а `VoiceCloneTab` кладёт его в `FormData`. FastAPI относит `name` к query, поэтому сохраняется «Мой голос».
11. **Кэш ключа DeepSeek глобальный**: `get_deepseek_service()` запоминает последний ключ в модуле. Запрос без ключа после запроса с ключом использует чужой ключ — при многопользовательском запуске это утечка.
12. **Реестр голосов не защищён блокировкой**: параллельные `register`/`delete` могут потерять запись (инференс-лок не покрывает мутации `_registry`).
13. **`backend/tests/` теперь отслеживается git.** `.gitignore` игнорирует только `/test_*.py` в корне и `backend/voices/`. Не повторяйте старое утверждение о неотслеживаемых тестах.
14. **Лимит 5000 символов — только в UI.** На бэкенде ограничения длины текста нет.

---

## 10. Документация

На 2026-11-04 `README.md`, `QWEN.md`, `docs/DOCUMENTATION.md`, `docs/TROUBLESHOOTING.md` и `docs/SCRIPTS.md` синхронизированы с кодом. Известных расхождений нет.

Что важно помнить при правках:

- README и QWEN.md описывают четыре вкладки, 119 тестов и Python 3.11.9 — обновляйте цифры при изменении.
- В `docs/SCRIPTS.md` намеренно нет `npm run lint:fix`: такого скрипта не существует, автофикс запускается через `npx eslint ... --fix`.
- В `docs/TROUBLESHOOTING.md` нет SSE: прогресс TTS не транслируется, прогресс STT — эмуляция таймером.
- PWA в проекте отсутствует: нет service worker, манифеста и каталога `public/`.

При изменении API или команд запуска правьте README, QWEN.md и соответствующий файл в `docs/` в том же коммите — CI, который поймал бы расхождение, отсутствует.

---

## 11. Куда добавлять изменения

| Задача | Файлы |
|---|---|
| Новое правило русского текста | `backend/text_normalization.py` + `backend/tests/test_text_normalization.py` |
| Новый голос Silero | `SPEAKERS` в `TtsTab.tsx`, whitelist `['kseniya', ...]` в `tts_service.synthesize`, `ENGLISH_VOICE_BY_SPEAKER` |
| Новый эндпоинт | `backend/main.py` (Pydantic-модель + обработчик), тип в `frontend/src/types/api.ts` |
| Новая настройка UI | `useLocalStorage` с ключом `tts-*` или `ds-*`, поле в `SynthesizeRequest` |
| Тег сценария подкаста | регулярка `\[(voice|pause|break)\s*:\s*([^\]]+)\]` и `_parse_podcast_script` в `tts_service.py` |
| Значения SSML | `SsmlHelpModal.tsx` + `backend/tests/test_text_normalization.py` |
| Работа с клонами | `voice_clone_service.py`, `VoiceCloneTab.tsx`, тесты в `test_voice_clone.py` |
| Стили | `bootstrap-custom.scss` и `App.css` |

При правках текста всегда добавляйте тест в `test_text_normalization.py` — это самый дешёвый способ не сломать падежи, дроби и ударения.

---

## 12. Ограничения и безопасность

- Аутентификации, лимитов и квот нет. CORS: `allow_origins=["*"]` вместе с `allow_credentials=True` — комбинация, которую браузеры не поддерживают.
- Ключ DeepSeek передаётся либо через переменную окружения `DEEPSEEK_API_KEY`, либо в теле запроса. Сервер кэширует последний ключ в памяти процесса (см. п. 11 в разделе 9). Не логируйте ключи.
- Сервер слушает `0.0.0.0:8000` — при запуске вне localhost это доступно в сети.
- Файлы STT и образцы голоса: максимум 25 МБ, форматы mp3/wav/ogg/flac/webm, m4a отклоняется. Временные файлы удаляются в `finally`.
- GPU не используется: `torch.device('cpu')` захардкожен в `tts_service.py` и `stt_service.py`; XTTS запускается с `gpu=False`.
- Образцы голосов — биометрические данные. Они лежат в `backend/voices/` без шифрования и без разграничения доступа; при выкладывании сервиса наружу это надо закрывать отдельно.
