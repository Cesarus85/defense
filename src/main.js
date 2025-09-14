// /src/main.js
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { CONFIG } from './config.js';
import { createInput } from './input.js';
import { Turret } from './turret.js';

let scene, camera, renderer;
let input, turret;
let needPlaceFromHMD = false; // beim Sessionstart einmal korrekt platzieren

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
  camera.position.set(0, 1.6, 2); // Desktop-Start (in VR vom HMD überschrieben)
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

  // Turret-Objekt
  turret = new Turret();
  scene.add(turret.root); // Positionierung erfolgt dynamisch (siehe placeTurretFromHMD)

  // Input
  input = createInput(renderer, scene, camera, {
    handles: { left: turret.leftHandle, right: turret.rightHandle }
  });

  // Beim Start einer VR-Session korrekt relativ zum HMD platzieren
  renderer.xr.addEventListener('sessionstart', () => { needPlaceFromHMD = true; });
  window.addEventListener('resize', onWindowResize);

  // Desktop-Vorschau: Turret 0.4 m vor der Kamera
  placeTurretFromCamera(camera);
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

    // Nach Sessionstart, wenn HMD-Pose valid ist, einmal korrekt platzieren
    if (needPlaceFromHMD) {
      placeTurretFromCamera(renderer.xr.getCamera?.(camera) || camera);
      needPlaceFromHMD = false;
    }

    input.update?.(dt);

    const aimDir = input.getAimDirection();
    if (aimDir) turret.setAimDirection(aimDir);

    turret.update(dt, camera);
    renderer.render(scene, camera);
  });
}

/** Positioniert & richtet das Turret relativ zur aktuellen Kamerapose aus. */
function placeTurretFromCamera(cam) {
  const headPos = new THREE.Vector3();
  cam.getWorldPosition(headPos);

  const headQuat = cam.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(headQuat).normalize();

  // 0.40 m vor dem Kopf in Blickrichtung
  turret.root.position.copy(headPos).add(fwd.clone().multiplyScalar(Math.abs(CONFIG.turret.offsetZFromPlayer)));

  // Nur Yaw ausrichten (kein Pitch/Roll)
  const yaw = Math.atan2(fwd.x, -fwd.z);
  turret.root.rotation.set(0, yaw, 0);

  // Startwinkel neutral
  turret.yawPivot.rotation.y = 0;
  turret.pitchPivot.rotation.x = 0;
}
