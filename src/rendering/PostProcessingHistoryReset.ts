export class PostProcessingHistoryReset {
  #pending = false;

  request(): void {
    this.#pending = true;
  }

  consume(): boolean {
    const pending = this.#pending;
    this.#pending = false;
    return pending;
  }
}
