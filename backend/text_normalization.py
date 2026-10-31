"""text_normalization.py — подготовка текста к синтезу Silero TTS.

Silero вырезает все символы вне алфавита модели (src/silero/tts_utils.py:33).
В алфавите v5_6_ru нет ни латиницы, ни цифр, поэтому:
  * латинские слова транслитерируются в кириллицу;
  * числа записываются словами;
  * английские фразы отдаются английской модели — с голосом,
    подобранным под выбранного русского диктора (split_by_language).
"""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

from num2words import num2words

# Частые термины, которые правилами по буквам читаются неверно (docker → «доккер»)
_TERMS = {
    'api': 'эй пи ай',
    'ai': 'эй ай',
    'ml': 'эм эл',
    'gpt': 'джи пи ти',
    'chatgpt': 'чат джи пи ти',
    'python': 'пайтон',
    'javascript': 'джаваскрипт',
    'typescript': 'тайпскрипт',
    'github': 'гитхаб',
    'git': 'гит',
    'docker': 'докер',
    'kubernetes': 'кубернетес',
    'linux': 'линукс',
    'ubuntu': 'убунту',
    'debian': 'дебиан',
    'windows': 'виндоус',
    'macos': 'макос',
    'android': 'андроид',
    'ios': 'ай ос',
    'iphone': 'айфон',
    'ipad': 'айпад',
    'google': 'гугл',
    'youtube': 'ютуб',
    'telegram': 'телеграм',
    'whatsapp': 'вотсап',
    'microsoft': 'майкрософт',
    'apple': 'эппл',
    'chrome': 'хром',
    'firefox': 'файрфокс',
    'software': 'софтвэр',
    'hardware': 'хардвэр',
    'backend': 'бэкенд',
    'frontend': 'фронтенд',
    'framework': 'фреймворк',
    'deploy': 'деплой',
    'deployment': 'деплоймент',
    'repository': 'репозитори',
    'release': 'рилиз',
    'update': 'апдейт',
    'download': 'даунлоуд',
    'upload': 'аплоуд',
    'browser': 'браузер',
    'cache': 'кэш',
    'issue': 'ишью',
    'merge': 'мёрдж',
    'image': 'имидж',
    'thread': 'сред',
    'timeout': 'таймаут',
    'interface': 'интерфейс',
    'version': 'версия',
    'request': 'риквест',
    'response': 'респонс',
    'module': 'модуль',
    'package': 'пакет',
    'cluster': 'кластер',
    'container': 'контейнер',
    'postgres': 'постгрес',
    'postgresql': 'постгрес кью эл',
    'sqlite': 'эс кью лайт',
    'nginx': 'энджинэкс',
    'yaml': 'ямл',
    'devops': 'девопс',
    'online': 'онлайн',
    'offline': 'офлайн',
    'email': 'имейл',
    'e-mail': 'имейл',
    'wi-fi': 'вай фай',
    'wifi': 'вай фай',
    'json': 'джейсон',
    'html': 'эйч ти эм эл',
    'css': 'си эс эс',
    'sql': 'эс кью эл',
    'http': 'эйч ти ти пи',
    'https': 'эйч ти ти пи эс',
    'url': 'ю ар эл',
    'pdf': 'пи ди эф',
    'usb': 'ю эс би',
    'ssd': 'эс эс ди',
    'cpu': 'си пи ю',
    'gpu': 'джи пи ю',
    'ram': 'рэм',
    'rom': 'ром',
    'ssh': 'эс эс эйч',
    'vpn': 'ви пи эн',
    'npm': 'эп эн эм',
    'venv': 'ви эн ви',
    'ide': 'ай ди',
    'ui': 'ю ай',
    'ux': 'ю экс',
    'os': 'оу эс',
    'db': 'ди би',
    'ci': 'си ай',
    'cd': 'си ди',
    'jwt': 'джей дабл ю ти',
    'device': 'девайс',
    'price': 'прайс',
    'machine': 'машин',
    'machines': 'машины',
    'learning': 'лёрнинг',
    'learn': 'лёрн',
    'build': 'билд',
    'now': 'нау',
    'office': 'офис',
    'service': 'сервис',
    'services': 'сервисы',
    'ok': 'окей',
}

