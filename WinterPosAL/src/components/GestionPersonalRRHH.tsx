import { useState, useEffect, useMemo, useRef } from 'react';
import { Empleado, ExpedienteDocumentoEmpleado, PlantillaDocumentoLaboral, User, CompanyConfig } from '../types';
import { useDialog } from '../hooks/useDialog';
import { getLocalDateStr, formatImageUrl } from '../utils';
import { 
  Users, UserPlus, FileText, DollarSign, ShieldCheck, Search, 
  Trash2, Edit3, Eye, Printer, CheckCircle2, 
  Upload, FileCode, Sparkles, Save, FolderOpen,
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo, Redo, RemoveFormatting, Minus, Type,
  X, Download, Camera, UploadCloud, Link as LinkIcon
} from 'lucide-react';

interface GestionPersonalRRHHProps {
  currentUser: User;
  companyConfig?: CompanyConfig;
  tasaDia?: number;
}

const RECAUDOS_EXPEDIENTE_LEY = [
  { key: 'CEDULA', label: 'Copia Cédula de Identidad', req: true },
  { key: 'RIF', label: 'RIF Personal Vigente (SENIAT)', req: true },
  { key: 'CONTRATO', label: 'Contrato de Trabajo Firmado (LOTTT)', req: true },
  { key: 'IVSS', label: 'Constancia Registro IVSS (Forma 14-02)', req: true },
  { key: 'INPSASEL', label: 'Notificación Riesgos Laborales (LOPCYMAT)', req: true },
  { key: 'SALUD', label: 'Certificado de Salud / Manipulación Alimentos', req: false },
  { key: 'CURRICULUM', label: 'Síntesis Curricular y Referencias', req: false }
];

const OPCIONES_TAMANO_PAPEL: { id: 'letter' | 'legal' | 'folio' | 'a4'; nombre: string; medidas: string; recomendacion: string }[] = [
  { id: 'letter', nombre: 'Carta (Letter)', medidas: '8.5" × 11" (216 × 279 mm)', recomendacion: 'Constancias de trabajo, permisos y notificaciones breves' },
  { id: 'legal', nombre: 'Oficio (Legal)', medidas: '8.5" × 14" (216 × 356 mm)', recomendacion: 'Recomendado para Contratos de múltiples cláusulas LOTTT' },
  { id: 'folio', nombre: 'Folio / Oficio Tradicional', medidas: '8.5" × 13" (216 × 330 mm)', recomendacion: 'Papelería notarial y legal estándar' },
  { id: 'a4', nombre: 'A4 Internacional', medidas: '210 × 297 mm', recomendacion: 'Estándar internacional ISO' }
];

const DEFAULT_PLANTILLAS: PlantillaDocumentoLaboral[] = [
  {
    id: 'CONSTANCIA',
    tipo: 'CONSTANCIA',
    nombre: 'Constancia de Trabajo Formal',
    descripcion: 'Documento membretado para trámites bancarios, consulares o personales.',
    tamano_papel: 'letter',
    variables_disponibles: [
      '{NOMBRE_EMPLEADO}', '{CEDULA_EMPLEADO}', '{RIF_EMPLEADO}', '{CARGO}', '{DEPARTAMENTO}',
      '{FECHA_INGRESO}', '{SUELDO_MENSUAL_USD}', '{SUELDO_MENSUAL_BS}', '{MODALIDAD_PAGO}',
      '{NOMBRE_EMPRESA}', '{RIF_EMPRESA}', '{DIRECCION_EMPRESA}', '{REPRESENTANTE_LEGAL}', '{FECHA_ACTUAL}'
    ],
    contenido: `<p style="text-align: center; margin-bottom: 25px;"><strong style="font-size: 15pt; letter-spacing: 1px;">A QUIEN PUEDA INTERESAR</strong></p>

<p style="text-align: justify; line-height: 1.8; margin-bottom: 18px;">
Por medio de la presente se hace constar que el(la) ciudadano(a) <strong>{NOMBRE_EMPLEADO}</strong>, titular de la Cédula de Identidad N° <strong>{CEDULA_EMPLEADO}</strong> y RIF N° <strong>{RIF_EMPLEADO}</strong>, labora en nuestra empresa <strong>{NOMBRE_EMPRESA}</strong> (RIF: <strong>{RIF_EMPRESA}</strong>) desde la fecha <strong>{FECHA_INGRESO}</strong>, desempeñando actualmente el cargo de <strong>{CARGO}</strong> en el departamento de <strong>{DEPARTAMENTO}</strong>.
</p>

<p style="text-align: justify; line-height: 1.8; margin-bottom: 18px;">
El(la) trabajador(a) percibe una remuneración mensual de <strong>{SUELDO_MENSUAL_USD} USD</strong> (o su equivalente en bolívares al cambio oficial BCV de <strong>{SUELDO_MENSUAL_BS} VES</strong>), cancelada de forma <strong>{MODALIDAD_PAGO}</strong>.
</p>

<p style="text-align: justify; line-height: 1.8; margin-bottom: 40px;">
Constancia que se expide a solicitud de la parte interesada en la ciudad de Caracas, a los {FECHA_ACTUAL}.
</p>

<div style="text-align: center; margin-top: 50px;">
  <p style="margin: 0;">_________________________________________</p>
  <p style="margin: 4px 0 0 0; font-weight: bold;">{REPRESENTANTE_LEGAL}</p>
  <p style="margin: 2px 0 0 0; font-size: 10pt; color: #475569;">Gerencia de Recursos Humanos / Administración</p>
  <p style="margin: 2px 0 0 0; font-size: 10pt; color: #475569;">{NOMBRE_EMPRESA}</p>
</div>`
  },
  {
    id: 'CONTRATO',
    tipo: 'CONTRATO',
    nombre: 'Contrato Individual de Trabajo (LOTTT Art. 59)',
    descripcion: 'Contrato laboral estándar adaptado a la legislación venezolana.',
    tamano_papel: 'legal',
    variables_disponibles: [
      '{NOMBRE_EMPLEADO}', '{CEDULA_EMPLEADO}', '{DIRECCION_EMPLEADO}', '{TELEFONO_EMPLEADO}', '{CARGO}',
      '{FECHA_INGRESO}', '{SUELDO_MENSUAL_USD}', '{SUELDO_MENSUAL_BS}', '{CESTATICKET_USD}', '{MODALIDAD_PAGO}',
      '{NOMBRE_EMPRESA}', '{RIF_EMPRESA}', '{DIRECCION_EMPRESA}', '{REPRESENTANTE_LEGAL}', '{FECHA_ACTUAL}'
    ],
    contenido: `<p style="text-align: center; margin-bottom: 25px;"><strong style="font-size: 14pt;">CONTRATO INDIVIDUAL DE TRABAJO A TIEMPO INDETERMINADO</strong></p>

<p style="text-align: justify; line-height: 1.7; margin-bottom: 15px;">
Entre la sociedad mercantil <strong>{NOMBRE_EMPRESA}</strong>, inscrita en el Registro Mercantil y titular del RIF N° <strong>{RIF_EMPRESA}</strong>, domiciliada en <strong>{DIRECCION_EMPRESA}</strong>, representada en este acto por <strong>{REPRESENTANTE_LEGAL}</strong>, quien en lo sucesivo se denominará <strong>EL PATRONO</strong> por una parte; y por la otra el ciudadano(a) <strong>{NOMBRE_EMPLEADO}</strong>, titular de la Cédula de Identidad N° <strong>{CEDULA_EMPLEADO}</strong>, domiciliado en <strong>{DIRECCION_EMPLEADO}</strong>, quien en lo sucesivo se denominará <strong>EL TRABAJADOR</strong>, se ha convenido celebrar el presente Contrato de Trabajo sujeto a las siguientes cláusulas:
</p>

<p style="text-align: justify; line-height: 1.7; margin-bottom: 12px;">
<strong>PRIMERA (OBJETO Y CARGO):</strong> EL TRABAJADOR prestará sus servicios personales bajo subordinación directa como <strong>{CARGO}</strong>, obligándose a cumplir fielmente con las normas, instrucciones y funciones inherentes a dicho puesto.
</p>

<p style="text-align: justify; line-height: 1.7; margin-bottom: 12px;">
<strong>SEGUNDA (INICIO Y JORNADA):</strong> La relación de trabajo inicia formalmente en fecha <strong>{FECHA_INGRESO}</strong>. La jornada laboral será diurna de 40 horas semanales, distribuidas conforme a lo establecido en la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT).
</p>

<p style="text-align: justify; line-height: 1.7; margin-bottom: 12px;">
<strong>TERCERA (REMUNERACIÓN):</strong> EL PATRONO cancelará a EL TRABAJADOR un salario básico mensual de <strong>{SUELDO_MENSUAL_USD} USD</strong> (o su equivalente en bolívares a la tasa oficial BCV: <strong>{SUELDO_MENSUAL_BS} VES</strong>), pagadero de manera <strong>{MODALIDAD_PAGO}</strong>. Adicionalmente, se otorgará el beneficio de alimentación (Cestaticket) conforme a la ley vigente.
</p>

<p style="text-align: justify; line-height: 1.7; margin-bottom: 30px;">
<strong>CUARTA (CONFIDENCIALIDAD):</strong> EL TRABAJADOR se compromete a guardar estricta reserva sobre las operaciones comerciales, clientes y procesos de EL PATRONO.
</p>

<p style="text-align: justify; line-height: 1.7; margin-bottom: 40px;">
En fe de conformidad, firman dos (2) ejemplares de un mismo tenor y a un solo efecto en fecha {FECHA_ACTUAL}.
</p>

<div style="display: flex; justify-content: space-between; margin-top: 50px; text-align: center;">
  <div style="width: 45%;">
    <p style="margin: 0;">_________________________________</p>
    <p style="margin: 4px 0 0 0; font-weight: bold;">EL PATRONO</p>
    <p style="margin: 2px 0 0 0; font-size: 10pt;">{NOMBRE_EMPRESA}</p>
  </div>
  <div style="width: 45%;">
    <p style="margin: 0;">_________________________________</p>
    <p style="margin: 4px 0 0 0; font-weight: bold;">EL TRABAJADOR</p>
    <p style="margin: 2px 0 0 0; font-size: 10pt;">{NOMBRE_EMPLEADO} (CI: {CEDULA_EMPLEADO})</p>
  </div>
</div>`
  },
  {
    id: 'VACACIONES',
    tipo: 'VACACIONES',
    nombre: 'Notificación y Liquidación de Vacaciones (LOTTT Art. 190)',
    descripcion: 'Constancia de disfrute y pago del bono vacacional reglamentario.',
    tamano_papel: 'letter',
    variables_disponibles: [
      '{NOMBRE_EMPLEADO}', '{CEDULA_EMPLEADO}', '{CARGO}', '{FECHA_INGRESO}',
      '{NOMBRE_EMPRESA}', '{RIF_EMPRESA}', '{FECHA_ACTUAL}'
    ],
    contenido: `<p style="text-align: center; margin-bottom: 25px;"><strong style="font-size: 14pt;">NOTIFICACIÓN DE DISFRUTE DE VACACIONES ANUALES</strong></p>

<p style="text-align: justify; line-height: 1.8; margin-bottom: 20px;">
Por medio de la presente, la empresa <strong>{NOMBRE_EMPRESA}</strong> (RIF: <strong>{RIF_EMPRESA}</strong>) notifica formalmente al trabajador(a) <strong>{NOMBRE_EMPLEADO}</strong>, titular de la Cédula de Identidad N° <strong>{CEDULA_EMPLEADO}</strong>, quien desempeña el cargo de <strong>{CARGO}</strong>, que conforme a lo dispuesto en los Artículos 190 y 192 de la LOTTT, se le concede su período de disfrute de Vacaciones Anuales y el correspondiente pago del Bono Vacacional.
</p>

<p style="text-align: justify; line-height: 1.8; margin-bottom: 40px;">
Fecha de Notificación: {FECHA_ACTUAL}
</p>

<div style="display: flex; justify-content: space-between; margin-top: 60px; text-align: center;">
  <div style="width: 45%;">
    <p style="margin: 0;">_________________________________</p>
    <p style="margin: 4px 0 0 0; font-weight: bold;">POR LA EMPRESA</p>
    <p style="margin: 2px 0 0 0; font-size: 10pt;">{NOMBRE_EMPRESA}</p>
  </div>
  <div style="width: 45%;">
    <p style="margin: 0;">_________________________________</p>
    <p style="margin: 4px 0 0 0; font-weight: bold;">CONFORME EL TRABAJADOR</p>
    <p style="margin: 2px 0 0 0; font-size: 10pt;">{NOMBRE_EMPLEADO} (CI: {CEDULA_EMPLEADO})</p>
  </div>
</div>`
  },
  {
    id: 'RECIBO_NOMINA',
    tipo: 'RECIBO_NOMINA',
    nombre: 'Recibo Oficial de Pago de Nómina (Duplicado)',
    descripcion: 'Formato estándar de recibo de sueldo, cestaticket y deducciones en duplicado para empresa y trabajador.',
    tamano_papel: 'letter',
    variables_disponibles: [
      '{NOMBRE_EMPLEADO}', '{CEDULA_EMPLEADO}', '{RIF_EMPLEADO}', '{CARGO}', '{DEPARTAMENTO}',
      '{SUELDO_MENSUAL_USD}', '{SUELDO_MENSUAL_BS}', '{CESTATICKET_USD}', '{MODALIDAD_PAGO}',
      '{NOMBRE_EMPRESA}', '{RIF_EMPRESA}', '{DIRECCION_EMPRESA}', '{FECHA_ACTUAL}'
    ],
    contenido: `<div style="border: 1.5px solid #0f172a; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-family: 'Segoe UI', Arial, sans-serif;">
  <div style="display: flex; justify-content: space-between; border-bottom: 1.5px solid #0f172a; padding-bottom: 6px; margin-bottom: 8px;">
    <div>
      <h3 style="margin: 0; font-size: 12.5px; font-weight: 900; text-transform: uppercase;">{NOMBRE_EMPRESA}</h3>
      <p style="margin: 2px 0 0 0; font-size: 9px; color: #334155; font-weight: bold;">RIF: {RIF_EMPRESA} | {DIRECCION_EMPRESA}</p>
    </div>
    <div style="text-align: right;">
      <span style="border: 1.5px solid #0f172a; color: #0f172a; padding: 1px 6px; border-radius: 4px; font-size: 8.5px; font-weight: 900;">ORIGINAL: EMPRESA</span>
      <p style="margin: 3px 0 0 0; font-size: 9px; font-weight: 900;">Fecha: {FECHA_ACTUAL}</p>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 6px; background: #f8fafc; padding: 6px; border-radius: 6px; border: 1px solid #cbd5e1; margin-bottom: 8px; font-size: 9.5px;">
    <div><strong>TRABAJADOR:</strong> {NOMBRE_EMPLEADO}</div>
    <div><strong>CÉDULA:</strong> {CEDULA_EMPLEADO}</div>
    <div><strong>CARGO:</strong> {CARGO}</div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 9px;">
    <div>
      <h4 style="margin: 0 0 4px 0; border-bottom: 1.5px solid #0f172a; padding-bottom: 2px; font-size: 9.5px; font-weight: 900;">ASIGNACIONES / INGRESOS</h4>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td>Sueldo Base del Período:</td><td style="text-align: right; font-family: monospace; font-weight: bold;">{SUELDO_MENSUAL_USD}</td></tr>
        <tr><td>Bono Alimentación (Cestaticket):</td><td style="text-align: right; font-family: monospace; font-weight: bold;">{CESTATICKET_USD}</td></tr>
        <tr style="border-top: 1.5px solid #0f172a; font-weight: 900;"><td>TOTAL ASIGNACIONES:</td><td style="text-align: right; font-family: monospace; color: #047857;">{SUELDO_MENSUAL_USD}</td></tr>
      </table>
    </div>

    <div>
      <h4 style="margin: 0 0 4px 0; border-bottom: 1.5px solid #0f172a; padding-bottom: 2px; font-size: 9.5px; font-weight: 900;">DEDUCCIONES LEGALES</h4>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td>Seguro Social Obligatorio (IVSS 4%):</td><td style="text-align: right; font-family: monospace;">$0.00</td></tr>
        <tr><td>Aporte Habitacional (FAOV 1%):</td><td style="text-align: right; font-family: monospace;">$0.00</td></tr>
        <tr style="border-top: 1.5px solid #0f172a; font-weight: 900;"><td>TOTAL DEDUCCIONES:</td><td style="text-align: right; font-family: monospace; color: #b91c1c;">$0.00</td></tr>
      </table>
    </div>
  </div>

  <div style="margin-top: 10px; padding: 8px 12px; background: #f8fafc; border: 2px solid #0f172a; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
    <div>
      <span style="font-size: 9px; font-weight: 900; text-transform: uppercase;">NETO A COBRAR EN BOLÍVARES:</span>
      <strong style="display: block; font-size: 13px; font-family: monospace; font-weight: 900;">{SUELDO_MENSUAL_BS}</strong>
    </div>
    <div style="text-align: right;">
      <span style="font-size: 9px; font-weight: 900; text-transform: uppercase;">NETO EN DIVISAS:</span>
      <strong style="display: block; font-size: 14px; font-family: monospace; font-weight: 900;">{SUELDO_MENSUAL_USD}</strong>
    </div>
  </div>

  <div style="display: flex; justify-content: space-between; margin-top: 25px; text-align: center; font-size: 9px;">
    <div style="width: 40%; border-top: 1.5px solid #0f172a; padding-top: 4px;">
      <strong style="font-weight: 900;">POR LA EMPRESA</strong><br/>
      {NOMBRE_EMPRESA}
    </div>
    <div style="width: 40%; border-top: 1.5px solid #0f172a; padding-top: 4px;">
      <strong style="font-weight: 900;">CONFORME EL TRABAJADOR</strong><br/>
      {NOMBRE_EMPLEADO} (CI: {CEDULA_EMPLEADO})
    </div>
  </div>
</div>`
  }
];

