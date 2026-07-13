import type { QualityTier } from '../quality/qualityProfiles';
import { LoadingView } from './LoadingView';
import type { UIAction, UIActionHandler, UIRenderState } from './uiTypes';

const QUALITY_LABELS: Readonly<Record<QualityTier, string>> = {
  high: '高画质',
  balanced: '均衡画质',
  compatibility: '兼容画质',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function button(className: string, testId: string, action: UIAction, text: string): HTMLButtonElement {
  const node = element('button', className, text);
  node.type = 'button';
  node.dataset.testid = testId;
  node.dataset.action = action;
  return node;
}

export class AppUI {
  readonly #root: HTMLElement;
  readonly #loading = new LoadingView();
  readonly #entryButton = button('ritual-button enter-button', 'enter-button', 'enter', '月光尚未汇聚');
  readonly #qualityBadge = element('div', 'quality-badge');
  readonly #runtimeBrand = element('div', 'runtime-brand');
  readonly #hint = element('p', 'first-hint', '按住鼠标，凝聚月光。');
  readonly #soundButton = button('round-control sound-button', 'sound-button', 'mute', '声音');
  readonly #resetButton = button('ritual-button reset-button', 'reset-button', 'reset', '再次施法');
  readonly #qualityNotice = element('div', 'quality-notice');
  readonly #errorPanel = element('section', 'error-panel');
  readonly #errorMessage = element('h2', 'error-message');
  readonly #errorDetail = element('p', 'error-detail');
  readonly #errorButton = button('ritual-button error-button', 'reload-button', 'reload', '重新加载');
  #handler: UIActionHandler = () => undefined;

  constructor(root: HTMLElement) {
    this.#root = root;
    this.#root.className = 'app-ui';

    const entryKicker = element('p', 'entry-kicker', 'LUNAR FAMILIAR RITE · M—01');
    const entryTitle = element('h1', 'entry-title');
    entryTitle.append(element('span', '', '月辉'), element('span', '', '灵猫召唤'));
    const entryCopy = element('p', 'entry-copy', '以指尖聚拢月相，让沉睡的星光回应。');
    this.#qualityBadge.dataset.testid = 'quality-badge';
    this.#loading.actionHost.append(entryCopy, this.#qualityBadge, this.#entryButton);
    this.#loading.element.prepend(entryKicker, entryTitle);

    this.#runtimeBrand.dataset.testid = 'runtime-brand';
    this.#runtimeBrand.append(
      element('span', 'runtime-brand-cn', '月相仪式'),
      element('span', 'runtime-brand-en', 'MOON / M—01'),
    );
    this.#hint.dataset.testid = 'first-hint';
    this.#qualityNotice.dataset.testid = 'quality-notice';

    this.#errorPanel.dataset.renderError = '';
    this.#errorPanel.append(
      element('span', 'error-sigil', '○'),
      this.#errorMessage,
      this.#errorDetail,
      this.#errorButton,
    );

    this.#root.append(
      this.#loading.element,
      this.#runtimeBrand,
      this.#hint,
      this.#soundButton,
      this.#resetButton,
      this.#qualityNotice,
      this.#errorPanel,
    );
    this.#root.addEventListener('click', this.#onClick);
  }

  setActionHandler(handler: UIActionHandler): void {
    this.#handler = handler;
  }

  render(model: UIRenderState): void {
    const isError = model.error !== null;
    const isLoading = model.state === 'loading';
    const isEntry = model.state === 'entry';
    const isRuntime = !isLoading && !isEntry && !isError;
    const isComplete = model.state === 'complete';

    this.#root.hidden = model.debugHidden === true && !isError;
    this.#root.dataset.state = model.state;
    this.#loading.element.hidden = isError || (!isLoading && !isEntry);
    this.#loading.render(model.progress, model.calibrating === true);
    this.#loading.element.classList.toggle('is-entry', isEntry);

    this.#entryButton.hidden = !isLoading && !isEntry;
    this.#entryButton.disabled = !isEntry || model.readyToEnter !== true;
    this.#entryButton.textContent = isEntry ? '进入月光虚境' : model.calibrating ? '月光校准中' : '月光尚未汇聚';

    this.#qualityBadge.textContent = `当前 · ${QUALITY_LABELS[model.quality]}`;
    this.#qualityBadge.hidden = !isEntry;
    this.#runtimeBrand.hidden = !isRuntime || isComplete;
    this.#hint.hidden = !isRuntime || model.hintVisible !== true || isComplete;
    this.#soundButton.hidden = !isRuntime;
    this.#soundButton.classList.toggle('is-muted', model.muted);
    this.#soundButton.textContent = model.muted ? '静音' : '声音';
    this.#soundButton.setAttribute('aria-pressed', String(model.muted));
    this.#soundButton.setAttribute('aria-label', model.muted ? '开启声音' : '关闭声音');
    this.#resetButton.hidden = !isComplete;

    this.#qualityNotice.textContent = `画质已调整为 ${QUALITY_LABELS[model.quality]}`;
    this.#qualityNotice.hidden = model.qualityNotice !== true || !isRuntime || isComplete;

    this.#errorPanel.hidden = !isError;
    if (model.error) {
      this.#root.hidden = false;
      this.#errorMessage.textContent = model.error.message;
      this.#errorDetail.textContent = model.error.detail ?? '月光通路没有建立，请重新尝试。';
      this.#errorButton.dataset.action = model.error.action;
      this.#errorButton.dataset.testid = model.error.action === 'reload' ? 'reload-button' : 'reenter-button';
      this.#errorButton.textContent = model.error.action === 'reload' ? '重新加载' : '重新进入';
    }
  }

  dispose(): void {
    this.#root.removeEventListener('click', this.#onClick);
    this.#root.replaceChildren();
  }

  readonly #onClick = (event: MouseEvent): void => {
    const target = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-action]');
    if (!target || target.disabled) return;
    event.stopPropagation();
    this.#handler(target.dataset.action as UIAction);
  };
}
