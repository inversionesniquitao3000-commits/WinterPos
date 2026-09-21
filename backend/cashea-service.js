// WinterPos - Cashea Service (BNPL Integration)
// Calculates down payments (inicial), financed amounts, and installments schedule

export const CASHEA_LEVELS = {
  nivel1: { id: 'nivel1', name: 'Nivel 1 (Inicial 60%)', inicialPct: 60, cuotasQty: 3 },
  nivel2: { id: 'nivel2', name: 'Nivel 2 (Inicial 50%)', inicialPct: 50, cuotasQty: 3 },
  nivel3: { id: 'nivel3', name: 'Nivel 3, 4 y 5 (Inicial 40%)', inicialPct: 40, cuotasQty: 3 },
  promo_20: { id: 'promo_20', name: 'Promoción Especial (Inicial 20%)', inicialPct: 20, cuotasQty: 3 },
  sin_inicial: { id: 'sin_inicial', name: 'Sin Inicial (100% Cashea)', inicialPct: 0, cuotasQty: 3 },
  personalizado: { id: 'personalizado', name: 'Personalizado', inicialPct: 40, cuotasQty: 3 }
};

/**
 * Calculates complete Cashea financial breakdown
 * @param {number} totalUSD - Total sale in USD
 * @param {number} tasaBCV - Official exchange rate
 * @param {string} levelId - Key from CASHEA_LEVELS or 'personalizado'
 * @param {number|null} customPct - Custom down payment percentage if levelId is 'personalizado'
 */
export function calculateCasheaBreakdown(totalUSD, tasaBCV = 1.0, levelId = 'nivel3', customPct = null) {
  const safeTotalUSD = Math.max(0, parseFloat(totalUSD) || 0);
  const safeRate = Math.max(0.0001, parseFloat(tasaBCV) || 1.0);
  
  let inicialPct = 40;
  if (levelId === 'personalizado' && customPct !== null) {
    inicialPct = Math.min(100, Math.max(0, parseFloat(customPct) || 0));
  } else if (CASHEA_LEVELS[levelId]) {
    inicialPct = CASHEA_LEVELS[levelId].inicialPct;
  }

  const inicialUSD = Math.round((safeTotalUSD * (inicialPct / 100)) * 100) / 100;
  const financiadoUSD = Math.max(0, Math.round((safeTotalUSD - inicialUSD) * 100) / 100);

  const totalVES = Math.round((safeTotalUSD * safeRate) * 100) / 100;
  const inicialVES = Math.round((inicialUSD * safeRate) * 100) / 100;
  const financiadoVES = Math.round((financiadoUSD * safeRate) * 100) / 100;

  // Installment schedule (3 bi-weekly installments every 14 days)
  const cuotaBaseUSD = financiadoUSD > 0 ? Math.round((financiadoUSD / 3) * 100) / 100 : 0;
  const cuota3USD = financiadoUSD > 0 ? Math.round((financiadoUSD - (cuotaBaseUSD * 2)) * 100) / 100 : 0;

  const now = new Date();
  const getInstallmentDate = (days) => {
    const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  };

  const cuotas = [
    {
      numero: 1,
      fechaVencimiento: getInstallmentDate(14),
      montoUSD: cuotaBaseUSD,
      montoVES: Math.round((cuotaBaseUSD * safeRate) * 100) / 100
    },
    {
      numero: 2,
      fechaVencimiento: getInstallmentDate(28),
      montoUSD: cuotaBaseUSD,
      montoVES: Math.round((cuotaBaseUSD * safeRate) * 100) / 100
    },
    {
      numero: 3,
      fechaVencimiento: getInstallmentDate(42),
      montoUSD: cuota3USD,
      montoVES: Math.round((cuota3USD * safeRate) * 100) / 100
    }
  ];

  return {
    totalUSD: safeTotalUSD,
    totalVES,
    tasaBCV: safeRate,
    levelId,
    levelName: CASHEA_LEVELS[levelId]?.name || 'Cashea Estándar',
    inicialPct,
    montoInicialUSD: inicialUSD,
    montoInicialVES: inicialVES,
    montoFinanciadoUSD: financiadoUSD,
    montoFinanciadoVES: financiadoVES,
    cuotas
  };
}
