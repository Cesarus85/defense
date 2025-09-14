// XR-Unterstützung prüfen
export async function setupXRSupport({ statusEl } = {}) {
  let supported = false;
  if ('xr' in navigator && typeof navigator.xr.isSessionSupported === 'function') {
    try { supported = await navigator.xr.isSessionSupported('immersive-ar'); }
    catch (err) { console.warn('navigator.xr.isSessionSupported failed:', err); }
  }
  if (statusEl) {
    statusEl.textContent += supported
      ? ' | AR-Unterstützung: verfügbar'
      : ' | AR-Unterstützung: nicht verfügbar';
  }
  return supported;
}

// Kompatible Hilfsfunktionen (neue/alte Polyfill-Versionen)
async function requestHitTestSourceCompat(session, opts) {
  try {
    return await session.requestHitTestSource(opts); // neuer Pfad (mit entityTypes/offsetRay erlaubt)
  } catch (e) {
    // Fallback: ohne entityTypes erneut versuchen
    const { entityTypes, ...rest } = opts || {};
    try {
      return await session.requestHitTestSource(rest);
    } catch (e2) {
      console.warn('requestHitTestSource (compat) fehlgeschlagen:', e2);
      return null;
    }
  }
}

async function requestTransientHitTestSourceCompat(session, opts) {
  try {
    return await session.requestHitTestSourceForTransientInput(opts);
  } catch (e) {
    try {
      return await session.requestHitTestSourceForTransientInput({});
    } catch (e2) {
      console.warn('requestHitTestSourceForTransientInput (compat) fehlgeschlagen:', e2);
      return null;
    }
  }
}

export async function startARSession(renderer) {
  if (!navigator.xr) throw new Error('WebXR nicht verfügbar');

  renderer.xr.setReferenceSpaceType('local-floor');

  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['local-floor', 'anchors']
  });

  await renderer.xr.setSession(session);

  const referenceSpace =
    await session.requestReferenceSpace('local-floor').catch(() => session.requestReferenceSpace('local'));
  const viewerSpace = await session.requestReferenceSpace('viewer');

  // Downward-Hit-Test (vom Headset nach unten)
  const baseOpts = { space: viewerSpace, entityTypes: ['plane', 'point'] };
  const downOpts = { ...baseOpts };
  if (typeof XRRay !== 'undefined') {
    downOpts.offsetRay = new XRRay({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }
  const viewerDownHitTestSource = await requestHitTestSourceCompat(session, downOpts);

  // Controller-Transient-Hit-Test
  const transientHitTestSource = await requestTransientHitTestSourceCompat(session, {
    entityTypes: ['plane', 'point']
  });

  session.addEventListener('end', () => {
    try { viewerDownHitTestSource?.cancel(); } catch {}
    try { transientHitTestSource?.cancel(); } catch {}
  });

  return { session, referenceSpace, viewerSpace, viewerDownHitTestSource, transientHitTestSource };
}
