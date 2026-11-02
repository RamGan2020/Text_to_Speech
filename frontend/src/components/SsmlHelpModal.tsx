/**
 * SsmlHelpModal.tsx — модальная справка по SSML для Silero TTS.
 *
 * Значения атрибутов взяты из кода модели v5_6_ru
 * (tts_package/multi_acc_v3_package.py: strength2time, rate2value, pitch2value)
 * и проверены запуском синтеза.
 *
 * Кнопка «Вставить» передаёт готовый пример в textarea через onInsert.
 */
import { Button, Modal, Table } from 'react-bootstrap'

interface SsmlHelpModalProps {
  show: boolean
  onHide: () => void
  onInsert: (snippet: string) => void
}

// Значения strength и соответствующие паузы (из strength2time)
const BREAK_STRENGTHS = [
  { value: 'x_weak', time: '25 мс' },
  { value: 'weak', time: '75 мс' },
  { value: 'medium', time: '150 мс' },
  { value: 'strong', time: '300 мс' },
  { value: 'x-strong', time: '1000 мс' },
]

// Коэффициенты темпа (из rate2value)
const RATES = [
  { value: 'x-slow', factor: '0.5' },
  { value: 'slow', factor: '0.8' },
  { value: 'medium', factor: '1.0' },
  { value: 'fast', factor: '1.2' },
  { value: 'x-fast', factor: '1.5' },
]

// Коэффициенты тона (из pitch2value)
const PITCHES = [
  { value: 'x-low', factor: '0.75' },
  { value: 'low', factor: '0.85' },
  { value: 'medium', factor: '1.0' },
  { value: 'high', factor: '1.15' },
  { value: 'x-high', factor: '1.25' },
  { value: 'robot', factor: '0.0' },
]

function SsmlHelpModal({ show, onHide, onInsert }: SsmlHelpModalProps) {
  // Вставка примера в текст и закрытие окна
  const insert = (snippet: string) => {
    onInsert(snippet)
    onHide()
  }

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable centered>
      <Modal.Header closeButton>
        <Modal.Title>SSML-разметка Silero</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p className="text-muted small">
          Значения проверены на модели <code>v5_6_ru</code>. Кнопка «Вставить»
          добавляет пример в текст в позицию курсора.
        </p>

        <h6 className="mt-3">Корневой тег</h6>
        <p className="mb-2">
          <code>{'<speak>…</speak>'}</code> — обязателен для модели. Если его нет,
          обёртка добавляется автоматически, писать вручную не нужно.
        </p>

        <h6 className="mt-3">Пауза — break</h6>
        <p className="mb-2">
          <code>{'<break time="300ms"/>'}</code> — пауза во времени.
          Единицы: <code>ms</code> или <code>s</code> (<code>250ms</code>, <code>1s</code>).
          Максимум 5000 мс — большее значение обрезается. Без единиц измерения — ошибка.
        </p>
        <Button size="sm" variant="outline-primary" onClick={() => insert('<break time="1s"/>')}>
          Вставить паузу 1 с
        </Button>

        <Table size="sm" bordered className="mt-3 mb-1">
          <thead>
            <tr>
              <th>strength</th>
              <th>Пауза</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {BREAK_STRENGTHS.map((item) => (
              <tr key={item.value}>
                <td><code>{item.value}</code></td>
                <td>{item.time}</td>
                <td className="text-end">
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => insert(`<break strength="${item.value}"/>`)}
                  >
                    Вставить
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="small text-muted">
          Внимание: <code>x_weak</code> — с подчёркиванием, <code>x-strong</code> — с дефисом.
          Это особенность модели, а не опечатка.
        </p>

        <h6 className="mt-3">Темп и тон — prosody</h6>
        <p className="mb-2">
          Атрибуты можно комбинировать:{' '}
          <code>{'<prosody rate="slow" pitch="high">текст</prosody>'}</code>.
          Хотя бы один атрибут обязателен. Вложенные теги наследуют значения.
        </p>

        <Table size="sm" bordered className="mt-2 mb-1">
          <thead>
            <tr>
              <th>rate</th>
              <th>Множитель</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {RATES.map((item) => (
              <tr key={item.value}>
                <td><code>{item.value}</code></td>
                <td>{item.factor}</td>
                <td className="text-end">
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => insert(`<prosody rate="${item.value}">текст</prosody>`)}
                  >
                    Вставить
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="small text-muted">
          Вместо значения можно указать проценты: <code>{'rate="80%"'}</code> — медленнее,
          <code>{' rate="120%"'}</code> — быстрее.
        </p>

        <Table size="sm" bordered className="mt-2 mb-1">
          <thead>
            <tr>
              <th>pitch</th>
              <th>Множитель</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {PITCHES.map((item) => (
              <tr key={item.value}>
                <td><code>{item.value}</code></td>
                <td>{item.factor}</td>
                <td className="text-end">
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => insert(`<prosody pitch="${item.value}">текст</prosody>`)}
                  >
                    Вставить
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="small text-muted">
          Проценты для тона задаются со знаком: <code>{'pitch="+20%"'}</code> — выше,
          <code>{' pitch="-20%"'}</code> — ниже. Особое значение <code>robot</code> делает голос
          неестественно ровным.
        </p>

        <h6 className="mt-3">Абзацы и предложения</h6>
        <p className="mb-2">
          <code>{'<p>Первый абзац.</p>'}</code> — пауза 1000 мс после абзаца.{' '}
          <code>{'<s>Первое предложение.</s>'}</code> — 300 мс после предложения.
        </p>
        <div className="d-flex gap-2">
          <Button size="sm" variant="outline-primary" onClick={() => insert('<p>Первый абзац.</p><p>Второй абзац.</p>')}>
            Вставить абзацы
          </Button>
          <Button size="sm" variant="outline-primary" onClick={() => insert('<s>Первое предложение.</s><s>Второе предложение.</s>')}>
            Вставить предложения
          </Button>
        </div>

        <h6 className="mt-3">Выразительность</h6>
        <p className="mb-2">
          Нестандартный тег Silero: <code>{'<intensity=5>важно</intensity>'}</code> —
          сила логического ударения, по умолчанию 3.
        </p>
        <div className="d-flex gap-2">
          <Button size="sm" variant="outline-primary" onClick={() => insert('<intensity=5>важно</intensity>')}>
            Вставить intensity
          </Button>
        </div>
        <p className="mt-2 mb-2">
          <code>**слово**</code> — эмфаза, <code>*слово*</code> — логическое ударение.
          Работают и внутри SSML, и в обычном тексте.
        </p>
        <div className="d-flex gap-2">
          <Button size="sm" variant="outline-primary" onClick={() => insert('**важно**')}>
            Вставить эмфазу
          </Button>
          <Button size="sm" variant="outline-primary" onClick={() => insert('*важно*')}>
            Вставить ударение
          </Button>
        </div>

        <h6 className="mt-3">Ударение в слове</h6>
        <p className="mb-0">
          <code>вод[!]а</code> или <code>вод+а</code> — ударение на «а».
          Знак ставится непосредственно перед ударной гласной.
        </p>

        <h6 className="mt-3">Правила и ограничения</h6>
        <ul className="mb-0 small">
          <li>Неизвестные теги и атрибуты игнорируются, в лог уходит предупреждение.</li>
          <li>Неверное значение атрибута — ошибка синтеза (HTTP 500).</li>
          <li>Текст внутри тегов нормализуется как обычно: числа, латиница, знаки.</li>
          <li>Сегмент с SSML не делится на чанки и читается только русским голосом.</li>
        </ul>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Закрыть
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default SsmlHelpModal
