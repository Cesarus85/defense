// /src/main.js
// XR Main: Turret-Shooter mit Delta-Steuerung, Enemies/Waves, Base-HP & 3D-GameOver-Banner.
// Steuerungslogik/Handling bleibt unverändert (Input/Turret).

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { CONFIG } from './config.js';
import { createInput } from './input.js';
import { Turret } from './turret.js';

import { AudioManager } from './audio.js';
import { MuzzleFlash, HitSparks, TracerPool, GameOverBanner3D, ExplosionEffects, SpawnEffects, Killfeed3D, ScoreDisplay3D } from './fx.js';
import { HeatBar3D, BaseHealthBar3D } from './ui.js';
import { GunSystem } from './gun.js';
import { EnemyManager } from './enemies.js';
import { EnvironmentManager } from './environment.js';

let scene, camera, renderer;
let input, turret;
let needPlaceFromHMD = false;

// Systeme (Audio/FX/Gun/Tracer/GameOver3D)
const STEP2 = {
  audio: null,
  muzzleFx: null,
  hitFx: null,
  heatUI: null,
  baseUI: null,
  gun: null,
  tracers: null,
  gameOver3D: null,
  explosions: null,
  spawns: null,
  killfeed: null,
  scoreUI: null,
  environment: null,
};

// Enemies / Score / Base
let enemyMgr = null;
let score = 0;
let scoreEl = null;

let baseHP = 100;
let baseInvuln = 0;
let baseEl = null;

let isGameOver = false;
let gameOverEl = null; // DOM-Overlay (Desktop), in VR ggf. unsichtbar

const xrControllers = [];
const xrRaycaster = new THREE.Raycaster();
const xrRayOrigin = new THREE.Vector3();
const xrRayDir = new THREE.Vector3();
const xrRayQuat = new THREE.Quaternion();

