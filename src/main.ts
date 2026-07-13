import './styles.css';

import { isQualityTier } from './quality/qualityProfiles';
import { createRenderer } from './rendering/createRenderer';
import { Stage } from './stage/Stage';

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
    const renderFrame = async (nowMs: number) => {
      const deltaSeconds = Math.min(0.1, Math.max(0, (nowMs - previousTime) / 1000));
      previousTime = nowMs;
      stage.update({
        nowMs,
        deltaSeconds,
        state: 'idle',
        charge: 0,
        dissolve: 0,
        summon: 0,
        pointerNdc: { x: 0, y: 0 },
      }, quality);
      await handle.renderer.renderAsync(stage.scene, stage.cameraRig.camera);
      if (active) animationFrame = requestAnimationFrame(renderFrame);
    };
    stage.update({ nowMs: previousTime, deltaSeconds: 0, state: 'idle', charge: 0, dissolve: 0, summon: 0, pointerNdc: { x: 0, y: 0 } }, quality);
    await handle.renderer.renderAsync(stage.scene, stage.cameraRig.camera);
    canvas.dataset.renderReady = 'true';
    document.body.dataset.renderBackend = handle.backend;
    document.body.dataset.stageReady = 'true';
    document.body.dataset.characterReady = 'true';
    document.body.dataset.girlLayerCount = String(stage.magicalGirl?.layered.layerNames.length ?? 0);
    document.body.dataset.catLayerCount = String(stage.moonCat?.layered.layerNames.length ?? 0);
    document.body.dataset.catVisible = String(stage.moonCat?.root.visible ?? false);
    document.body.dataset.characterPose = debugCharacterPose;
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
