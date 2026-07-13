import {
  BufferGeometry,
  Group,
  LineBasicNodeMaterial,
  LineSegments,
  MathUtils,
} from 'three/webgpu';

import type { FrameSignals } from '../app/frameSignals';
import { LAYER_ORDER } from '../stage/layerOrder';
import { createRingGeometry } from './magicCircle/createRingGeometry';
import { GLYPH_PATHS, type GlyphCategory } from './magicCircle/glyphPaths';
import { createMagicCircleNodeMaterial, type MagicCircleNodeControls } from './magicCircle/magicCircleNodes';

const FIRST_BOUNDARY = 0.32;
const SECOND_BOUNDARY = 0.68;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
};

export interface MagicCircleFrame {
  centerProgress: number;
  middleProgress: number;
  outerProgress: number;
  auxiliaryProgress: number;
  opacity: number;
  centerOpacity: number;
  middleOpacity: number;
  outerOpacity: number;
  auxiliaryOpacity: number;
  brightness: number;
}

export interface MagicCircleSnapshot extends MagicCircleFrame {
  centerRotation: number;
  middleRotation: number;
  outerRotation: number;
}

function fadeAfter(progress: number, start: number, duration: number): number {
  return 1 - smoothstep((progress - start) / duration);
}

export function getMagicCircleFrame(signals: FrameSignals): MagicCircleFrame {
  const charge = clamp01(signals.charge);
  const active = signals.state === 'charging'
    || signals.state === 'charged'
    || signals.state === 'dissolving'
    || signals.state === 'summoning';
  const opacity = active && charge > 0 ? 1 : 0;
  const centerProgress = clamp01(charge / FIRST_BOUNDARY);
  const middleProgress = centerProgress;
  const outerProgress = clamp01((charge - FIRST_BOUNDARY) / (SECOND_BOUNDARY - FIRST_BOUNDARY));
  const auxiliaryProgress = clamp01((charge - SECOND_BOUNDARY) / (1 - SECOND_BOUNDARY));
  const dissolve = signals.state === 'dissolving' ? clamp01(signals.dissolve) : 0;
  const centerOpacity = opacity * fadeAfter(dissolve, 0.55, 0.45);
  const middleOpacity = opacity * fadeAfter(dissolve, 0.25, 0.5);
  const outerOpacity = opacity * fadeAfter(dissolve, 0, 0.45);
  const auxiliaryOpacity = opacity * fadeAfter(dissolve, 0, 0.35);
  return {
    centerProgress,
    middleProgress,
    outerProgress,
    auxiliaryProgress,
    opacity,
    centerOpacity,
    middleOpacity,
    outerOpacity,
    auxiliaryOpacity,
    brightness: 0.72 + smoothstep((charge - SECOND_BOUNDARY) / (1 - SECOND_BOUNDARY)) * 0.88,
  };
}

interface CircleLayer {
  group: Group;
  geometry: BufferGeometry;
  material: LineBasicNodeMaterial;
  controls: MagicCircleNodeControls;
}

function makeLayer(
  name: string,
  categories: readonly GlyphCategory[],
  color: number,
  renderOrder: number,
): CircleLayer {
  const group = new Group();
  group.name = name;
  const geometry = createRingGeometry(GLYPH_PATHS.filter(({ category }) => categories.includes(category)));
  const { material, controls } = createMagicCircleNodeMaterial(color);
  const lines = new LineSegments(geometry, material);
  lines.name = `${name}-vectors`;
  lines.renderOrder = renderOrder;
  lines.frustumCulled = false;
  group.add(lines);
  return { group, geometry, material, controls };
}

export class MagicCircle {
  readonly group = new Group();
  readonly #center = makeLayer('magic-circle-center', ['cat-eye', 'guide'], 0xb9d4ff, LAYER_ORDER.spellBack.min);
  readonly #middle = makeLayer('magic-circle-middle', ['moon-phase'], 0xd2bbff, LAYER_ORDER.spellBack.min + 1);
  readonly #outer = makeLayer('magic-circle-outer', ['star-orbit', 'fictional-glyph'], 0x9baeff, LAYER_ORDER.spellBack.min + 2);
  readonly #auxiliary = makeLayer('magic-circle-auxiliary', ['radial-tick', 'star-point'], 0xe5dcff, LAYER_ORDER.spellBack.min + 3);
  readonly geometries = [this.#center.geometry, this.#middle.geometry, this.#outer.geometry, this.#auxiliary.geometry] as const;
  #frame: MagicCircleFrame = getMagicCircleFrame({
    nowMs: 0, deltaSeconds: 0, state: 'idle', charge: 0, dissolve: 0, summon: 0, pointerNdc: { x: 0, y: 0 },
  });

  constructor() {
    this.group.name = 'procedural-magic-circle';
    this.group.position.y = 0.015;
    this.group.add(this.#center.group, this.#middle.group, this.#outer.group, this.#auxiliary.group);
    this.#applyFrame(this.#frame);
  }

  update(signals: FrameSignals): void {
    this.#frame = getMagicCircleFrame(signals);
    this.#applyFrame(this.#frame);
    if (this.#frame.opacity === 0) return;
    const delta = Math.min(0.1, Math.max(0, signals.deltaSeconds));
    const speed = 0.35 + clamp01(signals.charge) * 0.65;
    this.#center.group.rotation.y = MathUtils.euclideanModulo(this.#center.group.rotation.y + delta * 0.12 * speed, Math.PI * 2);
    this.#middle.group.rotation.y = -MathUtils.euclideanModulo(-this.#middle.group.rotation.y + delta * 0.09 * speed, Math.PI * 2);
    this.#outer.group.rotation.y = MathUtils.euclideanModulo(this.#outer.group.rotation.y + delta * 0.055 * speed, Math.PI * 2);
    this.#auxiliary.group.rotation.y = this.#outer.group.rotation.y;
  }

  getSnapshot(): MagicCircleSnapshot {
    return {
      ...this.#frame,
      centerRotation: this.#center.group.rotation.y,
      middleRotation: this.#middle.group.rotation.y,
      outerRotation: this.#outer.group.rotation.y,
    };
  }

  reset(): void {
    this.#center.group.rotation.y = 0;
    this.#middle.group.rotation.y = 0;
    this.#outer.group.rotation.y = 0;
    this.#auxiliary.group.rotation.y = 0;
    this.#frame = getMagicCircleFrame({
      nowMs: 0, deltaSeconds: 0, state: 'idle', charge: 0, dissolve: 0, summon: 0, pointerNdc: { x: 0, y: 0 },
    });
    this.#applyFrame(this.#frame);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const layer of [this.#center, this.#middle, this.#outer, this.#auxiliary]) {
      layer.geometry.dispose();
      layer.material.dispose();
      layer.group.clear();
    }
    this.group.clear();
  }

  #applyFrame(frame: MagicCircleFrame): void {
    const values: Array<[CircleLayer, number, number]> = [
      [this.#center, frame.centerProgress, frame.centerOpacity],
      [this.#middle, frame.middleProgress, frame.middleOpacity],
      [this.#outer, frame.outerProgress, frame.outerOpacity],
      [this.#auxiliary, frame.auxiliaryProgress, frame.auxiliaryOpacity],
    ];
    for (const [layer, progress, opacity] of values) {
      layer.controls.progress.value = progress;
      layer.controls.opacity.value = opacity;
      layer.controls.brightness.value = frame.brightness;
      layer.group.visible = opacity > 0 && progress > 0;
    }
  }
}
