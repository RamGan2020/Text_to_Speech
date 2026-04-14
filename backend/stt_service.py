# stt_service.py — Сервис для распознавания речи из аудио-файлов (Speech-to-Text)
# Использует OpenAI Whisper для преобразования аудио в текст.
# Поддерживаемые форматы: MP3, WAV, OGG, FLAC, WEBM.
# Конвертация аудио происходит через librosa (без зависимости от ffmpeg).

import os  # Модуль для работы с операционной системой (удаление временных файлов)
import io  # Модуль для работы с байтовыми потоками
import tempfile  # Модуль для работы с временными файлами (сохранение аудио для librosa)
import numpy as np  # Библиотека для работы с числовыми массивами (аудио-данные)
import soundfile as sf  # Библиотека для чтения/записи аудиофайлов
import librosa  # Библиотека для загрузки и ресемплинга аудио
import whisper  # Библиотека OpenAI Whisper для распознавания речи


class STTService:
    """Сервис для распознавания речи с использованием OpenAI Whisper (модель small)."""

    def __init__(self):
        """Инициализация сервиса: загрузка модели Whisper."""
        self.model = None  # Модель Whisper — будет загружена при первом вызове
        self.device = "cpu"  # Устройство вычислений — CPU (можно заменить на "cuda" для GPU)
        self.language = "ru"  # Язык распознавания — русский
        self._load_model()  # Загружаем модель при инициализации сервиса

    def _load_model(self):
        """Загрузка модели Whisper (small — баланс точности и потребления памяти).
        
        Модель small (~500 МБ RAM) обеспечивает хорошую точность для русского языка.
        Альтернативы: tiny (~75 МБ), base (~150 МБ), medium (~1.5 ГБ), large (~3 ГБ).
        """
        print("Загрузка модели Whisper (small)...")  # Сообщение о начале загрузки
        # Загружаем модель small из репозитория OpenAI Whisper
        self.model = whisper.load_model("small", device=self.device)
        print("Модель Whisper загружена")  # Сообщение об успешной загрузке

    def transcribe(self, audio_bytes: bytes, file_format: str = "mp3") -> str:
        """Распознавание речи из аудио-файла — возвращает текст.

        Процесс:
        1. Сохраняем аудио во временный файл (librosa требует файл, а не BytesIO)
        2. Загружаем аудио через librosa (автоматическое определение формата)
        3. Конвертируем в моно и ресемплим до 16kHz
        4. Передаём numpy массив в Whisper для распознавания
        5. Удаляем временный файл

        Args:
            audio_bytes: Байты аудио-файла (MP3, WAV, OGG, FLAC, WEBM)
            file_format: Формат аудио — "mp3", "wav", "ogg", "flac", "webm"

        Returns:
            str: Распознанный текст

        Raises:
            ValueError: Если файл слишком большой или формат не поддерживается
        """
        # Проверяем размер файла — максимум 25 МБ для защиты от перегрузки памяти
        MAX_SIZE = 25 * 1024 * 1024  # 25 МБ в байтах
        if len(audio_bytes) > MAX_SIZE:
            raise ValueError(
                f"Файл слишком большой ({len(audio_bytes) / 1024 / 1024:.1f} МБ). "
                f"Максимальный размер: {MAX_SIZE / 1024 / 1024:.0f} МБ"
            )

        # M4A не поддерживается без ffmpeg (audioread не может его прочитать)
        if file_format.lower() == "m4a":
            raise ValueError("Формат M4A не поддерживается. Используйте MP3, WAV или WEBM.")

        # Сохраняем аудио во временный файл — librosa требует файл на диске
        # suffix — расширение файла для корректного определения формата
        with tempfile.NamedTemporaryFile(suffix=f".{file_format}", delete=False) as tmp_file:
            tmp_file.write(audio_bytes)  # Записываем байты во временный файл
            tmp_path = tmp_file.name  # Сохраняем путь к файлу

        try:
            # Загружаем аудио через librosa из файла на диске
            # librosa поддерживает MP3, WAV, OGG, FLAC, WEBM (через audioread)
            # sr=None — не менять частоту дискретизации на этом этапе
            # mono=True — сразу конвертировать в моно (один канал)
            data, sample_rate = librosa.load(tmp_path, sr=None, mono=True)

            # Ресемплим до 16kHz — это требуется моделью Whisper
            if sample_rate != 16000:
                data = librosa.resample(data, orig_sr=sample_rate, target_sr=16000)

            # Конвертируем в float32 — требование Whisper (не float64)
            data = data.astype(np.float32)

            # Вызываем метод распознавания Whisper с numpy массивом
            # audio=data — передаём аудио напрямую, без файла
            # language="ru" — принудительно распознавать русский язык
            # fp16=False — не использовать полуточную точность (не поддерживается на CPU)
            result = self.model.transcribe(
                data,                   # numpy массив аудио (16kHz, mono, float32)
                language=self.language,  # Язык — русский
                fp16=False              # Отключаем fp16 для CPU
            )
            # result — словарь с ключами:
            #   "text" — распознанный текст
            #   "segments" — сегменты с таймкодами
            #   "language" — определённый язык
            return result["text"].strip()  # Возвращаем текст (без пробелов по краям)
        finally:
            # Удаляем временный файл в любом случае (даже если произошла ошибка)
            os.unlink(tmp_path)


# Singleton-паттерн — модель загружается один раз и переиспользуется
stt_service = None  # Глобальная переменная для хранения экземпляра сервиса

def get_stt_service() -> STTService:
    """Получение экземпляра STT-сервиса (singleton).
    
    При первом вызове создаёт экземпляр и загружает модель Whisper.
    При повторных вызовах возвращает тот же объект — модель не перезагружается.
    """
    global stt_service  # Обращаемся к глобальной переменной
    if stt_service is None:  # Если сервис ещё не создан
        stt_service = STTService()  # Создаём экземпляр (загружаем модель Whisper)
    return stt_service  # Возвращаем экземпляр
