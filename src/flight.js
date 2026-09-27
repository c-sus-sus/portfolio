import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gsap } from 'gsap';
import { stations } from './content.js';
import {
  NOISE3_GLSL,
  FRESNEL_VERTEX,
  createStarSprite,
  normalizeModel,
  createRimGlow,
  createHalo,
  createAsteroidGeometry,
  seeded,
} from './shared.js';

// Third-person assisted flight. The ship group's quaternion is its heading (nose = +Z, up = +Y);
// the visual model inside banks on its own. World up is +Y. A black hole sits below the flight
// volume; flying into its horizon returns the visitor to Earth orbit. The portfolio stations are
// small bodies scattered ahead of the start.

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const SUN_DIRECTION = new THREE.Vector3(0.35, 0.72, -0.6).normalize();
const HOLE = { center: new THREE.Vector3(0, -196, 150), radius: 58, tilt: 0.34 };
const BOUNDS = { center: new THREE.Vector3(0, 10, 180), radius: 330 };
const START = { position: new THREE.Vector3(0, 2, -6), heading: new THREE.Vector3(0, 0, 1) };

const FLIGHT = {
  maxSpeed: 44,
  thrustUp: 1.4,
  thrustDown: 0.8,
  brake: 2.6,
  boostAmount: 0.55,
  yawRate: 1.15,
  pitchRate: 0.95,
  levelRate: 2.2,
  deadZone: 0.06,
  chaseDistance: 11.5,
  chaseHeight: 3.8,
  dockRange: 26,
  verticalSpeed: 16,
  dockTime: 1.5,
};

const TEXTURE_SLOTS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap'];

