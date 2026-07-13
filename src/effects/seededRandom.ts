export function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ParticleLayoutPoint {
  origin: readonly [number, number, number];
  target: readonly [number, number, number];
  seed: number;
  size: number;
}

export function createParticleLayout(count: number, seed: number): ParticleLayoutPoint[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const angle = random() * Math.PI * 2;
    const phaseOneParticle = index < Math.ceil(count * 0.14);
    const radius = phaseOneParticle ? 0.32 + random() * 0.82 : 2.55 + random() * 3.9;
    const origin: readonly [number, number, number] = phaseOneParticle
      ? [Math.cos(angle) * radius, 0.08 + random() * 0.58, Math.sin(angle) * radius * 0.42]
      : [Math.cos(angle) * radius, 0.15 + random() * 5.15, Math.sin(angle) * (0.8 + random() * 1.2)];

    const targetAngle = random() * Math.PI * 2;
    const targetRadius = 0.12 + random() * 0.62;
    let target: readonly [number, number, number];
    if (phaseOneParticle || index % 3 === 1) {
      target = [
        Math.cos(targetAngle) * targetRadius,
        0.09 + random() * 0.62,
        Math.sin(targetAngle) * targetRadius * 0.38,
      ];
    } else if (index % 3 === 0) {
      const staffRadius = 0.08 + random() * 0.3;
      target = [
        -1.03 + Math.cos(targetAngle) * staffRadius,
        4.2 + Math.sin(targetAngle) * staffRadius,
        (random() - 0.5) * 0.22,
      ];
    } else {
      const side = random() > 0.5 ? 1 : -1;
      target = [
        side * (0.46 + random() * 0.58),
        0.75 + random() * 3.15,
        (random() - 0.5) * 0.34,
      ];
    }
    return { origin, target, seed: random(), size: 3.5 + random() * 5.2 };
  });
}
