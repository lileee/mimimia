import { describe, expect, it } from 'vitest';

import { MagicCircle, getMagicCircleFrame } from '../../../src/effects/MagicCircle';
import { GLYPH_PATHS } from '../../../src/effects/magicCircle/glyphPaths';
import type { ExperienceState } from '../../../src/state/experienceTypes';

const signals = (state: ExperienceState, charge: number, dissolve = 0) => ({
  nowMs: 1_000,
  deltaSeconds: 1 / 60,
  state,
  charge,
  dissolve,
  summon: 0,
  pointerNdc: { x: 0, y: 0 },
});

describe('MagicCircle phase mapping', () => {
  it('maps the exact 0.32 and 0.68 charge boundaries without overlap', () => {
    expect(getMagicCircleFrame(signals('charging', 0))).toMatchObject({
      centerProgress: 0, middleProgress: 0, outerProgress: 0, auxiliaryProgress: 0, opacity: 0,
    });

    const phaseOne = getMagicCircleFrame(signals('charging', 0.16));
    expect(phaseOne.centerProgress).toBeCloseTo(0.5);
    expect(phaseOne.middleProgress).toBeCloseTo(0.5);
    expect(phaseOne.outerProgress).toBe(0);

    const firstBoundary = getMagicCircleFrame(signals('charging', 0.32));
    expect(firstBoundary.centerProgress).toBe(1);
    expect(firstBoundary.middleProgress).toBe(1);
    expect(firstBoundary.outerProgress).toBe(0);

    const phaseTwo = getMagicCircleFrame(signals('charging', 0.5));
    expect(phaseTwo.outerProgress).toBeCloseTo(0.5);
    expect(phaseTwo.auxiliaryProgress).toBe(0);

    const secondBoundary = getMagicCircleFrame(signals('charging', 0.68));
    expect(secondBoundary.outerProgress).toBe(1);
    expect(secondBoundary.auxiliaryProgress).toBe(0);

    const complete = getMagicCircleFrame(signals('charged', 1));
    expect(complete.auxiliaryProgress).toBe(1);
    expect(complete.brightness).toBeGreaterThan(secondBoundary.brightness);
    expect(getMagicCircleFrame(signals('charged', 1))).toEqual(complete);
  });

  it('dissolves from the outer layer toward the center', () => {
    const early = getMagicCircleFrame(signals('dissolving', 1, 0.3));
    expect(early.outerOpacity).toBeLessThan(early.middleOpacity);
    expect(early.middleOpacity).toBeLessThanOrEqual(early.centerOpacity);
    const late = getMagicCircleFrame(signals('dissolving', 1, 0.8));
    expect(late.outerOpacity).toBe(0);
    expect(late.centerOpacity).toBeGreaterThan(0);
  });
});

describe('MagicCircle geometry', () => {
  it('uses only original procedural vectors within the approved radius', () => {
    expect(GLYPH_PATHS.filter(({ category }) => category === 'cat-eye')).toHaveLength(1);
    expect(GLYPH_PATHS.filter(({ category }) => category === 'moon-phase')).toHaveLength(8);
    expect(GLYPH_PATHS.filter(({ category }) => category === 'star-orbit')).toHaveLength(3);
    expect(GLYPH_PATHS.filter(({ category }) => category === 'fictional-glyph')).toHaveLength(12);

    for (const path of GLYPH_PATHS) {
      for (const point of path.points) expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(2.304);
    }
  });

  it('creates normalized arc attributes, fixed height, and three rotation directions', () => {
    const circle = new MagicCircle();
    expect(circle.group.position.y).toBeCloseTo(0.015);
    for (const geometry of circle.geometries) {
      const arc = geometry.getAttribute('arcProgress');
      expect(arc).toBeDefined();
      expect(arc.getX(0)).toBeGreaterThanOrEqual(0);
      expect(arc.getX(arc.count - 1)).toBeLessThanOrEqual(1);
    }

    circle.update(signals('charging', 1));
    const snapshot = circle.getSnapshot();
    expect(Math.sign(snapshot.centerRotation)).toBe(1);
    expect(Math.sign(snapshot.middleRotation)).toBe(-1);
    expect(Math.sign(snapshot.outerRotation)).toBe(1);
    circle.dispose();
  });
});