export function createFlight({ scene, camera, renderer, ship, dom, onStateChange, onEscape }) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(400);
  const rimLight = new THREE.DirectionalLight(0x7fb4ff, 0.9);
  rimLight.position.set(-200, 60, 300);
  const ambient = new THREE.AmbientLight(0x1a2438, 0.5);
  const hemi = new THREE.HemisphereLight(0x22305a, 0x0b0812, 0.45);
  root.add(sun, rimLight, ambient, hemi);

  const skyTexture = bakeSky(renderer);
  const hole = createBlackHole();
  root.add(hole.group);
  const asteroids = createAsteroidFields();
  root.add(asteroids.group);
  const dust = createDust();
  root.add(dust.points);
  const trail = createTrail();
  root.add(trail.points);

  const loader = new GLTFLoader();
  const mixers = [];
  const bodies = stations.map((station) => createStation(station, loader, mixers));
  bodies.forEach((body) => root.add(body.group));
  const routePath = createRoutePath(bodies.map((b) => b.position));
  root.add(routePath.points);

  const state = {
    active: false,
    mode: 'flight', // 'flight' | 'orbit' | 'transit' | 'escape'
    locked: null,
    dockable: null,
    tween: null,
    inputLocked: false,
    interacted: false,
    throttle: 0,
    thrustHeld: false,
    boostHeld: false,
    verticalHeld: 0,
    vertical: 0,
    stick: { active: false, x: 0, y: 0 },
    prewarmed: false,
    prewarmPromise: null,
    boost: false,
    speed: 0,
    steer: new THREE.Vector2(0, 0),
    pointer: new THREE.Vector2(0, 0),
    pointerInside: false,
    pointerFresh: 0,
    drag: { active: false, startX: 0, startY: 0, dx: 0, dy: 0, released: false },
    keysArmed: true,
    spaceWasDown: false,
    bank: 0,
    pitchVis: 0,
    orbit: { angle: 0, radius: 0, e1: new THREE.Vector3(), e2: new THREE.Vector3(), normal: new THREE.Vector3(), camAngle: 0 },
    camPos: new THREE.Vector3(),
    camLook: new THREE.Vector3(),
    camUp: new THREE.Vector3(0, 1, 0),
    nearest: null,
    forward: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    tmp: new THREE.Vector3(),
    tmp2: new THREE.Vector3(),
    tmp3: new THREE.Vector3(),
    tmpQ: new THREE.Quaternion(),
    tmpM: new THREE.Matrix4(),
  };

  function emit() {
    onStateChange?.({
      mode: state.mode,
      station: state.locked ? state.locked.station.id : null,
      dockable: state.dockable ? state.dockable.station.id : null,
      interacted: state.interacted,
    });
  }

  function noteInteraction() {
    if (state.interacted) return;
    state.interacted = true;
    emit();
  }

  // ------------------------------------------------------------------ input
  const onPointerMove = (event) => {
    if (!state.active) return;
    // Only a mouse cursor leads the nose. A finger has no resting position, so the place of the
    // last tap (a button, the stick) must never be read as a steering target.
    if (event.pointerType === 'mouse') {
      state.pointer.set((event.clientX / window.innerWidth) * 2 - 1, -((event.clientY / window.innerHeight) * 2 - 1));
      state.pointerInside = true;
      state.pointerFresh = 1;
    }
    if (state.drag.active) {
      state.drag.dx = event.clientX - state.drag.startX;
      state.drag.dy = event.clientY - state.drag.startY;
      const moved = Math.abs(state.drag.dx) + Math.abs(state.drag.dy);
      if (moved > 6) noteInteraction();
      if (moved > 24 && state.mode === 'orbit' && !state.drag.released) {
        state.drag.released = true;
        release();
      }
    }
  };
  const onPointerLeave = () => {
    state.pointerInside = false;
  };
  const onPointerDown = (event) => {
    if (!state.active || state.inputLocked || event.button !== 0) return;
    if (event.target.closest?.('[data-ui]')) return;
    // Touch steers with the on-screen stick only; dragging the scene would fight it.
    if (event.pointerType !== 'mouse') return;
    state.drag.active = true;
    state.drag.released = false;
    state.drag.startX = event.clientX;
    state.drag.startY = event.clientY;
    state.drag.dx = 0;
    state.drag.dy = 0;
  };
  const onPointerUp = () => {
    state.drag.active = false;
    state.drag.dx = 0;
    state.drag.dy = 0;
  };
  const onWheel = (event) => {
    if (!state.active || state.inputLocked) return;
    event.preventDefault();
    if (state.mode === 'orbit') {
      noteInteraction();
      release();
    }
  };

  function attachInput() {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('mouseleave', onPointerLeave);
  }
  function detachInput() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('wheel', onWheel);
    document.removeEventListener('mouseleave', onPointerLeave);
  }

  function readInput(keys, delta) {
    if (state.inputLocked) {
      state.throttle = Math.max(0, state.throttle - FLIGHT.thrustDown * delta);
      return { keyed: false, space: false, escape: false };
    }
    const spaceDown = keys.has(' ');
    const space = spaceDown && !state.spaceWasDown;
    state.spaceWasDown = spaceDown;

    const keyYaw = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const keyPitch = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
    // Vertical thrusters: R climbs, F descends (or the touch arrows), without pitching the nose.
    const verticalIn = state.verticalHeld || ((keys.has('r') ? 1 : 0) - (keys.has('f') ? 1 : 0));
    const thrusting = keys.has('w') || state.thrustHeld;
    const braking = keys.has('s');
    state.boost = keys.has('shift') || state.boostHeld;
    const stickLive = state.stick.active && Math.hypot(state.stick.x, state.stick.y) > FLIGHT.deadZone;
    const keyed = keyYaw !== 0 || keyPitch !== 0 || verticalIn !== 0 || thrusting || braking || state.boost || stickLive;
    if (keyed) noteInteraction();

    // Throttle only while W (or the touch button) is held; Shift boosts on its own. Nothing moves otherwise.
    if (braking) state.throttle = Math.max(0, state.throttle - FLIGHT.brake * delta);
    else if (thrusting) state.throttle = Math.min(1, state.throttle + FLIGHT.thrustUp * delta);
    else state.throttle = Math.max(0, state.throttle - FLIGHT.thrustDown * delta);

    // Steering: the cursor leads the nose. A drag acts as a stick. Keys override when used.
    let yaw = 0;
    let pitch = 0;
    if (state.stick.active) {
      // On-screen joystick: same dead zone and response curve as the cursor.
      const mag = Math.hypot(state.stick.x, state.stick.y);
      if (mag > FLIGHT.deadZone) {
        const scaled = (mag - FLIGHT.deadZone) / (1 - FLIGHT.deadZone);
        const curve = Math.pow(THREE.MathUtils.clamp(scaled, 0, 1), 1.5);
        yaw = (state.stick.x / mag) * curve;
        pitch = (state.stick.y / mag) * curve;
      }
    } else if (state.drag.active) {
      yaw = THREE.MathUtils.clamp(state.drag.dx / 110, -1, 1);
      pitch = THREE.MathUtils.clamp(-state.drag.dy / 110, -1, 1);
    } else if (state.pointerInside && state.pointerFresh > 0) {
      const px = state.pointer.x;
      const py = state.pointer.y;
      const mag = Math.hypot(px, py);
      if (mag > FLIGHT.deadZone) {
        const scaled = (mag - FLIGHT.deadZone) / (1 - FLIGHT.deadZone);
        const curve = Math.pow(THREE.MathUtils.clamp(scaled, 0, 1), 1.5);
        yaw = (px / mag) * curve;
        pitch = (py / mag) * curve;
      }
    }
    if (keyYaw || keyPitch) {
      yaw = keyYaw;
      pitch = keyPitch;
    }
    const k = 1 - Math.exp(-8 * delta);
    state.steer.x = THREE.MathUtils.lerp(state.steer.x, yaw, k);
    state.steer.y = THREE.MathUtils.lerp(state.steer.y, pitch, k);
    state.vertical = THREE.MathUtils.lerp(state.vertical, THREE.MathUtils.clamp(verticalIn, -1, 1), k);
    state.pointerFresh = Math.max(0, state.pointerFresh - delta * 0.2);
    return { keyed, space, escape: keys.has('escape') };
  }

  // ------------------------------------------------------------------ helpers
  function basis() {
    state.forward.copy(AXIS_Z).applyQuaternion(ship.group.quaternion);
    state.up.copy(AXIS_Y).applyQuaternion(ship.group.quaternion);
    state.right.copy(AXIS_X).negate().applyQuaternion(ship.group.quaternion);
  }

  // Orient a quaternion so local +Z points along `direction` with `up` as the reference up.
  function faceDirection(quaternion, direction, up = WORLD_UP) {
    state.tmpM.lookAt(state.tmp3.copy(direction), state.tmp2.set(0, 0, 0), up);
    quaternion.setFromRotationMatrix(state.tmpM);
  }

  function killTween() {
    if (state.tween) {
      state.tween.kill();
      state.tween = null;
    }
  }

  // Turn the heading toward (sign +1) or away from (sign -1) a unit direction by a small angle.
  function steerToward(direction, amount, sign = 1) {
    if (amount <= 0) return;
    basis();
    const axis = state.tmp2.crossVectors(state.forward, direction);
    if (axis.lengthSq() < 1e-6) axis.copy(state.up);
    axis.normalize();
    ship.group.quaternion.premultiply(state.tmpQ.setFromAxisAngle(axis, amount * sign));
  }

  // ------------------------------------------------------------------ docking
  function lock(body) {
    killTween();
    state.mode = 'docking';
    state.locked = body;
    state.dockable = null;
    state.keysArmed = false;
    state.throttle = 0;
    const { station } = body;
    const o = state.orbit;
    o.radius = station.radius * 1.9;
    o.normal.set(0.28, 1, 0.18).normalize();
    o.e1.crossVectors(o.normal, WORLD_UP);
    if (o.e1.lengthSq() < 1e-4) o.e1.set(1, 0, 0);
    o.e1.normalize();
    o.e2.crossVectors(o.normal, o.e1).normalize();
    state.tmp.subVectors(ship.group.position, body.position);
    o.angle = Math.atan2(state.tmp.dot(o.e2), state.tmp.dot(o.e1));
    o.camAngle = o.angle;
    body.pulse = 1;
    emit();
    // Glide onto the ring: the ship eases from wherever it is to an entry point a little further
    // round the orbit, the nose swings onto the tangent and the engines settle to idle. The camera
    // follows on a slower lag (see updateCamera) and the report opens once the ship is settled.
    const from = ship.group.position.clone();
    const startQ = ship.group.quaternion.clone();
    const endQ = new THREE.Quaternion();
    const entryAngle = o.angle + 0.4;
    const startSpeed = state.speed;
    const proxy = { t: 0 };
    state.tween = gsap.to(proxy, {
      t: 1,
      duration: FLIGHT.dockTime,
      ease: 'power2.inOut',
      onUpdate: () => {
        const a = THREE.MathUtils.lerp(o.angle, entryAngle, proxy.t);
        orbitPoint(a, state.tmp3);
        ship.group.position.lerpVectors(from, state.tmp3, proxy.t);
        const tangent = state.tmp.set(0, 0, 0).addScaledVector(o.e1, -Math.sin(a)).addScaledVector(o.e2, Math.cos(a)).normalize();
        faceDirection(endQ, tangent, o.normal);
        ship.group.quaternion.slerpQuaternions(startQ, endQ, proxy.t);
        state.speed = THREE.MathUtils.lerp(startSpeed, o.radius * 0.38, proxy.t);
        state.bank = THREE.MathUtils.lerp(state.bank, -0.3, 0.05);
        ship.inner.rotation.set(0.02, 0, state.bank);
        ship.setThrust(THREE.MathUtils.lerp(0.8, 0.35, proxy.t));
      },
      onComplete: () => {
        state.tween = null;
        o.angle = entryAngle;
        state.mode = 'orbit';
        gsap.to(camera, { fov: 44, duration: 0.24, yoyo: true, repeat: 1, ease: 'power2.out', onUpdate: () => camera.updateProjectionMatrix() });
        emit();
      },
    });
  }

  function orbitPoint(angle, target) {
    const o = state.orbit;
    return target.copy(state.locked.position)
      .addScaledVector(o.e1, Math.cos(angle) * o.radius)
      .addScaledVector(o.e2, Math.sin(angle) * o.radius);
  }

  function release() {
    if (state.mode !== 'orbit') return;
    const o = state.orbit;
    killTween();
    state.mode = 'transit';
    state.locked = null;
    const from = ship.group.position.clone();
    const tangent = new THREE.Vector3().addScaledVector(o.e1, -Math.sin(o.angle)).addScaledVector(o.e2, Math.cos(o.angle)).normalize();
    const target = from.clone().addScaledVector(tangent, o.radius + 16).addScaledVector(o.normal, 3);
    const startQ = ship.group.quaternion.clone();
    const endQ = new THREE.Quaternion();
    faceDirection(endQ, tangent);
    // Engines spool up over the first part of the push-off rather than slamming to full.
    const thrust = { value: 0.35 };
    gsap.to(thrust, { value: 1.1, duration: 0.8, ease: 'power2.in', onUpdate: () => ship.setThrust(thrust.value) });
    const orbitSpeed = o.radius * 0.38;
    const proxy = { t: 0 };
    state.tween = gsap.to(proxy, {
      t: 1,
      duration: 1.4,
      ease: 'power2.in',
      onUpdate: () => {
        ship.group.position.lerpVectors(from, target, proxy.t);
        ship.group.quaternion.slerpQuaternions(startQ, endQ, Math.min(1, proxy.t * 1.6));
        state.speed = THREE.MathUtils.lerp(orbitSpeed, 16, proxy.t);
        state.bank = THREE.MathUtils.lerp(state.bank, 0, 0.04);
        ship.inner.rotation.set(0.02 * (1 - proxy.t), 0, state.bank);
      },
      onComplete: () => {
        state.tween = null;
        state.mode = 'flight';
        state.throttle = 0.35;
        state.speed = 16;
        state.steer.set(0, 0);
        emit();
      },
    });
    emit();
  }

  // ------------------------------------------------------------------ frame
  function update(delta, elapsed, keys) {
    if (!state.active) return;
    mixers.forEach((mixer) => mixer.update(delta));
    asteroids.update(delta);
    dust.update(elapsed);
    trail.update(elapsed);
    routePath.update(elapsed);
    hole.update(elapsed);
    bodies.forEach((body) => body.update(delta, elapsed));

    if (state.mode === 'flight') {
      updateFlight(delta, keys);
    } else if (state.mode === 'orbit') {
      const input = readInput(keys, delta);
      if (!input.keyed) state.keysArmed = true;
      if (input.escape || input.space) release();
      else if (input.keyed && state.keysArmed) release();
      else updateOrbit(delta);
    } else if (state.mode === 'transit' || state.mode === 'docking') {
      readInput(keys, delta);
    }

    emitTrail(elapsed);
    updateProximity();
    updateCamera(delta);
    updateDom();
  }

  function updateFlight(delta, keys) {
    const { space } = readInput(keys, delta);

    // Heading: yaw around local up, pitch around local right.
    const yawAngle = -state.steer.x * FLIGHT.yawRate * delta;
    const pitchAngle = -state.steer.y * FLIGHT.pitchRate * delta;
    ship.group.quaternion.multiply(state.tmpQ.setFromAxisAngle(AXIS_Y, yawAngle));
    ship.group.quaternion.multiply(state.tmpQ.setFromAxisAngle(AXIS_X, pitchAngle));
    basis();

    // Auto-level: roll so the ship's up lines up with world up projected off the forward axis.
    state.tmp.copy(WORLD_UP).addScaledVector(state.forward, -WORLD_UP.dot(state.forward));
    if (state.tmp.lengthSq() > 1e-5) {
      state.tmp.normalize();
      const rollError = Math.atan2(state.tmp2.crossVectors(state.up, state.tmp).dot(state.forward), state.up.dot(state.tmp));
      ship.group.quaternion.multiply(state.tmpQ.setFromAxisAngle(AXIS_Z, rollError * Math.min(1, FLIGHT.levelRate * delta)));
    }

    // Gravity well: the black hole bends the heading and drags the ship once it is close.
    const toHole = state.tmp3.subVectors(HOLE.center, ship.group.position);
    const holeDist = toHole.length();
    const pull = THREE.MathUtils.clamp(1 - (holeDist - HOLE.radius * 1.4) / (HOLE.radius * 2.4), 0, 1);
    let dragged = 0;
    if (pull > 0) {
      steerToward(toHole.normalize(), pull * pull * 1.3 * delta, 1);
      dragged = pull * pull * 22;
    }
    if (holeDist < HOLE.radius * 1.45) {
      escapeThroughHole();
      return;
    }
    // Soft boundary: turn back toward the flight volume.
    const fromCenter = state.tmp3.subVectors(ship.group.position, BOUNDS.center);
    const outside = fromCenter.length() - BOUNDS.radius;
    if (outside > -40) steerToward(fromCenter.normalize(), THREE.MathUtils.clamp((outside + 40) / 60, 0, 1) * 1.8 * delta, -1);

    // Speed and motion.
    const targetSpeed = Math.min(FLIGHT.maxSpeed * 1.25, (state.throttle + (state.boost ? FLIGHT.boostAmount : 0)) * FLIGHT.maxSpeed + dragged);
    state.speed = THREE.MathUtils.lerp(state.speed, targetSpeed, 1 - Math.exp(-2.4 * delta));
    basis();
    ship.group.position.addScaledVector(state.forward, state.speed * delta);
    // Vertical thrusters move the ship along world up so altitude can change without a pitch input.
    if (Math.abs(state.vertical) > 0.001) ship.group.position.addScaledVector(WORLD_UP, state.vertical * FLIGHT.verticalSpeed * delta);

    // Visual bank and pitch on the model.
    const k = 1 - Math.exp(-6 * delta);
    state.bank = THREE.MathUtils.lerp(state.bank, -state.steer.x * 0.62, k);
    state.pitchVis = THREE.MathUtils.lerp(state.pitchVis, state.steer.y * 0.12 + state.vertical * 0.1, k);
    ship.inner.rotation.set(-state.pitchVis, 0, state.bank);
    ship.setThrust(0.18 + (state.speed / FLIGHT.maxSpeed) * 0.55 + (state.boost ? 0.25 : 0) + Math.abs(state.vertical) * 0.2);

    // Docking candidates.
    let nearest = null;
    let nearestDist = Infinity;
    for (const body of bodies) {
      const dist = ship.group.position.distanceTo(body.position);
      if (dist < FLIGHT.dockRange + body.station.radius * 2 && dist < nearestDist) {
        nearest = body;
        nearestDist = dist;
      }
    }
    if (nearest !== state.dockable) {
      state.dockable = nearest;
      emit();
    }
    if (space && nearest) lock(nearest);
  }

  function escapeThroughHole() {
    if (state.mode === 'escape') return;
    state.mode = 'escape';
    state.dockable = null;
    killTween();
    emit();
    ship.setThrust(1.6);
    // Brief plunge, then hand off to the hero.
    const from = ship.group.position.clone();
    const to = HOLE.center.clone();
    const proxy = { t: 0 };
    state.tween = gsap.to(proxy, {
      t: 1,
      duration: 0.9,
      ease: 'power3.in',
      onUpdate: () => {
        ship.group.position.lerpVectors(from, to, proxy.t * 0.6);
      },
      onComplete: () => {
        state.tween = null;
        onEscape?.();
      },
    });
  }

  function updateOrbit(delta) {
    const o = state.orbit;
    o.angle += delta * 0.38;
    orbitPoint(o.angle, ship.group.position);
    const tangent = state.tmp.set(0, 0, 0).addScaledVector(o.e1, -Math.sin(o.angle)).addScaledVector(o.e2, Math.cos(o.angle)).normalize();
    faceDirection(ship.group.quaternion, tangent, o.normal);
    state.bank = THREE.MathUtils.lerp(state.bank, -0.3, 1 - Math.exp(-4 * delta));
    ship.inner.rotation.set(0.02, 0, state.bank);
    state.speed = o.radius * 0.38;
  }

  let trailSide = 1;
  function emitTrail(elapsed) {
    const speed = state.mode === 'transit' || state.mode === 'escape' ? 24 : state.speed;
    if (speed < 4) return;
    basis();
    ship.group.getWorldPosition(state.tmp);
    const scale = ship.group.scale.x;
    const base = state.tmp.addScaledVector(state.forward, -1.7 * scale);
    const spread = 0.17 * scale * trailSide;
    trailSide = -trailSide;
    trail.emit(base.x + state.right.x * spread, base.y + state.right.y * spread, base.z + state.right.z * spread, elapsed, Math.min(1, speed / FLIGHT.maxSpeed));
  }

  function updateProximity() {
    bodies.forEach((body) => {
      const dist = ship.group.position.distanceTo(body.position);
      const near = THREE.MathUtils.clamp(1 - (dist - FLIGHT.dockRange) / 60, 0, 1);
      body.setProximity(near, state.locked === body);
    });
  }

  function updateCamera(delta) {
    // The camera lags more while docking and leaving so the framing change reads as a glide.
    const rate = state.mode === 'docking' ? 1.9 : state.mode === 'transit' ? 2.6 : 4.2;
    const k = 1 - Math.exp(-rate * delta);
    if (state.mode === 'orbit' || state.mode === 'docking') {
      const body = state.locked;
      const o = state.orbit;
      const r = body.station.radius;
      const dist = r * 3.2 + 9;
      state.tmp.copy(body.position)
        .addScaledVector(o.e1, Math.cos(o.camAngle) * dist)
        .addScaledVector(o.e2, Math.sin(o.camAngle) * dist)
        .addScaledVector(o.normal, r * 0.9);
      state.camPos.lerp(state.tmp, k);
      state.tmp2.subVectors(body.position, state.camPos).normalize();
      const side = camera.aspect < 1 ? 0.05 : camera.aspect < 1.5 ? 0.95 : 0.4;
      state.right.crossVectors(state.tmp2, WORLD_UP).normalize();
      state.tmp.copy(body.position).addScaledVector(state.right, r * side);
      state.camLook.lerp(state.tmp, k);
      state.camUp.lerp(WORLD_UP, k);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 46, k);
      camera.updateProjectionMatrix();
    } else {
      basis();
      const speedT = THREE.MathUtils.clamp(state.speed / FLIGHT.maxSpeed, 0, 1.3);
      state.tmp2.copy(state.up).lerp(WORLD_UP, 0.75).normalize();
      state.tmp.copy(ship.group.position)
        .addScaledVector(state.forward, -(FLIGHT.chaseDistance + speedT * 2.5))
        .addScaledVector(state.tmp2, FLIGHT.chaseHeight);
      state.camPos.lerp(state.tmp, k);
      state.tmp.copy(ship.group.position).addScaledVector(state.forward, 14).addScaledVector(state.tmp2, -0.2);
      state.camLook.lerp(state.tmp, k);
      state.camUp.lerp(state.tmp2, k);
      const targetFov = 48 + speedT * 12 + (state.boost ? 6 : 0);
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, k);
      camera.updateProjectionMatrix();
    }
    camera.position.copy(state.camPos);
    camera.up.copy(state.camUp).normalize();
    camera.lookAt(state.camLook);
  }

  const projected = new THREE.Vector3();
  function project(point) {
    projected.copy(point).project(camera);
    return {
      x: (projected.x + 1) / 2 * window.innerWidth,
      y: (1 - projected.y) / 2 * window.innerHeight,
      inFront: projected.z < 1 && Math.abs(projected.x) < 1.15 && Math.abs(projected.y) < 1.15,
    };
  }

  function placeLabel(label, point, dist, show, fade) {
    const p = project(point);
    // Labels fade out as they drift under the top bar instead of sitting on the nav.
    const topBand = THREE.MathUtils.clamp((p.y - 64) / 48, 0, 1);
    const opacity = show && p.inFront ? THREE.MathUtils.clamp(fade, 0, 1) * topBand : 0;
    if (opacity > 0) {
      label.style.setProperty('--lx', `${p.x.toFixed(1)}px`);
      label.style.setProperty('--ly', `${p.y.toFixed(1)}px`);
      const distEl = label.querySelector('[data-dist]');
      if (distEl) distEl.textContent = `${Math.round(dist * 24)} km`;
    }
    label.style.opacity = opacity.toFixed(2);
  }

  function updateDom() {
    let nearest = null;
    let nearestDist = Infinity;
    bodies.forEach((body) => {
      const dist = ship.group.position.distanceTo(body.position);
      if (dist < nearestDist) {
        nearest = body;
        nearestDist = dist;
      }
    });
    state.nearest = nearest;

    const marker = dom.marker?.();
    if (marker && nearest) {
      const index = bodies.indexOf(nearest);
      const prev = bodies[index - 1];
      const next = bodies[index + 1];
      let frac = index / (bodies.length - 1);
      const neighbour = next && (!prev || ship.group.position.distanceTo(next.position) < ship.group.position.distanceTo(prev.position)) ? next : prev;
      if (neighbour) {
        const dn = ship.group.position.distanceTo(neighbour.position);
        const t = THREE.MathUtils.clamp(nearestDist / (nearestDist + dn), 0, 0.5);
        frac = THREE.MathUtils.lerp(index, bodies.indexOf(neighbour), t) / (bodies.length - 1);
      }
      marker.style.left = `${(frac * 100).toFixed(2)}%`;
    }

    const hud = dom.hud?.();
    if (hud) {
      hud.style.setProperty('--thr', THREE.MathUtils.clamp(state.throttle + (state.boost ? FLIGHT.boostAmount : 0), 0, 1).toFixed(3));
      const speedEl = hud.querySelector('[data-speed]');
      if (speedEl) speedEl.textContent = `${Math.round(state.speed * 24)} km/s`;
    }

    const holeLabel = dom.label?.('blackhole');
    if (holeLabel) {
      const dist = ship.group.position.distanceTo(HOLE.center) - HOLE.radius;
      placeLabel(holeLabel, state.tmp.copy(HOLE.center).addScaledVector(WORLD_UP, HOLE.radius * 1.5), dist, state.mode !== 'orbit' && state.mode !== 'docking', (420 - dist) / 80);
    }

    bodies.forEach((body) => {
      const { station } = body;
      const isOpen = state.locked === body && state.mode === 'orbit';
      const isTarget = state.locked === body;

      const panel = dom.panel?.(station.id);
      if (panel) {
        if (!isOpen) {
          if (panel.dataset.open === 'true') panel.dataset.open = 'false';
        } else {
          state.tmp2.subVectors(body.position, camera.position).normalize();
          state.right.crossVectors(state.tmp2, WORLD_UP).normalize();
          const anchor = state.tmp.copy(body.position).addScaledVector(state.right, station.radius * 1.2).addScaledVector(WORLD_UP, station.radius * 0.5);
          const p = project(anchor);
          const w = panel.offsetWidth || 420;
          const h = panel.offsetHeight || 400;
          const x = THREE.MathUtils.clamp(p.x, 24, window.innerWidth - w - 24);
          const y = THREE.MathUtils.clamp(p.y, 84 + h / 2, window.innerHeight - 96 - h / 2);
          panel.style.setProperty('--ax', `${x.toFixed(1)}px`);
          panel.style.setProperty('--ay', `${y.toFixed(1)}px`);
          if (panel.dataset.open !== 'true') panel.dataset.open = 'true';
        }
      }

      const label = dom.label?.(station.id);
      if (label) {
        const dist = ship.group.position.distanceTo(body.position);
        placeLabel(label, state.tmp.copy(body.position).addScaledVector(WORLD_UP, station.radius * 1.25), dist, !isTarget && state.mode !== 'orbit' && state.mode !== 'docking' && dist < 260, (260 - dist) / 60);
      }
    });
  }

  // ------------------------------------------------------------------ public
  return {
    root,
    state,
    enter() {
      state.active = true;
      state.mode = 'flight';
      state.locked = null;
      state.dockable = null;
      state.throttle = 0;
      state.thrustHeld = false;
      state.speed = 0;
      state.steer.set(0, 0);
      state.pointerFresh = 0;
      root.visible = true;
      scene.background = skyTexture;
      ship.group.visible = true;
      ship.group.scale.setScalar(1);
      ship.group.position.copy(START.position);
      faceDirection(ship.group.quaternion, START.heading);
      ship.inner.rotation.set(0, 0, 0);
      ship.inner.up.set(0, 1, 0);
      ship.setThrust(0.25);
      basis();
      // Cinematic settle: the camera starts high, wide and off to the side, then eases into the chase.
      state.camPos.copy(ship.group.position).addScaledVector(state.forward, -26).addScaledVector(WORLD_UP, 10).addScaledVector(state.right, 8);
      state.camLook.copy(ship.group.position);
      state.camUp.copy(WORLD_UP);
      camera.position.copy(state.camPos);
      camera.up.copy(WORLD_UP);
      camera.lookAt(state.camLook);
      camera.fov = 58;
      camera.updateProjectionMatrix();
      attachInput();
      emit();
    },
    exit() {
      state.active = false;
      state.mode = 'flight';
      root.visible = false;
      scene.background = null;
      camera.up.set(0, 1, 0);
      killTween();
      detachInput();
    },
    update,
    leaveOrbit: () => release(),
    dock(id) {
      if (!state.active || state.mode !== 'flight') return;
      const body = bodies.find((b) => b.station.id === id);
      if (!body) return;
      if (ship.group.position.distanceTo(body.position) < FLIGHT.dockRange + body.station.radius * 2) lock(body);
    },
    setInputLocked(locked) {
      state.inputLocked = locked;
      if (locked) {
        state.drag.active = false;
        state.stick.active = false;
        state.steer.set(0, 0);
        state.thrustHeld = false;
        state.boostHeld = false;
        state.verticalHeld = 0;
      }
    },
    setThrustHeld(held) {
      state.thrustHeld = held;
      if (held) noteInteraction();
    },
    setBoostHeld(held) {
      state.boostHeld = held;
      if (held) noteInteraction();
    },
    setVertical(direction) {
      state.verticalHeld = THREE.MathUtils.clamp(direction, -1, 1);
      if (direction) noteInteraction();
    },
    setStick(x, y, active) {
      state.stick.active = active;
      state.stick.x = active ? THREE.MathUtils.clamp(x, -1, 1) : 0;
      state.stick.y = active ? THREE.MathUtils.clamp(y, -1, 1) : 0;
    },
    // Get the route ready to draw before the wormhole lets go of the player: wait for the station
    // models, compile every route program with the route's own lights (no frame is drawn), then
    // push the textures to the GPU. Without this the first route frame stalls on compilation.
    prewarm({ beforeCompile, afterCompile } = {}) {
      if (!state.prewarmPromise) {
        state.prewarmPromise = (async () => {
          await new Promise((resolve) => {
            const check = () => (bodies.every((b) => b.loaded) ? resolve() : window.setTimeout(check, 120));
            check();
          });
          const wasVisible = root.visible;
          let pending = Promise.resolve();
          try {
            beforeCompile?.();
            root.visible = true;
            if (typeof renderer.compileAsync === 'function') {
              pending = Promise.all([renderer.compileAsync(root, camera, scene), renderer.compileAsync(ship.group, camera, scene)]);
            } else {
              renderer.compile(root, camera, scene);
              renderer.compile(ship.group, camera, scene);
            }
          } catch (error) {
            pending = Promise.resolve();
          } finally {
            root.visible = wasVisible;
            afterCompile?.();
          }
          try { await pending; } catch { /* programs will compile lazily instead */ }
          const seen = new Set();
          root.traverse((object) => {
            const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
            materials.forEach((material) => {
              TEXTURE_SLOTS.forEach((key) => {
                const texture = material[key];
                if (texture?.isTexture && !seen.has(texture)) {
                  seen.add(texture);
                  try { renderer.initTexture(texture); } catch { /* ignore */ }
                }
              });
            });
          });
          state.prewarmed = true;
        })();
      }
      return state.prewarmPromise;
    },
    jumpTo(id) {
      const body = bodies.find((b) => b.station.id === id);
      if (!body || !state.active || state.locked === body || state.mode === 'escape') return;
      killTween();
      state.mode = 'transit';
      state.locked = null;
      state.dockable = null;
      ship.setThrust(1.5);
      emit();
      // A curved autopilot path that arrives at orbit distance on the side the ship comes from.
      const from = ship.group.position.clone();
      const approach = from.clone().sub(body.position);
      if (approach.lengthSq() < 1) approach.set(0, 0, -1);
      approach.normalize();
      const end = body.position.clone().addScaledVector(approach, body.station.radius * 3.4 + 6);
      const mid = from.clone().lerp(end, 0.5).addScaledVector(WORLD_UP, Math.min(30, from.distanceTo(end) * 0.15));
      const curve = new THREE.QuadraticBezierCurve3(from, mid, end);
      const startQ = ship.group.quaternion.clone();
      const dirQ = new THREE.Quaternion();
      const proxy = { t: 0 };
      const dist = curve.getLength();
      state.tween = gsap.to(proxy, {
        t: 1,
        duration: THREE.MathUtils.clamp(dist / 55, 1.2, 4.5),
        ease: 'power2.inOut',
        onUpdate: () => {
          curve.getPoint(proxy.t, ship.group.position);
          curve.getTangent(Math.min(0.999, proxy.t + 0.001), state.tmp);
          faceDirection(dirQ, state.tmp);
          ship.group.quaternion.copy(startQ).slerp(dirQ, Math.min(1, proxy.t * 4));
          state.speed = 30;
        },
        onComplete: () => {
          state.tween = null;
          state.mode = 'flight';
          lock(body);
        },
      });
    },
    isReady: () => state.prewarmed && bodies.every((b) => b.loaded),
  };
}

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

