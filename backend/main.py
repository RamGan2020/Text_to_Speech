# main.py — Точка входа FastAPI сервера для приложения TTS/STT
# Этот файл определяет HTTP-эндпоинты, модели запросов/ответов и настройку сервера
# Сервисы: TTS (синтез речи из текста) и STT (распознавание речи из аудио)

from fastapi import FastAPI, HTTPException  # Импортируем FastAPI (фреймворк) и HTTPException (для ошибок)
from fastapi.middleware.cors import CORSMiddleware  # Middleware для CORS (разрешаем запросы с фронтенда)
from fastapi.responses import StreamingResponse  # Ответ-поток для отправки больших файлов без загрузки в память
from pydantic import BaseModel  # Библиотека для валидации и типизации данных запросов
from fastapi import UploadFile, File  # Импортируем для загрузки файлов через multipart/form-data
from tts_service import get_tts_service  # Функция получения экземпляра TTS-сервиса (singleton)
from stt_service import get_stt_service  # Функция получения экземпляра STT-сервиса (singleton)
from deepseek_service import get_deepseek_service  # Функция получения экземпляра DeepSeek-сервиса
import io  # Модуль для работы с потоками в памяти (BytesIO)
from typing import Optional  # Тип Optional для аннотаций

# Создаём экземпляр FastAPI-приложения с названием и версией
app = FastAPI(title="Text-to-Speech / Speech-to-Text API", version="1.0.0")

# Настраиваем CORS middleware — разрешаем запросы с любых источников
# В продакшене стоит ограничить allow_origins до конкретного домена
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # Разрешаем все домены (в продакшене заменить на конкретный)
    allow_credentials=True,    # Разрешаем передачу cookies
    allow_methods=["*"],       # Разрешаем все HTTP-методы (GET, POST, etc.)
    allow_headers=["*"],       # Разрешаем все заголовки
)


# Класс-модель для валидации тела POST-запроса на синтез речи
# Pydantic автоматически проверит типы и установит значения по умолчанию
class SynthesizeRequest(BaseModel):
    text: str                  # Обязательное поле — текст для озвучивания
    speaker: str = 'kseniya'   # Голос по умолчанию (доступны: kseniya, xenia, baya, aidar, eugene)
    put_accent: bool = True    # Расставлять ли ударения по умолчанию
    put_yo: bool = True        # Заменять ли 'е' на 'ё' где нужно по умолчанию
    podcast_mode: bool = False # Режим подкаста (парсинг тегов [voice] и [pause])


# Класс-модель для валидации тела POST-запроса к DeepSeek
class DeepSeekRequest(BaseModel):
    question: str              # Обязательное поле — текст вопроса
    api_key: Optional[str] = None  # API-ключ DeepSeek (опционально, можно использовать из окружения)
    system_prompt: Optional[str] = None  # Системная инструкция (опционально)
    model: str = 'deepseek-chat'  # Модель DeepSeek
    max_tokens: int = 2048     # Максимальное количество токенов
    temperature: float = 0.7   # Температура генерации



# POST-эндпоинт для синтеза речи — принимает JSON с текстом, возвращает MP3-файл
@app.post("/synthesize")
async def synthesize(request: SynthesizeRequest):
    """Endpoint для синтеза речи (Text-to-Speech).
    
    Принимает JSON с текстом и настройками голоса, возвращает MP3-файл.
    Текст автоматически разбивается на чанки (до 500 символов) для обработки.
    """
    # Проверяем, что текст не пустой (после удаления пробелов)
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Текст не может быть пустым")

    try:
        # Получаем экземпляр TTS-сервиса (singleton — модель Silero загружается один раз)
        tts_service = get_tts_service()
        # Вызываем метод синтеза — передаём текст и настройки голоса
        mp3_file = tts_service.synthesize(
            text=request.text,          # Текст для озвучивания
            speaker=request.speaker,    # Выбранный голос
            put_accent=request.put_accent,  # Флаг расстановки ударений
            put_yo=request.put_yo,       # Флаг расстановки буквы 'ё'
            podcast_mode=request.podcast_mode  # Режим подкаста (теги)
        )

        # Возвращаем MP3-файл как streaming response — браузер скачивает файл
        return StreamingResponse(
            io.BytesIO(mp3_file.getvalue()),  # Оборачиваем байты в поток
            media_type="audio/mpeg",           # MIME-тип для MP3
            headers={
                "Content-Disposition": "attachment; filename=speech.mp3"  # Имя файла при скачивании
            }
        )
    except Exception as e:
        # Если произошла любая ошибка — возвращаем 500 с описанием
        raise HTTPException(status_code=500, detail=f"Ошибка синтеза: {str(e)}")


