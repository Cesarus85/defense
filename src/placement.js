// /src/placement.js
import * as THREE from 'three';

/**
 * Reticle wie in "battleshipnew": 
 * - Priorität: Controller-HitTest (transient) -> Downward-HitTest -> mathematisch auf local-floor (y=0)
 * - Deutlich sichtbares Dual-Ring-Overlay (tiefer Kontrast, depthTest off)
 * - Smoothing für Position/Rotation, Mindestabstand zum Kopf, dynamische Skalierung
 * - Yaw-Feinrotation per rechtem Stick bleibt erhalten
 */
export function createPlacementController({
  scene,
  session,
  referenceSpace,
  viewerDownHitTestSource,
  transientHitTestSource
}) {
  const reticle = makeHighContrastReticle();
  scene.add(reticle);

  let placed = false;
  let base = null;
  let yawAccum = 0;               // zusätzliche Y-Rotation via rechter Thumbstick
  let hasPoseOnce = false;        // für sanften Einblend-Start
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const targetQuat = new THREE.Quaternion();

  // Trigger/Select bestätigt Platzierung
  const onSelect = () => {
    if (placed || !reticle.visible) return;
    base = makeTurretBase();
    base.position.copy(reticle.position);
    base.quaternion.copy(reticle.quaternion);
    scene.add(base);
    placed = true;
    reticle.visible = false;
  };
  session.addEventListener('select', onSelect);

  function update({ frame, dt = 0 }) {
    if (placed) return;

    // Rechter Thumbstick: extra Yaw
    for (const src of session.inputSources) {
      if (src?.handedness === 'right' && src.gamepad?.axes?.length >= 2) {
        const x = src.gamepad.axes[0] || 0;
        const dead = Math.abs(x) < 0.15 ? 0 : x;
        if (dead) yawAccum += dead * dt * 1.8; // 1.8 rad/s als angenehme Drehrate
      }
    }

    const viewerPose = frame.getViewerPose(referenceSpace);
    if (!viewerPose) { reticle.visible = false; return; }
    const head = new THREE.Vector3(
      viewerPose.transform.position.x,
      viewerPose.transform.position.y,
      viewerPose.transform.position.z
    );

    // --- 1) Bevorzugt: Controller-Transient-HitTest (präzises Zielen) ---
    let pose = getControllerHitPose(frame, referenceSpace, transientHitTestSource);

    // --- 2) Fallback: Downward-HitTest (stabiler Boden-Treffer) ---
    if (!pose) pose = getDownwardHitPose(frame, referenceSpace, viewerDownHitTestSource);

    // --- 3) Finaler Fallback: mathematisch Kopf gerade nach unten auf y=0 (local-floor) ---
    if (!pose) pose = getMathDownToY0Pose(viewerPose);

    if (!pose) { reticle.visible = false; return; }

    // Pose -> Ziel-Position/Rotation
    const mat = new THREE.Matrix4().fromArray(pose.transform.matrix);
    mat.decompose(targetPos, targetQuat, tmpScale);

    // Mindestabstand: verhindert monokulare Effekte/nur-rechtes-Auge
    const minDist = 0.5; // m
    const v = new THREE.Vector3().subVectors(targetPos, head);
    if (v.length() < minDist) {
      const fwd = getViewerForward(viewerPose);
      fwd.y = 0; fwd.normalize();
      targetPos.copy(head).addScaledVector(fwd, minDist);
      targetPos.y = 0; // local-floor annehmen
      targetQuat.identity(); // flach
    }

    // Reticle flach auf Ebene halten + Yaw vom Stick
    // Hinweis: Reticle-Geometrie liegt im **XY**-Plane (nicht vorrotiert).
    // targetQuat orientiert XY bereits zur getroffenen Ebene (Hit-Test).
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), yawAccum);
    targetQuat.multiply(yawQ);

    // Soft-Smoothing (frame-rate aware)
    // alpha ~ 0.22 @60fps, ~0.3 @90fps
    const alpha = 1.0 - Math.pow(0.78, Math.max(1, dt * 60));
    reticle.position.lerp(targetPos, alpha);
    THREE.Quaternion.slerp(reticle.quaternion, targetQuat, reticle.quaternion, alpha);

    // Sichtbarkeit erst nach dem ersten validen Pose-Frame
    if (!hasPoseOnce) {
      hasPoseOnce = true;
      reticle.visible = true;
      reticle.children.forEach(c => c.visible = true);
    }

    // Distanzbasierte Skalierung -> konstante visuelle Größe
    const dist = reticle.position.distanceTo(head);
    const s = THREE.MathUtils.clamp(0.12 + dist * 0.06, 0.14, 0.38);
    reticle.scale.lerp(new THREE.Vector3(s, s, s), 0.25);
  }

  function isPlaced() { return placed; }
  function getObject() { return base; }

  return { update, isPlaced, getObject };
}

