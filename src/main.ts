import './styles.css';

import { ASSET_MANIFEST } from './assets/assetManifest';
import { AssetLoader } from './assets/AssetLoader';
import type { AssetManifestEntry } from './assets/assetTypes';
import { createExperience, type ExperienceRuntime } from './app/createExperience';
import { ExperienceController, type DebugFrameState } from './app/ExperienceController';
import { ReadinessGate } from './app/readinessGate';
import { DebugPanel } from './dev/DebugPanel';
import { PerformanceSampler } from './performance/PerformanceSampler';
import { BenchmarkScene } from './quality/BenchmarkScene';
import { QualityController } from './quality/QualityController';
import { isQualityTier, type QualityTier } from './quality/qualityProfiles';
import { GraphicsRecovery, type GraphicsRendererPort } from './recovery/GraphicsRecovery';
import type { ExperienceState } from './state/experienceTypes';
import { AppUI } from './ui/AppUI';

const app = document.createElement('main');
app.id = 'app';

const sceneHost = document.createElement('div');
sceneHost.id = 'scene-canvas-host';
sceneHost.setAttribute('aria-hidden', 'true');

let canvas = document.createElement('canvas');
canvas.dataset.renderSurface = '';
sceneHost.append(canvas);

const uiRoot = document.createElement('section');
uiRoot.id = 'ui-root';
uiRoot.setAttribute('aria-live', 'polite');

app.append(sceneHost, uiRoot);
document.body.append(app);

const ui = new AppUI(uiRoot);
const query = __MIMIMIA_ALLOW_DEBUG_QUERY__ ? new URLSearchParams(window.location.search) : new URLSearchParams();
const debugMode = query.get('debug') === '1';
const visualTestMode = debugMode && query.get('visualTest') === '1';
const fault = query.get('fault');
const assetFault = fault === 'music' || fault === 'decorative' || fault === 'girl' || fault === 'cat';
const requestedQuality = query.get('quality');
const forcedQuality: QualityTier | null = isQualityTier(requestedQuality) ? requestedQuality : null;
let quality: QualityTier = forcedQuality ?? 'high';
const forceWebGL = query.get('backend') === 'webgl2';
const holdBenchmarkGate = !debugMode && query.get('testGate') === 'benchmark';
const gate = new ReadinessGate();
const faultAttempts = new Map<string, number>();
const loadManifest: readonly AssetManifestEntry[] = fault === 'decorative'
  ? [...ASSET_MANIFEST, {
    id: 'optional-debug-moon-glint',
    url: '/assets/optional/debug-moon-glint.json',
    kind: 'decoration',
    critical: false,
    bytes: 64,
    retryCount: 0,
  }]
  : ASSET_MANIFEST;
const faultFetcher: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const matches = (fault === 'music' && url.includes('ambient-moon-void'))
    || (fault === 'decorative' && url.includes('debug-moon-glint'))
    || (fault === 'girl' && url.includes('/magical-girl/rig.json'))
    || (fault === 'cat' && url.includes('/moon-cat/rig.json'));
  if (matches) {
    faultAttempts.set(fault, (faultAttempts.get(fault) ?? 0) + 1);
    return new Response(null, { status: 503 });
  }
  return globalThis.fetch(input, init);
};
const loader = new AssetLoader(loadManifest, assetFault ? { fetcher: faultFetcher } : undefined);
let loadProgress = 0;
let runtime: ExperienceRuntime | null = null;
let controller: ExperienceController | null = null;
let qualityController: QualityController | null = null;
let benchmarkScene: BenchmarkScene | null = null;
let graphicsRecovery: GraphicsRecovery | null = null;
const performanceSampler = new PerformanceSampler();
let assetCache: ReadonlyMap<string, Uint8Array> = new Map();
let rendererGeneration = 0;
const debugPanel = debugMode && !visualTestMode ? new DebugPanel() : null;
let benchmarkReleaseRequested = !holdBenchmarkGate;
let benchmarkCompleted = false;
let disposed = false;

class CriticalAssetError extends Error {
  readonly failed: readonly string[];

