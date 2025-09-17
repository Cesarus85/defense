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

// Globale Referenzen für Materialien
let skyMaterial = null;
let terrainMaterial = null;

// VR Controller Raycast Beams
let controllerBeams = [];

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
  // Renderer mit erweiterten Einstellungen
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.xr.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.body.appendChild(renderer.domElement);

  // VR Button
  document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ['local-floor'] }));

  // Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 2000);
  camera.position.set(0, 1.6, 2);
  scene.add(camera);

  // Erweiterte Atmosphäre mit reichhaltigerem Skybox
  scene.fog = new THREE.FogExp2(0x2a4560, 0.0003);

  // Haupt-Skybox mit verbessertem Shader
  const skyGeo = new THREE.SphereGeometry(1200, 64, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:    { value: new THREE.Color(CONFIG.sky.topColor) },
      bottomColor: { value: new THREE.Color(CONFIG.sky.bottomColor) },
      horizonColor: { value: new THREE.Color(0x6688aa) },
      sunPosition: { value: new THREE.Vector3(0.3, 0.4, 0.5) },
      time: { value: 0.0 }
    },
    vertexShader: `
      varying vec3 vPos;
      varying vec3 vWorldPos;
      void main(){
        vPos = position;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 horizonColor;
      uniform vec3 sunPosition;
      uniform float time;
      varying vec3 vPos;
      varying vec3 vWorldPos;

      void main(){
        vec3 dir = normalize(vPos);
        float h = dir.y * 0.5 + 0.5;

        // Basis-Gradient
        vec3 skyColor = mix(bottomColor, topColor, h);

        // Horizont-Verstärkung
        float horizonFactor = 1.0 - abs(dir.y);
        horizonFactor = pow(horizonFactor, 2.0);
        skyColor = mix(skyColor, horizonColor, horizonFactor * 0.3);

        // Wolken-Simulation
        float cloudNoise = sin(dir.x * 10.0 + time * 0.1) * cos(dir.z * 8.0 + time * 0.08);
        cloudNoise += sin(dir.x * 25.0 - time * 0.05) * cos(dir.z * 20.0);
        cloudNoise = smoothstep(0.3, 0.8, cloudNoise * 0.5 + 0.5);

        if(h > 0.3 && h < 0.9) {
          vec3 cloudColor = mix(vec3(0.8, 0.85, 0.9), vec3(0.6, 0.65, 0.75), cloudNoise);
          skyColor = mix(skyColor, cloudColor, cloudNoise * 0.4);
        }

        // Sterne (nur im oberen Bereich)
        if(h > 0.7) {
          float star = sin(dir.x * 200.0) * cos(dir.z * 200.0) * sin(dir.y * 150.0);
          star = step(0.99, star);
          skyColor += vec3(star * 0.8);
        }

        gl_FragColor = vec4(skyColor, 1.0);
      }
    `
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyMesh);

  // Horizont-Details hinzufügen
  addHorizonDetails(scene);

  // Skybox-Animation aktivieren
  skyMaterial = skyMat;

  // Erweiterte Beleuchtung für bessere visuelle Qualität
  scene.add(new THREE.HemisphereLight(CONFIG.lights.hemi.sky, CONFIG.lights.hemi.ground, CONFIG.lights.hemi.intensity));

  // Hauptlicht mit verbessertes Shadow Mapping
  const dir = new THREE.DirectionalLight(CONFIG.lights.dir.color, CONFIG.lights.dir.intensity);
  dir.position.set(...CONFIG.lights.dir.position);
  dir.castShadow = true;
  dir.shadow.mapSize.width = 4096;
  dir.shadow.mapSize.height = 4096;
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 500;
  dir.shadow.camera.left = -100;
  dir.shadow.camera.right = 100;
  dir.shadow.camera.top = 100;
  dir.shadow.camera.bottom = -100;
  dir.shadow.bias = -0.0001;
  scene.add(dir);

  // Zusätzliche Punkt-Lichter für Atmosphäre
  const pointLight1 = new THREE.PointLight(0x4488ff, 0.8, 50);
  pointLight1.position.set(30, 15, 30);
  pointLight1.castShadow = true;
  pointLight1.shadow.mapSize.width = 1024;
  pointLight1.shadow.mapSize.height = 1024;
  scene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0xff8844, 0.6, 40);
  pointLight2.position.set(-25, 12, -25);
  pointLight2.castShadow = true;
  pointLight2.shadow.mapSize.width = 1024;
  pointLight2.shadow.mapSize.height = 1024;
  scene.add(pointLight2);

  // Spot-Light für dramatische Effekte
  const spotLight = new THREE.SpotLight(0xffffff, 1.5, 80, Math.PI / 6, 0.3, 2);
  spotLight.position.set(0, 50, 0);
  spotLight.target.position.set(0, 0, 0);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.width = 2048;
  spotLight.shadow.mapSize.height = 2048;
  scene.add(spotLight);
  scene.add(spotLight.target);

  // Zusätzliches Ambiente-Licht
  if (CONFIG.lights.ambient) {
    scene.add(new THREE.AmbientLight(CONFIG.lights.ambient.color, CONFIG.lights.ambient.intensity));
  }

  // Verbessertes Terrain mit Texturing
  const groundGeometry = new THREE.PlaneGeometry(CONFIG.groundSize, CONFIG.groundSize, 128, 128);

  // Terrain-Shader für realistischere Oberfläche
  const groundMaterial = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(0x3a4a5a) },
      detailColor: { value: new THREE.Color(0x2a3a4a) },
      time: { value: 0.0 },
      roughness: { value: 0.8 },
      metalness: { value: 0.1 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      uniform float time;

      void main() {
        vUv = uv;
        vNormal = normal;
        vPosition = position;

        // Leichte Terrain-Verformung
        vec3 pos = position;
        float noise = sin(pos.x * 0.02) * cos(pos.z * 0.015) * 0.5;
        noise += sin(pos.x * 0.05 + time * 0.1) * cos(pos.z * 0.04) * 0.2;
        pos.y += noise;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 detailColor;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        // Hexagon-Muster für technischen Look
        vec2 hexUv = vUv * 50.0;
        vec2 hexCenter = vec2(floor(hexUv.x), floor(hexUv.y));
        vec2 hexOffset = hexUv - hexCenter;

        float hexDist = length(hexOffset - 0.5);
        float hexPattern = smoothstep(0.4, 0.45, hexDist);

        // Detail-Noise
        float detailNoise = sin(vPosition.x * 0.5) * cos(vPosition.z * 0.5);
        detailNoise = detailNoise * 0.5 + 0.5;

        // Farb-Mischung
        vec3 finalColor = mix(baseColor, detailColor, hexPattern * 0.3);
        finalColor = mix(finalColor, detailColor * 1.2, detailNoise * 0.2);

        // Entfernungs-basierte Variation
        float distanceFromCenter = length(vPosition.xz) / 200.0;
        finalColor = mix(finalColor, baseColor * 0.8, clamp(distanceFromCenter, 0.0, 0.5));

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  });

  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Detailliertes Grid mit verschiedenen Ebenen
  const mainGrid = new THREE.GridHelper(CONFIG.groundSize, 40, 0x5a6a7a, 0x404a5a);
  mainGrid.position.y = 0.01;
  scene.add(mainGrid);

  // Feineres Sub-Grid
  const subGrid = new THREE.GridHelper(CONFIG.groundSize / 2, 80, 0x404a5a, 0x303a4a);
  subGrid.position.y = 0.005;
  scene.add(subGrid);

  // Terrain-Material für Animation speichern
  terrainMaterial = groundMaterial;

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

  // VR Controller Beams initialisieren
  initControllerBeams();

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
  console.log('Game Over triggered!');
  isGameOver = true;
  window.isGameOver = true;  // Global für gun.js verfügbar machen

  if (enemyMgr) {
    enemyMgr.enabled = false;
    enemyMgr.clearAll();
  }

  // DOM-Overlay (Desktop)
  if (gameOverEl) {
    gameOverEl.style.display = renderer.xr.isPresenting ? 'none' : 'flex';
    console.log('DOM Game Over displayed:', !renderer.xr.isPresenting);
  }

  // 3D-Banner (sichtbar in VR)
  if (STEP2.gameOver3D) {
    console.log('Showing 3D Game Over banner');
    STEP2.gameOver3D.show(getCurrentCamera());
  } else {
    console.error('gameOver3D not available!');
  }
}

