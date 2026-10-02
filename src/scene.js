import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { gsap } from 'gsap';
import { createFlight } from './flight.js';
import { NOISE_GLSL, FRESNEL_VERTEX, createStarSprite, normalizeModel } from './shared.js';

const ASSETS = {
  ship: '/models/spaceship_cb2.glb',
  earthDay: '/textures/earth_day_4k.webp',
  earthNight: '/textures/earth_night_4k.webp',
  earthClouds: '/textures/earth_clouds_2k.webp',
  earthNormal: '/textures/earth_normal_2048.jpg',
  earthSpecular: '/textures/earth_specular_2048.jpg',
};

// Sun low on the left so the terminator crosses the visible face and the night side faces the copy.
const SUN_DIRECTION = new THREE.Vector3(-6, 2.4, 2.6).normalize();

const FILM_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.045 },
    vignette: { value: 0.42 },
    aberration: { value: 0.0022 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grain;
    uniform float vignette;
    uniform float aberration;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 shift = c * r2 * aberration * 8.0;
      float r = texture2D(tDiffuse, vUv + shift).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - shift).b;
      vec3 col = vec3(r, g, b);
      float vig = 1.0 - vignette * smoothstep(0.12, 0.95, r2 * 2.4);
      col *= vig;
      float n = hash(vUv * vec2(1921.0, 1081.0) + fract(time * 7.0) * 41.0) - 0.5;
      col += n * grain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// Model-space correction so the ship's nose points along +Z.
// The CB2 GLB is re-authored by tools/blender/fix_ship.py: nose +Z, up +Y, centred, with
// "thruster_*" empties at the engine exits, so no runtime re-orientation is needed.

// Hero composition. Earth sits low-left, ship mid-left, copy on the right.
const HERO = {
  camera: new THREE.Vector3(0, 0.35, 9.6),
  target: new THREE.Vector3(-0.4, 0.1, 0),
  fov: 42,
  earthPosition: new THREE.Vector3(-3.7, -3.55, -1.8),
  earthRadius: 3.3,
  shipPosition: new THREE.Vector3(-1.9, 0.8, 0.9),
  shipRotation: new THREE.Euler(), // set below by orbitHoldPose()
  shipSize: 2.9,
};

// The hero ship holds station above the limb: nose along the orbit tangent (screen-right and a
// little away from camera), belly toward the planet, a touch of bank. Computed rather than
// hand-tuned so the pose and the launch heading always agree.
function orbitHoldPose(shipPosition, earthPosition, bank = -0.22) {
  const radial = shipPosition.clone().sub(earthPosition).normalize();
  const tangent = new THREE.Vector3(1, 0, 0).addScaledVector(radial, -radial.x).normalize();
  const probe = new THREE.Object3D();
  probe.position.copy(shipPosition);
  probe.up.copy(radial);
  probe.lookAt(shipPosition.clone().add(tangent));
  probe.rotateZ(bank);
  return probe.rotation.clone();
}
HERO.shipRotation = orbitHoldPose(HERO.shipPosition, HERO.earthPosition);


