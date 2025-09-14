// Complete main.js with Step 2: audio, FX, heat UI, gun system integrated
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { CONFIG } from './config.js';
import { createInput } from './input.js';
import { Turret } from './turret.js';

// NEW: Step 2 modules
import { AudioManager } from './audio.js';
import { MuzzleFlash, HitSparks } from './fx.js';
import { HeatBar3D } from './ui.js';
import { GunSystem } from './gun.js';

let scene, camera, renderer;
let input, turret;
let needPlaceFromHMD = false; // place turret once after entering VR

// Delta-grip baseline (used when input.getDeltaYawPitch exists)
let baseTurretYaw = 0, baseTurretPitch = 0;
let hadRef = false;

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
  camera.position.set(0, 1.6, 2); // desktop preview; VR overrides with HMD pose
  scene.add(camera);

  // Sky (simple gradient)
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
      void main(){
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vPos;
      void main(){
        float h = normalize(vPos).y * 0.5 + 0.5;
        gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
      }
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

  // Input (with handle refs for gripping)
  input = createInput(renderer, scene, camera, {
    handles: { left: turret.leftHandle, right: turret.rightHandle }
  });

  // Place turret after starting VR (use XR camera pose)
  renderer.xr.addEventListener('sessionstart', () => { needPlaceFromHMD = true; resetRef(); });

  // Desktop preview placement (on ground in front of camera)
  placeTurretFromCamera(getCurrentCamera());

  window.addEventListener('resize', onWindowResize);

  // --- Step 2: FX / Audio / UI / Gun system
  initStep2Systems();
}

let audio, muzzleFx, hitFx, heatUI, gun;
function initStep2Systems() {
  audio = new AudioManager();
  muzzleFx = new MuzzleFlash(turret, CONFIG.fire.muzzleOffset);
  hitFx = new HitSparks(scene);
  heatUI = new HeatBar3D(scene, turret);
  gun = new GunSystem(renderer, scene, camera, turret, audio, muzzleFx, hitFx, heatUI);
}

function resetRef() { hadRef = false; }

function getCurrentCamera() {
  return renderer.xr.isPresenting ? renderer.xr.getCamera(camera) : camera;
}

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

    // One-time placement after entering VR (with XR cam pose)
    if (needPlaceFromHMD) {
      placeTurretFromCamera(getCurrentCamera());
      needPlaceFromHMD = false;
      resetRef();
    }

    input.update?.(dt);

    // === Aiming ===
    let aimed = false;

    // Preferred: Delta-grip API (if available)
    if (typeof input.getDeltaYawPitch === 'function') {
      const delta = input.getDeltaYawPitch();
      if (delta && delta.ok) {
        if (!hadRef) {
          // freeze current turret orientation as baseline
          baseTurretYaw = turret.yawPivot.rotation.y;
          baseTurretPitch = turret.pitchPivot.rotation.x;
          hadRef = true;
        }
        let dy = delta.dy * CONFIG.turret.sensitivityYaw;
        let dp = delta.dp * CONFIG.turret.sensitivityPitch;
        if (CONFIG.turret.invertYaw)   dy = -dy;
        if (CONFIG.turret.invertPitch) dp = -dp;

        const targetYaw   = shortestAngle(baseTurretYaw + dy);
        const targetPitch = baseTurretPitch + dp;

        turret.setTargetAngles(targetYaw, targetPitch);
        aimed = true;
      } else {
        hadRef = false; // lost reference; re-acquire next time
      }
    }

    // Fallback: classic direction vector API
    if (!aimed && typeof input.getAimDirection === 'function') {
      const dir = input.getAimDirection();
      if (dir) {
        turret.setAimDirection(dir);
        aimed = true;
      }
    }

    // Desktop fallback
    if (!aimed && !renderer.xr.isPresenting && typeof input.getDesktopDir === 'function') {
      const dir = input.getDesktopDir();
      turret.setAimDirection(dir);
    }

    // === Updates ===
    gun.update(dt);
    muzzleFx.update(dt, camera);
    hitFx.update(dt);
    heatUI.update(camera);
    turret.update(dt, camera);

    renderer.render(scene, camera);
  });
}

/**
 * Position turret relative to current camera pose:
 * - y = 0 (ground)
 * - XZ offset |offsetZFromPlayer| in front of player
 * - Yaw aligned to gaze (no pitch/roll)
 * - Safety: 180° flip if barrel would point toward the player
 */
function placeTurretFromCamera(cam) {
  const headPos = new THREE.Vector3(); cam.getWorldPosition(headPos);
  const headQuat = cam.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);

  // use only horizontal component
  const fwdXZ = new THREE.Vector3(fwd.x, 0, fwd.z);
  if (fwdXZ.lengthSq() < 1e-6) fwdXZ.set(0, 0, -1);
  fwdXZ.normalize();

  const dist = Math.abs(CONFIG.turret.offsetZFromPlayer);
  const basePos = new THREE.Vector3(headPos.x, 0, headPos.z).add(fwdXZ.clone().multiplyScalar(dist));
  turret.root.position.copy(basePos);

  // align yaw so that -Z of turret matches fwdXZ
  let yaw = Math.atan2(fwdXZ.x, -fwdXZ.z);
  turret.root.rotation.set(0, yaw, 0);

  // safety flip if needed
  const forwardAfterYaw = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0, 'XYZ'));
  if (forwardAfterYaw.dot(fwdXZ) < 0) {
    yaw += Math.PI;
    turret.root.rotation.set(0, yaw, 0);
  }

  // neutral pivots
  turret.yawPivot.rotation.y = 0;
  turret.pitchPivot.rotation.x = 0;

  // reset delta baseline
  baseTurretYaw = turret.yawPivot.rotation.y;
  baseTurretPitch = turret.pitchPivot.rotation.x;
  hadRef = false;
}

// Smallest-angle wrap to [-π, π]
function shortestAngle(a) {
  let ang = ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (ang < -Math.PI) ang += Math.PI * 2;
  return ang;
}
