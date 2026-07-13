const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export class LoadingView {
  readonly element = element('section', 'loading-view');
  readonly actionHost = element('div', 'entry-actions');
  readonly #moon = element('div', 'loading-moon');
  readonly #percent = element('strong', 'loading-percent', '0%');
  readonly #status = element('p', 'loading-status', '正在收拢星尘');
  readonly #meterFill = element('span', 'loading-meter-fill');

  constructor() {
    this.element.dataset.testid = 'loading-view';
    this.#percent.dataset.testid = 'loading-percent';
    this.#status.dataset.testid = 'loading-status';
    this.#moon.setAttribute('aria-hidden', 'true');

    const orbit = element('div', 'loading-orbit');
    const moonLight = element('span', 'loading-moon-light');
    const moonShade = element('span', 'loading-moon-shade');
    this.#moon.append(moonLight, moonShade);
    orbit.append(this.#moon);

    const phases = element('div', 'phase-scale');
    phases.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 8; index += 1) {
      const phase = element('i', 'phase-mark');
      phase.style.setProperty('--phase-index', String(index));
      phases.append(phase);
    }

    const meter = element('div', 'loading-meter');
    meter.append(this.#meterFill);
    const copy = element('div', 'loading-copy');
    const label = element('span', 'loading-label', 'MOON PHASE ALIGNMENT');
    copy.append(label, this.#percent, this.#status, meter, phases, this.actionHost);
    this.element.append(orbit, copy);
  }

  render(progress: number, calibrating: boolean): void {
    const amount = clamp01(progress);
    const percent = Math.round(amount * 100);
    this.element.style.setProperty('--load-progress', amount.toFixed(4));
    this.#percent.textContent = `${percent}%`;
    this.#meterFill.style.width = `${percent}%`;
    this.#status.textContent = calibrating ? '正在校准月光' : '正在收拢星尘';
    this.element.setAttribute('aria-label', calibrating ? '资源加载完成，正在校准月光' : `正在加载，${percent}%`);
  }
}
