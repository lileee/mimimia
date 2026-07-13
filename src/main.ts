import './styles.css';

import { ASSET_MANIFEST } from './assets/assetManifest';
import { AssetLoader } from './assets/AssetLoader';
import { createExperience, type ExperienceRuntime } from './app/createExperience';
import { ExperienceController, type DebugFrameState } from './app/ExperienceController';
import { ReadinessGate } from './app/readinessGate';
import { isQualityTier, type QualityTier } from './quality/qualityProfiles';
import type { ExperienceState } from './state/experienceTypes';
import { AppUI } from './ui/AppUI';

const app = document.createElement('main');
app.id = 'app';

const sceneHost = document.createElement('div');
sceneHost.id = 'scene-canvas-host';
sceneHost.setAttribute('aria-hidden', 'true');

const canvas = document.createElement('canvas');
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
const requestedQuality = query.get('quality');
const quality: QualityTier = isQualityTier(requestedQuality) ? requestedQuality : 'high';
const forceWebGL = query.get('backend') === 'webgl2';
const holdBenchmarkGate = !debugMode && query.get('testGate') === 'benchmark';
const gate = new ReadinessGate();
const loader = new AssetLoader(ASSET_MANIFEST);
let loadProgress = 0;
let runtime: ExperienceRuntime | null = null;
let controller: ExperienceController | null = null;
let benchmarkReleaseRequested = !holdBenchmarkGate;
let disposed = false;

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
  return {
    state,
    charge: numberQuery('charge', state === 'charged' ? 1 : 0),
    dissolve: numberQuery('dissolve', 0),
    summon: numberQuery('summon', 0),
    pointerNdc: {
      x: Math.min(1, Math.max(-1, Number(query.get('pointerX')) || 0)),
      y: Math.min(1, Math.max(-1, Number(query.get('pointerY')) || 0)),
    },
  };
}

function startController(debug?: DebugFrameState): void {
  if (!runtime || controller || disposed) return;
  controller = new ExperienceController({ canvas, uiRoot, ui, runtime, quality, debugFrame: debug });
  document.body.dataset.renderBackend = runtime.renderer.backend;
  document.body.dataset.characterPose = query.get('characterPose') ?? 'idle';
  canvas.hidden = false;
  controller.start();
}

function releaseBenchmarkGate(): void {
  benchmarkReleaseRequested = true;
  gate.mark('benchmarkReady');
  if (runtime && gate.isReady()) startController();
  else renderLoading();
}

if (holdBenchmarkGate) {
  (window as typeof window & { __mimimiaReleaseGate?: () => void }).__mimimiaReleaseGate = releaseBenchmarkGate;
}

async function initialize(): Promise<void> {
  try {
    if (query.get('fault') === 'renderer-init') throw new Error('Injected renderer initialization failure');

    if (debugMode) {
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
      });
      startController(debugFrame());
      return;
    }

    const loaded = await loader.load((progress) => {
      loadProgress = progress;
      renderLoading();
    });
    if (loaded.status === 'aborted') return;
    if (loaded.status === 'critical-failure') {
      throw new Error(`Critical assets failed: ${loaded.failed.join(', ')}`);
    }
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
      onWarmupReady: () => {
        gate.mark('warmupReady');
        renderLoading();
      },
    });

    if (benchmarkReleaseRequested) gate.mark('benchmarkReady');
    if (gate.isReady()) startController();
    else renderLoading();
  } catch (error) {
    console.error('Moonlight scene initialization failed', error);
    runtime?.dispose();
    runtime = null;
    renderError('图形环境暂时不可用', '月光通路没有建立，请稍后重试。');
  }
}

window.addEventListener('pagehide', () => {
  disposed = true;
  loader.cancel();
  if (controller) controller.dispose();
  else runtime?.dispose();
}, { once: true });

void initialize();
