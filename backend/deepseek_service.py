# deepseek_service.py — Сервис для работы с DeepSeek API
# Использует OpenAI-совместимый API DeepSeek для генерации ответов на вопросы

from __future__ import annotations
import os
from typing import Optional

try:
    from openai import OpenAI, APIError, AuthenticationError, RateLimitError
except ImportError:
    raise ImportError(
        "Не установлен пакет openai. Установите: pip install openai>=1.0.0"
    )


# Базовый URL DeepSeek API
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
# Модель по умолчанию
DEEPSEEK_MODEL = "deepseek-chat"


class DeepSeekService:
    """Сервис для отправки запросов к DeepSeek API."""

    def __init__(self, api_key: Optional[str] = None):
        """Инициализация клиента DeepSeek API.

        Args:
            api_key: API-ключ DeepSeek. Если не указан, берётся из переменной окружения DEEPSEEK_API_KEY.
        """
        self.api_key = api_key or os.environ.get("DEEPSEEK_API_KEY")
        if not self.api_key:
            raise ValueError(
                "API-ключ DeepSeek не указан. "
                "Передайте его в запросе или установите переменную окружения DEEPSEEK_API_KEY."
            )

        self.client = OpenAI(
            api_key=self.api_key,
            base_url=DEEPSEEK_BASE_URL,
        )

    def ask(
        self,
        question: str,
        system_prompt: Optional[str] = None,
        model: str = DEEPSEEK_MODEL,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str:
        """Отправить вопрос в DeepSeek и получить ответ.

        Args:
            question: Текст вопроса.
            system_prompt: Системная инструкция (опционально).
            model: Название модели (deepseek-chat или deepseek-reasoner).
            max_tokens: Максимальное количество токенов в ответе.
            temperature: Температура генерации (0.0 — 1.0).

        Returns:
            str: Текст ответа от DeepSeek.

        Raises:
            ValueError: Если вопрос пустой.
            APIError: При ошибке API (лимиты, неверный ключ и т.д.).
        """
        if not question or not question.strip():
            raise ValueError("Вопрос не может быть пустым")

        # Формируем список сообщений для API
        messages = []

        # Добавляем системное сообщение, если оно есть
        if system_prompt and system_prompt.strip():
            messages.append({
                "role": "system",
                "content": system_prompt.strip(),
            })
        else:
            # Системный промпт по умолчанию
            messages.append({
                "role": "system",
                "content": "Ты — полезный ассистент. Отвечай на вопросы кратко, по делу и на русском языке, если не указано иное.",
            })

        # Добавляем вопрос пользователя
        messages.append({
            "role": "user",
            "content": question.strip(),
        })

        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )

            # Извлекаем текст ответа
            answer = response.choices[0].message.content
            if not answer:
                raise APIError(message="DeepSeek вернул пустой ответ", request=None, body=None)

            return answer

        except AuthenticationError as e:
            raise AuthenticationError(
                message="Неверный API-ключ DeepSeek. Проверьте ключ и попробуйте снова.",
                request=e.request,
                body=e.body,
            )
        except RateLimitError as e:
            raise RateLimitError(
                message="Превышен лимит запросов DeepSeek. Подождите немного и попробуйте снова.",
                request=e.request,
                body=e.body,
            )
        except APIError as e:
            raise APIError(
                message=f"Ошибка DeepSeek API: {e.message}",
                request=e.request,
                body=e.body,
            )


# Singleton-экземпляр сервиса (создаётся при первом вызове)
_deepseek_service: Optional[DeepSeekService] = None


def get_deepseek_service(api_key: Optional[str] = None) -> DeepSeekService:
    """Получить экземпляр DeepSeekService (singleton).

    Args:
        api_key: API-ключ (если не указан, используется из предыдущего вызова или окружения).

    Returns:
        DeepSeekService: Экземпляр сервиса.
    """
    global _deepseek_service

    # Если сервис ещё не создан или передан новый ключ — создаём заново
    if _deepseek_service is None or api_key is not None:
        _deepseek_service = DeepSeekService(api_key=api_key)

    return _deepseek_service
