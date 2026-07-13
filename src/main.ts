import './styles.css';

import { isQualityTier } from './quality/qualityProfiles';
import { createRenderer } from './rendering/createRenderer';
import { Stage } from './stage/Stage';
import type { ExperienceState } from './state/experienceTypes';

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

const status = document.createElement('p');
status.className = 'preparation-status';
status.textContent = '月光虚境正在准备';

uiRoot.append(status);
app.append(sceneHost, uiRoot);
document.body.append(app);

const query = __MIMIMIA_ALLOW_DEBUG_QUERY__ ? new URLSearchParams(window.location.search) : new URLSearchParams();
const qualityValue = query.get('quality');
const quality = isQualityTier(qualityValue) ? qualityValue : 'high';
const forceWebGL = query.get('backend') === 'webgl2';
const characterPose = query.get('characterPose');
const debugCharacterPose = characterPose === 'min' || characterPose === 'max' ? characterPose : 'idle';
const experienceStateValue = query.get('experienceState');
const debugExperienceState: ExperienceState = experienceStateValue === 'charging'
  || experienceStateValue === 'charged'
  || experienceStateValue === 'dissolving'
  || experienceStateValue === 'summoning'
  ? experienceStateValue
  : 'idle';
const numberQuery = (name: string, fallback: number) => {
  const value = Number(query.get(name));
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
};
const debugCharge = numberQuery('charge', debugExperienceState === 'charged' ? 1 : 0);
const debugDissolve = numberQuery('dissolve', 0);
const debugSummon = numberQuery('summon', 0);
let disposeRenderer: (() => void) | undefined;

async function initializeRenderer() {
  try {
    if (query.get('fault') === 'renderer-init') throw new Error('Injected renderer initialization failure');
    const handle = await createRenderer(canvas, { forceWebGL, quality });
    const stage = new Stage({
      characterPose: debugCharacterPose,
      showCat: query.get('showCat') === '1',
    });
    await stage.loadCharacters();
    const resize = () => {
      handle.resize(window.innerWidth, window.innerHeight);
      stage.resize(window.innerWidth, window.innerHeight);
      canvas.dataset.safeFrame = JSON.stringify(stage.cameraRig.getSafeFrame(window.innerWidth, window.innerHeight));
    };
    resize();
    let previousTime = performance.now();
    let animationFrame = 0;
    let active = true;
    const makeSignals = (nowMs: number, deltaSeconds: number) => ({
      nowMs,
      deltaSeconds,
      state: debugExperienceState,
      charge: debugCharge,
      dissolve: debugDissolve,
      summon: debugSummon,
      pointerNdc: { x: 0, y: 0 },
    });
    const renderFrame = async (nowMs: number) => {
      const deltaSeconds = Math.min(0.1, Math.max(0, (nowMs - previousTime) / 1000));
      previousTime = nowMs;
      stage.update(makeSignals(nowMs, deltaSeconds), quality);
      canvas.dataset.magicCircle = JSON.stringify(stage.magicCircle.getSnapshot());
      await handle.renderer.renderAsync(stage.scene, stage.cameraRig.camera);
      if (active) animationFrame = requestAnimationFrame(renderFrame);
    };
    stage.update(makeSignals(previousTime, 0), quality);
    canvas.dataset.magicCircle = JSON.stringify(stage.magicCircle.getSnapshot());
    await handle.renderer.renderAsync(stage.scene, stage.cameraRig.camera);
    canvas.dataset.renderReady = 'true';
    document.body.dataset.renderBackend = handle.backend;
    document.body.dataset.stageReady = 'true';
    document.body.dataset.characterReady = 'true';
    document.body.dataset.girlLayerCount = String(stage.magicalGirl?.layered.layerNames.length ?? 0);
    document.body.dataset.catLayerCount = String(stage.moonCat?.layered.layerNames.length ?? 0);
    document.body.dataset.catVisible = String(stage.moonCat?.root.visible ?? false);
    document.body.dataset.characterPose = debugCharacterPose;
    document.body.dataset.magicCircleReady = 'true';
    status.textContent = '月光虚境已就绪';
    animationFrame = requestAnimationFrame(renderFrame);
    window.addEventListener('resize', resize);
    disposeRenderer = () => {
      active = false;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      stage.dispose();
      handle.dispose();
    };
  } catch {
    canvas.hidden = true;
    status.dataset.renderError = '';
    status.textContent = '图形环境暂时不可用，请稍后重试';
  }
}

window.addEventListener('pagehide', () => disposeRenderer?.(), { once: true });
void initializeRenderer();
