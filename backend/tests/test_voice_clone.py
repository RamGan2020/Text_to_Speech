# Тесты для сервиса клонирования голоса (VoiceCloneService)
# Запуск: pytest test_voice_clone.py -v
#
# Модель XTTS v2 не загружается — тесты мокают TTS, librosa и soundfile.
# Проверяются: валидация образца, реестр, безопасность путей, синтез.

import json
import os
import sys
import re

import numpy as np
import pytest
from unittest.mock import MagicMock, patch

# Добавляем backend в путь импорта
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import voice_clone_service as vcs
from voice_clone_service import VoiceCloneService, VOICE_ID_RE


@pytest.fixture
def service(tmp_path, monkeypatch):
    """Сервис с изолированной директорией voices/ (во временной папке pytest)."""
    monkeypatch.setattr(vcs, 'VOICES_DIR', str(tmp_path))
    monkeypatch.setattr(vcs, 'REGISTRY_PATH', str(tmp_path / 'voices.json'))
    svc = VoiceCloneService()
    return svc


def _mock_audio_load(monkeypatch, duration_sec=10.0, sample_rate=22050):
    """Мокаем librosa.load: возвращаем тишину нужной длительности."""
    fake_data = np.zeros(int(duration_sec * sample_rate), dtype=np.float32)
    monkeypatch.setattr(vcs.librosa, 'load', lambda *a, **k: (fake_data, sample_rate))
    monkeypatch.setattr(vcs.librosa, 'resample', lambda y, **k: y)


class TestVoiceIdValidation:
    """voice_id — строгий UUID (защита от path traversal)."""

    def test_valid_uuid_accepted(self):
        assert VOICE_ID_RE.match('123e4567-e89b-42d3-a456-426614174000')

    @pytest.mark.parametrize('bad_id', [
        '../../etc/passwd',
        '..\\..\\windows\\system32',
        'voice',
        'a' * 36,
        '123e4567-e89b-42d3-a456-426614174000/../../x',
        '123e4567-e89b-42d3-a456-42661417400G',  # не hex в конце
    ])
    def test_invalid_ids_rejected(self, bad_id):
        assert not VOICE_ID_RE.match(bad_id)


class TestRegisterVoice:
    """Регистрация образца голоса."""

    def test_register_success(self, service, tmp_path, monkeypatch):
        """Успешная регистрация: файл сохранён, реестр обновлён, voice_id валиден."""
        _mock_audio_load(monkeypatch, duration_sec=10.0)
        monkeypatch.setattr(vcs.sf, 'write', lambda *a, **k: None)

        result = service.register_voice(b'fake-audio', 'wav', name='Тест')

        assert VOICE_ID_RE.match(result['voice_id'])
        assert result['name'] == 'Тест'
        assert result['duration_sec'] == 10.0
        assert result['voice_id'] in service._registry
        # Реестр записан на диск
        assert os.path.exists(tmp_path / 'voices.json')
        with open(tmp_path / 'voices.json', encoding='utf-8') as f:
            registry = json.load(f)
        assert registry[result['voice_id']]['name'] == 'Тест'

    def test_register_too_short_rejected(self, service, monkeypatch):
        """Образец < 6 секунд отклоняется."""
        _mock_audio_load(monkeypatch, duration_sec=3.0)
        with pytest.raises(ValueError, match='слишком короткий'):
            service.register_voice(b'x' * 100, 'wav')

    def test_register_too_long_rejected(self, service, monkeypatch):
        """Образец > 30 секунд отклоняется."""
        _mock_audio_load(monkeypatch, duration_sec=60.0)
        with pytest.raises(ValueError, match='слишком длинный'):
            service.register_voice(b'x' * 100, 'wav')

    def test_register_too_large_rejected(self, service):
        """Файл > 25 МБ отклоняется ещё до декодирования."""
        big = b'x' * (26 * 1024 * 1024)
        with pytest.raises(ValueError, match='слишком большой'):
            service.register_voice(big, 'wav')

    def test_register_m4a_rejected(self, service):
        with pytest.raises(ValueError, match='M4A'):
            service.register_voice(b'x' * 100, 'm4a')

    def test_register_unreadable_rejected(self, service, monkeypatch):
        """Битый аудио-файл даёт понятную ошибку, а не падение."""
        def broken_load(*a, **k):
            raise RuntimeError('codec not found')
        monkeypatch.setattr(vcs.librosa, 'load', broken_load)
        with pytest.raises(ValueError, match='Не удалось прочитать'):
            service.register_voice(b'not-audio', 'wav')


