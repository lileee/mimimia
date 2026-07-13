import { WebGPURenderer } from 'three/webgpu';

import { QUALITY_PROFILES } from '../quality/qualityProfiles';
import type { BackendKind, CreateRendererOptions, RendererHandle } from './renderingTypes';

const CLEAR_COLOR = 0x120a2d;

interface DetectableBackend {
  isWebGPUBackend?: boolean;
  isWebGLBackend?: boolean;
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  options: CreateRendererOptions,
): Promise<RendererHandle> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: false,
    forceWebGL: options.forceWebGL,
  });
  await renderer.init();

  const detected = renderer.backend as DetectableBackend;
  let backend: BackendKind;
  if (detected.isWebGPUBackend === true) backend = 'webgpu';
  else if (detected.isWebGLBackend === true) backend = 'webgl2';
  else {
    renderer.dispose();
    throw new Error('Renderer initialized without a recognized backend');
  }

  const profile = QUALITY_PROFILES[options.quality];
  const resize = (cssWidth: number, cssHeight: number) => {
    const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, profile.pixelRatioMax);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(
      Math.max(1, Math.round(cssWidth * profile.renderScale)),
      Math.max(1, Math.round(cssHeight * profile.renderScale)),
      false,
    );
    renderer.clear(true, true, true);
  };

  renderer.setClearColor(CLEAR_COLOR, 1);

  return {
    renderer,
    backend,
    resize,
    dispose: () => renderer.dispose(),
  };
}
