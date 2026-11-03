# Тесты для TTS и STT сервисов
# Запуск: pytest test_services.py -v

import pytest
from unittest.mock import MagicMock, patch
import sys
import os

# Добавляем backend в путь импорта
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from tts_service import ENGLISH_VOICE_BY_SPEAKER, SILERO_MODEL_ID, SileroTTSService
from stt_service import STTService


class TestSileroTTSService:
    """Тесты для SileroTTSService."""

    @pytest.fixture(autouse=True)
    def setup_service(self):
        """Создаём сервис с моком модели."""
        self.service = SileroTTSService.__new__(SileroTTSService)
        self.service.device = MagicMock()
        self.service.sample_rate = 48000
        self.service.model = MagicMock()
        # Мок метода apply_tts
        import torch
        self.service.model.apply_tts.return_value = torch.zeros(1000, dtype=torch.float32)

    def test_split_text_empty(self):
        """Пустая строка возвращает пустой список."""
        result = self.service._split_text('')
        assert result == []

    def test_split_text_whitespace(self):
        """Строка с пробелами возвращает пустой список."""
        result = self.service._split_text('   ')
        assert result == []

    def test_split_text_short_text(self):
        """Короткий текст — один чанк."""
        result = self.service._split_text('Привет мир')
        assert len(result) == 1
        assert result[0] == 'Привет мир'

    def test_split_text_long_text(self):
        """Длинный текст разбивается на чанки."""
        # Создаём текст > 500 символов
        text = ' '.join(['слово'] * 100)  # 600 символов
        result = self.service._split_text(text, max_chars=100)
        assert len(result) > 1
        # Каждый чанк <= 100 символов
        for chunk in result:
            assert len(chunk) <= 100

    def test_split_text_preserves_words(self):
        """Чанки не разбивают слова."""
        text = 'длинное-слово ' * 20
        result = self.service._split_text(text, max_chars=50)
        for chunk in result:
            # Проверяем, что чанк не обрывает слово посередине
            assert not chunk.startswith('-')
            assert not chunk.endswith('-')

    def test_parse_podcast_script_no_tags(self):
        """Текст без тегов — один сегмент речи."""
        result = self.service._parse_podcast_script('Привет мир')
        assert len(result) == 1
        assert result[0]['type'] == 'speech'
        assert result[0]['text'] == 'Привет мир'
        assert result[0]['voice'] == 'kseniya'

    def test_parse_podcast_script_voice_tag(self):
        """Тег [voice:...] меняет голос."""
        text = '[voice:aidar] Привет'
        result = self.service._parse_podcast_script(text)
        assert len(result) == 1
        assert result[0]['voice'] == 'aidar'
        assert result[0]['text'] == 'Привет'

    def test_parse_podcast_script_pause_tag(self):
        """Тег [pause:...] создаёт сегмент паузы."""
        text = '[pause:1.5s]'
        result = self.service._parse_podcast_script(text)
        assert len(result) == 1
        assert result[0]['type'] == 'pause'
        assert result[0]['duration_ms'] == 1500

    def test_parse_podcast_script_mixed(self):
        """Смешанный сценарий с тегами."""
        text = '[voice:kseniya] Привет[pause:1s][voice:aidar] Пока'
        result = self.service._parse_podcast_script(text)
        assert len(result) == 3
        assert result[0]['type'] == 'speech'
        assert result[0]['voice'] == 'kseniya'
        assert result[1]['type'] == 'pause'
        assert result[1]['duration_ms'] == 1000
        assert result[2]['type'] == 'speech'
        assert result[2]['voice'] == 'aidar'

    def test_parse_pause_duration_ms(self):
        """Парсинг разных форматов паузы."""
        assert self.service._parse_pause_duration_ms('500ms') == 500
        assert self.service._parse_pause_duration_ms('1s') == 1000
        assert self.service._parse_pause_duration_ms('1.5s') == 1500
        assert self.service._parse_pause_duration_ms('1.5') == 1500
        assert self.service._parse_pause_duration_ms('500') == 500

    @patch('tts_service.torch.hub.load')
    def test_load_model_uses_v5_6_ru(self, mock_hub_load):
        """Модель загружается в актуальной версии — v5_6_ru."""
        mock_hub_load.return_value = (MagicMock(), None)
        service = SileroTTSService.__new__(SileroTTSService)
        service.device = 'cpu'

        service._load_model()

        assert mock_hub_load.call_args[1]['speaker'] == SILERO_MODEL_ID == 'v5_6_ru'


