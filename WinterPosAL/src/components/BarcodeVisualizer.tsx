import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';
import { Printer, Download, FileText, Barcode as BarcodeIcon, Sparkles } from 'lucide-react';

interface BarcodeVisualizerProps {
  value: string;
  description?: string;
  priceUSD?: number | string;
  priceVES?: number | string;
  companyName?: string;
  compact?: boolean;
}

export const BarcodeVisualizer: React.FC<BarcodeVisualizerProps> = ({
  value,
  description = '',
  compact = false,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hasError, setHasError] = useState(false);
  const [labelQty, setLabelQty] = useState<number>(12);
  const [showPdfModal, setShowPdfModal] = useState(false);

  const cleanValue = (value || '').trim().toUpperCase();

  // Render Barcode dynamically whenever value changes
  useEffect(() => {
    if (!svgRef.current) return;
    if (!cleanValue) {
      setHasError(false);
      return;
    }

    try {
      JsBarcode(svgRef.current, cleanValue, {
        format: 'CODE128',
        width: 1.6,
        height: compact ? 26 : 32,
        displayValue: true,
        font: 'monospace',
        fontSize: 11,
        fontOptions: 'bold',
        textMargin: 1,
        margin: 2,
        background: '#ffffff',
        lineColor: '#0f172a',
      });
      setHasError(false);
    } catch (err) {
      console.warn('JsBarcode render warning:', err);
      setHasError(true);
    }
  }, [cleanValue, compact]);

  // Descargar código de barras como imagen PNG
  const handleDownloadPNG = () => {
    if (!svgRef.current || !cleanValue) return;
    try {
      const svgElement = svgRef.current;
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngFile = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.download = `Barcode_${cleanValue}.png`;
          downloadLink.href = pngFile;
          downloadLink.click();
        }
      };

      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (err) {
      console.error('Error al descargar código PNG:', err);
    }
  };

  // Imprimir Etiqueta Térmica / Tikera (58mm o 80mm) - Solo Descripción y Código de Barras con su número
  const handlePrintThermalLabel = () => {
    if (!cleanValue) return;
    try {
      const svgElement = svgRef.current;
      const svgHtml = svgElement ? svgElement.outerHTML : '';

      const printWindow = window.open('', '_blank', 'width=400,height=480');
      if (!printWindow) return;

      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Etiqueta - ${cleanValue}</title>
          <style>
            @page {
              margin: 0;
              size: auto;
            }
            body {
              margin: 0;
              padding: 6px 8px;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #000;
              width: 58mm;
              text-align: center;
              box-sizing: border-box;
            }
            .desc {
              font-size: 11px;
              font-weight: 900;
              text-transform: uppercase;
              line-height: 1.2;
              max-height: 2.4em;
              overflow: hidden;
              margin-bottom: 2px;
            }
            .barcode-svg {
              display: flex;
              justify-content: center;
              margin: 0 auto;
            }
            .barcode-svg svg {
              max-width: 100%;
              height: auto;
            }
            @media print {
              body { width: 100%; }
            }
          </style>
        </head>
        <body>
          <div class="desc">${description || 'PRODUCTO'}</div>
          <div class="barcode-svg">
            ${svgHtml}
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(printContent);
      printWindow.document.close();
    } catch (err) {
      console.error('Error al imprimir etiqueta térmica:', err);
    }
  };

  // Generar Hoja de Etiquetas en PDF (Cuadrícula de 6, 12, 18, 24 etiquetas)
  const handleGeneratePdfSheet = (qty: number) => {
    if (!svgRef.current || !cleanValue) return;

    try {
      const svgElement = svgRef.current;
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const barcodePngData = canvas.toDataURL('image/png');

        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'letter',
        });

        const pageWidth = 215.9;
        const pageHeight = 279.4;
        const marginX = 10;
        const marginY = 12;

        const cols = 3;
        const rows = Math.min(Math.ceil(qty / cols), 8);
        const labelWidth = (pageWidth - marginX * 2 - (cols - 1) * 6) / cols; // ~60mm
        const labelHeight = (pageHeight - marginY * 2 - (rows - 1) * 4) / rows; // ~28mm

        let count = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (count >= qty) break;

            const x = marginX + c * (labelWidth + 6);
            const y = marginY + r * (labelHeight + 4);

            // Borde suave de etiqueta
            doc.setDrawColor(203, 213, 225);
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(x, y, labelWidth, labelHeight, 2, 2, 'FD');

            // Descripción Producto
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            const descTrunc = (description || 'PRODUCTO').toUpperCase();
            const splitDesc = doc.splitTextToSize(descTrunc, labelWidth - 4);
            doc.text(splitDesc[0] || '', x + labelWidth / 2, y + 5.5, { align: 'center' });

            // Imagen del Código de Barras (incluye el número abajo)
            const imgWidth = labelWidth - 6;
            const imgHeight = labelHeight - 8.5;
            const imgY = y + 7;
            doc.addImage(barcodePngData, 'PNG', x + 3, imgY, imgWidth, imgHeight);

            count++;
          }
        }

        const pdfBlob = doc.output('blob');
        const blobUrl = URL.createObjectURL(pdfBlob);
        window.open(blobUrl, '_blank');
        setShowPdfModal(false);
      };

      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (err) {
      console.error('Error generando hoja PDF de etiquetas:', err);
    }
  };

  if (!cleanValue) {
    return (
      <div className="bg-slate-50/80 border border-dashed border-slate-300 rounded-xl p-2 text-center flex items-center justify-center gap-2 min-h-[42px] text-slate-400">
        <BarcodeIcon className="w-4 h-4 text-slate-300 shrink-0" />
        <span className="text-[10px] font-sans font-semibold">
          Escriba el código del producto para generar la vista previa escaneable
        </span>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 shadow-xs flex flex-col items-center gap-2 transition-all">
      {/* Box de Vista Previa con Descripción y Código */}
      <div className="w-full flex flex-col items-center justify-center bg-white rounded-lg p-2 border border-slate-200/80 shadow-2xs overflow-hidden">
        {description && (
          <div className="text-[11px] font-black uppercase text-slate-800 tracking-wide text-center truncate max-w-full mb-0.5">
            {description}
          </div>
        )}
        {hasError ? (
          <div className="text-red-500 text-xs font-mono font-bold py-1.5 text-center">
            ⚠️ Caracteres no soportados para código de barras
          </div>
        ) : (
          <div className="flex justify-center max-w-full overflow-x-auto py-0.5">
            <svg ref={svgRef} className="max-w-full h-auto drop-shadow-2xs" />
          </div>
        )}
      </div>

      {/* Botonera de Acciones Lineal de 3 Botones */}
      <div className="w-full grid grid-cols-3 gap-1.5 pt-0.5 text-xs">
        <button
          type="button"
          onClick={handleDownloadPNG}
          className="w-full px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-lg transition-all flex items-center justify-center gap-1 text-[10.5px] cursor-pointer shadow-2xs"
          title="Descargar imagen PNG del código de barras"
        >
          <Download className="w-3 h-3 text-slate-500" />
          <span>Guardar PNG</span>
        </button>

        <button
          type="button"
          onClick={() => setShowPdfModal(true)}
          className="w-full px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-lg transition-all flex items-center justify-center gap-1 text-[10.5px] cursor-pointer shadow-2xs"
          title="Generar hoja de etiquetas en PDF para imprimir después"
        >
          <FileText className="w-3 h-3 text-indigo-600" />
          <span>Hoja PDF</span>
        </button>

        <button
          type="button"
          onClick={handlePrintThermalLabel}
          className="w-full px-2 py-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-lg transition-all shadow-2xs active:scale-95 flex items-center justify-center gap-1 text-[10.5px] cursor-pointer"
          title="Imprimir etiqueta en Tikera / Impresora Térmica"
        >
          <Printer className="w-3 h-3 text-slate-950" />
          <span>Imprimir</span>
        </button>
      </div>

      {/* Modal / Selector de Cantidad de Etiquetas para Hoja PDF */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-2xs z-[100] flex items-center justify-center p-3">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-4 max-w-xs w-full space-y-3 font-sans animate-fade-in">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5 uppercase">
                <FileText className="w-4 h-4 text-indigo-600" />
                Hoja de Etiquetas PDF
              </h4>
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-slate-600">
              Seleccione la cantidad de etiquetas que desea generar en la hoja para <strong>{cleanValue}</strong>:
            </p>

            <div className="grid grid-cols-4 gap-1.5 font-mono text-xs">
              {[6, 12, 18, 24].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setLabelQty(q)}
                  className={`py-1.5 rounded-lg font-bold border transition-all ${
                    labelQty === q
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleGeneratePdfSheet(labelQty)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg flex items-center gap-1 shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generar PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BarcodeVisualizer;