# Названия латинских букв — для аббревиатур (API, SSD, GPT)
_LETTERS = {
    'a': 'эй', 'b': 'би', 'c': 'си', 'd': 'ди', 'e': 'и', 'f': 'эф',
    'g': 'джи', 'h': 'эйч', 'i': 'ай', 'j': 'джей', 'k': 'кей', 'l': 'эл',
    'm': 'эм', 'n': 'эн', 'o': 'оу', 'p': 'пи', 'q': 'кью', 'r': 'ар',
    's': 'эс', 't': 'ти', 'u': 'ю', 'v': 'ви', 'w': 'дабл ю', 'x': 'экс',
    'y': 'уай', 'z': 'зэд',
}

# Правила транслитерации. Сортируются по длине: длинные сочетания раньше коротких.
_RULES = [
    # суффиксы
    ('able', 'ейбл'), ('ible', 'ибл'), ('tion', 'шн'), ('sion', 'жн'),
    ('ture', 'чер'), ('sure', 'жер'), ('igh', 'ай'),
    # «немая» e: гласный + согласный + e даёт долгий гласный
    ('ake', 'эйк'), ('ame', 'эйм'), ('ane', 'эйн'), ('ate', 'эйт'),
    ('ave', 'эйв'), ('ide', 'айд'), ('ife', 'айф'), ('ike', 'айк'),
    ('ile', 'айл'), ('ime', 'айм'), ('ine', 'айн'), ('ipe', 'айп'),
    ('ire', 'айр'), ('ite', 'айт'), ('ode', 'оуд'), ('oke', 'оук'),
    ('ome', 'оум'), ('one', 'оун'), ('ope', 'оуп'), ('ore', 'ор'),
    ('ose', 'оуз'), ('ote', 'оут'), ('ove', 'оув'), ('use', 'юз'),
    ('ute', 'ют'), ('ype', 'айп'), ('yte', 'айт'), ('yle', 'айл'),
    # согласный + le в конце слова
    ('ble', 'бл'), ('cle', 'кл'), ('dle', 'дл'), ('fle', 'фл'),
    ('gle', 'гл'), ('kle', 'кл'), ('ple', 'пл'), ('tle', 'тл'), ('zle', 'зл'),
    # гласные сочетания
    ('ai', 'эй'), ('ay', 'эй'), ('ey', 'эй'), ('ei', 'эй'), ('ie', 'и'),
    ('ea', 'и'), ('ee', 'и'), ('oa', 'оу'), ('oe', 'оу'), ('oo', 'у'),
    ('ou', 'оу'), ('ow', 'оу'), ('aw', 'о'), ('ew', 'ью'), ('oy', 'ой'),
    # согласные сочетания
    ('tch', 'ч'), ('sch', 'ш'), ('dge', 'дж'), ('wh', 'у'),
    ('ch', 'ч'), ('sh', 'ш'), ('zh', 'ж'), ('th', 'з'), ('ph', 'ф'),
    ('ck', 'к'), ('qu', 'кв'),
]
_RULES.sort(key=lambda pair: len(pair[0]), reverse=True)

# Одиночные буквы — используются, когда ни одно правило не подошло
_CHARS = {
    'a': 'а', 'b': 'б', 'c': 'к', 'd': 'д', 'e': 'е', 'f': 'ф', 'g': 'г',
    'h': 'х', 'i': 'и', 'j': 'дж', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н',
    'o': 'о', 'p': 'п', 'q': 'к', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у',
    'v': 'в', 'w': 'в', 'x': 'кс', 'y': 'и', 'z': 'з',
}

