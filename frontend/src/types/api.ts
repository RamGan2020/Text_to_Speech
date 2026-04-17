// API типы для взаимодействия с бэкендом

export type Speaker = 'kseniya' | 'xenia' | 'baya' | 'aidar' | 'eugene';

export interface SynthesizeRequest {
  text: string;
  speaker: Speaker;
  put_accent: boolean;
  put_yo: boolean;
  podcast_mode: boolean;
}

export interface SynthesizeResponse {
  audioBlob: Blob;
  filename: string;
}

export interface TranscribeResponse {
  text: string;
  filename: string;
}

export interface DeepSeekRequest {
  question: string;
  api_key?: string;
  system_prompt?: string;
  model: 'deepseek-chat' | 'deepseek-reasoner';
  max_tokens: number;
  temperature: number;
}

export interface DeepSeekResponse {
  answer: string;
  model: string;
}

export interface SpeakerOption {
  value: Speaker;
  label: string;
}

export interface PodcastTag {
  type: 'voice' | 'pause';
  value: string;
  text?: string;
}

export interface FileValidationResult {
  isValid: boolean;
  message?: string;
}

/** Минимальный интерфейс AudioBuffer для работы audioBufferToWav.
 *  Мок-объекты в тестах не являются настоящим AudioBuffer,
 *  поэтому используем структурный typing (duck typing).
 */
export interface AudioBlobLike {
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}