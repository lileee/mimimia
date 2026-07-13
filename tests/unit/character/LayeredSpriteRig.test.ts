import {
  AdditiveBlending,
  DataTexture,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three/webgpu';
import { describe, expect, it } from 'vitest';

import { LayeredSpriteRig } from '../../../src/character/LayeredSpriteRig';
import type { RigDefinition } from '../../../src/character/rigTypes';

const definition: RigDefinition = {
  id: 'test-rig',
  version: 1,
  canvas: { width: 500, height: 1_000 },
  origin: { x: 0.5, y: 0.9 },
  worldHeight: 4,
  layers: [
    {
      name: 'body', path: 'body.webp', pivot: { x: 0.5, y: 0.6 }, zOrder: 300,
      blendMode: 'normal', motionRange: { rotationDegrees: 0, translateYPercent: 1 },
    },
    {
      name: 'head', path: 'head.webp', pivot: { x: 0.5, y: 0.3 }, zOrder: 400,
      blendMode: 'normal', motionRange: { rotationDegrees: 3, translateYPercent: 0 },
    },
    {
      name: 'glow', path: 'glow.webp', pivot: { x: 0.25, y: 0.4 }, zOrder: 410,
      blendMode: 'additive', motionRange: { rotationDegrees: 5, translateYPercent: 0 }, parent: 'head',
    },
  ],
};

function makeTextures() {
  return new Map(definition.layers.map(({ name }) => [
    name,
    new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1),
  ]));
}

describe('LayeredSpriteRig', () => {
  it('creates ordered full-canvas node planes around manifest pivots', () => {
    const rig = new LayeredSpriteRig(definition, makeTextures(), { renderOrderBase: 500 });

    expect(rig.layerNames).toEqual(['body', 'head', 'glow']);
    expect(rig.root.userData.layerCount).toBe(3);

    const body = rig.getLayer('body');
    const head = rig.getLayer('head');
    const glow = rig.getLayer('glow');
    expect(body?.mesh.geometry).toBeInstanceOf(PlaneGeometry);
    expect(body?.material).toBeInstanceOf(MeshBasicNodeMaterial);
    expect(body?.material.depthWrite).toBe(false);
    expect(body?.texture.colorSpace).toBe(SRGBColorSpace);
    expect(glow?.material.blending).toBe(AdditiveBlending);
    expect([body?.mesh.renderOrder, head?.mesh.renderOrder, glow?.mesh.renderOrder]).toEqual([500, 501, 502]);

    expect((body?.mesh.geometry as PlaneGeometry).parameters).toMatchObject({ width: 2, height: 4 });
    expect((glow?.mesh.geometry as PlaneGeometry).parameters).toMatchObject({ width: 2, height: 4 });
    expect(head?.pivot.position.y).toBeCloseTo(2.4);
    expect(glow?.pivot.parent).toBe(head?.pivot);
    expect(glow?.pivot.position.x).toBeCloseTo(-0.5);
    expect(glow?.pivot.position.y).toBeCloseTo(-0.4);

    rig.dispose();
  });

  it('applies and resets motion as a fraction of each declared limit', () => {
    const rig = new LayeredSpriteRig(definition, makeTextures());
    rig.setLayerMotion('head', { rotationFraction: 0.75, translateYFraction: 0 });
    rig.setLayerMotion('body', { rotationFraction: 0, translateYFraction: -0.5 });

    expect(rig.getLayer('head')?.pivot.rotation.z).toBeCloseTo(3 * 0.75 * Math.PI / 180);
    expect(rig.getLayer('body')?.pivot.position.y).toBeCloseTo(1.2 - 4 * 0.01 * 0.5);

    rig.reset();
    expect(rig.getLayer('head')?.pivot.rotation.z).toBe(0);
    expect(rig.getLayer('body')?.pivot.position.y).toBeCloseTo(1.2);
    rig.dispose();
  });
});
