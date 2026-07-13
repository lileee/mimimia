#!/usr/bin/env node

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const CELL_WIDTH = 320;
const CELL_HEIGHT = 620;
const LABEL_HEIGHT = 36;
const DRAW_HEIGHT = CELL_HEIGHT - LABEL_HEIGHT;
const DRAW_WIDTH = Math.round(DRAW_HEIGHT * (2100 / 4096));
const DRAW_LEFT = Math.floor((CELL_WIDTH - DRAW_WIDTH) / 2);

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function prepareLayer(sourceRoot, layer, canvas) {
  const drawWidth = Math.round(DRAW_HEIGHT * (canvas.width / canvas.height));
  const left = Math.floor((CELL_WIDTH - drawWidth) / 2);
  const resized = await sharp(path.join(sourceRoot, layer.path))
    .resize(drawWidth, DRAW_HEIGHT, { fit: 'fill' })
    .extend({
      top: LABEL_HEIGHT,
      bottom: 0,
      left,
      right: CELL_WIDTH - drawWidth - left,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return {
    ...layer,
    href: `data:image/png;base64,${resized.toString('base64')}`,
    pivotX: left + layer.pivot.x * drawWidth,
    pivotY: LABEL_HEIGHT + layer.pivot.y * DRAW_HEIGHT,
  };
}

function backgroundSvg(label) {
  const stripe = CELL_WIDTH / 3;
  return `
    <rect width="${CELL_WIDTH}" height="${LABEL_HEIGHT}" fill="#110b27"/>
    <rect x="0" y="${LABEL_HEIGHT}" width="${stripe}" height="${DRAW_HEIGHT}" fill="#000000"/>
    <rect x="${stripe}" y="${LABEL_HEIGHT}" width="${stripe}" height="${DRAW_HEIGHT}" fill="#ffffff"/>
    <rect x="${stripe * 2}" y="${LABEL_HEIGHT}" width="${stripe}" height="${DRAW_HEIGHT}" fill="#241343"/>
    <line x1="${stripe}" y1="${LABEL_HEIGHT}" x2="${stripe}" y2="${CELL_HEIGHT}" stroke="#8c82a8" stroke-width="1"/>
    <line x1="${stripe * 2}" y1="${LABEL_HEIGHT}" x2="${stripe * 2}" y2="${CELL_HEIGHT}" stroke="#8c82a8" stroke-width="1"/>
    <text x="10" y="24" fill="#f5efff" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700">${escapeXml(label)}</text>
  `;
}

async function renderFrame(preparedLayers, target, direction, zoom) {
  const stateLabel = direction < 0 ? 'NEGATIVE' : direction > 0 ? 'POSITIVE' : 'NEUTRAL';
  const targetLayer = preparedLayers.find((layer) => layer.name === target.name);
  const zoomTransform = zoom
    ? `translate(${CELL_WIDTH / 2} ${(LABEL_HEIGHT + CELL_HEIGHT) / 2}) scale(1.85) translate(${-targetLayer.pivotX} ${-targetLayer.pivotY})`
    : '';
  const images = [];

  for (const layer of preparedLayers) {
    if (layer.name === 'eyes-closed' && target.name !== 'eyes-closed') continue;
    if (layer.name === 'eyes-open' && target.name === 'eyes-closed') continue;
    if (layer.defaultVisible === false && layer.name !== target.name) continue;

    let transform = '';
    if (layer.name === target.name) {
      const rotation = layer.motionRange.rotationDegrees * direction;
      const translateY = (layer.motionRange.translateYPercent / 100) * DRAW_HEIGHT * direction;
      transform = `translate(0 ${translateY}) translate(${layer.pivotX} ${layer.pivotY}) rotate(${rotation}) translate(${-layer.pivotX} ${-layer.pivotY})`;
    }
    const blend = layer.blendMode === 'additive' ? ' style="mix-blend-mode:screen"' : '';
    images.push(`<image href="${layer.href}" x="0" y="0" width="${CELL_WIDTH}" height="${CELL_HEIGHT}" transform="${transform}"${blend}/>`);
  }

  const svg = `<svg width="${CELL_WIDTH}" height="${CELL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    ${backgroundSvg(`${target.name} · ${stateLabel}${zoom ? ' · 2×' : ''}`)}
    <g transform="${zoomTransform}">${images.join('')}</g>
  </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function renderBoard(preparedLayers, movingLayers, zoom, outputPath) {
  const composites = [];
  for (let row = 0; row < movingLayers.length; row += 1) {
    const target = movingLayers[row];
    const frames = await Promise.all([-1, 0, 1].map((direction) => renderFrame(preparedLayers, target, direction, zoom)));
    for (let column = 0; column < frames.length; column += 1) {
      composites.push({ input: frames[column], left: column * CELL_WIDTH, top: row * CELL_HEIGHT });
    }
  }
  await sharp({
    create: {
      width: CELL_WIDTH * 3,
      height: CELL_HEIGHT * movingLayers.length,
      channels: 4,
      background: '#090514',
    },
  }).composite(composites).png({ compressionLevel: 9 }).toFile(outputPath);
}

async function main() {
  const character = process.argv[2];
  if (!character) throw new Error('用法：npm run art:render-extremes -- <magical-girl|moon-cat>');
  const sourceRoot = path.join(REPOSITORY_ROOT, 'art', 'source', character);
  const reviewRoot = path.join(REPOSITORY_ROOT, 'art', 'reviews');
  const rig = JSON.parse(await readFile(path.join(sourceRoot, 'rig.json'), 'utf8'));
  const preparedLayers = await Promise.all(
    [...rig.layers].sort((a, b) => a.zOrder - b.zOrder).map((layer) => prepareLayer(sourceRoot, layer, rig.canvas)),
  );
  const movingLayers = preparedLayers.filter((layer) =>
    layer.motionRange.rotationDegrees !== 0 || layer.motionRange.translateYPercent !== 0,
  );
  await mkdir(reviewRoot, { recursive: true });
  await renderBoard(preparedLayers, movingLayers, false, path.join(reviewRoot, `${character}-layer-extremes-1x.png`));
  await renderBoard(preparedLayers, movingLayers, true, path.join(reviewRoot, `${character}-layer-extremes-2x.png`));
  console.log(`${character} 极限审核板已生成：${movingLayers.length} 个可动层，负/静止/正三档，1× 与 2×。`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
