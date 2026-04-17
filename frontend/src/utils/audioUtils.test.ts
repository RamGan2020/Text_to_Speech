/**
 * audioUtils.test.js — Unit-тесты для конвертера AudioBuffer → WAV.
 *
 * Проверяет корректность:
 *   - WAV-заголовка (RIFF/WAVE сигнатуры)
 *   - Частоты дискретизации в заголовке
 *   - Количества каналов
 *   - Глубины цвета (16-bit)
 *   - Интерливинга (чередрование каналов LRLR)
 *   - Нормализации Float32 (-1..1) → Int16
 *
 * Запуск: npm install --save-dev vitest jsdom && npx vitest
 */
import { describe, it, expect } from 'vitest'
import { audioBufferToWav } from './audioUtils'
import type { AudioBlobLike } from '../types/api'

// Мок AudioBuffer — создаём минимальный объект для тестирования
function createMockAudioBuffer(numChannels: number, sampleRate: number, length: number, channelData: Float32Array[]): AudioBlobLike {
  return {
    numberOfChannels: numChannels,
    sampleRate,
    length,
    getChannelData(idx: number) {
      return channelData[idx]
    },
  }
}

describe('audioBufferToWav', () => {
  it('должен создать валидный WAV-заголовок для моно-аудио', () => {
    const channelData = [new Float32Array(16000)]
    for (let i = 0; i < 16000; i++) {
      channelData[0][i] = 0 // тихий сигнал
    }

    const buffer = createMockAudioBuffer(1, 16000, 16000, channelData)
    const wavBlob = audioBufferToWav(buffer)

    expect(wavBlob.type).toBe('audio/wav')

    return wavBlob.arrayBuffer().then((buf) => {
      const view = new DataView(buf)
      // Проверяем сигнатуры RIFF/WAVE
      const riff = String.fromCharCode(
        view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
      )
      const wave = String.fromCharCode(
        view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
      )
      expect(riff).toBe('RIFF')
      expect(wave).toBe('WAVE')

      // Проверяем sampleRate (байты 24-27)
      expect(view.getUint32(24, true)).toBe(16000)
      // Проверяем numChannels (байт 22)
      expect(view.getUint16(22, true)).toBe(1)
      // Проверяем bitsPerSample (байт 34)
      expect(view.getUint16(34, true)).toBe(16)

      // Проверяем data chunk sig (байты 36-39)
      const dataSig = String.fromCharCode(
        view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39)
      )
      expect(dataSig).toBe('data')
    })
  })

  it('должен создать WAV с интерливингом для стерео', () => {
    const length = 4
    const left = new Float32Array([0.5, 0.3, 0.2, 0.1])
    const right = new Float32Array([-0.5, -0.3, -0.2, -0.1])

    const buffer = createMockAudioBuffer(2, 44100, length, [left, right])
    const wavBlob = audioBufferToWav(buffer)

    return wavBlob.arrayBuffer().then((buf) => {
      const view = new DataView(buf)
      // Каналы должны чередоваться: L0 R0 L1 R1 L2 R2 L3 R3
      // После 44-байтового заголовка
      const L0 = view.getInt16(44, true)
      const R0 = view.getInt16(46, true)
      const L1 = view.getInt16(48, true)
      const R1 = view.getInt16(50, true)

      // Проверяем интерливинг: L0 R0 L1 R1 ...
      // 0.5 → Int16 = Math.floor(0.5 * 0x7FFF) = 16383
      // -0.5 → Int16 = Math.floor(-0.5 * 0x8000) = -16384
      const expectedL0 = Math.trunc(0.5 * 0x7FFF)  // 16383
      const expectedR0 = Math.trunc(-0.5 * 0x8000) // -16384
      const expectedL1 = Math.trunc(0.3 * 0x7FFF)  // 9830
      const expectedR1 = Math.trunc(-0.3 * 0x8000) // -9830

      expect(L0).toBe(expectedL0)
      expect(R0).toBe(expectedR0)
      expect(L1).toBe(expectedL1)
      expect(R1).toBe(expectedR1)
    })
  })

  it('должен обрезать значения за пределами [-1, 1]', () => {
    const length = 2
    const data = new Float32Array([1.5, -2.0])

    const buffer = createMockAudioBuffer(1, 8000, length, [data])
    const wavBlob = audioBufferToWav(buffer)

    return wavBlob.arrayBuffer().then((buf) => {
      const view = new DataView(buf)
      // 1.5 → обрезается до 1.0 → 0x7FFF
      const s0 = view.getInt16(44, true)
      // -2.0 → обрезается до -1.0 → -0x8000
      const s1 = view.getInt16(46, true)
      expect(s0).toBe(0x7FFF)
      expect(s1).toBe(-0x8000)
    })
  })
})
