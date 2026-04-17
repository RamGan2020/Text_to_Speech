/**
 * PodcastModePanel.jsx — панель управления тегами подкаста во вкладке TTS.
 *
 * Появляется только когда включен режим подкаста (tts_state['podcast_mode']).
 * Позволяет:
 *   1. Вставить тег смены голоса [voice:kseniya] в позицию курсора
 *   2. Вставить тег паузы [pause:1.5] с произвольным значением
 *   3. Вставить готовый пример — полный текст с расставленными тегами
 *
 * Получает все коллбэки из TtsTab через пропсы — не хранит своего состояния текста.
 */
import { Card, Row, Col, Button, Form } from 'react-bootstrap'

// Готовые примеры текстов с тегами [voice:] и [pause:]
// При нажатии кнопки example.replace('Весь текущий текст') в родительском TtsTab
const PODCAST_EXAMPLES = [
  {
    id: 'dialog',
    label: 'Диалог ведущих',
    text: `[voice:kseniya] Всем привет! Это наш подкаст.
[pause:0.8]
[voice:aidar] Сегодня обсудим новости по проекту.
[pause:1.2]
[voice:kseniya] Поехали!`,
  },
  {
    id: 'ad-break',
    label: 'Реклама/пауза',
    text: `[voice:eugene] Короткая пауза перед следующим блоком.
[pause:2.0]
[voice:xenia] Спасибо, что слушаете нас.`,
  },
  {
    id: 'narration',
    label: 'Озвучка с паузами',
    text: `[voice:baya] Глава первая.
[pause:1.0]
В небольшом городе началась новая история.
[pause:1.5]
И никто не знал, к чему она приведет.`,
  },
]

/**
 * PodcastModePanel
 *
 * @param {Array} props.speakers — список доступных голосов (SPEAKERS из TtsTab)
 * @param {string} props.templateVoice — выбранный голос для вставки тега
 * @param {(e) => void} props.onTemplateVoiceChange — смена выбранного голоса
 * @param {string} props.pauseTemplateValue — значение паузы (1.0, 1.5s, 500ms)
 * @param {(e) => void} props.onPauseTemplateValueChange — смена значения паузы
 * @param {() => void} props.onInsertVoiceTag — вставить [voice:X] в позицию курсора
 * @param {() => void} props.onInsertPauseTag — вставить [pause:X] в позицию курсора
 * @param {(text: string) => void} props.onInsertExample — пример заменяет весь текст
 * @param {boolean} props.loading — флаг загрузки (блокирует кнопки)
 */
export default function PodcastModePanel({
  speakers,
  templateVoice,
  onTemplateVoiceChange,
  pauseTemplateValue,
  onPauseTemplateValueChange,
  onInsertVoiceTag,
  onInsertPauseTag,
  onInsertExample,
  loading,
}) {
  return (
    <Card className="mb-3 border-info-subtle">
      <Card.Body>
        {/* Секция: Вставка тега голоса — [voice:name] */}
        <h6 className="mb-2">Вставка тега голоса</h6>
        <Row className="g-2 mb-3">
          <Col xs={12} sm={8}>
            <Form.Select value={templateVoice} onChange={onTemplateVoiceChange}>
              {speakers.map((s) => (
                <option key={`template-${s.value}`} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Form.Select>
          </Col>
          <Col xs={12} sm={4}>
            <div className="d-grid">
              <Button
                variant="outline-primary"
                onClick={onInsertVoiceTag}
                disabled={loading}
                size="sm"
              >
                [voice]
              </Button>
            </div>
          </Col>
        </Row>

        {/* Секция: Вставка тега паузы — [pause:time] */}
        <h6 className="mb-2">Вставка тега паузы</h6>
        <Row className="g-2 mb-3">
          <Col xs={7} sm={8}>
            <Form.Control
              type="text"
              value={pauseTemplateValue}
              onChange={onPauseTemplateValueChange}
              placeholder="1.5, 1.5s, 500ms"
              size="sm"
            />
          </Col>
          <Col xs={5} sm={4}>
            <div className="d-grid">
              <Button
                variant="outline-primary"
                onClick={onInsertPauseTag}
                disabled={loading}
                size="sm"
              >
                [pause]
              </Button>
            </div>
          </Col>
        </Row>

        {/* Секция: Примеры готовых сценариев с тегами */}
        <h6 className="mb-2">Примеры</h6>
        <div className="d-grid gap-2">
          {PODCAST_EXAMPLES.map((example) => (
            <Button
              key={example.id}
              variant="outline-info"
              onClick={() => onInsertExample(example.text)}
              disabled={loading}
              size="sm"
            >
              {example.label}
            </Button>
          ))}
        </div>
      </Card.Body>
    </Card>
  )
}
