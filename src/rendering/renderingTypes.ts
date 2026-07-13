import type { WebGPURenderer } from 'three/webgpu';

import type { QualityTier } from '../quality/qualityProfiles';

export type BackendKind = 'webgpu' | 'webgl2';

export interface CreateRendererOptions {
  forceWebGL: boolean;
  quality: QualityTier;
}

export interface RendererHandle {
  renderer: WebGPURenderer;
  backend: BackendKind;
  resize: (cssWidth: number, cssHeight: number) => void;
  dispose: () => void;
}
