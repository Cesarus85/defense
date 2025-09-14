import * as THREE from 'three';
import { CONFIG } from './config.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export function createInput(renderer, scene, camera, opts = {}) {
  const handles = opts.handles || null;     // { left: Mesh, right: Mesh }
  const GRAB_DIST = 0.14;                   // ~14 cm zum Greifen
  const BREAK_DIST = 0.16;                  // >16 cm ⇒ Griff wird gelöst
  const STABLE_DELAY = 0.15;                // 150 ms: erst dann Aiming freigeben

  const state = {
    controllers: [
      { index: 0, controller: renderer.xr.getController(0), grip: renderer.xr.getControllerGrip(0), handedness: null, grabbing: false, grabbedHandle: null },
      { index: 1, controller: renderer.xr.getController(1), grip: renderer.xr.getControllerGrip(1), handedness: null, grabbing: false, grabbedHandle: null },
    ],
    hasVR: false,
    bothGrabTimer: 0,
    bothGrabStable: false,

    // Desktop-Fallback
    mouseYaw: 0, mousePitch: 0, mouseActive: false,
    canvas: renderer.domElement,
  };

  // Controller-Modelle
  const factory = new XRControllerModelFactory();
  state.controllers.forEach(entry => {
    entry.controller.addEventListener('connected', e => {
      entry.handedness = e.data.handedness || null;
      entry.grip.userData.handedness = entry.handedness;
    });
    entry.controller.addEventListener('disconnected', () => {
      entry.handedness = null; entry.grabbing = false; entry.grabbedHandle = null;
    });

    const model = factory.createControllerModel(entry.grip);
    entry.grip.add(model);

    // Greifen nur, wenn nah am jeweiligen Griff
    entry.controller.addEventListener('squeezestart', () => {
      if (!handles) { entry.grabbing = true; entry.grabbedHandle = null; return; }
      const which = whichHandleNear(entry.grip, handles, GRAB_DIST);
      if (which) {
        entry.grabbing = true;
        entry.grabbedHandle = which; // 'left' | 'right'
        const mat = which === 'left' ? handles.left.material : handles.right.material;
        mat.emissive.setHex(0x00aaff); mat.emissiveIntensity = 0.6;
      }
    });

    entry.controller.addEventListener('squeezeend', () => release(entry));

    scene.add(entry.controller);
    scene.add(entry.grip);
  });

  function release(entry){
    entry.grabbing = false;
    entry.grabbedHandle = null;
    state.bothGrabTimer = 0;
    state.bothGrabStable = false;
    if (handles) {
      handles.left.material.emissive.setHex(0x000000);
      handles.left.material.emissiveIntensity = 0.0;
      handles.right.material.emissive.setHex(0x000000);
      handles.right.material.emissiveIntensity = 0.0;
    }
  }

  // Session-Events
  renderer.xr.addEventListener('sessionstart', () => { state.hasVR = true; });
  renderer.xr.addEventListener('sessionend',   () => {
    state.hasVR = false;
    state.controllers.forEach(release);
  });

  // Desktop-Fallback (Maus)
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

  // Nähe-Highlight wenn NICHT gegriffen
  function proximityHighlight() {
    if (!handles || !state.hasVR) return;
    let leftNear = false, rightNear = false;
    for (const c of state.controllers) {
      if (!c.grip || c.grabbing) continue;
      const which = whichHandleNear(c.grip, handles, GRAB_DIST);
      if (which === 'left') leftNear = true;
      if (which === 'right') rightNear = true;
    }
    handles.left.material.emissive.setHex(leftNear ? 0x0077aa : 0x000000);
    handles.left.material.emissiveIntensity = leftNear ? 0.4 : 0.0;
    handles.right.material.emissive.setHex(rightNear ? 0x0077aa : 0x000000);
    handles.right.material.emissiveIntensity = rightNear ? 0.4 : 0.0;
  }

  // Während des Greifens prüfen, ob du dich vom Griff entfernst → ggf. Auto-Release
  function enforceGrabDistance() {
    if (!handles || !state.hasVR) return;
    for (const c of state.controllers) {
      if (!c.grabbing || !c.grabbedHandle) continue;
      const hp = c.grabbedHandle === 'left'
        ? handles.left.getWorldPosition(new THREE.Vector3())
        : handles.right.getWorldPosition(new THREE.Vector3());
      const gp = c.grip.getWorldPosition(new THREE.Vector3());
      if (gp.distanceTo(hp) > BREAK_DIST) {
        release(c);
      }
    }
  }

  function whichHandleNear(grip, handles, maxDist) {
    const gp = grip.getWorldPosition(new THREE.Vector3());
    const lp = handles.left.getWorldPosition(new THREE.Vector3());
    const rp = handles.right.getWorldPosition(new THREE.Vector3());
    const dl = gp.distanceTo(lp), dr = gp.distanceTo(rp);
    if (dl <= maxDist && dl <= dr) return 'left';
    if (dr <= maxDist && dr <  dl) return 'right';
    return null;
  }

  function getForward(grip) {
    return new THREE.Vector3(0,0,-1).applyQuaternion(grip.getWorldQuaternion(new THREE.Quaternion())).normalize();
  }

  const _dir = new THREE.Vector3();
  const _sum = new THREE.Vector3();

  return {
    update(dt=0) {
      proximityHighlight();
      enforceGrabDistance();

      // Stable-Gate: erst wenn beide Griffe halten und 150ms verstrichen
      if (CONFIG.turret.requireBothHandsToAim) {
        const both = state.controllers[0].grabbing && state.controllers[1].grabbing;
        if (both) {
          state.bothGrabTimer += dt;
          if (state.bothGrabTimer >= STABLE_DELAY) state.bothGrabStable = true;
        } else {
          state.bothGrabTimer = 0;
          state.bothGrabStable = false;
        }
      }
    },

    /**
     * Liefert die Aiming-Richtung oder null (wenn noch nicht „stabil gegriffen“).
     */
    getAimDirection() {
      if (state.hasVR) {
        if (CONFIG.turret.requireGrabToAim) {
          if (CONFIG.turret.requireBothHandsToAim) {
            if (!state.bothGrabStable) return null;
            _sum.set(0,0,0);
            for (const c of state.controllers) _sum.add(getForward(c.grip));
            return _sum.multiplyScalar(0.5).normalize();
          } else {
            const active = state.controllers.filter(c => c.grabbing);
            if (active.length === 0) return null;
            _sum.set(0,0,0);
            for (const c of active) _sum.add(getForward(c.grip));
            return _sum.multiplyScalar(1/active.length).normalize();
          }
        }
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
