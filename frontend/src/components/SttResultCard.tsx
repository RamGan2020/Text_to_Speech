import { useState } from 'react';
import { Card, Button } from 'react-bootstrap';

interface SttResultCardProps {
  text: string;
}

export default function SttResultCard({ text }: SttResultCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Ошибка копирования:', err);
    }
  };

  return (
    <Card className="shadow-sm mt-3">
      <Card.Body>
        <Card.Title>Распознанный текст</Card.Title>
        <div className="mb-3">
          <textarea
            readOnly
            value={text}
            className="form-control"
            rows={4}
            style={{ resize: 'none' }}
          />
        </div>
        <div className="d-flex gap-2">
          <Button variant="primary" onClick={handleCopy}>
            {copied ? 'Скопировано!' : 'Копировать текст'}
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}