# Латиница — отдельными словами, с дефисами и апострофами внутри (wi-fi, don't)
_LATIN_TOKEN_RE = re.compile(r"[A-Za-z]+(?:[-'][A-Za-z]+)*")
# Связный фрагмент: латинские слова и числа, разделённые пробелами
_RUN_RE = re.compile(
    r"[A-Za-z0-9]+(?:[.'\-][A-Za-z0-9]+)*(?:\s+[A-Za-z0-9]+(?:[.'\-][A-Za-z0-9]+)*)*"
)
# Число с необязательной дробной частью и знаком процента
_NUMBER_RE = re.compile(r'(\d+)(?:([.,])(\d+))?(\s*%)?')
# Минимум две латинские буквы — иначе это число, а не английское слово
_LATIN_WORD_RE = re.compile(r'[^A-Za-z]')

# Порог переключения на английскую модель: столько слов во фрагменте
ENGLISH_SPAN_MIN_WORDS = 2


# Глаголы, после которых числительное стоит в винительном падеже:
# «предстояло пройти одну целую …». Список узкий — только частые случаи.
_ACCUSATIVE_VERBS = (
    'пройти|пройдёт|пройдут|прошёл|прошла|прошли|проходить|прохожу|'
    'проехать|проехал|проехали|пробежать|пробежал|проплыть|проплыл|'
    'пролететь|пролетел|преодолеть|преодолел|отмерить|отмерил|'
    'протянуть|протянул|составлять|составляет|составил|весить|весит|весил'
)
_ACCUSATIVE_FEMININE_RE = re.compile(rf'\b({_ACCUSATIVE_VERBS})\s+одна целая\b', re.IGNORECASE)

# Математические знаки: в алфавите модели их нет (кроме «+», который
# вообще означает ударение), поэтому заменяем словами
_SYMBOLS = {
    '+': 'плюс',
    '=': 'равно',
    '*': 'умножить на',
    '×': 'умножить на',
    '/': 'разделить на',
    '\\': 'разделить на',
    '÷': 'разделить на',
    '−': 'минус',
    '^': 'в степени',
    '±': 'плюс-минус',
    '≈': 'примерно равно',
    '≠': 'не равно',
}
# Признаки того, что дефис в тексте — это минус, а не диапазон
_MATH_CONTEXT_RE = re.compile(r'[=+*^]|[×÷±≈≠]')


def _normalize_symbols(text: str) -> str:
    """Проговаривает математические знаки: «2+2=4» → «два плюс два равно четыре»."""
    math_context = _MATH_CONTEXT_RE.search(text) is not None

    # Дефис с пробелами между числами — минус: «5 - 3»
    text = re.sub(r'(?<=\d)\s+-\s+(?=\d)', ' минус ', text)
    # Без пробелов — только если рядом есть другие операторы: «5-3=2»
    if math_context:
        text = re.sub(r'(?<=\d)-(?=\d)', ' минус ', text)

    # Слэш — деление между числами или в математическом выражении.
    # В обычном тексте («и/или») он просто вырезается, и это верно
    if math_context:
        text = re.sub(r'[/\\]+', ' разделить на ', text)
    else:
        text = re.sub(r'(?<=\d)\s*[/\\]+\s*(?=\d)', ' разделить на ', text)
        text = re.sub(r'[/\\]+', ' ', text)

    for symbol, word in _SYMBOLS.items():
        if symbol in ('/', '\\'):
            continue
        text = text.replace(symbol, f' {word} ')

    return re.sub(r'\s{2,}', ' ', text).strip()


