import { Card, Button } from 'react-bootstrap';

interface TtsResultCardProps {
  audioUrl: string;
}

export default function TtsResultCard({ audioUrl }: TtsResultCardProps) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = 'speech.mp3';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Card className="shadow-sm mt-3">
      <Card.Body>
        <Card.Title>Результат озвучки</Card.Title>
        <div className="mb-3">
          <audio controls src={audioUrl} className="w-100">
            Ваш браузер не поддерживает аудио элемент
          </audio>
        </div>
        <Button variant="success" onClick={handleDownload}>
          Скачать MP3
        </Button>
      </Card.Body>
    </Card>
  );
}