# stt_service.py — Сервис для распознавания речи из аудио-файлов (Speech-to-Text)
# Использует OpenAI Whisper для преобразования MP3/WAV в текст

import os  # Модуль для работы с операционной системой
import io  # Модуль для работы с байтовыми потоками
import numpy as np  # Библиотека для работы с числовыми массивами
import soundfile as sf  # Библиотека для чтения/записи аудиофайлов
import librosa  # Библиотека для ресемплинга аудио
import whisper  # Библиотека OpenAI Whisper для распознавания речи


class STTService:
    """Сервис для распознавания речи с использованием OpenAI Whisper"""

    def __init__(self):
        """Инициализация сервиса: загрузка модели Whisper"""
        self.model = None  # Модель Whisper — будет загружена при первом вызове
        self.device = "cpu"  # Устройство вычислений — CPU (можно заменить на "cuda")
        self.language = "ru"  # Язык распознавания — русский
        self._load_model()  # Загружаем модель при инициализации

    def _load_model(self):
        """Загрузка модели Whisper (small — баланс точности и потребления памяти)"""
        print("Загрузка модели Whisper (small)...")  # Сообщение о начале загрузки
        # Загружаем модель small — хороший баланс точности и потребления RAM
        # tiny — быстрая, но менее точная (~75 МБ); base (~150 МБ); small (~500 МБ)
        # medium (~1.5 ГБ) и large (~3 ГБ) — требуют много RAM
        self.model = whisper.load_model("small", device=self.device)
        print("Модель Whisper загружена")  # Сообщение об успешной загрузке

    def transcribe(self, audio_bytes: bytes, file_format: str = "mp3") -> str:
        """Распознавание речи из аудио-файла — возвращает текст
        
        Args:
            audio_bytes: Байты аудио-файла (MP3 или WAV)
            file_format: Формат аудио — "mp3" или "wav" (по умолчанию "mp3")
        
        Returns:
            str: Распознанный текст
        """
        # Проверяем размер файла — максимум 25 МБ для защиты от перегрузки
        MAX_SIZE = 25 * 1024 * 1024  # 25 МБ в байтах
        if len(audio_bytes) > MAX_SIZE:
            raise ValueError(
                f"Файл слишком большой ({len(audio_bytes) / 1024 / 1024:.1f} МБ). "
                f"Максимальный размер: {MAX_SIZE / 1024 / 1024:.0f} МБ"
            )

        # M4A не поддерживается без ffmpeg
        if file_format.lower() == "m4a":
            raise ValueError("Формат M4A не поддерживается. Используйте MP3 или WAV.")

        # Загружаем аудио через soundfile (поддерживает MP3, WAV, OGG, FLAC)
        data, sample_rate = sf.read(io.BytesIO(audio_bytes))
        
        # Если аудио стерео — конвертируем в моно
        if len(data.shape) > 1:
            data = data.mean(axis=1)  # Усредняем каналы
        
        # Ресемплим до 16kHz (требуется Whisper)
        if sample_rate != 16000:
            data = librosa.resample(data, orig_sr=sample_rate, target_sr=16000)

        # Конвертируем в float32 (требование Whisper)
        data = data.astype(np.float32)

        # Вызываем метод распознавания Whisper с numpy массивом
        # audio=data — передаём аудио напрямую, без файла
        # fp16=False — не использовать полуточную точность (не поддерживается на CPU)
        result = self.model.transcribe(
            data,                   # numpy массив аудио (16kHz, mono)
            language=self.language,  # Язык — русский
            fp16=False              # Отключаем fp16 для CPU
        )
        # result — словарь с ключами: "text" (текст), "segments" (сегменты), "language" (язык)
        return result["text"].strip()  # Возвращаем распознанный текст (без пробелов по краям)


# Singleton-паттерн — модель загружается один раз и переиспользуется
stt_service = None  # Глобальная переменная для хранения экземпляра сервиса

def get_stt_service() -> STTService:
    """Получение экземпляра STT-сервиса (singleton)"""
    global stt_service  # Обращаемся к глобальной переменной
    if stt_service is None:  # Если сервис ещё не создан
        stt_service = STTService()  # Создаём экземпляр (загружаем модель Whisper)
    return stt_service  # Возвращаем экземпляр (при повторных вызовах — тот же объект)