  constructor(failed: readonly string[]) {
    super(`Critical assets failed: ${failed.join(', ')}`);
    this.failed = failed;
  }
}

const renderLoading = () => {
  document.body.dataset.loadProgress = loadProgress >= 1 ? '1' : loadProgress.toFixed(4);
  document.body.dataset.experienceState = 'loading';
  ui.render({
    state: 'loading',
    progress: loadProgress,
    muted: true,
    quality,
    error: null,
    readyToEnter: false,
    calibrating: loadProgress >= 1 && !gate.isReady(),
  });
};

const renderError = (message: string, detail: string) => {
  canvas.hidden = true;
  document.body.dataset.experienceState = 'loading';
  ui.render({
    state: 'loading',
    progress: loadProgress,
    muted: true,
    quality,
    error: { message, detail, action: 'reload' },
  });
};

ui.setActionHandler((action) => {
  if (action === 'reload' || action === 'reenter') window.location.reload();
});
renderLoading();

function numberQuery(name: string, fallback: number): number {
  const value = Number(query.get(name));
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function debugFrame(): DebugFrameState {
  const value = query.get('experienceState');
  const state: ExperienceState = value === 'charging'
    || value === 'charged'
    || value === 'dissolving'
    || value === 'summoning'
    || value === 'complete'
    ? value
    : 'idle';
  const fixedTimeRaw = query.get('frameTimeMs');
  const fixedTime = fixedTimeRaw === null ? Number.NaN : Number(fixedTimeRaw);
  return {
    state,
    charge: numberQuery('charge', state === 'charged' ? 1 : 0),
    dissolve: numberQuery('dissolve', 0),
    summon: numberQuery('summon', 0),
    pointerNdc: {
      x: Math.min(1, Math.max(-1, Number(query.get('pointerX')) || 0)),
      y: Math.min(1, Math.max(-1, Number(query.get('pointerY')) || 0)),
    },
    fixedNowMs: Number.isFinite(fixedTime) ? Math.max(0, fixedTime) : undefined,
  };
}

function startController(debug?: DebugFrameState): void {
  if (!runtime || !qualityController || controller || disposed) return;
  controller = new ExperienceController({
    canvas,
    uiRoot,
    ui,
    runtime,
    qualityController,
    performanceSampler,
    debugPanel: debugPanel ?? undefined,
    debugFrame: debug,
    onRenderFailure: (error) => {
      if (graphicsRecovery) void graphicsRecovery.rebuild({
        api: 'RenderLoop',
        message: error instanceof Error ? error.message : String(error),
        reason: null,
        originalEvent: error,
      });
      else renderError('图形环境暂时不可用', '画面渲染中断，请重新加载。');
    },
  });
  document.body.dataset.renderBackend = runtime.renderer.backend;
  document.body.dataset.characterPose = query.get('characterPose') ?? 'idle';
  canvas.hidden = false;
  controller.start();
  setupGraphicsRecovery();
  if (query.get('performanceTest') === '1') {
    (window as typeof window & {
      __mimimiaPerformanceTest?: {
        snapshot: () => ReturnType<PerformanceSampler['getSnapshot']>;
        runtimeSnapshot: () => unknown;
      };
    }).__mimimiaPerformanceTest = {
      snapshot: () => performanceSampler.getSnapshot(),
      runtimeSnapshot: () => {
        const info = runtime?.renderer.renderer.info as unknown as {
          memory?: { geometries?: number; textures?: number };
          render?: { calls?: number; triangles?: number; points?: number; lines?: number };
        } | undefined;
        const memory = performance as Performance & { memory?: { usedJSHeapSize?: number } };
        return {
          backend: runtime?.renderer.backend ?? null,
          quality: qualityController?.getSnapshot().tier ?? quality,
          renderer: {
            geometries: info?.memory?.geometries ?? 0,
            textures: info?.memory?.textures ?? 0,
            calls: info?.render?.calls ?? 0,
            triangles: info?.render?.triangles ?? 0,
            points: info?.render?.points ?? 0,
            lines: info?.render?.lines ?? 0,
          },
          particles: runtime?.stage.particleSystem.getStats() ?? null,
          objects: performanceSampler.getSnapshot().objects,
          heapUsedBytes: memory.memory?.usedJSHeapSize ?? null,
          rendererGeneration,
        };
      },
    };
  }
}

function setupGraphicsRecovery(): void {
  if (!runtime || !controller || graphicsRecovery) return;
  rendererGeneration += 1;
  document.body.dataset.rendererGeneration = String(rendererGeneration);
  document.body.dataset.graphicsRecovery = 'healthy';
  graphicsRecovery = new GraphicsRecovery({
    canvas: () => canvas,
    getRenderer: () => runtime?.renderer.renderer as unknown as GraphicsRendererPort ?? null,
    rebuildRuntime: async () => {
      controller?.beginGraphicsRecovery();
      document.body.dataset.graphicsRecoveryStep = 'disposing';
      runtime?.dispose();
      document.body.dataset.graphicsRecoveryStep = 'disposed';
      runtime = null;
      if (fault === 'graphics-rebuild') {
        document.body.dataset.graphicsRecoveryStep = 'injected-failure';
        throw new Error('Injected graphics rebuild failure');
      }
      const tier = qualityController?.getSnapshot().tier ?? quality;
      const replacementCanvas = document.createElement('canvas');
      replacementCanvas.dataset.renderSurface = '';
      document.body.dataset.graphicsRecoveryStep = 'creating';
      const rebuilt = await createExperience({
        canvas: replacementCanvas,
        assets: assetCache,
        quality: tier,
        forceWebGL,
      });
      canvas.replaceWith(replacementCanvas);
      canvas = replacementCanvas;
      runtime = rebuilt;
      rendererGeneration += 1;
      document.body.dataset.rendererGeneration = String(rendererGeneration);
      document.body.dataset.renderBackend = rebuilt.renderer.backend;
      controller?.completeGraphicsRecovery(rebuilt, replacementCanvas);
      document.body.dataset.graphicsRecoveryStep = 'complete';
    },
    onLoss: () => controller?.beginGraphicsRecovery(),
    onStateChange: (snapshot) => {
      document.body.dataset.graphicsRecovery = snapshot.status;
      document.body.dataset.graphicsRebuildCount = String(snapshot.rebuildCount);
      document.body.dataset.graphicsRecoveryError = snapshot.lastError ?? '';
    },
    onFailure: () => controller?.failGraphicsRecovery(),
  });
  graphicsRecovery.watch();

  if (query.get('recoveryTest') === '1') {
    (window as typeof window & {
      __mimimiaGraphicsTest?: {
        loseDevice: () => void;
        snapshot: () => ReturnType<GraphicsRecovery['getSnapshot']>;
      };
    }).__mimimiaGraphicsTest = {
      loseDevice: () => runtime?.renderer.renderer.onDeviceLost({
        api: 'WebGPU',
        message: 'Injected device loss',
        reason: 'unknown',
        originalEvent: null,
      }),
      snapshot: () => {
        if (!graphicsRecovery) throw new Error('Graphics recovery unavailable');
        return graphicsRecovery.getSnapshot();
      },
    };
  }
}

function releaseBenchmarkGate(): void {
  benchmarkReleaseRequested = true;
  if (benchmarkCompleted) gate.mark('benchmarkReady');
  if (runtime && gate.isReady()) startController();
  else renderLoading();
}

if (holdBenchmarkGate) {
  (window as typeof window & { __mimimiaReleaseGate?: () => void }).__mimimiaReleaseGate = releaseBenchmarkGate;
}

async function initialize(): Promise<void> {
  try {
    if (fault === 'renderer-init') throw new Error('Injected renderer initialization failure');

    if (debugMode && !assetFault) {
      loadProgress = 1;
      document.body.dataset.loadProgress = '1';
      const characterPose = query.get('characterPose');
      runtime = await createExperience({
        canvas,
        assets: new Map(),
        quality,
        forceWebGL,
        characterPose: characterPose === 'min' || characterPose === 'max' ? characterPose : 'idle',
        showCat: query.get('showCat') === '1',
        hideParticles: visualTestMode && query.get('hideParticles') === '1',
      });
      assetCache = new Map();
      qualityController = new QualityController({
        benchmark: { run: async () => 60 },
        initialTier: quality,
        forcedMode: true,
      });
      document.body.dataset.qualityTier = quality;
      document.body.dataset.qualityForced = 'true';
      startController(debugFrame());
      return;
    }

    const loaded = await loader.load((progress) => {
      loadProgress = progress;
      renderLoading();
    });
    document.body.dataset.assetMuted = String(loaded.muted);
    document.body.dataset.assetSkipped = loaded.skipped.join(',');
    document.body.dataset.assetFailed = loaded.failed.join(',');
    document.body.dataset.faultAttempts = String(fault ? faultAttempts.get(fault) ?? 0 : 0);
    if (loaded.status === 'aborted') return;
    if (loaded.status === 'critical-failure') {
      throw new CriticalAssetError(loaded.failed);
    }
    assetCache = loaded.assets;
    gate.mark('assetsReady');
    renderLoading();

    runtime = await createExperience({
      canvas,
      assets: loaded.assets,
      quality,
      forceWebGL,
      onRendererReady: (handle) => {
        gate.mark('rendererReady');
        document.body.dataset.renderBackend = handle.backend;
        renderLoading();
      },
      onWarmupReady: (report) => {
        gate.mark('warmupReady');
        document.body.dataset.warmupReady = String(report.ready);
        document.body.dataset.warmupFrameCount = String(report.frameCount);
        document.body.dataset.warmupStates = report.states.join(',');
        renderLoading();
      },
    });

    const benchmarkFpsRaw = query.get('benchmarkFps');
    const benchmarkFpsValue = benchmarkFpsRaw === null ? Number.NaN : Number(benchmarkFpsRaw);
    benchmarkScene = new BenchmarkScene({
      runtime,
      fpsOverride: Number.isFinite(benchmarkFpsValue) && benchmarkFpsValue >= 0 ? benchmarkFpsValue : undefined,
    });
    qualityController = new QualityController({
      benchmark: benchmarkScene,
      initialTier: quality,
      forcedMode: forcedQuality !== null,
    });
    document.body.dataset.qualityBenchmark = forcedQuality === null ? 'running' : 'forced';
    quality = await qualityController.runInitialBenchmark();
    runtime.setQuality(quality);
    benchmarkCompleted = true;
    document.body.dataset.qualityBenchmark = forcedQuality === null ? 'complete' : 'forced';
    document.body.dataset.qualityBenchmarkDuration = benchmarkScene.getLastDurationMs().toFixed(1);
    document.body.dataset.qualityTier = quality;
    document.body.dataset.qualityForced = String(forcedQuality !== null);
    if (query.get('qualityTest') === '1') {
      (window as typeof window & {
        __mimimiaQualityTest?: {
          requestDowngrade: () => void;
          snapshot: () => ReturnType<QualityController['getSnapshot']>;
        };
      }).__mimimiaQualityTest = {
        requestDowngrade: () => qualityController?.requestDowngrade(),
        snapshot: () => {
          if (!qualityController) throw new Error('Quality unavailable');
          return qualityController.getSnapshot();
        },
      };
    }
    if (benchmarkReleaseRequested) gate.mark('benchmarkReady');
    if (gate.isReady()) startController();
    else renderLoading();
  } catch (error) {
    console.error('Moonlight scene initialization failed', error);
    runtime?.dispose();
    runtime = null;
    if (error instanceof CriticalAssetError) {
      renderError('月光使者未能抵达', '已自动重试一次，角色资源仍未能载入。');
    } else {
      renderError('图形环境暂时不可用', '月光通路没有建立，请稍后重试。');
    }
  }
}

window.addEventListener('pagehide', () => {
  disposed = true;
  loader.cancel();
  benchmarkScene?.cancel();
  graphicsRecovery?.dispose();
  if (controller) controller.dispose();
  else runtime?.dispose();
  debugPanel?.dispose();
}, { once: true });

void initialize();