export function createSpaceScene(canvas, callbacks = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000205, 1);

  const scene = new THREE.Scene();
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.28;

  const camera = new THREE.PerspectiveCamera(HERO.fov, window.innerWidth / window.innerHeight, 0.1, 1600);
  camera.position.copy(HERO.camera);
  const cameraTarget = HERO.target.clone();

  // Hero lighting: one hard sun, faint cool ambient, blue earthshine from below.
  const heroLights = new THREE.Group();
  const sun = new THREE.DirectionalLight(0xfff3e0, 3.4);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(40);
  const ambient = new THREE.AmbientLight(0x1b2a3f, 0.5);
  const earthshine = new THREE.HemisphereLight(0x0a1424, 0x2f6fd0, 0.85);
  const rim = new THREE.DirectionalLight(0x8ad7ff, 0.9);
  rim.position.set(6, 2, -4);
  heroLights.add(sun, ambient, earthshine, rim);
  scene.add(heroLights);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // Cinematic finish: vignette, fine grain and a whisper of chromatic aberration at the edges.
  const film = new ShaderPass(FILM_SHADER);
  composer.addPass(film);

  // Only hero-critical assets gate the loader. Route planets stream in behind it.
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => callbacks.onProgress?.(loaded / total);
  manager.onLoad = () => callbacks.onReady?.();
  const textureLoader = new THREE.TextureLoader(manager);
  const gltfLoader = new GLTFLoader(manager);

  const starfield = createStarfield();
  scene.add(starfield);

  const earth = createEarth(textureLoader);
  earth.group.position.copy(HERO.earthPosition);
  scene.add(earth.group);

  const shipGroup = new THREE.Group();
  shipGroup.position.copy(HERO.shipPosition);
  scene.add(shipGroup);
  const shipInner = new THREE.Group();
  shipInner.rotation.copy(HERO.shipRotation);
  shipGroup.add(shipInner);

  const shipState = { loaded: false, engineMaterials: [], model: null, thrusters: null };
  const animationMixers = [];
  const placeholderShip = createPlaceholderShip();
  shipInner.add(placeholderShip);

  gltfLoader.load(
    ASSETS.ship,
    (gltf) => {
      placeholderShip.visible = false;
      const model = gltf.scene;
      if (gltf.animations?.length) {
        const mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
        animationMixers.push(mixer);
        model.updateMatrixWorld(true);
      }
      normalizeModel(model, HERO.shipSize);
      shipState.engineMaterials = prepareShipMaterials(model);
      shipInner.add(model);
      shipState.model = model;
      shipState.thrusters = createThrusters(model, shipInner);
      shipState.thrusters.setThrust(0.35);
      shipState.loaded = true;
      callbacks.onAssetState?.({ shipLoaded: true });
    },
    undefined,
    () => callbacks.onAssetState?.({ shipLoaded: false }),
  );

  const warpLines = createWarpLines();
  warpLines.visible = false;
  scene.add(warpLines);

  const warpTunnel = createWarpTunnel();
  warpTunnel.group.visible = false;
  scene.add(warpTunnel.group);

  const sheath = createPlasmaSheath();
  sheath.mesh.visible = false;
  shipInner.add(sheath.mesh);

  const setThrust = (value) => shipState.thrusters?.setThrust(value);
  const flight = createFlight({
    scene,
    camera,
    renderer,
    ship: { group: shipGroup, inner: shipInner, setThrust },
    dom: callbacks.dom || {},
    onStateChange: callbacks.onFlightState,
    onEscape: () => api.returnToHero(),
  });

  const state = {
    phase: 'loading',
    disposed: false,
    clock: new THREE.Clock(),
    keys: new Set(),
    pointer: new THREE.Vector2(0, 0),
    parallax: new THREE.Vector2(0, 0),
    heroLocked: true,
    arriving: false,
    arrivalBank: 0,
    warpShipX: -1.75,
    warpShipY: -1.25,
  };

  // First reveal and every return to orbit: the ship sweeps in from off-screen along its orbit
  // heading, thrusters blazing, and settles on station as they ease back to idle.
  function playArrival(duration = 2.6) {
    const forward = new THREE.Vector3(0, 0, 1).applyEuler(HERO.shipRotation);
    const start = HERO.shipPosition.clone().addScaledVector(forward, -24).add(new THREE.Vector3(0, 1.2, 1.5));
    state.arriving = true;
    state.arrivalBank = -0.42;
    shipGroup.visible = true;
    shipGroup.position.copy(start);
    shipInner.rotation.copy(HERO.shipRotation);
    const thrust = { value: 1.3 };
    shipState.thrusters?.setThrust(thrust.value);
    gsap
      .timeline({ onComplete: () => { state.arriving = false; } })
      .to(shipGroup.position, { x: HERO.shipPosition.x, y: HERO.shipPosition.y, z: HERO.shipPosition.z, duration, ease: 'power3.out' }, 0)
      .to(state, { arrivalBank: 0, duration: duration * 0.85, ease: 'power2.out' }, 0.15)
      .to(thrust, { value: 0.3, duration: duration * 0.9, ease: 'power2.out', onUpdate: () => shipState.thrusters?.setThrust(thrust.value) }, 0.3);
  }

  function animate() {
    if (state.disposed) return;
    if (import.meta.env.DEV) window.__frames += 1;
    const delta = Math.min(state.clock.getDelta(), 0.05);
    const elapsed = state.clock.elapsedTime;
    animationMixers.forEach((mixer) => mixer.update(delta));
    shipState.thrusters?.update(elapsed);
    film.uniforms.time.value = elapsed;

    starfield.rotation.y += state.phase.includes('warp') ? 0.012 : 0.00025;
    // The star shell rides with the camera so the route never runs out of sky.
    starfield.position.x = camera.position.x;
    earth.surface.rotation.y += delta * 0.018;
    earth.clouds.rotation.y += delta * 0.024;

    if (state.arriving) {
      // Sweeping in: the tween drives the position; the model banks into the turn and levels out.
      shipInner.rotation.copy(HERO.shipRotation);
      shipInner.rotateZ(state.arrivalBank);
    } else if (state.phase === 'orbit' || state.phase === 'loading') {
      // The ship holds station while the planet turns beneath it; only the thrusters breathe.
      shipGroup.position.copy(HERO.shipPosition);
      shipInner.rotation.copy(HERO.shipRotation);
      shipState.thrusters?.setThrust(0.3 + Math.sin(elapsed * 1.7) * 0.03);
    }

    if (state.heroLocked) {
      state.parallax.lerp(state.pointer, 0.04);
      camera.position.x = HERO.camera.x + state.parallax.x * 0.35;
      camera.position.y = HERO.camera.y + state.parallax.y * 0.22;
      camera.lookAt(cameraTarget);
    }

    if (state.phase === 'warp') {
      warpTunnel.update(elapsed, delta);
      sheath.update(elapsed);
      warpLines.rotation.z += 0.02;
      warpLines.children.forEach((line, index) => {
        line.position.z += (0.5 + index * 0.003) * warpTunnel.speed;
        // Thin out as a streak nears the lens so it never pops in or out at full size.
        line.scale.x = THREE.MathUtils.clamp((-line.position.z - 1) / 8, 0.05, 1);
        if (line.position.z > 2) line.position.z = -60 - Math.random() * 20;
      });
      const shake = 0.012 * warpTunnel.speed;
      shipGroup.position.x = state.warpShipX + (Math.random() - 0.5) * shake;
      shipGroup.position.y = state.warpShipY + (Math.random() - 0.5) * shake;
    }

    if (state.phase === 'universe') {
      flight.update(delta, elapsed, state.keys);
    }

    composer.render();
    window.requestAnimationFrame(animate);
  }

  animate();

  const onResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(width, height);
    composer.setSize(width, height);
    bloom.setSize(width, height);
    camera.aspect = width / height;
    const narrow = THREE.MathUtils.clamp((1.45 - camera.aspect) * 4.2, 0, 5.5);
    HERO.camera.z = 9.6 + narrow;
    // Narrow screens: bring the ship toward the centre line and a touch lower so it sits between
    // the copy and the limb instead of hanging off the left edge; the orbit pose follows.
    HERO.shipPosition.set(-1.9 + narrow * 0.42, 0.8 - narrow * 0.5, 0.9);
    HERO.shipRotation.copy(orbitHoldPose(HERO.shipPosition, HERO.earthPosition));
    if (state.heroLocked) camera.position.z = HERO.camera.z;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);
  onResize();

  const onPointerMove = (event) => {
    state.pointer.set((event.clientX / window.innerWidth) * 2 - 1, -((event.clientY / window.innerHeight) * 2 - 1));
  };
  window.addEventListener('pointermove', onPointerMove);
  const onKeyDown = (event) => {
    const key = event.key.toLowerCase();
    if (state.phase === 'universe' && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    state.keys.add(key);
  };
  const onKeyUp = (event) => state.keys.delete(event.key.toLowerCase());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  const onBlur = () => {
    state.keys.clear();
    flight.releaseControls();
  };
  window.addEventListener('blur', onBlur);
  const onVisibility = () => { if (document.hidden) onBlur(); };
  document.addEventListener('visibilitychange', onVisibility);
  // A lost graphics context (driver reset, too many tabs) would leave a frozen frame.
  const onContextLost = (event) => {
    event.preventDefault();
    callbacks.onGraphicsLost?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  function flareEngines(intensity, duration, thrust = 1) {
    shipState.engineMaterials.forEach((material) => {
      gsap.to(material, { emissiveIntensity: intensity, duration, ease: 'power2.out' });
    });
    if (shipState.thrusters) {
      const proxy = { value: shipState.thrusters.thrust };
      gsap.to(proxy, { value: thrust, duration, ease: 'power2.out', onUpdate: () => shipState.thrusters.setThrust(proxy.value) });
    }
  }

  const api = {
    setPhase(nextPhase) {
      const arriving = nextPhase === 'orbit' && state.phase === 'loading';
      state.phase = nextPhase;
      if (arriving) {
        playArrival();
        // Once the ship has settled, quietly get the route ready so the jump rarely has to wait.
        window.setTimeout(() => api.prewarmRoute(), 3200);
      }
    },
    prewarmRoute() {
      return flight.prewarm({
        beforeCompile: () => { heroLights.visible = false; earth.group.visible = false; },
        afterCompile: () => { heroLights.visible = true; earth.group.visible = true; },
      });
    },
    launch() {
      shipGroup.visible = true;
      state.phase = 'launch';
      state.heroLocked = false;
      // Go pressed mid-arrival: stop the arrival so two tweens do not fight over the ship.
      gsap.killTweensOf(shipGroup.position);
      gsap.killTweensOf(state);
      state.arriving = false;
      state.arrivalBank = 0;
      shipGroup.position.copy(HERO.shipPosition);
      flareEngines(6, 0.5, 1.0);
      const forward = new THREE.Vector3(0, 0, 1).applyEuler(HERO.shipRotation);
      const start = shipGroup.position.clone();
      const exit = start.clone().add(forward.clone().multiplyScalar(16)).add(new THREE.Vector3(0, 1.4, 1.5));
      gsap
        .timeline()
        .to(shipGroup.position, { x: start.x + forward.x * 0.6, y: start.y + 0.25, z: start.z + 0.2, duration: 0.6, ease: 'power2.inOut' })
        .to(shipGroup.position, { x: exit.x, y: exit.y, z: exit.z, duration: 0.85, ease: 'power4.in' })
        // The camera only eases forward a little; it does not pan after the ship, so the Earth
        // stays put in the frame while the vessel leaves.
        .to(camera.position, { x: HERO.camera.x + 0.2, y: HERO.camera.y + 0.15, z: HERO.camera.z - 1.2, duration: 1.3, ease: 'power2.inOut', onUpdate: () => camera.lookAt(cameraTarget) }, 0);
    },
    warp(done) {
      state.phase = 'warp';
      state.heroLocked = false;
      earth.group.visible = false;
      starfield.visible = false;
      warpLines.visible = true;
      warpTunnel.group.visible = true;
      warpTunnel.speed = 0.25;
      sheath.mesh.visible = true;
      sheath.setIntensity(0);
      shipGroup.visible = true;
      shipGroup.position.set(state.warpShipX, state.warpShipY, 2.4);
      shipGroup.scale.setScalar(0.62);
      shipGroup.quaternion.identity();
      shipInner.up.set(0, 1, 0);
      // Aim the nose at the tunnel's vanishing point so the fuselage reads as diving in.
      shipInner.lookAt(0.3, 0.2, -60);
      shipInner.rotateZ(0.28);
      // The launch tweens may still be ticking on a slow frame; they must not fight the warp camera.
      gsap.killTweensOf(camera.position);
      gsap.killTweensOf(cameraTarget);
      gsap.killTweensOf(shipGroup.position);
      camera.position.set(0.5, 0.6, 6.4);
      camera.lookAt(0, -0.05, -30);
      camera.fov = 52;
      camera.updateProjectionMatrix();
      flareEngines(8, 0.3, 1.6);
      api.prewarmRoute();
      // The tunnel is the wait state: it runs for its minimum length and then simply keeps
      // flowing until the route is ready to draw. Nothing is shown on top of it.
      let finished = false;
      let minElapsed = false;
      const startedAt = performance.now();
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearInterval(poll);
        done?.();
      };
      const tryFinish = () => {
        if (!minElapsed) return;
        if (flight.isReady() || performance.now() - startedAt > 18000) finish();
      };
      const poll = window.setInterval(tryFinish, 120);
      window.setTimeout(() => { minElapsed = true; tryFinish(); }, 3900);
      const sheathProxy = { value: 0 };
      gsap
        .timeline({ onComplete: () => { minElapsed = true; tryFinish(); } })
        .to(warpTunnel, { speed: 2.4, duration: 3.6, ease: 'power2.in' }, 0)
        .to(sheathProxy, { value: 1, duration: 2.2, ease: 'power2.in', onUpdate: () => sheath.setIntensity(sheathProxy.value) }, 0.4)
        .to(shipGroup.position, { x: -1.2, y: -0.9, z: 0.6, duration: 3.6, ease: 'power2.inOut' }, 0)
        .to(camera, { fov: 82, duration: 3.4, ease: 'power3.in', onUpdate: () => camera.updateProjectionMatrix() }, 0.2);
    },
    setInputLocked(locked) {
      flight.setInputLocked(locked);
    },
    dock(id) {
      flight.dock(id);
    },
    enterUniverse() {
      state.phase = 'universe';
      state.heroLocked = false;
      warpLines.visible = false;
      warpTunnel.group.visible = false;
      sheath.mesh.visible = false;
      earth.group.visible = false;
      heroLights.visible = false;
      starfield.visible = true;
      shipState.engineMaterials.forEach((material) => { material.emissiveIntensity = 3.2; });
      shipInner.up.set(0, 1, 0);
      shipGroup.quaternion.identity();
      shipGroup.visible = true;
      flight.enter();
    },
    leaveOrbit() {
      flight.leaveOrbit();
    },
    setThrustHeld(held) {
      flight.setThrustHeld(held);
    },
    setStick(x, y, active) {
      flight.setStick(x, y, active);
    },
    returnToHero() {
      if (state.phase !== 'universe') return;
      flight.exit();
      state.phase = 'orbit';
      state.heroLocked = true;
      heroLights.visible = true;
      earth.group.visible = true;
      starfield.visible = true;
      warpLines.visible = false;
      warpTunnel.group.visible = false;
      sheath.mesh.visible = false;
      shipGroup.visible = true;
      shipGroup.scale.setScalar(1);
      shipGroup.quaternion.identity();
      shipInner.up.set(0, 1, 0);
      shipInner.rotation.copy(HERO.shipRotation);
      shipState.engineMaterials.forEach((material) => { material.emissiveIntensity = 3.2; });
      playArrival(2.2);
      camera.up.set(0, 1, 0);
      camera.position.copy(HERO.camera);
      camera.fov = HERO.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(cameraTarget);
      callbacks.onReturnToOrbit?.();
    },
    jumpTo(id) {
      flight.jumpTo(id);
    },
    dispose() {
      state.disposed = true;
      flight.exit();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      pmremGenerator.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
  if (import.meta.env.DEV) {
    window.__scene = api;
    window.__ship = shipState;
    window.__flight = flight;
    window.__camera = camera;
    window.__keys = state.keys;
    window.__shipInner = shipInner;
    window.__shipGroup = shipGroup;
    window.__frames = 0;
  }
  return api;
}

// ---------------------------------------------------------------------------
// Earth
// ---------------------------------------------------------------------------

function createEarth(textureLoader) {
  const group = new THREE.Group();
  const radius = HERO.earthRadius;

  const loadColor = (url) => {
    const texture = textureLoader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  };
  const loadData = (url) => {
    const texture = textureLoader.load(url);
    texture.anisotropy = 8;
    return texture;
  };

  const dayMap = loadColor(ASSETS.earthDay);
  const nightMap = loadColor(ASSETS.earthNight);
  const cloudsMap = loadColor(ASSETS.earthClouds);
  const normalMap = loadData(ASSETS.earthNormal);
  const specularMap = loadData(ASSETS.earthSpecular);

  const surfaceMaterial = new THREE.MeshStandardMaterial({
    map: dayMap,
    normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    emissiveMap: nightMap,
    emissive: new THREE.Color(0xffd6a0),
    emissiveIntensity: 1.9,
    metalness: 0,
    roughness: 1,
  });
  // Night lights only on the dark side, glossy oceans from the specular map.
  surfaceMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.sunDirection = { value: SUN_DIRECTION };
    shader.uniforms.specMap = { value: specularMap };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldNormal;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWorldNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldNormal;\nuniform vec3 sunDirection;\nuniform sampler2D specMap;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.92, 0.3, texture2D(specMap, vMapUv).r);')
      .replace(
        'totalEmissiveRadiance *= emissiveColor.rgb;',
        'float nightMix = smoothstep(0.1, -0.25, dot(normalize(vWorldNormal), sunDirection));\n\ttotalEmissiveRadiance *= emissiveColor.rgb * nightMix;',
      );
  };
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 128), surfaceMaterial);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.014, 96, 96),
    new THREE.MeshStandardMaterial({ map: cloudsMap, transparent: true, opacity: 0.92, depthWrite: false, roughness: 1, metalness: 0 }),
  );

  const innerGlow = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.004, 96, 96),
    new THREE.ShaderMaterial({
      uniforms: { sunDirection: { value: SUN_DIRECTION }, glowColor: { value: new THREE.Color(0x7cc4ff) } },
      vertexShader: FRESNEL_VERTEX,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDirection;
        uniform vec3 glowColor;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        void main() {
          float fresnel = pow(1.0 - clamp(dot(vNormal, vViewDir), 0.0, 1.0), 3.0);
          float lit = smoothstep(-0.35, 0.45, dot(vWorldNormal, sunDirection));
          gl_FragColor = vec4(glowColor * fresnel * (0.12 + 0.88 * lit) * 1.35, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  // Thicker scattering halo that extends well past the silhouette.
  const outerGlow = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.24, 96, 96),
    new THREE.ShaderMaterial({
      uniforms: { sunDirection: { value: SUN_DIRECTION }, glowColor: { value: new THREE.Color(0x4f9dff) } },
      vertexShader: FRESNEL_VERTEX,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDirection;
        uniform vec3 glowColor;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        void main() {
          float facing = -dot(vNormal, vViewDir);
          float halo = pow(smoothstep(0.0, 0.7, facing), 1.9);
          float lit = smoothstep(-0.55, 0.4, dot(vWorldNormal, sunDirection));
          gl_FragColor = vec4(glowColor * halo * (0.1 + 0.9 * lit) * 1.15, 1.0);
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  surface.rotation.z = THREE.MathUtils.degToRad(-23.4);
  clouds.rotation.z = surface.rotation.z;
  surface.rotation.y = 2.4;
  clouds.rotation.y = 2.4;

  group.add(surface, clouds, innerGlow, outerGlow);
  return { group, surface, clouds };
}

// ---------------------------------------------------------------------------
// Ship
// ---------------------------------------------------------------------------

function prepareShipMaterials(model) {
  const engineMaterials = [];
  model.traverse((object) => {
    if (!object.isMesh && !object.isSkinnedMesh) return;
    object.frustumCulled = false;
    // Authored tangents from exporters have been unreliable (zero or unnormalised vectors); a
    // single NaN from that path poisons the bloom mips into a black block. Let three.js derive
    // tangents per pixel instead.
    if (object.geometry?.attributes?.tangent) object.geometry.deleteAttribute('tangent');
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material) return;
      if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
      if (material.emissiveMap) {
        material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        material.emissive.set(0xffffff);
        material.emissiveIntensity = 3.2;
        if (!engineMaterials.includes(material)) engineMaterials.push(material);
      }
      material.envMapIntensity = 1.3;
      material.needsUpdate = true;
    });
  });
  return engineMaterials;
}

const PLUME_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PLUME_FRAGMENT = /* glsl */ `
  uniform float time;
  uniform float thrust;
  uniform vec3 coreColor;
  uniform vec3 tailColor;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    float along = vUv.y;
    float n = noise(vec2(vUv.x * 6.0, along * 5.0 - time * 6.0));
    float n2 = noise(vec2(vUv.x * 14.0 + 3.0, along * 9.0 - time * 11.0));
    float flicker = 0.7 + 0.3 * n + 0.15 * n2;
    float body = pow(along, 1.7) * flicker;
    float edge = pow(1.0 - abs(vUv.x * 2.0 - 1.0), 0.55);
    float alpha = body * edge * (0.4 + 0.6 * thrust);
    vec3 color = mix(tailColor, coreColor, pow(along, 2.2));
    gl_FragColor = vec4(color * (0.85 + thrust * 0.55), clamp(alpha, 0.0, 1.0));
  }
`;

function createThrusters(model, parent) {
  model.updateMatrixWorld(true);
  parent.updateMatrixWorld(true);
  const parentScale = parent.getWorldScale(new THREE.Vector3()).x || 1;
  const nozzles = [];
  const worldPosition = new THREE.Vector3();
  const worldScale = new THREE.Vector3();
  // Preferred: "thruster_N" empties authored into the GLB by tools/blender/fix_ship.py. Their
  // uniform scale is the nozzle radius and the exhaust leaves along the ship's -Z.
  model.traverse((object) => {
    if (!/^thruster/i.test(object.name)) return;
    object.getWorldPosition(worldPosition);
    object.getWorldScale(worldScale);
    nozzles.push({ position: parent.worldToLocal(worldPosition.clone()), radius: worldScale.x / parentScale });
  });
  const group = new THREE.Group();
  parent.add(group);
  const sprite = createStarSprite();
  const units = nozzles.map((nozzle) => {
    const unit = new THREE.Group();
    unit.position.copy(nozzle.position);
    const plumeLength = nozzle.radius * 9;
    const plume = new THREE.Mesh(
      new THREE.CylinderGeometry(nozzle.radius * 0.95, nozzle.radius * 0.12, plumeLength, 24, 12, true),
      new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          thrust: { value: 0 },
          coreColor: { value: new THREE.Color(0xe9d5ff) },
          tailColor: { value: new THREE.Color(0x4f46e5) },
        },
        vertexShader: PLUME_VERTEX,
        fragmentShader: PLUME_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    plume.rotation.x = Math.PI / 2;
    plume.position.z = -plumeLength / 2;
    unit.add(plume);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: 0xc4b5fd, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.z = -nozzle.radius * 0.2;
    unit.add(glow);
    const light = new THREE.PointLight(0x8b5cf6, 0, nozzle.radius * 14, 1.8);
    light.position.z = -nozzle.radius * 1.5;
    unit.add(light);
    group.add(unit);
    return { plume, glow, light, radius: nozzle.radius, plumeLength };
  });

  const api = {
    thrust: 0,
    nozzleCount: nozzles.length,
    setThrust(value) {
      api.thrust = value;
      units.forEach((unit) => {
        unit.plume.material.uniforms.thrust.value = value;
        unit.plume.scale.set(0.75 + value * 0.45, 0.18 + value * 1.15, 0.75 + value * 0.45);
        unit.plume.position.z = -(unit.plumeLength * unit.plume.scale.y) / 2;
        const glowSize = unit.radius * (2.4 + value * 2.2);
        unit.glow.scale.set(glowSize, glowSize, 1);
        unit.glow.material.opacity = 0.35 + value * 0.5;
        unit.light.intensity = 2 + value * 14;
      });
    },
    update(time) {
      units.forEach((unit, index) => {
        unit.plume.material.uniforms.time.value = time + index * 1.7;
        const jitter = 1 + Math.sin(time * 23 + index * 4) * 0.04 + Math.sin(time * 41 + index) * 0.03;
        unit.glow.material.opacity = (0.35 + api.thrust * 0.5) * jitter;
      });
    },
  };
  return api;
}

function createPlaceholderShip() {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 2), new THREE.MeshStandardMaterial({ color: '#65717d', metalness: 0.8, roughness: 0.36 }));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 4), new THREE.MeshStandardMaterial({ color: '#8a96a2', metalness: 0.75, roughness: 0.4 }));
  nose.position.z = 1.35;
  nose.rotation.x = Math.PI / 2;
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.1), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0891b2', emissiveIntensity: 4 }));
  engine.position.z = -1.05;
  group.add(hull, nose, engine);
  return group;
}

