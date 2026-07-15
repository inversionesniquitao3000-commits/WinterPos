import React from 'react';
import { CompanyConfig } from '../types';
import { Save, CheckCircle2 } from 'lucide-react';

interface ConfiguracionEmpresaProps {
  config: CompanyConfig;
  onSaveConfig: (newConfig: CompanyConfig) => void;
}

export default function ConfiguracionEmpresa({ config, onSaveConfig }: ConfiguracionEmpresaProps) {
  const [formData, setFormData] = React.useState<CompanyConfig>({ ...config });
  const [successMsg, setSuccessMsg] = React.useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePaymentToggle = (method: string) => {
    setFormData(prev => {
      const active = prev.metodos_pago_activos.includes(method)
        ? prev.metodos_pago_activos.filter(m => m !== method)
        : [...prev.metodos_pago_activos, method];
      return {
        ...prev,
        metodos_pago_activos: active
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(formData);
    setSuccessMsg(true);
    setTimeout(() => setSuccessMsg(false), 3000);
  };

  const paymentMethods = [
    { id: 'efectivo_usd', label: 'Efectivo $' },
    { id: 'efectivo_ves', label: 'Efectivo Bs' },
    { id: 'tarjeta_ves', label: 'Tarjeta de Débito Bs' },
    { id: 'pago_movil', label: 'Pago Móvil Bs' },
    { id: 'biopago', label: 'Biopago Bs' },
    { id: 'credito', label: 'Crédito Cliente $' }
  ];

  return (
    <div className="space-y-6 text-slate-800 font-mono text-xs">
      
      {/* HEADER */}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-extrabold text-winter-configStart tracking-wider uppercase">
          CONFIGURACIÓN DEL NEGOCIO (ERP PARAMETERS)
        </h1>
        <p className="text-xs text-slate-500 mt-1 font-sans">
          Administre la identidad comercial de su sucursal, los métodos de pago autorizados y el formato fiscal del ticket.
        </p>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-250 text-emerald-700 px-4 py-3 rounded-lg text-xs flex items-center gap-2 font-sans">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Parámetros de la empresa actualizados exitosamente en la configuración local.</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
        
        {/* CONFIGURATION FORM - Light Styled */}
        <form onSubmit={handleSubmit} className="xl:col-span-3 bg-white border border-slate-200 p-6 rounded-xl space-y-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700 border-b border-slate-100 pb-2 mb-2 flex items-center gap-2 font-sans">
            <Save className="w-4 h-4 text-winter-configStart" />
            Datos Básicos & Fiscales
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1 font-sans">Nombre del Comercio</label>
              <input
                type="text"
                name="nombre_comercio"
                value={formData.nombre_comercio}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1 font-sans">RIF Comercial</label>
              <input
                type="text"
                name="rif"
                value={formData.rif}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-50 border border-slate-350 rounded p-2.5 text-xs text-emerald-700 focus:bg-white focus:border-winter-configStart focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1 font-sans">Teléfono</label>
              <input
                type="text"
                name="telefono"
                value={formData.telefono}
                onChange={handleInputChange}
                className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1 font-sans">Correo de Contacto</label>
              <input
                type="email"
                name="correo"
                value={formData.correo}
                onChange={handleInputChange}
                className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1 font-sans">Dirección Comercial</label>
            <input
              type="text"
              name="direccion"
              value={formData.direccion}
              onChange={handleInputChange}
              className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans"
            />
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <label className="text-xs font-bold text-slate-655 block font-sans">Métodos de Cobro Habilitados</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 font-sans">
              {paymentMethods.map(method => {
                const isActive = formData.metodos_pago_activos.includes(method.id);
                return (
                  <button
                    type="button"
                    key={method.id}
                    onClick={() => handlePaymentToggle(method.id)}
                    className={`p-2.5 rounded border text-xs font-bold text-center transition-all ${
                      isActive
                        ? 'bg-emerald-50 border-emerald-250 text-emerald-700 shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-350'
                    }`}
                  >
                    {method.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="text-xs text-slate-500 block mb-1 font-sans">Mensaje de Pie de Factura / Ticket</label>
            <textarea
              name="mensaje_pie_ticket"
              value={formData.mensaje_pie_ticket}
              onChange={handleInputChange}
              rows={3}
              className="w-full bg-slate-50 border border-slate-300 rounded p-2.5 text-xs text-slate-800 focus:bg-white focus:border-winter-configStart focus:outline-none font-sans resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-winter-configStart hover:bg-winter-configEnd text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all shadow-sm"
          >
            GUARDAR PARAMETRIZACIÓN GLOBAL
          </button>
        </form>

        {/* RECEIPT PREVIEW COLUMN - Light Styled */}
        <div className="xl:col-span-2 space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest block font-sans">
            Vista Previa de Ticket Fiscal Digital
          </h3>
          
          <div className="bg-white border border-slate-250 rounded-xl p-5 shadow-sm max-w-sm mx-auto space-y-3 font-mono text-[9px] text-slate-900 select-none">
            
            <div className="text-center">
              <h4 className="font-extrabold text-sm uppercase tracking-wide">{formData.nombre_comercio || 'NOMBRE COMERCIO'}</h4>
              <p className="font-bold">RIF: {formData.rif || 'G-00000000-0'}</p>
              <p className="text-[8px] mt-0.5">{formData.direccion || 'DIRECCIÓN COMERCIAL'}</p>
              <p>Telf: {formData.telefono || '0000-0000000'}</p>
            </div>

            <p className="text-center text-slate-300">----------------------------------------</p>

            <div className="space-y-0.5 text-slate-655">
              <div>FACTURA: FAC-000458</div>
              <div>FECHA: {new Date().toLocaleDateString()}</div>
              <div>HORA: {new Date().toLocaleTimeString()}</div>
              <div>CAJERO: OPERADOR DEMO</div>
              <div>VENDEDOR: VENDEDOR AUXILIAR</div>
              <div>CLIENTE: CONSUMIDOR FINAL</div>
              <div>ID/RIF: V-00000000</div>
            </div>

            <p className="text-center text-slate-300">----------------------------------------</p>

            <div className="space-y-1">
              <div className="flex font-bold justify-between text-slate-700">
                <span className="w-1/2">CONCEPTO</span>
                <span className="w-1/12 text-center">CT</span>
                <span className="w-1/4 text-right">P.UN</span>
                <span className="w-1/6 text-right">TOTAL</span>
              </div>
              <div className="flex justify-between text-slate-655">
                <span className="w-1/2 truncate">HARINA DE MAÍZ PAN 1KG</span>
                <span className="w-1/12 text-center">2</span>
                <span className="w-1/4 text-right">$1.20</span>
                <span className="w-1/6 text-right">$2.40</span>
              </div>
              <div className="flex justify-between text-slate-655">
                <span className="w-1/2 truncate">ARROZ PRIMOR 1KG</span>
                <span className="w-1/12 text-center">1</span>
                <span className="w-1/4 text-right">$1.10</span>
                <span className="w-1/6 text-right">$1.10</span>
              </div>
            </div>

            <p className="text-center text-slate-300">----------------------------------------</p>

            <div className="text-right space-y-0.5 text-[10px] text-slate-800">
              <div className="flex justify-between">
                <span>SUBTOTAL USD:</span>
                <span>$3.50</span>
              </div>
              <div className="flex justify-between font-extrabold text-sm border-t border-slate-200 pt-1 text-slate-900">
                <span>TOTAL USD:</span>
                <span>$3.50</span>
              </div>
              <div className="flex justify-between text-slate-500 font-bold border-t border-dashed border-slate-200 pt-1">
                <span>TOTAL VES (Tasa 40.00):</span>
                <span>Bs 140.00</span>
              </div>
            </div>

            <p className="text-center text-slate-300">----------------------------------------</p>

            <div className="space-y-0.5 text-slate-600">
              <span className="font-bold block text-slate-700">MEDIOS DE PAGO LIQUIDADOS:</span>
              <div className="flex justify-between">
                <span>Efectivo ($ USD):</span>
                <span>$3.50</span>
              </div>
            </div>

            <p className="text-center text-slate-300">----------------------------------------</p>

            <div className="text-center text-[8px] italic leading-relaxed text-slate-500">
              {formData.mensaje_pie_ticket || 'Gracias por su compra.'}
            </div>

            <div className="text-center text-[6px] text-slate-400">
              WINTERPOS - DOCUMENTO DIGITAL DE CAJA
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
