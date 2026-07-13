#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SOURCE_ROOT = path.join(ROOT, 'art/audio/source');
const PUBLIC_ROOT = path.join(ROOT, 'public/assets/audio');
const TEMP_ROOT = path.join('/tmp', 'mimimia-original-audio');
const SAMPLE_RATE = 48_000;
const TWO_PI = Math.PI * 2;

const clamp = (value, low = -1, high = 1) => Math.min(high, Math.max(low, value));
const sine = (frequency, time, phase = 0) => Math.sin(TWO_PI * frequency * time + phase);
const smoothstep = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const oneShotEnvelope = (time, duration, attack = 0.02, release = 0.2) =>
  smoothstep(time / attack) * smoothstep((duration - time) / release);
const hashNoise = (index, salt = 0) => {
  let value = (index + 1 + salt * 1013) | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) / 0xffffffff) * 2 - 1;
};

function wavBuffer(duration, sample) {
  const frames = Math.round(duration * SAMPLE_RATE);
  const channels = 2;
  const bytesPerSample = 2;
  const dataBytes = frames * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);

  for (let frame = 0; frame < frames; frame += 1) {
    const time = frame / SAMPLE_RATE;
    for (let channel = 0; channel < channels; channel += 1) {
      const value = clamp(sample(time, channel, frame, duration));
      buffer.writeInt16LE(Math.round(value * 32767), 44 + (frame * channels + channel) * bytesPerSample);
    }
  }
  return buffer;
}

const definitions = [
  {
    id: 'ambient-moon-void', duration: 16, bitrate: '128k', targetLufs: -16,
    sample: (t, channel) => {
      const side = channel === 0 ? 1 : -1;
      const breath = 0.78 + 0.16 * sine(0.125, t, side * 0.25) + 0.06 * sine(0.25, t);
      const pad = 0.18 * sine(55, t) + 0.105 * sine(82.5, t, side * 0.08) + 0.055 * sine(110, t, side * 0.14);
      const moon = 0.035 * sine(220, t, 0.5 * sine(0.0625, t)) + 0.018 * sine(330, t, side * 0.3);
      return breath * (pad + moon);
    },
  },
  {
    id: 'charge-low', duration: 2.5, bitrate: '160k', targetLufs: -18,
    sample: (t, channel) => {
      const side = channel === 0 ? 1 : -1;
      const pulse = 0.76 + 0.18 * sine(0.8, t, side * 0.2) + 0.06 * sine(1.6, t);
      return pulse * (0.23 * sine(48, t) + 0.11 * sine(72, t, side * 0.08) + 0.045 * sine(96, t));
    },
  },
  {
    id: 'charge-crystals', duration: 2.5, bitrate: '160k', targetLufs: -20,
    sample: (t, channel) => {
      const side = channel === 0 ? 1 : -1;
      const pulseA = Math.pow(Math.max(0, sine(4, t)), 7);
      const pulseB = Math.pow(Math.max(0, sine(3.2, t, Math.PI)), 9);
      return pulseA * (0.16 * sine(523.2, t, side * 0.16) + 0.08 * sine(1046.4, t))
        + pulseB * (0.12 * sine(783.6, t, -side * 0.18) + 0.05 * sine(1567.2, t));
    },
  },
  {
    id: 'charge-rise', duration: 2.5, bitrate: '160k', targetLufs: -21,
    sample: (t, channel) => {
      const side = channel === 0 ? 1 : -1;
      const orbit = sine(880, t, 72 * sine(0.4, t, side * 0.1));
      const dust = Math.pow(Math.max(0, sine(6.4, t, side * 0.3)), 10) * sine(1760, t, side * 0.2);
      return 0.105 * orbit + 0.07 * dust + 0.025 * sine(2640, t, side * 0.4);
    },
  },
  {
    id: 'charged-cue', duration: 0.9, bitrate: '160k', targetLufs: -18,
    sample: (t, channel, _frame, duration) => {
      const side = channel === 0 ? 1 : -1;
      const env = oneShotEnvelope(t, duration, 0.012, 0.28) * Math.exp(-1.65 * t);
      const second = t > 0.16 ? Math.exp(-5.2 * (t - 0.16)) : 0;
      return env * (0.22 * sine(659.2, t, side * 0.06) + 0.1 * sine(1318.4, t))
        + second * 0.13 * sine(987.6, t, -side * 0.08);
    },
  },
  {
    id: 'dissolve', duration: 1, bitrate: '160k', targetLufs: -20,
    sample: (t, channel, frame, duration) => {
      const side = channel === 0 ? 1 : -1;
      const env = oneShotEnvelope(t, duration, 0.01, 0.3) * (1 - 0.72 * t);
      const phase = TWO_PI * (520 * t - 190 * t * t);
      const air = hashNoise(frame, channel) * 0.025 * Math.pow(1 - t, 1.4);
      return env * (0.18 * Math.sin(phase + side * 0.08) + 0.08 * Math.sin(phase * 1.5)) + air * env;
    },
  },
  {
    id: 'release-chime', duration: 1.4, bitrate: '160k', targetLufs: -18,
    sample: (t, channel, _frame, duration) => {
      if (t < 0.12) return 0;
      const local = t - 0.12;
      const side = channel === 0 ? 1 : -1;
      const env = oneShotEnvelope(local, duration - 0.12, 0.008, 0.36) * Math.exp(-1.75 * local);
      return env * (0.2 * sine(587.2, local, side * 0.05) + 0.13 * sine(880, local, -side * 0.06)
        + 0.075 * sine(1174.4, local) + 0.035 * sine(2348.8, local, side * 0.2));
    },
  },
  {
    id: 'cat-form', duration: 1.7, bitrate: '160k', targetLufs: -19,
    sample: (t, channel, frame, duration) => {
      const side = channel === 0 ? 1 : -1;
      const env = oneShotEnvelope(t, duration, 0.025, 0.38);
      const purr = sine(62, t, 0.22 * sine(24, t)) * (0.7 + 0.3 * sine(12, t));
      const shimmer = Math.pow(Math.max(0, sine(5.5, t, side * 0.3)), 9) * sine(1320, t, side * 0.18);
      const air = hashNoise(frame, 8 + channel) * 0.012 * smoothstep(t / 0.4) * smoothstep((duration - t) / 0.45);
      return env * (0.13 * purr + 0.09 * sine(372, t, side * 0.05) + 0.06 * shimmer + air);
    },
  },
];

await mkdir(SOURCE_ROOT, { recursive: true });
await mkdir(PUBLIC_ROOT, { recursive: true });
await rm(TEMP_ROOT, { recursive: true, force: true });
await mkdir(TEMP_ROOT, { recursive: true });

for (const definition of definitions) {
  const rawPath = path.join(TEMP_ROOT, `${definition.id}-raw.wav`);
  const sourcePath = path.join(SOURCE_ROOT, `${definition.id}.wav`);
  const publicPath = path.join(PUBLIC_ROOT, `${definition.id}.mp3`);
  await writeFile(rawPath, wavBuffer(definition.duration, definition.sample));
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', rawPath,
    '-af', `loudnorm=I=${definition.targetLufs}:TP=-2:LRA=7`,
    '-ar', String(SAMPLE_RATE), '-ac', '2', '-c:a', 'pcm_s16le', sourcePath,
  ]);
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath,
    '-map_metadata', '-1', '-ar', String(SAMPLE_RATE), '-ac', '2',
    '-c:a', 'libmp3lame', '-b:a', definition.bitrate, publicPath,
  ]);
}

console.log(`已生成 ${definitions.length} 条原创 48 kHz 立体声 WAV 与 MP3。`);