class TestSTTService:
    """Тесты для STTService."""

    @pytest.fixture(autouse=True)
    def setup_service(self):
        """Создаём сервис с моком модели."""
        self.service = STTService.__new__(STTService)
        self.service.model = MagicMock()
        self.service.device = 'cpu'
        self.service.language = 'ru'

    def test_transcribe_file_too_large(self):
        """Файл > 25 МБ вызывает ValueError."""
        large_audio = b'x' * (26 * 1024 * 1024)
        with pytest.raises(ValueError, match='Файл слишком большой'):
            self.service.transcribe(large_audio, file_format='mp3')

    def test_transcribe_unsupported_m4a(self):
        """M4A формат не поддерживается."""
        audio = b'x' * 100
        with pytest.raises(ValueError, match='Формат M4A не поддерживается'):
            self.service.transcribe(audio, file_format='m4a')

    @patch('stt_service.tempfile.NamedTemporaryFile')
    @patch('stt_service.librosa.load')
    @patch('stt_service.librosa.resample')
    def test_transcribe_calls_whisper(self, mock_resample, mock_load, mock_tempfile):
        """Проверка, что transcribe вызывает Whisper."""
        import numpy as np
        # Мокаем временный файл
        mock_tempfile.return_value.__enter__.return_value.name = '/tmp/test.mp3'
        # Мокаем librosa.load
        mock_load.return_value = (np.zeros(16000, dtype=np.float32), 16000)
        # Мокаем Whisper
        self.service.model.transcribe.return_value = {'text': 'Привет мир'}

        audio = b'x' * 100
        result = self.service.transcribe(audio, file_format='mp3')

        self.service.model.transcribe.assert_called_once()
        assert result == 'Привет мир'


class TestLanguageRouting:
    """Английские фразы читает v3_en голосом, подобранным под диктора."""

    def _make_service(self):
        """Сервис без загрузки моделей: обе модели — моки."""
        import torch
        service = SileroTTSService.__new__(SileroTTSService)
        service.device = 'cpu'
        service.sample_rate = 48000
        service.speaker = 'kseniya'
        service.model = MagicMock()
        service.english_model = MagicMock()
        service.model.apply_tts.return_value = torch.zeros(1000)
        service.english_model.apply_tts.return_value = torch.zeros(1000)
        return service

    def test_english_phrase_uses_matched_voice(self):
        """Для aidar английская фраза идёт голосом en_89."""
        service = self._make_service()

        service.synthesize('Привет! Now let us build a better product.', 'aidar')

        english_call = service.english_model.apply_tts.call_args[1]
        assert english_call['speaker'] == ENGLISH_VOICE_BY_SPEAKER['aidar']
        assert 'Now let us build a better product' in english_call['text']

    def test_single_term_stays_russian(self):
        """Одиночный термин транслитерируется русским голосом."""
        service = self._make_service()

        service.synthesize('Открой GitHub', 'kseniya')

        assert not service.english_model.apply_tts.called
        assert 'гитхаб' in service.model.apply_tts.call_args[1]['text']

    def test_transliterate_mode_keeps_single_voice(self):
        """english_mode='transliterate' — английская фраза тем же диктором."""
        service = self._make_service()

        service.synthesize(
            'Привет! Now let us build a better product.',
            'aidar',
            english_mode='transliterate'
        )

        assert not service.english_model.apply_tts.called
        assert 'нау лет ус билд' in service.model.apply_tts.call_args[1]['text']

    def test_ssml_goes_to_ssml_text(self):
        """Разметка уходит в ssml_text целиком, без деления на чанки."""
        service = self._make_service()

        service.synthesize('Привет! <break time="1s"/> Как дела?', 'kseniya')

        call = service.model.apply_tts.call_args[1]
        assert 'ssml_text' in call
        assert call['ssml_text'].startswith('<speak>')
        assert call['ssml_text'].endswith('</speak>')
        assert 'text' not in call
        assert not service.english_model.apply_tts.called


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