# POST-эндпоинт для распознавания речи — принимает аудио-файл, возвращает JSON с текстом
@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """Endpoint для распознавания речи (Speech-to-Text).
    
    Принимает аудио-файл (MP3, WAV, OGG, FLAC, WEBM), возвращает распознанный текст.
    Аудио загружается через multipart/form-data.
    """
    # Проверяем, что файл передан
    if not audio or not audio.filename:
        raise HTTPException(status_code=400, detail="Необходимо загрузить аудио-файл")

    # Проверяем расширение файла
    filename_lower = audio.filename.lower()
    if not filename_lower.endswith(('.mp3', '.wav', '.ogg', '.flac', '.webm')):
        raise HTTPException(
            status_code=400,
            detail="Поддерживаются только форматы: MP3, WAV, OGG, FLAC, WEBM"
        )

    try:
        # Читаем содержимое файла в байты
        audio_bytes = await audio.read()
        # Получаем экземпляр STT-сервиса (singleton — модель Whisper загружается один раз)
        stt_service = get_stt_service()
        # Определяем формат по расширению файла
        file_format = filename_lower.split('.')[-1]
        # Вызываем метод распознавания — получаем текст
        text = stt_service.transcribe(audio_bytes, file_format=file_format)

        # Возвращаем JSON с распознанным текстом и именем файла
        return {"text": text, "filename": audio.filename}
    except Exception as e:
        # Если произошла любая ошибка — возвращаем 500 с описанием
        raise HTTPException(status_code=500, detail=f"Ошибка распознавания: {str(e)}")


# GET-эндпоинт для проверки работоспособности сервера
@app.get("/health")
async def health_check():
    """Проверка работоспособности. Используется для мониторинга."""
    return {"status": "ok"}  # Возвращаем простой JSON — используется для мониторинга


# POST-эндпоинт для вопроса к DeepSeek — принимает вопрос, возвращает ответ
@app.post("/ask_deepseek")
async def ask_deepseek(request: DeepSeekRequest):
    """Endpoint для получения ответа от DeepSeek.

    Принимает JSON с вопросом и настройками, возвращает текст ответа.
    """
    # Проверяем, что вопрос не пустой
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Вопрос не может быть пустым")

    try:
        # Получаем экземпляр DeepSeek-сервиса (передаём ключ, если указан)
        deepseek_service = get_deepseek_service(api_key=request.api_key)

        # Отправляем запрос в DeepSeek
        answer = deepseek_service.ask(
            question=request.question,
            system_prompt=request.system_prompt,
            model=request.model,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
        )

        # Возвращаем JSON с ответом
        return {"answer": answer, "model": request.model}
    except ValueError as e:
        # Ошибка валидации (пустой вопрос, нет ключа)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Если произошла любая ошибка — возвращаем 500 с описанием
        raise HTTPException(status_code=500, detail=f"Ошибка запроса к DeepSeek: {str(e)}")


# Точка входа для запуска сервера через python main.py
if __name__ == "__main__":
    import uvicorn  # Импортируем ASGI-сервер uvicorn
    # Запускаем сервер на всех интерфейсах (0.0.0.0) порту 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
