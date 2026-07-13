import type { MeshBasicNodeMaterial } from 'three/webgpu';
import { color, mix, oneMinus, smoothstep, texture, uniform, uv } from 'three/tsl';

import type { LayeredSpriteRig } from '../character/LayeredSpriteRig';

export interface CatRevealControls {
  shadow: { value: number };
  fill: { value: number };
  opacity: { value: number };
}

export function applyCatRevealNodes(rig: LayeredSpriteRig): CatRevealControls {
  const shadow = uniform(0);
  const fill = uniform(0);
  const opacity = uniform(0);
  const coordinates = uv();
  const shadowMask = oneMinus(smoothstep(shadow, shadow.add(0.04), coordinates.y));
  const fillMask = oneMinus(smoothstep(fill, fill.add(0.035), coordinates.y));
  const fillEdge = oneMinus(smoothstep(0, 0.038, coordinates.y.sub(fill).abs())).mul(shadowMask);

  for (const name of rig.layerNames) {
    const layer = rig.getLayer(name);
    if (!layer) continue;
    const sample = texture(layer.texture);
    const material = layer.material as MeshBasicNodeMaterial;
    material.map = null;
    material.colorNode = mix(color(0x21163f), sample.rgb, fillMask)
      .add(color(0xaedcff).mul(fillEdge).mul(0.85));
    material.opacityNode = sample.a.mul(shadowMask).mul(opacity);
    material.needsUpdate = true;
  }
  return { shadow, fill, opacity };
}
