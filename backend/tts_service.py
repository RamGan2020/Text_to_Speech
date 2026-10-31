# tts_service.py — Сервис для работы с моделью Silero TTS v5
# Этот файл содержит класс SileroTTSService, который загружает модель,
# разбивает текст на чанки и синтезирует речь в MP3-файл.
# Поддерживает режим "Подкаст" с тегами [voice:name] и [pause:time].

from __future__ import annotations  # Включаем отложенную аннотацию типов (для Python 3.8+)
import torch  # PyTorch — фреймворк для работы с нейросетями и тензорами
import torchaudio  # Библиотека для обработки аудио в PyTorch
import numpy as np  # Библиотека для работы с числовыми массивами
import re  # Модуль для работы с регулярными выражениями
from io import BytesIO  # Класс для работы с байтовыми потоками в памяти (без файлов на диске)
from typing import List, Dict, Any  # Типы для аннотаций
import os  # Модуль для работы с ОС (удаление временных файлов)
from text_normalization import normalize_for_tts, normalize_numbers, split_by_language

# Версия русской модели Silero. v5_6_ru — последняя: различает интонацию
# вопросов, восклицаний и эмфазы. Набор голосов тот же, что в v4_ru.
SILERO_MODEL_ID = 'v5_6_ru'

# Английская модель — для англоязычных фраз внутри русского текста
ENGLISH_MODEL_ID = 'v3_en'

# Английский голос под каждого русского диктора: подобран по высоте тона,
# чтобы при смене языка тембр оставался похожим. Файлы для прослушивания —
# .qwen/tmp/audition/<русский голос>__<английский голос>.mp3
ENGLISH_VOICE_BY_SPEAKER = {
    'kseniya': 'en_11',
    'xenia': 'en_41',
    'baya': 'en_95',
    'aidar': 'en_89',
    'eugene': 'en_106',
}
LANGUAGE_SWITCH_PAUSE_MS = 120  # Пауза на стыке языков, смягчает смену тембра


