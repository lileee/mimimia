export interface PerformanceValidityContext {
  visible: boolean;
  focused: boolean;
  graphicsHealthy: boolean;
  state?: string;
}

export interface RuntimeObjectStats {
  geometries: number;
  materials: number;
  textures: number;
  sceneObjects: number;
  poolCapacity: number;
}

export interface PerformanceSnapshot {
  active: boolean;
  complete: boolean;
  summonCount: number;
  sampleCount: number;
  averageFps: number;
  onePercentLowFps: number;
  maxFrameGapMs: number;
  maxFrameGapState: string | null;
  maxWorkMs: number;
  maxWorkPhase: string | null;
  maxWorkState: string | null;
  passesStallBudget: boolean;
  startedAt: number | null;
  endedAt: number | null;
  objects: RuntimeObjectStats | null;
}

export interface WarmupReport {
  ready: boolean;
  frameCount: number;
  states: Array<'idle' | 'charged' | 'dissolving' | 'summoning' | 'complete'>;
}
