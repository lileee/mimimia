import {
  AdditiveBlending,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  NormalBlending,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from 'three/webgpu';

import type {
  LayeredSpriteRigOptions,
  RigDefinition,
  RigLayerInstance,
  RigLayerMotion,
} from './rigTypes';

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function assertDefinition(value: unknown): asserts value is RigDefinition {
  const definition = value as Partial<RigDefinition>;
  if (
    typeof definition?.id !== 'string'
    || typeof definition?.canvas?.width !== 'number'
    || typeof definition?.canvas?.height !== 'number'
    || typeof definition?.origin?.x !== 'number'
    || typeof definition?.origin?.y !== 'number'
    || typeof definition?.worldHeight !== 'number'
    || !Array.isArray(definition?.layers)
  ) {
    throw new Error('Invalid layered sprite rig definition');
  }
}

export class LayeredSpriteRig {
  readonly root = new Group();
  readonly definition: RigDefinition;
  readonly layerNames: readonly string[];
  readonly #layers = new Map<string, RigLayerInstance>();

  static async load(
    definitionUrl: string,
    layerBaseUrl: string,
    options: LayeredSpriteRigOptions = {},
  ): Promise<LayeredSpriteRig> {
    const response = await fetch(definitionUrl);
    if (!response.ok) throw new Error(`Rig definition returned HTTP ${response.status}`);
    const definition: unknown = await response.json();
    assertDefinition(definition);

    const loader = new TextureLoader();
    const textures = new Map<string, Texture>();
    await Promise.all(definition.layers.map(async (layer) => {
      const texture = await loader.loadAsync(`${layerBaseUrl}${layer.path}`);
      textures.set(layer.name, texture);
    }));
    return new LayeredSpriteRig(definition, textures, options);
  }

  constructor(
    definition: RigDefinition,
    textures: ReadonlyMap<string, Texture>,
    options: LayeredSpriteRigOptions = {},
  ) {
    this.definition = definition;
    this.root.name = `${definition.id}-layered-sprite-rig`;
    const sortedLayers = [...definition.layers].sort((left, right) => left.zOrder - right.zOrder);
    this.layerNames = sortedLayers.map(({ name }) => name);
    this.root.userData.layerCount = sortedLayers.length;

    const width = definition.worldHeight * definition.canvas.width / definition.canvas.height;
    const height = definition.worldHeight;
    const rootCenterX = (0.5 - definition.origin.x) * width;
    const rootCenterY = (definition.origin.y - 0.5) * height;

    for (const [index, layer] of sortedLayers.entries()) {
      const texture = textures.get(layer.name);
      if (!texture) throw new Error(`Missing texture for rig layer ${layer.name}`);
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;

      const geometry = new PlaneGeometry(width, height);
      const material = new MeshBasicNodeMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: DoubleSide,
        blending: layer.blendMode === 'additive' ? AdditiveBlending : NormalBlending,
      });
      const mesh = new Mesh(geometry, material);
      mesh.name = `${definition.id}:${layer.name}:plane`;
      mesh.position.set(
        rootCenterX - (layer.pivot.x - definition.origin.x) * width,
        rootCenterY - (definition.origin.y - layer.pivot.y) * height,
        0,
      );
      mesh.renderOrder = options.renderOrderBase === undefined ? layer.zOrder : options.renderOrderBase + index;
      mesh.frustumCulled = false;
      mesh.visible = layer.defaultVisible ?? true;

      const pivot = new Group();
      pivot.name = `${definition.id}:${layer.name}:pivot`;
      const absolutePivot = new Vector3(
        (layer.pivot.x - definition.origin.x) * width,
        (definition.origin.y - layer.pivot.y) * height,
        0,
      );
      pivot.position.copy(absolutePivot);
      pivot.add(mesh);

      const instance: RigLayerInstance = {
        definition: layer,
        pivot,
        mesh,
        material,
        texture,
        basePivotPosition: absolutePivot,
      };
      this.#layers.set(layer.name, instance);
    }

    for (const layer of sortedLayers) {
      const instance = this.#layers.get(layer.name)!;
      if (layer.parent) {
        const parent = this.#layers.get(layer.parent);
        if (!parent) throw new Error(`Unknown parent layer ${layer.parent}`);
        instance.pivot.position.sub(parent.basePivotPosition);
        instance.basePivotPosition.copy(instance.pivot.position);
        parent.pivot.add(instance.pivot);
      } else {
        this.root.add(instance.pivot);
      }
    }
  }

  getLayer(name: string): Readonly<RigLayerInstance> | undefined {
    return this.#layers.get(name);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  setOpacity(opacity: number): void {
    const value = clamp(opacity, 0, 1);
    this.#layers.forEach(({ material }) => { material.opacity = value; });
  }

  setLayerVisible(name: string, visible: boolean): void {
    const layer = this.#layers.get(name);
    if (layer) layer.mesh.visible = visible;
  }

  setLayerMotion(name: string, motion: RigLayerMotion): void {
    const layer = this.#layers.get(name);
    if (!layer) return;
    const rotationFraction = clamp(motion.rotationFraction, -1, 1);
    const translateYFraction = clamp(motion.translateYFraction, -1, 1);
    layer.pivot.rotation.z = layer.definition.motionRange.rotationDegrees * rotationFraction * Math.PI / 180;
    layer.pivot.position.y = layer.basePivotPosition.y
      + this.definition.worldHeight * layer.definition.motionRange.translateYPercent * 0.01 * translateYFraction;
  }

  setLayerOffsetWorld(name: string, x: number, y: number): void {
    const layer = this.#layers.get(name);
    if (!layer) return;
    layer.pivot.position.x = layer.basePivotPosition.x + x;
    layer.pivot.position.y = layer.basePivotPosition.y + y;
  }

  reset(): void {
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.set(1, 1, 1);
    for (const layer of this.#layers.values()) {
      layer.pivot.position.copy(layer.basePivotPosition);
      layer.pivot.rotation.set(0, 0, 0);
      layer.mesh.visible = layer.definition.defaultVisible ?? true;
      layer.material.opacity = 1;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const layer of this.#layers.values()) {
      layer.mesh.geometry.dispose();
      layer.material.dispose();
      layer.texture.dispose();
    }
    this.root.clear();
    this.#layers.clear();
  }
}
