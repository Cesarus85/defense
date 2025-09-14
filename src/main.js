import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { CONFIG } from './config.js';
import { createInput } from './input.js';
import { Turret } from './turret.js';

let scene, camera, renderer;
let input, turret;
let needPlaceFromHMD = false;

// Delta-Grip Baselines (werden gesetzt, wenn Input stable wird)
let baseYaw = 0, basePitch = 0;
let baseTurretYaw = 0, baseTurretPitch = 0;
let hadRef = false;

init();
startLoop();

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.xr.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  document.body.appendChild(
    VRButton.createButton(renderer, { optionalFeatures: ['local-floor'] })
  );

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 2000);
  camera.position.set(0, 1.6, 2);
  scene.add(camera);

  // Himmel
  scene.fog = new THREE.FogExp2(0x0b0f14, 0.0008);
  const skyGeo = new THREE.SphereGeometry(1200, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:    { value: new THREE.Color(CONFIG.sky.topColor) },
      bottomColor: { value: new THREE.Color(CONFIG.sky.bottomColor) }
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPos;
                    void main(){ float h=normalize(vPos).y*0.5+0.5; gl_FragColor=vec4(mix(bottomColor,topColor,h),1.0); }`
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Licht
  scene.add(new THREE.HemisphereLight(CONFIG.lights.hemi.sky, CONFIG.lights.hemi.ground, CONFIG.lights.hemi.intensity));
  const dir = new THREE.DirectionalLight(CONFIG.lights.dir.color, CONFIG.lights.dir.intensity);
  dir.position.set(...CONFIG.lights.dir.position);
  scene.add(dir);

  // Boden + Grid
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.groundSize, CONFIG.groundSize),
    new THREE.MeshStandardMaterial({ color: 0x202a36, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(CONFIG.groundSize, 80, 0x2e3b4b, 0x1b2430);
  grid.position.y = 0.01;
  scene.add(grid);

  // Turret
  turret = new Turret();
  turret.addTo(scene);

  // Input
  input = createInput(renderer, scene, camera, {
    handles: { left: turret.leftHandle, right: turret.rightHandle }
  });

  renderer.xr.addEventListener('sessionstart', () => { needPlaceFromHMD = true; resetRef(); });

  // Desktop-Start: Turret vor der Kamera auf Boden platzieren
  placeTurretFromCamera(camera);

  window.addEventListener('resize', onWindowResize);
}

function resetRef() {
  hadRef = false;
  baseYaw = 0; basePitch = 0;  // Explizit resetten
}

function getCurrentCamera() {
  return renderer.xr.isPresenting ? renderer.xr.getCamera(camera) : camera;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function startLoop() {
  let last = performance.now();
  renderer.setAnimationLoop((time) => {
    const now = (typeof time === 'number') ? time : performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (needPlaceFromHMD) {
      placeTurretFromCamera(getCurrentCamera());
      needPlaceFromHMD = false;
      resetRef();
    }

    input.update?.(dt);

    // Delta-Grip lesen
    const delta = input.getDeltaYawPitch();
    if (delta.ok) {
      if (!hadRef) {
        // Baseline auf aktuellen Zustand einfrieren
        baseYaw = 0; basePitch = 0;        // Referenz im Delta-Raum
        baseTurretYaw   = turret.yawPivot.rotation.y;
        baseTurretPitch = turret.pitchPivot.rotation.x;
        hadRef = true;
      }
      let dy = delta.dy * CONFIG.turret.sensitivityYaw;
      let dp = delta.dp * CONFIG.turret.sensitivityPitch;

      // Optional invertieren
      if (CONFIG.turret.invertYaw)   dy = -dy;
      if (CONFIG.turret.invertPitch) dp = -dp;

      // Zielwinkel: Baseline des Turrets + Delta (kleinster Winkel)
      const targetYaw   = shortestAngle(baseTurretYaw + (baseYaw + dy));
      const targetPitch = baseTurretPitch + (basePitch + dp);

      turret.setTargetAngles(targetYaw, targetPitch);
    } else if (!renderer.xr.isPresenting) {
      // Desktop: Maus steuert weiter
      const dir = input.getDesktopDir();
      turret.setAimDirection(dir);
    }

    turret.update(dt, camera);
    renderer.render(scene, camera);
  });
}

/**
 * Positioniert & richtet das Turret relativ zur aktuellen Kamerapose aus:
 * - y = 0 (Boden)
 * - in XZ |offsetZFromPlayer| vor dem Spieler
 * - Yaw an Blickrichtung
 * - Safety: ggf. 180° Flip falls Rohr zum Spieler zeigen würde
 */
function placeTurretFromCamera(cam) {
  const headPos = new THREE.Vector3(); cam.getWorldPosition(headPos);
  const headQuat = cam.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
  const fwdXZ = new THREE.Vector3(fwd.x, 0, fwd.z); if (fwdXZ.lengthSq() < 1e-6) fwdXZ.set(0,0,-1); fwdXZ.normalize();

  const dist = Math.abs(CONFIG.turret.offsetZFromPlayer);
  const basePos = new THREE.Vector3(headPos.x, 0, headPos.z).add(fwdXZ.clone().multiplyScalar(dist));
  turret.root.position.copy(basePos);

  let yaw = Math.atan2(fwdXZ.x, -fwdXZ.z);
  turret.root.rotation.set(0, yaw, 0);

  const forwardAfterYaw = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0, 'XYZ'));
  if (forwardAfterYaw.dot(fwdXZ) < 0) {
    yaw += Math.PI;
    turret.root.rotation.set(0, yaw, 0);
  }

  turret.yawPivot.rotation.y = 0;
  turret.pitchPivot.rotation.x = 0;
}

// Kleinster Winkeldelta (für Wrap um ±π)
function shortestAngle(a) {
  let ang = ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (ang < -Math.PI) ang += Math.PI * 2;
  return ang;
}
