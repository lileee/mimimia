export const LAYER_ORDER = {
  distant: { min: 0, max: 99 },
  moonAndMist: { min: 100, max: 199 },
  characterBack: { min: 200, max: 299 },
  characterBody: { min: 300, max: 399 },
  spellBack: { min: 400, max: 449 },
  characterFaceAndFront: { min: 450, max: 499 },
  moonCat: { min: 500, max: 549 },
  foregroundStardust: { min: 550, max: 599 },
} as const;

export const FACE_PARTICLE_SAFETY_ELLIPSE = {
  center: { x: 0, y: 3.55 },
  radius: { x: 0.62, y: 0.48 },
  opacityMultiplier: 0.15,
} as const;

export const CHEST_PARTICLE_SAFETY_ELLIPSE = {
  center: { x: 0, y: 2.95 },
  radius: { x: 0.82, y: 0.62 },
  opacityMultiplier: 0.18,
} as const;
