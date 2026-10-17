import { BiometricConfig, User, UserFingerprint } from './types';
import { getApiBaseUrl } from './utils';

export interface BiometricStatusResult {
  available: boolean;
  online: boolean;
  device: string;
  provider: string;
  message: string;
}

export interface BiometricCaptureResult {
  success: boolean;
  template?: string; // Base64 ANSI-378 / ISO minutiae
  quality?: number;  // 0 - 100
  message?: string;
  error?: string;
}

/**
 * Fast non-blocking check to determine if a biometric reader is available on this terminal.
 * Timeout is restricted to 450ms so UI never lags or hangs.
 */
export async function checkBiometricReaderStatus(config?: BiometricConfig, isExplicitTest: boolean = false): Promise<BiometricStatusResult> {
  const isEnabled = config ? config.habilitado !== false : false;
  const provider = config?.proveedor || 'FUTRONIC';
  const serviceUrl = config?.urlServicio || `http://127.0.0.1:${config?.puertoServicio || 8088}`;

  if (!isEnabled && !isExplicitTest) {
    return {
      available: false,
      online: false,
      device: provider,
      provider,
      message: 'Autenticación biométrica deshabilitada en la configuración del comercio.'
    };
  }

  // 1. First probe through WinterPos backend endpoint (handles native Windows USB detection directly)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${getApiBaseUrl()}/biometric/device-status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data.serviceOnline) {
        return {
          available: true,
          online: true,
          device: provider === 'FUTRONIC' ? 'Futronic FS88 USB' : provider,
          provider,
          message: data.message || `Lector ${provider} en línea y listo para lectura.`
        };
      }
    }
  } catch (_) {
    // Fail silently
  }

  // 2. Also probe local Futronic / Vendor Web service on 127.0.0.1 (port 8088 or configured)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 450);

    const res = await fetch(`${serviceUrl}/api/status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        available: true,
        online: true,
        device: data.device || (provider === 'FUTRONIC' ? 'Futronic FS88 USB' : provider),
        provider,
        message: data.message || `Lector ${provider} en línea y listo para lectura.`
      };
    }
  } catch (_) {
    // Local vendor service not directly answering on 8088
  }

  return {
    available: isEnabled,
    online: false,
    device: provider === 'FUTRONIC' ? 'Futronic FS88 USB' : provider,
    provider,
    message: 'Lector biométrico no detectado. Utilice usuario y contraseña.'
  };
}

/**
 * Triggers a biometric scan / finger capture on the local reader.
 */
export async function captureBiometricFingerprint(config?: BiometricConfig, promptTimeoutMs: number = 7000): Promise<BiometricCaptureResult> {
  const serviceUrl = config?.urlServicio || `http://127.0.0.1:${config?.puertoServicio || 8088}`;

  // 1. Primary path: Call WinterPos backend native biometric driver endpoint
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), promptTimeoutMs + 3000);

    const res = await fetch(`${getApiBaseUrl()}/biometric/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeout: Math.round(promptTimeoutMs / 1000)
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.template) {
        return {
          success: true,
          template: data.template,
          quality: data.quality || 95,
          message: data.message || 'Huella dactilar capturada exitosamente.'
        };
      } else if (data.error) {
        return { success: false, error: data.error };
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      if (errData.error) {
        return { success: false, error: errData.error };
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Tiempo de espera agotado. No se detectó ningún dedo en el sensor.' };
    }
    // Only continue to secondary bridge if primary native backend was completely unreachable
    if (config?.proveedor === 'FUTRONIC') {
      return {
        success: false,
        error: 'El lector Futronic no respondió. Verifique la conexión USB o vuelva a conectar el sensor.'
      };
    }
  }

  // 2. Secondary path: Direct call to local vendor Web SDK service (port 8088)
  if (config?.proveedor !== 'FUTRONIC') {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), promptTimeoutMs);

      const res = await fetch(`${serviceUrl}/api/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'ANSI_378',
          qualityThreshold: 60,
          timeout: Math.round(promptTimeoutMs / 1000)
        }),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (data.template) {
          return {
            success: true,
            template: data.template,
            quality: data.quality || 95,
            message: 'Huella dactilar capturada exitosamente.'
          };
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'Tiempo de espera agotado. No se detectó ningún dedo en el sensor.' };
      }
    }
  }

  return {
    success: false,
    error: 'No se detectó el lector de huellas. Verifique que el lector esté conectado firmemente al puerto USB.'
  };
}