class TestRegistry:
    """Список и удаление голосов."""

    def test_list_voices_skips_missing_files(self, service, monkeypatch):
        """Голос с потерянным WAV-файлом не попадает в список."""
        monkeypatch.setattr(os.path, 'exists', lambda p: False)
        service._registry['123e4567-e89b-42d3-a456-426614174000'] = {
            'name': 'X', 'duration_sec': 10, 'created_at': '2024-01-01T00:00:00+00:00',
        }
        assert service.list_voices() == []

    def test_list_voices_returns_metadata(self, service, monkeypatch):
        monkeypatch.setattr(os.path, 'exists', lambda p: True)
        service._registry['123e4567-e89b-42d3-a456-426614174000'] = {
            'name': 'Мой голос', 'duration_sec': 12.5, 'created_at': '2024-01-01T00:00:00+00:00',
        }
        voices = service.list_voices()
        assert len(voices) == 1
        assert voices[0]['name'] == 'Мой голос'
        assert voices[0]['duration_sec'] == 12.5

    def test_delete_voice(self, service, tmp_path, monkeypatch):
        """Удаление: запись из реестра убирается, файл удаляется."""
        voice_id = '123e4567-e89b-42d3-a456-426614174000'
        wav = tmp_path / f'{voice_id}.wav'
        wav.write_bytes(b'fake')
        service._registry[voice_id] = {'name': 'X', 'duration_sec': 10, 'created_at': ''}

        assert service.delete_voice(voice_id) is True
        assert voice_id not in service._registry
        assert not wav.exists()

    def test_delete_unknown_voice_returns_false(self, service):
        assert service.delete_voice('123e4567-e89b-42d3-a456-426614174999') is False

    @pytest.mark.parametrize('bad_id', ['../../etc/passwd', 'not-a-uuid', 'a' * 36])
    def test_delete_invalid_id_returns_false(self, service, bad_id):
        """Path traversal через voice_id невозможен — delete молча отказывает."""
        assert service.delete_voice(bad_id) is False


class TestSynthesizeWave:
    """Синтез клонированным голосом (модель замокана)."""

    def _register_fake_voice(self, service, monkeypatch):
        """Быстрая регистрация фейкового голоса в реестре."""
        voice_id = '123e4567-e89b-42d3-a456-426614174000'
        service._registry[voice_id] = {'name': 'X', 'duration_sec': 10, 'created_at': ''}
        monkeypatch.setattr(os.path, 'exists', lambda p: True)
        return voice_id

    def test_synthesize_normalizes_text(self, service, monkeypatch, tmp_path):
        """Текст проходит нормализацию (числа словами) перед синтезом."""
        voice_id = self._register_fake_voice(service, monkeypatch)

        captured = {}

        def fake_tts_to_file(text, speaker_wav, language, file_path):
            captured['text'] = text
            captured['language'] = language
            # Пишем валидный WAV, чтобы sf.read его прочитал
            import soundfile as sf_real
            sf_real.write(file_path, np.zeros(24000, dtype=np.float32), 24000)

        mock_model = MagicMock()
        mock_model.tts_to_file.side_effect = fake_tts_to_file
        service.model = mock_model  # Модель уже "загружена"

        wave = service.synthesize_wave('В 2026 году', voice_id)

        assert captured['text'] == 'В две тысячи двадцать шестом году'
        assert captured['language'] == 'ru'
        assert isinstance(wave, np.ndarray)

    def test_synthesize_strips_ssml(self, service, monkeypatch):
        """SSML-теги убираются — XTTS их не поддерживает."""
        voice_id = self._register_fake_voice(service, monkeypatch)
        captured = {}

        def fake_tts_to_file(text, speaker_wav, language, file_path):
            captured['text'] = text
            import soundfile as sf_real
            sf_real.write(file_path, np.zeros(100, dtype=np.float32), 24000)

        mock_model = MagicMock()
        mock_model.tts_to_file.side_effect = fake_tts_to_file
        service.model = mock_model

        service.synthesize_wave('Привет<break time="1s"/>пока', voice_id)
        assert '<' not in captured['text']

    @pytest.mark.parametrize('source,expected', [
        ('вод[!]а', 'вода'),          # Маркер ударения Silero не должен ломать слово
        ('в[!]ода', 'вода'),
        ('вод+а', 'вода'),            # Готовый '+' — тот же маркер, убираем без разрыва
        ('2+2', 'два плюс два'),      # Плюс между числами — математика, проговариваем
    ])
    def test_synthesize_strips_stress_markers(self, service, monkeypatch, source, expected):
        """Маркеры ударения '[!]'/'+' вырезаются целиком, слово не разрывается."""
        voice_id = self._register_fake_voice(service, monkeypatch)
        captured = {}

        def fake_tts_to_file(text, speaker_wav, language, file_path):
            captured['text'] = text
            import soundfile as sf_real
            sf_real.write(file_path, np.zeros(100, dtype=np.float32), 24000)

        mock_model = MagicMock()
        mock_model.tts_to_file.side_effect = fake_tts_to_file
        service.model = mock_model

        service.synthesize_wave(source, voice_id)
        assert captured['text'] == expected

    def test_synthesize_unknown_voice_raises(self, service, monkeypatch):
        monkeypatch.setattr(os.path, 'exists', lambda p: True)
        with pytest.raises(ValueError, match='не найден'):
            service.synthesize_wave('Привет', '123e4567-e89b-42d3-a456-426614174999')

    def test_synthesize_path_traversal_blocked(self, service, monkeypatch):
        with pytest.raises(ValueError, match='Некорректный'):
            service.synthesize_wave('Привет', '../../etc/passwd')

    def test_synthesize_empty_text_raises(self, service, monkeypatch):
        voice_id = self._register_fake_voice(service, monkeypatch)
        with pytest.raises(ValueError, match='пустым'):
            service.synthesize_wave('   ', voice_id)


