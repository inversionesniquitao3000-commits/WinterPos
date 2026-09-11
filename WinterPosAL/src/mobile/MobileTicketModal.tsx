import { useState } from 'react';
import { 
  CheckCircle2, Share2, Printer, PlusCircle, X, 
  Receipt, DollarSign, Calendar, User, Phone, Send
} from 'lucide-react';
import { Sale, CompanyConfig } from '../types';
import { printTicketReceipt } from '../utils';

interface MobileTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  companyConfig: CompanyConfig;
  onNewSale: () => void;
}

export default function MobileTicketModal({
  isOpen,
  onClose,
  sale,
  companyConfig,
  onNewSale
}: MobileTicketModalProps) {
  const [whatsappPhone, setWhatsappPhone] = useState(sale?.client?.telefono || '');
  const [showPhoneInput, setShowPhoneInput] = useState(false);

  if (!isOpen || !sale) return null;

  const totalUsd = sale.totalUSD || 0;
  const totalVes = sale.totalVES || 0;
  const clientName = sale.client?.nombre || 'Consumidor Final';
  const clientDoc = sale.client?.cedula_rif || 'V-00000000';

  const handlePrint = () => {
    try {
      printTicketReceipt(sale, companyConfig, false);
    } catch (err) {
      console.warn('Print error:', err);
      window.print();
    }
  };

  const handleShareWhatsApp = (targetPhone?: string) => {
    const rawPhone = (targetPhone || whatsappPhone || '').replace(/\D/g, '');
    
    // Construct digital ticket receipt text
    let text = `🧾 *COMPROBANTE DE COMPRA*\n`;
    text += `🏢 *${companyConfig?.nombre || 'WinterPos'}*\n`;
    if (companyConfig?.rif) text += `RIF: ${companyConfig.rif}\n`;
    text += `--------------------------------\n`;
    text += `📄 Nro: *#${sale.factura_nro || sale.id}*\n`;
    text += `📅 Fecha: ${sale.fecha || new Date().toLocaleString()}\n`;
    text += `👤 Cliente: ${clientName} (${clientDoc})\n`;
    text += `--------------------------------\n`;
    text += `*PRODUCTOS:*\n`;

    sale.items?.forEach((it) => {
      const desc = it.product?.description || it.description || 'Producto';
      const qty = it.qty || 1;
      const price = it.priceUSD || it.precio_unitario_usd || 0;
      const rowTot = it.totalUSD || it.total_fila_usd || price * qty;
      text += `• ${qty}x ${desc} - $${rowTot.toFixed(2)}\n`;
    });

    text += `--------------------------------\n`;
    text += `💵 *TOTAL: $${totalUsd.toFixed(2)} USD*\n`;
    text += `🇻🇪 *TOTAL: ${totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs*\n`;

    if (sale.pagos && sale.pagos.length > 0) {
      text += `\n*PAGOS:*\n`;
      sale.pagos.forEach((p) => {
        const amt = p.monto || p.montoUSD || 0;
        text += `- ${p.metodo}: ${p.metodo.includes('$') ? '$' + amt.toFixed(2) : amt.toFixed(2) + ' Bs'}\n`;
      });
    }

    if (sale.vueltoUSD > 0) text += `Cambio USD: $${sale.vueltoUSD.toFixed(2)}\n`;
    if (sale.vueltoVES > 0) text += `Cambio Bs: ${sale.vueltoVES.toFixed(2)} Bs\n`;

    text += `\n_¡Gracias por su compra!_`;

    const encoded = encodeURIComponent(text);
    const url = rawPhone 
      ? `https://wa.me/${rawPhone.startsWith('58') ? rawPhone : '58' + rawPhone.replace(/^0+/, '')}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col justify-end max-w-md mx-auto">
      <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
        
        {/* Top Success Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-center justify-between bg-emerald-950/30">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white leading-tight">¡Venta Registrada!</h3>
              <p className="text-[11px] text-emerald-400 font-bold font-mono">
                Ticket #{sale.factura_nro || sale.id}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center transition active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Receipt Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Receipt Preview Card */}
          <div className="bg-white text-slate-900 rounded-2xl p-4 shadow-xl border border-slate-200 font-mono text-xs space-y-3 relative overflow-hidden">
            {/* Decorative Receipt Serrated Top Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500"></div>

            {/* Header info */}
            <div className="text-center pb-2 border-b border-dashed border-slate-300">
              <h4 className="font-black text-sm tracking-tight text-slate-950">
                {companyConfig?.nombre || 'WINTERPOS'}
              </h4>
              {companyConfig?.rif && <p className="text-[10px] text-slate-600">RIF: {companyConfig.rif}</p>}
              <p className="text-[10px] text-slate-500">{sale.fecha || new Date().toLocaleString()}</p>
            </div>

            {/* Client & Document */}
            <div className="text-[11px] space-y-0.5 pb-2 border-b border-dashed border-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Cliente:</span>
                <span className="font-bold text-right">{clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Doc / RIF:</span>
                <span className="font-bold">{clientDoc}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Comprobante:</span>
                <span className="font-black text-blue-700">#{sale.factura_nro || sale.id}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="space-y-1.5 pb-2 border-b border-dashed border-slate-300">
              <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase">
                <span>Cant • Descripción</span>
                <span>Total</span>
              </div>
              {sale.items?.map((it, idx) => {
                const desc = it.product?.description || it.description || 'Producto';
                const qty = it.qty || 1;
                const price = it.priceUSD || it.precio_unitario_usd || 0;
                const lineTot = it.totalUSD || it.total_fila_usd || price * qty;
                return (
                  <div key={idx} className="flex justify-between text-[11px]">
                    <span className="truncate max-w-[190px]">
                      {qty}x {desc}
                    </span>
                    <span className="font-bold shrink-0">${lineTot.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="space-y-1 text-right pt-1">
              <div className="flex justify-between text-base font-black text-slate-950">
                <span>TOTAL USD:</span>
                <span>${totalUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span>TOTAL BS:</span>
                <span>{totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs</span>
              </div>
            </div>

            {/* Payment methods */}
            {sale.pagos && sale.pagos.length > 0 && (
              <div className="pt-2 border-t border-dashed border-slate-300 text-[10px] text-slate-600 space-y-0.5">
                <span className="font-bold text-slate-700 block">Formas de Pago:</span>
                {sale.pagos.map((p, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{p.metodo}:</span>
                    <span className="font-bold">
                      {p.metodo.includes('$') ? `$${(p.monto || p.montoUSD || 0).toFixed(2)}` : `${(p.monto || p.montoVES || 0).toFixed(2)} Bs`}
                    </span>
                  </div>
                ))}
                {sale.vueltoUSD > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Cambio Entregado ($):</span>
                    <span>${sale.vueltoUSD.toFixed(2)}</span>
                  </div>
                )}
                {sale.vueltoVES > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Cambio Entregado (Bs):</span>
                    <span>{sale.vueltoVES.toFixed(2)} Bs</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Optional Phone Input for WhatsApp */}
          {showPhoneInput && (
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2 animate-in fade-in duration-150">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                Número de WhatsApp del Cliente
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  placeholder="Ej: 04121234567"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                />
                <button
                  onClick={() => handleShareWhatsApp(whatsappPhone)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow transition active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Action Buttons */}
        <div className="p-4 pb-8 bg-slate-950 border-t border-slate-800 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                if (sale.client?.telefono) {
                  handleShareWhatsApp(sale.client.telefono);
                } else {
                  setShowPhoneInput(!showPhoneInput);
                }
              }}
              className="py-3 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <Share2 className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handlePrint}
              className="py-3 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <Printer className="w-4 h-4 text-blue-400" />
              <span>Imprimir</span>
            </button>
          </div>

          <button
            onClick={() => {
              onClose();
              onNewSale();
            }}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 transition active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            <span>NUEVA VENTA</span>
          </button>
        </div>

      </div>
    </div>
  );
}
