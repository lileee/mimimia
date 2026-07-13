import { PerspectiveCamera, Vector3 } from 'three/webgpu';

import { EXPERIENCE_TIMING } from '../config/experience';

const BASE_POSITION = new Vector3(0, 3.4, 9);
const TARGET = new Vector3(0, 1.65, 0);
const BASE_OFFSET = BASE_POSITION.clone().sub(TARGET);
const LANDSCAPE_FIT_SCALE = 1.34;
const REFERENCE_ASPECT = 1440 / 900;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export interface CameraSafeFrame {
  hatTip: { x: number; y: number };
  shoeBottom: { x: number; y: number };
  faceCenter: { x: number; y: number };
  magicCircleCenter: { x: number; y: number };
  magicCircleTop: { x: number; y: number };
  waistCenter: { x: number; y: number };
  chestCenter: { x: number; y: number };
  moonCenter: { x: number; y: number };
  catCenter: { x: number; y: number };
  leftEdge: { x: number; y: number };
  rightEdge: { x: number; y: number };
}

export class CameraRig {
  readonly camera = new PerspectiveCamera(32, 16 / 9, 0.1, 100);
  readonly baselinePosition = BASE_POSITION.clone();
  readonly target = TARGET.clone();
  #fitScale = LANDSCAPE_FIT_SCALE;
  #responseScale = 1;

  constructor() {
    this.camera.position.copy(BASE_POSITION);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  resize(width: number, height: number): void {
    const aspect = Math.max(0.1, width / Math.max(1, height));
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.#fitScale = LANDSCAPE_FIT_SCALE * Math.max(1, REFERENCE_ASPECT / aspect);
    this.#applyPosition();
  }

  reset(): void {
    this.#responseScale = 1;
    this.#applyPosition();
  }

  setChargeProgress(progress: number): void {
    const start = EXPERIENCE_TIMING.chargePhase2End;
    const approach = smoothstep((clamp01(progress) - start) / (1 - start));
    this.#responseScale = 1 - approach * 0.04;
    this.#applyPosition();
  }

  setDissolveProgress(progress: number): void {
    this.#responseScale = 0.96 + smoothstep(progress) * 0.04;
    this.#applyPosition();
  }

  setSummonProgress(progress: number): void {
    const hold = EXPERIENCE_TIMING.releaseHoldMs / EXPERIENCE_TIMING.summonEndMs;
    const normalized = clamp01((progress - hold) / (1 - hold));
    this.#responseScale = 1 - Math.sin(Math.PI * normalized) * 0.015;
    this.#applyPosition();
  }

  distanceToTarget(): number {
    return this.camera.position.distanceTo(this.target);
  }

  getSafeFrame(width: number, height: number): CameraSafeFrame {
    const project = (point: Vector3) => {
      const ndc = point.clone().project(this.camera);
      return { x: (ndc.x + 1) * 0.5 * width, y: (1 - ndc.y) * 0.5 * height };
    };
    return {
      hatTip: project(new Vector3(0, 4.8, 0)),
      shoeBottom: project(new Vector3(0, 0, 0)),
      faceCenter: project(new Vector3(0, 3.55, 0)),
      magicCircleCenter: project(new Vector3(0, 0.02, 0)),
      magicCircleTop: project(new Vector3(0, 2.235, 0)),
      waistCenter: project(new Vector3(0, 2.45, 0)),
      chestCenter: project(new Vector3(0, 2.95, 0)),
      moonCenter: project(new Vector3(-3.25, 3.8, -3.5)),
      catCenter: project(new Vector3(1.28, 3.02, 0)),
      leftEdge: project(new Vector3(-1.65, 2.4, 0)),
      rightEdge: project(new Vector3(1.65, 2.4, 0)),
    };
  }

  #applyPosition(): void {
    this.camera.position.copy(this.target).add(BASE_OFFSET.clone().multiplyScalar(this.#fitScale * this.#responseScale));
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
}