class TestTtsServiceCloneIntegration:
    """Стыковка с SileroTTSService: тег [voice:clone:<id>] в подкасте."""

    def _make_tts_service(self):
        """Сервис Silero с мокнутыми моделями (без загрузки)."""
        import torch
        from tts_service import SileroTTSService
        svc = SileroTTSService.__new__(SileroTTSService)
        svc.device = 'cpu'
        svc.sample_rate = 48000
        svc.speaker = 'kseniya'
        svc.model = MagicMock()
        svc.english_model = MagicMock()
        svc.model.apply_tts.return_value = torch.zeros(1000)
        svc.english_model.apply_tts.return_value = torch.zeros(1000)
        return svc

    def test_clone_tag_calls_clone_service(self, monkeypatch):
        """Сегмент с [voice:clone:<id>] уходит в VoiceCloneService, не в Silero."""
        import torch
        svc = self._make_tts_service()

        clone_calls = []

        def fake_clone_wave(text, voice_id):
            clone_calls.append((text, voice_id))
            return np.ones(2400, dtype=np.float32)  # 0.1 сек @ 24 кГц

        fake_clone_svc = MagicMock()
        fake_clone_svc.synthesize_wave.side_effect = fake_clone_wave
        monkeypatch.setattr('tts_service.get_voice_clone_service', lambda: fake_clone_svc)

        result = svc.synthesize('[voice:clone:123e4567-e89b-42d3-a456-426614174000] Привет', 'kseniya', podcast_mode=True)

        assert len(clone_calls) == 1
        assert clone_calls[0][1] == '123e4567-e89b-42d3-a456-426614174000'
        assert 'Привет' in clone_calls[0][0]
        # Silero не вызывался для этого сегмента
        assert not svc.model.apply_tts.called
        # Результат — непустой MP3-буфер
        assert result.getvalue()[:2] == b'ID' or len(result.getvalue()) > 0

    def test_mixed_podcast_clone_and_silero(self, monkeypatch):
        """Подкаст из двух сегментов: клон + Silero — оба в одном аудио."""
        svc = self._make_tts_service()

        fake_clone_svc = MagicMock()
        fake_clone_svc.synthesize_wave.return_value = np.ones(2400, dtype=np.float32)
        monkeypatch.setattr('tts_service.get_voice_clone_service', lambda: fake_clone_svc)

        text = ('[voice:clone:123e4567-e89b-42d3-a456-426614174000] Я веду подкаст.\n'
                '[voice:aidar] А я соаведущий.')
        result = svc.synthesize(text, 'kseniya', podcast_mode=True)

        fake_clone_svc.synthesize_wave.assert_called_once()
        assert svc.model.apply_tts.called  # Сегмент aidar — через Silero
        assert len(result.getvalue()) > 0

    def test_podcast_default_voice_is_clone(self, monkeypatch):
        """Клон как голос по умолчанию: реплика без тега читает выбранный клон."""
        svc = self._make_tts_service()

        fake_clone_svc = MagicMock()
        fake_clone_svc.synthesize_wave.return_value = np.ones(2400, dtype=np.float32)
        monkeypatch.setattr('tts_service.get_voice_clone_service', lambda: fake_clone_svc)

        # Подкаст без тегов [voice:] — весь текст голосом по умолчанию (клон)
        result = svc.synthesize('Привет, это мой подкаст.',
                                'clone:123e4567-e89b-42d3-a456-426614174000',
                                podcast_mode=True)

        assert fake_clone_svc.synthesize_wave.called
        assert not svc.model.apply_tts.called  # Silero не вызывался
        assert len(result.getvalue()) > 0

    def test_podcast_default_voice_is_speaker(self, monkeypatch):
        """Голос по умолчанию для реплик без тега — выбранный пресет Silero."""
        svc = self._make_tts_service()

        fake_clone_svc = MagicMock()
        monkeypatch.setattr('tts_service.get_voice_clone_service', lambda: fake_clone_svc)

        svc.synthesize('Привет, подкаст без тегов.', 'aidar', podcast_mode=True)

        # Читает aidar через Silero, клон не трогаем
        assert svc.model.apply_tts.call_args[1]['speaker'] == 'aidar'
        assert not fake_clone_svc.synthesize_wave.called

    def test_parse_podcast_script_default_voice_override(self):
        """default_voice применяется к репликам без тега [voice:]."""
        svc = self._make_tts_service()

        segments = svc._parse_podcast_script('Первая реплика. [pause:1s] Вторая реплика.',
                                             default_voice='clone:abc-123')

        assert all(s['voice'] == 'clone:abc-123' for s in segments if s['type'] == 'speech')

    def test_parse_podcast_script_default_voice_backward_compat(self):
        """Без default_voice поведение прежнее — голос по умолчанию kseniya."""
        svc = self._make_tts_service()

        segments = svc._parse_podcast_script('Просто текст')

        assert segments[0]['voice'] == 'kseniya'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
