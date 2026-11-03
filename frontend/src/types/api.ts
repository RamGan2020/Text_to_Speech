// API типы для взаимодействия с бэкендом

export type Speaker = 'kseniya' | 'xenia' | 'baya' | 'aidar' | 'eugene';

/** Способ произношения английских слов:
 *  voice — отдельная английская модель голосом, подобранным под диктора;
 *  transliterate — тот же диктор, латиница записывается кириллицей. */
export type EnglishMode = 'voice' | 'transliterate';

export interface SynthesizeRequest {
  text: string;
  speaker: Speaker;
  put_accent: boolean;
  put_yo: boolean;
  podcast_mode: boolean;
  english_mode: EnglishMode;
  /** Клонированный голос (вкладка «Мой голос») — если задан, speaker игнорируется */
  voice_id?: string | null;
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
  /** 'kseniya' | 'xenia' | ... или 'clone:<voice_id>' для клонированного голоса */
  value: string;
  label: string;
}

/** Зарегистрированный клонированный голос (XTTS v2). */
export interface VoiceInfo {
  voice_id: string;
  name: string;
  duration_sec?: number;
  created_at?: string;
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