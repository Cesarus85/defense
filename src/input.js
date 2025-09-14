// /src/input.js
// Option B: Delta-Referenz wird exakt an den Griffen gesetzt (ohne Offsets),
// Forward-Vektor aus dem GRIP-Transform, robustes Auto-Release über breakDist.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export function createInput(renderer, scene, camera, opts = {}) {
  const handles = opts.handles || null;

  const state = {
    controllers: [
      { index: 0, controller: renderer.xr.getController(0), grip: renderer.xr.getControllerGrip(0), handedness: null, grabbing: false, grabbedHandle: null },
      { index: 1, controller: renderer.xr.getController(1), grip: renderer.xr.getControllerGrip(1), handedness: null, grabbing: false, grabbedHandle: null },
    ],
    hasVR: false,

    // "Stable" Gate
    bothGrabTimer: 0,
    bothGrabStable: false,

    // Delta-Referenz
    refYaw: 0,
    refPitch: 0,
    haveRef: false,

    // Desktop-Fallback
    mouseYaw: 0, mousePitch: 0, mouseActive: false,
    canvas: renderer.domElement,
  };

  const factory = new XRControllerModelFactory();

  state.controllers.forEach(entry => {
    entry.controller.addEventListener('connected', e => {
      entry.handedness = e.data.handedness || null;
      entry.grip.userData.handedness = entry.handedness;
    });
    entry.controller.addEventListener('disconnected', () => {
      entry.handedness = null; release(entry);
    });

    // Squeeze = greifen (nur wenn nah am vorgesehenen Griff)
    entry.controller.addEventListener('squeezestart', () => {
      if (!handles) { entry.grabbing = true; entry.grabbedHandle = null; return; }
      const which = whichHandleNear(entry.grip, handles, CONFIG.input.grabDist);
      if (which) {
        entry.grabbing = true;
        entry.grabbedHandle = which;
        const mat = which === 'left' ? handles.left.material : handles.right.material;
        mat.emissive.setHex(0x00aaff); mat.emissiveIntensity = 0.6;
      }
    });

    entry.controller.addEventListener('squeezeend', () => release(entry));

    const model = factory.createControllerModel(entry.grip);
    entry.grip.add(model);
    scene.add(entry.controller, entry.grip);
  });

  function release(entry){
    entry.grabbing = false;
    entry.grabbedHandle = null;
    state.bothGrabTimer = 0;
    state.bothGrabStable = false;
    state.haveRef = false; // Delta-Ref verwerfen
    if (handles) {
      handles.left.material.emissive.setHex(0x000000);
      handles.left.material.emissiveIntensity = 0.0;
      handles.right.material.emissive.setHex(0x000000);
      handles.right.material.emissiveIntensity = 0.0;
    }
  }

  renderer.xr.addEventListener('sessionstart', () => { state.hasVR = true; });
  renderer.xr.addEventListener('sessionend',   () => {
    state.hasVR = false;
    state.controllers.forEach(release);
  });

  // Desktop-Fallback
  state.canvas.style.touchAction = 'none';
  state.canvas.addEventListener('pointerdown', () => { state.mouseActive = true; state.canvas.requestPointerLock?.(); });
  window.addEventListener('pointerup',   () => { state.mouseActive = false; document.exitPointerLock?.(); });
  window.addEventListener('mousemove', (ev) => {
    if (!state.mouseActive || state.hasVR) return;
    const sens = 0.0022;
    state.mouseYaw   += ev.movementX * sens;
    state.mousePitch -= ev.movementY * sens;
    state.mousePitch = THREE.MathUtils.clamp(state.mousePitch, -Math.PI/3, Math.PI/3);
  });

  function whichHandleNear(grip, handles, maxDist) {
    const gp = grip.getWorldPosition(new THREE.Vector3());
    const lp = handles.left.getWorldPosition(new THREE.Vector3());
    const rp = handles.right.getWorldPosition(new THREE.Vector3());
    const dl = gp.distanceTo(lp), dr = gp.distanceTo(rp);
    if (dl <= maxDist && dl <= dr) return 'left';
    if (dr <= maxDist && dr <  dl) return 'right';
    return null;
  }

  function enforceGrabDistance() {
    if (!handles || !state.hasVR) return;
    for (const c of state.controllers) {
      if (!c.grabbing || !c.grabbedHandle) continue;
      const hp = c.grabbedHandle === 'left' ? handles.left : handles.right;
      const hpw = hp.getWorldPosition(new THREE.Vector3());
      const gp  = c.grip.getWorldPosition(new THREE.Vector3());
      if (gp.distanceTo(hpw) > CONFIG.input.breakDist) {
        release(c);
      }
    }
  }

  // Aktuelle Yaw/Pitch aus den (gegriffenen) Controllern – Vorwärts aus GRIP-Quaternion
  function getCurrentYawPitch() {
    const active = state.controllers.filter(c => c.grabbing);
    if (active.length === 0) return null;

    const fwd = new THREE.Vector3();
    for (const c of active) {
      const v = new THREE.Vector3(0,0,-1)
        .applyQuaternion(c.grip.getWorldQuaternion(new THREE.Quaternion())); // GRIP, nicht controller
      fwd.add(v);
    }
    fwd.normalize();
    const xz = Math.hypot(fwd.x, fwd.z);
    const yaw   = Math.atan2(fwd.x, -fwd.z); // -Z nach vorn
    const pitch = Math.atan2(fwd.y, xz);
    return { yaw, pitch };
  }

  // Nähe-Highlight
  function proximityHighlight() {
    if (!handles || !state.hasVR) return;
    let leftNear = false, rightNear = false;
    for (const c of state.controllers) {
      if (!c.grip || c.grabbing) continue;
      const which = whichHandleNear(c.grip, handles, CONFIG.input.grabDist);
      if (which === 'left') leftNear = true;
      if (which === 'right') rightNear = true;
    }
    handles.left.material.emissive.setHex(leftNear ? 0x0077aa : 0x000000);
    handles.left.material.emissiveIntensity = leftNear ? 0.4 : 0.0;
    handles.right.material.emissive.setHex(rightNear ? 0x0077aa : 0x000000);
    handles.right.material.emissiveIntensity = rightNear ? 0.4 : 0.0;
  }

  // Utils
  function shortestAngle(a) {
    let ang = ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (ang < -Math.PI) ang += Math.PI * 2;
    return ang;
  }

  const _dir = new THREE.Vector3();

  return {
    update(dt=0) {
      proximityHighlight();
      enforceGrabDistance();

      // Stable-Gate (beide Griffe)
      if (CONFIG.turret.requireBothHandsToAim) {
        const both = state.controllers[0].grabbing && state.controllers[1].grabbing;
        if (both) {
          state.bothGrabTimer += dt;
          if (state.bothGrabTimer >= CONFIG.input.stableDelay) {
            state.bothGrabStable = true;
          }
        } else {
          state.bothGrabTimer = 0;
          state.bothGrabStable = false;
          state.haveRef = false;
        }
      } else {
        state.bothGrabStable = state.controllers.some(c => c.grabbing);
        if (!state.bothGrabStable) state.haveRef = false;
      }

      // ✨ Delta-Referenz setzen, sobald stable – exakt an der aktuellen Griff-Pose
      if (CONFIG.turret.controlMode === 'delta' && state.bothGrabStable && !state.haveRef) {
        const ori = getCurrentYawPitch();
        if (ori) {
          state.refYaw = ori.yaw;
          state.refPitch = ori.pitch; // keine Offsets!
          state.haveRef = true;
        }
      }
    },

    // Delta-Ausgabe relativ zur zuletzt eingefrorenen Referenz
    getDeltaYawPitch() {
      if (!state.hasVR) return { ok: false, dy: 0, dp: 0 };
      if (!CONFIG.turret.requireGrabToAim) return { ok: false, dy: 0, dp: 0 };
      if (CONFIG.turret.controlMode !== 'delta') return { ok: false, dy: 0, dp: 0 };
      if (!state.bothGrabStable || !state.haveRef) return { ok: false, dy: 0, dp: 0 };

      const ori = getCurrentYawPitch();
      if (!ori) return { ok: false, dy: 0, dp: 0 };

      const dy = shortestAngle(ori.yaw - state.refYaw);
      const dp = shortestAngle(ori.pitch - state.refPitch);

      // Deadzone
      const dz = THREE.MathUtils.degToRad(CONFIG.turret.deadzoneDeg);
      const dyFiltered = Math.abs(dy) < dz ? 0 : dy;
      const dpFiltered = Math.abs(dp) < dz ? 0 : dp;

      return { ok: true, dy: dyFiltered, dp: dpFiltered };
    },

    // Absolute Richtung (Fallback / Desktop)
    getAimDirection() {
      if (state.hasVR) {
        if (CONFIG.turret.requireGrabToAim && !state.bothGrabStable) return null;
        // Mittelwert der gegriffenen Hände nutzen
        const active = state.controllers.filter(c=>c.grabbing);
        if (active.length === 0) return null;
        const fwd = new THREE.Vector3();
        for (const c of active) {
          const v = new THREE.Vector3(0,0,-1).applyQuaternion(c.grip.getWorldQuaternion(new THREE.Quaternion()));
          fwd.add(v);
        }
        return fwd.normalize();
      } else {
        const xz = Math.cos(state.mousePitch);
        _dir.set(Math.sin(state.mouseYaw) * xz, Math.sin(state.mousePitch), -Math.cos(state.mouseYaw) * xz);
        return _dir.normalize();
      }
    },

    // Desktop-Test
    getDesktopDir() {
      const xz = Math.cos(state.mousePitch);
      return new THREE.Vector3(Math.sin(state.mouseYaw) * xz, Math.sin(state.mousePitch), -Math.cos(state.mouseYaw) * xz).normalize();
    }
  };
}
