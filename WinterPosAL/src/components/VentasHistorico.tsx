import { useState, useEffect, useMemo } from 'react';
import { Sale, CierreCaja, User } from '../types';
import { History, Printer, ShieldAlert, ShoppingCart, Eye, Edit, Trash2, Search, ChevronUp, ChevronDown, ChevronsUpDown, CheckCircle2, FileDown, MessageCircle } from 'lucide-react';
import { formatNumberToWordsUSD, getLocalDateStr } from '../utils';
import { useDialog } from '../hooks/useDialog';

interface VentasHistoricoProps {
  sales: Sale[];
  cierres: CierreCaja[];
  onReprintTicket: (sale: Sale) => void;
  currentUser: User;
  onUpdateCierre: (cierreId: number, updatedData: any) => Promise<boolean>;
  onDeleteCierre: (cierreId: number) => Promise<boolean>;
  getApiUrl: (path: string) => string;
}

export default function VentasHistorico({ sales, cierres, onReprintTicket, currentUser, onUpdateCierre, onDeleteCierre, getApiUrl }: VentasHistoricoProps) {
  const { showAlert } = useDialog();
  const [activeSubTab, setActiveSubTab] = useState<'ventas' | 'cierres'>('ventas');
  const [selectedCierre, setSelectedCierre] = useState<CierreCaja | null>(null);
  const [selectedCierreRow, setSelectedCierreRow] = useState<CierreCaja | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedCierreIds, setSelectedCierreIds] = useState<number[]>([]);
  const [capturingCierre, setCapturingCierre] = useState<CierreCaja | null>(null);
  const [sendingProgressMsg, setSendingProgressMsg] = useState<string>('');
  const [cierreInvoicesModal, setCierreInvoicesModal] = useState<CierreCaja | null>(null);
  const [cierreInvoiceSearch, setCierreInvoiceSearch] = useState('');

  const isAdmin = currentUser?.rol?.toLowerCase() === 'administrador';

  // Edit Cierre Modal State
  const [editingCierre, setEditingCierre] = useState<CierreCaja | null>(null);
  const [editAperturaUsd, setEditAperturaUsd] = useState('');
  const [editAperturaVes, setEditAperturaVes] = useState('');
  const [editRealUsd, setEditRealUsd] = useState('');
  const [editRealVes, setEditRealVes] = useState('');
  const [editEntradaUsd, setEditEntradaUsd] = useState('');
  const [editEntradaVes, setEditEntradaVes] = useState('');
  const [editSalidaUsd, setEditSalidaUsd] = useState('');
  const [editSalidaVes, setEditSalidaVes] = useState('');

  // Listen for Escape key to close modals in stack order
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedSale) {
          setSelectedSale(null);
        } else if (cierreInvoicesModal) {
          setCierreInvoicesModal(null);
          setCierreInvoiceSearch('');
        } else if (selectedCierre) {
          setSelectedCierre(null);
        } else if (editingCierre) {
          setEditingCierre(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSale, cierreInvoicesModal, selectedCierre, editingCierre]);

  const handleStartEditCierre = (c: CierreCaja) => {
    setEditingCierre(c);
    setEditAperturaUsd(String(c.aperturaUsd ?? 0));
    setEditAperturaVes(String(c.aperturaVes ?? 0));
    setEditRealUsd(String(c.realUsd ?? 0));
    setEditRealVes(String(c.realVes ?? 0));
    setEditEntradaUsd(String(c.entradaEfectivoUsd ?? 0));
    setEditEntradaVes(String(c.entradaEfectivoVes ?? 0));
    setEditSalidaUsd(String(c.salidaEfectivoUsd ?? 0));
    setEditSalidaVes(String(c.salidaEfectivoVes ?? 0));
  };

  const captureCierrePNG = async (c: CierreCaja): Promise<string> => {
    setCapturingCierre(c);
    await new Promise(resolve => setTimeout(resolve, 280));
    let imageBase64 = '';
    try {
      const htmlToImage = await import(/* @vite-ignore */ 'html-to-image');
      const element = document.getElementById('cierre-capture-card') || document.getElementById('cierre-comprobante-card');
      if (element) {
        imageBase64 = await htmlToImage.toPng(element, { backgroundColor: '#ffffff', quality: 0.95 });
      }
    } catch (err) {
      console.warn('Error capturando PNG del cierre:', err);
    } finally {
      setCapturingCierre(null);
    }
    return imageBase64;
  };

  const handleResendWhatsAppCierre = async (c: CierreCaja) => {
    setSendingProgressMsg(`Capturando y reenviando comprobante de ${c.usuario}...`);
    try {
      const imageBase64 = await captureCierrePNG(c);
      const fecha = c.fechaCierre || c.fecha || new Date().toLocaleDateString('es-VE');
      const usuario = c.usuario || 'N/A';
      const terminal = c.terminal || 'LOCAL';
      const dineroEnCajaExpected = (c.dineroEnCajaExpected ?? (c as any).expectedUsd ?? 0).toFixed(2);
      const expectedVes = (c.expectedVes ?? 0).toFixed(2);
      const realUsd = (c.realUsd ?? 0).toFixed(2);
      const realVes = (c.realVes ?? 0).toFixed(2);
      const diffUsd = ((c.realUsd ?? 0) - (c.dineroEnCajaExpected ?? (c as any).expectedUsd ?? 0)).toFixed(2);
      const diffVes = ((c.realVes ?? 0) - (c.expectedVes ?? 0)).toFixed(2);
      const ventaTotalUsd = (c.ventaTotalUsd ?? 0).toFixed(2);
      const descuentosUsd = (c.descuentosUsd ?? 0).toFixed(2);

      let textSummary = `📊 *REPORTE REENVIADO DE CIERRE DE CAJA*\n\n`;
      textSummary += `📅 *Fecha Cierre:* ${fecha}\n`;
      textSummary += `👤 *Cajero:* ${usuario}\n`;
      textSummary += `🖥️ *Terminal:* ${terminal}\n\n`;
      textSummary += `💵 *EFECTIVO ESPERADO EN GAVETA:*\n`;
      textSummary += `• Dólares (USD): $ ${dineroEnCajaExpected}\n`;
      textSummary += `• Bolívares (VES): Bs ${expectedVes}\n\n`;
      textSummary += `📥 *EFECTIVO FÍSICO RECIBIDO:*\n`;
      textSummary += `• Dólares (USD): $ ${realUsd}\n`;
      textSummary += `• Bolívares (VES): Bs ${realVes}\n\n`;
      textSummary += `⚖️ *DIFERENCIA (BALANCE):*\n`;
      textSummary += `• Dólares (USD): ${parseFloat(diffUsd) >= 0 ? '+' : ''}$ ${diffUsd}\n`;
      textSummary += `• Bolívares (VES): ${parseFloat(diffVes) >= 0 ? '+' : ''}Bs ${diffVes}\n\n`;
      textSummary += `🛍️ *VENTAS TOTALES:* $ ${ventaTotalUsd} USD\n`;
      textSummary += `📉 *DESCUENTOS:* $ ${descuentosUsd} USD\n\n`;
      textSummary += `*WinterPosAL Cloud System*`;

      let waSentSuccess = false;
      try {
        const res = await fetch(getApiUrl('/whatsapp/send-cierre'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: imageBase64 || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            textSummary
          })
        });
        if (res.ok) {
          waSentSuccess = true;
        }
      } catch (err) {
        console.warn('Error al enviar por API de WhatsApp:', err);
      }

      if (waSentSuccess) {
        showAlert('El reporte e imagen del comprobante de cierre fueron reenviados con éxito por WhatsApp al grupo configurado.', 'Reenvío Exitoso', 'success');
      } else {
        try {
          if (imageBase64) {
            const resBlob = await fetch(imageBase64);
            const blob = await resBlob.blob();
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type]: blob })
            ]);
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textSummary);
          }
          const encodedText = encodeURIComponent(textSummary);
          window.open(`https://web.whatsapp.com/send?text=${encodedText}`, '_blank');
          showAlert('La imagen del comprobante de cierre fue copiada al portapapeles. Presione Ctrl+V en WhatsApp Web para adjuntarla.', 'Copiado al Portapapeles', 'info');
        } catch (e: any) {
          showAlert('Error al preparar el reenvío por WhatsApp.', 'Error', 'error');
        }
      }
    } finally {
      setSendingProgressMsg('');
    }
  };

  const handleResendBatchWhatsApp = async () => {
    const selectedCierres = cierres.filter(c => selectedCierreIds.includes(c.id));
    if (selectedCierres.length === 0) return;

    let successCount = 0;
    for (let i = 0; i < selectedCierres.length; i++) {
      const c = selectedCierres[i];
      setSendingProgressMsg(`Procesando envío ${i + 1} de ${selectedCierres.length} por WhatsApp... (${c.usuario})`);

      const imageBase64 = await captureCierrePNG(c);
      const fecha = c.fechaCierre || c.fecha || new Date().toLocaleDateString('es-VE');
      const usuario = c.usuario || 'N/A';
      const terminal = c.terminal || 'LOCAL';
      const dineroEnCajaExpected = (c.dineroEnCajaExpected ?? (c as any).expectedUsd ?? 0).toFixed(2);
      const expectedVes = (c.expectedVes ?? 0).toFixed(2);
      const realUsd = (c.realUsd ?? 0).toFixed(2);
      const realVes = (c.realVes ?? 0).toFixed(2);
      const diffUsd = ((c.realUsd ?? 0) - (c.dineroEnCajaExpected ?? (c as any).expectedUsd ?? 0)).toFixed(2);
      const diffVes = ((c.realVes ?? 0) - (c.expectedVes ?? 0)).toFixed(2);
      const ventaTotalUsd = (c.ventaTotalUsd ?? 0).toFixed(2);
      const descuentosUsd = (c.descuentosUsd ?? 0).toFixed(2);

      let textSummary = `📊 *REPORTE DE CIERRE DE CAJA (${i + 1}/${selectedCierres.length})*\n\n`;
      textSummary += `📅 *Fecha Cierre:* ${fecha}\n`;
      textSummary += `👤 *Cajero:* ${usuario}\n`;
      textSummary += `🖥️ *Terminal:* ${terminal}\n\n`;
      textSummary += `💵 *EFECTIVO ESPERADO EN GAVETA:*\n`;
      textSummary += `• Dólares (USD): $ ${dineroEnCajaExpected}\n`;
      textSummary += `• Bolívares (VES): Bs ${expectedVes}\n\n`;
      textSummary += `📥 *EFECTIVO FÍSICO RECIBIDO:*\n`;
      textSummary += `• Dólares (USD): $ ${realUsd}\n`;
      textSummary += `• Bolívares (VES): Bs ${realVes}\n\n`;
      textSummary += `⚖️ *DIFERENCIA (BALANCE):*\n`;
      textSummary += `• Dólares (USD): ${parseFloat(diffUsd) >= 0 ? '+' : ''}$ ${diffUsd}\n`;
      textSummary += `• Bolívares (VES): ${parseFloat(diffVes) >= 0 ? '+' : ''}Bs ${diffVes}\n\n`;
      textSummary += `🛍️ *VENTAS TOTALES:* $ ${ventaTotalUsd} USD\n`;
      textSummary += `📉 *DESCUENTOS:* $ ${descuentosUsd} USD\n\n`;
      textSummary += `*WinterPosAL Cloud System*`;

      try {
        const res = await fetch(getApiUrl('/whatsapp/send-cierre'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: imageBase64 || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            textSummary
          })
        });
        if (res.ok) successCount++;
      } catch (err) {
        console.error('Error enviando cierre masivo:', err);
      }
    }

    setSendingProgressMsg('');
    if (successCount > 0) {
      showAlert(`🟢 Se reenviaron con éxito ${successCount} de ${selectedCierres.length} cierres seleccionados por WhatsApp junto a sus comprobantes PNG.`, 'Reenvío Masivo Completado', 'success');
      setSelectedCierreIds([]);
    } else {
      showAlert('No se pudo enviar los cierres por WhatsApp. Verifique que la integración de WhatsApp esté conectada.', 'Error en Envío Masivo', 'error');
    }
  };

  const [startDate, setStartDate] = useState(() => getLocalDateStr());
  const [endDate, setEndDate] = useState(() => getLocalDateStr());
  const [filterEnabled, setFilterEnabled] = useState(true);

  // Search inputs
  const [salesSearchTerm, setSalesSearchTerm] = useState('');
  const [cierresSearchTerm, setCierresSearchTerm] = useState('');

  // Sales sorting states
  type SalesSortField = 'fecha' | 'factura_nro' | 'cliente' | 'usuario' | 'totalUSD' | 'totalVES';
  const [salesSortField, setSalesSortField] = useState<SalesSortField>('fecha');
  const [salesSortDir, setSalesSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSalesSort = (field: SalesSortField) => {
    if (salesSortField === field) {
      setSalesSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSalesSortField(field);
      setSalesSortDir(field === 'fecha' ? 'desc' : 'asc');
    }
  };

  // Cierres sorting states
  type CierresSortField = 'fechaApertura' | 'fechaCierre' | 'usuario' | 'aperturaUsd' | 'ventaTotalUsd' | 'realUsd' | 'diffUsd' | 'utilidadUsd' | 'status';
  const [cierresSortField, setCierresSortField] = useState<CierresSortField>('fechaCierre');
  const [cierresSortDir, setCierresSortDir] = useState<'asc' | 'desc'>('desc');

  const handleCierresSort = (field: CierresSortField) => {
    if (cierresSortField === field) {
      setCierresSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setCierresSortField(field);
      setCierresSortDir(field === 'fechaCierre' ? 'desc' : 'asc');
    }
  };

  const SalesSortIcon = ({ field }: { field: SalesSortField }) => {
    if (salesSortField !== field) return <ChevronsUpDown className="inline w-3 h-3 ml-0.5 opacity-30" />;
    return salesSortDir === 'asc'
      ? <ChevronUp className="inline w-3 h-3 ml-0.5 text-blue-500" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5 text-blue-500" />;
  };

  const CierresSortIcon = ({ field }: { field: CierresSortField }) => {
    if (cierresSortField !== field) return <ChevronsUpDown className="inline w-3 h-3 ml-0.5 opacity-30" />;
    return cierresSortDir === 'asc'
      ? <ChevronUp className="inline w-3 h-3 ml-0.5 text-blue-500" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5 text-blue-500" />;
  };

  // Filter sales list by date range if enabled
  const filteredSales = useMemo(() => {
    if (!filterEnabled) return sales;
    return sales.filter(s => {
      if (!s.fecha) return false;
      const dateStr = s.fecha.substring(0, 10); // "YYYY-MM-DD"
      return dateStr >= startDate && dateStr <= endDate;
    });
  }, [sales, startDate, endDate, filterEnabled]);

  // Apply search term and sorting to sales
  const finalFilteredSales = useMemo(() => {
    let list = filteredSales;
    if (salesSearchTerm.trim() !== '') {
      const term = salesSearchTerm.toLowerCase();
      list = list.filter(s => 
        (s.factura_nro || '').toLowerCase().includes(term) ||
        (s.fecha || '').toLowerCase().includes(term) ||
        (s.client?.nombre || '').toLowerCase().includes(term) ||
        (s.client?.cedula_rif || '').toLowerCase().includes(term) ||
        (s.usuario || '').toLowerCase().includes(term) ||
        (s.terminal || '').toLowerCase().includes(term) ||
        (s.pagos || []).some(p => (p.metodo || '').toLowerCase().includes(term))
      );
    }
    return [...list].sort((a, b) => {
      let va: any = (a as any)[salesSortField];
      let vb: any = (b as any)[salesSortField];

      if (salesSortField === 'cliente') {
        va = a.client?.nombre || '';
        vb = b.client?.nombre || '';
      }
      if (salesSortField === 'totalUSD') {
        va = a.totalUSD ?? 0;
        vb = b.totalUSD ?? 0;
      }
      if (salesSortField === 'totalVES') {
        va = a.totalVES ?? 0;
        vb = b.totalVES ?? 0;
      }

      if (typeof va === 'number' && typeof vb === 'number') {
        return salesSortDir === 'asc' ? va - vb : vb - va;
      }
      return salesSortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [filteredSales, salesSearchTerm, salesSortField, salesSortDir]);

  // Calculate totals and utility for the filtered sales
  const filteredSalesTotals = useMemo(() => {
    let totalVentas = 0;
    let totalCosto = 0;
    
    finalFilteredSales.forEach(s => {
      const isDev = s.factura_nro.startsWith('DEV-');
      
      totalVentas += (s.totalUSD ?? 0);
      (s.items ?? []).forEach(item => {
        const itemCost = item.product?.precio_costo_usd ?? 0;
        totalCosto += itemCost * (item.qty ?? 0) * (isDev ? -1 : 1);
      });
    });
    
    const totalUtilidad = totalVentas - totalCosto;
    return {
      totalVentas,
      totalCosto,
      totalUtilidad
    };
  }, [finalFilteredSales]);

  // Filter cierres list by date range if enabled
  const filteredCierres = useMemo(() => {
    if (!filterEnabled) return cierres;
    return cierres.filter(c => {
      const targetDate = (c.status === 'Abierta' || !c.fechaCierre) 
        ? (c.fechaApertura || c.fecha || "") 
        : (c.fechaCierre || c.fecha || "");
      if (!targetDate) return false;
      const dateStr = targetDate.substring(0, 10); // "YYYY-MM-DD"
      return dateStr >= startDate && dateStr <= endDate;
    });
  }, [cierres, startDate, endDate, filterEnabled]);

  // Apply search term and sorting to cierres
  const finalFilteredCierres = useMemo(() => {
    let list = filteredCierres;
    if (cierresSearchTerm.trim() !== '') {
      const term = cierresSearchTerm.toLowerCase();
      list = list.filter(c => 
        (c.fechaCierre || c.fecha || '').toLowerCase().includes(term) ||
        (c.usuario || '').toLowerCase().includes(term) ||
        (c.terminal || '').toLowerCase().includes(term) ||
        (c.status || '').toLowerCase().includes(term)
      );
    }
    return [...list].sort((a, b) => {
      let va: any = (a as any)[cierresSortField];
      let vb: any = (b as any)[cierresSortField];

      if (cierresSortField === 'diffUsd') {
        const d1_expected = a.dineroEnCajaExpected ?? (a as any).expectedUsd ?? 0;
        const d1_real = a.realUsd ?? 0;
        va = d1_real - d1_expected;

        const d2_expected = b.dineroEnCajaExpected ?? (b as any).expectedUsd ?? 0;
        const d2_real = b.realUsd ?? 0;
        vb = d2_real - d2_expected;
      }
      
      if (cierresSortField === 'utilidadUsd') {
        const v1 = a.ventaTotalUsd ?? 0;
        va = a.utilidadUsd ?? (v1 - (a.costoTotalUsd ?? 0));

        const v2 = b.ventaTotalUsd ?? 0;
        vb = b.utilidadUsd ?? (v2 - (b.costoTotalUsd ?? 0));
      }

      if (typeof va === 'number' && typeof vb === 'number') {
        return cierresSortDir === 'asc' ? va - vb : vb - va;
      }
      return cierresSortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [filteredCierres, cierresSearchTerm, cierresSortField, cierresSortDir]);

  const totalUtilidadFiltered = useMemo(() => {
    return finalFilteredCierres.reduce((sum, c) => {
      const ventaTotalUsd = c.ventaTotalUsd ?? 0;
      const val = c.utilidadUsd ?? (ventaTotalUsd - (c.costoTotalUsd ?? 0));
      return sum + val;
    }, 0);
  }, [finalFilteredCierres]);

  // Escape key listener to close details modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCierre(null);
        setSelectedSale(null);
        setEditingCierre(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleDownloadCierresReport = () => {
    const title = "Historial de Cierres de Caja Conciliados";
    const dateStr = new Date().toLocaleString();
    const periodText = filterEnabled ? `Período: Desde ${startDate} Hasta ${endDate}` : "Todos los cierres registrados";

    const tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th>Fecha Cierre</th>
            <th>Cajero</th>
            <th class="text-right">Apertura USD / VES</th>
            <th class="text-right">Ventas Netas</th>
            <th class="text-right">Físico USD / VES</th>
            <th class="text-right">Diferencia USD</th>
            <th class="text-right">Utilidad USD</th>
          </tr>
        </thead>
        <tbody>
          ${filteredCierres.length === 0 ? `
            <tr><td colspan="7" style="text-align: center; color: #777;">Sin cierres conciliados en este rango de fechas.</td></tr>
          ` : filteredCierres.map(c => {
            const dineroEnCajaExpected = c.dineroEnCajaExpected ?? (c as any).expectedUsd ?? 0;
            const realUsd = c.realUsd ?? 0;
            const diffUsd = realUsd - dineroEnCajaExpected;
            const aperturaUsd = c.aperturaUsd ?? 0;
            const aperturaVes = c.aperturaVes ?? 0;
            const ventaTotalUsd = c.ventaTotalUsd ?? 0;
            const realVes = c.realVes ?? 0;
            const utilidadUsd = c.utilidadUsd ?? (ventaTotalUsd - (c.costoTotalUsd ?? 0));

            return `
              <tr>
                <td>${c.fechaCierre || c.fecha || 'N/A'}</td>
                <td style="text-transform: uppercase;">${c.usuario}</td>
                <td class="text-right">$${aperturaUsd.toFixed(2)} / Bs ${aperturaVes.toFixed(2)}</td>
                <td class="text-right">$${ventaTotalUsd.toFixed(2)}</td>
                <td class="text-right">$${realUsd.toFixed(2)} / Bs ${realVes.toFixed(2)}</td>
                <td class="text-right font-bold ${diffUsd >= 0 ? 'text-green' : 'text-red'}">$${diffUsd.toFixed(2)}</td>
                <td class="text-right font-bold text-emerald">$${utilidadUsd.toFixed(2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      <div class="report-summary">
        <p><strong>Cierres en Reporte:</strong> ${filteredCierres.length}</p>
        <p><strong>Total Ventas Netas:</strong> $${filteredCierres.reduce((acc, c) => acc + (c.ventaTotalUsd ?? 0), 0).toFixed(2)} USD</p>
        <p><strong>Total Utilidad Cierres:</strong> $${filteredCierres.reduce((acc, c) => acc + (c.utilidadUsd ?? 0), 0).toFixed(2)} USD</p>
      </div>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showAlert('No se pudo abrir la ventana de impresión. Por favor habilite los popups en su navegador.', 'Popups Bloqueados', 'warning');
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte PDF - ${title}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #333;
              margin: 30px;
              font-size: 11px;
            }
            .header {
              border-bottom: 2px solid #333;
              padding-bottom: 8px;
              margin-bottom: 15px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .header-left h1 {
              margin: 0 0 3px 0;
              font-size: 18px;
              color: #0f172a;
              letter-spacing: 0.5px;
            }
            .header-left p {
              margin: 0;
              color: #64748b;
              font-size: 10px;
            }
            .header-right {
              text-align: right;
              font-size: 9px;
              color: #64748b;
              line-height: 1.4;
            }
            h2 {
              font-size: 12px;
              text-transform: uppercase;
              color: #1e293b;
              margin-top: 0;
              margin-bottom: 12px;
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 4px;
              letter-spacing: 0.5px;
            }
            .report-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
            }
            .report-table th, .report-table td {
              border: 1px solid #94a3b8;
              padding: 6px 8px;
              text-align: left;
            }
            .report-table th {
              background-color: #f1f5f9;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 9px;
              color: #334155;
            }
            .text-right {
              text-align: right !important;
            }
            .font-bold {
              font-weight: bold;
            }
            .text-green {
              color: #16a34a !important;
            }
            .text-red {
              color: #dc2626 !important;
            }
            .text-emerald {
              color: #059669 !important;
            }
            .report-summary {
              margin-top: 20px;
              padding: 12px;
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 4px;
              width: fit-content;
              min-width: 250px;
            }
            .report-summary p {
              margin: 0 0 5px 0;
              font-size: 11px;
            }
            .report-summary p:last-child {
              margin-bottom: 0;
            }
            @media print {
              body { margin: 15px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-left">
              <h1>INVERSIONES NIQUITAO 3000 C.A.</h1>
              <p>RIF: J-41132631 | Telf: 0424-2042877</p>
              <p style="margin-top: 5px; font-weight: bold;">${periodText}</p>
            </div>
            <div class="header-right">
              <p><strong>Fecha Reporte:</strong> ${dateStr}</p>
              <p><strong>Módulo:</strong> Historial de Cierres</p>
            </div>
          </div>
          
          <h2>${title}</h2>
          ${tableHtml}
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() {
                window.close();
              }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadTransactionsReport = () => {
    const title = "Historial de Facturas y Ventas Registradas";
    const dateStr = new Date().toLocaleString();
    const periodText = filterEnabled ? `Período: Desde ${startDate} Hasta ${endDate}` : "Todas las facturas registradas";

    const tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Factura</th>
            <th>Cliente</th>
            <th>Cajero</th>
            <th class="text-right">Total USD</th>
            <th class="text-right">Total VES</th>
          </tr>
        </thead>
        <tbody>
          ${filteredSales.length === 0 ? `
            <tr><td colspan="6" style="text-align: center; color: #777;">Sin ventas registradas en este rango de fechas.</td></tr>
          ` : filteredSales.map(sale => `
            <tr>
              <td>${sale.fecha}</td>
              <td class="font-bold">${sale.factura_nro}</td>
              <td style="text-transform: uppercase;">${sale.client.nombre}</td>
              <td>${sale.usuario}</td>
              <td class="text-right font-bold text-emerald">$${(sale.totalUSD ?? 0).toFixed(2)}</td>
              <td class="text-right font-bold">Bs ${(sale.totalVES ?? 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="report-summary">
        <p><strong>Total Facturas:</strong> ${filteredSales.length}</p>
        <p><strong>Total Ventas Netas:</strong> $${filteredSales.reduce((acc, s) => acc + (s.totalUSD ?? 0), 0).toFixed(2)} USD</p>
      </div>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showAlert('No se pudo abrir la ventana de impresión. Por favor habilite los popups en su navegador.', 'Popups Bloqueados', 'warning');
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte PDF - ${title}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #333;
              margin: 30px;
              font-size: 11px;
            }
            .header {
              border-bottom: 2px solid #333;
              padding-bottom: 8px;
              margin-bottom: 15px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .header-left h1 {
              margin: 0 0 3px 0;
              font-size: 18px;
              color: #0f172a;
              letter-spacing: 0.5px;
            }
            .header-left p {
              margin: 0;
              color: #64748b;
              font-size: 10px;
            }
            .header-right {
              text-align: right;
              font-size: 9px;
              color: #64748b;
              line-height: 1.4;
            }
            h2 {
              font-size: 12px;
              text-transform: uppercase;
              color: #1e293b;
              margin-top: 0;
              margin-bottom: 12px;
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 4px;
              letter-spacing: 0.5px;
            }
            .report-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
            }
            .report-table th, .report-table td {
              border: 1px solid #94a3b8;
              padding: 6px 8px;
              text-align: left;
            }
            .report-table th {
              background-color: #f1f5f9;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 9px;
              color: #334155;
            }
            .text-right {
              text-align: right !important;
            }
            .font-bold {
              font-weight: bold;
            }
            .text-emerald {
              color: #059669 !important;
            }
            .report-summary {
              margin-top: 20px;
              padding: 12px;
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 4px;
              width: fit-content;
              min-width: 250px;
            }
            .report-summary p {
              margin: 0 0 5px 0;
              font-size: 11px;
            }
            @media print {
              body { margin: 15px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-left">
              <h1>INVERSIONES NIQUITAO 3000 C.A.</h1>
              <p>RIF: J-41132631 | Telf: 0424-2042877</p>
              <p style="margin-top: 5px; font-weight: bold;">${periodText}</p>
            </div>
            <div class="header-right">
              <p><strong>Fecha Reporte:</strong> ${dateStr}</p>
              <p><strong>Módulo:</strong> Historial de Transacciones</p>
            </div>
          </div>
          
          <h2>${title}</h2>
          ${tableHtml}
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() {
                window.close();
              }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 font-mono text-xs text-slate-800">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-winter-header tracking-wider flex items-center gap-2">
            <History className="w-5 h-5 text-winter-header" />
            HISTORIAL TRANSACCIONAL Y CIERRES
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Consulte las facturas emitidas y el histórico de cierres de caja conciliados.
          </p>
        </div>

        {/* SUB-TABS */}
        <div className="flex bg-slate-200 rounded-lg p-0.5 self-start border border-slate-300">
          <button
            onClick={() => setActiveSubTab('ventas')}
            className={`px-4 py-2 text-xs font-bold rounded-md font-sans transition-all ${
              activeSubTab === 'ventas'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Transacciones
          </button>
          <button
            onClick={() => setActiveSubTab('cierres')}
            className={`px-4 py-2 text-xs font-bold rounded-md font-sans transition-all ${
              activeSubTab === 'cierres'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Cierres de Caja
          </button>
        </div>
      </div>

      {/* SHARED DATE RANGE FILTER & PDF EXPORT BAR */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-4 flex flex-wrap items-center justify-between gap-2 shadow-sm font-sans">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <input
              type="checkbox"
              id="enable-date-filter"
              checked={filterEnabled}
              onChange={(e) => setFilterEnabled(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-winter-blueBtn focus:ring-winter-blueBtn"
            />
            <label htmlFor="enable-date-filter" className="font-bold text-slate-600 cursor-pointer">Filtrar por Rango:</label>
          </div>

          <div className="flex items-center gap-1.5 font-sans">
            <span className="text-slate-500">Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={!filterEnabled}
              className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs outline-none focus:border-winter-blueBtn text-slate-700 font-mono disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-1.5 font-sans">
            <span className="text-slate-500">Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={!filterEnabled}
              className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs outline-none focus:border-winter-blueBtn text-slate-700 font-mono disabled:opacity-50"
            />
          </div>
        </div>

        <button
          onClick={activeSubTab === 'cierres' ? handleDownloadCierresReport : handleDownloadTransactionsReport}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded text-[11px] transition-all shadow-sm flex items-center gap-1 font-sans"
          title="Generar y abrir reporte PDF de lo que ve en la tabla"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Reporte PDF</span>
        </button>
      </div>

      {activeSubTab === 'ventas' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-4 flex-grow">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-sans whitespace-nowrap">
                <ShoppingCart className="w-4 h-4 text-slate-450" />
                Facturas y Ventas Registradas
              </span>
              <div className="relative w-full max-w-xs">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar factura, cliente, operador..."
                  value={salesSearchTerm}
                  onChange={(e) => setSalesSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded pl-8 pr-2.5 py-1 text-[11px] text-slate-800 focus:outline-none focus:border-slate-500 font-sans shadow-sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-sans text-[10px]">
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-250">
                Facturas: <strong className="font-mono">{finalFilteredSales.length}</strong>
              </span>
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-250">
                Ventas Filtro: <strong className="font-mono text-winter-blueBtn">${filteredSalesTotals.totalVentas.toFixed(2)}</strong>
              </span>
              <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                Utilidad Filtro: <strong className="font-mono font-bold text-emerald-600">${filteredSalesTotals.totalUtilidad.toFixed(2)}</strong>
              </span>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 border-b border-slate-200">
                <tr className="text-slate-500">
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 font-bold font-sans cursor-pointer select-none" onClick={() => handleSalesSort('fecha')}>
                    <div className="flex items-center gap-1">
                      <span>FECHA</span>
                      <SalesSortIcon field="fecha" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 font-bold font-sans cursor-pointer select-none" onClick={() => handleSalesSort('factura_nro')}>
                    <div className="flex items-center gap-1">
                      <span>FACTURA</span>
                      <SalesSortIcon field="factura_nro" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 font-bold font-sans cursor-pointer select-none" onClick={() => handleSalesSort('cliente')}>
                    <div className="flex items-center gap-1">
                      <span>CLIENTE</span>
                      <SalesSortIcon field="cliente" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 font-bold font-sans cursor-pointer select-none" onClick={() => handleSalesSort('usuario')}>
                    <div className="flex items-center gap-1">
                      <span>OPERADOR</span>
                      <SalesSortIcon field="usuario" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 text-right font-bold font-sans cursor-pointer select-none" onClick={() => handleSalesSort('totalUSD')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>TOTAL USD</span>
                      <SalesSortIcon field="totalUSD" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 text-right font-bold font-sans cursor-pointer select-none" onClick={() => handleSalesSort('totalVES')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>TOTAL VES</span>
                      <SalesSortIcon field="totalVES" />
                    </div>
                  </th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 font-bold font-sans">MÉTODO PAGO</th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-4 py-1.5 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700 select-text">
                {finalFilteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-sans">
                      No se han procesado ventas que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  finalFilteredSales.map(sale => {
                    const isDev = sale.factura_nro.startsWith('DEV-');
                    return (
                      <tr key={sale.factura_nro} className={`hover:bg-slate-50/50 ${isDev ? 'bg-rose-50/20' : ''}`}>
                        <td className="px-4 py-1 font-mono">{sale.fecha}</td>
                        <td className={`px-4 py-1 font-bold font-mono ${isDev ? 'text-rose-700' : 'text-slate-600'}`}>
                          {sale.factura_nro}
                        </td>
                        <td className="px-4 py-1 font-sans font-medium">{sale.client.nombre}</td>
                        <td className="px-4 py-1 font-sans">
                          {sale.usuario}
                          {sale.terminal && (
                            <span className="ml-1.5 text-[8px] bg-slate-100 text-slate-500 border border-slate-200 px-1 py-0.2 rounded font-mono uppercase">
                              {sale.terminal.replace('CAJA_', 'C')}
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-1 text-right font-mono font-bold ${isDev ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {isDev ? '-' : ''}${Math.abs(sale.totalUSD ?? 0).toFixed(2)}
                        </td>
                        <td className={`px-4 py-1 text-right font-mono font-bold ${isDev ? 'text-rose-500' : 'text-slate-500'}`}>
                          {isDev ? '-' : ''}Bs {Math.abs(sale.totalVES ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-1 font-sans">
                          <div className="flex flex-wrap gap-1">
                            {(sale.pagos ?? []).map((p, idx) => (
                              <span key={idx} className={`border px-1.5 py-0.5 rounded text-[9px] ${
                                isDev 
                                  ? 'bg-rose-50 border-rose-200 text-rose-700' 
                                  : 'bg-slate-100 border-slate-200 text-slate-600'
                              }`}>
                                {p.metodo === 'Efectivo$' && isDev ? 'Reembolso $' : p.metodo}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-1 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedSale(sale)}
                              className={`border p-1.5 rounded transition-all shadow-sm flex items-center gap-1 text-[10px] ${
                                isDev 
                                  ? 'bg-rose-50 border-rose-200 text-rose-750 hover:bg-rose-100 hover:text-rose-800' 
                                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                              }`}
                              title={isDev ? 'Ver Detalle de Devolución' : 'Ver Detalle de Venta y Utilidad'}
                            >
                              <Eye className={`w-3.5 h-3.5 ${isDev ? 'text-rose-600' : 'text-winter-blueBtn'}`} />
                            </button>
                            {!isDev && (
                              <button
                                onClick={() => onReprintTicket(sale)}
                                className="bg-slate-100 border border-slate-200 text-slate-600 p-1.5 rounded hover:bg-slate-100 hover:text-slate-800 transition-all shadow-sm"
                                title="Reimprimir ticket fiscal"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'cierres' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[520px]">
          {/* LEFT COLUMN: Clean Cierres Table */}
          <div className="lg:col-span-9 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[520px]">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap justify-between items-center gap-3 flex-shrink-0">
              <div className="flex items-center gap-4 flex-grow">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-sans whitespace-nowrap">
                  <ShieldAlert className="w-4 h-4 text-winter-blueBtn" />
                  Historial de Cierres de Caja Ejecutados
                </span>
                <div className="relative w-full max-w-xs">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Buscar cierre, cajero, terminal..."
                    value={cierresSearchTerm}
                    onChange={(e) => setCierresSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded pl-8 pr-2.5 py-1 text-[11px] text-slate-800 focus:outline-none focus:border-winter-blueBtn font-sans shadow-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-emerald-50 text-emerald-700 font-extrabold px-2.5 py-1 rounded border border-emerald-200/60 font-sans">
                  Utilidad Total: <span className="font-mono text-emerald-800 text-xs">${totalUtilidadFiltered.toFixed(2)}</span>
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded border border-slate-300">
                  {finalFilteredCierres.length} cierres
                </span>
              </div>
            </div>

            <div className="flex-grow overflow-y-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 border-b border-slate-200">
                  <tr className="text-slate-500">
                    <th className="sticky top-0 z-10 bg-slate-100 px-3 py-2 text-center w-8 select-none">
                      <input
                        type="checkbox"
                        checked={finalFilteredCierres.length > 0 && selectedCierreIds.length === finalFilteredCierres.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCierreIds(finalFilteredCierres.map(c => c.id));
                          } else {
                            setSelectedCierreIds([]);
                          }
                        }}
                        className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                        title="Seleccionar todos los cierres"
                      />
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-3 py-2 font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('fechaApertura')}>
                      <div className="flex items-center gap-1">
                        <span>F. APERTURA</span>
                        <CierresSortIcon field="fechaApertura" />
                      </div>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-3 py-2 font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('fechaCierre')}>
                      <div className="flex items-center gap-1">
                        <span>F. CIERRE</span>
                        <CierresSortIcon field="fechaCierre" />
                      </div>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2 font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('usuario')}>
                      <div className="flex items-center gap-1">
                        <span>CAJERO / ESTACIÓN</span>
                        <CierresSortIcon field="usuario" />
                      </div>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2 text-right font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('aperturaUsd')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>APERTURA ($ / Bs)</span>
                        <CierresSortIcon field="aperturaUsd" />
                      </div>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2 text-right font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('ventaTotalUsd')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>VENTAS NETAS</span>
                        <CierresSortIcon field="ventaTotalUsd" />
                      </div>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2 text-right font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('realUsd')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>FÍSICO ($ / Bs)</span>
                        <CierresSortIcon field="realUsd" />
                      </div>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2 text-right font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('diffUsd')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>DIF. USD</span>
                        <CierresSortIcon field="diffUsd" />
                      </div>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-4 py-2 text-right font-bold font-sans text-emerald-600 cursor-pointer select-none" onClick={() => handleCierresSort('utilidadUsd')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>UTILIDAD</span>
                        <CierresSortIcon field="utilidadUsd" />
                      </div>
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-3 py-2 text-center font-bold font-sans cursor-pointer select-none" onClick={() => handleCierresSort('status')}>
                      <div className="flex items-center justify-center gap-1">
                        <span>ESTATUS</span>
                        <CierresSortIcon field="status" />
                      </div>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700 select-text">
                  {finalFilteredCierres.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-16 text-slate-400 font-sans">
                        No se han registrado cierres de caja que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    finalFilteredCierres.map(c => {
                      const dineroEnCajaExpected = c.dineroEnCajaExpected ?? (c as any).expectedUsd ?? 0;
                      const realUsd = c.realUsd ?? 0;
                      const realVes = c.realVes ?? 0;
                      const diffUsd = realUsd - dineroEnCajaExpected;
                      const aperturaUsd = c.aperturaUsd ?? 0;
                      const aperturaVes = c.aperturaVes ?? 0;
                      const ventaTotalUsd = c.ventaTotalUsd ?? 0;
                      let rowUtilidadUsd = typeof c.utilidadUsd === 'number' && c.utilidadUsd > 0 ? c.utilidadUsd : 0;
                      if (rowUtilidadUsd === 0 && sales && sales.length > 0) {
                        const cUser = c.usuario ? c.usuario.toLowerCase().trim() : '';
                        const fAperturaMs = c.fechaApertura ? new Date(c.fechaApertura).getTime() : 0;
                        const fCierreMs = (c.fechaCierre || c.fecha) ? new Date(c.fechaCierre || c.fecha).getTime() : Date.now();

                        const shiftSales = sales.filter(s => {
                          if (cUser && s.usuario && s.usuario.toLowerCase().trim() !== cUser) return false;
                          const sTime = new Date(s.fecha).getTime();
                          if (isNaN(sTime)) return true;
                          const startBoundary = fAperturaMs > 0 ? fAperturaMs - 120000 : 0;
                          const endBoundary = fCierreMs > 0 ? fCierreMs + 120000 : Date.now();
                          return sTime >= startBoundary && sTime <= endBoundary;
                        });

                        rowUtilidadUsd = shiftSales.reduce((acc, s) => {
                          const isDev = s.factura_nro?.startsWith('DEV-');
                          const mult = isDev ? -1 : 1;
                          const saleCost = (s.items || []).reduce((itemAcc, item) => {
                            let unitCost = 0;
                            if (typeof item.product?.precio_costo_usd === 'number' && item.product.precio_costo_usd > 0) unitCost = item.product.precio_costo_usd;
                            else if (typeof (item as any).precio_costo_usd === 'number' && (item as any).precio_costo_usd > 0) unitCost = (item as any).precio_costo_usd;
                            else if (typeof (item as any).costo_usd === 'number' && (item as any).costo_usd > 0) unitCost = (item as any).costo_usd;
                            
                            const qty = typeof item.qty === 'number' && !isNaN(item.qty) ? item.qty : (parseFloat(String(item.qty)) || 0);
                            return itemAcc + (unitCost * qty);
                          }, 0);
                          const saleNet = (s.totalUSD || 0) * mult;
                          return acc + (saleNet - (saleCost * mult));
                        }, 0);
                      }

                      const isSelected = selectedCierreRow?.id === c.id;
                      const isChecked = selectedCierreIds.includes(c.id);

                      return (
                        <tr 
                          key={c.id} 
                          onClick={() => setSelectedCierreRow(c)}
                          onDoubleClick={() => setSelectedCierre(c)}
                          className={`cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-blue-50/80 border-l-4 border-emerald-500 font-medium text-slate-900 shadow-sm' 
                              : isChecked
                                ? 'bg-emerald-50/50'
                                : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCierreIds(prev => [...prev, c.id]);
                                } else {
                                  setSelectedCierreIds(prev => prev.filter(id => id !== c.id));
                                }
                              }}
                              className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[10px] text-slate-700">{c.fechaApertura || c.fecha || 'N/A'}</td>
                          <td className="px-3 py-2.5 font-mono text-[10px]">
                            {c.status === 'Abierta' || !c.fechaCierre ? (
                              <span className="text-amber-700 font-bold text-[9px] bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-sans uppercase">-- EN CURSO --</span>
                            ) : (
                              <span className="text-slate-700">{c.fechaCierre}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-sans font-medium uppercase text-slate-800">
                            {c.usuario}
                            {c.terminal && (
                              <span className="ml-1.5 text-[8px] bg-slate-100 text-slate-500 border border-slate-200 px-1 py-0.2 rounded font-mono normal-case">
                                {c.terminal.replace('CAJA_', 'C')}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                            <div>${aperturaUsd.toFixed(2)}</div>
                            <div className="text-[9px] text-slate-400">Bs {aperturaVes.toFixed(2)}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold">${ventaTotalUsd.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-700 font-semibold">
                            <div>${realUsd.toFixed(2)}</div>
                            <div className="text-[9px] text-purple-650">Bs {realVes.toFixed(2)}</div>
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono font-bold ${diffUsd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${diffUsd.toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-emerald-600 font-extrabold">
                            ${rowUtilidadUsd.toFixed(2)}
                          </td>
                          <td className="px-3 py-2.5 text-center font-sans">
                            {c.status === 'Abierta' ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/70 px-2 py-0.5 rounded-full text-[9px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                ABIERTA
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full text-[9px] font-bold">
                                CERRADA
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT COLUMN: Operations & Actions Panel (Like Inventory) */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-[520px] font-sans">
            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Operaciones de Cierre
              </h3>

              {selectedCierreIds.length > 1 ? (
                <div className="space-y-3.5">
                  <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-xs space-y-2 shadow-inner">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-emerald-700 uppercase font-mono font-bold">SELECCIÓN MÚLTIPLE</span>
                      <span className="bg-emerald-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                        {selectedCierreIds.length} CIERRES
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Ha seleccionado <strong>{selectedCierreIds.length}</strong> cierres para reenviar automáticamente a WhatsApp junto con sus comprobantes digitalizados.
                    </p>
                    <button
                      onClick={() => setSelectedCierreIds([])}
                      className="text-[10px] text-slate-500 hover:text-slate-700 underline font-sans block pt-1"
                    >
                      Deseleccionar todos
                    </button>
                  </div>

                  <button
                    onClick={handleResendBatchWhatsApp}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-extrabold py-3 px-3 rounded-lg text-xs transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    REENVIAR SELECCIONADOS ({selectedCierreIds.length})
                  </button>
                </div>
              ) : selectedCierreRow ? (
                <div className="space-y-3.5">
                  {/* Selected Row Card */}
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs space-y-1.5 shadow-inner">
                    <div className="text-[9px] text-slate-400 uppercase font-mono font-bold">CIERRE SELECCIONADO</div>
                    <strong className="text-slate-800 font-bold block text-[13px]">{selectedCierreRow.fechaCierre || selectedCierreRow.fecha}</strong>
                    <div className="text-slate-600 text-[11px] font-medium uppercase">
                      Cajero: <span className="text-slate-900 font-bold">{selectedCierreRow.usuario}</span>
                      {selectedCierreRow.terminal && (
                        <span className="ml-1 text-[9px] bg-slate-200 text-slate-700 px-1 py-0.2 rounded font-mono">
                          {selectedCierreRow.terminal}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between border-t border-slate-200/80 pt-1.5 mt-1 font-mono text-[11px]">
                      <span>Venta Total:</span>
                      <strong className="text-emerald-700 font-bold">${(selectedCierreRow.ventaTotalUsd || 0).toFixed(2)}</strong>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    <button
                      onClick={() => setSelectedCierre(selectedCierreRow)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      VER DETALLES / COMPROBANTE
                    </button>

                    <button
                      onClick={() => handleResendWhatsAppCierre(selectedCierreRow)}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      <MessageCircle className="w-4 h-4" />
                      REENVIAR POR WHATSAPP
                    </button>

                    <button
                      onClick={() => setCierreInvoicesModal(selectedCierreRow)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      VER FACTURAS DEL CIERRE
                    </button>

                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleStartEditCierre(selectedCierreRow)}
                          className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-sm flex items-center justify-center gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          EDITAR / CORREGIR CIERRE
                        </button>

                        <button
                          onClick={async () => {
                            const confirmDelete = window.confirm('¿Está seguro de eliminar este cierre de caja de forma permanente? Esta acción no se puede deshacer.');
                            if (confirmDelete) {
                              const ok = await onDeleteCierre(selectedCierreRow.id);
                              if (ok) {
                                setSelectedCierreRow(null);
                                showAlert('Cierre de caja eliminado exitosamente.', 'Operación Completada', 'success');
                              } else {
                                showAlert('No se pudo eliminar el cierre de caja.', 'Error', 'error');
                              }
                            }
                          }}
                          className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold py-2.5 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-2"
                        >
                          <Trash2 className="w-4 h-4 text-rose-600" />
                          ELIMINAR CIERRE
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 p-6 rounded-xl text-center space-y-2.5 text-slate-400 my-auto">
                  <Eye className="w-8 h-8 mx-auto opacity-35" />
                  <p className="text-[11.5px] leading-relaxed font-sans font-medium text-slate-500">
                    Seleccione un cierre de la tabla para habilitar las opciones de auditoría y edición.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom PDF Download Action */}
            <div className="border-t border-slate-100 pt-3 mt-2">
              <button
                onClick={handleDownloadCierresReport}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <FileDown className="w-4 h-4" />
                REPORTE GENERAL EN PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL: COMPROBANTE DE CIERRE FISCAL */}
      {selectedCierre && (() => {
        const dineroEnCajaExpected = selectedCierre.dineroEnCajaExpected ?? (selectedCierre as any).expectedUsd ?? 0;
        const realUsd = selectedCierre.realUsd ?? 0;
        const diffUsd = realUsd - dineroEnCajaExpected;
        const aperturaUsd = selectedCierre.aperturaUsd ?? 0;
        const aperturaVes = selectedCierre.aperturaVes ?? 0;
        const ventasEfectivoUsd = selectedCierre.ventasEfectivoUsd ?? 0;
        const abonoClientesUsd = selectedCierre.abonoClientesUsd ?? (selectedCierre as any).abonosUsd ?? 0;
        const abonoClientesVes = selectedCierre.abonoClientesVes ?? (selectedCierre as any).abonosVes ?? 0;
        const entradaEfectivoUsd = selectedCierre.entradaEfectivoUsd ?? 0;
        const entradaEfectivoVes = selectedCierre.entradaEfectivoVes ?? 0;
        const salidaEfectivoUsd = selectedCierre.salidaEfectivoUsd ?? 0;
        const salidaEfectivoVes = selectedCierre.salidaEfectivoVes ?? 0;
        const devolucionEfectivoUsd = selectedCierre.devolucionEfectivoUsd ?? 0;
        const devolucionEfectivoVes = selectedCierre.devolucionEfectivoVes ?? 0;
        
        const ventasTotalesUsd = selectedCierre.ventasTotalesUsd ?? 0;
        const descuentosUsd = selectedCierre.descuentosUsd ?? 0;
        const ventaBrutaUsd = selectedCierre.ventaBrutaUsd ?? 0;
        
        const pagosEfectivoUsd = selectedCierre.pagosEfectivoUsd ?? 0;
        const pagosEfectivoBsVes = (selectedCierre as any).pagosEfectivoBsVes ?? 0;
        const pagosBiopagoVes = (selectedCierre as any).pagosBiopagoVes ?? 0;
        const pagosPuntoVes = (selectedCierre as any).pagosPuntoVes ?? 0;
        const pagosCreditoUsd = selectedCierre.pagosCreditoUsd ?? 0;
        const devolucionVentasUsd = selectedCierre.devolucionVentasUsd ?? 0;
        const devolucionVentasVes = selectedCierre.devolucionVentasVes ?? 0;
        const ventaTotalUsd = selectedCierre.ventaTotalUsd ?? 0;
        
        const realVes = Math.max(0, selectedCierre.realVes ?? 0);
        let expectedVes = Math.max(0, selectedCierre.expectedVes ?? 0);

        if (expectedVes === 0) {
          expectedVes = Math.max(0, aperturaVes + pagosEfectivoBsVes + abonoClientesVes + entradaEfectivoVes - salidaEfectivoVes - devolucionEfectivoVes);
        }
        const diffVes = realVes - expectedVes;

        const rawCosto = selectedCierre.costoTotalUsd;
        let costoTotalUsd = typeof rawCosto === 'number' && rawCosto > 0 ? rawCosto : 0;

        if (!costoTotalUsd && sales && sales.length > 0) {
          const cierreDateStr = selectedCierre.fecha ? selectedCierre.fecha.split(',')[0].trim() : '';
          const matchingSales = sales.filter(s => {
            const sDate = s.fecha ? s.fecha.split(',')[0].trim() : '';
            return sDate === cierreDateStr || s.fecha === selectedCierre.fecha;
          });

          costoTotalUsd = matchingSales.reduce((acc, sale) => {
            const isDev = sale.factura_nro?.startsWith('DEV-');
            const mult = isDev ? -1 : 1;
            return acc + (sale.items || []).reduce((itemAcc, item) => {
              const itemCost = item.product?.precio_costo_usd ?? (item as any).precio_costo_usd ?? (item as any).costo_usd ?? 0;
              const qty = typeof item.qty === 'number' ? item.qty : (parseFloat(String(item.qty)) || 0);
              return itemAcc + (itemCost * qty * mult);
            }, 0);
          }, 0);
        }

        let vueltosUsd = selectedCierre.vueltosEntregadosUsd ?? 0;
        let vueltosVes = selectedCierre.vueltosEntregadosVes ?? 0;

        if ((vueltosUsd === 0 || vueltosVes === 0) && sales && sales.length > 0) {
          const cUser = selectedCierre.usuario ? selectedCierre.usuario.toLowerCase().trim() : '';
          const fAperturaMs = selectedCierre.fechaApertura ? new Date(selectedCierre.fechaApertura).getTime() : 0;
          const fCierreMs = (selectedCierre.fechaCierre || selectedCierre.fecha) ? new Date(selectedCierre.fechaCierre || selectedCierre.fecha).getTime() : Date.now();

          const matchingShiftSales = sales.filter(s => {
            if (cUser && s.usuario && s.usuario.toLowerCase().trim() !== cUser) return false;
            const sTime = new Date(s.fecha).getTime();
            if (isNaN(sTime)) return true;
            const startBoundary = fAperturaMs > 0 ? fAperturaMs - 120000 : 0;
            const endBoundary = fCierreMs > 0 ? fCierreMs + 120000 : Date.now();
            return sTime >= startBoundary && sTime <= endBoundary;
          });

          if (vueltosUsd === 0) {
            vueltosUsd = matchingShiftSales.reduce((acc, sale) => {
              if (sale.factura_nro?.startsWith('DEV-')) return acc;
              if (typeof sale.vueltoUSD === 'number' && sale.vueltoUSD > 0) return acc + sale.vueltoUSD;
              const cashPayUsd = (sale.pagos || []).find(p => p.metodo === 'Efectivo$');
              const cashMonto = cashPayUsd ? (cashPayUsd.montoUSD || cashPayUsd.monto) : 0;
              const diff = cashMonto > sale.totalUSD ? (cashMonto - sale.totalUSD) : 0;
              return acc + diff;
            }, 0);
          }

          if (vueltosVes === 0) {
            vueltosVes = matchingShiftSales.reduce((acc, sale) => {
              if (sale.factura_nro?.startsWith('DEV-')) return acc;
              if (typeof sale.vueltoVES === 'number' && sale.vueltoVES > 0) return acc + sale.vueltoVES;
              if (typeof (sale as any).vuelto_ves === 'number' && (sale as any).vuelto_ves > 0) return acc + (sale as any).vuelto_ves;
              const cashPayVes = (sale.pagos || []).find(p => p.metodo === 'EfectivoBs');
              const cashMontoVes = cashPayVes ? (cashPayVes.montoVES || cashPayVes.montoBs || (cashPayVes.monto && cashPayVes.monto > 100 ? cashPayVes.monto : 0)) : 0;
              const diff = cashMontoVes > sale.totalVES ? (cashMontoVes - sale.totalVES) : 0;
              return acc + diff;
            }, 0);
          }
        }

        let subtotalNetoUsd = selectedCierre.ventaBrutaUsd ?? (selectedCierre as any).subtotalUsd ?? 0;
        if (!subtotalNetoUsd && sales && sales.length > 0) {
          const cierreDateStr = selectedCierre.fecha ? selectedCierre.fecha.split(',')[0].trim() : '';
          const matchingSales = sales.filter(s => {
            const sDate = s.fecha ? s.fecha.split(',')[0].trim() : '';
            return sDate === cierreDateStr || s.fecha === selectedCierre.fecha;
          });
          subtotalNetoUsd = matchingSales.reduce((acc, sale) => {
            if (sale.factura_nro?.startsWith('DEV-')) return acc;
            return acc + (sale.subtotal ?? sale.totalUSD);
          }, 0);
        }
        if (!subtotalNetoUsd) subtotalNetoUsd = ventaTotalUsd;
        const utilidadSubtotal = subtotalNetoUsd - costoTotalUsd;
        const utilidadUsd = selectedCierre.utilidadUsd && selectedCierre.costoTotalUsd ? selectedCierre.utilidadUsd : (ventaTotalUsd - costoTotalUsd);

        return (
          <div className="fixed inset-0 bg-slate-950/85 flex items-center justify-center p-4 z-50 font-mono text-slate-800 print:p-0">
            <div id="cierre-comprobante-card" className="bg-white border border-slate-300 rounded-xl overflow-hidden w-full max-w-4xl shadow-2xl flex flex-col opacity-100 select-text">
              
              {/* Blue Header Title Bar */}
              <div className="bg-winter-header text-white px-5 py-3 flex items-center justify-between">
                <h3 className="text-sm font-extrabold flex items-center gap-1.5 font-sans">
                  Cierre de Caja
                </h3>
                <button 
                  onClick={() => setSelectedCierre(null)} 
                  className="text-white opacity-70 hover:opacity-100 text-xs font-sans"
                >
                  ✕ Cerrar [ESC]
                </button>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-[13px] text-slate-700 leading-relaxed max-h-[75vh] overflow-y-auto bg-slate-50">
                
                {/* Left Column: Cash Drawer */}
                <div className="bg-white border border-slate-200 p-5 rounded-lg space-y-3 shadow-sm select-text">
                  <div>
                    <span className="text-slate-550 font-sans block text-[11px] font-bold uppercase">Usuario Cajero</span>
                    <strong className="text-slate-850 text-sm block uppercase truncate">
                      {selectedCierre.usuario}
                    </strong>
                  </div>

                  <div className="space-y-2 border-t border-slate-100 pt-2 font-mono">
                    <div className="flex justify-between">
                      <span>Apertura de Caja :</span>
                      <span className="font-bold text-slate-800">$ {aperturaUsd.toFixed(2)} / Bs {aperturaVes.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span>Ventas en Efectivo :</span>
                      <span className="font-bold text-slate-800">$ {ventasEfectivoUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Abono Clientes ($) :</span>
                      <span className="font-bold text-slate-800">$ {abonoClientesUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Abono Clientes (Bs) :</span>
                      <span className="font-bold text-slate-800">Bs {abonoClientesVes.toFixed(2)}</span>
                    </div>

                     <div className="flex justify-between">
                      <span>Entrada Efectivo ($) :</span>
                      <span className="font-bold text-slate-800">$ {entradaEfectivoUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Entrada Efectivo (Bs) :</span>
                      <span className="font-bold text-slate-800">Bs {entradaEfectivoVes.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-red-555 font-bold">
                      <span>Salida Efectivo ($) :</span>
                      <span>- $ {salidaEfectivoUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-red-555 font-bold">
                      <span>Salida Efectivo (Bs) :</span>
                      <span>- Bs {salidaEfectivoVes.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-red-555 font-bold">
                      <span>Devolución Efectivo ($) :</span>
                      <span>- $ {devolucionEfectivoUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-red-555 font-bold">
                      <span>Devolución Efectivo (Bs) :</span>
                      <span>- Bs {devolucionEfectivoVes.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-amber-700 font-bold">
                      <span>Vuelto Entregado ($) :</span>
                      <span>- $ {vueltosUsd.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-amber-700 font-bold">
                      <span>Vuelto Entregado (Bs) :</span>
                      <span>- Bs {vueltosVes.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-300 pt-2.5 space-y-0.5">
                    <div className="flex justify-between text-sm font-black text-slate-900 items-baseline">
                      <span className="font-sans uppercase text-[11px] font-extrabold text-slate-600">Dinero en Caja :</span>
                      <span className="text-xl text-winter-blueBtn font-mono font-black">
                        $ {dineroEnCajaExpected.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[8.5px] text-slate-450 italic mt-0.5 leading-tight font-medium uppercase tracking-tighter text-right font-mono">
                      {formatNumberToWordsUSD(dineroEnCajaExpected)}
                    </div>
                  </div>
                </div>

                {/* Right Column: Performance */}
                <div className="bg-white border border-slate-200 p-5 rounded-lg space-y-3 shadow-sm select-text flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="space-y-2 font-mono">
                      <div className="flex justify-between">
                        <span>Ventas Totales :</span>
                        <span className="font-bold text-slate-800">$ {ventasTotalesUsd.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Descuentos :</span>
                        <span className="font-bold text-slate-800">$ {descuentosUsd.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900 border-b border-dashed border-slate-200 pb-1.5">
                        <span className="font-sans text-[11px] font-bold text-slate-500 uppercase">Venta Bruta :</span>
                        <span>$ {ventaBrutaUsd.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1 font-mono text-[13px]">
                      <div className="flex justify-between">
                        <span>Efectivo $ :</span>
                        <span className="font-bold text-slate-800">$ {pagosEfectivoUsd.toFixed(2)}</span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span>Efectivo Bs :</span>
                        <span className="font-bold text-slate-800">Bs {pagosEfectivoBsVes.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between">
                        <span>Biopago :</span>
                        <span className="font-bold text-slate-800">Bs {pagosBiopagoVes.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between">
                        <span>Punto / Tarjeta :</span>
                        <span className="font-bold text-slate-800">Bs {pagosPuntoVes.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between">
                        <span>A Crédito :</span>
                        <span className="font-bold text-slate-800">$ {pagosCreditoUsd.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between text-red-550 font-bold">
                        <span>Devolución Ventas ($) :</span>
                        <span>- $ {devolucionVentasUsd.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between text-red-550 font-bold">
                        <span>Devolución Ventas (Bs) :</span>
                        <span>- Bs {devolucionVentasVes.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-300 pt-2 font-bold font-sans">
                      <div className="flex justify-between text-sm font-black text-slate-900 border-b border-dashed border-slate-200 pb-1.5 items-baseline">
                        <span className="uppercase text-[11px] font-extrabold text-slate-600">Venta Total :</span>
                        <span className="text-xl text-winter-blueBtn font-mono font-black">$ {ventaTotalUsd.toFixed(2)}</span>
                      </div>
                      <div className="text-[8.5px] text-slate-450 italic mt-0.5 leading-tight font-medium uppercase tracking-tighter text-right mb-2 font-mono">
                        {formatNumberToWordsUSD(ventaTotalUsd)}
                      </div>
                    </div>

                    {/* PROFITABILITY BREAKDOWN */}
                    <div className="pt-2.5 font-sans space-y-2 text-[11.5px] text-slate-700 bg-emerald-50/50 p-3 rounded border border-emerald-100 mt-2 select-text">
                      <div className="font-bold text-[10px] text-emerald-855 uppercase border-b border-emerald-200/60 pb-1">
                        CÁLCULO DE UTILIDAD DEL CIERRE
                      </div>
                      <div className="flex justify-between font-mono">
                        <span>Subtotal Ventas (sin IVA):</span>
                        <span className="font-bold text-slate-800">$ {(subtotalNetoUsd ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span>Costo de Mercancía:</span>
                        <span className="font-bold text-red-600">- $ {(costoTotalUsd ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-mono text-[12.5px] border-t border-emerald-300/80 pt-1 mt-1 font-extrabold text-emerald-700">
                        <span>UTILIDAD BRUTA (SUBTOTAL):</span>
                        <span className="text-base font-black">$ {(utilidadSubtotal ?? 0).toFixed(2)}</span>
                      </div>
                      {(ventaTotalUsd ?? 0) > (subtotalNetoUsd ?? 0) && (
                        <div className="flex justify-between text-slate-500 font-mono text-[9.5px] mt-0.5 italic pt-1 border-t border-dashed border-emerald-200">
                          <span>Total Facturado (con IVA):</span>
                          <span>$ {(ventaTotalUsd ?? 0).toFixed(2)} (Utilidad Neta: ${(utilidadUsd ?? 0).toFixed(2)})</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Reconciliation Comparison Footer */}
              <div className="bg-white border-t border-slate-200 p-5 space-y-4 font-sans text-sm">
                <div className="font-extrabold text-center text-slate-800 border-b border-slate-100 pb-2 uppercase text-sm tracking-wider">
                  DISCREPANCIAS EN ARQUEO FÍSICO
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {(() => {
                    const boxBgClass = diffUsd < -0.01 
                      ? 'bg-rose-50 border-rose-200 ring-2 ring-rose-500/10' 
                      : diffUsd > 0.01 
                        ? 'bg-emerald-50/70 border-emerald-200' 
                        : 'bg-slate-50 border-slate-200';
                    return (
                      <div className={`p-4 ${boxBgClass} border rounded-lg text-sm font-mono select-text space-y-1 transition-all`}>
                        <div className="text-slate-600 font-sans text-[12px] mb-1.5 font-bold uppercase tracking-wide">Dólares USD:</div>
                        <div className="flex justify-between"><span>Gaveta Esperado:</span> <span>${dineroEnCajaExpected.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Recibido Real:</span> <span className="text-emerald-700 font-bold">${realUsd.toFixed(2)}</span></div>
                        <div className="flex justify-between border-t border-dashed border-slate-300 pt-1.5 font-bold text-slate-800">
                          <span>Diferencia:</span>
                          <span className={diffUsd >= 0 ? 'text-emerald-600' : 'text-rose-600 font-black'}>
                            ${diffUsd.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {(() => {
                    const diffVes = realVes - expectedVes;
                    const boxBgClass = diffVes < -0.01 
                      ? 'bg-rose-50 border-rose-200 ring-2 ring-rose-500/10' 
                      : diffVes > 0.01 
                        ? 'bg-emerald-50/70 border-emerald-200' 
                        : 'bg-slate-50 border-slate-200';
                    return (
                      <div className={`p-4 ${boxBgClass} border rounded-lg text-sm font-mono select-text space-y-1 transition-all`}>
                        <div className="text-slate-600 font-sans text-[12px] mb-1.5 font-bold uppercase tracking-wide">Bolívares BS:</div>
                        <div className="flex justify-between"><span>Gaveta Esperado:</span> <span>Bs {expectedVes.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Recibido Real:</span> <span className="text-purple-755 font-bold">Bs {realVes.toFixed(2)}</span></div>
                        <div className="flex justify-between border-t border-dashed border-slate-300 pt-1.5 font-bold text-slate-800">
                          <span>Diferencia:</span>
                          <span className={diffVes >= 0 ? 'text-emerald-600' : 'text-rose-600 font-black'}>
                            Bs {diffVes.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleResendWhatsAppCierre(selectedCierre)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-extrabold py-3 px-4 rounded-lg font-sans text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    REENVIAR POR WHATSAPP
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCierre(null)}
                    className="sm:w-1/3 bg-slate-800 hover:bg-slate-900 text-white font-extrabold py-3 px-4 rounded-lg font-sans text-xs uppercase tracking-wider transition-all shadow-sm"
                  >
                    Cerrar Comprobante
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* SALE DETAIL MODAL */}
      {selectedSale && (() => {
        const isDev = selectedSale.factura_nro.startsWith('DEV-');
        
        // Extract numeric suffix (e.g., "FAC-000001" -> "000001")
        const saleNumSuffix = selectedSale.factura_nro.replace(/^[A-Z]+-?/, '');

        // Find return transactions affecting this invoice
        const relatedDevs = !isDev ? sales.filter(s => {
          if (!s.factura_nro.startsWith('DEV-')) return false;
          const devNumSuffix = s.factura_nro.replace(/^[A-Z]+-?/, '');
          
          return (
            (s as any).factura_afectada === selectedSale.factura_nro ||
            s.factura_nro === `DEV-${saleNumSuffix}` ||
            s.factura_nro === `DEV-${selectedSale.factura_nro}` ||
            s.factura_nro.includes(selectedSale.factura_nro) ||
            devNumSuffix === saleNumSuffix
          );
        }) : [];

        // Map returned quantities per product key (barcode and description)
        const returnedQtyMap: { [key: string]: number } = {};
        relatedDevs.forEach(devSale => {
          (devSale.items ?? []).forEach(devItem => {
            const barcodeKey = (devItem.product?.barcode || '').trim().toUpperCase();
            const descKey = (devItem.product?.description || '').trim().toUpperCase();
            if (barcodeKey) {
              returnedQtyMap[barcodeKey] = (returnedQtyMap[barcodeKey] || 0) + devItem.qty;
            }
            if (descKey) {
              returnedQtyMap[descKey] = (returnedQtyMap[descKey] || 0) + devItem.qty;
            }
          });
        });

        const safeNum = (v: any) => {
          if (v === null || v === undefined) return 0;
          if (typeof v === 'number') return isNaN(v) ? 0 : v;
          if (typeof v === 'string') {
            const p = parseFloat(v);
            return isNaN(p) ? 0 : p;
          }
          return 0;
        };

        let totalNetCost = 0;
        let totalNetSale = 0;
        let hasReturnsOnThisSale = relatedDevs.length > 0;

        const itemsWithProfit = (selectedSale.items ?? []).map(item => {
          const itemCost = safeNum(item.product?.precio_costo_usd ?? (item as any)?.precio_costo_usd ?? (item as any)?.costo_usd ?? 0);
          const rawQty = safeNum(item.qty ?? (item as any)?.cantidad ?? 0);
          const rawTotalUsd = safeNum(item.totalUSD ?? (item as any)?.total_fila_usd ?? 0);
          const unitPrice = safeNum(item.priceUSD ?? (item as any)?.precio_unitario_usd ?? 0) || (rawQty > 0 ? (rawTotalUsd / rawQty) : 0);
          
          const itemBarcode = (item.product?.barcode || (item as any)?.barcode || '').trim().toUpperCase();
          const itemDesc = (item.product?.description || (item as any)?.description || '').trim().toUpperCase();

          const returnedByBarcode = itemBarcode ? (returnedQtyMap[itemBarcode] || 0) : 0;
          const returnedByDesc = itemDesc ? (returnedQtyMap[itemDesc] || 0) : 0;

          const returnedQty = !isDev ? Math.min(rawQty, Math.max(returnedByBarcode, returnedByDesc, (item as any)?.returnedQty || 0)) : 0;
          const remainingQty = Math.max(0, rawQty - returnedQty);

          if (returnedQty > 0) {
            hasReturnsOnThisSale = true;
          }

          const activeQty = isDev ? rawQty : remainingQty;
          const activeItemCost = itemCost * activeQty;
          const activeItemSale = unitPrice * activeQty;
          const activeItemProfit = activeItemSale - activeItemCost;

          if (!isDev) {
            totalNetCost += activeItemCost;
            totalNetSale += activeItemSale;
          } else {
            totalNetCost += itemCost * rawQty;
            totalNetSale += rawTotalUsd || (unitPrice * rawQty);
          }

          return {
            ...item,
            product: item.product || { description: (item as any)?.descripcion || (item as any)?.description || 'Producto', barcode: (item as any)?.barcode || '' },
            cost: itemCost,
            unitPrice,
            qty: rawQty,
            returnedQty,
            remainingQty,
            activeItemCost,
            activeItemSale,
            activeItemProfit,
            isFullyReturned: !isDev && returnedQty > 0 && remainingQty === 0,
            isPartiallyReturned: !isDev && returnedQty > 0 && remainingQty > 0
          };
        });

        const subtotal = safeNum(isDev ? (selectedSale.subtotal ?? 0) : (hasReturnsOnThisSale ? totalNetSale : (selectedSale.subtotal ?? selectedSale.totalUSD ?? 0)));
        const descuento = safeNum(selectedSale.descuento);
        const iva = safeNum(selectedSale.iva);
        const totalUSD = safeNum(isDev ? (selectedSale.totalUSD ?? 0) : (hasReturnsOnThisSale ? totalNetSale : (selectedSale.totalUSD ?? 0)));
        const totalProfit = isDev ? 0 : (totalUSD - totalNetCost);
        const subtotalProfit = subtotal - totalNetCost;

        const formatItemQty = (qty: number, isBulk?: boolean) => {
          const safe = safeNum(qty);
          if (isBulk || (safe % 1 !== 0)) {
            return safe.toFixed(3);
          }
          return Math.round(safe).toString();
        };

        return (
          <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] font-mono text-slate-800 animate-fade-in">
            <div className="bg-white border border-slate-355 rounded-xl overflow-hidden w-full max-w-4xl shadow-2xl flex flex-col">
              
              {/* Header Title Bar */}
              <div className={`${isDev ? 'bg-rose-900' : 'bg-winter-header'} text-white px-5 py-3 flex items-center justify-between`}>
                <h3 className="text-sm font-extrabold flex items-center gap-1.5 font-sans">
                  <ShoppingCart className="w-4 h-4 text-winter-blueBtn" />
                  {isDev ? 'DETALLE DE DEVOLUCIÓN' : 'DETALLE DE FACTURA / VENTA'}
                </h3>
                <button 
                  onClick={() => setSelectedSale(null)} 
                  className="text-white opacity-70 hover:opacity-100 text-xs font-sans"
                >
                  ✕ Cerrar [ESC]
                </button>
              </div>

              <div className="p-6 text-[10px] text-slate-700 leading-relaxed max-h-[75vh] overflow-y-auto bg-slate-50 space-y-4">
                
                {/* Meta details row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white border border-slate-200 p-4 rounded-lg shadow-sm font-sans">
                  <div>
                    <span className="text-slate-450 block text-[9px] uppercase">{isDev ? 'Devolución Nro' : 'Factura Nro'}</span>
                    <strong className="text-slate-800 text-xs block font-mono font-extrabold">{selectedSale.factura_nro}</strong>
                  </div>
                  <div>
                    <span className="text-slate-450 block text-[9px] uppercase">Fecha y Hora</span>
                    <span className="font-bold text-slate-700 text-xs block font-mono">{selectedSale.fecha}</span>
                  </div>
                  <div>
                    <span className="text-slate-450 block text-[9px] uppercase">Cliente</span>
                    <strong className="text-slate-800 text-xs block font-mono truncate">{selectedSale.client?.nombre || 'PÚBLICO GENERAL'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-450 block text-[9px] uppercase">Operador / Cajero</span>
                    <strong className="text-slate-800 text-xs block font-mono uppercase truncate">{selectedSale.usuario}</strong>
                  </div>
                </div>

                {hasReturnsOnThisSale && !isDev && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs font-sans font-bold flex items-center gap-2 shadow-2xs">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>⚠️ Esta factura ha sido afectada por devoluciones. Los ítems devueltos están señalados y los montos netos y utilidad se han recalculado sobre los productos conservados.</span>
                  </div>
                )}

                {/* Items table */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-slate-100 text-slate-600 font-extrabold border-b border-slate-200 font-sans text-[10px] uppercase">
                      <tr>
                        <th className="px-4 py-2.5">Producto</th>
                        <th className="px-4 py-2.5 text-center">Cant</th>
                        <th className="px-4 py-2.5 text-right">Unit Venta</th>
                        <th className="px-4 py-2.5 text-right">Unit Costo</th>
                        <th className="px-4 py-2.5 text-right">Total Venta Neta</th>
                        {!isDev && <th className="px-4 py-2.5 text-right text-emerald-700">Utilidad Neta</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 font-mono">
                      {itemsWithProfit.map((item, idx) => (
                        <tr key={idx} className={item.isFullyReturned ? 'bg-rose-50/40 text-slate-400' : 'hover:bg-slate-50'}>
                          <td className="px-4 py-2.5 font-sans">
                            <span className={`font-bold block text-[12px] ${item.isFullyReturned ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                              {item.product?.description}
                            </span>
                            <span className="text-[9px] text-slate-400 block font-mono">{item.product?.barcode}</span>
                            {item.isFullyReturned && (
                              <span className="inline-block bg-rose-100 text-rose-700 text-[8.5px] font-bold px-1.5 py-0.5 rounded mt-0.5">
                                Devuelto Totalmente
                              </span>
                            )}
                            {item.isPartiallyReturned && (
                              <span className="inline-block bg-amber-100 text-amber-800 text-[8.5px] font-bold px-1.5 py-0.5 rounded mt-0.5">
                                {formatItemQty(item.returnedQty, item.product?.a_granel)} de {formatItemQty(item.qty, item.product?.a_granel)} Devuelto(s)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold">
                            {item.isPartiallyReturned ? (
                              <span>
                                <span className="line-through text-slate-400 font-normal mr-1">{formatItemQty(item.qty, item.product?.a_granel)}</span>
                                <span className="text-slate-900 font-extrabold">{formatItemQty(item.remainingQty, item.product?.a_granel)}</span>
                              </span>
                            ) : (
                              formatItemQty(item.qty, item.product?.a_granel)
                            )}
                          </td>

                          {/* UNIT PRICE */}
                          <td className={`px-4 py-2.5 text-right ${item.isFullyReturned ? 'line-through text-slate-400' : 'text-slate-600'}`}>
                            ${item.unitPrice.toFixed(2)}
                          </td>

                          {/* UNIT COST */}
                          <td className={`px-4 py-2.5 text-right ${item.isFullyReturned ? 'line-through text-slate-400' : 'text-slate-500'}`}>
                            ${item.cost.toFixed(2)}
                          </td>

                          {/* TOTAL VENTA NETA */}
                          <td className={`px-4 py-2.5 text-right font-bold ${
                            item.isFullyReturned ? 'line-through text-slate-400 font-normal' : isDev ? 'text-rose-600' : 'text-slate-900'
                          }`}>
                            {item.isFullyReturned ? '$0.00' : `${isDev ? '-' : ''}$${Math.abs(item.activeItemSale).toFixed(2)}`}
                          </td>

                          {/* PROFIT */}
                          {!isDev && (
                            <td className={`px-4 py-2.5 text-right font-bold ${
                              item.isFullyReturned ? 'line-through text-slate-400 font-normal' : item.activeItemProfit >= 0 ? 'text-emerald-600' : 'text-red-500'
                            }`}>
                              {item.isFullyReturned ? '$0.00' : `$${item.activeItemProfit.toFixed(2)}`}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals & Net Profit Breakdown Card */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Totals & Payments */}
                  <div className={`bg-white border border-slate-200 p-4 rounded-lg space-y-2 shadow-sm ${isDev ? 'md:col-span-2' : ''}`}>
                    <div className="font-bold text-[9px] text-slate-500 uppercase border-b border-slate-100 pb-1 font-sans flex justify-between">
                      <span>{isDev ? 'Montos y Reembolso' : 'Montos y Pagos'}</span>
                      {hasReturnsOnThisSale && <span className="text-rose-600 font-extrabold">(Recalculado por Devolución)</span>}
                    </div>
                    <div className="space-y-1.5 text-[11px] text-slate-700">
                      <div className="flex justify-between">
                        <span>{isDev ? 'Subtotal Devuelto:' : 'Subtotal USD Neto:'}</span>
                        <span className="font-bold">{isDev ? '-' : ''}$ {Math.abs(subtotal).toFixed(2)}</span>
                      </div>
                      {iva > 0 && (
                        <div className="flex justify-between text-slate-700">
                          <span>IVA (16%) USD:</span>
                          <span>$ {iva.toFixed(2)}</span>
                        </div>
                      )}
                      {descuento > 0 && (
                        <div className="flex justify-between text-red-550">
                          <span>Descuentos USD:</span>
                          <span>- $ {descuento.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-black text-slate-900 border-t border-dashed border-slate-200 pt-2 font-sans text-[13px] items-baseline">
                        <span>{isDev ? 'TOTAL REEMBOLSADO (USD):' : 'TOTAL FACTURADO NETO:'}</span>
                        <span className={`${isDev ? 'text-rose-600' : 'text-winter-blueBtn'} font-mono font-black text-[15px]`}>
                          {isDev ? '-' : ''}$ {Math.abs(totalUSD).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Profitability Panel */}
                  {!isDev && (
                    <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-lg space-y-3 shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="font-bold text-[9px] text-emerald-855 uppercase border-b border-emerald-250/60 pb-1 font-sans flex justify-between">
                          <span>Rentabilidad de la Venta</span>
                          {hasReturnsOnThisSale && <span className="text-emerald-700 font-extrabold">(Restantes)</span>}
                        </div>
                        <div className="space-y-2 pt-2 text-[11px] text-slate-700">
                          <div className="flex justify-between">
                            <span>Subtotal Venta (sin IVA):</span>
                            <span className="font-bold text-slate-800">$ {subtotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Costo Mercancía:</span>
                            <span className="font-bold text-red-600">- $ {totalNetCost.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-emerald-300 pt-2 font-bold font-sans">
                        <div className="flex justify-between text-emerald-800 font-extrabold items-baseline">
                          <span className="uppercase text-[10px] font-black">UTILIDAD BRUTA (SUBTOTAL):</span>
                          <span className="text-xl text-emerald-700 font-mono font-black">$ {subtotalProfit.toFixed(2)}</span>
                        </div>
                        {iva > 0 && (
                          <div className="flex justify-between text-slate-500 font-mono text-[9.5px] mt-1 italic pt-1 border-t border-dashed border-emerald-200">
                            <span>Total Facturado (con IVA $ {iva.toFixed(2)}):</span>
                            <span>$ {totalUSD.toFixed(2)} (Utilidad Neta: ${totalProfit.toFixed(2)})</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* EDIT CIERRE MODAL (ADMIN ONLY) */}
      {editingCierre && isAdmin && (() => {
        const handleSaveEditCierre = async (e: React.FormEvent) => {
          e.preventDefault();
          const newAperturaUsd = parseFloat(editAperturaUsd) || 0;
          const newAperturaVes = parseFloat(editAperturaVes) || 0;
          const newRealUsd = parseFloat(editRealUsd) || 0;
          const newRealVes = parseFloat(editRealVes) || 0;
          const newEntradaUsd = parseFloat(editEntradaUsd) || 0;
          const newEntradaVes = parseFloat(editEntradaVes) || 0;
          const newSalidaUsd = parseFloat(editSalidaUsd) || 0;
          const newSalidaVes = parseFloat(editSalidaVes) || 0;

          const oldAperturaUsd = editingCierre.aperturaUsd ?? 0;
          const oldEntradaUsd = editingCierre.entradaEfectivoUsd ?? 0;
          const oldSalidaUsd = editingCierre.salidaEfectivoUsd ?? 0;
          
          const oldExpectedUsd = editingCierre.dineroEnCajaExpected ?? (editingCierre as any).expectedUsd ?? 0;
          const newExpectedUsd = oldExpectedUsd - oldAperturaUsd - oldEntradaUsd + oldSalidaUsd + newAperturaUsd + newEntradaUsd - newSalidaUsd;
          
          const oldAperturaVes = editingCierre.aperturaVes ?? 0;
          const oldEntradaVes = editingCierre.entradaEfectivoVes ?? 0;
          const oldSalidaVes = editingCierre.salidaEfectivoVes ?? 0;
          const oldExpectedVes = editingCierre.expectedVes ?? 0;
          const newExpectedVes = oldExpectedVes - oldAperturaVes - oldEntradaVes + oldSalidaVes + newAperturaVes + newEntradaVes - newSalidaVes;

          const updatedCierre = {
            ...editingCierre,
            aperturaUsd: newAperturaUsd,
            aperturaVes: newAperturaVes,
            realUsd: newRealUsd,
            realVes: newRealVes,
            entradaEfectivoUsd: newEntradaUsd,
            entradaEfectivoVes: newEntradaVes,
            salidaEfectivoUsd: newSalidaUsd,
            salidaEfectivoVes: newSalidaVes,
            dineroEnCajaExpected: newExpectedUsd,
            expectedUsd: newExpectedUsd,
            expectedVes: newExpectedVes
          };

          const success = await onUpdateCierre(editingCierre.id, updatedCierre);
          if (success) {
            showAlert('Cierre de caja corregido y guardado exitosamente por el administrador.', 'Cierre Actualizado', 'success');
            setEditingCierre(null);
          } else {
            showAlert('Ocurrió un error al guardar la actualización del cierre en el servidor.', 'Error al Guardar', 'error');
          }
        };

        return (
          <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-slate-800">
            <div className="bg-white border border-amber-300 rounded-xl overflow-hidden w-full max-w-md shadow-2xl flex flex-col">
              
              {/* Header Title Bar */}
              <div className="bg-amber-600 text-white px-5 py-3.5 flex items-center justify-between">
                <h3 className="text-sm font-extrabold flex items-center gap-1.5 font-sans uppercase">
                  <ShieldAlert className="w-4 h-4 text-white" />
                  CORREGIR REGISTRO DE CIERRE (ADMIN)
                </h3>
                <button 
                  onClick={() => setEditingCierre(null)} 
                  className="text-white opacity-70 hover:opacity-100 text-xs font-sans"
                >
                  ✕ Cancelar
                </button>
              </div>

              <form onSubmit={handleSaveEditCierre} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto bg-slate-50 text-xs">
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded text-[10px] leading-relaxed font-sans font-medium">
                  ⚠️ ADVERTENCIA: Esta herramienta administrativa permite sobrescribir los valores inmutables reportados originalmente para auditar discrepancias. Úsela con responsabilidad.
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">APERTURA USD ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editAperturaUsd}
                      onChange={(e) => setEditAperturaUsd(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">APERTURA VES (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editAperturaVes}
                      onChange={(e) => setEditAperturaVes(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">EFECTIVO USD FISICO ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editRealUsd}
                      onChange={(e) => setEditRealUsd(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-emerald-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">EFECTIVO VES FISICO (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editRealVes}
                      onChange={(e) => setEditRealVes(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-purple-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">ENTRADAS EFECTIVO ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editEntradaUsd}
                      onChange={(e) => setEditEntradaUsd(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">SALIDAS EFECTIVO ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editSalidaUsd}
                      onChange={(e) => setEditSalidaUsd(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-red-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">ENTRADAS EFECTIVO (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editEntradaVes}
                      onChange={(e) => setEditEntradaVes(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-sans font-bold">SALIDAS EFECTIVO (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editSalidaVes}
                      onChange={(e) => setEditSalidaVes(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-bold font-mono text-red-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingCierre(null)}
                    className="w-1/2 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-lg font-bold font-sans text-xs transition-all"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-lg font-bold font-sans text-xs tracking-wider transition-all shadow"
                  >
                    GUARDAR CAMBIOS
                  </button>
                </div>
              </form>

            </div>
          </div>
        );
      })()}

      {/* ON-SCREEN CAPTURE MODAL FOR GUARANTEED 100% VISIBLE WHATSAPP PNG ATTACHMENTS */}
      {capturingCierre && (() => {
        const c = capturingCierre;
        const expectedUsd = c.dineroEnCajaExpected ?? (c as any).expectedUsd ?? 0;
        const expectedVes = c.expectedVes ?? 0;
        const realUsd = c.realUsd ?? 0;
        const realVes = c.realVes ?? 0;
        const diffUsd = realUsd - expectedUsd;
        const diffVes = realVes - expectedVes;
        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-[99999] p-4">
            <div id="cierre-capture-card" className="bg-white border-2 border-slate-300 rounded-xl overflow-hidden w-full max-w-xl shadow-2xl space-y-4 text-slate-800 font-sans p-6 opacity-100 select-text">
              <div className="bg-winter-header text-white px-5 py-3 flex justify-between items-center rounded-t-lg -mx-6 -mt-6 mb-4">
                <div>
                  <h3 className="font-extrabold text-sm uppercase tracking-wide">Cierre y Conciliación de Caja</h3>
                  <p className="text-[10px] opacity-85 font-sans">Comprobante Digital POS</p>
                </div>
                <span className="text-xs font-mono font-bold">{c.fechaCierre || c.fecha || new Date().toLocaleDateString('es-VE')}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase font-sans">Cajero</span>
                  <strong className="text-slate-900 text-sm uppercase font-mono">{c.usuario || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase font-sans">Terminal / Estación</span>
                  <strong className="text-slate-900 text-sm uppercase font-mono">{c.terminal || 'LOCAL'}</strong>
                </div>
              </div>

              <div className="space-y-2 font-mono text-xs border-b border-slate-200 pb-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">Efectivo Esperado ($):</span>
                  <span className="font-bold text-slate-800">$ {expectedUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Efectivo Esperado (Bs):</span>
                  <span className="font-bold text-slate-800">Bs {expectedVes.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-extrabold">
                  <span>Efectivo Físico Recibido ($):</span>
                  <span>$ {realUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-extrabold">
                  <span>Efectivo Físico Recibido (Bs):</span>
                  <span>Bs {realVes.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 font-black text-sm">
                  <span>Diferencia Balance:</span>
                  <span className={diffUsd >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                    {diffUsd >= 0 ? '+' : ''}$ {diffUsd.toFixed(2)} / {diffVes >= 0 ? '+' : ''}Bs {diffVes.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs pt-1 font-sans">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Ventas Totales</span>
                  <strong className="text-emerald-700 text-base font-extrabold font-mono">$ {(c.ventaTotalUsd ?? 0).toFixed(2)} USD</strong>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Descuentos</span>
                  <strong className="text-rose-600 text-base font-extrabold font-mono">$ {(c.descuentosUsd ?? 0).toFixed(2)} USD</strong>
                </div>
              </div>

              <div className="text-center text-[10px] text-slate-400 italic pt-2 border-t border-slate-200 font-mono">
                WinterPosAL Cloud System • Comprobante Digital de Auditoría
              </div>
            </div>
          </div>
        );
      })()}

      {/* DETALLES DE FACTURAS DE ESTE CIERRE DE CAJA */}
      {cierreInvoicesModal && (() => {
        const c = cierreInvoicesModal;
        const fAperturaMs = c.fechaApertura ? new Date(c.fechaApertura).getTime() : 0;
        const fCierreMs = (c.fechaCierre || c.fecha) ? new Date(c.fechaCierre || c.fecha).getTime() : Date.now();

        const shiftInvoices = sales.filter(s => {
          if (c.usuario && s.usuario) {
            const uCierre = c.usuario.toLowerCase().trim();
            const uSale = s.usuario.toLowerCase().trim();
            if (uCierre !== uSale && c.usuarioId && s.usuario_id && String(c.usuarioId) !== String(s.usuario_id)) {
              return false;
            }
          }
          const sTime = new Date(s.fecha).getTime();
          if (isNaN(sTime)) return true;
          const startBoundary = fAperturaMs > 0 ? fAperturaMs - 120000 : 0;
          const endBoundary = fCierreMs > 0 ? fCierreMs + 120000 : Date.now();
          return sTime >= startBoundary && sTime <= endBoundary;
        });

        const q = cierreInvoiceSearch.toLowerCase().trim();
        const filteredInvoices = !q ? shiftInvoices : shiftInvoices.filter(s =>
          s.factura_nro?.toLowerCase().includes(q) ||
          s.client?.nombre?.toLowerCase().includes(q) ||
          s.client?.cedula_rif?.toLowerCase().includes(q) ||
          s.usuario?.toLowerCase().includes(q) ||
          (s.pagos || []).some(p => p.metodo?.toLowerCase().includes(q))
        );

        const totalNetoUSD = shiftInvoices.reduce((acc, s) => s.factura_nro.startsWith('DEV-') ? acc - Math.abs(s.totalUSD) : acc + s.totalUSD, 0);
        const totalNetoVES = shiftInvoices.reduce((acc, s) => s.factura_nro.startsWith('DEV-') ? acc - Math.abs(s.totalVES) : acc + s.totalVES, 0);

        const calculatedUtilidad = shiftInvoices.reduce((acc, s) => {
          const isDev = s.factura_nro?.startsWith('DEV-');
          const mult = isDev ? -1 : 1;
          const saleCost = (s.items || []).reduce((itemAcc, item) => {
            let unitCost = 0;
            if (typeof item.product?.precio_costo_usd === 'number' && item.product.precio_costo_usd > 0) unitCost = item.product.precio_costo_usd;
            else if (typeof (item as any).precio_costo_usd === 'number' && (item as any).precio_costo_usd > 0) unitCost = (item as any).precio_costo_usd;
            else if (typeof (item as any).costo_usd === 'number' && (item as any).costo_usd > 0) unitCost = (item as any).costo_usd;
            
            const qty = typeof item.qty === 'number' && !isNaN(item.qty) ? item.qty : (parseFloat(String(item.qty)) || 0);
            return itemAcc + (unitCost * qty);
          }, 0);
          const saleNet = (s.totalUSD || 0) * mult;
          return acc + (saleNet - (saleCost * mult));
        }, 0);

        const finalUtilidad = typeof c.utilidadUsd === 'number' && c.utilidadUsd !== 0 ? c.utilidadUsd : calculatedUtilidad;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-[96vw] max-w-[96vw] overflow-hidden flex flex-col max-h-[92vh]">
              
              {/* Modal Header */}
              <div className="bg-winter-header text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl">
                    <ShoppingCart className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold font-sans flex items-center gap-2">
                      Facturas y Transacciones del Cierre - {c.usuario}
                      {c.terminal && (
                        <span className="text-[10px] bg-white/20 text-white font-mono px-2 py-0.5 rounded-full font-normal">
                          {c.terminal}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs opacity-80 font-mono">
                      Apertura: {c.fechaApertura || 'N/A'} | Cierre: {c.fechaCierre || c.fecha}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => { setCierreInvoicesModal(null); setCierreInvoiceSearch(''); }}
                  className="text-white opacity-75 hover:opacity-100 text-xs font-sans bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-all"
                >
                  ✕ Cerrar [ESC]
                </button>
              </div>

              {/* Metrics & Search Bar */}
              <div className="bg-slate-50 border-b border-slate-200 p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-2xs">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Facturas</span>
                    <strong className="text-slate-800 text-lg font-mono font-black">{shiftInvoices.length}</strong>
                  </div>
                  <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-2xs">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Facturación Neta ($)</span>
                    <strong className="text-emerald-700 text-lg font-mono font-black">
                      ${totalNetoUSD.toFixed(2)}
                    </strong>
                  </div>
                  <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-2xs">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Facturación Neta (Bs)</span>
                    <strong className="text-indigo-700 text-lg font-mono font-black">
                      Bs {totalNetoVES.toFixed(2)}
                    </strong>
                  </div>
                  <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-2xs">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Utilidad del Cierre</span>
                    <strong className="text-emerald-600 text-lg font-mono font-black">
                      ${finalUtilidad.toFixed(2)}
                    </strong>
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por N° factura, cliente, cédula, operador o método de pago..."
                    value={cierreInvoiceSearch}
                    onChange={(e) => setCierreInvoiceSearch(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs font-sans text-slate-800 placeholder-slate-400 focus:outline-none focus:border-winter-blueBtn shadow-2xs"
                  />
                </div>
              </div>

              {/* Invoices List Table */}
              <div className="overflow-y-auto flex-1 p-4 bg-slate-100/50">
                {filteredInvoices.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-200 text-slate-400 space-y-2">
                    <ShoppingCart className="w-8 h-8 mx-auto opacity-30" />
                    <p className="text-xs font-sans font-medium">No se encontraron facturas o transacciones registradas para este cierre.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">Fecha / Hora</th>
                          <th className="px-4 py-3">Factura N°</th>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Operador</th>
                          <th className="px-4 py-3 text-right">Total USD</th>
                          <th className="px-4 py-3 text-right">Total VES</th>
                          <th className="px-4 py-3">Métodos de Pago</th>
                          <th className="px-4 py-3 text-center">Gestiones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 font-mono">
                        {filteredInvoices.map((sale) => {
                          const isDev = sale.factura_nro?.startsWith('DEV-');
                          return (
                            <tr key={sale.id} className={isDev ? 'bg-rose-50/50 hover:bg-rose-50' : 'hover:bg-slate-50'}>
                              <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap text-[11px]">
                                {sale.fecha}
                              </td>
                              <td className="px-4 py-2.5 font-bold">
                                <span className={`px-2 py-0.5 rounded text-[10.5px] font-mono font-bold ${
                                  isDev ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-blue-50 text-blue-800 border border-blue-200'
                                }`}>
                                  {sale.factura_nro}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-sans font-medium text-slate-800 max-w-[160px] truncate">
                                {sale.client?.nombre || 'PÚBLICO GENERAL'}
                                {sale.client?.cedula_rif && (
                                  <span className="text-[10px] text-slate-400 block font-mono font-normal">
                                    {sale.client.cedula_rif}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-sans uppercase text-slate-600 text-[11px]">
                                {sale.usuario}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-bold ${isDev ? 'text-rose-600' : 'text-slate-900'}`}>
                                {isDev ? '-' : ''}$ {Math.abs(sale.totalUSD).toFixed(2)}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-bold ${isDev ? 'text-rose-600' : 'text-slate-700'}`}>
                                {isDev ? '-' : ''}Bs {Math.abs(sale.totalVES).toFixed(2)}
                              </td>
                              <td className="px-4 py-2.5 font-sans">
                                <div className="flex flex-wrap gap-1">
                                  {(sale.pagos || []).map((p, pIdx) => (
                                    <span key={pIdx} className="text-[9.5px] bg-slate-100 border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                                      {p.metodo}: ${p.monto.toFixed(2)}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => setSelectedSale(sale)}
                                    title="Ver detalles e ítems de esta factura"
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-1.5 rounded transition-all"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => onReprintTicket(sale)}
                                    title="Reimprimir ticket de factura"
                                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 p-1.5 rounded transition-all"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          </div>
        );
      })()}

      {/* SENDING PROGRESS OVERLAY */}
      {sendingProgressMsg && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-[100000] p-4">
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-2xl text-center space-y-3 max-w-sm w-full font-sans">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <h4 className="font-extrabold text-slate-800 text-sm uppercase">Reenviando por WhatsApp</h4>
            <p className="text-xs text-slate-600 font-mono leading-relaxed">{sendingProgressMsg}</p>
          </div>
        </div>
      )}

    </div>
  );
}
