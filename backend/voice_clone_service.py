# voice_clone_service.py — Клонирование голоса через XTTS v2 (Coqui TTS)
# Этот файл содержит класс VoiceCloneService, который загружает модель XTTS v2,
# сохраняет образцы голосов пользователей и синтезирует речь клонированным голосом.
#
# Модель XTTS v2 — мультиязычная (включая русский), клонирует голос с образца
# длиной от 6 секунд без дообучения.
#
# Важно: импорт пакета TTS (Coqui) выполняется лениво при первом синтезе —
# это тяжёлая зависимость (~2 ГБ), без неё приложение и тесты работают.

from __future__ import annotations  # Отложенная аннотация типов (Python 3.8+)
import json  # Реестр зарегистрированных голосов (voices/voices.json)
import os  # Работа с файловой системой (создание директории, удаление файлов)
import re  # Регулярные выражения (валидация voice_id, очистка SSML)
import tempfile  # Уникальные временные файлы (защита от гонок)
import threading  # Блокировка инференса — модель обслуживает один запрос за раз
import uuid  # Генерация voice_id
from datetime import datetime, timezone  # Метка времени регистрации голоса
from io import BytesIO  # Байтовые потоки в памяти
from typing import Dict, List, Optional

import librosa  # Загрузка и ресемплинг аудио-образцов
import numpy as np  # Работа с аудио-массивами
import soundfile as sf  # Чтение/запись WAV

from text_normalization import normalize_for_tts  # Ударения, числа словами, термины

# Название модели в каталоге Coqui TTS — XTTS v2 (мультиязычная, клонирование)
XTTS_MODEL_NAME = 'tts_models/multilingual/multi-dataset/xtts_v2'

# XTTS v2 выдаёт аудио с частотой 24 кГц
SAMPLE_RATE = 24000

# Частота дискретизации, в которой сохраняем образцы голосов (стандарт XTTS)
REFERENCE_SAMPLE_RATE = 22050

# Директория для образцов голосов и реестра — рядом с этим файлом
VOICES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voices')
# Файл реестра: voice_id → {name, duration_sec, created_at}
REGISTRY_PATH = os.path.join(VOICES_DIR, 'voices.json')

# Ограничения на образец голоса
MAX_SAMPLE_SIZE = 25 * 1024 * 1024  # 25 МБ — как для STT-файлов
MIN_SAMPLE_SECONDS = 6.0   # XTTS требует минимум ~6 секунд чистой речи
MAX_SAMPLE_SECONDS = 30.0  # Больше 30 секунд качество почти не улучшает, но память ест

# Формат voice_id — строгий UUID v4 (защита от path traversal: путь строим только из id)
VOICE_ID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)

# Глобальная блокировка инференса: XTTS на CPU медленный и не потокобезопасен,
# параллельные запросы встают в очередь (как в tts/stt_service)
_inference_lock = threading.Lock()


def _strip_ssml(text: str) -> str:
    """Убрать SSML-теги — XTTS их не понимает и прочитал бы как текст."""
    return re.sub(r'<[^>]+>', ' ', text)


