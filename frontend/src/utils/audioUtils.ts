/**
 * audioUtils.ts — Преобразование AudioBuffer в WAV-файл для отправки на бэкенд.
 *
 * При записи с микрофона браузер отдаёт WebM (Opus). Бэкенд (Whisper в librosa)
 * не умеет читать WebM прямо из памяти, поэтому мы декодируем его через Web Audio API
 * и вручную собираем «сырой» WAV Blob без внешних библиотек.
 *
 * Формат: PCM 16-bit, little-endian, один/несколько каналов, частота — из AudioBuffer.
 * Заголовок WAV — 44 байта: RIFF chunk descriptor + fmt subchunk + data chunk.
 * Интерливинг — данные каналов записываются попеременно: L R L R ...
 */

import type { AudioBlobLike } from '../types/api'

// Записывает ASCII-строку в DataView по указанному смещению.
// Используется для сигнатур 'RIFF', 'WAVE', 'fmt ', 'data'.
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}


/**
 * audioBufferToWav(buffer: AudioBuffer) -> Blob
 *
 * Принимает декодированный AudioBuffer из AudioContext.decodeAudioData()
 * и возвращает Blob типа audio/wav, готовый к отправке на сервер через FormData.
 *
 * Процесс:
 *   1. Объединяем каналы в интерливинг (LRLRLR...).
 *   2. Конвертируем Float32 (-1.0..1.0) в Int16.
 *   3. Записываем 44-байтовый WAV-заголовок (RIFF/WAVE).
 *   4. Записываем аудиоданные.
 *   5. Возвращаем Blob.
 *
 * @param {AudioBuffer} buffer — декодированный аудио из AudioContext
 * @returns {Blob} WAV-файл для загрузки на сервер
 */
export function audioBufferToWav(buffer: AudioBlobLike): Blob {
  const numChannels = buffer.numberOfChannels
  const { sampleRate } = buffer
  const format = 1       // PCM (без сжатия)
  const bitDepth = 16

  // 1. Интерливинг — чередуем семплы каждого канала: L0 R0 L1 R1 L2 R2 ...
  const interleaved = new Float32Array(buffer.length * numChannels)
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel)
    for (let i = 0; i < buffer.length; i++) {
      interleaved[i * numChannels + channel] = channelData[i]
    }
  }

  // 2. Нормализация Float32 (-1.0..1.0) в Int16 (-32768..32767).
  //    Значения < -1 обрезаем по -1 (minInt16), 0..1 масштабируем на 0x7FFF.
  const int16Data = new Int16Array(interleaved.length)
  for (let i = 0; i < interleaved.length; i++) {
    const s = Math.max(-1, Math.min(1, interleaved[i]))
    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }

  // 3. Собираем WAV-заголовок согласно стандарту Wave Format.
  //    Структура: RIFF(4) | size(4) | WAVE(4) | fmt(4) | fmtSize(4) |
  //               audioFormat(2) | numChannels(2) | sampleRate(4) |
  //               byteRate(4) | blockAlign(2) | bitsPerSample(2) |
  //               data(4) | dataSize(4)  =>  44 байта
  const dataLength = int16Data.length * 2
  const headerLength = 44
  const totalLength = headerLength + dataLength
  const arrayBuffer = new ArrayBuffer(totalLength)
  const view = new DataView(arrayBuffer)

  // --- RIFF chunk descriptor ---
  writeString(view, 0, 'RIFF')                              // сигнатура файла
  view.setUint32(4, 36 + dataLength, true)                 // оставшийся размер файла (не считая первых 8 байт)
  writeString(view, 8, 'WAVE')                              // тип контейнера

  // --- fmt subchunk ---
  writeString(view, 12, 'fmt ')                              // сигнатура формата
  view.setUint32(16, 16, true)                               // Subchunk1Size = 16 для PCM
  view.setUint16(20, format, true)                           // AudioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true)                      // Mono = 1, Stereo = 2
  view.setUint32(24, sampleRate, true)                       // частота дискретизации (16000)
  view.setUint32(28, sampleRate * numChannels * 2, true)    // ByteRate = sampleRate * channels * bitsPerSample/8
  view.setUint16(32, numChannels * 2, true)                  // BlockAlign = channels * bitsPerSample/8
  view.setUint16(34, bitDepth, true)                         // BitsPerSample = 16

  // --- data subchunk ---
  writeString(view, 36, 'data')                              // сигнатура данных
  view.setUint32(40, dataLength, true)                       // байт аудиоданных

  // 4. Записываем семплы (Int16 LE) сразу после 44-байтового заголовка
  for (let i = 0; i < int16Data.length; i++) {
    view.setInt16(44 + i * 2, int16Data[i], true)
  }

  // 5. Возвращаем готовый Blob для отправки через FormData
  return new Blob([arrayBuffer], { type: 'audio/wav' })
}
