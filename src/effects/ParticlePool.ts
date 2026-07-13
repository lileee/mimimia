export interface ParticlePoolStats {
  capacity: number;
  activeCount: number;
  allocatedObjects: number;
}

export class ParticlePool<T extends object | number> {
  readonly #items: T[];
  readonly #free: T[];
  readonly #active: T[] = [];
  readonly #activeSet = new Set<T>();

  constructor(capacity: number, factory: (index: number) => T) {
    this.#items = Array.from({ length: Math.max(0, Math.floor(capacity)) }, (_, index) => factory(index));
    this.#free = [...this.#items].reverse();
  }

  acquire(): T | null {
    const item = this.#free.pop();
    if (item === undefined) return null;
    this.#active.push(item);
    this.#activeSet.add(item);
    return item;
  }

  release(item: T): void {
    if (!this.#activeSet.delete(item)) return;
    const index = this.#active.indexOf(item);
    if (index >= 0) this.#active.splice(index, 1);
    this.#free.push(item);
  }

  setActiveCount(count: number): void {
    const target = Math.min(this.#items.length, Math.max(0, Math.floor(count)));
    while (this.#active.length < target) this.acquire();
    while (this.#active.length > target) this.release(this.#active[this.#active.length - 1]);
  }

  releaseAll(): void {
    while (this.#active.length > 0) this.release(this.#active[this.#active.length - 1]);
  }

  getStats(): ParticlePoolStats {
    return {
      capacity: this.#items.length,
      activeCount: this.#active.length,
      allocatedObjects: this.#items.length,
    };
  }
}