class SileroTTSService:
    """Сервис для синтеза речи с использованием модели Silero TTS v5"""

    def __init__(self):
        """Инициализация сервиса: установка устройства, обнуление модели, загрузка"""
        self.device = torch.device('cpu')  # Указываем устройство — CPU (можно заменить на 'cuda' для GPU)
        self.model = None  # Пока модель не загружена — будет None
        self.english_model = None  # Английская модель грузится по требованию
        self.sample_rate = 48000  # Частота дискретизации аудио (48 кГц — высокое качество)
        self._load_model()  # Загружаем модель при инициализации сервиса

    def _load_model(self):
        """Загрузка модели Silero TTS v5 из torch.hub"""
        print(f"Загрузка модели Silero TTS {SILERO_MODEL_ID} (kseniya)...")  # Выводим сообщение о начале загрузки
        # Загружаем модель из репозитория snakers4/silero-models с сайта GitHub
        # language='ru' — русский язык, speaker=SILERO_MODEL_ID — версия модели для русского
        hub_args = dict(
            repo_or_dir='snakers4/silero-models',  # Репозиторий с моделями Silero
            model='silero_tts',                    # Название модели (TTS)
            language='ru',                         # Язык — русский
            speaker=SILERO_MODEL_ID                # Версия модели — v5_6_ru для русского языка
        )
        try:
            result = torch.hub.load(**hub_args)
        except AssertionError:
            # В старом кэше ~/.cache/torch/hub ещё нет v5_6_ru — обновляем копию репозитория
            result = torch.hub.load(**hub_args, force_reload=True)
        # torch.hub.load может вернуть кортеж (модель, доп.данные) или саму модель
        if isinstance(result, tuple):  # Если результат — кортеж
            self.model = result[0]     # Берём первый элемент (это сама модель)
        else:                          # Если результат — не кортеж
            self.model = result        # Используем результат напрямую
        self.model.to(self.device)     # Перемещаем модель на устройство (CPU)
        self.sample_rate = 48000       # Устанавливаем частоту дискретизации 48 кГц
        self.speaker = 'kseniya'       # Голос по умолчанию
        print("Модель v5_6_ru загружена")   # Выводим сообщение об успешной загрузке

    def _get_english_model(self):
        """Английская модель Silero — загружается при первом английском фрагменте

        Нужна потому, что в русском алфавите нет английских звуков.
        Голос берётся из ENGLISH_VOICE_BY_SPEAKER, чтобы тембр совпадал
        с выбранным русским диктором.
        """
        if self.english_model is None:
            print(f"Загрузка английской модели Silero TTS {ENGLISH_MODEL_ID}...")
            result = torch.hub.load(
                repo_or_dir='snakers4/silero-models',
                model='silero_tts',
                language='en',
                speaker=ENGLISH_MODEL_ID
            )
            # torch.hub.load возвращает кортеж (модель, пример) или саму модель
            self.english_model = result[0] if isinstance(result, tuple) else result
            self.english_model.to(self.device)
            print("Английская модель загружена")
        return self.english_model

    def _generate_silence(self, duration_ms: int) -> torch.Tensor:
        """Генерация тишины заданной длительности
        
        Args:
            duration_ms: Длительность тишины в миллисекундах
            
        Returns:
            torch.Tensor: Тензор с тишиной (нули)
        """
        # Вычисляем количество сэмплов: (время в сек) * (сэмплов в сек)
        num_samples = int((duration_ms / 1000.0) * self.sample_rate)
        # Создаем тензор нулей
        return torch.zeros(num_samples, dtype=torch.float32)

    def _parse_pause_duration_ms(self, raw_value: str) -> int:
        """Парсит длительность паузы в миллисекунды.

        Поддерживает:
        - 500ms
        - 1s
        - 1.5s
        - 1.5  (трактуем как секунды)
        - 500  (целое без единиц трактуем как миллисекунды)
        """
        value = raw_value.strip().lower()
        if value.endswith('ms'):
            return max(0, int(float(value[:-2].strip())))
        if value.endswith('s'):
            return max(0, int(float(value[:-1].strip()) * 1000))
        if '.' in value:
            return max(0, int(float(value) * 1000))
        return max(0, int(value))

    def _parse_podcast_script(self, text: str) -> List[Dict[str, Any]]:
        """Парсинг сценария подкаста с тегами [voice:name] и [pause:duration]."""
        segments: List[Dict[str, Any]] = []
        tag_pattern = re.compile(r'\[(voice|pause|break)\s*:\s*([^\]]+)\]', re.IGNORECASE)
        current_voice = "kseniya"
        cursor = 0

        for match in tag_pattern.finditer(text):
            # Текст между предыдущим и текущим тегом
            chunk = text[cursor:match.start()].strip()
            if chunk:
                segments.append({
                    "type": "speech",
                    "text": chunk,
                    "voice": current_voice
                })

            tag_type = match.group(1).lower()
            tag_value = match.group(2).strip()

            if tag_type == 'voice':
                current_voice = tag_value
            else:
                duration_ms = self._parse_pause_duration_ms(tag_value)
                segments.append({
                    "type": "pause",
                    "duration_ms": duration_ms
                })

            cursor = match.end()

        # Хвостовой текст после последнего тега
        tail = text[cursor:].strip()
        if tail:
            segments.append({
                "type": "speech",
                "text": tail,
                "voice": current_voice
            })

        # Если тегов не было вообще — обычный одно-голосный сценарий
        if not segments and text.strip():
            segments.append({
                "type": "speech",
                "text": text.strip(),
                "voice": "kseniya"
            })

        return segments

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

    def synthesize(self, text: str, speaker: str = 'kseniya', put_accent: bool = True, put_yo: bool = True, podcast_mode: bool = False, english_mode: str = 'voice') -> BytesIO:
        """Синтез речи из текста — возвращает MP3-файл в виде BytesIO

        Args:
            text: Текст для озвучивания (или сценарий подкаста)
            speaker: Голос по умолчанию (для обычного режима)
            put_accent: Расстановка ударений
            put_yo: Замена 'е' на 'ё'
            podcast_mode: Если True, парсить теги [voice] и [pause]
            english_mode: 'voice' — английские фразы читает v3_en голосом,
                подобранным под диктора; 'transliterate' — тот же диктор,
                латиница записывается кириллицей
        """
        
        # Если режим подкаста — парсим сценарий
        if podcast_mode:
            segments = self._parse_podcast_script(text)
        else:
            # В обычном режиме — один сегмент с указанным голосом
            segments = [{
                "type": "speech",
                "text": text,
                "voice": speaker
            }]

        all_audio = []  # Список для хранения аудио-тензоров каждого чанка

        # Проходим по всем сегментам сценария
        for segment in segments:
            if segment["type"] == "pause":
                # Если пауза — генерируем тишину
                print(f"Генерация паузы: {segment['duration_ms']}мс")
                silence = self._generate_silence(segment['duration_ms'])
                all_audio.append(silence)
            else:
                # Если речь — синтезируем
                voice = segment.get("voice", speaker)
                # Проверяем, есть ли такой голос в модели
                if voice not in ['kseniya', 'xenia', 'baya', 'aidar', 'eugene']:
                    print(f"Неизвестный голос '{voice}', используем {speaker}")
                    voice = speaker

                # Модель вырезает всё вне своего алфавита, поэтому текст делим
                # по языкам: русские куски — транслитерация и числа словами,
                # английские фразы — английская модель с голосом под этого диктора
                previous_language = None
                english_voice = ENGLISH_VOICE_BY_SPEAKER.get(voice, 'en_11')

                # В режиме транслитерации английские слова читает тот же диктор,
                # в режиме voice — отдельная модель с подобранным голосом
                pieces = ([('ru', segment['text'])] if english_mode == 'transliterate'
                          else split_by_language(segment['text']))

                for language, piece in pieces:
                    if language == 'en':
                        model = self._get_english_model()
                        piece_text = normalize_numbers(piece, lang='en').strip()
                        piece_voice = english_voice
                    else:
                        model = self.model
                        piece_text = normalize_for_tts(piece).strip()
                        piece_voice = voice

                    # Пунктуация без букв и цифр роняет модель Silero — пропускаем
                    if not piece_text or not any(char.isalnum() for char in piece_text):
                        continue

                    # Смена языка посреди фразы звучит резко — сглаживаем паузой
                    if previous_language is not None and language != previous_language:
                        all_audio.append(self._generate_silence(LANGUAGE_SWITCH_PAUSE_MS))
                    previous_language = language

                    print(f"Генерация речи (голос: {piece_voice}): {piece_text[:50]}...")

                    # Разбиваем кусок на чанки, если он длинный
                    for chunk_text in self._split_text(piece_text):
                        # Вызываем метод модели для синтеза аудио из текста чанка
                        audio = model.apply_tts(
                            text=chunk_text,            # Текст чанка для озвучивания
                            speaker=piece_voice,        # Голос под выбранного диктора
                            sample_rate=self.sample_rate,  # Частота дискретизации (48000 Гц)
                            put_accent=put_accent,      # Флаг расстановки ударений
                            put_yo=put_yo               # Флаг замены 'е' на 'ё'
                        )
                        all_audio.append(audio)

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
