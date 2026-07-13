import { AdditiveBlending, LineBasicNodeMaterial } from 'three/webgpu';
import { attribute, color, oneMinus, smoothstep, uniform } from 'three/tsl';

export interface MagicCircleNodeControls {
  progress: { value: number };
  opacity: { value: number };
  brightness: { value: number };
}

export function createMagicCircleNodeMaterial(hexColor: number): {
  material: LineBasicNodeMaterial;
  controls: MagicCircleNodeControls;
} {
  const progress = uniform(0);
  const opacity = uniform(0);
  const brightness = uniform(1);
  const arc = attribute<'float'>('arcProgress', 'float');
  const draw = oneMinus(smoothstep(progress, progress.add(0.025), arc));
  const material = new LineBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });
  material.colorNode = color(hexColor).mul(brightness);
  material.opacityNode = draw.mul(opacity);
  return { material, controls: { progress, opacity, brightness } };
}
