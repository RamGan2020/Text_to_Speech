# Тесты нормализации текста перед синтезом
# Запуск: pytest test_text_normalization.py -v

import os
import sys

import pytest

# Добавляем backend в путь импорта (работает и из корня репозитория, и из backend)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from text_normalization import (
    has_ssml,
    normalize_for_tts,
    normalize_numbers,
    split_by_language,
    wrap_ssml,
)


@pytest.mark.parametrize('source, expected', [
    ('Привет API мир', 'Привет эй пи ай мир'),
    ('Открой GitHub', 'Открой гитхаб'),
    ('SSD', 'эс эс ди'),
    ('chat', 'чат'),
    ('shop', 'шоп'),
    ('test', 'тест'),
    ('city', 'сити'),
    ('knife', 'найф'),
    ('table', 'тейбл'),
    ('feature', 'фичер'),
    ('yaml', 'ямл'),
    ('ssh', 'эс эс эйч'),
    ('cpu', 'си пи ю'),
    ('Привет, мир!', 'Привет, мир!'),
])
def test_transliteration(source, expected):
    """Латиница транслитерируется, кириллица остаётся как есть."""
    assert normalize_for_tts(source) == expected


@pytest.mark.parametrize('source, expected', [
    ('2026', 'две тысячи двадцать шесть'),
    ('3.5', 'три целых пять десятых'),
    ('21,5', 'двадцать одна целая пять десятых'),
    ('3.12', 'три точка один два'),
    ('1,356', 'одна целая триста пятьдесят шесть тысячных'),
    ('3,14', 'три целых четырнадцать сотых'),
    ('2,5', 'две целых пять десятых'),
    ('1,0', 'одна целая'),
    ('1.356', 'одна целая триста пятьдесят шесть тысячных'),
    ('5,5%', 'пять целых пять десятых процента'),
    ('5%', 'пять процентов'),
    ('1%', 'один процент'),
    ('22%', 'двадцать два процента'),
])
def test_numbers(source, expected):
    """Числа записываются словами с правильными склонениями."""
    assert normalize_for_tts(source) == expected


def test_decimal_after_verb():
    """После глагола числительное читается в винительном падеже."""
    assert normalize_for_tts('мне предстояло пройти 1,356 пути') == \
        'мне предстояло пройти одну целую триста пятьдесят шесть тысячных пути'


@pytest.mark.parametrize('source, expected', [
    ('2+2=4', 'два+два равно четыре'),
    ('5 - 3 = 2', 'пять минус три равно два'),
    ('5-3=2', 'пять минус три равно два'),
    ('6*7', 'шесть*семь'),
    ('10/2', 'десять разделить на два'),
    ('10\\2', 'десять разделить на два'),
    ('2^3', 'два в степени три'),
    ('и/или', 'и или'),
    ('5-10 лет', 'пять-десять лет'),
    ('Москва - столица', 'Москва - столица'),
])
def test_symbols(source, expected):
    """Проговариваются =, −, ^, деление; «+» и «*» остаются как есть."""
    assert normalize_for_tts(source) == expected


@pytest.mark.parametrize('source, expected', [
    ('вод[!]а', 'вод+а'),
    ('в[!]ода', 'в+ода'),
    ('Вод[!]а и в[!]ода', 'Вод+а и в+ода'),
    ('вод+а', 'вод+а'),
])
def test_manual_stress(source, expected):
    """«[!]» превращается в маркер ударения; готовый «+» остаётся на месте."""
    assert normalize_for_tts(source) == expected


@pytest.mark.parametrize('source, expected', [
    ('Привет! <break time="1s"/> Как дела?', 'Привет! <break time="1s"/> Как дела?'),
    ('<prosody rate="x-slow">я говорю медленно</prosody>',
     '<prosody rate="x-slow">я говорю медленно</prosody>'),
    ('<prosody pitch="x-high">Python 2026</prosody>',
     '<prosody pitch="x-high">пайтон две тысячи двадцать шесть</prosody>'),
    ('<speak><break time="1s"/></speak>', '<speak><break time="1s"/></speak>'),
])
def test_ssml_tags_preserved(source, expected):
    """Теги и их атрибуты не транслитерируются, текст внутри — нормализуется."""
    assert normalize_for_tts(source) == expected


def test_ssml_detection_and_wrapping():
    """SSML распознаётся, а перед отправкой в модель оборачивается в <speak>."""
    assert has_ssml('<break time="1s"/>')
    assert not has_ssml('обычный текст')

    assert wrap_ssml('Привет <break time="1s"/>') == '<speak>Привет <break time="1s"/></speak>'
    assert wrap_ssml('<speak>Привет</speak>') == '<speak>Привет</speak>'
    assert wrap_ssml('AT&T <break time="1s"/>') == '<speak>AT&amp;T <break time="1s"/></speak>'


def test_mixed_text():
    """Латиница и числа нормализуются в одном проходе."""
    assert normalize_for_tts('В 2026 году вышел Python') == \
        'В две тысячи двадцать шестом году вышел пайтон'


@pytest.mark.parametrize('source, expected', [
    ('2026 год', 'две тысячи двадцать шестой год'),
    ('в 2026 году', 'в две тысячи двадцать шестом году'),
    ('до 2026 года', 'до две тысячи двадцать шестого года'),
    ('к 2026 году', 'к две тысячи двадцать шестому году'),
    ('с 2020 по 2026 год', 'с две тысячи двадцатого по две тысячи двадцать шестой год'),
    ('в 1990-х годах', 'в тысяча девятьсот девяностых годах'),
    ('1999 год', 'тысяча девятьсот девяносто девятый год'),
    ('к 2000 году', 'к двухтысячному году'),
    ('2026 рублей', 'две тысячи двадцать шесть рублей'),
])
def test_years(source, expected):
    """Годы читаются порядковым числительным в падеже слова «год»."""
    assert normalize_for_tts(source) == expected


def test_english_phrase_transliterated_as_one_voice():
    """Английская фраза транслитерируется целиком — на случай одного голоса."""
    assert normalize_for_tts('machine learning') == 'машин лёрнинг'


@pytest.mark.parametrize('source, expected', [
    ('2', 'two'),
    ('3.5', 'three point five'),
    ('5%', 'five percent'),
])
def test_numbers_english(source, expected):
    """Английские числа — для фрагментов, уходящих в английскую модель."""
    assert normalize_numbers(source, lang='en') == expected


@pytest.mark.parametrize('source, expected', [
    ('Открой GitHub и настрой API', [('ru', 'Открой GitHub и настрой API')]),
    ('Привет world', [('ru', 'Привет world')]),
    ('Я люблю machine learning', [('ru', 'Я люблю '), ('en', 'machine learning')]),
    ('I have 2 apples', [('en', 'I have 2 apples')]),
    ('Python 3.12', [('ru', 'Python 3.12')]),
])
def test_split_by_language(source, expected):
    """Английским считается фрагмент минимум из двух латинских слов."""
    assert split_by_language(source) == expected