def normalize_for_tts(text: str) -> str:
    """Приводит текст к алфавиту модели: латиница → кириллица, числа → слова.

    Голос при этом не меняется: английские слова читает та же модель,
    что и русский текст, — иначе в подкасте ломается выбранный диктор.

    Args:
        text: Исходный текст (русский, с латиницей и числами)

    Returns:
        str: Текст, который модель сможет произнести
    """
    # Знаки до чисел: «2+2» → «2 плюс 2», иначе «+» уйдёт в разметку ударений
    text = _normalize_symbols(text)
    # Сначала числа: иначе дефис в «GPT-4» склеит токен с цифрой
    with_numbers = normalize_numbers(text)
    # «пройти одна целая» → «пройти одну целую»: винительный после глагола
    with_numbers = _ACCUSATIVE_FEMININE_RE.sub(r'\1 одну целую', with_numbers)
    return _LATIN_TOKEN_RE.sub(lambda match: _transliterate(match.group(0)), with_numbers)


def normalize_numbers(text: str, lang: str = 'ru') -> str:
    """Заменяет числа словами на нужном языке: 2026 → «две тысячи двадцать шесть»."""
    # Годы читаются порядковым числительным в падеже слова «год»
    if lang == 'ru':
        text = _russian_years(text)

    def replace(match: re.Match) -> str:
        whole = int(match.group(1))
        separator = match.group(2)
        fraction = match.group(3)
        is_percent = match.group(4) is not None

        words = _cardinal(whole, fraction, lang, separator)
        if is_percent:
            # «5,5 процента», но «5 процентов»
            if fraction is not None and lang == 'ru':
                words += ' процента'
            else:
                words += ' ' + _percent_form(whole, lang)
        return words

    return _NUMBER_RE.sub(replace, text)


def split_by_language(text: str) -> List[Tuple[str, str]]:
    """Делит текст на русские и английские куски.

    Английским считается фрагмент минимум из двух латинских слов:
    одиночный термин («GitHub») дешевле транслитерировать, чем переключать модель.

    Returns:
        Список пар (язык, текст), где язык — 'ru' или 'en'
    """
    pieces: List[Tuple[str, str]] = []
    cursor = 0

    for match in _RUN_RE.finditer(text):
        run = match.group(0)
        # Числа без латиницы остаются в русском куске и нормализуются как обычно
        if not re.search(r'[A-Za-z]', run):
            continue

        if match.start() > cursor:
            pieces.append(('ru', text[cursor:match.start()]))

        language = 'en' if _english_word_count(run) >= ENGLISH_SPAN_MIN_WORDS else 'ru'
        pieces.append((language, run))
        cursor = match.end()

    if cursor < len(text):
        pieces.append(('ru', text[cursor:]))

    return _merge_pieces(pieces)


def _english_word_count(run: str) -> int:
    """Сколько в фрагменте слов из двух и более латинских букв"""
    return sum(1 for word in run.split() if len(_LATIN_WORD_RE.sub('', word)) >= 2)


def _merge_pieces(pieces: List[Tuple[str, str]]) -> List[Tuple[str, str]]:
    """Склеивает соседние куски одного языка, чтобы не дробить синтез зря"""
    merged: List[Tuple[str, str]] = []
    for language, chunk in pieces:
        if merged and merged[-1][0] == language:
            merged[-1] = (language, merged[-1][1] + chunk)
        else:
            merged.append((language, chunk))
    return merged


def _transliterate(word: str) -> str:
    """Транслитерация одного латинского слова в кириллицу"""
    lower = word.lower()

    # Готовый термин важнее правил: docker → «докер», а не «доккер»
    if lower in _TERMS:
        return _TERMS[lower]

    # Аббревиатура из заглавных читается по буквам: SSD → «эс эс ди»
    if word.isupper() and 2 <= len(word) <= 5:
        return ' '.join(_LETTERS[ch] for ch in lower if ch in _LETTERS)

    result = []
    index = 0
    while index < len(lower):
        # Немые буквы в начале слова: knife → «найф», write → «райт»
        if index == 0 and lower.startswith('kn'):
            result.append('н')
            index += 2
            continue
        if index == 0 and lower.startswith('wr'):
            result.append('р')
            index += 2
            continue
        # Немая b в конце слова: dumb → «дам»
        if index == len(lower) - 2 and lower.startswith('mb', index):
            result.append('м')
            index += 2
            continue

        for source, target in _RULES:
            if lower.startswith(source, index):
                result.append(target)
                index += len(source)
                break
        else:
            char = lower[index]
            if char == 'c':
                # c перед e/i/y читается как «с»: city → «сити»
                next_char = lower[index + 1] if index + 1 < len(lower) else ''
                result.append('с' if next_char in 'eiy' else 'к')
            else:
                result.append(_CHARS.get(char, char))
            index += 1

    text = ''.join(result)
    # Немая e в конце слова: service → «сервис». Только если правила её не тронули
    if len(lower) >= 4 and lower.endswith('e') and lower[-2] not in 'aeiouy' and text.endswith('е'):
        text = text[:-1]
    return text