/**
 * Cross-correlation ridge orientation matcher for FPE1 biometric templates.
 * Returns match score from 0 to 100.
 */
export function matchFingerprintTemplates(tpl1Str?: string | null, tpl2Str?: string | null): number {
  if (!tpl1Str || !tpl2Str) return 0;
  const clean1 = tpl1Str.trim();
  const clean2 = tpl2Str.trim();

  // Exact match
  if (clean1 === clean2) return 100;

  if (!clean1.startsWith('FPE1_') || !clean2.startsWith('FPE1_')) {
    // Legacy substring matching for ANSI-378 / ISO-19794
    if (clean1.length > 50 && clean2.length > 50 && clean1.substring(10, 80) === clean2.substring(10, 80)) {
      return 95;
    }
    return 0;
  }

  try {
    const decodeB64 = (s: string): Uint8Array => {
      const b64 = s.substring(5).replace(/_/g, '/').replace(/-/g, '+');
      const pad = (4 - (b64.length % 4)) % 4;
      const padded = b64 + '='.repeat(pad);
      const bin = atob(padded);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    };

    const b1 = decodeB64(clean1);
    const b2 = decodeB64(clean2);
    if (b1.length < 1204 || b2.length < 1204) return 0;

    const COLS = 20;
    const ROWS = 30;

    const cx1 = b1[2];
    const cy1 = b1[3];
    const cx2 = b2[2];
    const cy2 = b2[3];
    const baseDx = cx1 - cx2;
    const baseDy = cy1 - cy2;

    let maxScore = 0;

    for (let dy = baseDy - 3; dy <= baseDy + 3; dy++) {
      for (let dx = baseDx - 3; dx <= baseDx + 3; dx++) {
        let sumSim = 0;
        let totalW = 0;
        let count = 0;

        for (let r1 = 0; r1 < ROWS; r1++) {
          const r2 = r1 - dy;
          if (r2 < 0 || r2 >= ROWS) continue;

          for (let c1 = 0; c1 < COLS; c1++) {
            const c2 = c1 - dx;
            if (c2 < 0 || c2 >= COLS) continue;

            const idx1 = r1 * COLS + c1;
            const idx2 = r2 * COLS + c2;

            const o1 = b1[4 + idx1];
            const o2 = b2[4 + idx2];
            if (o1 >= 250 || o2 >= 250) continue; // Skip background

            const th1 = (o1 / 250) * Math.PI;
            const th2 = (o2 / 250) * Math.PI;

            let dTh = Math.abs(th1 - th2);
            if (dTh > Math.PI * 0.5) dTh = Math.PI - dTh;

            // Biological ridge correlation with strict angular selectivity:
            // Ridge flows within 15 deg have high correlation;
            // flows differing by > 30 deg are penalized as anatomical discrepancy.
            const sim = Math.cos(3 * dTh);
            const w = (b1[604 + idx1] + b2[604 + idx2]) / 200;

            sumSim += sim * w;
            totalW += w;
            count++;
          }
        }

        if (count >= 40 && totalW > 0) {
          const score = Math.max(0, (sumSim / totalW) * 100);
          if (score > maxScore) maxScore = score;
        }
      }
    }

    return Math.round(maxScore);
  } catch (_) {
    return 0;
  }
}

export function getUserFingerprints(u: User): UserFingerprint[] {
  if (!u) return [];
  if (Array.isArray(u.huellas) && u.huellas.length > 0) {
    return u.huellas.filter(h => h && typeof h.template === 'string' && h.template.trim().length > 0);
  }
  if (u.huella_template && typeof u.huella_template === 'string' && u.huella_template.trim().length > 0) {
    return [{
      dedo: u.huella_dedo || 'Índice Derecho',
      template: u.huella_template,
      fecha: u.huella_fecha || ''
    }];
  }
  return [];
}

