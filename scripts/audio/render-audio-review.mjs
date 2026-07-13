#!/usr/bin/env node

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SOURCE_ROOT = path.join(ROOT, 'art/audio/source');
const REVIEW_ROOT = path.join(ROOT, 'art/reviews');
const IDS = [
  'ambient-moon-void', 'charge-low', 'charge-crystals', 'charge-rise',
  'charged-cue', 'dissolve', 'release-chime', 'cat-form',
];
const LOOP_IDS = new Set(['ambient-moon-void', 'charge-low', 'charge-crystals', 'charge-rise']);
const WIDTH = 1600;
const LABEL_WIDTH = 250;
const PLOT_WIDTH = 1290;
const ROW_HEIGHT = 140;
const TOP = 50;

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function pcmChunk(buffer) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'data') return buffer.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV 缺少 PCM data 区块');
}

function waveformLines(data, rowTop) {
  const frames = data.length / 4;
  const center = rowTop + ROW_HEIGHT / 2;
  const amplitude = ROW_HEIGHT * 0.39;
  const lines = [];
  for (let x = 0; x < PLOT_WIDTH; x += 1) {
    const start = Math.floor(x / PLOT_WIDTH * frames);
    const end = Math.max(start + 1, Math.floor((x + 1) / PLOT_WIDTH * frames));
    let low = 1;
    let high = -1;
    for (let frame = start; frame < end; frame += 1) {
      const value = (data.readInt16LE(frame * 4) + data.readInt16LE(frame * 4 + 2)) / 65536;
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    const xPos = LABEL_WIDTH + x;
    lines.push(`<line x1="${xPos}" y1="${center - high * amplitude}" x2="${xPos}" y2="${center - low * amplitude}"/>`);
  }
  return lines.join('');
}

let rows = '';
for (let index = 0; index < IDS.length; index += 1) {
  const id = IDS[index];
  const file = await readFile(path.join(SOURCE_ROOT, `${id}.wav`));
  const data = pcmChunk(file);
  const duration = data.length / 4 / 48_000;
  const top = TOP + index * ROW_HEIGHT;
  const marker = id === 'release-chime'
    ? `<line x1="${LABEL_WIDTH + PLOT_WIDTH * (0.12 / duration)}" y1="${top + 8}" x2="${LABEL_WIDTH + PLOT_WIDTH * (0.12 / duration)}" y2="${top + ROW_HEIGHT - 8}" stroke="#ffd785" stroke-width="3"/><text x="${LABEL_WIDTH + PLOT_WIDTH * (0.12 / duration) + 7}" y="${top + 23}" fill="#ffd785" font-size="16">120 ms</text>`
    : '';
  rows += `
    <rect x="25" y="${top + 4}" width="1550" height="${ROW_HEIGHT - 8}" rx="18" fill="${index % 2 === 0 ? '#17102e' : '#20133a'}"/>
    <text x="50" y="${top + 52}" fill="#f4efff" font-size="23" font-weight="700">${escapeXml(id)}</text>
    <text x="50" y="${top + 86}" fill="#a99bc7" font-size="17">${duration.toFixed(2)} s${LOOP_IDS.has(id) ? ' · LOOP' : ' · ONE SHOT'}</text>
    <line x1="${LABEL_WIDTH}" y1="${top + ROW_HEIGHT / 2}" x2="${LABEL_WIDTH + PLOT_WIDTH}" y2="${top + ROW_HEIGHT / 2}" stroke="#493963" stroke-width="1"/>
    <g stroke="#a58bff" stroke-width="1" opacity="0.88">${waveformLines(data, top)}</g>
    ${marker}`;
}

const height = TOP * 2 + IDS.length * ROW_HEIGHT;
const svg = `<svg width="${WIDTH}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0d081c"/>
  <text x="40" y="35" fill="#f7f1ff" font-size="26" font-weight="700">Moonlight Summoning · Source Waveform Review</text>
  ${rows}
</svg>`;

await mkdir(REVIEW_ROOT, { recursive: true });
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(REVIEW_ROOT, 'audio-waveform-sheet.png'));
console.log('声音波形审核板已生成。');