def _cardinal(whole: int, fraction: Optional[str], lang: str, separator: Optional[str] = None) -> str:
    """Число словами с учётом дробной части"""
    words = _cardinal_raw(whole, fraction, lang, separator)
    return _drop_single_thousand(words) if lang == 'ru' else words


def _cardinal_raw(whole: int, fraction: Optional[str], lang: str, separator: Optional[str]) -> str:
    if fraction is None:
        return num2words(whole, lang=lang)

    if lang != 'ru':
        digits = ' '.join(num2words(int(digit), lang='en') for digit in fraction)
        return f"{num2words(whole, lang='en')} point {digits}"

    # Точка с двумя знаками — обычно версия (3.12), читаем по цифрам
    if separator == '.' and len(fraction) == 2:
        digits = ' '.join(num2words(int(digit), lang='ru') for digit in fraction)
        return f"{num2words(whole, lang='ru')} точка {digits}"

    return _russian_fraction(whole, fraction)


# Знаменатели дробной части: 1 → десятая, 2 → сотая, 3 → тысячная…
_DECIMAL_NOUNS = {
    1: ('десятая', 'десятых'),
    2: ('сотая', 'сотых'),
    3: ('тысячная', 'тысячных'),
    4: ('десятитысячная', 'десятитысячных'),
    5: ('стотысячная', 'стотысячных'),
    6: ('миллионная', 'миллионных'),
}


def _russian_fraction(whole: int, fraction: str) -> str:
    """1,356 → «одна целая триста пятьдесят шесть тысячных»"""
    whole_words = _feminine(num2words(whole, lang='ru'))
    whole_noun = 'целая' if _is_singular(whole) else 'целых'

    numerator = int(fraction)
    if numerator == 0:
        return f'{whole_words} {whole_noun}'

    denominator = _DECIMAL_NOUNS.get(len(fraction))
    if denominator is None:
        digits = ' '.join(num2words(int(digit), lang='ru') for digit in fraction)
        return f'{whole_words} {whole_noun} {digits}'

    numerator_words = _feminine(num2words(numerator, lang='ru'))
    noun = denominator[0] if _is_singular(numerator) else denominator[1]
    return f'{whole_words} {whole_noun} {numerator_words} {noun}'


def _is_singular(number: int) -> bool:
    """Одна десятая, но пять десятых"""
    return number % 10 == 1 and number % 100 != 11


def _feminine(words: str) -> str:
    """один → одна, два → две (для «целая», «десятая»)"""
    if words == 'один':
        return 'одна'
    if words.endswith(' один'):
        return words[:-5] + ' одна'
    if words == 'два':
        return 'две'
    if words.endswith(' два'):
        return words[:-4] + ' две'
    return words


def _percent_form(number: int, lang: str) -> str:
    """Форма слова «процент» по числу"""
    if lang != 'ru':
        return 'percent'
    return _plural(number, 'процент', 'процента', 'процентов')


def _drop_single_thousand(words: str) -> str:
    """«одна тысяча девятьсот» → «тысяча девятьсот»: так говорят по-русски."""
    return re.sub(r'^одна (?=тысяч)', '', words)