function createStation(station, loader, mixers) {
  const position = new THREE.Vector3(station.position[0], station.position[1], station.position[2]);
  const group = new THREE.Group();
  group.position.copy(position);
  const spinner = new THREE.Group();
  spinner.rotation.z = station.tilt;
  group.add(spinner);

  const body = { station, group, spinner, position, loaded: false, pulse: 0, update: () => {}, setProximity: () => {} };

  if (station.kind === 'star') {
    const sun = createSun(station);
    group.add(sun.group);
    body.loaded = true;
    body.update = (delta, elapsed) => {
      sun.update(elapsed);
      spinner.rotation.y += delta * station.spin;
    };
    body.setProximity = (near) => sun.setProximity(near);
    return body;
  }

  const placeholder = new THREE.Mesh(
    new THREE.SphereGeometry(station.radius, 48, 48),
    new THREE.MeshStandardMaterial({ color: station.color, roughness: 0.9, metalness: 0 }),
  );
  spinner.add(placeholder);

  const rim = createRimGlow(station.radius * 1.03, station.color, { power: 3.4, strength: 0.8, sunDirection: SUN_DIRECTION });
  const halo = createHalo(station.radius * 1.24, station.color, { strength: 0.42, sunDirection: SUN_DIRECTION, softness: 0.75 });
  group.add(rim, halo);

  loader.load(
    station.model,
    (gltf) => {
      const model = gltf.scene;
      normalizeModel(model, station.radius * 2);
      model.traverse((object) => {
        // Drop authored tangents: zero-length ones turn into NaNs that the bloom pass smears into black blocks.
        if (object.isMesh && object.geometry?.attributes?.tangent) object.geometry.deleteAttribute('tangent');
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (!material) return;
          if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
          if (material.emissiveMap) material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          if (material.emissive && (material.emissiveMap || material.emissive.getHex() !== 0)) {
            material.emissiveIntensity = Math.min(material.emissiveIntensity ?? 1, station.emissive ?? 0.18);
          }
          if (material.color && station.exposure) material.color.multiplyScalar(station.exposure);
          material.envMapIntensity = 0.5;
          material.needsUpdate = true;
        });
      });
      if (station.animate && gltf.animations?.length) {
        const mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
        mixers.push(mixer);
      }
      placeholder.visible = false;
      spinner.add(model);
      body.loaded = true;
    },
    undefined,
    () => {
      body.loaded = true;
    },
  );

  body.update = (delta) => {
    spinner.rotation.y += delta * station.spin;
    body.pulse = Math.max(0, body.pulse - delta * 1.6);
  };
  body.setProximity = (near, docked) => {
    const base = docked ? 0.9 : 0.55;
    rim.material.uniforms.strength.value = base + near * 0.9 + body.pulse * 1.4;
    halo.material.uniforms.strength.value = 0.32 + near * 0.35 + body.pulse * 0.5;
  };
  return body;
}

