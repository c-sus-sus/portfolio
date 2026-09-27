import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.1 + vec2(3.7, 1.3);
      a *= 0.5;
    }
    return v;
  }
`;

export const NOISE3_GLSL = /* glsl */ `
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i + vec3(0, 0, 0)), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise3(p);
      p = p * 2.02 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return v;
  }
`;

// Vertex shader shared by the fresnel/atmosphere materials.
export const FRESNEL_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

let starSprite = null;
export function createStarSprite() {
  if (starSprite) return starSprite;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  starSprite = new THREE.CanvasTexture(canvas);
  starSprite.colorSpace = THREE.SRGBColorSpace;
  return starSprite;
}

// Centers a model on its bounding box and scales its largest axis to targetSize.
export function normalizeModel(model, targetSize) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  model.position.sub(center);
  const largestAxis = Math.max(size.x, size.y, size.z);
  if (largestAxis > 0) {
    const scale = targetSize / largestAxis;
    model.scale.multiplyScalar(scale);
    model.position.multiplyScalar(scale);
  }
}

// Deterministic PRNG so scattered fields look the same on every load.
export function seeded(seed) {
  let value = (seed * 9301 + 49297) % 4294967296;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

// JS-side 3D value noise, matching the GLSL flavour closely enough for geometry work.
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  return lerp(
    lerp(lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx), lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx), fy),
    lerp(lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx), lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx), fy),
    fz,
  );
}
export function fbm3(x, y, z, octaves = 4) {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < octaves; i += 1) {
    v += a * noise3(x, y, z);
    x = x * 2.02 + 1.7;
    y = y * 2.02 + 9.2;
    z = z * 2.02 + 3.1;
    a *= 0.5;
  }
  return v;
}

// A sculpted asteroid: an icosphere displaced by layered noise, with crevices baked into vertex colour.
export function createAsteroidGeometry(seed, detail = 4) {
  const rand = seeded(seed);
  let geometry = new THREE.IcosahedronGeometry(1, detail);
  geometry = mergeVertices(geometry);
  const position = geometry.attributes.position;
  const freq = 1.1 + rand() * 1.1;
  const amp = 0.22 + rand() * 0.2;
  const ox = rand() * 60, oy = rand() * 60, oz = rand() * 60;
  const stretch = new THREE.Vector3(0.75 + rand() * 0.7, 0.65 + rand() * 0.55, 0.75 + rand() * 0.7);
  const v = new THREE.Vector3();
  const colors = new Float32Array(position.count * 3);
  const displacements = new Float32Array(position.count);
  let minD = Infinity, maxD = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const broad = fbm3(v.x * freq + ox, v.y * freq + oy, v.z * freq + oz, 4);
    const mid = fbm3(v.x * freq * 2.6 + oy, v.y * freq * 2.6 + oz, v.z * freq * 2.6 + ox, 3);
    const fine = fbm3(v.x * freq * 6.5 + oz, v.y * freq * 6.5 + ox, v.z * freq * 6.5 + oy, 3);
    const grit = fbm3(v.x * freq * 16 + ox, v.y * freq * 16 + oy, v.z * freq * 16 + oz, 2);
    // Craters: bowl-shaped dips where the mid noise crosses a threshold.
    const crater = Math.pow(Math.max(0, mid - 0.56) * 2.4, 1.4) * 0.5;
    const d = 1 + (broad - 0.5) * 2 * amp + (mid - 0.5) * 0.18 + (fine - 0.5) * 0.07 + (grit - 0.5) * 0.025 - crater;
    displacements[i] = d;
    minD = Math.min(minD, d);
    maxD = Math.max(maxD, d);
    v.multiplyScalar(d).multiply(stretch);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  for (let i = 0; i < position.count; i += 1) {
    const t = (displacements[i] - minD) / Math.max(1e-5, maxD - minD);
    const shade = 0.42 + t * 0.58;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade * 0.98;
    colors[i * 3 + 2] = shade * 0.94;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Rim-light shell used on planets: additive fresnel tinted with the planet colour.
export function createRimGlow(radius, color, { power = 3.2, strength = 1.0, sunDirection } = {}) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(color) },
        power: { value: power },
        strength: { value: strength },
        sunDirection: { value: sunDirection || new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: FRESNEL_VERTEX,
      fragmentShader: /* glsl */ `
        uniform vec3 glowColor;
        uniform float power;
        uniform float strength;
        uniform vec3 sunDirection;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        void main() {
          float fresnel = pow(1.0 - clamp(dot(vNormal, vViewDir), 0.0, 1.0), power);
          float lit = 0.35 + 0.65 * smoothstep(-0.6, 0.5, dot(vWorldNormal, sunDirection));
          gl_FragColor = vec4(glowColor * fresnel * lit * strength, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

// Outer scattering halo (back faces of a larger sphere) that extends past the silhouette.
export function createHalo(radius, color, { strength = 0.6, sunDirection, softness = 0.7 } = {}) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(color) },
        strength: { value: strength },
        softness: { value: softness },
        sunDirection: { value: sunDirection || new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: FRESNEL_VERTEX,
      fragmentShader: /* glsl */ `
        uniform vec3 glowColor;
        uniform float strength;
        uniform float softness;
        uniform vec3 sunDirection;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        void main() {
          float facing = -dot(vNormal, vViewDir);
          float halo = pow(smoothstep(0.0, softness, facing), 2.0);
          float lit = 0.25 + 0.75 * smoothstep(-0.6, 0.4, dot(vWorldNormal, sunDirection));
          gl_FragColor = vec4(glowColor * halo * lit * strength, 1.0);
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}