# === Годы: «в 2026 году» → «в две тысячи двадцать шестом году» ===

# Падеж и число порядкового числительного по форме слова «год»
_YEAR_NOUN_CASES = {
    'год': ('nominative', False),
    'года': ('genitive', False),
    'году': ('dative', False),  # уточняется по предлогу: «к году» — дательный
    'годом': ('instrumental', False),
    'годе': ('prepositional', False),
    'годы': ('nominative', True),
    'годов': ('genitive', True),
    'годам': ('dative', True),
    'годами': ('instrumental', True),
    'годах': ('prepositional', True),
}

# Порядковые формы последнего слова: «двадцать шесть» → «шестой»
_ORDINAL_WORDS = {
    'ноль': 'нулевой',
    'один': 'первый', 'одна': 'первый', 'два': 'второй', 'две': 'второй',
    'три': 'третий', 'четыре': 'четвёртый',
    'пять': 'пятый', 'шесть': 'шестой', 'семь': 'седьмой',
    'восемь': 'восьмой', 'девять': 'девятый', 'десять': 'десятый',
    'одиннадцать': 'одиннадцатый', 'двенадцать': 'двенадцатый',
    'тринадцать': 'тринадцатый', 'четырнадцать': 'четырнадцатый',
    'пятнадцать': 'пятнадцатый', 'шестнадцать': 'шестнадцатый',
    'семнадцать': 'семнадцатый', 'восемнадцать': 'восемнадцатый',
    'девятнадцать': 'девятнадцатый',
    'двадцать': 'двадцатый', 'тридцать': 'тридцатый', 'сорок': 'сороковой',
    'пятьдесят': 'пятидесятый', 'шестьдесят': 'шестидесятый',
    'семьдесят': 'семидесятый', 'восемьдесят': 'восьмидесятый',
    'девяносто': 'девяностый',
    'сто': 'сотый', 'двести': 'двухсотый', 'триста': 'трёхсотый',
    'четыреста': 'четырёхсотый', 'пятьсот': 'пятисотый',
    'шестьсот': 'шестисотый', 'семьсот': 'семисотый',
    'восемьсот': 'восьмисотый', 'девятьсот': 'девятисотый',
    'тысяча': 'тысячный',
}

# 2000 → «двухтысячный»: приставка к «тысячный»
_THOUSAND_STEMS = {
    'два': 'двух', 'две': 'двух', 'три': 'трёх', 'четыре': 'четырёх',
    'пять': 'пяти', 'шесть': 'шести', 'семь': 'семи',
    'восемь': 'восьми', 'девять': 'девяти', 'десять': 'десяти',
}

# Окончания для твёрдого типа (первый, второй, сотый)
_HARD_ENDINGS = {
    ('genitive', False): 'ого',
    ('dative', False): 'ому',
    ('instrumental', False): 'ым',
    ('prepositional', False): 'ом',
    ('nominative', True): 'ые',
    ('genitive', True): 'ых',
    ('dative', True): 'ым',
    ('instrumental', True): 'ыми',
    ('prepositional', True): 'ых',
}

# Окончания для мягкого типа (третий)
_SOFT_ENDINGS = {
    ('genitive', False): 'ьего',
    ('dative', False): 'ьему',
    ('instrumental', False): 'ьим',
    ('prepositional', False): 'ьем',
    ('nominative', True): 'ьи',
    ('genitive', True): 'ьих',
    ('dative', True): 'ьим',
    ('instrumental', True): 'ьими',
    ('prepositional', True): 'ьих',
}

