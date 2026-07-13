import { DataTexture } from 'three/webgpu';
import { describe, expect, it } from 'vitest';

import { MagicalGirlRig } from '../../../src/character/MagicalGirlRig';
import { LayeredSpriteRig } from '../../../src/character/LayeredSpriteRig';
import type { RigDefinition } from '../../../src/character/rigTypes';
import { EXPERIENCE_TIMING } from '../../../src/config/experience';
import type { ExperienceState } from '../../../src/state/experienceTypes';

const definition: RigDefinition = {
  id: 'girl-motion-test',
  version: 1,
  canvas: { width: 500, height: 1_000 },
  origin: { x: 0.5, y: 0.94 },
  worldHeight: 4.8,
  layers: [
    {
      name: 'back-hair', path: 'back-hair.webp', pivot: { x: 0.52, y: 0.29 }, zOrder: 210,
      blendMode: 'normal', motionRange: { rotationDegrees: 2.4, translateYPercent: 0 },
    },
    {
      name: 'eyes-open', path: 'eyes-open.webp', pivot: { x: 0.52, y: 0.27 }, zOrder: 451,
      blendMode: 'normal', motionRange: { rotationDegrees: 0, translateYPercent: 0.8 }, defaultVisible: true,
    },
    {
      name: 'eyes-closed', path: 'eyes-closed.webp', pivot: { x: 0.52, y: 0.27 }, zOrder: 452,
      blendMode: 'normal', motionRange: { rotationDegrees: 0, translateYPercent: 0.8 }, defaultVisible: false,
    },
  ],
};

const frame = (state: ExperienceState, charge: number, dissolve = 0, summon = 0) => ({
  nowMs: 0,
  deltaSeconds: 0,
  state,
  charge,
  dissolve,
  summon,
  pointerNdc: { x: 0, y: 0 },
});

function makeRig() {
  const textures = new Map(definition.layers.map(({ name }) => [
    name,
    new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1),
  ]));
  const layered = new LayeredSpriteRig(definition, textures);
  return { rig: new MagicalGirlRig(layered), layered };
}

describe('MagicalGirlRig', () => {
  it('raises cloth only in phase three and releases it smoothly after dissolve or fill', () => {
    const { rig, layered } = makeRig();
    const rotation = () => layered.getLayer('back-hair')?.pivot.rotation.z ?? 0;

    rig.update(frame('charging', EXPERIENCE_TIMING.chargePhase2End - 0.01));
    const idleRotation = rotation();
    rig.update(frame('charging', 1));
    const chargedRotation = rotation();
    expect(Math.abs(chargedRotation)).toBeGreaterThan(Math.abs(idleRotation));
    expect(Math.abs(chargedRotation)).toBeLessThanOrEqual(2.4 * 0.9 * Math.PI / 180);

    rig.update(frame('dissolving', 1, 1));
    expect(rotation()).toBeCloseTo(idleRotation);

    const fillEnd = EXPERIENCE_TIMING.fillEndMs / EXPERIENCE_TIMING.summonEndMs;
    rig.update(frame('summoning', 1, 0, fillEnd));
    expect(rotation()).toBeCloseTo(chargedRotation);
    rig.update(frame('summoning', 1, 0, 1));
    expect(rotation()).toBeCloseTo(idleRotation);
    rig.dispose();
  });
});
