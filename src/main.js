// main.js with direct "absolute" aiming restored, correct inversions, and Step 2 integrated
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { CONFIG } from './config.js';
import { createInput } from './input.js';
import { Turret } from './turret.js';

// Step 2 modules
import { AudioManager } from './audio.js';
import { MuzzleFlash, HitSparks } from './fx.js';
import { HeatBar3D } from './ui.js';
import { GunSystem } from './gun.js';

let scene, camera, renderer;
let input, turret;
let needPlaceFromHMD = false;

// Delta-grip baseline (nur genutzt, wenn controlMode='delta')
let baseTurretYaw = 0, baseTurretPitch = 0;
let hadRef = false;

const STEP2 = { audio: null, muzzleFx: null, hitFx: null, heatUI: null, gun: null };

init();
startLoop();

function init() {
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.xr.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  // VR Button
  document.body.appendChild(
    VRButton.createButton(renderer, { optionalFeatures: ['local-floor'] })
  );

  // Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 2000);
  camera.position.set(0, 1.6, 2);
  scene.add(camera);

  // Sky (gradient)
  scene.fog = new THREE.FogExp2(0x0b0f14, 0.0008);
  const skyGeo = new THREE.SphereGeometry(1200, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:    { value: new THREE.Color(CONFIG.sky.topColor) },
      bottomColor: { value: new THREE.Color(CONFIG.sky.bottomColor) }
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPos;
      void main(){ float h = normalize(vPos).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0); }
    `
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Lights
  scene.add(new THREE.HemisphereLight(
    CONFIG.lights.hemi.sky,
    CONFIG.lights.hemi.ground,
    CONFIG.lights.hemi.intensity
  ));
  const dir = new THREE.DirectionalLight(CONFIG.lights.dir.color, CONFIG.lights.dir.intensity);
  dir.position.set(...CONFIG.lights.dir.position);
  scene.add(dir);

  // Ground + Grid
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.groundSize, CONFIG.groundSize),
    new THREE.MeshStandardMaterial({ color: 0x202a36, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(CONFIG.groundSize, 80, 0x2e3b4b, 0x1b2430);
  grid.position.y = 0.01;
  scene.add(grid);

  // Turret
  turret = new Turret();
  turret.addTo(scene);

  // Input
  input = createInput(renderer, scene, camera, {
    handles: { left: turret.leftHandle, right: turret.rightHandle }
  });

  // Place turret when VR session starts
  renderer.xr.addEventListener('sessionstart', () => { needPlaceFromHMD = true; resetRef(); });

  // Desktop preview placement (on ground in front of camera)
  placeTurretFromCamera(getCurrentCamera());

  // Step 2 systems
  initStep2Systems();
  window.addEventListener('pointerdown', () => STEP2.audio?.ensure(), { once: true });

  window.addEventListener('resize', onWindowResize);
}

function initStep2Systems() {
  STEP2.audio   = new AudioManager();
  STEP2.muzzleFx = new MuzzleFlash(turret, CONFIG.fire.muzzleOffset);
  STEP2.hitFx    = new HitSparks(scene);
  STEP2.heatUI   = new HeatBar3D(scene, turret);
  STEP2.gun      = new GunSystem(renderer, scene, camera, turret, STEP2.audio, STEP2.muzzleFx, STEP2.hitFx, STEP2.heatUI);
}

function resetRef() { hadRef = false; }
function getCurrentCamera() { return renderer.xr.isPresenting ? renderer.xr.getCamera(camera) : camera; }

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function startLoop() {
  let last = performance.now();

  renderer.setAnimationLoop((time) => {
    const now = (typeof time === 'number') ? time : performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (needPlaceFromHMD) {
      placeTurretFromCamera(getCurrentCamera());
      needPlaceFromHMD = false;
      resetRef();
    }

    input.update?.(dt);

    // === Aiming ===
    let aimed = false;

    if (CONFIG.turret.controlMode === 'delta' && typeof input.getDeltaYawPitch === 'function') {
      const delta = input.getDeltaYawPitch();
      if (delta && delta.ok) {
        if (!hadRef) {
          baseTurretYaw   = turret.yawPivot.rotation.y;
          baseTurretPitch = turret.pitchPivot.rotation.x;
          hadRef = true;
        }
        let dy = delta.dy * CONFIG.turret.sensitivityYaw;
        let dp = delta.dp * CONFIG.turret.sensitivityPitch;
        if (CONFIG.turret.invertYaw)   dy = -dy;
        if (CONFIG.turret.invertPitch) dp = -dp;

        const targetYaw   = baseTurretYaw + dy;
        const targetPitch = baseTurretPitch + dp;
        turret.setTargetAngles(targetYaw, targetPitch);
        aimed = true;
      } else {
        hadRef = false;
      }
    }

    if (!aimed) {
      // Absolute Richtung (wie früher, direkt & knackig)
      const dir = input.getAimDirection?.();
      if (dir) {
        let { yaw, pitch } = dirToAngles(dir);
        if (CONFIG.turret.invertYaw)   yaw   = -yaw;
        if (CONFIG.turret.invertPitch) pitch = -pitch;
        turret.setTargetAngles(yaw, pitch);
        aimed = true;
      }
    }

    // Desktop fallback
    if (!aimed && !renderer.xr.isPresenting && typeof input.getDesktopDir === 'function') {
      const dir = input.getDesktopDir();
      let { yaw, pitch } = dirToAngles(dir);
      if (CONFIG.turret.invertYaw)   yaw   = -yaw;
      if (CONFIG.turret.invertPitch) pitch = -pitch;
      turret.setTargetAngles(yaw, pitch);
    }

    // === Updates ===
    STEP2.gun.update(dt);
    STEP2.muzzleFx.update(dt, camera);
    STEP2.hitFx.update(dt);
    STEP2.heatUI.update(camera);
    turret.update(dt, camera);

    renderer.render(scene, camera);
  });
}

// Welt-Richtung -> Winkel (Yaw um Y, Pitch um X)
function dirToAngles(worldDir) {
  const xzLen = Math.hypot(worldDir.x, worldDir.z);
  const yaw   = Math.atan2(worldDir.x, -worldDir.z); // -Z = vorwärts
  const pitch = Math.atan2(worldDir.y, xzLen);
  return { yaw, pitch };
}

/**
 * Position turret relative to current camera pose (on ground, in front of player)
 */
function placeTurretFromCamera(cam) {
  const headPos = new THREE.Vector3(); cam.getWorldPosition(headPos);
  const headQuat = cam.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);

  // Only horizontal component
  const fwdXZ = new THREE.Vector3(fwd.x, 0, fwd.z);
  if (fwdXZ.lengthSq() < 1e-6) fwdXZ.set(0, 0, -1);
  fwdXZ.normalize();

  const dist = Math.abs(CONFIG.turret.offsetZFromPlayer);
  const basePos = new THREE.Vector3(headPos.x, 0, headPos.z).add(fwdXZ.clone().multiplyScalar(dist));
  turret.root.position.copy(basePos);

  // Align yaw so that turret -Z matches fwdXZ
  let yaw = Math.atan2(fwdXZ.x, -fwdXZ.z);
  turret.root.rotation.set(0, yaw, 0);

  // Safety 180° flip if needed
  const fwdAfter = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0, 'XYZ'));
  if (fwdAfter.dot(fwdXZ) < 0) {
    yaw += Math.PI;
    turret.root.rotation.set(0, yaw, 0);
  }

  // Reset pivots
  turret.yawPivot.rotation.y = 0;
  turret.pitchPivot.rotation.x = 0;
  baseTurretYaw = 0;
  baseTurretPitch = 0;
  hadRef = false;
}
