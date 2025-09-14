// /src/xr-setup.js

// XR-Unterstützung prüfen (Step 0 Logik)
export async function setupXRSupport({ statusEl } = {}) {
  let supported = false;

  if ('xr' in navigator && typeof navigator.xr.isSessionSupported === 'function') {
    try {
      supported = await navigator.xr.isSessionSupported('immersive-ar');
    } catch (err) {
      console.warn('navigator.xr.isSessionSupported failed:', err);
    }
  }

  if (statusEl) {
    statusEl.textContent += supported
      ? ' | AR-Unterstützung: verfügbar'
      : ' | AR-Unterstützung: nicht verfügbar';
  }
  return supported;
}

// AR-Session starten: Hit-Tests mit entityTypes (fix für WebXR-Polyfill/Emulator)
export async function startARSession(renderer) {
  if (!navigator.xr) throw new Error('WebXR nicht verfügbar');

  renderer.xr.setReferenceSpaceType('local-floor');

  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],           // 'local-floor' kann Emulatoren stören → optional unten als refSpace
    optionalFeatures: ['local-floor', 'anchors']
  });

  await renderer.xr.setSession(session);

  // Referenzräume
  const referenceSpace =
    await session.requestReferenceSpace('local-floor').catch(() => session.requestReferenceSpace('local'));
  const viewerSpace = await session.requestReferenceSpace('viewer');

  // Gemeinsame Optionen mit entityTypes => verhindert "includes of undefined"
  const baseHitOpts = { space: viewerSpace, entityTypes: ['plane', 'point'] };

  // 1) Downward Hit-Test (vom Headset nach unten)
  let viewerDownHitTestSource = null;
  try {
    // abwärts gerichteter Ray, falls XRRay verfügbar ist
    const hitOpts = { ...baseHitOpts };
    if (typeof XRRay !== 'undefined') {
      hitOpts.offsetRay = new XRRay({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    }
    viewerDownHitTestSource = await session.requestHitTestSource(hitOpts);
  } catch (e) {
    console.warn('Downward hit-test source fehlgeschlagen:', e);
  }

  // 2) Controller-Transient-HitTest (gezielter Ray vom Controller)
  let transientHitTestSource = null;
  try {
    // Profile sind optional; entityTypes zwingend gegen Polyfill-Bug
    transientHitTestSource = await session.requestHitTestSourceForTransientInput({
      entityTypes: ['plane', 'point']
      // profile: 'generic-trigger'  // optional; viele Polyfills ignorieren das
    });
  } catch (e) {
    console.warn('Transient hit-test source fehlgeschlagen:', e);
  }

  // Cleanup
  session.addEventListener('end', () => {
    try { viewerDownHitTestSource?.cancel(); } catch {}
    try { transientHitTestSource?.cancel(); } catch {}
  });

  return { session, referenceSpace, viewerSpace, viewerDownHitTestSource, transientHitTestSource };
}
