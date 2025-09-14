import * as THREE from 'three';
import { CONFIG } from './config.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export function createInput(renderer, scene, camera) {
  const state = {
    controllers: [
      { index: 0, controller: renderer.xr.getController(0), grip: renderer.xr.getControllerGrip(0), handedness: null },
      { index: 1, controller: renderer.xr.getController(1), grip: renderer.xr.getControllerGrip(1), handedness: null },
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
    entry.controller.addEventListener('disconnected', () => { entry.handedness = null; });

    const model = factory.createControllerModel(entry.grip);
    entry.grip.add(model);

    scene.add(entry.controller);
    scene.add(entry.grip);
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
    const sens = 0.0022;
    state.mouseYaw   += ev.movementX * sens;
    state.mousePitch -= ev.movementY * sens;
    state.mousePitch = THREE.MathUtils.clamp(state.mousePitch, CONFIG.turret.minPitch, CONFIG.turret.maxPitch);
  });

  function getRightControllerGrip() {
    const right = state.controllers.find(c => c.handedness === 'right');
    if (right) return right.grip;
    const first = state.controllers[0];
    return first?.grip || null;
  }

  const _dir = new THREE.Vector3();
  return {
    update() {},

    getAimDirection() {
      if (state.hasVR) {
        const grip = getRightControllerGrip();
        if (grip) {
          _dir.set(0, 0, -1).applyQuaternion(grip.getWorldQuaternion(new THREE.Quaternion()));
          return _dir.normalize();
        }
        _dir.set(0, 0, -1).applyQuaternion(camera.quaternion);
        return _dir.normalize();
      } else {
        const xz = Math.cos(state.mousePitch);
        _dir.set(Math.sin(state.mouseYaw) * xz, Math.sin(state.mousePitch), -Math.cos(state.mouseYaw) * xz);
        return _dir.normalize();
      }
    }
  };
}
