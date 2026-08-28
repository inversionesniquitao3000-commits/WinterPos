import { useState, useEffect, useMemo, useRef } from 'react';
import { Empleado, ExpedienteDocumentoEmpleado, PlantillaDocumentoLaboral, User, CompanyConfig } from '../types';
import { useDialog } from '../hooks/useDialog';
import { getLocalDateStr } from '../utils';
import { 
  Users, UserPlus, FileText, DollarSign, ShieldCheck, Search, 
  Trash2, Edit3, Eye, Printer, CheckCircle2, 
  Upload, FileCode, Sparkles, Copy, Save, FolderOpen,
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo, Redo, RemoveFormatting, Minus, Type
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

const DEFAULT_PLANTILLAS: PlantillaDocumentoLaboral[] = [
  {
    id: 'CONSTANCIA',
    tipo: 'CONSTANCIA',
    nombre: 'Constancia de Trabajo Formal',
    descripcion: 'Documento membretado para trámites bancarios, consulares o personales.',
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

  const exec = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleApplyLineHeight = (lh: string) => {
    setLineHeight(lh);
    if (editorRef.current) {
      editorRef.current.style.lineHeight = lh;
      onChange(editorRef.current.innerHTML);
    }
  };

  return (
    <div className="border border-slate-300 rounded-2xl overflow-hidden bg-white shadow-xs focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-100 transition-all flex flex-col">
      {/* TOOLBAR SUPERIOR CON HERRAMIENTAS DE FORMATO */}
      <div className="bg-slate-100/90 border-b border-slate-250 px-3 py-2 flex flex-wrap items-center gap-1 text-slate-700 select-none">
        
        {/* Deshacer / Rehacer */}
        <div className="flex items-center bg-white rounded-lg border border-slate-250 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => exec('undo')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-indigo-600 transition-colors"
            title="Deshacer (Ctrl+Z)"
          >
            <Undo className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => exec('redo')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-indigo-600 transition-colors"
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
            onClick={() => exec('bold')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 font-bold transition-colors"
            title="Negrita (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => exec('italic')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 italic transition-colors"
            title="Cursiva (Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => exec('underline')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 underline transition-colors"
            title="Subrayado (Ctrl+U)"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => exec('strikeThrough')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 transition-colors"
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
            onClick={() => exec('justifyLeft')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 transition-colors"
            title="Alinear a la Izquierda"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => exec('justifyCenter')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 transition-colors"
            title="Centrar Texto"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => exec('justifyRight')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 transition-colors"
            title="Alinear a la Derecha"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => exec('justifyFull')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 transition-colors"
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
            onClick={() => exec('insertUnorderedList')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 transition-colors"
            title="Lista con Viñetas"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => exec('insertOrderedList')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 transition-colors"
            title="Lista Numerada"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-5 w-px bg-slate-300 mx-1" />

        {/* Tipo de Bloque / Encabezado */}
        <div className="flex items-center gap-1.5">
          <select
            onChange={(e) => {
              if (e.target.value) exec('formatBlock', e.target.value);
            }}
            defaultValue="p"
            className="bg-white border border-slate-250 rounded-lg text-[11px] px-2 py-1 text-slate-700 font-bold focus:outline-none focus:border-indigo-600 shadow-2xs"
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
            onChange={(e) => handleApplyLineHeight(e.target.value)}
            className="bg-white border border-slate-250 rounded-lg text-[11px] px-2 py-1 text-slate-700 font-bold focus:outline-none focus:border-indigo-600 shadow-2xs"
            title="Interlineado / Espaciado entre líneas"
          >
            <option value="1.3">Espaciado Compacto (1.3)</option>
            <option value="1.7">Espaciado Normal (1.7)</option>
            <option value="2.0">Espaciado Doble (2.0)</option>
          </select>
        </div>

        <div className="h-5 w-px bg-slate-300 mx-1" />

        {/* Utilidades: Línea Horizontal y Limpiar Formato */}
        <div className="flex items-center bg-white rounded-lg border border-slate-250 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => exec('insertHorizontalRule')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 transition-colors"
            title="Insertar Línea Divisoria"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
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
      if (saved) return JSON.parse(saved);
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
  const [showDocGeneratorModal, setShowDocGeneratorModal] = useState<{ empleado: Empleado; plantilla: PlantillaDocumentoLaboral } | null>(null);
  const [generatedDocHtml, setGeneratedDocHtml] = useState('');
  const [showPayrollModal, setShowPayrollModal] = useState<Empleado | null>(null);
  const [showPlantillasMasterModal, setShowPlantillasMasterModal] = useState(false);
  const [editingPlantilla, setEditingPlantilla] = useState<PlantillaDocumentoLaboral | null>(null);

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
  const [formEstatus, setFormEstatus] = useState<'Activo' | 'Vacaciones' | 'Reposo' | 'Liquidado'>('Activo');

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
  }, [showDocGeneratorModal, showPayrollModal, showExpedienteModal, showFormModal, showPlantillasMasterModal]);

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
      setFormEstatus(emp.estatus || 'Activo');
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
      setFormEstatus('Activo');
    }
    setShowFormModal(true);
  };

  // Save Employee
  const handleSaveEmpleado = () => {
    if (!formNombre.trim() || !formCedula.trim() || !formCargo.trim()) {
      showAlert('Nombre, Cédula y Cargo son campos obligatorios.', 'Datos Incompletos', 'warning');
      return;
    }

    const sueldoNum = parseFloat(formSueldoUSD) || 0;
    const bonoNum = parseFloat(formBonoUSD) || 0;

    if (editingEmp) {
      setEmpleados(prev => prev.map(e => e.id === editingEmp.id ? {
        ...e,
        nombre: formNombre.trim().toUpperCase(),
        cedula: formCedula.trim().toUpperCase(),
        rif: formRif.trim().toUpperCase(),
        telefono: formTelefono.trim(),
        correo: formCorreo.trim(),
        direccion: formDireccion.trim(),
        cargo: formCargo.trim().toUpperCase(),
        departamento: formDepto.trim().toUpperCase(),
        fecha_ingreso: formFechaIngreso,
        tipo_contrato: formTipoContrato,
        sueldo_base_usd: sueldoNum,
        bono_alimentacion_usd: bonoNum,
        modalidad_pago: formModalidad,
        banco_pago: formBanco,
        cuenta_bancaria: formCuenta.trim(),
        estatus: formEstatus
      } : e));
      showAlert('Ficha del empleado actualizada exitosamente.', 'Empleado Actualizado', 'success');
    } else {
      const newEmp: Empleado = {
        id: `EMP-${Date.now().toString().slice(-4)}`,
        nombre: formNombre.trim().toUpperCase(),
        cedula: formCedula.trim().toUpperCase(),
        rif: formRif.trim().toUpperCase(),
        telefono: formTelefono.trim(),
        correo: formCorreo.trim(),
        direccion: formDireccion.trim(),
        cargo: formCargo.trim().toUpperCase(),
        departamento: formDepto.trim().toUpperCase(),
        fecha_ingreso: formFechaIngreso,
        tipo_contrato: formTipoContrato,
        sueldo_base_usd: sueldoNum,
        bono_alimentacion_usd: bonoNum,
        modalidad_pago: formModalidad,
        banco_pago: formBanco,
        cuenta_bancaria: formCuenta.trim(),
        estatus: formEstatus,
        created_at: getLocalDateStr(),
        documentos_expediente: []
      };
      setEmpleados(prev => [newEmp, ...prev]);
      showAlert('Nuevo empleado registrado exitosamente.', 'Registro Completado', 'success');
    }
    setShowFormModal(false);
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
  const generateDocumentDraft = (emp: Empleado, plantilla: PlantillaDocumentoLaboral) => {
    const sueldoUSD = emp.sueldo_base_usd || 0;
    const sueldoBs = (sueldoUSD * (tasaDia || 1)).toFixed(2);
    const cestaticketUSD = emp.bono_alimentacion_usd || 40;

    let content = ensureHtmlFormat(plantilla.contenido);
    content = content.replace(/{NOMBRE_EMPLEADO}/g, emp.nombre);
    content = content.replace(/{CEDULA_EMPLEADO}/g, emp.cedula);
    content = content.replace(/{RIF_EMPLEADO}/g, emp.rif || emp.cedula);
    content = content.replace(/{DIRECCION_EMPLEADO}/g, emp.direccion || 'Domicilio en la ciudad');
    content = content.replace(/{TELEFONO_EMPLEADO}/g, emp.telefono || 'N/A');
    content = content.replace(/{CARGO}/g, emp.cargo);
    content = content.replace(/{DEPARTAMENTO}/g, emp.departamento || 'OPERACIONES');
    content = content.replace(/{FECHA_INGRESO}/g, emp.fecha_ingreso);
    content = content.replace(/{SUELDO_MENSUAL_USD}/g, `$${sueldoUSD.toFixed(2)}`);
    content = content.replace(/{SUELDO_MENSUAL_BS}/g, `Bs ${sueldoBs}`);
    content = content.replace(/{CESTATICKET_USD}/g, `$${cestaticketUSD.toFixed(2)}`);
    content = content.replace(/{MODALIDAD_PAGO}/g, emp.modalidad_pago.toLowerCase());
    content = content.replace(/{NOMBRE_EMPRESA}/g, companyName);
    content = content.replace(/{RIF_EMPRESA}/g, companyRif);
    content = content.replace(/{DIRECCION_EMPRESA}/g, companyAddress);
    content = content.replace(/{REPRESENTANTE_LEGAL}/g, companyRep);
    content = content.replace(/{FECHA_ACTUAL}/g, new Date().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' }));

    setGeneratedDocHtml(content);
    setShowDocGeneratorModal({ empleado: emp, plantilla });
  };

  // Print generated document
  const handlePrintDocument = (title: string, htmlContent: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showAlert('Habilite las ventanas emergentes (popups) para imprimir.', 'Popups Bloqueados', 'warning');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} - ${companyName}</title>
          <style>
            @page { size: letter; margin: 25mm 20mm 20mm 20mm; }
            body { font-family: 'Times New Roman', Times, serif; color: #000; line-height: 1.7; font-size: 12.5pt; margin: 0; padding: 20px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 30px; }
            .header h1 { margin: 0; font-size: 15pt; text-transform: uppercase; font-weight: bold; }
            .header p { margin: 2px 0 0 0; font-size: 9.5pt; }
            .content { text-align: justify; }
            .content p { margin-bottom: 14px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${companyName}</h1>
            <p><strong>RIF:</strong> ${companyRif} | <strong>Dirección:</strong> ${companyAddress}</p>
          </div>

          <div class="content">${htmlContent}</div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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

  // Print Payroll Receipt
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

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showAlert('Habilite los popups en el navegador para imprimir el recibo.', 'Aviso', 'warning');
      return;
    }

    const renderReceiptHalf = (copyLabel: string) => `
      <div style="border: 1.5px solid #0f172a; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px;">
          <div>
            <h2 style="margin: 0; font-size: 13px; font-weight: 800; text-transform: uppercase;">${companyName}</h2>
            <p style="margin: 2px 0 0 0; font-size: 9.5px; color: #475569;">RIF: ${companyRif} | ${companyAddress}</p>
          </div>
          <div style="text-align: right;">
            <span style="background: #0f172a; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: bold; text-transform: uppercase;">${copyLabel}</span>
            <p style="margin: 3px 0 0 0; font-size: 9px; font-weight: bold;">Período: ${payrollPeriodo}</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 10px;">
          <div><strong>TRABAJADOR:</strong> ${emp.nombre}</div>
          <div><strong>CÉDULA / RIF:</strong> ${emp.cedula}</div>
          <div><strong>CARGO:</strong> ${emp.cargo}</div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div>
            <h4 style="margin: 0 0 4px 0; border-bottom: 1px solid #0f172a; padding-bottom: 2px; font-size: 10px; font-weight: bold;">ASIGNACIONES / INGRESOS</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 9.5px;">
              <tr><td>Sueldo Base (${payrollDias} días):</td><td style="text-align: right; font-family: monospace; font-weight: bold;">$${sueldo.toFixed(2)}</td></tr>
              <tr><td>Bono Alimentación (Cestaticket):</td><td style="text-align: right; font-family: monospace; font-weight: bold;">$${cesta.toFixed(2)}</td></tr>
              ${bono > 0 ? `<tr><td>Bono de Producción / Asistencia:</td><td style="text-align: right; font-family: monospace;">$${bono.toFixed(2)}</td></tr>` : ''}
              ${he > 0 ? `<tr><td>Horas Extras / Feriados:</td><td style="text-align: right; font-family: monospace;">$${he.toFixed(2)}</td></tr>` : ''}
              <tr style="border-top: 1px solid #cbd5e1; font-weight: bold;"><td>TOTAL ASIGNACIONES:</td><td style="text-align: right; font-family: monospace; color: #059669;">$${totAsigUSD.toFixed(2)}</td></tr>
            </table>
          </div>

          <div>
            <h4 style="margin: 0 0 4px 0; border-bottom: 1px solid #0f172a; padding-bottom: 2px; font-size: 10px; font-weight: bold;">DEDUCCIONES LEGALES / RETENCIONES</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 9.5px;">
              <tr><td>Seguro Social Obligatorio (IVSS 4%):</td><td style="text-align: right; font-family: monospace;">$${ivss.toFixed(2)}</td></tr>
              <tr><td>Aporte Habitacional (FAOV 1%):</td><td style="text-align: right; font-family: monospace;">$${faov.toFixed(2)}</td></tr>
              ${adelanto > 0 ? `<tr><td>Adelantos / Préstamos:</td><td style="text-align: right; font-family: monospace; color: #dc2626;">-$${adelanto.toFixed(2)}</td></tr>` : ''}
              <tr style="border-top: 1px solid #cbd5e1; font-weight: bold;"><td>TOTAL DEDUCCIONES:</td><td style="text-align: right; font-family: monospace; color: #dc2626;">-$${totDeducUSD.toFixed(2)}</td></tr>
            </table>
          </div>
        </div>

        <div style="margin-top: 12px; padding: 8px 12px; background: #0f172a; color: #fff; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="font-size: 9px; text-transform: uppercase; color: #94a3b8;">NETO A COBRAR EN BOLÍVARES (TASA BCV ${rate.toFixed(2)}):</span>
            <strong style="display: block; font-size: 13px; font-family: monospace; color: #4ade80;">Bs ${netoVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 9px; text-transform: uppercase; color: #94a3b8;">NETO EN DIVISAS:</span>
            <strong style="display: block; font-size: 15px; font-family: monospace; color: #38bdf8;">$${netoUSD.toFixed(2)} USD</strong>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-top: 35px; text-align: center; font-size: 9px;">
          <div style="width: 40%; border-top: 1px solid #94a3b8; padding-top: 4px;">
            <strong>POR LA EMPRESA</strong><br/>
            ${companyName}
          </div>
          <div style="width: 40%; border-top: 1px solid #94a3b8; padding-top: 4px;">
            <strong>CONFORME EL TRABAJADOR</strong><br/>
            ${emp.nombre} (CI: ${emp.cedula})
          </div>
        </div>
      </div>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Recibo de Pago - ${emp.nombre}</title>
          <style>
            @page { size: letter; margin: 10mm; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          ${renderReceiptHalf('ORIGINAL: EMPRESA')}
          <div style="border-bottom: 1px dashed #cbd5e1; margin: 15px 0;"></div>
          ${renderReceiptHalf('COPIA: TRABAJADOR')}

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Upload Document to Employee Expediente
  const handleUploadExpedienteDoc = (emp: Empleado, tipo: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const newDoc: ExpedienteDocumentoEmpleado = {
        id: `DOC-${Date.now()}`,
        tipo: tipo as any,
        titulo: `${RECAUDOS_EXPEDIENTE_LEY.find(r => r.key === tipo)?.label || tipo}`,
        nombre_archivo: file.name,
        ruta_archivo: reader.result as string,
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

      showAlert(`Documento "${file.name}" cargado exitosamente en el expediente de ${emp.nombre}.`, 'Documento Guardado', 'success');
    };
    reader.readAsDataURL(file);
  };

  // Delete Document from Expediente
  const handleDeleteExpedienteDoc = (emp: Empleado, docId: string) => {
    setEmpleados(prev => prev.map(e => {
      if (e.id === emp.id) {
        return { ...e, documentos_expediente: (e.documentos_expediente || []).filter(d => d.id !== docId) };
      }
      return e;
    }));
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200 font-sans">
      
      {/* ACTION BAR & FILTERS HEADER */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-200">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-mono">DIRECTORIO DE TRABAJADORES</h3>
              <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-indigo-200">LOTTT / RRHH</span>
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
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-all border border-slate-300 cursor-pointer"
            title="Editar formatos maestros de Contratos, Constancias y Vacaciones"
          >
            <FileCode className="w-3.5 h-3.5 text-indigo-600" />
            <span>⚙️ Plantillas de Documentos</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenForm()}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
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
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
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
            <strong className="text-2xl font-black text-indigo-600 font-mono">{metricStats.compliancePct}%</strong>
            <span className="text-xs text-slate-500 font-medium block mt-0.5">Recaudos de ley entregados</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Plantillas Parametrizadas</span>
            <strong className="text-2xl font-black text-slate-800">{plantillas.length}</strong>
            <span className="text-xs text-indigo-600 font-bold block mt-0.5">Contratos, Constancias y Recibos</span>
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
            className="w-full bg-slate-50 border border-slate-250 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 transition-all font-sans"
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
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* EMPLOYEE CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredEmpleados.length === 0 ? (
          <div className="col-span-2 bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
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
                className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
              >
                <div>
                  {/* Top Bar with Avatar & Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-black text-lg flex items-center justify-center shadow-inner">
                        {emp.nombre.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase">
                          {emp.nombre}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-mono">
                          <span className="font-bold text-slate-700">{emp.cedula}</span>
                          {emp.rif && <span>• {emp.rif}</span>}
                        </div>
                      </div>
                    </div>

                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                      emp.estatus === 'Activo' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      emp.estatus === 'Vacaciones' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      emp.estatus === 'Reposo' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {emp.estatus}
                    </span>
                  </div>

                  {/* Info Tags */}
                  <div className="grid grid-cols-2 gap-2 mt-4 text-xs bg-slate-50 p-3 rounded-xl border border-slate-150">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Cargo / Puesto</span>
                      <strong className="text-slate-800 block truncate">{emp.cargo}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Sueldo Base ($ USD)</span>
                      <strong className="text-emerald-700 font-mono block">${(emp.sueldo_base_usd || 0).toFixed(2)} ({emp.modalidad_pago})</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Fecha Ingreso</span>
                      <span className="text-slate-600 font-mono font-medium block">{emp.fecha_ingreso}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Expediente LOTTT</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="flex-1 bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${empCompliance === 100 ? 'bg-emerald-500' : empCompliance >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${empCompliance}%` }}
                          />
                        </div>
                        <span className="font-bold text-[10px] font-mono text-slate-700">{empCompliance}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Toolbar */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Expediente Digital */}
                    <button
                      type="button"
                      onClick={() => setShowExpedienteModal(emp)}
                      className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Ver y adjuntar documentos del expediente laboral"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Expediente ({docs.length})</span>
                    </button>

                    {/* Recibo de Pago */}
                    <button
                      type="button"
                      onClick={() => handleOpenPayrollModal(emp)}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Generar e imprimir recibo de pago quincenal / semanal"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Recibo Nómina</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Constancia de Trabajo */}
                    <button
                      type="button"
                      onClick={() => {
                        const constPlantilla = plantillas.find(p => p.tipo === 'CONSTANCIA') || plantillas[0];
                        generateDocumentDraft(emp, constPlantilla);
                      }}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                      title="Emitir constancia de trabajo editable con herramientas de formato"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Constancia</span>
                    </button>

                    {/* Contrato de Trabajo */}
                    <button
                      type="button"
                      onClick={() => {
                        const contPlantilla = plantillas.find(p => p.tipo === 'CONTRATO') || plantillas[1];
                        generateDocumentDraft(emp, contPlantilla);
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                      title="Generar contrato individual de trabajo"
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>Contrato</span>
                    </button>

                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => handleOpenForm(emp)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                      title="Editar ficha"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDeleteEmpleado(emp)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Eliminar empleado"
                    >
                      <Trash2 className="w-4 h-4" />
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
        <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-5 h-5 text-indigo-300" />
                <h3 className="text-base font-black uppercase tracking-wider">
                  {editingEmp ? 'Editar Ficha del Trabajador' : 'Registrar Nuevo Trabajador'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="text-indigo-200 hover:text-white text-xl font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Nombre y Apellidos *</label>
                  <input
                    type="text"
                    placeholder="Ej: CARLOS MANUEL PÉREZ"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:bg-white focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Cédula de Identidad *</label>
                  <input
                    type="text"
                    placeholder="Ej: V-18.450.120"
                    value={formCedula}
                    onChange={(e) => setFormCedula(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-mono font-bold focus:bg-white focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">RIF Personal (SENIAT)</label>
                  <input
                    type="text"
                    placeholder="Ej: V-18450120-1"
                    value={formRif}
                    onChange={(e) => setFormRif(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-mono focus:bg-white focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Teléfono de Contacto</label>
                  <input
                    type="text"
                    placeholder="Ej: 0414-1234567"
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 focus:bg-white focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Cargo / Puesto *</label>
                  <input
                    type="text"
                    placeholder="Ej: CAJERO / ENCARGADO"
                    value={formCargo}
                    onChange={(e) => setFormCargo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:bg-white focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Departamento</label>
                  <select
                    value={formDepto}
                    onChange={(e) => setFormDepto(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:bg-white focus:border-indigo-600 focus:outline-none"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-mono focus:bg-white focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Tipo de Contrato</label>
                  <select
                    value={formTipoContrato}
                    onChange={(e) => setFormTipoContrato(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:bg-white focus:border-indigo-600 focus:outline-none"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-emerald-700 font-mono font-bold focus:bg-white focus:border-indigo-600 focus:outline-none"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-emerald-700 font-mono font-bold focus:bg-white focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 uppercase">Modalidad de Pago</label>
                  <select
                    value={formModalidad}
                    onChange={(e) => setFormModalidad(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:bg-white focus:border-indigo-600 focus:outline-none"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:bg-white focus:border-indigo-600 focus:outline-none"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 focus:bg-white focus:border-indigo-600 focus:outline-none"
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
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
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
      {showExpedienteModal && (
        <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-purple-800 to-indigo-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <FolderOpen className="w-5 h-5 text-purple-300" />
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider">
                    Expediente Digital: {showExpedienteModal.nombre}
                  </h3>
                  <p className="text-[11px] text-purple-200">
                    Cédula: {showExpedienteModal.cedula} • Cargo: {showExpedienteModal.cargo}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExpedienteModal(null)}
                className="text-purple-200 hover:text-white text-xl font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
              <h4 className="font-extrabold uppercase text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                Recaudos Legales Requeridos por Ley (Venezuela / LOTTT)
              </h4>

              <div className="space-y-3">
                {RECAUDOS_EXPEDIENTE_LEY.map(recaudo => {
                  const doc = (showExpedienteModal.documentos_expediente || []).find(d => d.tipo === recaudo.key);

                  return (
                    <div
                      key={recaudo.key}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                        doc ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          doc ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {doc ? <CheckCircle2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        </div>
                        <div>
                          <span className="font-bold text-slate-800 block text-xs">
                            {recaudo.label} {recaudo.req && <strong className="text-rose-600">*</strong>}
                          </span>
                          {doc ? (
                            <span className="text-[10.5px] text-emerald-700 font-mono block">
                              ✓ {doc.nombre_archivo} • Subido el {doc.fecha_subida}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 block">Pendiente por consignar en físico o digital</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {doc ? (
                          <>
                            {doc.ruta_archivo && (
                              <button
                                type="button"
                                onClick={() => {
                                  const win = window.open();
                                  win?.document.write(`<iframe src="${doc.ruta_archivo}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3 h-3" /> Ver
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteExpedienteDoc(showExpedienteModal, doc.id)}
                              className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg cursor-pointer"
                              title="Eliminar documento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <label className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-xs">
                            <Upload className="w-3 h-3" />
                            <span>Adjuntar</span>
                            <input
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUploadExpedienteDoc(showExpedienteModal, recaudo.key, f);
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
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Cerrar Expediente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: GENERADOR / EDITOR WYSIWYG EN VIVO DE DOCUMENTOS
         ========================================================= */}
      {showDocGeneratorModal && (
        <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[94vh]">
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-amber-300" />
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider">
                    {showDocGeneratorModal.plantilla.nombre}
                  </h3>
                  <p className="text-[11px] text-indigo-200">
                    Trabajador: {showDocGeneratorModal.empleado.nombre} • {showDocGeneratorModal.empleado.cedula}
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

            <div className="p-6 overflow-y-auto space-y-3.5 flex-grow font-sans text-xs">
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center justify-between text-amber-900">
                <span className="flex items-center gap-2 font-bold">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  Barra de herramientas disponible: puedes centrar, alinear, cambiar interlineado y aplicar negritas antes de imprimir:
                </span>
                <span className="text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded font-mono font-bold">Editor Enriquecido</span>
              </div>

              {/* EDITOR WYSIWYG CON TODAS LAS HERRAMIENTAS */}
              <RichDocumentEditor
                valueHtml={generatedDocHtml}
                onChange={(newHtml) => setGeneratedDocHtml(newHtml)}
                minHeight="360px"
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

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = generatedDocHtml;
                    navigator.clipboard.writeText(tempDiv.innerText || tempDiv.textContent || '');
                    showAlert('Texto del documento copiado al portapapeles con éxito.', 'Copiado', 'info');
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Texto</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePrintDocument(showDocGeneratorModal.plantilla.nombre, generatedDocHtml)}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir / Descargar PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: GENERADOR DE RECIBOS DE NÓMINA (EDITABLE)
         ========================================================= */}
      {showPayrollModal && (
        <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="bg-gradient-to-r from-emerald-700 to-teal-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <DollarSign className="w-5 h-5 text-emerald-300" />
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider">
                    Recibo Oficial de Pago de Nómina
                  </h3>
                  <p className="text-[11px] text-emerald-200">
                    Trabajador: {showPayrollModal.nombre} ({showPayrollModal.cedula})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPayrollModal(null)}
                className="text-emerald-200 hover:text-white text-xl font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="font-bold text-slate-700 uppercase block mb-1">Período de Pago</label>
                  <input
                    type="text"
                    value={payrollPeriodo}
                    onChange={(e) => setPayrollPeriodo(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 uppercase block mb-1">Días Laborados</label>
                  <input
                    type="number"
                    value={payrollDias}
                    onChange={(e) => setPayrollDias(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold"
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
                  <div className="bg-slate-900 text-white p-4 rounded-xl flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Neto en Bolívares (Tasa BCV {tasaDia?.toFixed(2)}):</span>
                      <strong className="text-base text-emerald-400 font-mono">Bs {netBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Neto en Divisas ($ USD):</span>
                      <strong className="text-xl text-sky-400 font-mono">${netUSD.toFixed(2)} USD</strong>
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
        <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[94vh]">
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider">
                    Editor de Plantillas Maestras Laborales
                  </h3>
                  <p className="text-[11px] text-indigo-200">
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
                  <div className="flex items-center justify-between bg-indigo-50 p-3 rounded-xl border border-indigo-200">
                    <div>
                      <strong className="text-indigo-950 block">{editingPlantilla.nombre}</strong>
                      <span className="text-[10px] text-indigo-700">{editingPlantilla.descripcion}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingPlantilla(null)}
                      className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                    >
                      ← Volver a lista de plantillas
                    </button>
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
                          className="bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-2 py-0.5 rounded font-mono text-[10px] font-bold transition-colors cursor-pointer"
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
                      <Type className="w-4 h-4 text-indigo-600" />
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
                        showAlert('Plantilla guardada exitosamente.', 'Plantilla Actualizada', 'success');
                      }}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
                    >
                      <Save className="w-4 h-4" />
                      <span>Guardar Formato de Plantilla</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {plantillas.map(pl => (
                    <div
                      key={pl.id}
                      className="bg-white border border-slate-200 hover:border-indigo-300 p-4 rounded-xl shadow-xs flex items-center justify-between gap-4 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <strong className="text-slate-800 block text-xs">{pl.nombre}</strong>
                          <span className="text-[11px] text-slate-500 block">{pl.descripcion}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setEditingPlantilla(pl)}
                        className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors border border-indigo-200 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Editar Formato</span>
                      </button>
                    </div>
                  ))}
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

    </div>
  );
}
