import * as THREE from 'three';
import { CONFIG } from './config.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export function createInput(renderer, scene, camera, opts = {}) {
  const handles = opts.handles || null; // { left: Mesh, right: Mesh }

  const state = {
    controllers: [
      { index: 0, controller: renderer.xr.getController(0), grip: renderer.xr.getControllerGrip(0), handedness: null, grabbing: false, grabbedHandle: null },
      { index: 1, controller: renderer.xr.getController(1), grip: renderer.xr.getControllerGrip(1), handedness: null, grabbing: false, grabbedHandle: null },
    ],
    hasVR: false,
    // Stabilität
    bothGrabTimer: 0,
    bothGrabStable: false,
    // Delta-Grip: Referenz (erst gesetzt wenn stable)
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
      entry.handedness = null; entry.grabbing = false; entry.grabbedHandle = null;
      state.bothGrabTimer = 0; state.bothGrabStable = false; state.haveRef = false;
    });

    entry.controller.addEventListener('squeezestart', () => {
      if (!handles) { entry.grabbing = true; entry.grabbedHandle = null; return; }
      const which = whichHandleNear(entry.grip, handles, CONFIG.input.grabDist);
      if (which) {
        entry.grabbing = true; entry.grabbedHandle = which;
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
    state.haveRef = false;
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

  // Desktop-Fallback (Maus)
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
      // Debugging: Ausgabe der Distanz, um Entgleiten zu analysieren
      // console.log('Distanz:', gp.distanceTo(hpw));
      if (gp.distanceTo(hpw) > CONFIG.input.breakDist) {
        release(c);
      }
    }
  }

  // Aktuelle Yaw/Pitch aus den (gegriffenen) Controllern – basierend auf Forward-Vektor
  function getCurrentYawPitch() {
    const active = state.controllers.filter(c => c.grabbing);
    if (active.length === 0) return null;

    // Mittelwert der Forward-Vektoren (Ein- oder Beidhändig)
    const fwd = new THREE.Vector3();
    for (const c of active) {
      const v = new THREE.Vector3(0,0,-1).applyQuaternion(c.grip.getWorldQuaternion(new THREE.Quaternion()));
      fwd.add(v);
    }
    fwd.normalize();
    const xz = Math.hypot(fwd.x, fwd.z);
    const yaw   = Math.atan2(fwd.x, -fwd.z); // -Z = vor
    const pitch = Math.atan2(fwd.y, xz);
    return { yaw, pitch };
  }

  // Nähe-Highlight wenn NICHT gegriffen
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

  return {
    update(dt=0) {
      proximityHighlight();
      // enforceGrabDistance(); // Auskommentieren für komplettes "Snappen" ohne Distanzprüfung
      enforceGrabDistance(); // Aktiv mit breakDist: 1.0 – teste zuerst so

      // Stable-Gate: erst wenn beide Griffe halten und Delay verstrichen
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
        // Einhand ok → “Stable” sobald irgendein Griff aktiv
        state.bothGrabStable = state.controllers.some(c => c.grabbing);
        if (!state.bothGrabStable) state.haveRef = false;
      }

      // Referenz setzen, sobald stable und noch keine Ref vorhanden
      if (state.bothGrabStable && !state.haveRef) {
        const ori = getCurrentYawPitch();
        if (ori) {
          state.refYaw = ori.yaw;
          state.refPitch = ori.pitch;
          state.haveRef = true;
        }
      }
    },

    /**
     * Liefert bei “stable” die aktuellen Yaw/Pitch relativ zur gesetzten Referenz
     * (Delta-Grip). Rückgabe: { ok:boolean, dy:number, dp:number }
     */
    getDeltaYawPitch() {
      if (!state.hasVR) return { ok: false, dy: 0, dp: 0 };
      if (!CONFIG.turret.requireGrabToAim) return { ok: false, dy: 0, dp: 0 };
      if (!state.bothGrabStable || !state.haveRef) return { ok: false, dy: 0, dp: 0 };

      const ori = getCurrentYawPitch();
      if (!ori) return { ok: false, dy: 0, dp: 0 };

      // Kleinsten Winkeldelta nehmen
      const dy = shortestAngle(ori.yaw - state.refYaw);
      const dp = shortestAngle(ori.pitch - state.refPitch);

      // Deadzone
      const dz = THREE.MathUtils.degToRad(CONFIG.turret.deadzoneDeg);
      const dyFiltered = Math.abs(dy) < dz ? 0 : dy;
      const dpFiltered = Math.abs(dp) < dz ? 0 : dp;

      return { ok: true, dy: dyFiltered, dp: dpFiltered };
    },

    // Desktop-Test (nicht VR): liefert Richtung aus Maus
    getDesktopDir() {
      const xz = Math.cos(state.mousePitch);
      return new THREE.Vector3(Math.sin(state.mouseYaw) * xz, Math.sin(state.mousePitch), -Math.cos(state.mouseYaw) * xz).normalize();
    }
  };
}

// Hilfsfunktionen
function shortestAngle(a) {
  let ang = ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (ang < -Math.PI) ang += Math.PI * 2;
  return ang;
}