// ---------------------------------------------------------------------------
// Sky, warp tunnel, plasma sheath
// ---------------------------------------------------------------------------

function createStarfield() {
  const group = new THREE.Group();
  const sprite = createStarSprite();
  const warm = new THREE.Color('#fff1d6');
  const cool = new THREE.Color('#cfe6ff');
  const layers = [
    { count: 2600, size: 0.16, radius: 140, opacity: 0.55 },
    { count: 700, size: 0.32, radius: 110, opacity: 0.85 },
    { count: 90, size: 0.7, radius: 90, opacity: 1 },
  ];
  layers.forEach((layer) => {
    const positions = [];
    const colors = [];
    for (let i = 0; i < layer.count; i += 1) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const r = layer.radius * (0.7 + Math.random() * 0.3);
      const s = Math.sqrt(1 - u * u);
      positions.push(r * s * Math.cos(theta), r * u, r * s * Math.sin(theta));
      const color = warm.clone().lerp(cool, Math.random());
      const brightness = 0.55 + Math.random() * 0.45;
      colors.push(color.r * brightness, color.g * brightness, color.b * brightness);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    group.add(new THREE.Points(geometry, new THREE.PointsMaterial({
      size: layer.size, map: sprite, transparent: true, opacity: layer.opacity, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })));
  });
  return group;
}