class VoiceCloneService:
    """Сервис клонирования голоса через XTTS v2 (Coqui TTS)."""

    def __init__(self):
        """Инициализация: модель не загружена (ленивая загрузка при первом синтезе)."""
        self.model = None  # Модель XTTS — загрузится при первом вызове synthesize_wave
        self._registry: Dict[str, dict] = {}  # voice_id → метаданные голоса
        self._ensure_voices_dir()  # Создаём директорию voices/ если её нет
        self._load_registry()  # Читаем реестр с диска

    # ====== Реестр голосов ======

    def _ensure_voices_dir(self):
        """Создать директорию для образцов, если её нет."""
        os.makedirs(VOICES_DIR, exist_ok=True)

    def _load_registry(self):
        """Загрузить реестр голосов с диска (вызывается при старте)."""
        if not os.path.exists(REGISTRY_PATH):
            return  # Реестра ещё нет — начинаем с пустого
        try:
            with open(REGISTRY_PATH, 'r', encoding='utf-8') as f:
                self._registry = json.load(f)
        except (json.JSONDecodeError, OSError):
            # Битый реестр — не падаем, начинаем с чистого (файлы останутся на диске)
            self._registry = {}

    def _save_registry(self):
        """Атомарно сохранить реестр (временный файл + переименование)."""
        tmp_fd, tmp_path = tempfile.mkstemp(dir=VOICES_DIR, suffix='.json')
        try:
            with os.fdopen(tmp_fd, 'w', encoding='utf-8') as f:
                json.dump(self._registry, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, REGISTRY_PATH)  # Атомарная замена
        except OSError:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise

    def _voice_path(self, voice_id: str) -> str:
        """Путь к WAV-файлу образца. Только для voice_id, прошедших валидацию UUID."""
        return os.path.join(VOICES_DIR, f'{voice_id}.wav')

    # ====== Регистрация голоса ======

    def register_voice(self, audio_bytes: bytes, file_format: str, name: Optional[str] = None) -> dict:
        """Сохранить образец голоса и вернуть метаданные (voice_id и т.д.).

        Процесс:
        1. Проверка размера (макс 25 МБ)
        2. Запись во временный файл (librosa читает с диска)
        3. Декодирование через librosa (mono), проверка длительности 6–30 сек
        4. Ресемпл до 22050 Гц, сохранение как voices/<uuid>.wav
        5. Запись метаданных в реестр

        Args:
            audio_bytes: Байты аудио-файла (MP3, WAV, OGG, FLAC, WEBM)
            file_format: Формат — "mp3", "wav", "ogg", "flac", "webm"
            name: Человекочитаемое имя голоса (опционально)

        Returns:
            dict: {"voice_id", "name", "duration_sec"}

        Raises:
            ValueError: Файл слишком большой, короткий/длинный или не читается.
        """
        # Проверяем размер файла — защита от перегрузки памяти при декодировании
        if len(audio_bytes) > MAX_SAMPLE_SIZE:
            raise ValueError(
                f"Файл слишком большой ({len(audio_bytes) / 1024 / 1024:.1f} МБ). "
                f"Максимальный размер: {MAX_SAMPLE_SIZE / 1024 / 1024:.0f} МБ"
            )
        if file_format.lower() == 'm4a':
            raise ValueError("Формат M4A не поддерживается. Используйте MP3, WAV или WEBM.")

        # librosa требует файл на диске — пишем во временный с уникальным именем
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=f'.{file_format}')
        try:
            with os.fdopen(tmp_fd, 'wb') as f:
                f.write(audio_bytes)

            # Декодируем в моно-волну; sr=None — не трогаем частоту на этом шаге
            try:
                data, sample_rate = librosa.load(tmp_path, sr=None, mono=True)
            except Exception as e:
                raise ValueError(f"Не удалось прочитать аудио-файл: {e}")

            duration = len(data) / sample_rate  # Длительность в секундах
            if duration < MIN_SAMPLE_SECONDS:
                raise ValueError(
                    f"Образец слишком короткий ({duration:.1f} с). "
                    f"Нужно минимум {MIN_SAMPLE_SECONDS:.0f} секунд чистой речи."
                )
            if duration > MAX_SAMPLE_SECONDS:
                raise ValueError(
                    f"Образец слишком длинный ({duration:.1f} с). "
                    f"Максимум {MAX_SAMPLE_SECONDS:.0f} секунд — лучше 10–20 сек без пауз."
                )

            # Приводим к 22050 Гц и сохраняем как WAV рядом с сервисом
            if sample_rate != REFERENCE_SAMPLE_RATE:
                data = librosa.resample(data, orig_sr=sample_rate, target_sr=REFERENCE_SAMPLE_RATE)
            voice_id = str(uuid.uuid4())  # Уникальный идентификатор голоса
            sf.write(self._voice_path(voice_id), data, REFERENCE_SAMPLE_RATE)

            # Пишем метаданные в реестр
            voice_name = (name or 'Мой голос').strip() or 'Мой голос'
            self._registry[voice_id] = {
                'name': voice_name,
                'duration_sec': round(duration, 1),
                'created_at': datetime.now(timezone.utc).isoformat(),
            }
            self._save_registry()

            return {
                'voice_id': voice_id,
                'name': voice_name,
                'duration_sec': round(duration, 1),
            }
        finally:
            # Временный файл удаляем в любом случае
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    # ====== Управление голосами ======

    def list_voices(self) -> List[dict]:
        """Список зарегистрированных голосов (без внутренних путей)."""
        voices = []
        for voice_id, meta in self._registry.items():
            # Пропускаем записи, чьи файлы потерялись
            if not os.path.exists(self._voice_path(voice_id)):
                continue
            voices.append({
                'voice_id': voice_id,
                'name': meta.get('name', 'Мой голос'),
                'duration_sec': meta.get('duration_sec'),
                'created_at': meta.get('created_at'),
            })
        # Сначала новые
        voices.sort(key=lambda v: v['created_at'] or '', reverse=True)
        return voices

    def delete_voice(self, voice_id: str) -> bool:
        """Удалить образец голоса. Возвращает True, если голос был найден."""
        if not VOICE_ID_RE.match(voice_id):
            return False  # Невалидный id — ничего не делаем
        if voice_id not in self._registry:
            return False
        self._registry.pop(voice_id, None)
        self._save_registry()
        voice_path = self._voice_path(voice_id)
        if os.path.exists(voice_path):
            os.remove(voice_path)
        return True

    # ====== Синтез ======

    def _get_model(self):
        """Ленивая загрузка модели XTTS v2 (при первом синтезе).

        Пакет TTS тяжёлый (~2 ГБ с зависимостями), поэтому импортируем его здесь,
        а не на уровне модуля — приложение и тесты работают без него.

        Перед скачиванием Coqui спрашивает согласие с условиями лицензии
        (интерактивный input(), в бэкенде его не будет). Переменная
        COQUI_TOS_AGREED=1 подтверждает согласие — ознакомьтесь с условиями
        CPML (некоммерческое использование) на github.com/coqui-ai/TTS.
        """
        if self.model is None:
            print(f"Загрузка модели XTTS v2 ({XTTS_MODEL_NAME})...")
            os.environ.setdefault('COQUI_TOS_AGREED', '1')  # Согласие с условиями Coqui (CPML)
            from TTS.api import TTS  # Ленивый импорт Coqui TTS
            # gpu=False — инференс на CPU (на хостинге нет GPU)
            self.model = TTS(model_name=XTTS_MODEL_NAME, gpu=False)
            print("Модель XTTS v2 загружена")
        return self.model

    def _get_voice_or_raise(self, voice_id: str) -> str:
        """Проверить voice_id и вернуть путь к образцу. ValueError если нет."""
        if not VOICE_ID_RE.match(voice_id):
            raise ValueError("Некорректный идентификатор голоса")
        voice_path = self._voice_path(voice_id)
        if voice_id not in self._registry or not os.path.exists(voice_path):
            raise ValueError("Голос не найден. Зарегистрируйте образец во вкладке «Мой голос».")
        return voice_path

    def synthesize_wave(self, text: str, voice_id: str) -> np.ndarray:
        """Синтез речи клонированным голосом — возвращает волну (24 кГц, mono, float32).

        Текст проходит ту же нормализацию, что и для Silero: числа словами,
        ударения, словарь IT-терминов. SSML-теги убираются — XTTS их не поддерживает.

        Raises:
            ValueError: Пустой текст или голос не найден.
        """
        if not text or not text.strip():
            raise ValueError("Текст не может быть пустым")
        voice_path = self._get_voice_or_raise(voice_id)

        # Готовим текст: без SSML, с нормализацией (числа, термины).
        # Маркер принудительного ударения '[!]' — синтаксис Silero: у XTTS v2
        # такого механизма нет, а '+' после нормализации превращается в токен
        # [UNK] и разрывает слово («вод+а» → «вод»+UNK+«а») — поэтому '[!]'
        # вырезаем ещё до нормализации.
        no_stress = re.sub(r'\[!]', '', _strip_ssml(text))
        # «2+2» → «2 плюс 2» до нормализации: иначе '+' окажется между словами
        # числительных и попадёт под вырезание маркеров ударения ниже
        no_stress = re.sub(r'(?<=\d)\s*\+\s*(?=\d)', ' плюс ', no_stress)
        prepared = normalize_for_tts(no_stress).strip()
        # Готовый '+' между буквами («вод+а») — тот же маркер ударения от
        # пользователя, XTTS его не понимает — убираем, не разрывая слово
        prepared = re.sub(r'(?<=[A-Za-zА-Яа-яЁё])\+(?=[A-Za-zА-Яа-яЁё])', '', prepared)
        if not prepared:
            raise ValueError("После обработки текст оказался пустым")

        model = self._get_model()
        # XTTS пишет результат в файл — используем уникальное имя (защита от гонок)
        tmp_fd, tmp_path = tempfile.mkstemp(suffix='.wav')
        os.close(tmp_fd)
        try:
            # Под блокировкой: модель обслуживает один запрос за раз
            with _inference_lock:
                model.tts_to_file(
                    text=prepared,
                    speaker_wav=voice_path,  # Образец голоса для клонирования
                    language='ru',           # Русский язык
                    file_path=tmp_path,
                )
            # Читаем результат обратно в память
            data, _ = sf.read(tmp_path, dtype='float32')
            if data.ndim > 1:  # На всякий случай сводим к моно
                data = data.mean(axis=1)
            return data
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def synthesize(self, text: str, voice_id: str) -> BytesIO:
        """Синтез речи клонированным голосом — возвращает MP3 в BytesIO."""
        import torch  # Ленивый импорт: нужен только для конвертации в MP3
        import torchaudio

        wave = self.synthesize_wave(text, voice_id)

        # Конвертация в MP3 через torchaudio во временный файл (уже уникальный)
        audio_tensor = torch.from_numpy(wave).unsqueeze(0)  # [samples] → [1, samples]
        mp3_buffer = BytesIO()
        tmp = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
        temp_mp3 = tmp.name
        tmp.close()
        try:
            torchaudio.save(temp_mp3, audio_tensor, SAMPLE_RATE, format='mp3')
            with open(temp_mp3, 'rb') as f:
                mp3_buffer.write(f.read())
        finally:
            os.remove(temp_mp3)
        mp3_buffer.seek(0)
        return mp3_buffer


# Singleton-паттерн — реестр и (позже) модель живут в одном экземпляре
voice_clone_service = None  # Глобальная переменная для хранения экземпляра


def get_voice_clone_service() -> VoiceCloneService:
    """Получение экземпляра VoiceCloneService (singleton)."""
    global voice_clone_service  # Обращаемся к глобальной переменной
    if voice_clone_service is None:  # Если сервис ещё не создан
        voice_clone_service = VoiceCloneService()  # Создаём экземпляр
    return voice_clone_service  # Возвращаем экземпляр