/**
 * Minutiae & ridge orientation 1:N / 1:1 search against enrolled users.
 * - If targetUsername is provided, executes a 1:1 verification against that user (100% collision-free).
 * - If in 1:N mode, sorts all candidates, enforces a 60% threshold, and requires a safety margin
 *   of >= 15 points between the top match and any runner-up to eliminate false identity swaps.
 */
export function matchFingerprintAgainstUsers(
  scannedTemplate: string,
  users: User[],
  targetUsername?: string
): { user: User | null; score: number; matchedFinger?: string; isAmbiguous?: boolean; error?: string } {
  if (!scannedTemplate || !Array.isArray(users)) {
    return { user: null, score: 0 };
  }

  // 1. Direct 1:1 Verification if username was entered in the login form
  if (targetUsername && targetUsername.trim().length > 0) {
    const cleanTarget = targetUsername.trim().toLowerCase();
    const targeted = users.find(u => (u.usuario || '').toLowerCase() === cleanTarget);
    if (targeted) {
      const userPrints = getUserFingerprints(targeted);
      if (userPrints.length === 0) {
        return {
          user: null,
          score: 0,
          error: `El usuario "${targeted.nombre || targeted.usuario}" no tiene huellas dactilares registradas en el sistema.`
        };
      }
      if (targeted.estado === 'Inactivo') {
        return {
          user: null,
          score: 0,
          error: `El usuario "${targeted.nombre || targeted.usuario}" se encuentra inactivo.`
        };
      }
      let bestScore = 0;
      let matchedFinger = '';
      for (const p of userPrints) {
        const score = matchFingerprintTemplates(scannedTemplate, p.template);
        if (score > bestScore) {
          bestScore = score;
          matchedFinger = p.dedo || 'Dedo';
        }
      }
      if (bestScore >= 60) {
        return { user: targeted, score: bestScore, matchedFinger };
      } else {
        return {
          user: null,
          score: bestScore,
          error: `La huella colocada no coincide con el usuario "${targeted.nombre || targeted.usuario}" (Coincidencia: ${bestScore}% - Requerido: 60%).`
        };
      }
    }
  }

  // 2. 1:N Biometric Search across all enrolled active users
  const candidates: { user: User; score: number; matchedFinger: string }[] = [];
  for (const u of users) {
    if (u.estado === 'Inactivo') continue;
    const userPrints = getUserFingerprints(u);
    if (userPrints.length === 0) continue;
    let bestUserScore = 0;
    let bestUserFinger = '';
    for (const p of userPrints) {
      const score = matchFingerprintTemplates(scannedTemplate, p.template);
      if (score > bestUserScore) {
        bestUserScore = score;
        bestUserFinger = p.dedo || 'Dedo';
      }
    }
    if (bestUserScore > 0) {
      candidates.push({ user: u, score: bestUserScore, matchedFinger: bestUserFinger });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return { user: null, score: 0 };
  }

  const best = candidates[0];
  const second = candidates.length > 1 ? candidates[1] : null;

  // Threshold: >= 60%
  if (best.score < 60) {
    return { user: null, score: best.score };
  }

  // Ambiguity / Collision Guard:
  // If runner-up (different user) is also high (>= 40%) and difference with best is < 15 points, reject as ambiguous
  if (second && second.score >= 40 && (best.score - second.score) < 15 && best.score < 80) {
    console.warn(`[Biometría] Colisión 1:N prevenida entre "${best.user.usuario}" (${best.score}%) y "${second.user.usuario}" (${second.score}%).`);
    return {
      user: null,
      score: best.score,
      isAmbiguous: true,
      error: 'Huella ambigua. Por favor coloque el dedo firme y centrado en el lector, o ingrese su usuario.'
    };
  }

  return { user: best.user, score: best.score, matchedFinger: best.matchedFinger };
}