function createWarpLines() {
  // Soft light streaks: each is a thin, long box drawn with a shader that fades at both ends
  // and across its width, so it reads as a trail of light rather than a hard stick.
  const group = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        // Along the streak: bright head, long soft tail. Across: a soft core.
        float along = vUv.y;
        float head = smoothstep(0.0, 0.08, along) * pow(1.0 - along, 1.6);
        float across = pow(1.0 - abs(vUv.x * 2.0 - 1.0), 1.8);
        float a = head * across;
        gl_FragColor = vec4(mix(vec3(0.55, 0.8, 1.0), vec3(1.0), head * 0.6) * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const purple = material.clone();
  purple.fragmentShader = material.fragmentShader.replace('vec3(0.55, 0.8, 1.0)', 'vec3(0.78, 0.55, 1.0)');
  for (let i = 0; i < 110; i += 1) {
    const radius = 1.8 + Math.random() * 5.5;
    const angle = Math.random() * Math.PI * 2;
    const length = 5 + Math.random() * 12;
    const geometry = new THREE.PlaneGeometry(0.05 + Math.random() * 0.05, length);
    const line = new THREE.Mesh(geometry, i % 4 === 0 ? purple : material);
    line.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -Math.random() * 60);
    // The plane's long axis runs along Z, and it faces the tunnel's centre line.
    // Tip the plane to run along Z first, then spin it about Z so its face points at the axis.
    line.rotation.order = 'ZXY';
    line.rotation.set(Math.PI / 2, 0, angle + Math.PI / 2);
    line.userData.length = length;
    group.add(line);
  }
  return group;
}

