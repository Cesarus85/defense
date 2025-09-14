// Step 0: nur Feature-Check & freundliche Statusausgabe.
// Noch KEINE Session-Erstellung oder Buttons.

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
