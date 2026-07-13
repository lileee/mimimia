#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

const PROFILES = {
  'magical-girl': {
    layers: [
      'back-hair', 'body-legs', 'face', 'eyes-open', 'eyes-closed', 'front-hair', 'hat-body',
      'hat-ornament', 'cape-outer', 'cape-lining', 'ribbon-left', 'ribbon-right', 'skirt', 'staff', 'staff-glow',
    ],
    additive: new Set(['staff-glow']),
    ranges: {
      'body-legs': { rotationDegrees: 0, translateYPercent: 0.8 },
      'back-hair': { rotationDegrees: 2.4, translateYPercent: 0 },
      face: { rotationDegrees: 0, translateYPercent: 0.8 },
      'eyes-open': { rotationDegrees: 0, translateYPercent: 0.8 },
      'eyes-closed': { rotationDegrees: 0, translateYPercent: 0.8 },
      'front-hair': { rotationDegrees: 1.8, translateYPercent: 0 },
      'hat-body': { rotationDegrees: 0.6, translateYPercent: 0 },
      'hat-ornament': { rotationDegrees: 2, translateYPercent: 0 },
      'cape-outer': { rotationDegrees: 2.2, translateYPercent: 0 },
      'cape-lining': { rotationDegrees: 1.4, translateYPercent: 0 },
      'ribbon-left': { rotationDegrees: 4, translateYPercent: 0 },
      'ribbon-right': { rotationDegrees: 4, translateYPercent: 0 },
      skirt: { rotationDegrees: 1.8, translateYPercent: 0 },
      staff: { rotationDegrees: 0.8, translateYPercent: 0 },
      'staff-glow': { rotationDegrees: 0.8, translateYPercent: 0 },
    },
  },
  'moon-cat': {
    layers: ['body', 'head', 'eyes-open', 'eyes-closed', 'ear-left', 'ear-right', 'tail', 'glow'],
    additive: new Set(['glow']),
    ranges: {
      body: { rotationDegrees: 0, translateYPercent: 2.5 },
      head: { rotationDegrees: 3, translateYPercent: 2.5 },
      'eyes-open': { rotationDegrees: 0, translateYPercent: 2.5 },
      'eyes-closed': { rotationDegrees: 0, translateYPercent: 2.5 },
      'ear-left': { rotationDegrees: 6, translateYPercent: 2.5 },
      'ear-right': { rotationDegrees: 6, translateYPercent: 2.5 },
      tail: { rotationDegrees: 8, translateYPercent: 2.5 },
      glow: { rotationDegrees: 0, translateYPercent: 2.5 },
    },
  },
};

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function sameNumber(actual, expected) {
  return Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9;
}

export async function validateLayerPack(character, repositoryRoot = REPOSITORY_ROOT) {
  const profile = PROFILES[character];
  if (!profile) throw new Error(`未知图层包：${character}`);

  const failures = [];
  const sourceRoot = path.join(repositoryRoot, 'art', 'source', character);
  const layerRoot = path.join(sourceRoot, 'layers');
  const rigPath = path.join(sourceRoot, 'rig.json');
  const masterPath = path.join(sourceRoot, 'approved-master.png');
  const layeredMasterPath = path.join(sourceRoot, 'layered-master.ora');

  if (!(await exists(rigPath))) throw new Error(`${character} 缺少 rig.json`);
  if (!(await exists(masterPath))) throw new Error(`${character} 缺少 approved-master.png`);

  const rig = JSON.parse(await readFile(rigPath, 'utf8'));
  const master = await sharp(masterPath).metadata();
  if (!master.width || !master.height || master.hasAlpha !== true) failures.push('母图必须有固定尺寸和透明通道');
  if (rig.canvas?.width !== master.width || rig.canvas?.height !== master.height) failures.push('rig 画布尺寸必须与母图一致');
  if (rig.sourceMasterSha256 !== await sha256(masterPath)) failures.push('rig 中的母图校验值与文件不一致');
  if (!(await exists(layeredMasterPath))) failures.push('缺少 layered-master.ora');

  const declaredLayers = Array.isArray(rig.layers) ? rig.layers : [];
  const declaredNames = declaredLayers.map((layer) => layer.name).sort();
  const expectedNames = [...profile.layers].sort();
  if (JSON.stringify(declaredNames) !== JSON.stringify(expectedNames)) failures.push('rig 图层名称必须完整且不得包含额外图层');

  const actualFiles = (await readdir(layerRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
    .map((entry) => entry.name.slice(0, -4))
    .sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedNames)) failures.push('layers 目录必须恰好包含规定 PNG 图层');

  const zOrders = new Set();
  for (const layer of declaredLayers) {
    if (!expectedNames.includes(layer.name)) continue;
    const expectedBlend = profile.additive.has(layer.name) ? 'additive' : 'normal';
    if (layer.blendMode !== expectedBlend) failures.push(`${layer.name} 混合方式必须为 ${expectedBlend}`);
    if (!Number.isFinite(layer.zOrder) || zOrders.has(layer.zOrder)) failures.push(`${layer.name} zOrder 缺失或重复`);
    zOrders.add(layer.zOrder);
    if (!layer.pivot || !sameNumber(layer.pivot.x, Math.min(1, Math.max(0, layer.pivot.x))) || !sameNumber(layer.pivot.y, Math.min(1, Math.max(0, layer.pivot.y)))) {
      failures.push(`${layer.name} 枢轴必须位于 0..1`);
    }
    const expectedRange = profile.ranges[layer.name];
    if (!layer.motionRange || !sameNumber(layer.motionRange.rotationDegrees, expectedRange.rotationDegrees) || !sameNumber(layer.motionRange.translateYPercent, expectedRange.translateYPercent)) {
      failures.push(`${layer.name} 动作范围与设计值不一致`);
    }

    const expectedPath = `layers/${layer.name}.png`;
    if (layer.path !== expectedPath) failures.push(`${layer.name} 路径必须为 ${expectedPath}`);
    const layerPath = path.join(sourceRoot, expectedPath);
    if (!(await exists(layerPath))) continue;
    const metadata = await sharp(layerPath).metadata();
    if (metadata.width !== master.width || metadata.height !== master.height) failures.push(`${layer.name} 画布尺寸与母图不一致`);
    if (metadata.hasAlpha !== true || metadata.channels !== 4) failures.push(`${layer.name} 必须为 RGBA PNG`);
    const stats = await sharp(layerPath).ensureAlpha().stats();
    if ((stats.channels[3]?.max ?? 0) === 0) failures.push(`${layer.name} 不得为空图层`);
  }

  if (failures.length > 0) throw new Error(`${character} 图层包检查失败：\n- ${failures.join('\n- ')}`);
  return { layers: declaredLayers.length, width: master.width, height: master.height };
}

const character = process.argv[2];
if (!character) {
  console.error('用法：npm run art:validate-layers -- <magical-girl|moon-cat>');
  process.exitCode = 1;
} else {
  validateLayerPack(character)
    .then(({ layers, width, height }) => console.log(`${character} 图层包通过：${layers} 层，统一画布 ${width}×${height}。`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
