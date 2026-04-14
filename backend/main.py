# main.py — Точка входа FastAPI сервера для TTS-приложения
# Этот файл определяет HTTP-эндпоинты, модели запросов/ответов и настройку сервера

from fastapi import FastAPI, HTTPException  # Импортируем FastAPI (фреймворк) и HTTPException (для ошибок)
from fastapi.middleware.cors import CORSMiddleware  # Middleware для CORS (разрешаем запросы с фронтенда)
from fastapi.responses import StreamingResponse  # Ответ-поток для отправки больших файлов без загрузки в память
from pydantic import BaseModel  # Библиотека для валидации и типизации данных запросов
from fastapi import UploadFile, File  # Импортируем для загрузки файлов через multipart/form-data
from tts_service import get_tts_service  # Функция получения экземпляра TTS-сервиса (singleton)
from stt_service import get_stt_service  # Функция получения экземпляра STT-сервиса (singleton)
import io  # Модуль для работы с потоками в памяти (BytesIO)

# Создаём экземпляр FastAPI-приложения с названием и версией
app = FastAPI(title="Text-to-Speech API", version="1.0.0")

# Настраиваем CORS middleware — разрешаем запросы с любых источников
# В продакшене стоит ограничить allow_origins до конкретного домена
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # Разрешаем все домены (в продакшене заменить на конкретный)
    allow_credentials=True,    # Разрешаем передачу cookies
    allow_methods=["*"],       # Разрешаем все HTTP-методы (GET, POST, etc.)
    allow_headers=["*"],       # Разрешаем все заголовки
)


# Класс-модель для валидации тела POST-запроса
# Pydantic автоматически проверит типы и установит значения по умолчанию
class SynthesizeRequest(BaseModel):
    text: str                  # Обязательное поле — текст для озвучивания
    speaker: str = 'kseniya'   # Голос по умолчанию (доступны: kseniya, xenia, baya, aidar, eugene)
    put_accent: bool = True    # Расставлять ли ударения по умолчанию
    put_yo: bool = True        # Заменять ли 'е' на 'ё' где нужно по умолчанию


# POST-эндпоинт для синтеза речи — принимает JSON, возвращает MP3-файл
@app.post("/synthesize")
async def synthesize(request: SynthesizeRequest):
    """Endpoint для синтеза речи"""
    # Проверяем, что текст не пустой (после удаления пробелов)
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Текст не может быть пустым")

    try:
        # Получаем экземпляр TTS-сервиса (singleton — модель загружается один раз)
        tts_service = get_tts_service()
        # Вызываем метод синтеза — передаём текст и настройки голоса
        mp3_file = tts_service.synthesize(
            text=request.text,          # Текст для озвучивания
            speaker=request.speaker,    # Выбранный голос
            put_accent=request.put_accent,  # Флаг расстановки ударений
            put_yo=request.put_yo       # Флаг расстановки буквы 'ё'
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


# POST-эндпоинт для распознавания речи — принимает аудио-файл, возвращает текст
@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """Endpoint для распознавания речи из аудио-файла (MP3/WAV)"""
    # Проверяем, что файл передан
    if not audio or not audio.filename:
        raise HTTPException(status_code=400, detail="Необходимо загрузить аудио-файл")

    # Проверяем расширение файла
    filename_lower = audio.filename.lower()
    if not filename_lower.endswith(('.mp3', '.wav', '.ogg', '.m4a', '.flac')):
        raise HTTPException(
            status_code=400,
            detail="Поддерживаются только форматы: MP3, WAV, OGG, M4A, FLAC"
        )

    try:
        # Читаем содержимое файла в байты
        audio_bytes = await audio.read()
        # Получаем экземпляр STT-сервиса (singleton — модель загружается один раз)
        stt_service = get_stt_service()
        # Определяем формат по расширению файла
        file_format = filename_lower.split('.')[-1]
        # Вызываем метод распознавания — получаем текст
        text = stt_service.transcribe(audio_bytes, file_format=file_format)

        # Возвращаем JSON с распознанным текстом
        return {"text": text, "filename": audio.filename}
    except Exception as e:
        # Если произошла любая ошибка — возвращаем 500 с описанием
        raise HTTPException(status_code=500, detail=f"Ошибка распознавания: {str(e)}")


# GET-эндпоинт для проверки работоспособности сервера
@app.get("/health")
async def health_check():
    """Проверка работоспособности"""
    return {"status": "ok"}  # Возвращаем простой JSON — используется для мониторинга


# Точка входа для запуска сервера через python main.py
if __name__ == "__main__":
    import uvicorn  # Импортируем ASGI-сервер uvicorn
    # Запускаем сервер на всех интерфейсах (0.0.0.0) порту 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
