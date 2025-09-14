import * as THREE from 'three';

export function createPlacementController({
  scene,
  session,
  referenceSpace,
  viewerDownHitTestSource,
  transientHitTestSource
}) {
  const reticle = makeHighContrastReticle(); // flach auf Boden, immer gut sichtbar
  scene.add(reticle);

  let placed = false;
  let base = null;
  let yawAccum = 0;               // Y-Rotation per rechter Thumbstick
  let hasPoseOnce = false;        // erst nach dem 1. gültigen Pose-Frame sichtbar

  // Platzierung per Trigger/Select
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

  // Temp-Objekte
  const targetPos = new THREE.Vector3();
  const targetQuat = new THREE.Quaternion();
  const tmpScale  = new THREE.Vector3();

  function update({ frame, dt = 0 }) {
    if (placed) return;

    // Rechter Thumbstick -> Yaw
    for (const src of session.inputSources) {
      if (src?.handedness === 'right' && src.gamepad?.axes?.length >= 2) {
        const x = src.gamepad.axes[0] || 0;
        const dead = Math.abs(x) < 0.15 ? 0 : x;
        if (dead) yawAccum += dead * dt * 1.8;
      }
    }

    const viewerPose = frame.getViewerPose(referenceSpace);
    if (!viewerPose) { reticle.visible = false; return; }

    // 1) Controller-Transient Hit-Test (präzise)
    let pose = getControllerHitPose(frame, referenceSpace, transientHitTestSource);

    // 2) Downward Headset Hit-Test
    if (!pose) pose = getDownwardHitPose(frame, referenceSpace, viewerDownHitTestSource);

    // 3) Mathematisch: Kopf senkrecht auf y=0
    if (!pose) pose = getMathDownToY0Pose(viewerPose);

    if (!pose) { reticle.visible = false; return; }

    // Pose -> Zieltransform
    const mat = new THREE.Matrix4().fromArray(pose.transform.matrix);
    mat.decompose(targetPos, targetQuat, tmpScale);

    // Mindestabstand gegen monokulare Effekte
    const head = new THREE.Vector3(
      viewerPose.transform.position.x,
      viewerPose.transform.position.y,
      viewerPose.transform.position.z
    );
    const minDist = 0.5;
    const delta = new THREE.Vector3().subVectors(targetPos, head);
    if (delta.length() < minDist) {
      const fwd = getViewerForward(viewerPose);
      fwd.y = 0; fwd.normalize();
      targetPos.copy(head).addScaledVector(fwd, minDist);
      targetPos.y = 0;
      // flach ausrichten (XZ-Plane) + Yaw
      targetQuat.setFromAxisAngle(new THREE.Vector3(0,1,0), 0);
    }

    // Yaw-Feinrotation aufaddieren
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), yawAccum);
    targetQuat.premultiply(yawQ);

    // Sanftes Glätten (Instanz-Methode! kein static slerp)
    const alpha = 1.0 - Math.pow(0.78, Math.max(1, dt * 60));
    reticle.position.lerp(targetPos, alpha);
    reticle.quaternion.slerp(targetQuat, alpha);

    if (!hasPoseOnce) {
      hasPoseOnce = true;
      reticle.visible = true;
    }

    // Distanzbasierte Skalierung (konstante visuelle Größe)
    const dist = reticle.position.distanceTo(head);
    const s = THREE.MathUtils.clamp(0.12 + dist * 0.06, 0.14, 0.38);
    reticle.scale.lerp(new THREE.Vector3(s, s, s), 0.25);
  }

  function isPlaced() { return placed; }
  function getObject() { return base; }

  return { update, isPlaced, getObject };
}

/* ---------- Hit-Test Helpers ---------- */

function getControllerHitPose(frame, referenceSpace, transientHitTestSource) {
  if (!transientHitTestSource) return null;
  const trResults = frame.getHitTestResultsForTransientInput(transientHitTestSource);
  if (!trResults?.length) return null;
  let best = null;
  for (const tr of trResults) {
    if (!best) best = tr;
    if (tr.inputSource?.handedness === 'right') { best = tr; break; }
  }
  if (!best?.results?.length) return null;
  return best.results[0].getPose(referenceSpace) || null;
}

function getDownwardHitPose(frame, referenceSpace, viewerDownHitTestSource) {
  if (!viewerDownHitTestSource) return null;
  const results = frame.getHitTestResults(viewerDownHitTestSource);
  if (!results?.length) return null;
  return results[0].getPose(referenceSpace) || null;
}

function getMathDownToY0Pose(viewerPose) {
  const o = new THREE.Vector3(
    viewerPose.transform.position.x,
    viewerPose.transform.position.y,
    viewerPose.transform.position.z
  );
  if (o.y <= 0.001) return null;
  const t = new XRRigidTransform(
    { x: o.x, y: 0, z: o.z }, // senkrecht unter dem Kopf auf Boden
    { x: 0, y: 0, z: 0, w: 1 }
  );
  return { transform: { matrix: t.matrix } };
}

/* ---------- Visuals ---------- */

function makeHighContrastReticle() {
  const g = new THREE.Group();
  g.visible = false;

  // Außenring (schwarz, Overlay)
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.22, 48, 1),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false })
  );
  outer.rotation.x = -Math.PI / 2; // flach auf Boden
  outer.renderOrder = 999;

  // Innenring (hell)
  const inner = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.165, 48, 1),
    new THREE.MeshBasicMaterial({ color: 0x3cf0c8, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false })
  );
  inner.rotation.x = -Math.PI / 2;
  inner.renderOrder = 1000;

  // Kreuz
  const crossGeo = new THREE.BufferGeometry();
  const verts = new Float32Array([ -0.045,0,0,  0.045,0,0,   0,0,-0.045,  0,0,0.045 ]);
  crossGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  crossGeo.setIndex([0,1, 2,3]);
  const cross = new THREE.LineSegments(
    crossGeo,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false })
  );
  cross.rotation.x = -Math.PI / 2;
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
