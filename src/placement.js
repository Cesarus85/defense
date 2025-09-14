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
  let yawAccum = 0; // Zusatzrotation um Y per rechtem Stick

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

    // --- 1) Versuch: Transient/Controller Hit-Test (echte plane)
    let pose = null;
    if (transientHitTestSource) {
      const trResults = frame.getHitTestResultsForTransientInput(transientHitTestSource);
      let best = null;
      for (const tr of trResults) {
        if (!best) best = tr;
        if (tr.inputSource?.handedness === 'right') { best = tr; break; }
      }
      if (best?.results?.length) {
        pose = best.results[0].getPose(referenceSpace) || null;
      }
    }

    // --- 2) Mathemischer Fallback: rechter Controller-Ray -> Ebene y=0
    if (!pose) {
      const rightSrc = [...session.inputSources].find(s => s.handedness === 'right' && s.targetRaySpace);
      if (rightSrc) {
        const rightPose = frame.getPose(rightSrc.targetRaySpace, referenceSpace);
        if (rightPose) {
          // Ray: Ursprung & Richtung aus Controller
          const o = new THREE.Vector3(
            rightPose.transform.position.x,
            rightPose.transform.position.y,
            rightPose.transform.position.z
          );
          const q = new THREE.Quaternion(
            rightPose.transform.orientation.x,
            rightPose.transform.orientation.y,
            rightPose.transform.orientation.z,
            rightPose.transform.orientation.w
          );
          const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();

          const hit = intersectRayWithY0(o, dir); // null oder {x,y,z}
          if (hit) {
            pose = {
              transform: {
                matrix: new XRRigidTransform(
                  { x: hit.x, y: hit.y, z: hit.z },
                  { x: 0, y: 0, z: 0, w: 1 } // flach, normal nach oben
                ).matrix
              },
              // Dummy-Wrap damit der Code weiter unten funktioniert
              get transformMatrix() { return this.transform.matrix; }
            };
          }
        }
      }
    }

    // --- 3) Fallback: Downward Headset → Ebene y=0 (oder echter Treffer, wenn vorhanden)
    if (!pose) {
      // a) echter Downward-HitTest (falls UA liefert)
      if (viewerDownHitTestSource) {
        const results = frame.getHitTestResults(viewerDownHitTestSource);
        if (results?.length) {
          const p = results[0].getPose(referenceSpace);
          if (p) pose = p;
        }
      }
      // b) mathematisch straight down auf y=0
      if (!pose) {
        const o = new THREE.Vector3(
          viewerPose.transform.position.x,
          viewerPose.transform.position.y,
          viewerPose.transform.position.z
        );
        const dir = new THREE.Vector3(0, -1, 0);
        const hit = intersectRayWithY0(o, dir);
        if (hit) {
          pose = {
            transform: {
              matrix: new XRRigidTransform(
                { x: hit.x, y: hit.y, z: hit.z },
                { x: 0, y: 0, z: 0, w: 1 }
              ).matrix
            }
          };
        }
      }
    }

    if (pose) {
      // Pose -> Reticle
      const mat = new THREE.Matrix4().fromArray(pose.transform.matrix);
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      mat.decompose(pos, rot, scl);

      // Sicherheits-Minimalabstand (verhindert „im Auge kleben“ / Monokular-Effekt)
      const head = new THREE.Vector3(
        viewerPose.transform.position.x,
        viewerPose.transform.position.y,
        viewerPose.transform.position.z
      );
      const minDist = 0.4; // Meter
      const v = new THREE.Vector3().subVectors(pos, head);
      if (v.length() < minDist) {
        // schiebe das Reticle auf der Bodenebene in Blickrichtung etwas nach vorn
        const forward = getViewerForward(viewerPose);
        forward.y = 0; forward.normalize();
        pos.copy(head).addScaledVector(forward, minDist);
        pos.y = 0; // am Boden halten
      }

      // Orientierung immer flach auf Boden + Yaw vom Stick
      const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2);
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), yawAccum);
      const finalQ = new THREE.Quaternion().multiplyQuaternions(yawQ, flat);

      reticle.position.copy(pos);
      reticle.quaternion.copy(finalQ);
      reticle.visible = true;
    } else {
      reticle.visible = false;
    }
  }

  function isPlaced() { return placed; }
  function getObject() { return base; }

  return { update, isPlaced, getObject };
}

/* ---------- Helpers ---------- */

function makeReticle() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.16, 40, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff99, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );

  const crossGeo = new THREE.BufferGeometry();
  const verts = new Float32Array([ -0.04,0,0,  0.04,0,0,   0,0,-0.04,  0,0,0.04 ]);
  crossGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  crossGeo.setIndex([0,1, 2,3]);
  const cross = new THREE.LineSegments(
    crossGeo,
    new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 })
  );
  cross.rotation.x = -Math.PI / 2;

  const g = new THREE.Group();
  g.add(ring);
  g.add(cross);
  g.visible = false;
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

// Schnittpunkt eines Rays mit der Bodenebene y=0
function intersectRayWithY0(origin, dir) {
  const oy = origin.y, dy = dir.y;
  if (Math.abs(dy) < 1e-3) return null; // parallel zur Ebene
  const t = -oy / dy;
  if (t <= 0) return null; // hinter dem Ursprung
  const hit = {
    x: origin.x + dir.x * t,
    y: 0,
    z: origin.z + dir.z * t
  };
  return hit;
}

// Vorwärtsvektor des Viewers
function getViewerForward(viewerPose) {
  const q = new THREE.Quaternion(
    viewerPose.transform.orientation.x,
    viewerPose.transform.orientation.y,
    viewerPose.transform.orientation.z,
    viewerPose.transform.orientation.w
  );
  return new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
}