function restartGame() {
  // Reset
  score = 0;
  baseHP = CONFIG.base?.maxHP ?? 100;
  baseInvuln = 0;
  isGameOver = false;
  window.isGameOver = false;  // Global zurücksetzen
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

    // Update VR Controller Raycast für UI Hover-Effekte (nur bei Game Over)
    if (isGameOver && renderer?.xr?.isPresenting && STEP2.gameOver3D?.isInteractive()) {
      updateControllerRaycast();
    } else {
      // Beams verstecken wenn nicht Game Over
      if (controllerBeams && controllerBeams.length > 0) {
        controllerBeams.forEach(beam => {
          if (beam && beam.visible) beam.visible = false;
        });
      }
    }

    if (enemyMgr) {
      enemyMgr.update(dt);
      updateScoreUI();
    }

    turret.update(dt, camera);

    // Skybox-Animation
    if (skyMaterial) {
      skyMaterial.uniforms.time.value += dt * 0.5;
    }

    // Terrain-Animation
    if (terrainMaterial) {
      terrainMaterial.uniforms.time.value += dt * 0.3;
    }

    renderer.render(scene, camera);
  });
}

function initControllerBeams() {
  // Erstelle sichtbare Strahlen für beide Controller (safe initialization)
  try {
    controllerBeams = []; // Reset array
    for (let i = 0; i < 2; i++) {
      const beamGeometry = new THREE.CylinderGeometry(0.002, 0.002, 1, 8);
      const beamMaterial = new THREE.MeshBasicMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.6,
        emissive: 0x002244,
        emissiveIntensity: 0.3
      });

      const beam = new THREE.Mesh(beamGeometry, beamMaterial);
      beam.visible = false;
      beam.userData.ignoreHit = true;

      if (scene) {
        scene.add(beam);
        controllerBeams.push(beam);
        console.log(`Controller beam ${i} initialized`);
      }
    }
  } catch (error) {
    console.error('Error initializing controller beams:', error);
    controllerBeams = [];
  }
}

