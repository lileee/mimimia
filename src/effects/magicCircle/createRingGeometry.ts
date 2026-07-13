import { BufferAttribute, BufferGeometry } from 'three/webgpu';

import type { GlyphPath, GlyphPoint } from './glyphPaths';

interface Segment {
  start: GlyphPoint;
  end: GlyphPoint;
  length: number;
}

export function createRingGeometry(paths: readonly GlyphPath[]): BufferGeometry {
  const segments: Segment[] = [];
  for (const path of paths) {
    for (let index = 0; index < path.points.length - 1; index += 1) {
      const start = path.points[index];
      const end = path.points[index + 1];
      segments.push({ start, end, length: Math.hypot(end.x - start.x, end.y - start.y) });
    }
    if (path.closed && path.points.length > 2) {
      const start = path.points[path.points.length - 1];
      const end = path.points[0];
      segments.push({ start, end, length: Math.hypot(end.x - start.x, end.y - start.y) });
    }
  }

  const totalLength = Math.max(Number.EPSILON, segments.reduce((total, segment) => total + segment.length, 0));
  const positions = new Float32Array(segments.length * 2 * 3);
  const arcProgress = new Float32Array(segments.length * 2);
  let traveled = 0;
  for (const [index, segment] of segments.entries()) {
    const positionOffset = index * 6;
    const arcOffset = index * 2;
    positions.set([segment.start.x, 0, segment.start.y, segment.end.x, 0, segment.end.y], positionOffset);
    arcProgress[arcOffset] = traveled / totalLength;
    traveled += segment.length;
    arcProgress[arcOffset + 1] = traveled / totalLength;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('arcProgress', new BufferAttribute(arcProgress, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
