export type GlyphCategory =
  | 'cat-eye'
  | 'moon-phase'
  | 'star-orbit'
  | 'radial-tick'
  | 'star-point'
  | 'fictional-glyph'
  | 'guide';

export interface GlyphPoint {
  x: number;
  y: number;
}

export interface GlyphPath {
  id: string;
  category: GlyphCategory;
  points: GlyphPoint[];
  closed?: boolean;
}

function circlePoints(radius: number, segments = 96, start = 0, end = Math.PI * 2): GlyphPoint[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = start + (end - start) * index / segments;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

function placeLocal(points: readonly GlyphPoint[], radius: number, angle: number, scale = 1): GlyphPoint[] {
  const center = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
  const radial = { x: Math.cos(angle), y: Math.sin(angle) };
  return points.map((point) => ({
    x: center.x + tangent.x * point.x * scale + radial.x * point.y * scale,
    y: center.y + tangent.y * point.x * scale + radial.y * point.y * scale,
  }));
}

function crescentPoints(fill: number): GlyphPoint[] {
  const outer = circlePoints(0.12, 18, -Math.PI / 2, Math.PI * 1.5);
  const offset = (fill - 0.5) * 0.12;
  const inner = circlePoints(0.095, 18, Math.PI * 1.5, -Math.PI / 2)
    .map((point) => ({ x: point.x + offset, y: point.y }));
  return [...outer, ...inner];
}

const catEye: GlyphPath = {
  id: 'cat-eye-moonstone',
  category: 'cat-eye',
  closed: true,
  points: [
    { x: -0.34, y: 0 }, { x: -0.18, y: 0.19 }, { x: 0, y: 0.26 },
    { x: 0.18, y: 0.19 }, { x: 0.34, y: 0 }, { x: 0.18, y: -0.19 },
    { x: 0, y: -0.26 }, { x: -0.18, y: -0.19 },
  ],
};

const moonPhases: GlyphPath[] = Array.from({ length: 8 }, (_, index) => ({
  id: `moon-phase-${index + 1}`,
  category: 'moon-phase',
  closed: true,
  points: placeLocal(crescentPoints(index / 7), 0.92, Math.PI * 2 * index / 8),
}));

const starOrbits: GlyphPath[] = [
  { id: 'star-orbit-inner', category: 'star-orbit', points: circlePoints(1.24, 112) },
  {
    id: 'star-orbit-tilted', category: 'star-orbit',
    points: circlePoints(1, 128).map(({ x, y }) => ({ x: x * 1.56, y: y * 1.38 })),
  },
  { id: 'star-orbit-outer', category: 'star-orbit', points: circlePoints(2.14, 160) },
];

const radialTicks: GlyphPath[] = Array.from({ length: 36 }, (_, index) => {
  const angle = Math.PI * 2 * index / 36;
  const inner = index % 3 === 0 ? 1.96 : 2.02;
  const outer = index % 3 === 0 ? 2.22 : 2.16;
  return {
    id: `radial-tick-${index + 1}`,
    category: 'radial-tick',
    points: [
      { x: Math.cos(angle) * inner, y: Math.sin(angle) * inner },
      { x: Math.cos(angle) * outer, y: Math.sin(angle) * outer },
    ],
  };
});

const fourPointStar = [
  { x: 0, y: 0.12 }, { x: 0.035, y: 0.035 }, { x: 0.12, y: 0 }, { x: 0.035, y: -0.035 },
  { x: 0, y: -0.12 }, { x: -0.035, y: -0.035 }, { x: -0.12, y: 0 }, { x: -0.035, y: 0.035 },
];
const starPoints: GlyphPath[] = Array.from({ length: 8 }, (_, index) => ({
  id: `star-point-${index + 1}`,
  category: 'star-point',
  closed: true,
  points: placeLocal(fourPointStar, 1.82, Math.PI * 2 * (index + 0.5) / 8, index % 2 === 0 ? 0.72 : 0.5),
}));

const fictionalStrokes: readonly GlyphPoint[][] = [
  [{ x: -0.1, y: -0.08 }, { x: 0, y: 0.1 }, { x: 0.1, y: -0.08 }],
  [{ x: -0.1, y: 0.08 }, { x: 0.08, y: 0.08 }, { x: -0.02, y: -0.1 }],
  [{ x: -0.09, y: -0.1 }, { x: -0.02, y: 0.1 }, { x: 0.1, y: 0 }, { x: -0.09, y: -0.1 }],
  [{ x: -0.1, y: 0 }, { x: 0, y: 0.1 }, { x: 0.1, y: 0 }, { x: 0, y: -0.1 }],
  [{ x: -0.08, y: -0.1 }, { x: -0.08, y: 0.1 }, { x: 0.09, y: -0.02 }],
  [{ x: -0.1, y: 0.09 }, { x: 0.1, y: 0.09 }, { x: 0, y: -0.1 }],
  [{ x: -0.09, y: -0.09 }, { x: 0, y: 0.09 }, { x: 0.09, y: -0.09 }, { x: -0.09, y: 0.02 }],
  [{ x: -0.1, y: 0.08 }, { x: 0, y: -0.1 }, { x: 0.1, y: 0.08 }, { x: -0.1, y: 0.08 }],
  [{ x: -0.09, y: -0.1 }, { x: 0.09, y: -0.1 }, { x: 0, y: 0.1 }],
  [{ x: -0.1, y: -0.03 }, { x: 0, y: 0.1 }, { x: 0.1, y: -0.03 }, { x: 0, y: -0.1 }],
  [{ x: -0.08, y: 0.1 }, { x: 0.08, y: 0.1 }, { x: 0.08, y: -0.1 }, { x: -0.03, y: 0 }],
  [{ x: -0.1, y: -0.08 }, { x: 0.1, y: 0 }, { x: -0.1, y: 0.08 }, { x: 0.02, y: -0.1 }],
];
const fictionalGlyphs: GlyphPath[] = fictionalStrokes.map((points, index) => ({
  id: `fictional-glyph-${index + 1}`,
  category: 'fictional-glyph',
  points: placeLocal(points, 1.74, Math.PI * 2 * index / 12, 0.72),
}));

const guides: GlyphPath[] = [
  { id: 'cat-eye-halo', category: 'guide', points: circlePoints(0.43, 72) },
  { id: 'phase-guide-inner', category: 'guide', points: circlePoints(0.72, 96) },
  { id: 'phase-guide-outer', category: 'guide', points: circlePoints(1.08, 112) },
];

export const GLYPH_PATHS: readonly GlyphPath[] = [
  catEye,
  ...moonPhases,
  ...starOrbits,
  ...radialTicks,
  ...starPoints,
  ...fictionalGlyphs,
  ...guides,
];
