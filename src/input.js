import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js';
import { CONFIG } from './config.js';

export function createInput(renderer, scene, camera) {
  const state = {
    // Controller Objekte
    controllers: [
      { index: 0, controller: renderer.xr.getController(0), grip: renderer.xr.getControllerGrip(0), handedness: null },
      { index: 1, controller: renderer.xr.getController(1), grip: renderer.xr.getControllerGrip(1), handedness: null },
    ],
    hasVR: false,
    // Desktop-Fallback
    mouseYaw: 0,
    mousePitch: 0,
    mouseActive: false,
    canvas: renderer.domElement,
  };

  // Controller-Modelle anzeigen
  import('https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/webxr/XRControllerModelFactory.js').then(({ XRControllerModelFactory }) => {
    const factory = new XRControllerModelFactory();

    state.controllers.forEach(entry => {
      // Verbunden → Hand (left/right) merken
      entry.controller.addEventListener('connected', e => {
        entry.handedness = e.data.handedness || null;
        // Übertrage Info auf Grip, damit man sie dort auch findet
        entry.grip.userData.handedness = entry.handedness;
      });
      entry.controller.addEventListener('disconnected', () => {
        entry.handedness = null;
      });

      // Visuelles Controller-Modell
      const model = factory.createControllerModel(entry.grip);
      entry.grip.add(model);

      scene.add(entry.controller);
      scene.add(entry.grip);
    });
  });

  // Session-Events
  renderer.xr.addEventListener('sessionstart', () => { state.hasVR = true; });
  renderer.xr.addEventListener('sessionend',   () => { state.hasVR = false; });

  // Desktop-Fallback: Maus steuert Turret
  state.canvas.style.touchAction = 'none';
  state.canvas.addEventListener('pointerdown', () => { state.mouseActive = true; state.canvas.requestPointerLock?.(); });
  window.addEventListener('pointerup',   () => { state.mouseActive = false; document.exitPointerLock?.(); });
  window.addEventListener('mousemove', (ev) => {
    if (!state.mouseActive || state.hasVR) return;
    // Skaliere Bewegung
    const sens = 0.0022;
    state.mouseYaw   += ev.movementX * sens;
    state.mousePitch -= ev.movementY * sens;
    state.mousePitch = THREE.MathUtils.clamp(state.mousePitch, CONFIG.turret.minPitch, CONFIG.turret.maxPitch);
  });

  function getRightControllerGrip() {
    // Bevorzugt explizit "right"
    const right = state.controllers.find(c => c.handedness === 'right');
    if (right) return right.grip;
    // Fallback: nimm 0, wenn überhaupt einer verbunden
    const first = state.controllers.find(c => c);
    return first?.grip || null;
  }

  const _dir = new THREE.Vector3();

  return {
    update() { /* reserviert */ },

    /**
     * Liefert eine Vorwärts-Richtung für's Zielen.
     * - In VR: aus rechter Grip-Orientierung (0,0,-1 transformiert).
     * - Desktop: aus Maus-Yaw/Pitch.
     */
    getAimDirection() {
      if (state.hasVR) {
        const grip = getRightControllerGrip();
        if (grip) {
          _dir.set(0, 0, -1).applyQuaternion(grip.getWorldQuaternion(new THREE.Quaternion()));
          return _dir.normalize();
        }
        // Fallback auf Kopf
        _dir.set(0, 0, -1).applyQuaternion(camera.quaternion);
        return _dir.normalize();
      } else {
        // Desktop: Mauswinkel umsetzen
        const xz = Math.cos(state.mousePitch);
        _dir.set(Math.sin(state.mouseYaw) * xz, Math.sin(state.mousePitch), -Math.cos(state.mouseYaw) * xz);
        return _dir.normalize();
      }
    }
  };
}
