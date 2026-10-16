// 生成假麦克风用的 WAV：约 5 秒静音 + 约 10 秒 C4（261.63 Hz）正弦波 + 静音，共 30 秒，48 kHz 16 位单声道。
// Chrome 的 --use-file-for-fake-audio-capture 会循环播放这个文件。
// 用法：node e2e/fixtures/make-c4-wav.mjs [输出路径]（默认 e2e/.cache/c4.wav）；e2e 运行器会自动调用。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_WAV = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'c4.wav');

export function makeC4Wav(path = DEFAULT_WAV, { force = false } = {}) {
  if (!force && existsSync(path)) return path;
  const rate = 48000;
  const total = 30 * rate;
  const toneStart = Math.round(4.95 * rate);
  const toneEnd = Math.round(15.28 * rate);
  const freq = 261.6256;
  const amp = 12000;
  const buf = Buffer.alloc(44 + total * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + total * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt 块长度
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // 单声道
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); // 字节率
  buf.writeUInt16LE(2, 32); // 块对齐
  buf.writeUInt16LE(16, 34); // 位深
  buf.write('data', 36);
  buf.writeUInt32LE(total * 2, 40);
  for (let i = toneStart; i < toneEnd; i++) {
    const s = Math.round(amp * Math.sin((2 * Math.PI * freq * (i - toneStart)) / rate));
    buf.writeInt16LE(s, 44 + i * 2);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return path;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(makeC4Wav(process.argv[2] ?? DEFAULT_WAV, { force: true }));
}
