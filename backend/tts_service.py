# tts_service.py — Сервис для работы с моделью Silero TTS v4
# Этот файл содержит класс SileroTTSService, который загружает модель,
# разбивает текст на чанки и синтезирует речь в MP3-файл

from __future__ import annotations  # Включаем отложенную аннотацию типов (для Python 3.8+)
import torch  # PyTorch — фреймворк для работы с нейросетями и тензорами
import torchaudio  # Библиотека для обработки аудио в PyTorch
import numpy as np  # Библиотека для работы с числовыми массивами
import re  # Модуль для работы с регулярными выражениями
from io import BytesIO  # Класс для работы с байтовыми потоками в памяти (без файлов на диске)
import soundfile as sf  # Библиотека для чтения/записи аудиофайлов (WAV)
from typing import List  # Тип List для аннотаций (список строк)


class SileroTTSService:
    """Сервис для синтеза речи с использованием модели Silero TTS v4"""

    def __init__(self):
        """Инициализация сервиса: установка устройства, обнуление модели, загрузка"""
        self.device = torch.device('cpu')  # Указываем устройство — CPU (можно заменить на 'cuda' для GPU)
        self.model = None  # Пока модель не загружена — будет None
        self.sample_rate = 48000  # Частота дискретизации аудио (48 кГц — высокое качество)
        self._load_model()  # Загружаем модель при инициализации сервиса

    def _load_model(self):
        """Загрузка модели Silero TTS v4 из torch.hub"""
        print("Загрузка модели Silero TTS v4 (kseniya)...")  # Выводим сообщение о начале загрузки
        # Загружаем модель из репозитория snakers4/silero-models с сайта GitHub
        # language='ru' — русский язык, speaker='v4_ru' — версия модели v4 для русского
        result = torch.hub.load(
            repo_or_dir='snakers4/silero-models',  # Репозиторий с моделя Silero
            model='silero_tts',                    # Название модели (TTS)
            language='ru',                         # Язык — русский
            speaker='v4_ru'                        # Версия модели — v4 для русского языка
        )
        # torch.hub.load может вернуть кортеж (модель, доп.данные) или саму модель
        if isinstance(result, tuple):  # Если результат — кортеж
            self.model = result[0]     # Берём первый элемент (это сама модель)
        else:                          # Если результат — не кортеж
            self.model = result        # Используем результат напрямую
        self.model.to(self.device)     # Перемещаем модель на устройство (CPU)
        self.sample_rate = 48000       # Устанавливаем частоту дискретизации 48 кГц
        self.speaker = 'kseniya'       # Голос по умолчанию
        print("Модель v4 загружена")   # Выводим сообщение об успешной загрузке

    def _split_text(self, text: str, max_chars: int = 500) -> List[str]:
        """Разбиение текста на чанки до max_chars символов с сохранением целостности слов"""
        text = text.strip()  # Удаляем пробелы в начале и конце текста
        if not text:         # Если текст пустой после обрезки
            return []        # Возвращаем пустой список — нечего синтезировать

        chunks = []          # Список для хранения готовых чанков
        current_chunk = ""   # Текущий накапливаемый чанк
        words = text.split() # Разбиваем текст на слова по пробелам

        for word in words:   # Проходим по каждому слову
            if not current_chunk:  # Если текущий чанк пустой (первое слово)
                current_chunk = word  # Начинаем чанк с этого слова
            elif len(current_chunk) + 1 + len(word) <= max_chars:  # Если слово помещается
                current_chunk += " " + word  # Добавляем пробел и слово к чанку
            else:  # Если слово не помещается в текущий чанк
                chunks.append(current_chunk)  # Сохраняем заполненный чанк
                current_chunk = word          # Начинаем новый чанк с текущего слова

        if current_chunk:        # После цикла остался незавершённый чанк
            chunks.append(current_chunk)  # Добавляем его в список

        return chunks  # Возвращаем список чанков

    def synthesize(self, text: str, speaker: str = 'kseniya', put_accent: bool = True, put_yo: bool = True) -> BytesIO:
        """Синтез речи из текста — возвращает MP3-файл в виде BytesIO
        
        Args:
            text: Текст для озвучивания
            speaker: Имя голоса (kseniya, xenia, baya, aidar, eugene)
            put_accent: Расстановка ударений
            put_yo: Замена 'е' на 'ё'
        """
        chunks = self._split_text(text)  # Разбиваем текст на чанки

        if not chunks:  # Если после разбиения чанков нет (пустой текст)
            raise ValueError("Пустой текст")  # Выбрасываем ошибку

        all_audio = []  # Список для хранения аудио-тензоров каждого чанка

        for i, chunk in enumerate(chunks):  # Проходим по каждому чанку с индексом
            print(f"Генерация {i+1}/{len(chunks)}: {chunk[:60]}...")  # Логируем процесс
            # Вызываем метод модели для синтеза аудио из текста чанка
            audio = self.model.apply_tts(
                text=chunk,               # Текст чанка для озвучивания
                speaker=speaker,          # Выбранный голос (kseniya, aidar, etc.)
                sample_rate=self.sample_rate,  # Частота дискретизации (48000 Гц)
                put_accent=put_accent,    # Флаг расстановки ударений
                put_yo=put_yo             # Флаг замены 'е' на 'ё'
            )
            all_audio.append(audio)  # Добавляем аудио-тензор в список

        # Конкатенация всех аудио-тензоров в один
        if len(all_audio) == 1:        # Если чанк был один
            combined_audio = all_audio[0]  # Используем его аудио напрямую
        else:                            # Если чанков несколько
            combined_audio = torch.cat(all_audio, dim=0)  # Склеиваем тензоры по оси samples

        # Конвертация в MP3 через BytesIO (всё в памяти, без файлов на диске)
        mp3_buffer = BytesIO()  # Создаём буфер в памяти для MP3

        # Конвертация тензора в numpy-массив для работы с soundfile
        audio_np = combined_audio.numpy()  # Превращаем torch.Tensor в numpy.ndarray

        # Для MP3 используем torchaudio — он умеет сохранять в MP3
        audio_tensor = combined_audio.unsqueeze(0)  # Добавляем ось каналов [samples] -> [1, samples]

        # Сохраняем как MP3 используя torchaudio — во временный файл на диске
        temp_mp3 = "temp_output.mp3"  # Имя временного файла
        torchaudio.save(
            temp_mp3,                 # Путь к файлу
            audio_tensor,             # Аудио-тензор [1, samples]
            self.sample_rate,         # Частота дискретизации
            format="mp3"              # Формат — MP3
        )

        # Читаем MP3-файл обратно в BytesIO-буфер
        with open(temp_mp3, 'rb') as f:  # Открываем временный файл для чтения
            mp3_buffer.write(f.read())   # Читаем всё содержимое в буфер

        import os  # Импортируем os для удаления файла
        os.remove(temp_mp3)  # Удаляем временный MP3-файл с диска

        mp3_buffer.seek(0)  # Возвращаем указатель буфера в начало
        return mp3_buffer   # Возвращаем буфер с MP3


# Singleton-паттерн — модель загружается один раз и переиспользуется
tts_service = None  # Глобальная переменная для хранения экземпляра сервиса

def get_tts_service() -> SileroTTSService:
    """Получение экземпляра TTS-сервиса (singleton)"""
    global tts_service  # Обращаемся к глобальной переменной
    if tts_service is None:  # Если сервис ещё не создан
        tts_service = SileroTTSService()  # Создаём экземпляр (загружаем модель)
    return tts_service  # Возвращаем экземпляр (при повторных вызовах — тот же объект)
