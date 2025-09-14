import * as THREE from 'three';
import { CONFIG } from './config.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export function createInput(renderer, scene, camera, opts = {}) {
  const handles = opts.handles || null; // { left: Mesh, right: Mesh }
  const GRAB_DIST = 0.12;               // ~12 cm Griff-Reichweite

  const state = {
    controllers: [
      { index: 0, controller: renderer.xr.getController(0), grip: renderer.xr.getControllerGrip(0), handedness: null, grabbing: false },
      { index: 1, controller: renderer.xr.getController(1), grip: renderer.xr.getControllerGrip(1), handedness: null, grabbing: false },
    ],
    hasVR: false,
    mouseYaw: 0,
    mousePitch: 0,
    mouseActive: false,
    canvas: renderer.domElement,
  };

  // Controller-Modelle
  const factory = new XRControllerModelFactory();
  state.controllers.forEach(entry => {
    entry.controller.addEventListener('connected', e => {
      entry.handedness = e.data.handedness || null;
      entry.grip.userData.handedness = entry.handedness;
    });
    entry.controller.addEventListener('disconnected', () => { entry.handedness = null; entry.grabbing = false; });

    const model = factory.createControllerModel(entry.grip);
    entry.grip.add(model);

    // Grab-Logik auf Squeeze (Seitenbutton)
    entry.controller.addEventListener('squeezestart', () => {
      if (!handles) { entry.grabbing = true; return; }
      const near = whichHandleNear(entry.grip, handles, GRAB_DIST);
      if (near) {
        entry.grabbing = true;
        // Highlight passender Griff
        near === 'left' ? handles.left.material.emissive.setHex(0x00aaff) : handles.right.material.emissive.setHex(0x00aaff);
        const mat = near === 'left' ? handles.left.material : handles.right.material;
        mat.emissiveIntensity = 0.6;
      }
    });
    entry.controller.addEventListener('squeezeend', () => {
      entry.grabbing = false;
      if (handles) {
        handles.left.material.emissive.setHex(0x000000);
        handles.left.material.emissiveIntensity = 0.0;
        handles.right.material.emissive.setHex(0x000000);
        handles.right.material.emissiveIntensity = 0.0;
      }
    });

    scene.add(entry.controller);
    scene.add(entry.grip);
  });

  // Session-Events
  renderer.xr.addEventListener('sessionstart', () => { state.hasVR = true; });
  renderer.xr.addEventListener('sessionend',   () => { state.hasVR = false; state.controllers.forEach(c=>c.grabbing=false); });

  // Desktop-Fallback: Maus steuert Turret
  state.canvas.style.touchAction = 'none';
  state.canvas.addEventListener('pointerdown', () => { state.mouseActive = true; state.canvas.requestPointerLock?.(); });
  window.addEventListener('pointerup',   () => { state.mouseActive = false; document.exitPointerLock?.(); });
  window.addEventListener('mousemove', (ev) => {
    if (!state.mouseActive || state.hasVR) return;
    const sens = 0.0022;
    state.mouseYaw   += ev.movementX * sens;
    state.mousePitch -= ev.movementY * sens;
    state.mousePitch = THREE.MathUtils.clamp(state.mousePitch, CONFIG.turret.minPitch, CONFIG.turret.maxPitch);
  });

  // Nähe-Feedback (Highlight), wenn nicht gegriffen
  const _tmpH = new THREE.Vector3();
  function proximityHighlight() {
    if (!handles || !state.hasVR) return;
    let leftNear = false, rightNear = false;
    for (const c of state.controllers) {
      if (!c.grip) continue;
      const which = whichHandleNear(c.grip, handles, GRAB_DIST);
      if (which === 'left') leftNear = true;
      if (which === 'right') rightNear = true;
    }
    handles.left.material.emissive.setHex(leftNear ? 0x0077aa : 0x000000);
    handles.left.material.emissiveIntensity = leftNear ? 0.4 : 0.0;
    handles.right.material.emissive.setHex(rightNear ? 0x0077aa : 0x000000);
    handles.right.material.emissiveIntensity = rightNear ? 0.4 : 0.0;
  }

  function whichHandleNear(grip, handles, maxDist) {
    const gp = grip.getWorldPosition(new THREE.Vector3());
    const lp = handles.left.getWorldPosition(_tmpH.set(0,0,0));
    const rp = handles.right.getWorldPosition(new THREE.Vector3());
    const dl = gp.distanceTo(lp);
    const dr = gp.distanceTo(rp);
    if (dl <= maxDist && dl <= dr) return 'left';
    if (dr <= maxDist && dr < dl)  return 'right';
    return null;
  }

  function getForward(grip) {
    return new THREE.Vector3(0,0,-1).applyQuaternion(grip.getWorldQuaternion(new THREE.Quaternion())).normalize();
  }

  const _dir = new THREE.Vector3();
  const _sum = new THREE.Vector3();

  return {
    update() { proximityHighlight(); },

    /**
     * Liefert eine Vorwärts-Richtung fürs Zielen.
     * - In VR & beim Greifen: Durchschnitt der Vorwärtsvektoren beider greifenden Controller.
     * - In VR ohne Greifen: rechter Controller (Fallback Kopf).
     * - Desktop: Maus.
     */
    getAimDirection() {
      if (state.hasVR) {
        const active = state.controllers.filter(c => c.grabbing);
        if (active.length > 0) {
          _sum.set(0,0,0);
          for (const c of active) _sum.add(getForward(c.grip));
          if (active.length === 1) return _sum.normalize();
          return _sum.multiplyScalar(1/active.length).normalize();
        }
        // Kein Grab: rechter Controller oder Kopf
        const right = state.controllers.find(c => c.handedness === 'right') || state.controllers[0];
        if (right) return getForward(right.grip);
        return new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
      } else {
        const xz = Math.cos(state.mousePitch);
        _dir.set(Math.sin(state.mouseYaw) * xz, Math.sin(state.mousePitch), -Math.cos(state.mouseYaw) * xz);
        return _dir.normalize();
      }
    }
  };
}