function createSun(station) {
  const group = new THREE.Group();
  const r = station.radius;
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(r, 96, 96),
    new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        colorA: { value: new THREE.Color(0xff6a12) },
        colorB: { value: new THREE.Color(0xffc857) },
        colorC: { value: new THREE.Color(0xfff4d6) },
      },
      vertexShader: FRESNEL_VERTEX,
      fragmentShader: /* glsl */ `
        uniform float time;
        uniform vec3 colorA;
        uniform vec3 colorB;
        uniform vec3 colorC;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vLocal;
        ${NOISE3_GLSL}
        void main() {
          vec3 p = normalize(vLocal);
          float cells = fbm3(p * 3.2 + vec3(0.0, time * 0.04, 0.0));
          float fine = fbm3(p * 9.0 - vec3(time * 0.07, 0.0, time * 0.03));
          float gran = smoothstep(0.32, 0.78, cells) * 0.75 + fine * 0.55;
          vec3 col = mix(colorA, colorB, gran);
          col = mix(col, colorC, pow(fine, 3.2) * 0.9);
          float limb = 1.0 - pow(1.0 - clamp(dot(vNormal, vViewDir), 0.0, 1.0), 2.2) * 0.55;
          gl_FragColor = vec4(col * limb * 1.35, 1.0);
        }
      `,
    }),
  );
  surface.material.toneMapped = false;
  group.add(surface);

  const corona = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.55, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0xffb15c) }, strength: { value: 1.0 } },
      vertexShader: FRESNEL_VERTEX,
      fragmentShader: /* glsl */ `
        uniform float time;
        uniform vec3 color;
        uniform float strength;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vLocal;
        ${NOISE3_GLSL}
        void main() {
          float facing = -dot(vNormal, vViewDir);
          float n = fbm3(normalize(vLocal) * 4.0 + vec3(time * 0.12, -time * 0.05, 0.0));
          float streaks = fbm3(normalize(vLocal) * vec3(2.0, 12.0, 2.0) + time * 0.2);
          float halo = pow(smoothstep(0.0, 0.8, facing), 2.6) * (0.55 + 0.6 * n + 0.25 * streaks);
          gl_FragColor = vec4(color * halo * strength * 0.55, 1.0);
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(corona);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: createStarSprite(), color: 0xffc37a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(r * 3.0, r * 3.0, 1);
  group.add(glow);
  const light = new THREE.PointLight(0xffd9a0, 40, 260, 1.6);
  group.add(light);

  return {
    group,
    update(time) {
      surface.material.uniforms.time.value = time;
      corona.material.uniforms.time.value = time;
      const s = r * (3.0 + Math.sin(time * 1.3) * 0.1);
      glow.scale.set(s, s, 1);
    },
    setProximity(near) {
      corona.material.uniforms.strength.value = 1.0 + near * 0.3;
    },
  };
}

// ---------------------------------------------------------------------------
// Sky, black hole, belts, dust, trail, route path
// ---------------------------------------------------------------------------

// The whole sky is baked once into a cube map: nebulae, a galaxy band and stars.
function bakeSky(renderer) {
  const size = Math.min(window.devicePixelRatio, 1.75) > 1.3 ? 1024 : 768;
  const target = new THREE.WebGLCubeRenderTarget(size, { generateMipmaps: false });
  const cubeCamera = new THREE.CubeCamera(0.5, 200, target);
  const skyScene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(100, 48, 48),
    new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        ${NOISE3_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float n1 = fbm3(d * 2.4 + 3.1);
          float n2 = fbm3(d * 5.5 + n1 * 1.6 + 7.7);
          float n3 = fbm3(d * 12.0 - n2 * 0.9 + 1.3);
          float band = exp(-pow((d.y + 0.18 * d.x) * 3.2, 2.0));
          float cloud = smoothstep(0.42, 0.86, n2) * smoothstep(0.3, 0.8, n1);
          vec3 deep = vec3(0.05, 0.08, 0.24);
          vec3 violet = vec3(0.34, 0.12, 0.48);
          vec3 ember = vec3(0.86, 0.5, 0.3);
          vec3 teal = vec3(0.1, 0.42, 0.5);
          vec3 col = mix(deep, violet, n1);
          col = mix(col, teal, smoothstep(0.55, 0.9, n3) * 0.6);
          col = mix(col, ember, pow(n3, 3.0) * 0.7 * band);
          vec3 sky = col * cloud * (0.42 + band * 0.5) + vec3(0.006, 0.008, 0.016);
          vec3 g1 = floor(d * 520.0);
          float s1 = hash3(g1);
          float star1 = smoothstep(0.9965, 1.0, s1) * (0.5 + hash3(g1 + 11.0) * 0.8);
          vec3 g2 = floor(d * 190.0);
          float s2 = hash3(g2 + 5.0);
          float star2 = smoothstep(0.9988, 1.0, s2) * (1.2 + hash3(g2 + 3.0));
          vec3 starCol = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.88, 0.7), hash3(g1 + 2.0));
          sky += starCol * (star1 + star2) * (0.6 + band * 0.6);
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  skyScene.add(sky);
  cubeCamera.update(renderer, skyScene);
  sky.geometry.dispose();
  sky.material.dispose();
  return target.texture;
}

// A stylised black hole: event horizon, photon ring, tilted accretion disk, soft lensing halo.
function createBlackHole() {
  const group = new THREE.Group();
  group.position.copy(HOLE.center);
  const r = HOLE.radius;

  const horizon = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 64), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  group.add(horizon);

  const photonRing = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.03, 96, 96),
    new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xffd9a8) } },
      vertexShader: FRESNEL_VERTEX,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float f = pow(1.0 - clamp(dot(vNormal, vViewDir), 0.0, 1.0), 14.0);
          gl_FragColor = vec4(color * f * 5.0, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  photonRing.material.toneMapped = false;
  group.add(photonRing);

  const disk = new THREE.Mesh(
    new THREE.RingGeometry(r * 1.25, r * 4.0, 160, 12),
    new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        inner: { value: r * 1.25 },
        outer: { value: r * 4.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocal;
        void main() {
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float time;
        uniform float inner;
        uniform float outer;
        varying vec3 vLocal;
        ${NOISE3_GLSL}
        void main() {
          float radius = length(vLocal.xy);
          float rn = clamp((radius - inner) / (outer - inner), 0.0, 1.0);
          float a = atan(vLocal.y, vLocal.x);
          // Material spirals inward faster near the horizon.
          float spin = time * (0.45 + (1.0 - rn) * 1.2);
          float swirl = fbm3(vec3(cos(a - spin) * 2.6 + rn * 5.0, sin(a - spin) * 2.6, rn * 7.0 - time * 0.15));
          float lanes = 0.5 + 0.5 * sin(rn * 46.0 + swirl * 7.0 - time * 1.2);
          float body = smoothstep(0.0, 0.05, rn) * pow(1.0 - rn, 1.5);
          float doppler = 0.55 + 0.45 * sin(a + 1.1);
          vec3 hot = vec3(1.0, 0.94, 0.8);
          vec3 warm = vec3(1.0, 0.56, 0.22);
          vec3 cool = vec3(0.55, 0.14, 0.05);
          vec3 col = mix(hot, warm, smoothstep(0.0, 0.3, rn));
          col = mix(col, cool, smoothstep(0.3, 1.0, rn));
          float alpha = body * (0.3 + 0.7 * lanes * (0.5 + swirl)) * doppler;
          gl_FragColor = vec4(col * alpha * 2.4, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  disk.material.toneMapped = false;
  disk.rotation.x = -Math.PI / 2 + HOLE.tilt;
  disk.rotation.z = 0.4;
  group.add(disk);

  const halo = createHalo(r * 1.6, 0xff9a4a, { strength: 0.55, sunDirection: WORLD_UP, softness: 0.7 });
  group.add(halo);
  const light = new THREE.PointLight(0xffa860, 60, 520, 1.5);
  group.add(light);

  return {
    group,
    update(time) {
      disk.material.uniforms.time.value = time;
    },
  };
}

function createAsteroidFields() {
  const group = new THREE.Group();
  const variants = [3, 11, 27, 41].map((seed) => createAsteroidGeometry(seed, 3));
  const material = new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.88, metalness: 0.04, vertexColors: true });
  const rand = seeded(7);
  const placements = [];

  // Debris orbiting outside the accretion disk, in the disk's tilted plane.
  const tilt = new THREE.Matrix4().makeRotationX(HOLE.tilt).multiply(new THREE.Matrix4().makeRotationZ(0.4));
  const v = new THREE.Vector3();
  for (let i = 0; i < 420; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = HOLE.radius * 4.4 + rand() * HOLE.radius * 2.6;
    v.set(Math.cos(angle) * radius, (rand() - 0.5) * 10, Math.sin(angle) * radius).applyMatrix4(tilt).add(HOLE.center);
    placements.push({
      x: v.x, y: v.y, z: v.z,
      s: 1.0 + rand() * 4.0,
      variant: Math.floor(rand() * 4),
      rx: rand() * Math.PI, ry: rand() * Math.PI, rz: rand() * Math.PI,
      sx: (rand() - 0.5) * 0.2, sy: (rand() - 0.5) * 0.2,
      tint: 0.65 + rand() * 0.4, warm: rand(),
    });
  }
  // Loose rocks scattered through the flight volume for parallax, clear of the start lane.
  for (let i = 0; i < 150; i += 1) {
    const x = (rand() - 0.5) * 360;
    const y = -10 + rand() * 70;
    const z = -40 + rand() * 420;
    if (Math.abs(x) < 14 && z < 40) continue;
    placements.push({
      x, y, z,
      s: 0.5 + rand() * 2.6,
      variant: Math.floor(rand() * 4),
      rx: rand() * Math.PI, ry: rand() * Math.PI, rz: rand() * Math.PI,
      sx: (rand() - 0.5) * 0.5, sy: (rand() - 0.5) * 0.5,
      tint: 0.7 + rand() * 0.35, warm: rand(),
    });
  }

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const meshes = variants.map((geometry, index) => {
    const own = placements.filter((p) => p.variant === index);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, own.length));
    own.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setRGB(p.tint * (0.92 + p.warm * 0.12), p.tint * 0.96, p.tint * (1.0 - p.warm * 0.08));
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    return { mesh, own };
  });

  let tick = 0;
  return {
    group,
    update(delta) {
      tick = (tick + 1) % 4;
      meshes.forEach(({ mesh, own }) => {
        for (let i = tick; i < own.length; i += 4) {
          const p = own[i];
          p.rx += p.sx * delta * 4;
          p.ry += p.sy * delta * 4;
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(p.rx, p.ry, p.rz);
          dummy.scale.setScalar(p.s);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      });
    },
  };
}

function createDust() {
  const count = 2600;
  const positions = new Float32Array(count * 3);
  const rand = seeded(11);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rand() - 0.5) * 380;
    positions[i * 3 + 1] = -20 + rand() * 90;
    positions[i * 3 + 2] = -60 + rand() * 460;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: 0.16, map: createStarSprite(), color: 0xbfe3ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  points.frustumCulled = false;
  return {
    points,
    update(elapsed) {
      points.position.y = Math.sin(elapsed * 0.15) * 0.6;
    },
  };
}

// A short, soft exhaust trail: one particle per frame, fast fade, dim additive.
function createTrail() {
  const count = 240;
  const positions = new Float32Array(count * 3);
  const births = new Float32Array(count).fill(-100);
  const strengths = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('birth', new THREE.BufferAttribute(births, 1));
  geometry.setAttribute('strength', new THREE.BufferAttribute(strengths, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      life: { value: 0.65 },
      scale: { value: window.innerHeight * Math.min(window.devicePixelRatio, 1.75) * 0.5 },
      map: { value: createStarSprite() },
      colorA: { value: new THREE.Color(0xd8c8ff) },
      colorB: { value: new THREE.Color(0x5a4de0) },
    },
    vertexShader: /* glsl */ `
      attribute float birth;
      attribute float strength;
      uniform float time;
      uniform float life;
      uniform float scale;
      varying float vLife;
      varying float vStrength;
      void main() {
        float age = (time - birth) / life;
        vLife = 1.0 - clamp(age, 0.0, 1.0);
        vStrength = strength;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.1 + 0.32 * vLife) * scale / -mvPosition.z;
        gl_Position = vLife <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 colorA;
      uniform vec3 colorB;
      varying float vLife;
      varying float vStrength;
      void main() {
        float a = texture2D(map, gl_PointCoord).a;
        vec3 c = mix(colorB, colorA, vLife);
        gl_FragColor = vec4(c * a * vLife * vLife * (0.16 + 0.22 * vStrength), 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  let head = 0;
  return {
    points,
    emit(x, y, z, time, strength = 1) {
      positions[head * 3] = x + (Math.random() - 0.5) * 0.05;
      positions[head * 3 + 1] = y + (Math.random() - 0.5) * 0.05;
      positions[head * 3 + 2] = z + (Math.random() - 0.5) * 0.05;
      births[head] = time;
      strengths[head] = strength;
      head = (head + 1) % count;
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.birth.needsUpdate = true;
      geometry.attributes.strength.needsUpdate = true;
    },
    update(time) {
      material.uniforms.time.value = time;
    },
  };
}

// Faint motes along the route with pulses travelling toward the next station.
function createRoutePath(stationPositions) {
  const pts = [START.position.clone().addScaledVector(WORLD_UP, -1.5), ...stationPositions.map((p) => p.clone())];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const count = 1400;
  const samples = curve.getSpacedPoints(count - 1);
  const positions = new Float32Array(count * 3);
  const along = new Float32Array(count);
  const rand = seeded(5);
  samples.forEach((p, i) => {
    positions[i * 3] = p.x + (rand() - 0.5) * 1.2;
    positions[i * 3 + 1] = p.y + (rand() - 0.5) * 1.2;
    positions[i * 3 + 2] = p.z + (rand() - 0.5) * 1.2;
    along[i] = i / (count - 1);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('along', new THREE.BufferAttribute(along, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      scale: { value: window.innerHeight * Math.min(window.devicePixelRatio, 1.75) * 0.5 },
      map: { value: createStarSprite() },
      color: { value: new THREE.Color(0x8fd3ff) },
    },
    vertexShader: /* glsl */ `
      attribute float along;
      uniform float time;
      uniform float scale;
      varying float vGlow;
      void main() {
        float wave = pow(0.5 + 0.5 * sin(along * 160.0 - time * 1.4), 12.0);
        vGlow = 0.12 + wave * 0.8;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.16 + 0.3 * wave) * scale / -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 color;
      varying float vGlow;
      void main() {
        float a = texture2D(map, gl_PointCoord).a;
        gl_FragColor = vec4(color * a * vGlow, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return {
    points,
    update(time) {
      material.uniforms.time.value = time;
    },
  };
}
