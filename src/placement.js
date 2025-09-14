import * as THREE from 'three';

export function createPlacementController({
  scene,
  session,
  referenceSpace,
  viewerDownHitTestSource,
  transientHitTestSource
}) {
  const reticle = makeReticle();
  scene.add(reticle);

  let placed = false;
  let base = null;
  let yawAccum = 0; // Thumbstick-Drehung (Y-Achse)

  // Trigger/Select bestätigt
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

    // Rechter Thumbstick: Zusatz-Yaw
    for (const src of session.inputSources) {
      if (src?.handedness === 'right' && src.gamepad?.axes?.length >= 2) {
        const x = src.gamepad.axes[0] || 0;
        const dead = Math.abs(x) < 0.15 ? 0 : x;
        if (dead) yawAccum += dead * dt * 1.8;
      }
    }

    // --- 1) Versuch: Controller-gezielter HitTest (präzise) ---
    let pose = null;
    if (transientHitTestSource) {
      const trResults = frame.getHitTestResultsForTransientInput(transientHitTestSource);
      // Bevorzuge rechten Controller, sonst nimm den ersten
      let best = null;
      for (const tr of trResults) {
        if (!best) best = tr;
        if (tr.inputSource?.handedness === 'right') { best = tr; break; }
      }
      if (best?.results?.length) {
        pose = best.results[0].getPose(referenceSpace) || null;
      }
    }

    // --- 2) Fallback: Downward-HitTest (immer auf Boden unter dir) ---
    if (!pose && viewerDownHitTestSource) {
      const results = frame.getHitTestResults(viewerDownHitTestSource);
      if (results?.length) {
        pose = results[0].getPose(referenceSpace) || null;
      }
    }

    if (pose) {
      // Pose -> Reticle transform
      const mat = new THREE.Matrix4().fromArray(pose.transform.matrix);
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      mat.decompose(pos, rot, scl);

      reticle.position.copy(pos);
      reticle.quaternion.copy(rot);

      // Zusätzliches Yaw um Welt-Y (Feinrotation)
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAccum);
      reticle.quaternion.multiply(yawQ);

      reticle.visible = true;
    } else {
      reticle.visible = false;
    }
  }

  function isPlaced() { return placed; }
  function getObject() { return base; }

  return { update, isPlaced, getObject };
}

// --- Helpers ---
function makeReticle() {
  // Flacher Ring + Kreuz, ausgerichtet auf Boden
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.16, 40, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff99, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );

  // kleines Kreuz in der Mitte
  const crossGeo = new THREE.BufferGeometry();
  const verts = new Float32Array([ -0.04,0,0,  0.04,0,0,   0,0,-0.04,  0,0,0.04 ]);
  crossGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  crossGeo.setIndex([0,1, 2,3]);
  const cross = new THREE.LineSegments(
    crossGeo,
    new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 })
  );
  cross.rotation.x = -Math.PI / 2;

  const group = new THREE.Group();
  group.add(ring);
  group.add(cross);
  group.visible = false;
  return group;
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
