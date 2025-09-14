// /src/main.js
// WICHTIG: Diese Datei ändert NICHT deine Turret-Steuerung/Handhabung.
// Aiming kommt weiterhin aus input.getAimDirection() → turret.setAimDirection(dir).

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { CONFIG } from './config.js';
import { createInput } from './input.js';
import { Turret } from './turret.js';

// Step 2 (Audio/FX/Heat/Gun)
import { AudioManager } from './audio.js';
import { MuzzleFlash, HitSparks } from './fx.js';
import { HeatBar3D } from './ui.js';
import { GunSystem } from './gun.js';

// Step 3 (Enemies/Waves/Score)
import { EnemyManager } from './enemies.js';

let scene, camera, renderer;
let input, turret;
let needPlaceFromHMD = false;

// Step 2 Container (verhindert TDZ-Probleme)
const STEP2 = {
  audio: null,
  muzzleFx: null,
  hitFx: null,
  heatUI: null,
  gun: null,
};

// Step 3: Enemies & Score
let enemyMgr = null;
let score = 0;
let scoreEl = null;

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

  // Enter VR Button
  document.body.appendChild(
    VRButton.createButton(renderer, { optionalFeatures: ['local-floor'] })
  );

  // Szene & Kamera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 2000);
  camera.position.set(0, 1.6, 2); // Desktop-Start
  scene.add(camera);

  // Himmel (einfacher Gradient)
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

  // Licht
  scene.add(new THREE.HemisphereLight(
    CONFIG.lights.hemi.sky,
    CONFIG.lights.hemi.ground,
    CONFIG.lights.hemi.intensity
  ));
  const dir = new THREE.DirectionalLight(CONFIG.lights.dir.color, CONFIG.lights.dir.intensity);
  dir.position.set(...CONFIG.lights.dir.position);
  scene.add(dir);

  // Boden + Grid (Boden bei y=0)
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

  // Input (mit Griffen)
  input = createInput(renderer, scene, camera, {
    handles: { left: turret.leftHandle, right: turret.rightHandle }
  });

  // VR-Session: Turret einmal sauber vor dem Spieler platzieren
  renderer.xr.addEventListener('sessionstart', () => { needPlaceFromHMD = true; });

  // Desktop-Vorschau-Placement (auf Boden, vor Kamera)
  placeTurretFromCamera(getCurrentCamera());

  // Step 2 Systeme
  initStep2Systems();
  // Audio-Context per erstem Pointer-Event „wecken“
  window.addEventListener('pointerdown', () => STEP2.audio?.ensure(), { once: true });

  // Step 3: Score-Overlay & Gegner
  initScoreUI();
  initEnemies();

  window.addEventListener('resize', onWindowResize);
}

function initStep2Systems() {
  STEP2.audio   = new AudioManager();
  STEP2.muzzleFx = new MuzzleFlash(turret, CONFIG.fire.muzzleOffset);
  STEP2.hitFx    = new HitSparks(scene);
  STEP2.heatUI   = new HeatBar3D(scene, turret);
  STEP2.gun      = new GunSystem(renderer, scene, camera, turret, STEP2.audio, STEP2.muzzleFx, STEP2.hitFx, STEP2.heatUI);
}

function initScoreUI() {
  scoreEl = document.createElement('div');
  scoreEl.style.position = 'fixed';
  scoreEl.style.top = '12px';
  scoreEl.style.right = '14px';
  scoreEl.style.padding = '8px 12px';
  scoreEl.style.background = 'rgba(10,14,20,0.55)';
  scoreEl.style.border = '1px solid rgba(160,200,255,0.25)';
  scoreEl.style.borderRadius = '10px';
  scoreEl.style.fontFamily = 'system-ui, sans-serif';
  scoreEl.style.color = '#cfe7ff';
  scoreEl.style.fontSize = '14px';
  scoreEl.style.zIndex = '9999';
  document.body.appendChild(scoreEl);
  updateScoreUI({ wave: 1, alive: 0 });
}

function updateScoreUI({ wave, alive } = {}) {
  const w = (wave ?? enemyMgr?.wave ?? 1);
  const a = (alive ?? enemyMgr?.alive ?? 0);
  scoreEl.textContent = `Score: ${score}  |  Wave: ${w}  |  Enemies: ${a}`;
}

function initEnemies() {
  enemyMgr = new EnemyManager(
    scene,
    turret,
    (CONFIG.enemies || {
      spawnRadius: 120, attackRadius: 3.2, firstWaveCount: 6, waveGrowth: 1.35, spawnInterval: 0.35, wavePause: 4.0,
      grunt: { speed: 3.0, health: 40, reward: 10 }
    }),
    STEP2.hitFx,
    // Score/Wave Callback
    (e) => {
      if (e.type === 'kill') { score += e.reward || 0; updateScoreUI({ alive: e.alive }); }
      if (e.type === 'wave') { updateScoreUI({ wave: e.wave }); }
    }
  );
}

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

    // Nach Eintritt in VR mit XR-Kamera platzieren
    if (needPlaceFromHMD) {
      placeTurretFromCamera(getCurrentCamera());
      needPlaceFromHMD = false;
    }

    input.update?.(dt);

    // === Aiming (unverändert zu deiner Steuerung) ===
    const dir = input.getAimDirection?.();
    if (dir) {
      turret.setAimDirection(dir); // keine Eingriffe (invert/offset etc. bleiben in deinem Code)
    } else if (!renderer.xr.isPresenting && typeof input.getDesktopDir === 'function') {
      turret.setAimDirection(input.getDesktopDir());
    }

    // === Updates ===
    STEP2.gun.update(dt);
    STEP2.muzzleFx.update(dt, camera);
    STEP2.hitFx.update(dt);
    STEP2.heatUI.update(camera);

    if (enemyMgr) {
      enemyMgr.update(dt);
      updateScoreUI();
    }

    turret.update(dt, camera);
    renderer.render(scene, camera);
  });
}

/**
 * Positioniert das Turret relativ zur aktuellen Kamerapose:
 * - y = 0 (Boden)
 * - XZ: |offsetZFromPlayer| vor dem Spieler
 * - Yaw an Blickrichtung (kein Pitch/Roll)
 * - Safety: 180° Flip falls Rohr Richtung Spieler zeigen würde
 */
function placeTurretFromCamera(cam) {
  const headPos = new THREE.Vector3(); cam.getWorldPosition(headPos);
  const headQuat = cam.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);

  // Nur horizontale Komponente
  const fwdXZ = new THREE.Vector3(fwd.x, 0, fwd.z);
  if (fwdXZ.lengthSq() < 1e-6) fwdXZ.set(0, 0, -1);
  fwdXZ.normalize();

  const dist = Math.abs(CONFIG.turret.offsetZFromPlayer);
  const basePos = new THREE.Vector3(headPos.x, 0, headPos.z).add(fwdXZ.clone().multiplyScalar(dist));
  turret.root.position.copy(basePos);

  // Yaw ausrichten
  let yaw = Math.atan2(fwdXZ.x, -fwdXZ.z);
  turret.root.rotation.set(0, yaw, 0);

  // Safety-Check
  const forwardAfterYaw = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0, 'XYZ'));
  if (forwardAfterYaw.dot(fwdXZ) < 0) {
    yaw += Math.PI;
    turret.root.rotation.set(0, yaw, 0);
  }

  // Pivots neutral (keine Änderung an deiner Handhabung)
  turret.yawPivot.rotation.y = 0;
  turret.pitchPivot.rotation.x = 0;
}