// Delta-Baseline (nur für controlMode='delta')
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
  document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ['local-floor'] }));

  // Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 2000);
  camera.position.set(0, 1.6, 2);
  scene.add(camera);

  // Sky (hellerer Gradient + reduzierter Fog)
  scene.fog = new THREE.FogExp2(0x2a4560, 0.0004);
  const skyGeo = new THREE.SphereGeometry(1200, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:    { value: new THREE.Color(CONFIG.sky.topColor) },
      bottomColor: { value: new THREE.Color(CONFIG.sky.bottomColor) }
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPos;
      void main(){ float h=normalize(vPos).y*0.5+0.5; gl_FragColor=vec4(mix(bottomColor,topColor,h),1.0); }
    `
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Lights (heller und mehr Beleuchtung)
  scene.add(new THREE.HemisphereLight(CONFIG.lights.hemi.sky, CONFIG.lights.hemi.ground, CONFIG.lights.hemi.intensity));
  const dir = new THREE.DirectionalLight(CONFIG.lights.dir.color, CONFIG.lights.dir.intensity);
  dir.position.set(...CONFIG.lights.dir.position);
  dir.castShadow = true;
  dir.shadow.mapSize.width = 2048;
  dir.shadow.mapSize.height = 2048;
  scene.add(dir);

  // Zusätzliches Ambiente-Licht
  if (CONFIG.lights.ambient) {
    scene.add(new THREE.AmbientLight(CONFIG.lights.ambient.color, CONFIG.lights.ambient.intensity));
  }

  // Ground + Grid (hellere Farben)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.groundSize, CONFIG.groundSize),
    new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.8, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(CONFIG.groundSize, 80, 0x5a6a7a, 0x404a5a);
  grid.position.y = 0.01;
  scene.add(grid);

  // Turret
  turret = new Turret();
  turret.addTo(scene);

  // Input
  input = createInput(renderer, scene, camera, { handles: { left: turret.leftHandle, right: turret.rightHandle } });

  // VR: nach Sessionstart sauber vor den Spieler platzieren
  renderer.xr.addEventListener('sessionstart', () => {
    needPlaceFromHMD = true;
    resetDeltaBaseline();
    if (gameOverEl) gameOverEl.style.display = 'none';
    setupXRExitInteraction();
    updateBaseUI();
  });
  renderer.xr.addEventListener('sessionend', () => {
    if (isGameOver && gameOverEl) gameOverEl.style.display = 'flex';
    updateBaseUI();
  });

  // Desktop: initial platzieren
  placeTurretFromCamera(getCurrentCamera());

  // Systeme (Audio/FX/Gun/Tracer/GameOver3D)
  initStep2Systems();
  window.addEventListener('pointerdown', () => STEP2.audio?.ensure(), { once: true });

  // UI Overlays (DOM – auf Quest XR evtl. unsichtbar)
  initScoreUI();
  initBaseUI();
  initGameOverUI();

  setupXRExitInteraction();

  // Enemies
  initEnemies();

  window.addEventListener('resize', onWindowResize);
}

function initStep2Systems() {
  STEP2.audio     = new AudioManager();
  STEP2.muzzleFx  = new MuzzleFlash(turret, CONFIG.fire.muzzleOffset);
  STEP2.hitFx     = new HitSparks(scene);
  STEP2.heatUI    = new HeatBar3D(scene, turret);
  STEP2.baseUI    = new BaseHealthBar3D(scene, turret);
  STEP2.tracers   = new TracerPool(scene);
  STEP2.explosions = new ExplosionEffects(scene);
  STEP2.spawns    = new SpawnEffects(scene);
  STEP2.killfeed  = new Killfeed3D(scene);
  STEP2.scoreUI   = new ScoreDisplay3D(scene, turret);
  STEP2.environment = new EnvironmentManager(scene);
  STEP2.gun       = new GunSystem(renderer, scene, camera, turret, STEP2.audio, STEP2.muzzleFx, STEP2.hitFx, STEP2.heatUI, STEP2.tracers);
  STEP2.gameOver3D = new GameOverBanner3D(scene);
  
  // Score-Anzeige initial setzen
  STEP2.scoreUI.updateScore(0, 1, 0);
  STEP2.baseUI?.setHealth(baseHP, CONFIG.base?.maxHP ?? 100);

  // Umgebung laden (asynchron)
  STEP2.environment.loadEnvironment(turret.root.position);
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

function initBaseUI() {
  baseHP = CONFIG.base?.maxHP ?? 100;

  baseEl = document.createElement('div');
  baseEl.style.position = 'fixed';
  baseEl.style.top = '12px';
  baseEl.style.left = '14px';
  baseEl.style.padding = '8px 12px';
  baseEl.style.background = 'rgba(20,14,14,0.55)';
  baseEl.style.border = '1px solid rgba(255,170,170,0.25)';
  baseEl.style.borderRadius = '10px';
  baseEl.style.fontFamily = 'system-ui, sans-serif';
  baseEl.style.color = '#ffd6d6';
  baseEl.style.fontSize = '14px';
  baseEl.style.zIndex = '9999';
  document.body.appendChild(baseEl);
  updateBaseUI();
}

function initGameOverUI() {
  // Desktop-/Dev-Overlay (in Quest-Session i. d. R. unsichtbar)
  gameOverEl = document.createElement('div');
  Object.assign(gameOverEl.style, {
    position: 'fixed',
    inset: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.45)',
    zIndex: '10000'
  });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    padding: '24px 28px',
    background: 'rgba(10,16,24,0.9)',
    border: '1px solid rgba(160,200,255,0.25)',
    borderRadius: '14px',
    color: '#e9f1ff',
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center',
    minWidth: '280px'
  });

  const title = document.createElement('div');
  title.textContent = 'Game Over';
  title.style.fontSize = '20px';
  title.style.marginBottom = '8px';

  const info = document.createElement('div');
  info.textContent = 'Drücke „Restart“ oder rufe das Menü auf.';
  info.style.opacity = '0.8';
  info.style.marginBottom = '16px';

  const btn = document.createElement('button');
  btn.textContent = 'Restart';
  Object.assign(btn.style, {
    padding: '10px 16px',
    background: '#2a66ff',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '15px'
  });
  btn.addEventListener('click', restartGame);

  panel.appendChild(title);
  panel.appendChild(info);
  panel.appendChild(btn);
  gameOverEl.appendChild(panel);
  document.body.appendChild(gameOverEl);
}

function updateScoreUI({ wave, alive } = {}) {
  const w = (wave ?? enemyMgr?.wave ?? 1);
  const a = (alive ?? enemyMgr?.alive ?? 0);
  scoreEl.textContent = `Score: ${score}  |  Wave: ${w}  |  Enemies: ${a}`;
  
  // 3D Score UI aktualisieren
  STEP2.scoreUI?.updateScore(score, w, a);
}

function updateBaseUI() {
  const maxHP = CONFIG.base?.maxHP ?? 100;
  STEP2.baseUI?.setHealth(baseHP, maxHP);

  if (!baseEl) return;

  if (renderer?.xr?.isPresenting) {
    baseEl.style.display = 'none';
  } else {
    baseEl.style.display = 'block';
    baseEl.textContent = `Base HP: ${Math.max(0, Math.floor(baseHP))} / ${maxHP}`;
  }
}

function initEnemies() {
  enemyMgr = new EnemyManager(
    scene,
    turret,
    CONFIG.enemies,
    STEP2.hitFx,
    // Score/Wave Callback
    (e) => {
      if (e.type === 'kill') { 
        score += e.reward || 0; 
        updateScoreUI({ alive: e.alive });
        // Killfeed-Nachricht hinzufügen
        const bonus = e.zone === 'head' ? ' HEADSHOT!' : '';
        STEP2.killfeed?.push(`+${e.reward}${bonus}`, 2.0);
      }
      if (e.type === 'wave') { 
        updateScoreUI({ wave: e.wave }); 
        STEP2.killfeed?.push(`Wave ${e.wave}`, 3.0);
      }
    },
    // Base-Hit Callback
    (e) => { onBaseHit(e.pos); },
    // Explosion Effects
    STEP2.explosions,
    // Spawn Effects
    STEP2.spawns,
    // Environment Manager (für Kollisionserkennung)
    STEP2.environment
  );
}

function onBaseHit(pos) {
  if (isGameOver) return;
  if (baseInvuln > 0) return;

  const dmg = CONFIG.base?.hitDamage ?? 20;
  baseHP = Math.max(0, baseHP - dmg);
  baseInvuln = CONFIG.base?.invulnAfterHit ?? 0.4;

  updateBaseUI();

  // schnelles Feedback (Audio/Haptik)
  STEP2.audio?.playOverheat();

  if (baseHP <= 0) {
    gameOver();
  }
}

function gameOver() {
  isGameOver = true;
  if (enemyMgr) {
    enemyMgr.enabled = false;
    enemyMgr.clearAll();
  }
  // DOM-Overlay (Desktop)
  if (gameOverEl) gameOverEl.style.display = renderer.xr.isPresenting ? 'none' : 'flex';
  // 3D-Banner (sichtbar in VR)
  STEP2.gameOver3D?.show(getCurrentCamera());
}

function restartGame() {
  // Reset
  score = 0;
  baseHP = CONFIG.base?.maxHP ?? 100;
  baseInvuln = 0;
  isGameOver = false;
  updateScoreUI({ wave: 1, alive: 0 });
  updateBaseUI();

  // Gegner-System neu starten
  enemyMgr = new EnemyManager(
    scene,
    turret,
    CONFIG.enemies,
    STEP2.hitFx,
    (e) => {
      if (e.type === 'kill') { 
        score += e.reward || 0; 
        updateScoreUI({ alive: e.alive });
        const bonus = e.zone === 'head' ? ' HEADSHOT!' : '';
        STEP2.killfeed?.push(`+${e.reward}${bonus}`, 2.0);
      }
      if (e.type === 'wave') { 
        updateScoreUI({ wave: e.wave }); 
        STEP2.killfeed?.push(`Wave ${e.wave}`, 3.0);
      }
    },
    (e) => { onBaseHit(e.pos); },
    STEP2.explosions,
    STEP2.spawns,
    STEP2.environment
  );

  // Overlays schließen
  if (gameOverEl) gameOverEl.style.display = 'none';
  STEP2.gameOver3D?.hide();
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

    if (needPlaceFromHMD) {
      placeTurretFromCamera(getCurrentCamera());
      needPlaceFromHMD = false;
      resetDeltaBaseline();
    }

    input.update?.(dt);

    // === Aiming (Delta bevorzugt, Fallback absolut) ===
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
        hadRef = false; // Referenz neu setzen, sobald wieder stable
      }
    }

    if (!aimed) {
      const dir = input.getAimDirection?.();
      if (dir) {
        let { yaw, pitch } = dirToAngles(dir);
        if (CONFIG.turret.invertYaw)   yaw   = -yaw;
        if (CONFIG.turret.invertPitch) pitch = -pitch;
        turret.setTargetAngles(yaw, pitch);
        aimed = true;
      } else if (!renderer.xr.isPresenting && typeof input.getDesktopDir === 'function') {
        const d = input.getDesktopDir(); let { yaw, pitch } = dirToAngles(d);
        if (CONFIG.turret.invertYaw)   yaw   = -yaw;
        if (CONFIG.turret.invertPitch) pitch = -pitch;
        turret.setTargetAngles(yaw, pitch);
      }
    }

    // Timers
    if (baseInvuln > 0) baseInvuln -= dt;

    // Updates
    STEP2.gun.update(dt);
    STEP2.muzzleFx.update(dt, camera);
    STEP2.hitFx.update(dt);
    const activeCamera = getCurrentCamera();
    STEP2.heatUI.update(activeCamera);
    STEP2.baseUI?.update(activeCamera);
    STEP2.tracers?.update(dt);
    STEP2.explosions?.update(dt, activeCamera);
    STEP2.spawns?.update(dt, activeCamera);
    STEP2.killfeed?.update(activeCamera, dt);
    STEP2.scoreUI?.update(activeCamera, dt);
    STEP2.gameOver3D?.update(activeCamera, dt);

    if (enemyMgr) {
      enemyMgr.update(dt);
      updateScoreUI();
    }

    turret.update(dt, camera);
    renderer.render(scene, camera);
  });
}

function resetDeltaBaseline() { hadRef = false; }

function dirToAngles(worldDir) {
  const xzLen = Math.hypot(worldDir.x, worldDir.z);
  const yaw   = Math.atan2(worldDir.x, -worldDir.z);
  const pitch = Math.atan2(worldDir.y, xzLen);
  return { yaw, pitch };
}

/**
 * Turret relativ zur Kamera platzieren:
 * - y=0 Boden
 * - |offsetZFromPlayer| vor dem Spieler (XZ)
 * - Yaw an Blickrichtung
 * - Safety: 180° Flip falls nötig
 */
function placeTurretFromCamera(cam) {
  const headPos = new THREE.Vector3(); cam.getWorldPosition(headPos);
  const headQuat = cam.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(headQuat);
  const fwdXZ = new THREE.Vector3(fwd.x, 0, fwd.z);
  if (fwdXZ.lengthSq()<1e-6) fwdXZ.set(0,0,-1);
  fwdXZ.normalize();

  const dist = Math.abs(CONFIG.turret.offsetZFromPlayer);
  const basePos = new THREE.Vector3(headPos.x, 0, headPos.z).add(fwdXZ.clone().multiplyScalar(dist));
  turret.root.position.copy(basePos);

  let yaw = Math.atan2(fwdXZ.x, -fwdXZ.z);
  turret.root.rotation.set(0, yaw, 0);

  // Safety-Flip falls Rohr zum Spieler zeigen würde
  const forwardAfterYaw = new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(0, yaw, 0, 'XYZ'));
  if (forwardAfterYaw.dot(fwdXZ) < 0) { yaw += Math.PI; turret.root.rotation.set(0, yaw, 0); }

  turret.yawPivot.rotation.y = 0;
  turret.pitchPivot.rotation.x = 0;

  resetDeltaBaseline();
}

function setupXRExitInteraction() {
  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    if (!controller) continue;
    if (!xrControllers.includes(controller)) {
      controller.addEventListener('selectstart', onXRSelectStart);
      xrControllers.push(controller);
    }
  }
}

function onXRSelectStart(event) {
  if (!renderer.xr.isPresenting) return;
  if (!STEP2.gameOver3D?.isInteractive()) return;

  const meshes = STEP2.gameOver3D.getInteractiveMeshes?.();
  if (!meshes || meshes.length === 0) return;

  const controller = event.target;
  controller.getWorldPosition(xrRayOrigin);
  controller.getWorldQuaternion(xrRayQuat);
  xrRayDir.set(0, 0, -1).applyQuaternion(xrRayQuat).normalize();

  xrRaycaster.set(xrRayOrigin, xrRayDir);
  const intersections = xrRaycaster.intersectObjects(meshes, false);
  if (intersections.length === 0) return;

  const first = intersections[0].object;
  if (first?.userData?.action === 'exit-vr') {
    renderer.xr.getSession()?.end();
  }
}
