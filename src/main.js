// /src/main.js
import * as THREE from 'three';
import { setupXRSupport, startARSession } from './xr-setup.js';
import { createPlacementController } from './placement.js';

const state = {
  running: true,
  arSupported: false,
  inAR: false
};

const appEl   = document.getElementById('app');
const statusEl = document.getElementById('status');
const btnAR    = document.getElementById('btn-start-ar');

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true, // AR: reale Umgebung sichtbar
  powerPreference: 'high-performance'
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
appEl.appendChild(renderer.domElement);

// --- Szene & Kamera ---
let scene = new THREE.Scene();
scene.background = null;

let camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 2);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));

// --- Step-0/1 Desktop-Debugobjekt (wird bei AR-Start entfernt) ---
{
  const geo = new THREE.TorusKnotGeometry(0.15, 0.045, 150, 20);
  const mat = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.35, color: 0x88ccff });
  const knot = new THREE.Mesh(geo, mat);
  knot.userData.__step0 = true;
  knot.position.set(0, 1.4, 0);
  scene.add(knot);

  // kleine Idle-Animation, um Renderloop zu verifizieren
  const baseRender = renderer.render.bind(renderer);
  renderer.render = (s, c) => {
    const t = performance.now() * 0.001;
    knot.rotation.x = t * 0.25;
    knot.rotation.y = t * 0.35;
    baseRender(s, c);
  };
}

// --- Resize ---
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// --- Sichtbarkeit pausiert (schont Akku) ---
document.addEventListener('visibilitychange', () => {
  state.running = !document.hidden;
  if (!state.inAR && state.running) requestAnimationFrame(loop);
});

// --- Desktop-Loop (bis AR startet) ---
function loop() {
  if (!state.running || state.inAR) return;
  requestAnimationFrame(loop);
  renderer.render(scene, camera);
}

// --- Boot ---
(async function boot() {
  statusEl.textContent = 'Boot OK — Step 1';
  try {
    state.arSupported = await setupXRSupport({ statusEl });
  } catch (e) {
    console.warn('XR support check failed:', e);
  }

  // Debug-Hook
  window.__GAME__ = { THREE, renderer, scene, camera, state };
  console.log('%cBoot OK — Step 1', 'color:#0f0; font-weight:bold');

  requestAnimationFrame(loop);
})();

// --- AR starten ---
btnAR?.addEventListener('click', async () => {
  if (!state.arSupported) {
    alert('AR wird vom Gerät/Browser nicht unterstützt.');
    return;
  }

  // Desktop-Debug aufräumen / frische Basisszene
  scene.clear();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));

  statusEl.textContent = 'AR: Bitte Boden anvisieren… (Trigger = Platzieren, rechter Stick = Drehen)';

  let sessionData;
  try {
    sessionData = await startARSession(renderer);
  } catch (err) {
    console.error('AR-Start fehlgeschlagen:', err);
    statusEl.textContent = 'AR-Start fehlgeschlagen';
    return;
  }
  state.inAR = true;

  // Reticle/Platzierung (Controller-gezielt + Downward-Fallback)
  const placement = createPlacementController({
    scene,
    session: sessionData.session,
    referenceSpace: sessionData.referenceSpace,
    viewerDownHitTestSource: sessionData.viewerDownHitTestSource,
    transientHitTestSource: sessionData.transientHitTestSource
  });

  // Frame-Loop in AR
  let lastTime = 0;
  renderer.setAnimationLoop((time, frame) => {
    if (!frame) return;

    const dt = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;

    placement.update({ frame, dt });

    renderer.render(scene, camera);

    if (placement.isPlaced()) {
      statusEl.textContent = 'Turret-Basis platziert. (STEP 2 baut hierauf auf)';
      // Wir lassen die Loop weiterlaufen; in STEP 2 kommen Turret-Pivots etc.
    }
  });

  // Optional: Session-Ende behandeln (zurück in Desktop-Modus)
  sessionData.session.addEventListener('end', () => {
    state.inAR = false;
    statusEl.textContent = 'AR beendet — zurück im Desktop-Modus';
    // Szene für Desktop wiederherstellen (Debugobjekt)
    scene.clear();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
    const geo = new THREE.TorusKnotGeometry(0.15, 0.045, 150, 20);
    const mat = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.35, color: 0x88ccff });
    const knot = new THREE.Mesh(geo, mat);
    knot.position.set(0, 1.4, 0);
    scene.add(knot);
    requestAnimationFrame(loop);
  });
});