/* ---------------- Helpers (Hit-Tests) ---------------- */

function getControllerHitPose(frame, referenceSpace, transientHitTestSource) {
  if (!transientHitTestSource) return null;
  const trResults = frame.getHitTestResultsForTransientInput(transientHitTestSource);
  if (!trResults?.length) return null;

  // Bevorzuge rechten Controller, sonst ersten nehmen
  let best = null;
  for (const tr of trResults) {
    if (!best) best = tr;
    if (tr.inputSource?.handedness === 'right') { best = tr; break; }
  }
  if (!best?.results?.length) return null;

  const pose = best.results[0].getPose(referenceSpace);
  return pose || null;
}

function getDownwardHitPose(frame, referenceSpace, viewerDownHitTestSource) {
  if (!viewerDownHitTestSource) return null;
  const results = frame.getHitTestResults(viewerDownHitTestSource);
  if (!results?.length) return null;
  const pose = results[0].getPose(referenceSpace);
  return pose || null;
}

function getMathDownToY0Pose(viewerPose) {
  // Kopfposition senkrecht nach unten auf y=0
  const o = new THREE.Vector3(
    viewerPose.transform.position.x,
    viewerPose.transform.position.y,
    viewerPose.transform.position.z
  );
  if (o.y <= 0.001) return null;
  const hit = { x: o.x, y: 0, z: o.z };
  // Quaternion identity => XY-Plane liegt auf dem Boden
  const t = new XRRigidTransform({ x: hit.x, y: hit.y, z: hit.z }, { x: 0, y: 0, z: 0, w: 1 });
  return { transform: { matrix: t.matrix } };
}

/* ---------------- Helpers (Reticle/Visuals) ---------------- */

function makeHighContrastReticle() {
  const g = new THREE.Group();
  g.visible = false;

  // Tiefer Kontrast: dunkler äußerer Ring (Overlay, depthTest off)
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.22, 48, 1),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false })
  );
  outer.renderOrder = 999; // immer oben

  // Heller innerer Ring
  const inner = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.165, 48, 1),
    new THREE.MeshBasicMaterial({ color: 0x3cf0c8, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false })
  );
  inner.renderOrder = 1000;

  // Kreuz (Linien)
  const crossGeo = new THREE.BufferGeometry();
  const verts = new Float32Array([ -0.045,0,0,  0.045,0,0,   0,0,-0.045,  0,0,0.045 ]);
  crossGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  crossGeo.setIndex([0,1, 2,3]);
  const cross = new THREE.LineSegments(
    crossGeo,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false })
  );
  cross.renderOrder = 1001;

  g.add(outer, inner, cross);
  return g;
}

function makeTurretBase() {
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.20, 0.22, 0.08, 24),
    new THREE.MeshStandardMaterial({ color: 0x384250, roughness: 0.7, metalness: 0.1 })
  );
  base.receiveShadow = true;

  const ringMesh = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.005, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0x4ee0aa, transparent: true, opacity: 0.25 })
  );
  ringMesh.rotation.x = -Math.PI / 2;
  base.add(ringMesh);
  return base;
}

function getViewerForward(viewerPose) {
  const q = new THREE.Quaternion(
    viewerPose.transform.orientation.x,
    viewerPose.transform.orientation.y,
    viewerPose.transform.orientation.z,
    viewerPose.transform.orientation.w
  );
  return new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
}
