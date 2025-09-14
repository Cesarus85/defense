import * as THREE from 'three';

export function createPlacementController({ scene, session, referenceSpace, hitTestSource }) {
  const reticle = makeReticle();
  scene.add(reticle);

  let placed = false;
  let base = null;
  let yawAccum = 0; // zusätzliche Drehung um Y (via rechter Stick)

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

    // Stick: rechte Hand => horizontale Achse dreht Reticle
    for (const src of session.inputSources) {
      if (src && src.handedness === 'right' && src.gamepad && src.gamepad.axes && src.gamepad.axes.length >= 2) {
        const x = src.gamepad.axes[0] || 0; // horizontale Achse
        const dead = Math.abs(x) < 0.15 ? 0 : x;
        if (dead) yawAccum += dead * dt * 1.8; // Drehrate
      }
    }

    // Hit-Test
    const results = frame.getHitTestResults(hitTestSource);
    if (results && results.length) {
      const pose = results[0].getPose(referenceSpace);
      if (pose) {
        // Pose-Matrix -> Position/Rotation
        const mat = new THREE.Matrix4().fromArray(pose.transform.matrix);
        const pos = new THREE.Vector3();
        const rot = new THREE.Quaternion();
        const scl = new THREE.Vector3();
        mat.decompose(pos, rot, scl);

        reticle.position.copy(pos);
        reticle.quaternion.copy(rot);

        // zusätzliche Yaw-Drehung um Welt-Y
        const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), yawAccum);
        reticle.quaternion.multiply(yawQ);

        reticle.visible = true;
      } else {
        reticle.visible = false;
      }
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
  // Ring, der flach auf dem Boden liegt
  const geo = new THREE.RingGeometry(0.12, 0.16, 40, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ff99,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);

  // kleines Kreuz in der Mitte
  const crossGeo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    -0.04, 0, 0,   0.04, 0, 0,
     0, 0, -0.04,  0, 0, 0.04
  ]);
  const idx = [0,1, 2,3];
  crossGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  crossGeo.setIndex(idx);
  const crossMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 });
  const cross = new THREE.LineSegments(crossGeo, crossMat);
  cross.rotation.x = -Math.PI/2;

  const group = new THREE.Group();
  group.add(mesh);
  group.add(cross);
  group.visible = false;
  return group;
}

function makeTurretBase() {
  // Platzhalter-Basis – in STEP 2 durch echtes Turret ersetzt
  const g = new THREE.CylinderGeometry(0.20, 0.22, 0.08, 24);
  const m = new THREE.MeshStandardMaterial({ color: 0x384250, roughness: 0.7, metalness: 0.1 });
  const base = new THREE.Mesh(g, m);
  base.castShadow = false;
  base.receiveShadow = true;

  // dezenter Sicherheitsring (visual)
  const ring = new THREE.TorusGeometry(1.2, 0.005, 8, 48);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x4ee0aa, transparent: true, opacity: 0.25 });
  const ringMesh = new THREE.Mesh(ring, ringMat);
  ringMesh.rotation.x = -Math.PI/2;
  base.add(ringMesh);

  return base;
}
