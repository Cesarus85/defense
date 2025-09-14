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

// AR-Session starten: required local-floor & zwei HitTest-Quellen
export async function startARSession(renderer) {
  if (!navigator.xr) throw new Error('WebXR nicht verfügbar');

  renderer.xr.setReferenceSpaceType('local-floor');

  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test', 'local-floor'],
    optionalFeatures: ['anchors'] // gern später für permanentes Verankern
  });

  await renderer.xr.setSession(session);

  const referenceSpace =
    await session.requestReferenceSpace('local-floor').catch(() => session.requestReferenceSpace('local'));
  const viewerSpace = await session.requestReferenceSpace('viewer');

  // 1) Downward Hit-Test (vom Headset gerade nach unten)
  let viewerDownHitTestSource = null;
  try {
    const hasXRRay = typeof XRRay !== 'undefined';
    const offsetRay = hasXRRay
      ? new XRRay({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
      : null; // Fallback: lässt den UA den Default bestimmen
    viewerDownHitTestSource = await session.requestHitTestSource(
      offsetRay ? { space: viewerSpace, offsetRay } : { space: viewerSpace }
    );
  } catch (e) {
    console.warn('Downward hit-test source fehlgeschlagen:', e);
  }

  // 2) Controller-Transient-HitTest (gezielter Ray vom Controller)
  let transientHitTestSource = null;
  try {
    // profile optional – viele UAs ignorieren/auto-matchen
    transientHitTestSource = await session.requestHitTestSourceForTransientInput({});
  } catch (e) {
    console.warn('Transient hit-test source fehlgeschlagen:', e);
  }

  session.addEventListener('end', () => {
    try { viewerDownHitTestSource?.cancel(); } catch {}
    try { transientHitTestSource?.cancel(); } catch {}
  });

  return { session, referenceSpace, viewerSpace, viewerDownHitTestSource, transientHitTestSource };
}