function addHorizonDetails(scene) {
  // Entfernte Berge am Horizont
  const mountainGeometry = new THREE.PlaneGeometry(2000, 200);
  const mountainMaterial = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      color: { value: new THREE.Color(0x334455) },
      opacity: { value: 0.4 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vHeight;
      void main() {
        vUv = uv;
        vec3 pos = position;
        // Berge-Form mit Noise
        float height = sin(pos.x * 0.01) * 50.0 + cos(pos.x * 0.003) * 80.0;
        pos.y += height;
        vHeight = height;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      varying vec2 vUv;
      varying float vHeight;
      void main() {
        float alpha = opacity * (1.0 - vUv.y);
        gl_FragColor = vec4(color, alpha);
      }
    `
  });

  // Mehrere Berg-Ebenen für Tiefe
  for (let i = 0; i < 3; i++) {
    const mountains = new THREE.Mesh(mountainGeometry, mountainMaterial.clone());
    mountains.position.set(0, 50 + i * 20, -800 - i * 200);
    mountains.material.uniforms.opacity.value = 0.6 - i * 0.15;
    mountains.material.uniforms.color.value.setHex(0x334455 + i * 0x111111);
    scene.add(mountains);
  }

  // Horizont-Nebel
  const fogGeometry = new THREE.PlaneGeometry(3000, 100);
  const fogMaterial = new THREE.MeshBasicMaterial({
    color: 0x667788,
    transparent: true,
    opacity: 0.2,
    fog: false
  });

  for (let i = 0; i < 8; i++) {
    const fogPlane = new THREE.Mesh(fogGeometry, fogMaterial.clone());
    const angle = (i / 8) * Math.PI * 2;
    fogPlane.position.set(
      Math.cos(angle) * 600,
      30,
      Math.sin(angle) * 600
    );
    fogPlane.lookAt(0, 30, 0);
    scene.add(fogPlane);
  }
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

function updateControllerRaycast() {
  // Sichere Raycast-Implementation
  try {
    // Validate essential objects first
    if (!renderer?.xr?.isPresenting || !controllerBeams || controllerBeams.length === 0) {
      // Hide all beams when conditions not met
      controllerBeams?.forEach(beam => {
        if (beam && beam.visible) beam.visible = false;
      });
      return;
    }

    const gameOverActive = STEP2.gameOver3D?.isInteractive?.();
    if (!gameOverActive) {
      // Kein Game Over Banner sichtbar - Beams verstecken
      STEP2.gameOver3D?.setButtonHover?.(false);
      controllerBeams.forEach(beam => {
        if (beam && beam.visible) beam.visible = false;
      });
      return;
    }

    let hovering = false;

    // Check beide Controller
    for (let i = 0; i < Math.min(2, controllerBeams.length); i++) {
      const beam = controllerBeams[i];

      // Skip if beam doesn't exist or has issues
      if (!beam || !beam.material || !beam.material.color) {
        continue;
      }

      const controller = renderer.xr.getController(i);
      if (!controller) {
        beam.visible = false;
        continue;
      }

      try {
        // Get controller position and orientation
        controller.getWorldPosition(xrRayOrigin);
        controller.getWorldQuaternion(xrRayQuat);
        xrRayDir.set(0, 0, -1).applyQuaternion(xrRayQuat).normalize();

        // Make beam visible and position it
        beam.visible = true;
        beam.position.copy(xrRayOrigin);
        beam.lookAt(xrRayOrigin.clone().add(xrRayDir));
        beam.rotateX(Math.PI / 2);

        // Set default beam length
        const beamLength = 5.0;
        beam.scale.y = beamLength;
        beam.position.addScaledVector(xrRayDir, beamLength / 2);

        // Set default blue color safely
        beam.material.color.setHex(0x00aaff);
        if (beam.material.emissive) {
          beam.material.emissive.setHex(0x002244);
        }

        // Check for button intersection
        xrRaycaster.set(xrRayOrigin, xrRayDir);
        const meshes = STEP2.gameOver3D?.getInteractiveMeshes?.();
        if (meshes && meshes.length > 0) {
          const intersections = xrRaycaster.intersectObjects(meshes, false);
          if (intersections.length > 0) {
            const first = intersections[0].object;
            if (first?.userData?.action === 'exit-vr') {
              hovering = true;

              // Change to green and shorten beam to button
              beam.material.color.setHex(0x00ff88);
              if (beam.material.emissive) {
                beam.material.emissive.setHex(0x004422);
              }

              const distance = intersections[0].distance;
              beam.scale.y = distance;
              beam.position.copy(xrRayOrigin);
              beam.position.addScaledVector(xrRayDir, distance / 2);
            }
          }
        }

      } catch (innerError) {
        console.warn(`Error processing controller ${i}:`, innerError);
        beam.visible = false;
      }
    }

    // Update hover state
    STEP2.gameOver3D?.setButtonHover?.(hovering);

  } catch (error) {
    console.error('Critical error in updateControllerRaycast:', error);
    // Emergency cleanup
    controllerBeams?.forEach(beam => {
      if (beam) beam.visible = false;
    });
  }
}

function onXRSelectStart(event) {
  if (!renderer.xr.isPresenting) return;

  const controller = event.target;
  controller.getWorldPosition(xrRayOrigin);
  controller.getWorldQuaternion(xrRayQuat);
  xrRayDir.set(0, 0, -1).applyQuaternion(xrRayQuat).normalize();

  xrRaycaster.set(xrRayOrigin, xrRayDir);

  // Check Game Over Button wenn sichtbar
  if (STEP2.gameOver3D?.isInteractive()) {
    const meshes = STEP2.gameOver3D.getInteractiveMeshes?.();
    if (meshes && meshes.length > 0) {
      const intersections = xrRaycaster.intersectObjects(meshes, false);
      if (intersections.length > 0) {
        const first = intersections[0].object;
        if (first?.userData?.action === 'exit-vr') {
          console.log('Exit VR button clicked!');
          // Visuelles Feedback
          if (STEP2.audio) {
            STEP2.audio.playOverheat(); // Sound-Feedback
          }
          // VR Session beenden
          setTimeout(() => {
            renderer.xr.getSession()?.end();
          }, 100);
          return;
        }
      }
    }
  }
}
