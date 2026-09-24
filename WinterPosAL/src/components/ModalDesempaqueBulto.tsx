import React, { useState, useEffect, useMemo } from 'react';
import { 
  PackageCheck, 
  Boxes, 
  ArrowRight, 
  RefreshCw, 
  X, 
  Check, 
  AlertTriangle, 
  DollarSign, 
  Layers,
  Sparkles
} from 'lucide-react';
import { Product } from '../types';

interface ModalDesempaqueBultoProps {
  isOpen: boolean;
  onClose: () => void;
  detalProduct: Product | null;
  allProducts: Product[];
  tasaDia: number;
  currentUser?: any;
  onSuccessUnpack?: () => void;
  showAlert: (msg: string, title?: string, type?: 'info' | 'warning' | 'error' | 'success') => void;
}

export default function ModalDesempaqueBulto({
  isOpen,
  onClose,
  detalProduct,
  allProducts,
  tasaDia,
  currentUser,
  onSuccessUnpack,
  showAlert
}: ModalDesempaqueBultoProps) {
  const [selectedBultoId, setSelectedBultoId] = useState<string>('');
  const [conversionFactor, setConversionFactor] = useState<string>('24');
  const [bultosToUnpack, setBultosToUnpack] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [savingLink, setSavingLink] = useState<boolean>(false);
  const [searchBultoQuery, setSearchBultoQuery] = useState<string>('');

  useEffect(() => {
    if (isOpen && detalProduct) {
      setSelectedBultoId(detalProduct.producto_bulto_padre_id ? String(detalProduct.producto_bulto_padre_id) : '');
      setConversionFactor(detalProduct.factor_conversion_bulto ? String(detalProduct.factor_conversion_bulto) : '24');
      setBultosToUnpack(1);
    }
  }, [isOpen, detalProduct]);

  const candidateBultoProducts = useMemo(() => {
    if (!detalProduct) return [];
    return allProducts.filter(p => {
      if (p.id === detalProduct.id) return false;
      if (p.es_combo) return false;
      const matchSearch = 
        p.description.toLowerCase().includes(searchBultoQuery.toLowerCase()) ||
        p.barcode.toLowerCase().includes(searchBultoQuery.toLowerCase());
      return matchSearch;
    });
  }, [allProducts, detalProduct, searchBultoQuery]);

  const activeBultoProduct = useMemo(() => {
    if (!selectedBultoId) return null;
    return allProducts.find(p => p.id === Number(selectedBultoId)) || null;
  }, [allProducts, selectedBultoId]);

  const factorNum = Math.max(1, parseFloat(conversionFactor) || 24);
  const bultoCost = activeBultoProduct ? activeBultoProduct.precio_costo_usd : 0;
  const unitCostNewProrated = factorNum > 0 ? (bultoCost / factorNum) : 0;

  const handleSaveLink = async () => {
    if (!detalProduct) return;
    if (!selectedBultoId) {
      showAlert('Debes seleccionar el producto Bulto Padre.', 'Selección Requerida', 'warning');
      return;
    }
    setSavingLink(true);
    try {
      const res = await fetch('/api/inventory/link-bulto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detalId: detalProduct.id,
          bultoId: Number(selectedBultoId),
          factorConversion: factorNum
        })
      });
      const data = await res.json();
      if (data.success) {
        showAlert(`Vínculo Bulto ↔ Detal guardado con éxito (Factor: 1 Bulto = ${factorNum} Uds).`, 'Vínculo Guardado', 'success');
        if (onSuccessUnpack) onSuccessUnpack();
      } else {
        throw new Error(data.error || 'Error al guardar el vínculo');
      }
    } catch (err: any) {
      showAlert(`Error: ${err.message}`, 'Error Guardando Vínculo', 'error');
    } finally {
      setSavingLink(false);
    }
  };

  const handleExecuteUnpack = async () => {
    if (!detalProduct || !activeBultoProduct) {
      showAlert('Debes vincular un Bulto Padre antes de desempacar.', 'Sin Vínculo', 'warning');
      return;
    }
    if ((activeBultoProduct.stock_actual || 0) < bultosToUnpack) {
      showAlert(`Stock insuficiente en el bulto "${activeBultoProduct.description}". Stock disponible: ${activeBultoProduct.stock_actual || 0} bultos.`, 'Stock Insuficiente', 'warning');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/inventory/unpack-bulto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detalId: detalProduct.id,
          bultoId: activeBultoProduct.id,
          cantidadBultos: bultosToUnpack,
          usuario: currentUser?.nombre || currentUser?.usuario || 'OPERADOR POS'
        })
      });
      const data = await res.json();
      if (data.success) {
        showAlert(`✅ Transacción ACID Exitosa: Se desempacaron ${bultosToUnpack} bulto(s) de "${activeBultoProduct.description}". Se agregaron +${data.detalQtyAdded} unidades al detal de "${detalProduct.description}". Kardex actualizado.`, 'Desempaque Exitoso', 'success');
        if (onSuccessUnpack) onSuccessUnpack();
        onClose();
      } else {
        throw new Error(data.error || 'Error al ejecutar la transacción de desempaque');
      }
    } catch (err: any) {
      console.error('Error desempacando bulto:', err);
      showAlert(`Error en transacción ACID: ${err.message}`, 'Falló Desempaque', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !detalProduct) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* HEADER */}
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/20 border border-blue-400/30 rounded-2xl backdrop-blur-md">
              <PackageCheck className="w-7 h-7 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight text-white font-mono">
                  Jerarquía y Desempaque Bulto ↔ Detal (ACID)
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-blue-500/30 text-blue-200 rounded-full border border-blue-400/30">
                  Transacción Atómica Postgres
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-0.5">
                Producto Detal: <strong className="text-white font-bold">{detalProduct.description}</strong> (Stock detal: {detalProduct.stock_actual} Uds)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* VINCULO SELECTION FORM */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-4">
            <h4 className="text-xs font-black uppercase text-slate-700 flex items-center gap-1.5 font-mono">
              <Boxes className="w-4 h-4 text-blue-600" />
              Configurar Vínculo Bulto Padre y Factor de Conversión
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              {/* Bulto product selector */}
              <div className="sm:col-span-8 space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase">
                  Producto Bulto Padre (Caja/Empaque Cerrado):
                </label>
                <select
                  value={selectedBultoId}
                  onChange={(e) => setSelectedBultoId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- Seleccionar Bulto Padre --</option>
                  {candidateBultoProducts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.description} (Cod: {b.barcode}) | Stock: {b.stock_actual} bultos | Costo: ${b.precio_costo_usd.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Conversion factor */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase">
                  Factor (Uds x Bulto):
                </label>
                <input
                  type="number"
                  min="1"
                  value={conversionFactor}
                  onChange={(e) => setConversionFactor(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs font-mono font-black text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="ej. 24"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-[11px] text-slate-500">
                1 Bulto equivale a <strong>{factorNum}</strong> unidades al detal.
              </span>
              <button
                onClick={handleSaveLink}
                disabled={savingLink || !selectedBultoId}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {savingLink ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Guardar Vínculo
              </button>
            </div>
          </div>

          {/* PRORATED COST ACCOUNTING PREVIEW (Pilar #4) */}
          {activeBultoProduct && (
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-4 rounded-2xl border border-indigo-800/40 shadow-md">
              <div className="flex items-center justify-between border-b border-indigo-800/40 pb-2 mb-3">
                <span className="text-xs font-black uppercase text-indigo-300 tracking-wider flex items-center gap-1.5 font-mono">
                  <Sparkles className="w-4 h-4 text-indigo-400" /> Valuación Proporcional de Costos (Pilar #4)
                </span>
                <span className="text-[10px] text-indigo-300 font-mono">Kardex Audit Trail</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Costo del Bulto ($):</span>
                  <div className="text-lg font-black text-white font-mono mt-0.5">
                    ${bultoCost.toFixed(2)}
                  </div>
                  <span className="text-[10px] text-slate-400">{(bultoCost * tasaDia).toFixed(2)} Bs</span>
                </div>

                <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Factor Conversión:</span>
                  <div className="text-lg font-black text-indigo-300 font-mono mt-0.5">
                    {factorNum} Uds
                  </div>
                  <span className="text-[10px] text-slate-400">por 1 Bulto</span>
                </div>

                <div className="p-2.5 bg-emerald-900/30 rounded-xl border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 uppercase font-bold">Nuevo Costo Detal ($/Ud):</span>
                  <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                    ${unitCostNewProrated.toFixed(4)}
                  </div>
                  <span className="text-[10px] text-emerald-400">{(unitCostNewProrated * tasaDia).toFixed(2)} Bs/Ud</span>
                </div>
              </div>
            </div>
          )}

          {/* EXECUTE UNPACK ACTION SECTION */}
          {activeBultoProduct && (
            <div className="bg-blue-50/60 border border-blue-200 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase text-blue-900 font-mono">
                    Ejecutar Desempaque en Cascadas (ACID Lock)
                  </h4>
                  <p className="text-[11px] text-blue-700 mt-0.5">
                    Resta <strong>{bultosToUnpack}</strong> bulto(s) de "{activeBultoProduct.description}" (Disponibles: {activeBultoProduct.stock_actual}) y suma +<strong>{bultosToUnpack * factorNum}</strong> unidades al detal.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Cant Bultos:</span>
                  <input
                    type="number"
                    min="1"
                    max={activeBultoProduct.stock_actual || 1}
                    value={bultosToUnpack}
                    onChange={(e) => setBultosToUnpack(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 p-1.5 bg-white border border-slate-300 rounded-xl text-center font-mono font-black text-xs"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-blue-200/60 flex items-center justify-end">
                <button
                  onClick={handleExecuteUnpack}
                  disabled={loading || (activeBultoProduct.stock_actual || 0) < bultosToUnpack}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                  Confirmar y Desempacar {bultosToUnpack} Bulto(s) (+{bultosToUnpack * factorNum} Uds)
                </button>
              </div>
            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between text-[11px] text-slate-500">
          <span>🔒 Bloqueo de filas en base de datos PostgreSQL (`SELECT FOR UPDATE`) para evitar condiciones de carrera entre cajas POS.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
