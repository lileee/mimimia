#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SOURCE_ROOT = path.join(ROOT, 'art/audio/source');
const PUBLIC_ROOT = path.join(ROOT, 'public/assets/audio');
const IDS = [
  'ambient-moon-void', 'charge-low', 'charge-crystals', 'charge-rise',
  'charged-cue', 'dissolve', 'release-chime', 'cat-form',
];
const LOOP_IDS = ['ambient-moon-void', 'charge-low', 'charge-crystals', 'charge-rise'];
const EXPECTED_DURATION = {
  'ambient-moon-void': 16,
  'charge-low': 2.5,
  'charge-crystals': 2.5,
  'charge-rise': 2.5,
  'charged-cue': 0.9,
  dissolve: 1,
  'release-chime': 1.4,
  'cat-form': 1.7,
};

function probe(filePath) {
  return JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels,duration',
    '-of', 'json', filePath,
  ], { encoding: 'utf8' })).streams[0];
}

function decodedPeak(filePath) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-i', filePath, '-af', 'astats=metadata=1:reset=0', '-f', 'null', '-',
  ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  const output = String(result.stderr ?? '');
  const peaks = [...output.matchAll(/Peak level dB:\s*(-?inf|-?\d+(?:\.\d+)?)/g)]
    .map((match) => match[1] === '-inf' ? Number.NEGATIVE_INFINITY : Number(match[1]));
  return Math.max(...peaks);
}

function integratedLufs(filePath) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-i', filePath, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-',
  ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  const values = [...String(result.stderr ?? '').matchAll(/I:\s+(-?\d+(?:\.\d+)?) LUFS/g)].map((match) => Number(match[1]));
  return values.at(-1);
}

async function pcmData(filePath) {
  const buffer = await readFile(filePath);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'data') return buffer.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${filePath} 缺少 PCM data 区块`);
}

function seamJump(data) {
  const firstLeft = data.readInt16LE(0);
  const firstRight = data.readInt16LE(2);
  const lastLeft = data.readInt16LE(data.length - 4);
  const lastRight = data.readInt16LE(data.length - 2);
  return Math.max(Math.abs(lastLeft - firstLeft), Math.abs(lastRight - firstRight)) / 32768;
}

function leadingRmsDb(data, milliseconds) {
  const samples = Math.floor(48_000 * 2 * milliseconds / 1000);
  let sum = 0;
  for (let index = 0; index < samples; index += 1) {
    const value = data.readInt16LE(index * 2) / 32768;
    sum += value * value;
  }
  const rms = Math.sqrt(sum / samples);
  return rms === 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(rms);
}

const sourceNames = (await readdir(SOURCE_ROOT)).filter((name) => name.endsWith('.wav')).sort();
const publicNames = (await readdir(PUBLIC_ROOT)).filter((name) => name.endsWith('.mp3')).sort();
const expectedWav = IDS.map((id) => `${id}.wav`).sort();
const expectedMp3 = IDS.map((id) => `${id}.mp3`).sort();
const failures = [];
if (JSON.stringify(sourceNames) !== JSON.stringify(expectedWav)) failures.push('WAV 文件清单必须恰好包含 8 条规定声音');
if (JSON.stringify(publicNames) !== JSON.stringify(expectedMp3)) failures.push('MP3 文件清单必须恰好包含 8 条规定声音');

let totalBytes = 0;
const metrics = [];
for (const id of IDS) {
  const wavPath = path.join(SOURCE_ROOT, `${id}.wav`);
  const mp3Path = path.join(PUBLIC_ROOT, `${id}.mp3`);
  const wav = probe(wavPath);
  const mp3 = probe(mp3Path);
  if (wav.codec_name !== 'pcm_s16le' || wav.sample_rate !== '48000' || wav.channels !== 2) failures.push(`${id} WAV 必须为 48 kHz 立体声 PCM16`);
  if (mp3.codec_name !== 'mp3' || mp3.sample_rate !== '48000' || mp3.channels !== 2) failures.push(`${id} MP3 必须为 48 kHz 立体声`);
  if (Math.abs(Number(wav.duration) - EXPECTED_DURATION[id]) > 0.015) failures.push(`${id} WAV 时长不正确`);
  if (Math.abs(Number(mp3.duration) - EXPECTED_DURATION[id]) > 0.08) failures.push(`${id} MP3 时长不正确`);
  const peak = decodedPeak(mp3Path);
  if (!Number.isFinite(peak) || peak > -1) failures.push(`${id} 解码峰值 ${peak} dBFS，必须不高于 -1 dBFS`);
  const lufs = integratedLufs(mp3Path);
  if (!Number.isFinite(lufs)) failures.push(`${id} 无法测得综合响度`);
  if (id === 'ambient-moon-void' && Math.abs(lufs - (-16)) > 1.2) failures.push(`ambient-moon-void 综合响度 ${lufs} LUFS 偏离 -16 LUFS`);
  const bytes = (await stat(mp3Path)).size;
  totalBytes += bytes;
  metrics.push({ id, duration: Number(mp3.duration), lufs, peak, bytes });
}

for (const id of LOOP_IDS) {
  const jump = seamJump(await pcmData(path.join(SOURCE_ROOT, `${id}.wav`)));
  if (jump > 0.02) failures.push(`${id} 循环首尾跳变 ${jump.toFixed(5)} 过大`);
}

const releaseLead = leadingRmsDb(await pcmData(path.join(SOURCE_ROOT, 'release-chime.wav')), 118);
if (releaseLead > -80) failures.push(`release-chime 前 118 ms 必须静音，当前 ${releaseLead.toFixed(1)} dBFS`);
if (totalBytes > 3.5 * 1024 * 1024) failures.push(`MP3 总大小 ${(totalBytes / 1024 / 1024).toFixed(2)} MB 超过 3.5 MB`);

if (failures.length > 0) throw new Error(`声音检查失败：\n- ${failures.join('\n- ')}`);
console.log(`声音检查通过：8 条 48 kHz 立体声；4 条循环接缝合格；MP3 总大小 ${(totalBytes / 1024 / 1024).toFixed(2)} MB。`);
for (const metric of metrics) {
  console.log(`${metric.id}: ${metric.duration.toFixed(3)} s, ${metric.lufs.toFixed(1)} LUFS, ${metric.peak.toFixed(2)} dBFS, ${(metric.bytes / 1024).toFixed(1)} KiB`);
}
