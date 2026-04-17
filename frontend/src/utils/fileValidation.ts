/**
 * fileValidation.ts — Проверка аудио-файлов перед отправкой на сервер.
 *
 * Проблема: расширение файла (.mp3, .wav и т.д.) может не соответствовать
 * реальному содержимому. Бэкенд (librosa + Whisper) упадёт с неясной ошибкой,
 * если файл битый или имеет другой формат.
 *
 * Решение: проверка magic bytes (сигнатур) первых байт файла.
 * Это быстрый клиент-side чек, который даёт понятную ошибку до отправки.
 */

interface MagicBytePattern {
  offset: number;
  patterns: Uint8Array[];
}

interface MagicBytes {
  [key: string]: MagicBytePattern;
}

const MAGIC_BYTES: MagicBytes = {
  // MP3: первые 2 байта — 0xFF 0xFB или 0xFF 0xF3 (MPEG Audio sync word)
  mp3: {
    offset: 0,
    patterns: [
      new Uint8Array([0xFF, 0xFB]), // MPEG-1 Layer 3
      new Uint8Array([0xFF, 0xF3]), // MPEG-2.5 Layer 3
      new Uint8Array([0xFF, 0xF2]), // MPEG-2 Layer 3
    ],
  },
  // WAV: начинается с 'RIFF' (0x52 0x49 0x46 0x46)
  wav: {
    offset: 0,
    patterns: [new Uint8Array([0x52, 0x49, 0x46, 0x46])],
  },
  // OGG: начинается с 'OggS' (0x4F 0x67 0x67 0x53)
  ogg: {
    offset: 0,
    patterns: [new Uint8Array([0x4F, 0x67, 0x67, 0x53])],
  },
  // FLAC: начинается с 'fLaC' (0x66 0x4C 0x61 0x43)
  flac: {
    offset: 0,
    patterns: [new Uint8Array([0x66, 0x4C, 0x61, 0x43])],
  },
  // WEBM: начинается с '\x1A\x45\xDF\xA3' (EBML header)
  webm: {
    offset: 0,
    patterns: [new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])],
  },
}

// Максимальный размер файла — 25 МБ (совпадает с бэкендом)
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

/**
 * Проверить аудио-файл на корректность формата и размера.
 *
 * @param {File} file — объект File из input[type=file] или Blob
 * @param {string} expectedFormat — ожидаемый формат: 'mp3', 'wav', 'ogg', 'flac', 'webm'
 * @returns {{ valid: boolean, error?: string }} — объект валидации
 */
export async function validateAudioFile(file: File, expectedFormat: string): Promise<{ valid: boolean; error?: string }> {
  // Проверка 1: размер файла
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `Файл слишком большой (${(file.size / (1024 * 1024)).toFixed(1)} МБ). Максимум ${MAX_FILE_SIZE / (1024 * 1024)} МБ.`,
    }
  }

  if (file.size === 0) {
    return { valid: false, error: 'Файл пустой.' }
  }

  // Проверка 2: сигнатура файла (magic bytes)
  const formatInfo = MAGIC_BYTES[expectedFormat]
  if (!formatInfo) {
    return { valid: true } // Нет данных для проверки — доверяем расширению
  }

  try {
    // Читаем только первые байты (не весь файл!) — очень быстро
    const slice = file.slice(
      formatInfo.offset,
      formatInfo.offset + formatInfo.patterns[0].length
    )
    const buffer = await slice.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    const matches = formatInfo.patterns.some((pattern) => {
      if (pattern.length > bytes.length) return false
      for (let i = 0; i < pattern.length; i++) {
        if (bytes[i] !== pattern[i]) return false
      }
      return true
    })

    if (!matches) {
      return {
        valid: false,
        error: `Файл не является файлом формата ${expectedFormat.toUpperCase()}. Возможно, файл повреждён или имеет неверное расширение.`,
      }
    }
  } catch {
    // Ошибка чтения — не блокируем, но предупреждаем
    return { valid: true }
  }

  return { valid: true }
}
