import type {
  PerformanceSnapshot,
  PerformanceValidityContext,
  RuntimeObjectStats,
} from './performanceTypes';

const STALL_BUDGET_MS = 500;

export interface RuntimeSceneObject {
  geometry?: object;
  material?: object | object[];
}

export interface RuntimeObjectSource {
  sceneObjects: RuntimeSceneObject[];
  rendererInfo?: { memory?: { geometries?: number; textures?: number } };
  poolCapacity: number;
}

function textureLikeValues(material: object): object[] {
  const output: object[] = [];
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && ('isTexture' in value || /map$/iu.test(
      Object.entries(material).find(([, candidate]) => candidate === value)?.[0] ?? '',
    ))) output.push(value);
  }
  return output;
}

export function countRuntimeObjects(source: RuntimeObjectSource): RuntimeObjectStats {
  const geometries = new Set<object>();
  const materials = new Set<object>();
  const textures = new Set<object>();
  for (const object of source.sceneObjects) {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of objectMaterials) {
      materials.add(material);
      for (const texture of textureLikeValues(material)) textures.add(texture);
    }
  }
  return {
    geometries: Math.max(geometries.size, source.rendererInfo?.memory?.geometries ?? 0),
    materials: materials.size,
    textures: Math.max(textures.size, source.rendererInfo?.memory?.textures ?? 0),
    sceneObjects: source.sceneObjects.length,
    poolCapacity: source.poolCapacity,
  };
}

export class PerformanceSampler {
  #active = false;
  #complete = false;
  #summonCount = 0;
  #startedAt: number | null = null;
  #endedAt: number | null = null;
  #lastFrameAt: number | null = null;
  #lastFrameState: string | null = null;
  #intervals: Array<{ durationMs: number; state: string | null }> = [];
  #objects: RuntimeObjectStats | null = null;
  #maxWork = { durationMs: 0, phase: null as string | null, state: null as string | null };

  beginProfile(nowMs: number): void {
    if (this.#active || this.#complete) return;
    this.#active = true;
    this.#summonCount = 0;
    this.#startedAt = nowMs;
    this.#endedAt = null;
    this.#lastFrameAt = nowMs;
    this.#lastFrameState = 'pointer-down';
    this.#intervals = [];
    this.#maxWork = { durationMs: 0, phase: null, state: null };
  }

  observeFrame(nowMs: number, context: PerformanceValidityContext): void {
    if (!this.#active) return;
    const valid = context.visible && context.focused && context.graphicsHealthy;
    if (!valid || !Number.isFinite(nowMs) || (this.#lastFrameAt !== null && nowMs < this.#lastFrameAt)) {
      this.clearSamples();
      return;
    }
    if (this.#lastFrameAt !== null && nowMs > this.#lastFrameAt) {
      this.#intervals.push({ durationMs: nowMs - this.#lastFrameAt, state: this.#lastFrameState ?? context.state ?? null });
    }
    this.#lastFrameAt = nowMs;
    this.#lastFrameState = context.state ?? null;
  }

  markSummonComplete(nowMs: number): void {
    if (!this.#active) return;
    this.#summonCount += 1;
    if (this.#summonCount < 3) return;
    this.#active = false;
    this.#complete = true;
    this.#endedAt = nowMs;
    this.#lastFrameAt = null;
    this.#lastFrameState = null;
  }

  clearSamples(): void {
    this.#intervals = [];
    this.#lastFrameAt = null;
    this.#lastFrameState = null;
  }

  recordFrameWork(state: string, phases: Readonly<Record<string, number>>): void {
    if (!this.#active) return;
    for (const [phase, durationMs] of Object.entries(phases)) {
      if (durationMs <= this.#maxWork.durationMs) continue;
      this.#maxWork = { durationMs, phase, state };
    }
  }

  setObjectStats(stats: RuntimeObjectStats): void {
    this.#objects = { ...stats };
  }

  getSnapshot(): PerformanceSnapshot {
    const sortedWorstFirst = [...this.#intervals].sort((a, b) => b.durationMs - a.durationMs);
    const lowCount = Math.max(1, Math.ceil(sortedWorstFirst.length * 0.01));
    const lowIntervals = sortedWorstFirst.slice(0, lowCount);
    const intervalTotal = this.#intervals.reduce((total, value) => total + value.durationMs, 0);
    const lowTotal = lowIntervals.reduce((total, value) => total + value.durationMs, 0);
    const maxFrameGapMs = sortedWorstFirst[0]?.durationMs ?? 0;
    return {
      active: this.#active,
      complete: this.#complete,
      summonCount: this.#summonCount,
      sampleCount: this.#intervals.length,
      averageFps: intervalTotal > 0 ? this.#intervals.length * 1_000 / intervalTotal : 0,
      onePercentLowFps: lowTotal > 0 ? lowIntervals.length * 1_000 / lowTotal : 0,
      maxFrameGapMs,
      maxFrameGapState: sortedWorstFirst[0]?.state ?? null,
      maxWorkMs: this.#maxWork.durationMs,
      maxWorkPhase: this.#maxWork.phase,
      maxWorkState: this.#maxWork.state,
      passesStallBudget: maxFrameGapMs < STALL_BUDGET_MS,
      startedAt: this.#startedAt,
      endedAt: this.#endedAt,
      objects: this.#objects ? { ...this.#objects } : null,
    };
  }
}