_YEAR_RANGE_RE = re.compile(
    r'\bс\s+(\d{4})\s+по\s+(\d{4})(?:\s+(год(?:а|у|ом|е|ы|ов|ам|ами|ах)?))?\b',
    re.IGNORECASE,
)
_DECADE_RE = re.compile(
    r'\b(\d{4})\s*-\s*[хеx]\s*(год(?:ах|ам|ами|ов|ы|а|у|ом|е)?)\b',
    re.IGNORECASE,
)
_YEAR_NOUN_RE = re.compile(
    r'\b(?:(в|во|к|ко|о|об|обо|на|за|с|со|до|по|из|от|при)\s+)?'
    r'(\d{4})\s*(год(?:а|у|ом|е|ы|ов|ам|ами|ах)?)\b',
    re.IGNORECASE,
)


def _russian_years(text: str) -> str:
    """Годы читаются порядковым числительным в падеже слова «год»."""
    text = _YEAR_RANGE_RE.sub(_replace_year_range, text)
    text = _DECADE_RE.sub(_replace_decade, text)
    return _YEAR_NOUN_RE.sub(_replace_year, text)


def _replace_year(match: re.Match) -> str:
    preposition = match.group(1)
    year = int(match.group(2))
    noun = match.group(3).lower()

    case, plural = _YEAR_NOUN_CASES.get(noun, ('nominative', False))
    # «году» — дательный после «к», иначе предложный («в … году»)
    if noun == 'году' and (preposition or '').lower() not in ('к', 'ко'):
        case = 'prepositional'

    lead = f'{preposition} ' if preposition else ''
    return f'{lead}{_ordinal_words(year, case, plural)} {noun}'


def _replace_year_range(match: re.Match) -> str:
    start = int(match.group(1))
    end = int(match.group(2))
    noun = match.group(3)

    if not noun:
        first = _ordinal_words(start, 'genitive', False)
        second = _ordinal_words(end, 'nominative', False)
        return f'с {first} по {second}'

    noun = noun.lower()
    case, plural = _YEAR_NOUN_CASES.get(noun, ('accusative', False))
    if noun == 'году':
        case = 'dative'
    first = _ordinal_words(start, 'genitive', False)
    second = _ordinal_words(end, case, plural)
    return f'с {first} по {second} {noun}'


def _replace_decade(match: re.Match) -> str:
    year = int(match.group(1))
    noun = match.group(2).lower()
    case, _ = _YEAR_NOUN_CASES.get(noun, ('nominative', True))
    return f'{_ordinal_words(year, case, True)} {noun}'


def _ordinal_words(year: int, case: str, plural: bool) -> str:
    """Порядковое числительное для года в нужном падеже и числе."""
    tokens = num2words(year, lang='ru').split()

    # 2000 → «две тысячи»: порядковое — «двухтысячный»
    if tokens[-1].startswith('тысяч'):
        stem = _THOUSAND_STEMS.get(tokens[0], '') if len(tokens) > 1 else ''
        base = f'{stem}тысячный'
        prefix = ''
    else:
        base = _ORDINAL_WORDS.get(tokens[-1])
        prefix = _drop_single_thousand(' '.join(tokens[:-1]))

    if not base:
        return ' '.join(tokens)  # не распознали — оставляем количественное

    words = _inflect_ordinal(base, case, plural)
    return f'{prefix} {words}'.strip()


def _inflect_ordinal(word: str, case: str, plural: bool) -> str:
    """Склонение порядкового числительного мужского рода."""
    # Неодушевлённое в винительном совпадает с именительным: «в … год»
    if case == 'accusative' and not plural:
        case = 'nominative'

    if case == 'nominative' and not plural:
        return word

    if word.endswith('ий'):
        return word[:-2] + _SOFT_ENDINGS[(case, plural)]
    if word.endswith(('ый', 'ой')):
        return word[:-2] + _HARD_ENDINGS[(case, plural)]
    return word


def _plural(number: int, one: str, few: str, many: str) -> str:
    """Выбор формы слова по числу: 1 процент, 2 процента, 5 процентов"""
    number = abs(number) % 100
    if 11 <= number <= 14:
        return many
    number %= 10
    if number == 1:
        return one
    if 2 <= number <= 4:
        return few
    return many
