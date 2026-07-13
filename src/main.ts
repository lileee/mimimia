import './styles.css';

import { isQualityTier } from './quality/qualityProfiles';
import { createRenderer } from './rendering/createRenderer';

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
let disposeRenderer: (() => void) | undefined;

async function initializeRenderer() {
  try {
    if (query.get('fault') === 'renderer-init') throw new Error('Injected renderer initialization failure');
    const handle = await createRenderer(canvas, { forceWebGL, quality });
    const resize = () => handle.resize(window.innerWidth, window.innerHeight);
    resize();
    canvas.dataset.renderReady = 'true';
    document.body.dataset.renderBackend = handle.backend;
    status.textContent = '月光虚境已就绪';
    window.addEventListener('resize', resize);
    disposeRenderer = () => {
      window.removeEventListener('resize', resize);
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
