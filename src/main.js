import * as THREE from 'three';
import { setupXRSupport, startARSession } from './xr-setup.js';
import { createPlacementController } from './placement.js';

const state = { running: true, arSupported: false, inAR: false };
const appEl   = document.getElementById('app');
const statusEl = document.getElementById('status');
const btnAR    = document.getElementById('btn-start-ar');

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' });
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

// Step-0 Debugobjekt (wird beim AR-Start entfernt)
{
  const geo = new THREE.TorusKnotGeometry(0.15, 0.045, 150, 20);
  const mat = new THREE.MeshStandardMaterial({ metalness:0.2, roughness:0.35, color:0x88ccff });
  const knot = new THREE.Mesh(geo, mat);
  knot.userData.__step0 = true;
  knot.position.set(0, 1.4, 0);
  scene.add(knot);

  const baseRender = renderer.render.bind(renderer);
  const _renderWrapper = (s, c) => {
    const t = performance.now() * 0.001;
    knot.rotation.x = t * 0.25;
    knot.rotation.y = t * 0.35;
    baseRender(s, c);
  };
  renderer.render = _renderWrapper;
}

// Resize
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// Sichtbarkeit
document.addEventListener('visibilitychange', () => {
  state.running = !document.hidden;
  if (!state.inAR && state.running) requestAnimationFrame(loop);
});

// Desktop-Loop (nur bis AR startet)
function loop() {
  if (!state.running || state.inAR) return;
  requestAnimationFrame(loop);
  renderer.render(scene, camera);
}

// Boot
(async function boot() {
  statusEl.textContent = 'Boot OK — Step 1';
  try { state.arSupported = await setupXRSupport({ statusEl }); }
  catch (e) { console.warn('XR support check failed:', e); }
  window.__GAME__ = { THREE, renderer, scene, camera, state };
  console.log('%cBoot OK — Step 1', 'color:#0f0; font-weight:bold');
  requestAnimationFrame(loop);
})();

// --- AR Start ---
btnAR?.addEventListener('click', async () => {
  if (!state.arSupported) { alert('AR nicht unterstützt'); return; }

  // Desktop-Debug-Objekte entfernen, neue Szene/Licht frisch
  scene.clear();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  scene.add(hemi);

  statusEl.textContent = 'AR: Bitte Boden anvisieren… (Trigger = Platzieren, rechter Stick = Drehen)';

  let sessionData;
  try {
    sessionData = await startARSession(renderer);
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'AR-Start fehlgeschlagen';
    return;
  }
  state.inAR = true;

  // Placement-Controller (Reticle & Confirm)
  const placement = createPlacementController({
    scene,
    session: sessionData.session,
    referenceSpace: sessionData.referenceSpace,
    hitTestSource: sessionData.hitTestSource
  });

  // XR-Loop
  let lastTime = 0;
  renderer.setAnimationLoop((time, frame) => {
    if (!frame) return; // sollte in AR immer kommen
    const dt = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;

    placement.update({ frame, dt });

    renderer.render(scene, camera);

    if (placement.isPlaced()) {
      statusEl.textContent = 'Turret-Basis platziert. (STEP 2 wird darauf aufbauen)';
      // Optional: setAnimationLoop laufen lassen; später kommt Gameplay/Weapon etc.
    }
  });
});
