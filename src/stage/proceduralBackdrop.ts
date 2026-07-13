import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RingGeometry,
} from 'three/webgpu';
import { color, float, length, mx_noise_float, oneMinus, smoothstep, uniform, uv, vec2 } from 'three/tsl';

import { QUALITY_PROFILES, type QualityTier } from '../quality/qualityProfiles';
import { LAYER_ORDER } from './layerOrder';

const STAR_COUNT = QUALITY_PROFILES.high.backgroundStardust;

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ProceduralBackdrop {
  group: Group;
  update: (nowMs: number, quality: QualityTier) => void;
  dispose: () => void;
}

export function createProceduralBackdrop(): ProceduralBackdrop {
  const group = new Group();
  group.name = 'procedural-moonlight-backdrop';
  const geometries: BufferGeometry[] = [];
  const materials: Array<{ dispose: () => void }> = [];

  const moonGeometry = new PlaneGeometry(2.3, 2.3);
  const moonMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, side: DoubleSide });
  const moonRadius = length(uv().sub(vec2(0.5, 0.5)));
  moonMaterial.colorNode = color(0xcfd6ff);
  moonMaterial.opacityNode = oneMinus(smoothstep(float(0.22), float(0.5), moonRadius)).mul(0.72);
  const moon = new Mesh(moonGeometry, moonMaterial);
  moon.position.set(-3.25, 3.8, -3.5);
  moon.renderOrder = LAYER_ORDER.moonAndMist.min + 2;
  group.add(moon);
  geometries.push(moonGeometry);
  materials.push(moonMaterial);

  const ringGeometry = new RingGeometry(1.16, 1.22, 128);
  const ringMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, side: DoubleSide });
  ringMaterial.colorNode = color(0xa9bcff);
  ringMaterial.opacityNode = float(0.5);
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.position.copy(moon.position);
  ring.renderOrder = LAYER_ORDER.moonAndMist.min + 3;
  group.add(ring);
  geometries.push(ringGeometry);
  materials.push(ringMaterial);

  const random = mulberry32(0x4d4f4f4e);
  const starPositions = new Float32Array(STAR_COUNT * 3);
  for (let index = 0; index < STAR_COUNT; index += 1) {
    starPositions[index * 3] = (random() - 0.5) * 15;
    starPositions[index * 3 + 1] = random() * 7.5 - 0.2;
    starPositions[index * 3 + 2] = -1.5 - random() * 4;
  }
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute('position', new BufferAttribute(starPositions, 3));
  const starMaterial = new PointsMaterial({
    color: new Color(0xc7d5ff),
    size: 0.045,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const stars = new Points(starGeometry, starMaterial);
  stars.renderOrder = LAYER_ORDER.distant.min + 20;
  group.add(stars);
  geometries.push(starGeometry);
  materials.push(starMaterial);

  const mistLayers: Mesh[] = [];
  const mistTimes: Array<{ value: number }> = [];
  for (let index = 0; index < QUALITY_PROFILES.high.fogLayers; index += 1) {
    const geometry = new PlaneGeometry(12, 3.6);
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, side: DoubleSide });
    const coordinates = uv();
    const mistTime = uniform(0);
    const noise = mx_noise_float(coordinates.mul(3.2).add(vec2(mistTime.mul(0.018 + index * 0.006), float(index * 1.7))));
    const edge = smoothstep(float(0), float(0.2), coordinates.y)
      .mul(smoothstep(float(0), float(0.2), oneMinus(coordinates.y)))
      .mul(smoothstep(float(0), float(0.12), coordinates.x))
      .mul(smoothstep(float(0), float(0.12), oneMinus(coordinates.x)));
    material.colorNode = color(index % 2 === 0 ? 0x66518f : 0x3d4f86);
    material.opacityNode = noise.mul(0.5).add(0.5).mul(edge).mul(0.09 - index * 0.015);
    const mist = new Mesh(geometry, material);
    mist.position.set(index % 2 === 0 ? -0.8 : 1.2, 1.45 + index * 0.55, -1.4 - index * 0.65);
    mist.renderOrder = LAYER_ORDER.moonAndMist.min + 20 + index;
    group.add(mist);
    mistLayers.push(mist);
    mistTimes.push(mistTime);
    geometries.push(geometry);
    materials.push(material);
  }

  const groundGeometry = new CircleGeometry(4.8, 96);
  const groundMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, side: DoubleSide });
  const groundRadius = length(uv().sub(vec2(0.5, 0.5)));
  groundMaterial.colorNode = color(0x4a3982);
  groundMaterial.opacityNode = oneMinus(smoothstep(float(0.05), float(0.5), groundRadius)).mul(0.2);
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.renderOrder = LAYER_ORDER.distant.max;
  group.add(ground);
  geometries.push(groundGeometry);
  materials.push(groundMaterial);

  let activeQuality: QualityTier | undefined;
  const update = (nowMs: number, quality: QualityTier) => {
    mistTimes.forEach((control) => { control.value = nowMs / 1_000; });
    stars.rotation.z = Math.sin(nowMs * 0.000035) * 0.01;
    moon.rotation.z = Math.sin(nowMs * 0.00008) * 0.008;
    if (quality !== activeQuality) {
      activeQuality = quality;
      starGeometry.setDrawRange(0, QUALITY_PROFILES[quality].backgroundStardust);
      mistLayers.forEach((mist, index) => { mist.visible = index < QUALITY_PROFILES[quality].fogLayers; });
    }
  };

  return {
    group,
    update,
    dispose: () => {
      group.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
