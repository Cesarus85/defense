import * as THREE from 'three';
import { setupXRSupport } from './xr-setup.js';

const state = {
  running: true,
  arSupported: false
};

const appEl = document.getElementById('app');
const statusEl = document.getElementById('status');

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,                 // später AR: reale Umgebung „durchscheinen“
  powerPreference: 'high-performance'
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
appEl.appendChild(renderer.domElement);

// --- Szene & Kamera ---
const scene = new THREE.Scene();
scene.background = null;       // AR-freundlich

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 2); // neutrale Desktop-Startposition (nur Step 0)

// Minimal-Licht, damit später Modelle nicht schwarz sind
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));

// Optionales Debug-Objekt für Step 0 (nur Desktop-Ansicht, AR kommt in Step 1)
{
  const geo = new THREE.TorusKnotGeometry(0.15, 0.045, 150, 20);
  const mat = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.35, color: 0x88ccff });
  const knot = new THREE.Mesh(geo, mat);
  knot.position.set(0, 1.4, 0);
  scene.add(knot);

  // kleine Idle-Animation, um Renderloop zu verifizieren
  const baseRender = renderer.render.bind(renderer);
  const _renderWrapper = (s, c) => {
    const t = performance.now() * 0.001;
    knot.rotation.x = t * 0.25;
    knot.rotation.y = t * 0.35;
    baseRender(s, c);
  };
  renderer.render = _renderWrapper;
}

// --- Resize Handling ---
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// --- Sichtbarkeit pausiert die Schleife (schont Akku) ---
document.addEventListener('visibilitychange', () => {
  state.running = !document.hidden;
  if (state.running) requestAnimationFrame(loop);
});

// --- Main Loop ---
function loop() {
  if (!state.running) return;
  requestAnimationFrame(loop);
  renderer.render(scene, camera);
}

// --- Boot-Sequenz ---
(async function boot() {
  statusEl.textContent = 'Boot OK — Step 0';
  // AR-Unterstützung sichten (macht noch keinen Start!)
  try {
    state.arSupported = await setupXRSupport({ statusEl });
  } catch (e) {
    console.warn('XR support check failed:', e);
  }

  // Globale Debug-Hooks (praktisch für spätere Schritte)
  window.__GAME__ = {
    THREE, renderer, scene, camera, state
  };

  console.log('%cBoot OK — Step 0', 'color:#0f0; font-weight:bold');
  requestAnimationFrame(loop);
})();
