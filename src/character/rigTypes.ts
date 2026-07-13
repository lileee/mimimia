import type { Group, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Texture, Vector3 } from 'three/webgpu';

export interface RigPoint {
  x: number;
  y: number;
}

export interface RigMotionRange {
  rotationDegrees: number;
  translateYPercent: number;
}

export interface RigLayerDefinition {
  name: string;
  path: string;
  pivot: RigPoint;
  zOrder: number;
  blendMode: 'normal' | 'additive';
  motionRange: RigMotionRange;
  parent?: string;
  defaultVisible?: boolean;
}

export interface RigDefinition {
  id: string;
  version: number;
  canvas: { width: number; height: number };
  origin: RigPoint;
  worldHeight: number;
  layers: RigLayerDefinition[];
  groupMotion?: { translateYPercent: number };
  sourceMaster?: string;
  sourceMasterSha256?: string;
  sourceCanvas?: { width: number; height: number };
  runtimeScale?: number;
}

export interface RigLayerMotion {
  rotationFraction: number;
  translateYFraction: number;
}

export interface RigLayerInstance {
  definition: RigLayerDefinition;
  pivot: Group;
  mesh: Mesh<PlaneGeometry, MeshBasicNodeMaterial>;
  material: MeshBasicNodeMaterial;
  texture: Texture;
  basePivotPosition: Vector3;
}

export interface LayeredSpriteRigOptions {
  renderOrderBase?: number;
}