function createWarpTunnel() {
  const group = new THREE.Group();
  const length = 160;
  const radius = 7;
  const tunnel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.55, length, 64, 1, true),
    new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        scroll: { value: 0 },
        speed: { value: 0 },
        colorA: { value: new THREE.Color(0x1d4ed8) },
        colorB: { value: new THREE.Color(0x7c3aed) },
        colorC: { value: new THREE.Color(0x67e8f9) },
      },
      vertexShader: PLUME_VERTEX,
      fragmentShader: /* glsl */ `
        uniform float time;
        uniform float scroll;
        uniform float speed;
        uniform vec3 colorA;
        uniform vec3 colorB;
        uniform vec3 colorC;
        varying vec2 vUv;
        ${NOISE_GLSL}
        void main() {
          float along = vUv.y;
          float ring = vUv.x;
          float twist = along * 6.0 + time * 0.25;
          // Sample the noise around a circle so the pattern wraps seamlessly where the cylinder's
          // texture coordinates meet; a plain ring coordinate left a dark seam down the tunnel.
          float a1 = ring * 6.2831853 + twist;
          float a2 = ring * 6.2831853 * 2.0 - twist * 1.7;
          float n1 = fbm(vec2(cos(a1) * 2.6, sin(a1) * 2.6 + along * 26.0 - scroll * 1.0));
          float n2 = fbm(vec2(cos(a2) * 3.2, sin(a2) * 3.2 + along * 60.0 - scroll * 2.3));
          float bands = smoothstep(0.42, 0.85, n1) * 1.1 + smoothstep(0.55, 0.9, n2) * 0.6;
          float depth = pow(along, 2.2);
          float nearFade = smoothstep(0.0, 0.18, along);
          vec3 color = mix(colorA, colorB, n1) * bands + colorC * depth * 0.9;
          float energy = (0.35 + speed * 0.5);
          gl_FragColor = vec4(color * energy * nearFade, 1.0);
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  tunnel.rotation.x = -Math.PI / 2;
  tunnel.position.z = -length / 2 + 6;
  group.add(tunnel);

  const exitGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: createStarSprite(), color: 0xe0f2fe, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  exitGlow.position.z = -length + 20;
  exitGlow.scale.set(12, 12, 1);
  group.add(exitGlow);

  const api = {
    group,
    speed: 0,
    update(time, delta) {
      tunnel.material.uniforms.time.value = time;
      tunnel.material.uniforms.scroll.value += delta * (2 + api.speed * 9);
      tunnel.material.uniforms.speed.value = api.speed;
      const glowSize = 12 + api.speed * 7 + Math.sin(time * 9) * 0.8;
      exitGlow.scale.set(glowSize, glowSize, 1);
      exitGlow.material.opacity = 0.3 + api.speed * 0.18;
    },
  };
  return api;
}

function createPlasmaSheath() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      intensity: { value: 0 },
      noseColor: { value: new THREE.Color(0xffd7a8) },
      tailColor: { value: new THREE.Color(0x3b82f6) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float intensity;
      uniform vec3 noseColor;
      uniform vec3 tailColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      ${NOISE_GLSL}
      void main() {
        float nose = smoothstep(-0.6, 1.0, vLocal.z);
        float fres = pow(1.0 - clamp(abs(dot(vNormal, vViewDir)), 0.0, 1.0), 1.8);
        float streaks = fbm(vec2(atan(vLocal.y, vLocal.x) * 3.0, vLocal.z * 4.0 + time * 7.0));
        float shell = fres * (0.55 + 0.45 * streaks) + nose * 0.35 * streaks;
        vec3 color = mix(tailColor, noseColor, pow(nose, 1.6));
        float alpha = shell * intensity;
        gl_FragColor = vec4(color * (1.4 + nose * 1.2) * alpha, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material);
  mesh.scale.set(HERO.shipSize * 0.34, HERO.shipSize * 0.22, HERO.shipSize * 0.78);
  mesh.position.z = HERO.shipSize * 0.16;
  return {
    mesh,
    setIntensity(value) { material.uniforms.intensity.value = value; },
    update(time) { material.uniforms.time.value = time; },
  };
}
