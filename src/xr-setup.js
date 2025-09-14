// XR-Unterstützung prüfen (Step 0 logik beibehalten)
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

// NEW: AR-Session starten und Hit-Test-Quelle anlegen
export async function startARSession(renderer) {
  if (!navigator.xr) throw new Error('WebXR nicht verfügbar');

  // Kamerareferenztyp für Three (fällt zurück, wenn nicht vorhanden)
  renderer.xr.setReferenceSpaceType('local-floor');

  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['local-floor', 'anchors'] // optional, blockiert nicht wenn unsupported
  });

  // Three.js übernimmt XRWebGLLayer & RenderState
  await renderer.xr.setSession(session);

  // Referenzräume
  const referenceSpace =
    await session.requestReferenceSpace('local-floor').catch(() => session.requestReferenceSpace('local'));

  const viewerSpace = await session.requestReferenceSpace('viewer');
  const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

  // Cleanup, falls Session endet
  session.addEventListener('end', () => {
    try { hitTestSource.cancel(); } catch {}
  });

  return { session, referenceSpace, viewerSpace, hitTestSource };
}