// Helper to convert plain text to formatted HTML if needed
function ensureHtmlFormat(text: string): string {
  if (!text) return '';
  if (text.includes('<p>') || text.includes('<div>') || text.includes('<br')) {
    return text;
  }
  return text
    .split('\n\n')
    .map(paragraph => `<p style="text-align: justify; line-height: 1.7; margin-bottom: 14px;">${paragraph.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

// Subcomponent: Rich WYSIWYG Document Editor
function RichDocumentEditor({
  valueHtml,
  onChange,
  minHeight = '320px',
  placeholder = 'Escriba o personalice el contenido del documento aquí...'
}: {
  valueHtml: string;
  onChange: (html: string) => void;
  minHeight?: string;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState('1.7');

  // Keep editor content in sync when valueHtml changes externally
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== valueHtml) {
      editorRef.current.innerHTML = valueHtml;
    }
  }, [valueHtml]);

  // Helper to find all block elements (p, h1, h2, h3, div, li) affected by the current selection
  const getSelectedBlocks = (): HTMLElement[] => {
    if (!editorRef.current) return [];
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return [];
    
    const range = sel.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      return [];
    }

    const allBlocks = Array.from(editorRef.current.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, div, li, blockquote'));
    
    if (allBlocks.length === 0) {
      return [editorRef.current];
    }

    // Filter blocks that intersect with the user's selection
    const intersecting = allBlocks.filter(b => {
      try {
        return range.intersectsNode(b);
      } catch {
        return false;
      }
    });

    if (intersecting.length > 0) {
      return intersecting;
    }

    // If no direct intersection found (e.g. collapsed cursor inside a paragraph)
    const container = range.commonAncestorContainer;
    const parentEl = container.nodeType === Node.ELEMENT_NODE ? (container as HTMLElement) : container.parentElement;
    const closest = parentEl?.closest<HTMLElement>('p, h1, h2, h3, h4, div, li, blockquote');
    if (closest && editorRef.current.contains(closest)) {
      return [closest];
    }

    return [];
  };

  const exec = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // Apply Alignment specifically to selected blocks/paragraphs
  const handleApplyAlign = (alignment: 'left' | 'center' | 'right' | 'justify') => {
    const blocks = getSelectedBlocks();
    if (blocks.length > 0) {
      blocks.forEach(b => {
        b.style.textAlign = alignment;
      });
      if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
      return;
    }

    // Fallback: document.execCommand
    const cmdMap: Record<string, string> = {
      left: 'justifyLeft',
      center: 'justifyCenter',
      right: 'justifyRight',
      justify: 'justifyFull'
    };
    exec(cmdMap[alignment]);
  };

  // Apply Line Height specifically to selected blocks/paragraphs
  const handleApplyLineHeight = (lh: string) => {
    setLineHeight(lh);
    const blocks = getSelectedBlocks();
    if (blocks.length > 0) {
      blocks.forEach(b => {
        b.style.lineHeight = lh;
      });
      if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
    } else if (editorRef.current) {
      // If no text was selected, apply to all paragraphs in the document
      editorRef.current.style.lineHeight = lh;
      const paragraphs = editorRef.current.querySelectorAll('p, div, h1, h2, h3');
      paragraphs.forEach(p => {
        (p as HTMLElement).style.lineHeight = lh;
      });
      onChange(editorRef.current.innerHTML);
    }
  };

  return (
    <div className="border border-slate-300 rounded-2xl overflow-hidden bg-white shadow-xs focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all flex flex-col">
      {/* TOOLBAR SUPERIOR CON HERRAMIENTAS DE FORMATO */}
      <div className="bg-slate-100/90 border-b border-slate-250 px-3 py-2 flex flex-wrap items-center gap-1 text-slate-700 select-none">
        
        {/* Deshacer / Rehacer */}
        <div className="flex items-center bg-white rounded-lg border border-slate-250 p-0.5 shadow-2xs">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('undo')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-blue-600 transition-colors"
            title="Deshacer (Ctrl+Z)"
          >
            <Undo className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('redo')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-blue-600 transition-colors"
            title="Rehacer (Ctrl+Y)"
          >
            <Redo className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-5 w-px bg-slate-300 mx-1" />

        {/* Formato de Estilo */}
        <div className="flex items-center bg-white rounded-lg border border-slate-250 p-0.5 shadow-2xs">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('bold')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-blue-600 font-bold transition-colors"
            title="Negrita (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('italic')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-blue-600 italic transition-colors"
            title="Cursiva (Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('underline')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-blue-600 underline transition-colors"
            title="Subrayado (Ctrl+U)"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('strikeThrough')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-blue-600 transition-colors"
            title="Tachado"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-5 w-px bg-slate-300 mx-1" />

        {/* Alineación */}
        <div className="flex items-center bg-white rounded-lg border border-slate-250 p-0.5 shadow-2xs">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleApplyAlign('left')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-blue-600 transition-colors"
            title="Alinear a la Izquierda"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleApplyAlign('center')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-blue-600 transition-colors"
            title="Centrar Texto"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleApplyAlign('right')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-blue-600 transition-colors"
            title="Alinear a la Derecha"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleApplyAlign('justify')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-blue-600 transition-colors"
            title="Justificar Párrafo"
          >
            <AlignJustify className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-5 w-px bg-slate-300 mx-1" />

        {/* Listas */}
        <div className="flex items-center bg-white rounded-lg border border-slate-250 p-0.5 shadow-2xs">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('insertUnorderedList')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-blue-600 transition-colors"
            title="Lista con Viñetas"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('insertOrderedList')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-blue-600 transition-colors"
            title="Lista Numerada"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-5 w-px bg-slate-300 mx-1" />

        {/* Tipo de Bloque / Encabezado */}
        <div className="flex items-center gap-1.5">
          <select
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              if (e.target.value) exec('formatBlock', e.target.value);
            }}
            defaultValue="p"
            className="bg-white border border-slate-250 rounded-lg text-[11px] px-2 py-1 text-slate-700 font-bold focus:outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
            title="Formato de Párrafo / Título"
          >
            <option value="p">¶ Párrafo Normal</option>
            <option value="h1">H1 Título Principal</option>
            <option value="h2">H2 Subtítulo</option>
            <option value="h3">H3 Sección</option>
          </select>

          {/* Selector de Interlineado / Espaciado */}
          <select
            value={lineHeight}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => handleApplyLineHeight(e.target.value)}
            className="bg-white border border-slate-250 rounded-lg text-[11px] px-2 py-1 text-slate-700 font-bold focus:outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
            title="Interlineado / Espaciado entre líneas"
          >
            <option value="0.5">Espaciado 0.5 (Muy Compacto)</option>
            <option value="1.0">Espaciado 1.0 (Sencillo)</option>
            <option value="1.15">Espaciado 1.15</option>
            <option value="1.3">Espaciado 1.3 (Compacto)</option>
            <option value="1.5">Espaciado 1.5</option>
            <option value="1.7">Espaciado Normal (1.7)</option>
            <option value="2.0">Espaciado Doble (2.0)</option>
          </select>
        </div>

        <div className="h-5 w-px bg-slate-300 mx-1" />

        {/* Utilidades: Línea Horizontal y Limpiar Formato */}
        <div className="flex items-center bg-white rounded-lg border border-slate-250 p-0.5 shadow-2xs">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('insertHorizontalRule')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-blue-600 transition-colors"
            title="Insertar Línea Divisoria"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('removeFormat')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-rose-600 transition-colors"
            title="Limpiar Formato Seleccionado"
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

      {/* ÁREA EDITABLE WYSIWYG */}
      <div
        ref={editorRef}
        contentEditable
        onInput={() => {
          if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
          }
        }}
        style={{ minHeight, lineHeight }}
        className="p-5 text-slate-900 font-serif text-[13.5px] focus:outline-none overflow-y-auto leading-relaxed max-h-[55vh]"
        data-placeholder={placeholder}
      />
    </div>
  );
}

function EmployeeAvatarCard({ 
  emp, 
  onManagePhoto 
}: { 
  emp: Empleado; 
  onManagePhoto: (e: React.MouseEvent) => void; 
}) {
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [emp.foto_url]);

  const hasPhoto = Boolean(emp.foto_url && !loadError);

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onManagePhoto(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onManagePhoto(e);
      }}
      className={`w-14 h-14 min-w-[56px] min-h-[56px] max-w-[56px] max-h-[56px] aspect-square rounded-2xl flex items-center justify-center shrink-0 overflow-hidden relative group/avatar cursor-pointer shadow-xs transition-all hover:scale-105 border-2 ${
        hasPhoto
          ? 'bg-slate-100 border-slate-200 hover:border-blue-500'
          : 'bg-gradient-to-br from-slate-800 via-blue-900 to-indigo-950 text-white border-slate-700 hover:border-blue-400'
      }`}
      title="Clic o Clic Derecho para agregar, cambiar o eliminar foto del trabajador"
    >
      {hasPhoto ? (
        <img
          src={formatImageUrl(emp.foto_url)}
          alt={emp.nombre}
          className="w-full h-full object-cover rounded-2xl block"
          onError={() => setLoadError(true)}
        />
      ) : (
        <span className="font-black text-xl select-none uppercase">
          {emp.nombre ? emp.nombre.trim().charAt(0) : 'U'}
        </span>
      )}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center text-white rounded-2xl">
        <Camera className="w-5 h-5 drop-shadow" />
      </div>
    </div>
  );
}

export default function GestionPersonalRRHH({ currentUser, companyConfig, tasaDia = 0 }: GestionPersonalRRHHProps) {
  const { showAlert, showConfirm } = useDialog();

  // Master State
  const [empleados, setEmpleados] = useState<Empleado[]>(() => {
    try {
      const saved = localStorage.getItem('pos_empleados');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'EMP-001',
        nombre: 'CARLOS MANUEL PÉREZ ROJAS',
        cedula: 'V-18.450.120',
        rif: 'V-18450120-1',
        telefono: '0414-1234567',
        correo: 'carlos.perez@empresa.com',
        direccion: 'Catia, Calle Real, Edif. Central, Caracas',
        cargo: 'Encargado de Tienda / Supervisor',
        departamento: 'OPERACIONES',
        fecha_ingreso: '2023-03-15',
        tipo_contrato: 'INDETERMINADO',
        sueldo_base_usd: 280,
        bono_alimentacion_usd: 40,
        modalidad_pago: 'QUINCENAL',
        banco_pago: 'Banesco',
        cuenta_bancaria: '0134-0001-12-1234567890',
        estatus: 'Activo',
        created_at: '2023-03-15',
        documentos_expediente: [
          { id: 'DOC-1', tipo: 'CEDULA', titulo: 'Cédula de Identidad V-18.450.120', nombre_archivo: 'cedula_carlos.pdf', ruta_archivo: '', fecha_subida: '2023-03-15', estatus: 'Vigente' },
          { id: 'DOC-2', tipo: 'RIF', titulo: 'RIF Vigente SENIAT', nombre_archivo: 'rif_carlos.pdf', ruta_archivo: '', fecha_subida: '2023-03-15', estatus: 'Vigente' },
          { id: 'DOC-3', tipo: 'CONTRATO', titulo: 'Contrato de Trabajo Firmado', nombre_archivo: 'contrato_carlos.pdf', ruta_archivo: '', fecha_subida: '2023-03-15', estatus: 'Vigente' },
          { id: 'DOC-4', tipo: 'IVSS', titulo: 'Inscripción IVSS Forma 14-02', nombre_archivo: 'ivss_1402.pdf', ruta_archivo: '', fecha_subida: '2023-03-16', estatus: 'Vigente' },
          { id: 'DOC-5', tipo: 'INPSASEL', titulo: 'Notificación de Riesgos Laborales', nombre_archivo: 'notificacion_inpsasel.pdf', ruta_archivo: '', fecha_subida: '2023-03-17', estatus: 'Vigente' }
        ]
      },
      {
        id: 'EMP-002',
        nombre: 'MARÍA ALEJANDRA RODRÍGUEZ SILVA',
        cedula: 'V-24.890.312',
        rif: 'V-24890312-3',
        telefono: '0424-9876543',
        correo: 'maria.rodriguez@empresa.com',
        direccion: 'El Valle, Sector Longaray, Caracas',
        cargo: 'Cajera Principal / Atención',
        departamento: 'VENTAS',
        fecha_ingreso: '2024-01-10',
        tipo_contrato: 'INDETERMINADO',
        sueldo_base_usd: 190,
        bono_alimentacion_usd: 40,
        modalidad_pago: 'QUINCENAL',
        banco_pago: 'Banco de Venezuela',
        cuenta_bancaria: '0102-0123-45-0987654321',
        estatus: 'Activo',
        created_at: '2024-01-10',
        documentos_expediente: [
          { id: 'DOC-21', tipo: 'CEDULA', titulo: 'Cédula de Identidad', nombre_archivo: 'cedula_maria.pdf', ruta_archivo: '', fecha_subida: '2024-01-10', estatus: 'Vigente' },
          { id: 'DOC-22', tipo: 'CONTRATO', titulo: 'Contrato de Trabajo', nombre_archivo: 'contrato_maria.pdf', ruta_archivo: '', fecha_subida: '2024-01-10', estatus: 'Vigente' }
        ]
      }
    ];
  });

  const [plantillas, setPlantillas] = useState<PlantillaDocumentoLaboral[]>(() => {
    try {
      const saved = localStorage.getItem('pos_plantillas_laborales');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = [...parsed];
          DEFAULT_PLANTILLAS.forEach(dp => {
            if (!merged.some(p => p.id === dp.id || p.tipo === dp.tipo)) {
              merged.push(dp);
            }
          });
          return merged;
        }
      }
    } catch {}
    return DEFAULT_PLANTILLAS;
  });

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('pos_empleados', JSON.stringify(empleados));
  }, [empleados]);

  useEffect(() => {
    localStorage.setItem('pos_plantillas_laborales', JSON.stringify(plantillas));
  }, [plantillas]);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'Activo' | 'Vacaciones' | 'Reposo' | 'Liquidado'>('TODOS');

  // Modals
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Empleado | null>(null);
  const [showExpedienteModal, setShowExpedienteModal] = useState<Empleado | null>(null);
  const [previewExpedienteDoc, setPreviewExpedienteDoc] = useState<{
    titulo: string;
    nombre_archivo: string;
    ruta_archivo: string;
    empleado_nombre: string;
  } | null>(null);
  const [showDocGeneratorModal, setShowDocGeneratorModal] = useState<{ empleado: Empleado; plantilla: PlantillaDocumentoLaboral } | null>(null);
  const [generatedDocHtml, setGeneratedDocHtml] = useState('');
  const [showPayrollModal, setShowPayrollModal] = useState<Empleado | null>(null);
  const [showPlantillasMasterModal, setShowPlantillasMasterModal] = useState(false);
  const [editingPlantilla, setEditingPlantilla] = useState<PlantillaDocumentoLaboral | null>(null);
  const [docPaperSize, setDocPaperSize] = useState<'letter' | 'legal' | 'folio' | 'a4'>('letter');

  // Form State for Employee
  const [formNombre, setFormNombre] = useState('');
  const [formCedula, setFormCedula] = useState('');
  const [formRif, setFormRif] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formCorreo, setFormCorreo] = useState('');
  const [formDireccion, setFormDireccion] = useState('');
  const [formCargo, setFormCargo] = useState('');
  const [formDepto, setFormDepto] = useState('OPERACIONES');
  const [formFechaIngreso, setFormFechaIngreso] = useState(getLocalDateStr());
  const [formTipoContrato, setFormTipoContrato] = useState<'INDETERMINADO' | 'DETERMINADO' | 'PRUEBA' | 'SERVICIOS'>('INDETERMINADO');
  const [formSueldoUSD, setFormSueldoUSD] = useState('200');
  const [formBonoUSD, setFormBonoUSD] = useState('40');
  const [formModalidad, setFormModalidad] = useState<'QUINCENAL' | 'SEMANAL' | 'MENSUAL'>('QUINCENAL');
  const [formBanco, setFormBanco] = useState('Banesco');
  const [formCuenta, setFormCuenta] = useState('');
  const [formPagoMovil, setFormPagoMovil] = useState('');
  const [formEstatus, setFormEstatus] = useState<'Activo' | 'Vacaciones' | 'Reposo' | 'Liquidado'>('Activo');
  const [formFotoUrl, setFormFotoUrl] = useState('');

  // Photo Management Modal / Context Target
  const [photoActionTarget, setPhotoActionTarget] = useState<Empleado | null>(null);
  const [photoInputUrl, setPhotoInputUrl] = useState('');
  const photoFileInputRef = useRef<HTMLInputElement>(null);
  const formPhotoFileInputRef = useRef<HTMLInputElement>(null);

  // Payroll / Recibo Modal State
  const [payrollPeriodo, setPayrollPeriodo] = useState('1ra Quincena ' + new Date().toLocaleString('es-VE', { month: 'long', year: 'numeric' }));
  const [payrollDias, setPayrollDias] = useState('15');
  const [payrollSueldoUSD, setPayrollSueldoUSD] = useState('100');
  const [payrollCestaticketUSD, setPayrollCestaticketUSD] = useState('20');
  const [payrollBonoProdUSD, setPayrollBonoProdUSD] = useState('0');
  const [payrollHorasExtrasUSD, setPayrollHorasExtrasUSD] = useState('0');
  const [payrollIvssUSD, setPayrollIvssUSD] = useState('4');
  const [payrollFaovUSD, setPayrollFaovUSD] = useState('1');
  const [payrollAdelantoUSD, setPayrollAdelantoUSD] = useState('0');

  // Universal Escape key listener for all submodals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (photoActionTarget) {
          e.preventDefault(); e.stopPropagation();
          setPhotoActionTarget(null);
          return;
        }
        if (previewExpedienteDoc) {
          e.preventDefault(); e.stopPropagation();
          setPreviewExpedienteDoc(null);
          return;
        }
        if (showDocGeneratorModal) {
          e.preventDefault(); e.stopPropagation();
          setShowDocGeneratorModal(null);
          return;
        }
        if (showPayrollModal) {
          e.preventDefault(); e.stopPropagation();
          setShowPayrollModal(null);
          return;
        }
        if (showExpedienteModal) {
          e.preventDefault(); e.stopPropagation();
          setShowExpedienteModal(null);
          return;
        }
        if (showFormModal) {
          e.preventDefault(); e.stopPropagation();
          setShowFormModal(false);
          return;
        }
        if (showPlantillasMasterModal) {
          e.preventDefault(); e.stopPropagation();
          setShowPlantillasMasterModal(false);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [photoActionTarget, previewExpedienteDoc, showDocGeneratorModal, showPayrollModal, showExpedienteModal, showFormModal, showPlantillasMasterModal]);

  const companyName = companyConfig?.nombre_comercio || 'INVERSIONES NIQUITAO 3000 C.A.';
  const companyRif = companyConfig?.rif || 'J-41132631-0';
  const companyAddress = companyConfig?.direccion || 'Av. Principal, Caracas, Venezuela';
  const companyRep = currentUser?.nombre || 'Administración / Recursos Humanos';

  // Filtered Employee List
  const filteredEmpleados = useMemo(() => {
    return empleados.filter(emp => {
      const matchSearch = 
        emp.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.cedula.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.cargo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.departamento && emp.departamento.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchStatus = statusFilter === 'TODOS' || emp.estatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [empleados, searchTerm, statusFilter]);

  // Metric Totals
  const metricStats = useMemo(() => {
    const total = empleados.length;
    const activos = empleados.filter(e => e.estatus === 'Activo').length;
    const totalNominaUSD = empleados.filter(e => e.estatus === 'Activo').reduce((acc, e) => acc + (e.sueldo_base_usd || 0), 0);
    
    // Calculate global expediente compliance %
    let totalReqs = 0;
    let deliveredReqs = 0;
    empleados.forEach(emp => {
      const requiredList = RECAUDOS_EXPEDIENTE_LEY.filter(r => r.req);
      totalReqs += requiredList.length;
      const docs = emp.documentos_expediente || [];
      requiredList.forEach(r => {
        if (docs.some(d => d.tipo === r.key)) deliveredReqs += 1;
      });
    });
    const compliancePct = totalReqs > 0 ? Math.round((deliveredReqs / totalReqs) * 100) : 0;

    return { total, activos, totalNominaUSD, compliancePct };
  }, [empleados]);

  // Open Edit/Create form
  const handleOpenForm = (emp?: Empleado) => {
    if (emp) {
      setEditingEmp(emp);
      setFormNombre(emp.nombre);
      setFormCedula(emp.cedula);
      setFormRif(emp.rif || '');
      setFormTelefono(emp.telefono || '');
      setFormCorreo(emp.correo || '');
      setFormDireccion(emp.direccion || '');
      setFormCargo(emp.cargo);
      setFormDepto(emp.departamento || 'OPERACIONES');
      setFormFechaIngreso(emp.fecha_ingreso || getLocalDateStr());
      setFormTipoContrato(emp.tipo_contrato || 'INDETERMINADO');
      setFormSueldoUSD(String(emp.sueldo_base_usd || 200));
      setFormBonoUSD(String(emp.bono_alimentacion_usd || 40));
      setFormModalidad(emp.modalidad_pago || 'QUINCENAL');
      setFormBanco(emp.banco_pago || 'Banesco');
      setFormCuenta(emp.cuenta_bancaria || '');
      setFormPagoMovil(emp.pago_movil_telefono || '');
      setFormEstatus(emp.estatus || 'Activo');
      setFormFotoUrl(emp.foto_url || '');
    } else {
      setEditingEmp(null);
      setFormNombre('');
      setFormCedula('');
      setFormRif('');
      setFormTelefono('');
      setFormCorreo('');
      setFormDireccion('');
      setFormCargo('');
      setFormDepto('OPERACIONES');
      setFormFechaIngreso(getLocalDateStr());
      setFormTipoContrato('INDETERMINADO');
      setFormSueldoUSD('200');
      setFormBonoUSD('40');
      setFormModalidad('QUINCENAL');
      setFormBanco('Banesco');
      setFormCuenta('');
      setFormPagoMovil('');
      setFormEstatus('Activo');
      setFormFotoUrl('');
    }
    setShowFormModal(true);
  };

  // Save Employee
  const handleSaveEmpleado = () => {
    if (!formNombre.trim() || !formCedula.trim() || !formCargo.trim()) {
      showAlert('Nombre, Cédula y Cargo son campos obligatorios.', 'Datos Incompletos', 'warning');
      return;
    }

    const payload: Empleado = {
      id: editingEmp ? editingEmp.id : Date.now().toString(),
      nombre: formNombre.trim().toUpperCase(),
      cedula: formCedula.trim().toUpperCase(),
      rif: formRif.trim().toUpperCase(),
      telefono: formTelefono.trim(),
      correo: formCorreo.trim(),
      direccion: formDireccion.trim(),
      cargo: formCargo.trim().toUpperCase(),
      departamento: formDepto,
      fecha_ingreso: formFechaIngreso,
      tipo_contrato: formTipoContrato,
      sueldo_base_usd: parseFloat(formSueldoUSD) || 0,
      bono_alimentacion_usd: parseFloat(formBonoUSD) || 0,
      modalidad_pago: formModalidad,
      banco_pago: formBanco.trim(),
      cuenta_bancaria: formCuenta.trim(),
      pago_movil_telefono: formPagoMovil.trim(),
      estatus: formEstatus,
      foto_url: formFotoUrl || undefined,
      documentos_expediente: editingEmp?.documentos_expediente || []
    };

    if (editingEmp) {
      setEmpleados(prev => prev.map(e => e.id === editingEmp.id ? payload : e));
      showAlert('Ficha de trabajador actualizada correctamente.', 'Actualizado', 'success');
    } else {
      setEmpleados(prev => [payload, ...prev]);
      showAlert('Nuevo trabajador registrado exitosamente.', 'Registrado', 'success');
    }
    setShowFormModal(false);
  };

  // Upload Photo File
  const handleUploadPhotoFile = (file: File, targetEmpId?: string | number) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (targetEmpId) {
        setEmpleados(prev => prev.map(emp => emp.id === targetEmpId ? { ...emp, foto_url: dataUrl } : emp));
        showAlert('Foto del trabajador actualizada correctamente.', 'Foto Guardada', 'success');
      } else {
        setFormFotoUrl(dataUrl);
      }
      setPhotoActionTarget(null);
    };
    reader.readAsDataURL(file);
  };

  // Save Photo from URL input
  const handleSavePhotoUrl = (url: string, targetEmpId?: string | number) => {
    if (!url.trim()) return;
    if (targetEmpId) {
      setEmpleados(prev => prev.map(emp => emp.id === targetEmpId ? { ...emp, foto_url: url.trim() } : emp));
      showAlert('Foto del trabajador actualizada desde URL.', 'Foto Guardada', 'success');
    } else {
      setFormFotoUrl(url.trim());
    }
    setPhotoActionTarget(null);
    setPhotoInputUrl('');
  };

  // Remove Photo
  const handleRemovePhoto = (targetEmpId?: string | number) => {
    if (targetEmpId) {
      setEmpleados(prev => prev.map(emp => emp.id === targetEmpId ? { ...emp, foto_url: '' } : emp));
      showAlert('Foto eliminada correctamente.', 'Foto Eliminada', 'info');
    } else {
      setFormFotoUrl('');
    }
    setPhotoActionTarget(null);
  };

  // Delete Employee
  const handleDeleteEmpleado = async (emp: Empleado) => {
    const ok = await showConfirm(
      `¿Está seguro de eliminar al empleado "${emp.nombre}" (${emp.cedula})? Esta acción eliminará también su expediente digital.`,
      'Eliminar Empleado',
      { confirmLabel: 'Eliminar', isDanger: true }
    );
    if (ok) {
      setEmpleados(prev => prev.filter(e => e.id !== emp.id));
      showAlert('Empleado eliminado con éxito.', 'Operación Completada', 'info');
    }
  };

  // -------------------------------------------------------------
  // MOTOR DE PLANTILLAS: REEMPLAZO DE VARIABLES DINÁMICAS
  // -------------------------------------------------------------
  const generateDocumentDraft = (emp: Empleado, plantilla?: PlantillaDocumentoLaboral) => {
    if (!emp) return;
    const selectedPlantilla = 
      plantilla || 
      plantillas.find(p => p.tipo === 'CONSTANCIA') || 
      DEFAULT_PLANTILLAS.find(p => p.tipo === 'CONSTANCIA') || 
      plantillas[0] || 
      DEFAULT_PLANTILLAS[0];

    const sueldoUSD = Number(emp.sueldo_base_usd) || 0;
    const sueldoBs = (sueldoUSD * (Number(tasaDia) || 1)).toFixed(2);
    const cestaticketUSD = Number(emp.bono_alimentacion_usd) || 40;

    let content = ensureHtmlFormat(selectedPlantilla?.contenido || '');
    content = content.replace(/{NOMBRE_EMPLEADO}/g, emp.nombre || 'TRABAJADOR');
    content = content.replace(/{CEDULA_EMPLEADO}/g, emp.cedula || 'V-00.000.000');
    content = content.replace(/{RIF_EMPLEADO}/g, emp.rif || emp.cedula || 'N/A');
    content = content.replace(/{DIRECCION_EMPLEADO}/g, emp.direccion || 'Domicilio en la ciudad');
    content = content.replace(/{TELEFONO_EMPLEADO}/g, emp.telefono || 'N/A');
    content = content.replace(/{CARGO}/g, emp.cargo || 'EMPLEADO');
    content = content.replace(/{DEPARTAMENTO}/g, emp.departamento || 'OPERACIONES');
    content = content.replace(/{FECHA_INGRESO}/g, emp.fecha_ingreso || getLocalDateStr());
    content = content.replace(/{SUELDO_MENSUAL_USD}/g, `$${sueldoUSD.toFixed(2)}`);
    content = content.replace(/{SUELDO_MENSUAL_BS}/g, `Bs ${sueldoBs}`);
    content = content.replace(/{CESTATICKET_USD}/g, `$${cestaticketUSD.toFixed(2)}`);
    content = content.replace(/{MODALIDAD_PAGO}/g, (emp.modalidad_pago || 'QUINCENAL').toLowerCase());
    content = content.replace(/{NOMBRE_EMPRESA}/g, companyName || 'EMPRESA');
    content = content.replace(/{RIF_EMPRESA}/g, companyRif || 'J-00000000-0');
    content = content.replace(/{DIRECCION_EMPRESA}/g, companyAddress || 'Dirección de la Empresa');
    content = content.replace(/{REPRESENTANTE_LEGAL}/g, companyRep || 'REPRESENTANTE LEGAL');
    content = content.replace(/{FECHA_ACTUAL}/g, new Date().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' }));

    setGeneratedDocHtml(content);
    setDocPaperSize(selectedPlantilla?.tamano_papel || (selectedPlantilla?.tipo === 'CONTRATO' ? 'legal' : 'letter'));
    setShowDocGeneratorModal({ empleado: emp, plantilla: selectedPlantilla });
  };

  // Print generated document directly without opening blank HTML browser tabs
  const handlePrintDocument = (title: string, htmlContent: string, tamanoPapel: 'letter' | 'legal' | 'folio' | 'a4' = docPaperSize) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const pageSizeCss = tamanoPapel === 'legal' 
      ? 'legal portrait' 
      : tamanoPapel === 'folio' 
      ? '216mm 330mm portrait' 
      : tamanoPapel === 'a4' 
      ? 'A4 portrait' 
      : 'letter portrait';

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} - ${companyName}</title>
          <style>
            @page { 
              size: ${pageSizeCss}; 
              margin: 0mm !important; 
            }
            @media print { 
              html, body { 
                margin: 0 !important; 
                padding: 10mm 20mm 15mm 20mm !important; 
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              } 
            }
            body { 
              font-family: 'Times New Roman', Times, serif; 
              color: #000; 
              line-height: 1.6; 
              font-size: 12pt; 
              margin: 0; 
              padding: 10mm 20mm 15mm 20mm; 
            }
            .header { 
              text-align: center; 
              border-bottom: 2px solid #000; 
              padding-bottom: 8px; 
              margin-bottom: 18px; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 14pt; 
              text-transform: uppercase; 
              font-weight: bold; 
            }
            .header p { 
              margin: 2px 0 0 0; 
              font-size: 9pt; 
            }
            .content { 
              text-align: justify; 
            }
            .content p { 
              margin-bottom: 12px; 
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${companyName}</h1>
            <p><strong>RIF:</strong> ${companyRif} | <strong>Dirección:</strong> ${companyAddress}</p>
          </div>

          <div class="content">${htmlContent}</div>
        </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }, 350);
  };

  // Open Payroll Recibo Modal
  const handleOpenPayrollModal = (emp: Empleado) => {
    const halfBase = (emp.sueldo_base_usd || 200) / 2;
    const halfBono = (emp.bono_alimentacion_usd || 40) / 2;
    setPayrollSueldoUSD(halfBase.toFixed(2));
    setPayrollCestaticketUSD(halfBono.toFixed(2));
    setPayrollBonoProdUSD('0');
    setPayrollHorasExtrasUSD('0');
    setPayrollIvssUSD((halfBase * 0.04).toFixed(2));
    setPayrollFaovUSD((halfBase * 0.01).toFixed(2));
    setPayrollAdelantoUSD('0');
    setShowPayrollModal(emp);
  };

  // Print Payroll Receipt directly without opening blank HTML browser tabs
  const handlePrintPayrollReceipt = (emp: Empleado) => {
    const sueldo = parseFloat(payrollSueldoUSD) || 0;
    const cesta = parseFloat(payrollCestaticketUSD) || 0;
    const bono = parseFloat(payrollBonoProdUSD) || 0;
    const he = parseFloat(payrollHorasExtrasUSD) || 0;
    const totAsigUSD = sueldo + cesta + bono + he;

    const ivss = parseFloat(payrollIvssUSD) || 0;
    const faov = parseFloat(payrollFaovUSD) || 0;
    const adelanto = parseFloat(payrollAdelantoUSD) || 0;
    const totDeducUSD = ivss + faov + adelanto;

    const netoUSD = totAsigUSD - totDeducUSD;
    const rate = tasaDia || 1;
    const netoVES = netoUSD * rate;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const renderReceiptHalf = (copyLabel: string) => `
      <div style="border: 1.5px solid #0f172a; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px;">
          <div>
            <h2 style="margin: 0; font-size: 13px; font-weight: 900; text-transform: uppercase;">${companyName}</h2>
            <p style="margin: 2px 0 0 0; font-size: 9.5px; color: #334155; font-weight: bold;">RIF: ${companyRif} | ${companyAddress}</p>
          </div>
          <div style="text-align: right;">
            <span style="background: #ffffff; border: 1.5px solid #0f172a; color: #0f172a; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;">${copyLabel}</span>
            <p style="margin: 4px 0 0 0; font-size: 9.5px; font-weight: 900;">Período: ${payrollPeriodo}</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #cbd5e1; margin-bottom: 10px;">
          <div><strong>TRABAJADOR:</strong> ${emp.nombre}</div>
          <div><strong>CÉDULA / RIF:</strong> ${emp.cedula}</div>
          <div><strong>CARGO:</strong> ${emp.cargo}</div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div>
            <h4 style="margin: 0 0 4px 0; border-bottom: 1.5px solid #0f172a; padding-bottom: 2px; font-size: 10px; font-weight: 900;">ASIGNACIONES / INGRESOS</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 9.5px;">
              <tr><td>Sueldo Base (${payrollDias} días):</td><td style="text-align: right; font-family: monospace; font-weight: bold;">$${sueldo.toFixed(2)}</td></tr>
              <tr><td>Bono Alimentación (Cestaticket):</td><td style="text-align: right; font-family: monospace; font-weight: bold;">$${cesta.toFixed(2)}</td></tr>
              ${bono > 0 ? `<tr><td>Bono de Producción / Asistencia:</td><td style="text-align: right; font-family: monospace; font-weight: bold;">$${bono.toFixed(2)}</td></tr>` : ''}
              ${he > 0 ? `<tr><td>Horas Extras / Feriados:</td><td style="text-align: right; font-family: monospace; font-weight: bold;">$${he.toFixed(2)}</td></tr>` : ''}
              <tr style="border-top: 1.5px solid #0f172a; font-weight: 900;"><td>TOTAL ASIGNACIONES:</td><td style="text-align: right; font-family: monospace; font-weight: 900; color: #047857;">$${totAsigUSD.toFixed(2)}</td></tr>
            </table>
          </div>

          <div>
            <h4 style="margin: 0 0 4px 0; border-bottom: 1.5px solid #0f172a; padding-bottom: 2px; font-size: 10px; font-weight: 900;">DEDUCCIONES LEGALES / RETENCIONES</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 9.5px;">
              <tr><td>Seguro Social Obligatorio (IVSS 4%):</td><td style="text-align: right; font-family: monospace; font-weight: bold;">$${ivss.toFixed(2)}</td></tr>
              <tr><td>Aporte Habitacional (FAOV 1%):</td><td style="text-align: right; font-family: monospace; font-weight: bold;">$${faov.toFixed(2)}</td></tr>
              ${adelanto > 0 ? `<tr><td>Adelantos / Préstamos:</td><td style="text-align: right; font-family: monospace; font-weight: bold; color: #b91c1c;">-$${adelanto.toFixed(2)}</td></tr>` : ''}
              <tr style="border-top: 1.5px solid #0f172a; font-weight: 900;"><td>TOTAL DEDUCCIONES:</td><td style="text-align: right; font-family: monospace; font-weight: 900; color: #b91c1c;">-$${totDeducUSD.toFixed(2)}</td></tr>
            </table>
          </div>
        </div>

        <div style="margin-top: 12px; padding: 10px 14px; background: #f8fafc; border: 2px solid #0f172a; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; color: #0f172a;">
          <div>
            <span style="font-size: 9.5px; font-weight: 900; text-transform: uppercase; color: #0f172a; display: block; margin-bottom: 2px;">NETO A COBRAR EN BOLÍVARES (TASA BCV ${rate.toFixed(2)}):</span>
            <strong style="display: block; font-size: 15px; font-family: monospace, sans-serif; font-weight: 900; color: #000000;">Bs ${netoVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 9.5px; font-weight: 900; text-transform: uppercase; color: #0f172a; display: block; margin-bottom: 2px;">NETO EN DIVISAS:</span>
            <strong style="display: block; font-size: 16px; font-family: monospace, sans-serif; font-weight: 900; color: #000000;">$${netoUSD.toFixed(2)} USD</strong>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-top: 35px; text-align: center; font-size: 9.5px;">
          <div style="width: 40%; border-top: 1.5px solid #0f172a; padding-top: 5px;">
            <strong style="font-weight: 900;">POR LA EMPRESA</strong><br/>
            ${companyName}
          </div>
          <div style="width: 40%; border-top: 1.5px solid #0f172a; padding-top: 5px;">
            <strong style="font-weight: 900;">CONFORME EL TRABAJADOR</strong><br/>
            ${emp.nombre} (CI: ${emp.cedula})
          </div>
        </div>
      </div>
    `;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Recibo de Pago - ${emp.nombre}</title>
          <style>
            @page { size: letter portrait; margin: 0mm !important; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 10mm; }
            @media print { 
              html, body { 
                margin: 0 !important; 
                padding: 10mm !important; 
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              } 
            }
          </style>
        </head>
        <body>
          ${renderReceiptHalf('ORIGINAL: EMPRESA')}
          <div style="border-bottom: 1px dashed #cbd5e1; margin: 15px 0;"></div>
          ${renderReceiptHalf('COPIA: TRABAJADOR')}
        </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }, 350);
  };

  // Upload Document to Employee Expediente
  const handleUploadExpedienteDoc = (emp: Empleado, tipo: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const fileData = reader.result as string;
      const newDoc: ExpedienteDocumentoEmpleado = {
        id: `DOC-${Date.now()}`,
        tipo: tipo as any,
        titulo: `${RECAUDOS_EXPEDIENTE_LEY.find(r => r.key === tipo)?.label || tipo}`,
        nombre_archivo: file.name,
        ruta_archivo: fileData,
        fecha_subida: getLocalDateStr(),
        estatus: 'Vigente'
      };

      setEmpleados(prev => prev.map(e => {
        if (e.id === emp.id) {
          const docs = e.documentos_expediente || [];
          const filtered = docs.filter(d => d.tipo !== tipo);
          return { ...e, documentos_expediente: [...filtered, newDoc] };
        }
        return e;
      }));

      setShowExpedienteModal(prev => {
        if (!prev || prev.id !== emp.id) return prev;
        const docs = prev.documentos_expediente || [];
        const filtered = docs.filter(d => d.tipo !== tipo);
        return { ...prev, documentos_expediente: [...filtered, newDoc] };
      });

      showAlert(`Documento "${file.name}" cargado exitosamente en el expediente de ${emp.nombre}.`, 'Documento Guardado', 'success');
    };
    reader.readAsDataURL(file);
  };

  // Delete Document from Expediente
  const handleDeleteExpedienteDoc = async (emp: Empleado, docId: string, docName: string) => {
    const ok = await showConfirm(
      `¿Desea eliminar el documento "${docName}" del expediente digital de ${emp.nombre}?`,
      'Eliminar Documento de Expediente',
      { confirmLabel: 'Sí, Eliminar', isDanger: true }
    );
    if (!ok) return;

    setEmpleados(prev => prev.map(e => {
      if (e.id === emp.id) {
        return { ...e, documentos_expediente: (e.documentos_expediente || []).filter(d => d.id !== docId) };
      }
      return e;
    }));

    setShowExpedienteModal(prev => {
      if (!prev || prev.id !== emp.id) return prev;
      return { ...prev, documentos_expediente: (prev.documentos_expediente || []).filter(d => d.id !== docId) };
    });

    showAlert('Documento eliminado del expediente.', 'Expediente Actualizado', 'info');
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200 font-sans">
      
      {/* ACTION BAR & FILTERS HEADER */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-200">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-mono">DIRECTORIO DE TRABAJADORES</h3>
              <span className="bg-blue-100 text-blue-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-blue-200">LOTTT / RRHH</span>
            </div>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Expedientes digitales, recibos de nómina y documentos parametrizables.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPlantillasMasterModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-all border border-slate-300 cursor-pointer shadow-2xs"
            title="Editar formatos maestros de Contratos, Constancias y Vacaciones"
          >
            <FileCode className="w-3.5 h-3.5 text-blue-600" />
            <span>⚙️ Plantillas de Documentos</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenForm()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Nuevo Trabajador</span>
          </button>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Trabajadores</span>
            <strong className="text-2xl font-black text-slate-800">{metricStats.total}</strong>
            <span className="text-xs text-emerald-600 font-bold block mt-0.5">{metricStats.activos} activos en nómina</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Presupuesto Nómina Base</span>
            <strong className="text-2xl font-black text-slate-800 font-mono">${metricStats.totalNominaUSD.toFixed(2)}</strong>
            <span className="text-xs text-slate-500 font-medium block mt-0.5">Equiv. Bs {(metricStats.totalNominaUSD * (tasaDia || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Salud Expedientes LOTTT</span>
            <strong className="text-2xl font-black text-blue-600 font-mono">{metricStats.compliancePct}%</strong>
            <span className="text-xs text-slate-500 font-medium block mt-0.5">Recaudos de ley entregados</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Plantillas Parametrizadas</span>
            <strong className="text-2xl font-black text-slate-800">{plantillas.length}</strong>
            <span className="text-xs text-blue-600 font-bold block mt-0.5">Contratos, Constancias y Recibos</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <FileText className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* SEARCH AND FILTER BAR */}
      <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nombre, cédula o cargo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-250 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 transition-all font-sans"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          {(['TODOS', 'Activo', 'Vacaciones', 'Reposo', 'Liquidado'] as const).map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* EMPLOYEE CARDS GRID (3 COLUMNAS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {filteredEmpleados.length === 0 ? (
          <div className="col-span-full bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
            <Users className="w-12 h-12 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">No se encontraron trabajadores</h4>
            <p className="text-xs text-slate-400">Intente con otro término de búsqueda o registre un nuevo empleado.</p>
          </div>
        ) : (
          filteredEmpleados.map(emp => {
            const reqList = RECAUDOS_EXPEDIENTE_LEY.filter(r => r.req);
            const docs = emp.documentos_expediente || [];
            const deliveredCount = reqList.filter(r => docs.some(d => d.tipo === r.key)).length;
            const empCompliance = Math.round((deliveredCount / reqList.length) * 100);

            return (
              <div
                key={emp.id}
                className="bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3.5 group"
              >
                <div>
                  {/* Top Bar with Avatar & Status */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar / Foto del Trabajador con gestión de error y fallback */}
                      <EmployeeAvatarCard
                        emp={emp}
                        onManagePhoto={() => {
                          setPhotoActionTarget(emp);
                          setPhotoInputUrl(emp.foto_url || '');
                        }}
                      />

                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase truncate">
                          {emp.nombre}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono truncate">
                          <span className="font-bold text-slate-700">{emp.cedula}</span>
                          {emp.rif && <span className="truncate">• {emp.rif}</span>}
                        </div>
                      </div>
                    </div>

                    <span className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                      emp.estatus === 'Activo' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      emp.estatus === 'Vacaciones' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      emp.estatus === 'Reposo' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                      'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {emp.estatus}
                    </span>
                  </div>

                  {/* Info Tags */}
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                    <div>
                      <span className="text-[9.5px] text-slate-400 uppercase font-bold block">Cargo / Puesto</span>
                      <strong className="text-slate-800 block text-[11px] truncate">{emp.cargo}</strong>
                    </div>
                    <div>
                      <span className="text-[9.5px] text-slate-400 uppercase font-bold block">Sueldo Base ($ USD)</span>
                      <strong className="text-emerald-700 font-mono text-[11px] block truncate">${(emp.sueldo_base_usd || 0).toFixed(2)} ({emp.modalidad_pago})</strong>
                    </div>
                    <div>
                      <span className="text-[9.5px] text-slate-400 uppercase font-bold block">Fecha Ingreso</span>
                      <span className="text-slate-600 font-mono font-medium text-[11px] block">{emp.fecha_ingreso}</span>
                    </div>
                    <div>
                      <span className="text-[9.5px] text-slate-400 uppercase font-bold block">Expediente LOTTT</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="flex-1 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${empCompliance === 100 ? 'bg-emerald-500' : empCompliance >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${empCompliance}%` }}
                          />
                        </div>
                        <span className="font-bold text-[9.5px] font-mono text-slate-700">{empCompliance}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Toolbar */}
                <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {/* Expediente Digital */}
                    <button
                      type="button"
                      onClick={() => setShowExpedienteModal(emp)}
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                      title="Ver y adjuntar recaudos del expediente digital"
                    >
                      <FolderOpen className="w-3 h-3 text-blue-600" />
                      <span>Expediente ({docs.length})</span>
                    </button>

                    {/* Recibo de Pago */}
                    <button
                      type="button"
                      onClick={() => handleOpenPayrollModal(emp)}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                      title="Generar e imprimir recibo de pago"
                    >
                      <DollarSign className="w-3 h-3 text-emerald-600" />
                      <span>Recibo</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Constancia de Trabajo */}
                    <button
                      type="button"
                      onClick={() => {
                        const constPlantilla = plantillas.find(p => p.tipo === 'CONSTANCIA') || DEFAULT_PLANTILLAS.find(p => p.tipo === 'CONSTANCIA') || plantillas[0];
                        generateDocumentDraft(emp, constPlantilla);
                      }}
                      className="bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[11px] font-bold px-2 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      title="Emitir constancia de trabajo editable"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Constancia</span>
                    </button>

                    {/* Contrato de Trabajo */}
                    <button
                      type="button"
                      onClick={() => {
                        const contPlantilla = plantillas.find(p => p.tipo === 'CONTRATO') || DEFAULT_PLANTILLAS.find(p => p.tipo === 'CONTRATO') || plantillas[1] || plantillas[0];
                        generateDocumentDraft(emp, contPlantilla);
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-2 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      title="Generar contrato individual de trabajo"
                    >
                      <FileCode className="w-3 h-3" />
                      <span>Contrato</span>
                    </button>

                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => handleOpenForm(emp)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title="Editar ficha"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDeleteEmpleado(emp)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Eliminar empleado"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* =========================================================
          MODAL: CREAR / EDITAR TRABAJADOR
         ========================================================= */}
      {showFormModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-black uppercase tracking-wider">
                  {editingEmp ? 'Editar Ficha del Trabajador' : 'Registrar Nuevo Trabajador'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-white text-xl font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
              {/* Sección de Foto del Trabajador */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center gap-4">
                <div className="relative group shrink-0">
                  <div className="w-20 h-20 rounded-2xl bg-white border-2 border-slate-300 shadow-sm flex items-center justify-center overflow-hidden">
                    {formFotoUrl ? (
                      <img 
                        src={formatImageUrl(formFotoUrl)} 
                        alt="Foto Trabajador" 
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="text-center p-1">
                        <Camera className="w-6 h-6 text-slate-400 mx-auto mb-0.5" />
                        <span className="text-[9px] text-slate-400 font-bold block">Sin Foto</span>
                      </div>
                    )}
                  </div>
                  {formFotoUrl && (
                    <button
                      type="button"
                      onClick={() => setFormFotoUrl('')}
                      className="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-1 shadow-md transition-all cursor-pointer"
                      title="Quitar Foto"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex-1 space-y-2 w-full">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-blue-600" />
                      <span>Foto del Trabajador (Opcional)</span>
                    </label>
                    <p className="text-[10.5px] text-slate-500">
                      Sube una fotografía de carnet del empleado (JPG, PNG o WEBP).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="bg-white border border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-700 text-xs font-bold py-2 px-3.5 rounded-xl cursor-pointer flex items-center gap-2 transition-all shadow-2xs">
                      <UploadCloud className="w-4 h-4 text-blue-600" />
                      <span>{formFotoUrl ? 'Cambiar Archivo' : 'Subir Archivo'}</span>
                      <input
                        ref={formPhotoFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadPhotoFile(file);
                        }}
                      />
                    </label>

                    <div className="relative flex-1 min-w-[220px]">
                      <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="O pegar URL/Enlace de la imagen (https://...)"
                        value={formFotoUrl}
                        onChange={(e) => setFormFotoUrl(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600 font-mono shadow-2xs"
                      />
                    </div>

                    {formFotoUrl && (
                      <button
                        type="button"
                        onClick={() => setFormFotoUrl('')}
                        className="text-xs text-rose-600 hover:text-rose-800 font-bold px-3 py-2 rounded-xl hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Quitar</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Nombre y Apellidos *</label>
                  <input
                    type="text"
                    placeholder="Ej: CARLOS MANUEL PÉREZ"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Cédula de Identidad *</label>
                  <input
                    type="text"
                    placeholder="Ej: V-18.450.120"
                    value={formCedula}
                    onChange={(e) => setFormCedula(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-mono font-bold focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">RIF Personal (SENIAT)</label>
                  <input
                    type="text"
                    placeholder="Ej: V-18450120-1"
                    value={formRif}
                    onChange={(e) => setFormRif(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-mono focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Teléfono de Contacto</label>
                  <input
                    type="text"
                    placeholder="Ej: 0414-1234567"
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Cargo / Puesto *</label>
                  <input
                    type="text"
                    placeholder="Ej: CAJERO / ENCARGADO"
                    value={formCargo}
                    onChange={(e) => setFormCargo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Departamento</label>
                  <select
                    value={formDepto}
                    onChange={(e) => setFormDepto(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:bg-white focus:border-blue-600 focus:outline-none"
                  >
                    <option value="OPERACIONES">OPERACIONES</option>
                    <option value="VENTAS">VENTAS / CAJA</option>
                    <option value="ALMACEN">ALMACÉN / INVENTARIO</option>
                    <option value="ADMINISTRACION">ADMINISTRACIÓN</option>
                    <option value="SERVICIOS">SERVICIOS GENERALES</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Fecha de Ingreso</label>
                  <input
                    type="date"
                    value={formFechaIngreso}
                    onChange={(e) => setFormFechaIngreso(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-mono focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Tipo de Contrato</label>
                  <select
                    value={formTipoContrato}
                    onChange={(e) => setFormTipoContrato(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:bg-white focus:border-blue-600 focus:outline-none"
                  >
                    <option value="INDETERMINADO">Tiempo Indeterminado (Fijo)</option>
                    <option value="DETERMINADO">Tiempo Determinado</option>
                    <option value="PRUEBA">Período de Prueba</option>
                    <option value="SERVICIOS">Servicios Profesionales</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Sueldo Base Mensual ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="200"
                    value={formSueldoUSD}
                    onChange={(e) => setFormSueldoUSD(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-emerald-700 font-mono font-bold focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Bono Alimentación / Cestaticket ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="40"
                    value={formBonoUSD}
                    onChange={(e) => setFormBonoUSD(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-emerald-700 font-mono font-bold focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Modalidad de Pago</label>
                  <select
                    value={formModalidad}
                    onChange={(e) => setFormModalidad(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:bg-white focus:border-blue-600 focus:outline-none"
                  >
                    <option value="QUINCENAL">Quincenal (Días 15 y 30)</option>
                    <option value="SEMANAL">Semanal (Viernes o Sábados)</option>
                    <option value="MENSUAL">Mensual</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Estatus del Trabajador</label>
                  <select
                    value={formEstatus}
                    onChange={(e) => setFormEstatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:bg-white focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Vacaciones">Vacaciones</option>
                    <option value="Reposo">Reposo Médico</option>
                    <option value="Liquidado">Liquidado / Egresado</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1 pt-2">
                <label className="font-bold text-slate-700 uppercase">Dirección de Habitación</label>
                <textarea
                  rows={2}
                  placeholder="Dirección completa del domicilio del trabajador..."
                  value={formDireccion}
                  onChange={(e) => setFormDireccion(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="bg-slate-100 px-6 py-3.5 border-t border-slate-200 flex justify-between items-center shrink-0">
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEmpleado}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Guardar Ficha</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: BÓVEDA DE EXPEDIENTE DIGITAL POR EMPLEADO
         ========================================================= */}
      {showExpedienteModal && (() => {
        const activeEmp = empleados.find(e => e.id === showExpedienteModal.id) || showExpedienteModal;
        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2.5">
                  <FolderOpen className="w-5 h-5 text-blue-400" />
                  <div>
                    <h3 className="text-base font-black uppercase tracking-wider">
                      Expediente Digital: {activeEmp.nombre}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Cédula: <strong className="text-slate-200">{activeEmp.cedula}</strong> • Cargo: <strong className="text-slate-200">{activeEmp.cargo}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExpedienteModal(null)}
                  className="text-slate-400 hover:text-white text-xl font-bold transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
                <h4 className="font-extrabold uppercase text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Recaudos Legales Requeridos por Ley (Venezuela / LOTTT)
                </h4>

                <div className="space-y-3">
                  {RECAUDOS_EXPEDIENTE_LEY.map(recaudo => {
                    const doc = (activeEmp.documentos_expediente || []).find(d => d.tipo === recaudo.key);

                    return (
                      <div
                        key={recaudo.key}
                        className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                          doc ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-100' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                            doc ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {doc ? <CheckCircle2 className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 block text-xs truncate">
                              {recaudo.label} {recaudo.req && <strong className="text-rose-600 font-black">*</strong>}
                            </span>
                            {doc ? (
                              <span className="text-[10.5px] text-emerald-800 font-mono block truncate mt-0.5">
                                ✓ <span className="font-bold">{doc.nombre_archivo}</span> • Subido: {doc.fecha_subida}
                              </span>
                            ) : (
                              <span className="text-[10.5px] text-slate-400 block mt-0.5">Pendiente por consignar en físico o digital</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {doc ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (doc.ruta_archivo && doc.ruta_archivo.trim()) {
                                    setPreviewExpedienteDoc({
                                      titulo: recaudo.label,
                                      nombre_archivo: doc.nombre_archivo,
                                      ruta_archivo: doc.ruta_archivo,
                                      empleado_nombre: activeEmp.nombre
                                    });
                                  } else {
                                    showAlert(
                                      `El documento "${doc.nombre_archivo}" fue registrado sin archivo digital adjunto. Puede eliminarlo y adjuntar el archivo PDF o imagen correspondiente para visualizar su previa en pantalla.`,
                                      'Sin Archivo Digital Adjunto',
                                      'info'
                                    );
                                  }
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
                                title="Ver Vista Previa del Documento"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver Previa</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteExpedienteDoc(activeEmp, doc.id, recaudo.label)}
                                className="text-rose-600 hover:bg-rose-100 p-2 rounded-lg cursor-pointer transition-colors border border-rose-200"
                                title="Eliminar documento del expediente"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <label className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-xs transition-all active:scale-95">
                              <Upload className="w-3.5 h-3.5" />
                              <span>Adjuntar</span>
                              <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadExpedienteDoc(activeEmp, recaudo.key, f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setShowExpedienteModal(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer shadow-xs transition-all"
                >
                  Cerrar Expediente
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =========================================================
          SUB-MODAL: VISOR DE VISTA PREVIA DEL DOCUMENTO ADJUNTO
         ========================================================= */}
      {previewExpedienteDoc && (
        <div 
          className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 font-sans animate-in fade-in duration-200 z-[100]"
          style={{ zIndex: 9999 }}
        >
          <div className="bg-white rounded-2xl max-w-4xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Header del Visor */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-sm truncate uppercase tracking-wider">{previewExpedienteDoc.titulo}</h3>
                  <p className="text-xs text-slate-400 truncate">
                    Trabajador: <strong className="text-slate-200">{previewExpedienteDoc.empleado_nombre}</strong> • Archivo: <span className="font-mono text-emerald-400">{previewExpedienteDoc.nombre_archivo}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewExpedienteDoc.ruta_archivo}
                  download={previewExpedienteDoc.nombre_archivo}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700"
                  title="Descargar archivo en disco"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Descargar</span>
                </a>

                <button
                  type="button"
                  onClick={() => setPreviewExpedienteDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 font-bold transition-colors cursor-pointer"
                  title="Cerrar Previa (ESC)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Contenedor del Visor */}
            <div className="flex-1 bg-slate-950 p-2 flex items-center justify-center overflow-auto">
              {previewExpedienteDoc.ruta_archivo.startsWith('data:image') || /\.(png|jpe?g|webp)$/i.test(previewExpedienteDoc.nombre_archivo) ? (
                <img
                  src={previewExpedienteDoc.ruta_archivo}
                  alt={previewExpedienteDoc.titulo}
                  className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
                />
              ) : (
                <iframe
                  src={previewExpedienteDoc.ruta_archivo}
                  title={previewExpedienteDoc.titulo}
                  className="w-full h-full rounded-lg border-0 bg-white shadow-md"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: GENERADOR / EDITOR WYSIWYG EN VIVO DE DOCUMENTOS
         ========================================================= */}
      {showDocGeneratorModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[94vh]">
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider">
                    {showDocGeneratorModal.plantilla.nombre}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Trabajador: <strong className="text-slate-200">{showDocGeneratorModal.empleado.nombre}</strong> • {showDocGeneratorModal.empleado.cedula}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDocGeneratorModal(null)}
                className="text-slate-400 hover:text-white text-xl font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3.5 flex-grow font-sans text-xs bg-white">
              <div className="bg-blue-50/70 border border-blue-200 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-blue-950">
                <div className="flex items-center gap-2 font-bold">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Editor en vivo con herramientas de formato. Ajusta el contenido antes de imprimir:</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700 uppercase text-[10.5px]">Tamaño Papel:</span>
                  <select
                    value={docPaperSize}
                    onChange={(e) => setDocPaperSize(e.target.value as any)}
                    className="bg-white border border-blue-300 text-blue-900 rounded-lg px-2.5 py-1 text-xs font-bold focus:border-blue-600 focus:outline-none cursor-pointer shadow-2xs"
                  >
                    {OPCIONES_TAMANO_PAPEL.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.nombre} ({opt.medidas})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* EDITOR WYSIWYG CON TODAS LAS HERRAMIENTAS */}
              <RichDocumentEditor
                valueHtml={generatedDocHtml}
                onChange={(newHtml) => setGeneratedDocHtml(newHtml)}
                minHeight="380px"
              />
            </div>

            <div className="bg-slate-100 px-6 py-3.5 border-t border-slate-200 flex justify-between items-center shrink-0">
              <button
                type="button"
                onClick={() => setShowDocGeneratorModal(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => handlePrintDocument(showDocGeneratorModal.plantilla.nombre, generatedDocHtml, docPaperSize)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir / Descargar PDF ({OPCIONES_TAMANO_PAPEL.find(o => o.id === docPaperSize)?.nombre.split(' ')[0]})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: GENERADOR DE RECIBOS DE NÓMINA (EDITABLE)
         ========================================================= */}
      {showPayrollModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider">
                    Recibo Oficial de Pago de Nómina
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Trabajador: <strong className="text-slate-200">{showPayrollModal.nombre}</strong> ({showPayrollModal.cedula})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPayrollModal(null)}
                className="text-slate-400 hover:text-white text-xl font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans bg-white">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="font-bold text-slate-700 uppercase block mb-1">Período de Pago</label>
                  <input
                    type="text"
                    value={payrollPeriodo}
                    onChange={(e) => setPayrollPeriodo(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 uppercase block mb-1">Días Laborados</label>
                  <input
                    type="number"
                    value={payrollDias}
                    onChange={(e) => setPayrollDias(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Asignaciones */}
                <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-2.5">
                  <h4 className="font-extrabold text-emerald-950 uppercase border-b border-emerald-200 pb-1 text-xs">
                    Asignaciones ($ USD)
                  </h4>
                  <div>
                    <label className="text-[11px] text-slate-600 block">Sueldo Base del Período ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payrollSueldoUSD}
                      onChange={(e) => setPayrollSueldoUSD(e.target.value)}
                      className="w-full bg-white border border-emerald-300 rounded-lg p-1.5 font-mono font-bold text-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block">Cestaticket / Alimentación ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payrollCestaticketUSD}
                      onChange={(e) => setPayrollCestaticketUSD(e.target.value)}
                      className="w-full bg-white border border-emerald-300 rounded-lg p-1.5 font-mono font-bold text-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block">Bono de Asistencia / Producción ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payrollBonoProdUSD}
                      onChange={(e) => setPayrollBonoProdUSD(e.target.value)}
                      className="w-full bg-white border border-emerald-300 rounded-lg p-1.5 font-mono font-bold text-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block">Horas Extras / Días Feriados ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payrollHorasExtrasUSD}
                      onChange={(e) => setPayrollHorasExtrasUSD(e.target.value)}
                      className="w-full bg-white border border-emerald-300 rounded-lg p-1.5 font-mono font-bold text-emerald-700"
                    />
                  </div>
                </div>

                {/* Deducciones */}
                <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-4 space-y-2.5">
                  <h4 className="font-extrabold text-rose-950 uppercase border-b border-rose-200 pb-1 text-xs">
                    Deducciones ($ USD)
                  </h4>
                  <div>
                    <label className="text-[11px] text-slate-600 block">Seguro Social (IVSS 4%) ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payrollIvssUSD}
                      onChange={(e) => setPayrollIvssUSD(e.target.value)}
                      className="w-full bg-white border border-rose-300 rounded-lg p-1.5 font-mono font-bold text-rose-700"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block">Aporte Habitacional (FAOV 1%) ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payrollFaovUSD}
                      onChange={(e) => setPayrollFaovUSD(e.target.value)}
                      className="w-full bg-white border border-rose-300 rounded-lg p-1.5 font-mono font-bold text-rose-700"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block">Adelantos / Préstamos ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payrollAdelantoUSD}
                      onChange={(e) => setPayrollAdelantoUSD(e.target.value)}
                      className="w-full bg-white border border-rose-300 rounded-lg p-1.5 font-mono font-bold text-rose-700"
                    />
                  </div>
                </div>
              </div>

              {/* Total Calculation Card */}
              {(() => {
                const asig = (parseFloat(payrollSueldoUSD) || 0) + (parseFloat(payrollCestaticketUSD) || 0) + (parseFloat(payrollBonoProdUSD) || 0) + (parseFloat(payrollHorasExtrasUSD) || 0);
                const ded = (parseFloat(payrollIvssUSD) || 0) + (parseFloat(payrollFaovUSD) || 0) + (parseFloat(payrollAdelantoUSD) || 0);
                const netUSD = asig - ded;
                const netBs = netUSD * (tasaDia || 1);

                return (
                  <div className="bg-slate-50 border-2 border-slate-900 text-slate-900 p-4 rounded-xl flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-slate-700 uppercase font-black block mb-0.5">Neto a Cobrar en Bolívares (Tasa BCV {tasaDia?.toFixed(2)}):</span>
                      <strong className="text-base text-slate-950 font-mono font-black">Bs {netBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-700 uppercase font-black block mb-0.5">Neto en Divisas:</span>
                      <strong className="text-xl text-slate-950 font-mono font-black">${netUSD.toFixed(2)} USD</strong>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="bg-slate-100 px-6 py-3.5 border-t border-slate-200 flex justify-between items-center shrink-0">
              <button
                type="button"
                onClick={() => setShowPayrollModal(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => handlePrintPayrollReceipt(showPayrollModal)}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Recibo Duplicado (PDF)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: GESTOR DE PLANTILLAS MAESTRAS DE DOCUMENTOS
         ========================================================= */}
      {showPlantillasMasterModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[94vh]">
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider">
                    Editor de Plantillas Maestras Laborales
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Personaliza las cláusulas, tipografía, sangría y alineaciones estándar de tus contratos y constancias.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPlantillasMasterModal(false)}
                className="text-slate-400 hover:text-white text-xl font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans flex-grow">
              {editingPlantilla ? (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between bg-blue-50/70 p-3 rounded-xl border border-blue-200">
                    <div>
                      <strong className="text-blue-950 block">{editingPlantilla.nombre}</strong>
                      <span className="text-[10px] text-blue-700">{editingPlantilla.descripcion}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingPlantilla(null)}
                      className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
                    >
                      ← Volver a lista de plantillas
                    </button>
                  </div>

                  {/* CONFIGURADOR DE TAMAÑO DE PAPEL */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-800 uppercase flex items-center gap-1.5 text-xs">
                        <Printer className="w-4 h-4 text-blue-600" />
                        Tamaño de Papel Predeterminado de la Plantilla:
                      </label>
                      <span className="text-[10.5px] text-slate-500 font-medium">
                        Configura la proporción física de la página para impresión y exportación a PDF
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1">
                      {OPCIONES_TAMANO_PAPEL.map(opt => {
                        const isSelected = (editingPlantilla.tamano_papel || (editingPlantilla.tipo === 'CONTRATO' ? 'legal' : 'letter')) === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setEditingPlantilla({ ...editingPlantilla, tamano_papel: opt.id })}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? 'bg-blue-50/90 border-blue-600 ring-2 ring-blue-500/20 text-blue-950 shadow-xs'
                                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <strong className="block text-xs font-bold">{opt.nombre}</strong>
                                {opt.id === 'legal' && (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">Contratos</span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{opt.medidas}</span>
                            </div>
                            <span className="text-[9.5px] text-slate-400 block mt-2 italic line-clamp-1">{opt.recomendacion}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <span className="font-bold text-slate-700 block mb-1">
                      💡 Haz clic en cualquier variable para insertarla en el texto:
                    </span>
                    <div className="flex flex-wrap gap-1.5 bg-slate-100 p-2.5 rounded-xl border border-slate-250">
                      {editingPlantilla.variables_disponibles.map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            const newContent = editingPlantilla.contenido + ` <strong>${v}</strong> `;
                            setEditingPlantilla({ ...editingPlantilla, contenido: newContent });
                          }}
                          className="bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 hover:border-blue-400 px-2 py-0.5 rounded font-mono text-[10px] font-bold transition-colors cursor-pointer"
                          title="Insertar en la plantilla"
                        >
                          + {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* WYSIWYG EDITOR EN EL GESTOR DE PLANTILLAS */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 uppercase flex items-center gap-1.5">
                      <Type className="w-4 h-4 text-blue-600" />
                      Texto y Formato de la Plantilla Maestra:
                    </label>
                    <RichDocumentEditor
                      valueHtml={ensureHtmlFormat(editingPlantilla.contenido)}
                      onChange={(newHtml) => setEditingPlantilla({ ...editingPlantilla, contenido: newHtml })}
                      minHeight="320px"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPlantillas(prev => prev.map(p => p.id === editingPlantilla.id ? editingPlantilla : p));
                        setEditingPlantilla(null);
                        showAlert('Plantilla y tamaño de papel guardados exitosamente.', 'Plantilla Actualizada', 'success');
                      }}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
                    >
                      <Save className="w-4 h-4" />
                      <span>Guardar Formato y Tamaño de Papel</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {plantillas.map(pl => {
                    const currentPaper = OPCIONES_TAMANO_PAPEL.find(o => o.id === (pl.tamano_papel || (pl.tipo === 'CONTRATO' ? 'legal' : 'letter')));
                    return (
                      <div
                        key={pl.id}
                        className="bg-white border border-slate-200 hover:border-blue-300 p-4 rounded-xl shadow-xs flex items-center justify-between gap-4 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            pl.tipo === 'RECIBO_NOMINA' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-blue-50 text-blue-600 border border-blue-100'
                          }`}>
                            {pl.tipo === 'RECIBO_NOMINA' ? <DollarSign className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <strong className="text-slate-800 block text-xs">{pl.nombre}</strong>
                              {currentPaper && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium border border-slate-200">
                                  {currentPaper.nombre}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 block">{pl.descripcion}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setEditingPlantilla(pl)}
                          className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors border border-blue-200 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar Formato y Papel</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowPlantillasMasterModal(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: GESTIÓN DE FOTO DEL TRABAJADOR (CLIC DERECHO / CLIC)
         ========================================================= */}
      {photoActionTarget && (
        <div 
          onClick={() => { setPhotoActionTarget(null); }}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-5 py-3.5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-black uppercase tracking-wide">
                  Foto de {photoActionTarget.nombre}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setPhotoActionTarget(null); }}
                className="text-slate-400 hover:text-white text-lg font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs font-sans">
              {/* Preview Box */}
              <div className="flex items-center gap-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div className="w-16 h-16 rounded-2xl bg-white border-2 border-slate-300 shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
                  {photoActionTarget.foto_url ? (
                    <img
                      src={formatImageUrl(photoActionTarget.foto_url)}
                      alt={photoActionTarget.nombre}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-800 to-blue-900 text-white font-black text-2xl flex items-center justify-center">
                      {photoActionTarget.nombre.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="block text-sm font-black text-slate-900 uppercase truncate">
                    {photoActionTarget.nombre}
                  </strong>
                  <span className="text-slate-500 font-mono text-[11px] block">
                    CI: {photoActionTarget.cedula} • {photoActionTarget.cargo}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {photoActionTarget.foto_url ? 'Foto de carnet asignada' : 'Sin foto de perfil'}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                {/* Subir archivo desde la computadora */}
                <label className="w-full bg-blue-50 hover:bg-blue-100 border-2 border-dashed border-blue-300 hover:border-blue-500 p-3.5 rounded-xl flex items-center justify-between transition-all cursor-pointer shadow-2xs group">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
                      <UploadCloud className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <strong className="text-xs text-blue-950 block font-bold">
                        {photoActionTarget.foto_url ? 'Cambiar Foto desde la Computadora' : 'Subir Foto desde la Computadora'}
                      </strong>
                      <span className="text-[10.5px] text-blue-700/80 block">JPG, PNG o WEBP</span>
                    </div>
                  </div>
                  <input
                    ref={photoFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadPhotoFile(file, photoActionTarget.id);
                    }}
                  />
                </label>

                {/* Pegar Enlace / URL de Foto */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>Dirección de Enlace / URL de la Foto:</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="https://ejemplo.com/foto.jpg"
                      value={photoInputUrl}
                      onChange={(e) => setPhotoInputUrl(e.target.value)}
                      className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-600 font-mono shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleSavePhotoUrl(photoInputUrl, photoActionTarget.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-xs cursor-pointer active:scale-95 transition-all"
                    >
                      Guardar
                    </button>
                  </div>
                </div>

                {/* Eliminar Foto */}
                {photoActionTarget.foto_url && (
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(photoActionTarget.id)}
                    className="w-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 p-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors font-bold text-xs cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar Fotografía Actual</span>
                  </button>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setPhotoActionTarget(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
