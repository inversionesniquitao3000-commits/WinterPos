import React, { useState, useEffect, useRef } from 'react';
import { CompanyDocument, User } from '../types';
import { useDialog } from '../hooks/useDialog';
import { 
  FileText, Upload, Trash2, Eye, Download, Search, AlertTriangle, 
  CheckCircle2, ShieldCheck, Building2, Calendar, FileCode, Plus, X,
  Clock, RefreshCw, Sparkles, CloudUpload, Edit3, Save,
  LayoutGrid, List, Image as ImageIcon, CheckSquare, Award, MessageSquare,
  History, Printer, PackageCheck
} from 'lucide-react';

interface RepositorioDocumentalProps {
  currentUser: User;
  getApiUrl: (path: string) => string;
  hasPermission?: (modulo: string, accion: 'ver' | 'crear' | 'editar' | 'eliminar') => boolean;
}

const REQUISITOS_LEY_VENEZUELA = [
  { key: 'RIF', label: 'RIF Vigente (SENIAT)', cat: 'SENIAT', req: true, desc: 'Comprobante Digital RIF emitido por el SENIAT' },
  { key: 'REGISTRO', label: 'Acta Constitutiva / Registro Mercantil', cat: 'MERCANTIL', req: true, desc: 'Documento de Registro Mercantil de la Empresa' },
  { key: 'PATENTE', label: 'Licencia Actividades Económicas (Alcaldía)', cat: 'MUNICIPAL', req: true, desc: 'Patente o Licencia de Funcionamiento Municipal' },
  { key: 'BOMBEROS', label: 'Certificado de Conformidad de Bomberos', cat: 'MUNICIPAL', req: true, desc: 'Permiso de Prevención y Protección de Incendios' },
  { key: 'IVSS', label: 'Inscripción Patronal IVSS (Forma 14-02)', cat: 'PARAFISCAL', req: true, desc: 'Registro de Patrono ante el Seguro Social' },
  { key: 'INCES', label: 'Solvencia de Aportes INCES', cat: 'PARAFISCAL', req: true, desc: 'Certificado de Solvencia Tributaria INCES' },
  { key: 'BANAVIH', label: 'Inscripción FAOV / BANAVIH', cat: 'PARAFISCAL', req: true, desc: 'Constancia de Registro Patronal FAOV' },
  { key: 'SALUD', label: 'Permiso Sanitario / Registro de Salud', cat: 'MUNICIPAL', req: false, desc: 'Para empresas de alimentos o salud' }
];

const CATEGORIAS_CONFIG = [
  { id: 'TODOS', label: 'Todos los Documentos', icon: FileText, color: 'text-slate-600' },
  { id: 'SENIAT', label: 'Fiscal & SENIAT', icon: ShieldCheck, color: 'text-blue-600', desc: 'RIF, Formulario IVA, ISLR, Providencias' },
  { id: 'MERCANTIL', label: 'Mercantil & Registro', icon: Building2, color: 'text-purple-600', desc: 'Acta Constitutiva, Asambleas, Cédulas' },
  { id: 'MUNICIPAL', label: 'Patente & Alcaldía', icon: Calendar, color: 'text-amber-600', desc: 'Licencia Act. Económica, Bomberos, Salud' },
  { id: 'PARAFISCAL', label: 'Parafiscales & Ley', icon: CheckCircle2, color: 'text-emerald-600', desc: 'IVSS 14-02, INCES, BANAVIH, Solvencia Laboral' },
  { id: 'OTROS', label: 'Otros Documentos', icon: FileCode, color: 'text-indigo-600', desc: 'Contratos, Títulos, Garantías' }
];

const MESES_ES: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
};

function parseDateStringToISO(dateStr: string): string {
  if (!dateStr) return '';
  const clean = dateStr.replace(/\./g, '/').replace(/-/g, '/');
  const parts = clean.split('/');
  if (parts.length === 3) {
    let d = '', m = '', y = '';
    if (parts[0].length === 4) {
      y = parts[0];
      m = parts[1].padStart(2, '0');
      d = parts[2].padStart(2, '0');
    } else {
      d = parts[0].padStart(2, '0');
      m = parts[1].padStart(2, '0');
      y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    }
    const yearNum = parseInt(y, 10);
    // Sanidad: Año de vencimiento válido para empresas entre 2000 y 2050
    if (yearNum >= 2000 && yearNum <= 2050) {
      return `${y}-${m}-${d}`;
    }
  }
  return '';
}

function autoDetectDates(fileName: string, rawText: string) {
  let detectedVencimiento = '';
  let detectedEmision = '';
  let detectedRequisitoKey = '';
  
  const cleanText = `${fileName} ${rawText}`.replace(/[\r\n\t]+/g, ' ');
  const lowerText = cleanText.toLowerCase();

  // Detección de requisito legal
  if (lowerText.includes('rif') || lowerText.includes('informacion fiscal')) detectedRequisitoKey = 'RIF';
  else if (lowerText.includes('patente') || lowerText.includes('alcaldia') || lowerText.includes('licencia de funcion')) detectedRequisitoKey = 'PATENTE';
  else if (lowerText.includes('bombero') || lowerText.includes('incendio')) detectedRequisitoKey = 'BOMBEROS';
  else if (lowerText.includes('ivss') || lowerText.includes('seguro social') || lowerText.includes('14-02')) detectedRequisitoKey = 'IVSS';
  else if (lowerText.includes('inces')) detectedRequisitoKey = 'INCES';
  else if (lowerText.includes('banavih') || lowerText.includes('faov')) detectedRequisitoKey = 'BANAVIH';
  else if (lowerText.includes('acta constitutiva') || lowerText.includes('mercantil')) detectedRequisitoKey = 'REGISTRO';
  else if (lowerText.includes('sanitario') || lowerText.includes('salud')) detectedRequisitoKey = 'SALUD';

  // 1. Patrón específico SENIAT RIF: "FECHA DE VENCIMIENTO" seguido de hasta 40 caracteres hasta la fecha DD/MM/YYYY
  const seniatVenceMatch = cleanText.match(/FECHA\s*DE\s*VENCIMIENTO[^\d]{0,40}(\d{2}[-/\.]\d{2}[-/\.]\d{4})/i);
  if (seniatVenceMatch) {
    detectedVencimiento = parseDateStringToISO(seniatVenceMatch[1]);
  }

  // 2. Patrón general de vencimiento
  if (!detectedVencimiento) {
    const venceMatch = cleanText.match(/(?:vencimiento|vigencia\s*hasta|expira|valido\s*hasta|hasta)[\s\S]{0,30}?(\d{2}[-/\.]\d{2}[-/\.]\d{4})/i);
    if (venceMatch) {
      detectedVencimiento = parseDateStringToISO(venceMatch[1]);
    }
  }

  // 3. Patrón específico SENIAT para emisión: "FECHA DE ÚLTIMA ACTUALIZACIÓN" o "FECHA DE EMISIÓN"
  const seniatEmisionMatch = cleanText.match(/FECHA\s*DE\s*(?:ÚLTIMA\s*ACTUALIZACIÓN|ULTIMA\s*ACTUALIZACION|EMISIÓN|EMISION|INSCRIPCIÓN|INSCRIPCION)[^\d]{0,40}(\d{2}[-/\.]\d{2}[-/\.]\d{4})/i);
  if (seniatEmisionMatch) {
    detectedEmision = parseDateStringToISO(seniatEmisionMatch[1]);
  }

  // 4. Fechas en español: "02 de Marzo de 2022"
  if (!detectedVencimiento) {
    const spanishDateMatch = lowerText.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(20\d{2})/i);
    if (spanishDateMatch) {
      const day = spanishDateMatch[1].padStart(2, '0');
      const month = MESES_ES[spanishDateMatch[2].toLowerCase()];
      const year = spanishDateMatch[3];
      detectedVencimiento = `${year}-${month}-${day}`;
    }
  }

  // 5. Fallback: Buscar fechas DD/MM/YYYY con año >= 2000
  if (!detectedVencimiento) {
    const anyDateMatches = cleanText.match(/\b(\d{2}[/-]\d{2}[/-]20\d{2})\b/g);
    if (anyDateMatches && anyDateMatches.length > 0) {
      for (let i = anyDateMatches.length - 1; i >= 0; i--) {
        const iso = parseDateStringToISO(anyDateMatches[i]);
        if (iso) {
          detectedVencimiento = iso;
          break;
        }
      }
    }
  }

  return { detectedVencimiento, detectedEmision, detectedRequisitoKey };
}

export const RepositorioDocumental: React.FC<RepositorioDocumentalProps> = ({
  currentUser,
  getApiUrl,
  hasPermission
}) => {
  const { showAlert, showConfirm } = useDialog();

  const [documentos, setDocumentos] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategoria, setSelectedCategoria] = useState<string>('TODOS');
  
  // Tab/Filter: Activos vs Histórico
  const [showHistorico, setShowHistorico] = useState<boolean>(false);
  const [showChecklistModal, setShowChecklistModal] = useState<boolean>(false);
  const [showDossierModal, setShowDossierModal] = useState<boolean>(false);

  // View mode switcher: 'grid' | 'list' | 'mini'
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'mini'>(() => {
    return (localStorage.getItem('pos_docs_view_mode') as any) || 'grid';
  });

  const handleSetViewMode = (mode: 'grid' | 'list' | 'mini') => {
    setViewMode(mode);
    localStorage.setItem('pos_docs_view_mode', mode);
  };

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [previewDoc, setPreviewDoc] = useState<CompanyDocument | null>(null);
  const [editingDoc, setEditingDoc] = useState<CompanyDocument | null>(null);

  // Upload Form State
  const [formData, setFormData] = useState({
    categoria: 'SENIAT' as CompanyDocument['categoria'],
    titulo: '',
    descripcion: '',
    fecha_emision: '',
    fecha_vencimiento: '',
    nombre_archivo: '',
    mime_type: 'application/pdf',
    archivo_base64: '',
    requisito_key: '',
    es_historico: false
  });

  // Edit Form State
  const [editFormData, setEditFormData] = useState({
    categoria: 'SENIAT' as CompanyDocument['categoria'],
    titulo: '',
    descripcion: '',
    fecha_emision: '',
    fecha_vencimiento: '',
    requisito_key: '',
    es_historico: false
  });

  const [uploading, setUploading] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);
  const [scanning, setScanning] = useState<boolean>(false);
  const [sendingWsp, setSendingWsp] = useState<boolean>(false);
  const [scanNotice, setScanNotice] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [selectedFileSize, setSelectedFileSize] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const canCreate = hasPermission ? hasPermission('documentos', 'crear') : true;
  const canEdit = hasPermission ? hasPermission('documentos', 'editar') : true;
  const canDelete = hasPermission ? hasPermission('documentos', 'eliminar') : true;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewDoc) setPreviewDoc(null);
        else if (editingDoc) setEditingDoc(null);
        else if (isUploadOpen) setIsUploadOpen(false);
        else if (showChecklistModal) setShowChecklistModal(false);
        else if (showDossierModal) setShowDossierModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewDoc, editingDoc, isUploadOpen, showChecklistModal, showDossierModal]);

  useEffect(() => {
    fetchDocumentos();
  }, []);

  const fetchDocumentos = async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl('/documentos-empresa'));
      if (res.ok) {
        const data = await res.json();
        setDocumentos(data);
      }
    } catch (err) {
      console.error('Error al obtener repositorio documental:', err);
    } finally {
      setLoading(false);
    }
  };

  const processFile = (file: File) => {
    if (!file) return;

    const sizeKB = file.size / 1024;
    const formattedSize = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(2)} MB` : `${sizeKB.toFixed(1)} KB`;
    setSelectedFileSize(formattedSize);

    setScanNotice('');
    const reader = new FileReader();
    reader.onload = () => {
      const base64Content = reader.result as string;
      let rawText = '';
      try {
        rawText = atob(base64Content.split(',')[1] || '').substring(0, 10000);
      } catch (_) {}
      
      const { detectedVencimiento, detectedEmision, detectedRequisitoKey } = autoDetectDates(file.name, rawText);

      let noticeParts = [];
      if (detectedRequisitoKey) noticeParts.push(`Tipo: ${detectedRequisitoKey}`);
      if (detectedVencimiento) noticeParts.push(`Vencimiento: ${detectedVencimiento}`);
      if (detectedEmision) noticeParts.push(`Emisión: ${detectedEmision}`);

      if (noticeParts.length > 0) {
        setScanNotice(`✨ Detección de ley: ${noticeParts.join(' | ')}`);
      }

      setFormData(prev => ({
        ...prev,
        nombre_archivo: file.name,
        mime_type: file.type || 'application/pdf',
        archivo_base64: base64Content,
        titulo: prev.titulo || file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "),
        fecha_vencimiento: prev.fecha_vencimiento || detectedVencimiento,
        fecha_emision: prev.fecha_emision || detectedEmision,
        requisito_key: prev.requisito_key || detectedRequisitoKey
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titulo || !formData.archivo_base64) {
      showAlert('Por favor complete el título y seleccione un archivo válido.', 'Formulario Incompleto', 'warning');
      return;
    }

    setUploading(true);
    try {
      const res = await fetch(getApiUrl('/documentos-empresa'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          created_by: currentUser.nombre || currentUser.usuario
        })
      });

      if (res.ok) {
        showAlert('✅ Documento guardado exitosamente en la bóveda legal.', 'Documento Guardado', 'success');
        setIsUploadOpen(false);
        setScanNotice('');
        setSelectedFileSize('');
        setFormData({
          categoria: 'SENIAT',
          titulo: '',
          descripcion: '',
          fecha_emision: '',
          fecha_vencimiento: '',
          nombre_archivo: '',
          mime_type: 'application/pdf',
          archivo_base64: '',
          requisito_key: '',
          es_historico: false
        });
        fetchDocumentos();
      } else {
        const errData = await res.json();
        showAlert(`❌ Error al subir documento: ${errData.error || 'Desconocido'}`, 'Error de Carga', 'error');
      }
    } catch (err: any) {
      showAlert(`❌ Error de conexión con el servidor: ${err.message}`, 'Error de Red', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleScanDocumentFile = async (doc: CompanyDocument) => {
    setScanning(true);
    try {
      const res = await fetch(getApiUrl(`/documentos-empresa/${doc.id}/scan`));
      if (res.ok) {
        const data = await res.json();
        if (data.detectedVencimiento || data.detectedEmision) {
          setEditFormData(prev => ({
            ...prev,
            fecha_vencimiento: data.detectedVencimiento || prev.fecha_vencimiento,
            fecha_emision: data.detectedEmision || prev.fecha_emision
          }));
          showAlert(`✨ Fecha de vencimiento SENIAT autodetectada: ${data.detectedVencimiento || 'No hallada'}`, 'Escaneo Exitoso', 'success');
        } else {
          showAlert('No se detectaron fechas explícitas en el texto del archivo.', 'Información', 'info');
        }
      } else {
        showAlert('No se pudo escanear el archivo en el servidor.', 'Error de Escaneo', 'error');
      }
    } catch (err: any) {
      showAlert(`Error de conexión al escanear: ${err.message}`, 'Error', 'error');
    } finally {
      setScanning(false);
    }
  };

  const openEditModal = (doc: CompanyDocument) => {
    setEditingDoc(doc);
    setEditFormData({
      categoria: doc.categoria,
      titulo: doc.titulo,
      descripcion: doc.descripcion || '',
      fecha_emision: doc.fecha_emision || '',
      fecha_vencimiento: doc.fecha_vencimiento || '',
      requisito_key: doc.requisito_key || '',
      es_historico: Boolean(doc.es_historico)
    });

    if (!doc.fecha_vencimiento) {
      handleScanDocumentFile(doc);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;

    setUpdating(true);
    try {
      const res = await fetch(getApiUrl(`/documentos-empresa/${editingDoc.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });

      if (res.ok) {
        showAlert('✅ Datos y estatus del documento actualizados correctamente.', 'Documento Actualizado', 'success');
        setEditingDoc(null);
        fetchDocumentos();
      } else {
        const errData = await res.json();
        showAlert(`❌ Error al actualizar documento: ${errData.error || 'Desconocido'}`, 'Error de Edición', 'error');
      }
    } catch (err: any) {
      showAlert(`❌ Error de conexión: ${err.message}`, 'Error de Red', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleSendWhatsAppNotification = async () => {
    setSendingWsp(true);
    try {
      const res = await fetch(getApiUrl('/documentos-empresa/notificar-whatsapp'), {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.ok !== false) {
        showAlert('📱 Alerta de vencimientos enviada por WhatsApp exitosamente.', 'WhatsApp Enviado', 'success');
      } else {
        showAlert(`⚠️ ${data.error || 'No se pudo enviar el mensaje por WhatsApp. Verifique la conexión en F10.'}`, 'Aviso WhatsApp', 'warning');
      }
    } catch (err: any) {
      showAlert(`Error de conexión al enviar WhatsApp: ${err.message}`, 'Error', 'error');
    } finally {
      setSendingWsp(false);
    }
  };

  const handleDelete = async (id: number | string, titulo: string) => {
    const ok = await showConfirm(
      `¿Está seguro de eliminar permanentemente el documento "${titulo}" del repositorio legal?`,
      'Confirmar Eliminación de Documento',
      { confirmLabel: 'Sí, Eliminar Documento', isDanger: true }
    );
    if (!ok) return;

    try {
      const res = await fetch(getApiUrl(`/documentos-empresa/${id}`), {
        method: 'DELETE'
      });
      if (res.ok) {
        showAlert('🗑️ Documento eliminado exitosamente del repositorio.', 'Documento Eliminado', 'info');
        setDocumentos(prev => prev.filter(d => String(d.id) !== String(id)));
        if (previewDoc && String(previewDoc.id) === String(id)) {
          setPreviewDoc(null);
        }
      } else {
        showAlert('Error al eliminar el documento del servidor.', 'Error', 'error');
      }
    } catch (err: any) {
      showAlert(`Error al intentar eliminar: ${err.message}`, 'Error de Conexión', 'error');
    }
  };

  // Calculations
  const hoyStr = new Date().toISOString().substring(0, 10);
  const en30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

  const docsActivos = documentos.filter(d => !d.es_historico && d.estatus !== 'Historico');
  const docsHistoricos = documentos.filter(d => d.es_historico || d.estatus === 'Historico');

  const docsVencidos = docsActivos.filter(d => d.fecha_vencimiento && d.fecha_vencimiento < hoyStr);
  const docsPorVencer = docsActivos.filter(d => d.fecha_vencimiento && d.fecha_vencimiento >= hoyStr && d.fecha_vencimiento <= en30dias);
  const docsVigentes = docsActivos.filter(d => !d.fecha_vencimiento || d.fecha_vencimiento > en30dias);

  const reqObligatorios = REQUISITOS_LEY_VENEZUELA.filter(r => r.req);
  const reqCumplidos = reqObligatorios.filter(r => {
    return docsActivos.some(d => {
      const isTypeMatch = d.requisito_key === r.key || d.titulo.toLowerCase().includes(r.key.toLowerCase());
      const isNotExpired = !d.fecha_vencimiento || d.fecha_vencimiento >= hoyStr;
      return isTypeMatch && isNotExpired;
    });
  });
  const porcentajeCumplimiento = Math.round((reqCumplidos.length / reqObligatorios.length) * 100);

  const displayList = showHistorico ? docsHistoricos : docsActivos;

  const filteredDocs = displayList.filter(doc => {
    const matchCat = selectedCategoria === 'TODOS' || doc.categoria === selectedCategoria;
    const matchSearch = doc.titulo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (doc.descripcion && doc.descripcion.toLowerCase().includes(searchTerm.toLowerCase())) ||
                        doc.nombre_archivo.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen font-sans antialiased">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">Bóveda Documental Legal y Fiscal</h1>
              <p className="text-sm font-medium text-slate-500 mt-0.5">
                Cumplimiento Tributario SENIAT, Licencias Municipales, Parafiscales e Inspecciones en Venezuela.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowDossierModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs shadow-sm transition-all"
            title="Generar Expediente Digital para Inspecciones"
          >
            <PackageCheck className="w-4 h-4 text-emerald-400" />
            <span>Expediente Dossier</span>
          </button>

          <button
            onClick={handleSendWhatsAppNotification}
            disabled={sendingWsp}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all"
            title="Enviar Alerta de Vencimientos por WhatsApp"
          >
            <MessageSquare className="w-4 h-4" />
            <span>{sendingWsp ? 'Enviando...' : 'Alertas WhatsApp'}</span>
          </button>

          <button
            onClick={fetchDocumentos}
            className="p-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            title="Recargar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          {canCreate && (
            <button
              onClick={() => setIsUploadOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all transform active:scale-95 text-xs"
            >
              <Upload className="w-4 h-4" />
              <span>Subir Documento</span>
            </button>
          )}
        </div>
      </div>

      {/* WIDGET DE SEMÁFORO DE CUMPLIMIENTO LEGAL VENEZOLANO */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white p-6 rounded-2xl shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
              <Award className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-blue-300">Semáforo de Cumplimiento Legal</span>
              <h2 className="text-xl font-black tracking-tight">Salud Legal de la Empresa en Venezuela</h2>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-xs text-slate-300 font-bold block">Estatus Global:</span>
              <span className={`text-2xl font-black ${
                porcentajeCumplimiento >= 80 ? 'text-emerald-400' : porcentajeCumplimiento >= 50 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {porcentajeCumplimiento}% En Regla
              </span>
            </div>

            <button
              onClick={() => setShowChecklistModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-xl shadow-lg transition-all flex items-center gap-1.5"
            >
              <CheckSquare className="w-4 h-4" />
              <span>Ver Checklist Ley</span>
            </button>
          </div>
        </div>

        <div className="w-full bg-slate-700/60 rounded-full h-3.5 p-0.5 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${
              porcentajeCumplimiento >= 80 
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                : porcentajeCumplimiento >= 50 
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400' 
                : 'bg-gradient-to-r from-red-600 to-rose-500'
            }`}
            style={{ width: `${porcentajeCumplimiento}%` }}
          />
        </div>
      </div>

      {/* Banner de Alertas de Vencimiento */}
      {(docsVencidos.length > 0 || docsPorVencer.length > 0) && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-sans">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div>
              <h4 className="font-bold text-amber-900 text-sm">Alerta de Cumplimiento Legal & Vencimiento</h4>
              <p className="text-xs font-medium text-amber-800 mt-0.5">
                {docsVencidos.length > 0 && <span className="font-bold text-red-600 mr-2">⚠️ {docsVencidos.length} documento(s) VENCIDO(S).</span>}
                {docsPorVencer.length > 0 && <span>⏳ {docsPorVencer.length} documento(s) por vencer en los próximos 30 días.</span>}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Documentos Activos</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{docsActivos.length}</h3>
          </div>
          <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Vigentes Al Día</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">{docsVigentes.length}</h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Por Vencer (30 días)</p>
            <h3 className="text-2xl font-black text-amber-600 mt-1">{docsPorVencer.length}</h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Documentos Vencidos</p>
            <h3 className="text-2xl font-black text-red-600 mt-1">{docsVencidos.length}</h3>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Buscador, Categorías, Toggle Histórico y Selector de Vista */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 font-sans">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por título, archivo o descripción..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-extrabold">
              <button
                onClick={() => setShowHistorico(false)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  !showHistorico ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Activos ({docsActivos.length})
              </button>
              <button
                onClick={() => setShowHistorico(true)}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  showHistorico ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Histórico ({docsHistoricos.length})</span>
              </button>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleSetViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                  viewMode === 'grid' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Vista en Tarjetas Compactas"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Tarjetas</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetViewMode('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                  viewMode === 'list' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Vista en Lista / Tabla Densa"
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">Lista Densa</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetViewMode('mini')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                  viewMode === 'mini' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Vista Previa Miniaturizada (Galería)"
              >
                <ImageIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Miniaturas</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {CATEGORIAS_CONFIG.map(cat => {
            const IconComp = cat.icon;
            const count = cat.id === 'TODOS' ? displayList.length : displayList.filter(d => d.categoria === cat.id).length;
            const isActive = selectedCategoria === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoria(cat.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-extrabold transition-all whitespace-nowrap ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <IconComp className={`w-4 h-4 ${isActive ? 'text-white' : cat.color}`} />
                <span>{cat.label}</span>
                <span className={`px-2 py-0.5 text-xs rounded-full font-bold ${
                  isActive ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Renderizado de Documentos */}
      {loading ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center font-sans">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Cargando repositorio legal de la empresa...</p>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center font-sans">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">No se encontraron documentos</h3>
          <p className="text-sm font-medium text-slate-500 max-w-md mx-auto mt-1">
            {showHistorico
              ? 'No hay archivos en el historial de renovaciones antiguas.'
              : searchTerm 
              ? 'No hay archivos que coincidan con la búsqueda.'
              : 'Aún no se han subido documentos a esta categoría del repositorio.'}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* MODO LISTA DENSA */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden font-sans">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Documento / Título</th>
                  <th className="py-3 px-4">Categoría</th>
                  <th className="py-3 px-4">F. Emisión</th>
                  <th className="py-3 px-4">F. Vencimiento</th>
                  <th className="py-3 px-4 text-center">Estatus</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.map(doc => {
                  const isExpired = doc.fecha_vencimiento ? doc.fecha_vencimiento < hoyStr : false;
                  const isExpiring = doc.fecha_vencimiento ? (doc.fecha_vencimiento >= hoyStr && doc.fecha_vencimiento <= en30dias) : false;
                  const downloadUrl = getApiUrl(`/documentos-empresa/${doc.id}/archivo`);

                  return (
                    <tr key={doc.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-800">
                        <div className="flex items-center gap-2.5">
                          <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          <div>
                            <span className="block font-bold text-slate-900 text-sm line-clamp-1">{doc.titulo}</span>
                            <span className="text-[11px] font-mono text-slate-400 font-normal">{doc.nombre_archivo}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-extrabold text-slate-700">
                        {doc.categoria}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-600">
                        {doc.fecha_emision || '-'}
                      </td>

                      <td className="py-3 px-4 font-mono">
                        {doc.fecha_vencimiento ? (
                          <span className={`font-bold ${isExpired ? 'text-red-600' : isExpiring ? 'text-amber-600' : 'text-emerald-700'}`}>
                            {doc.fecha_vencimiento}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">No vence / Indefinido</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`px-2.5 py-0.5 text-[11px] font-black rounded-full inline-block ${
                          doc.es_historico || doc.estatus === 'Historico'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : isExpired
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : isExpiring
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {doc.es_historico || doc.estatus === 'Historico' ? '📜 HISTÓRICO' : isExpired ? '⚠️ VENCIDO' : isExpiring ? '⏳ POR VENCER' : '✅ VIGENTE'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setPreviewDoc(doc)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs flex items-center gap-1"
                            title="Ver Documento"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ver</span>
                          </button>

                          {canEdit && (
                            <button
                              onClick={() => openEditModal(doc)}
                              className="p-1.5 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg"
                              title="Editar"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <a
                            href={downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            download={doc.nombre_archivo}
                            className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
                            title="Descargar"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>

                          {canDelete && (
                            <button
                              onClick={() => handleDelete(doc.id, doc.titulo)}
                              className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'mini' ? (
        /* MODO MINIATURAS */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 font-sans">
          {filteredDocs.map(doc => {
            const isExpired = doc.fecha_vencimiento ? doc.fecha_vencimiento < hoyStr : false;
            const isExpiring = doc.fecha_vencimiento ? (doc.fecha_vencimiento >= hoyStr && doc.fecha_vencimiento <= en30dias) : false;
            const fileUrl = getApiUrl(`/documentos-empresa/${doc.id}/archivo`);

            return (
              <div 
                key={doc.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
              >
                <div 
                  onClick={() => setPreviewDoc(doc)}
                  className="h-36 bg-slate-900 relative cursor-pointer group flex items-center justify-center overflow-hidden"
                >
                  {doc.mime_type?.includes('image') ? (
                    <img src={fileUrl} alt={doc.titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                  ) : (
                    <iframe src={fileUrl} title={doc.titulo} className="w-full h-full border-0 pointer-events-none opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all duration-200" />
                  )}

                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <span className="bg-blue-600 text-white text-xs font-extrabold px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" /> Ampliar
                    </span>
                  </div>

                  <span className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-black rounded-full shadow-sm ${
                    doc.es_historico || doc.estatus === 'Historico' ? 'bg-purple-600 text-white' : isExpired ? 'bg-red-600 text-white' : isExpiring ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
                  }`}>
                    {doc.es_historico || doc.estatus === 'Historico' ? 'HISTÓRICO' : isExpired ? 'VENCIDO' : isExpiring ? 'POR VENCER' : 'VIGENTE'}
                  </span>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm line-clamp-1" title={doc.titulo}>{doc.titulo}</h3>
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                      <span className="font-semibold text-slate-600">{doc.categoria}</span>
                      <span className={`font-mono font-bold ${isExpired ? 'text-red-600 font-black' : 'text-slate-700'}`}>
                        {doc.fecha_vencimiento || 'No vence'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                    <button onClick={() => setPreviewDoc(doc)} className="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1">
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    {canEdit && (
                      <button onClick={() => openEditModal(doc)} className="p-1.5 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg" title="Editar">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <a href={fileUrl} target="_blank" rel="noreferrer" download={doc.nombre_archivo} className="p-1.5 text-blue-600 bg-slate-100 hover:bg-slate-200 rounded-lg" title="Descargar">
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    {canDelete && (
                      <button onClick={() => handleDelete(doc.id, doc.titulo)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors" title="Eliminar Documento">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MODO TARJETAS */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
          {filteredDocs.map(doc => {
            const isExpired = doc.fecha_vencimiento ? doc.fecha_vencimiento < hoyStr : false;
            const isExpiring = doc.fecha_vencimiento ? (doc.fecha_vencimiento >= hoyStr && doc.fecha_vencimiento <= en30dias) : false;
            const downloadUrl = getApiUrl(`/documentos-empresa/${doc.id}/archivo`);

            return (
              <div 
                key={doc.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                      <FileText className="w-5 h-5" />
                    </div>
                    
                    <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${
                      doc.es_historico || doc.estatus === 'Historico'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : isExpired
                        ? 'bg-red-100 text-red-700 border border-red-200'
                        : isExpiring
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}>
                      {doc.es_historico || doc.estatus === 'Historico' ? '📜 HISTÓRICO' : isExpired ? '⚠️ VENCIDO' : isExpiring ? '⏳ POR VENCER' : '✅ VIGENTE'}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-800 text-sm line-clamp-1" title={doc.titulo}>
                    {doc.titulo}
                  </h3>

                  <p className="text-[11px] font-medium text-slate-500 mt-0.5 line-clamp-2 min-h-[28px]">
                    {doc.descripcion || 'Sin descripción.'}
                  </p>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Categoría:</span>
                      <span className="font-bold text-slate-700">{doc.categoria}</span>
                    </div>

                    {doc.fecha_vencimiento ? (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Vencimiento:</span>
                        <span className={`font-mono font-bold ${isExpired ? 'text-red-600 font-black' : isExpiring ? 'text-amber-600 font-bold' : 'text-emerald-700'}`}>
                          {doc.fecha_vencimiento}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Vencimiento:</span>
                        <span className="text-slate-400 italic">No vence / Indefinido</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1.5">
                  <button onClick={() => setPreviewDoc(doc)} className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold rounded-lg transition-colors flex items-center justify-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> Ver
                  </button>
                  {canEdit && (
                    <button onClick={() => openEditModal(doc)} className="p-1.5 text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors" title="Editar">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <a href={downloadUrl} target="_blank" rel="noreferrer" download={doc.nombre_archivo} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors" title="Descargar">
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  {canDelete && (
                    <button onClick={() => handleDelete(doc.id, doc.titulo)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors" title="Eliminar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL CHECKLIST DE CUMPLIMIENTO LEY VENEZOLANA */}
      {showChecklistModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
                  <CheckSquare className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800">Checklist Obligatorio de Ley (Venezuela)</h2>
                  <p className="text-xs text-slate-500">Documentos requeridos para operar sin multas ante SENIAT, Alcaldía e Instituciones.</p>
                </div>
              </div>
              <button onClick={() => setShowChecklistModal(false)} className="text-slate-400 hover:text-slate-600 font-bold" title="Cerrar (ESC)">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {REQUISITOS_LEY_VENEZUELA.map(req => {
                const docFound = docsActivos.find(d => (d.requisito_key === req.key || d.titulo.toLowerCase().includes(req.key.toLowerCase())) && (!d.fecha_vencimiento || d.fecha_vencimiento >= hoyStr));
                const isCompliant = Boolean(docFound);

                return (
                  <div key={req.key} className={`p-4 rounded-xl border flex items-center justify-between gap-4 transition-all ${
                    isCompliant ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      {isCompliant ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{req.label}</h4>
                        <p className="text-xs text-slate-500">{req.desc}</p>
                        {docFound && (
                          <span className="text-[11px] text-emerald-700 font-mono font-bold block mt-1">
                            ✅ Registrado: {docFound.titulo} {docFound.fecha_vencimiento && `(Vence: ${docFound.fecha_vencimiento})`}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      {isCompliant ? (
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-lg">
                          EN REGLA
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setShowChecklistModal(false);
                            setFormData(prev => ({
                              ...prev,
                              categoria: req.cat as any,
                              requisito_key: req.key,
                              titulo: req.label
                            }));
                            setIsUploadOpen(true);
                          }}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Subir
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXPEDIENTE DIGITAL DOSSIER PARA INSPECCIONES */}
      {showDossierModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-slate-900 text-emerald-400 rounded-xl">
                  <PackageCheck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800">Expediente Legal & Fiscal Consolidado (Dossier)</h2>
                  <p className="text-xs text-slate-500">Resumen listo para presentar en inspecciones presenciales del SENIAT y Alcaldía.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5">
                  <Printer className="w-4 h-4" /> Imprimir Dossier
                </button>
                <button onClick={() => setShowDossierModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4 border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">DOSSIER DE CUMPLIMIENTO TRIBUTARIO Y LEGAL</h3>
                  <p className="text-xs text-slate-600 font-medium">Empresa Registrada en WinterPos • Estado de Venezuela</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-500 block">Salud Fiscal:</span>
                  <span className="text-lg font-black text-emerald-600">{porcentajeCumplimiento}% COMPLETO</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Documentos Activos en Bóveda ({docsActivos.length})</h4>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white overflow-hidden text-xs">
                  {docsActivos.map(d => (
                    <div key={d.id} className="p-3 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800 block">{d.titulo}</span>
                        <span className="text-[11px] text-slate-500 font-mono">Categoría: {d.categoria} • Archivo: {d.nombre_archivo}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-700">
                        {d.fecha_vencimiento ? `Vence: ${d.fecha_vencimiento}` : 'Vigencia Indefinida'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Subir Documento */}
      {isUploadOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                  <Upload className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-black text-slate-800">Cargar Nuevo Documento Legal</h2>
              </div>
              <button onClick={() => setIsUploadOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold" title="Cerrar (ESC)">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Categoría de Ley</label>
                <select
                  value={formData.categoria}
                  onChange={e => setFormData({ ...formData, categoria: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500"
                >
                  <option value="SENIAT">SENIAT & Tributario (RIF, Declaraciones, Libros)</option>
                  <option value="MERCANTIL">Mercantil & Registro (Actas, Estatutos, Cédulas)</option>
                  <option value="MUNICIPAL">Patente & Permisología Municipal (Alcaldía, Bomberos)</option>
                  <option value="PARAFISCAL">Parafiscales & Laboral (IVSS, INCES, BANAVIH)</option>
                  <option value="OTROS">Otros Documentos Legales</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Título del Documento *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: RIF Vigente de la Empresa 2026"
                  value={formData.titulo}
                  onChange={e => setFormData({ ...formData, titulo: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Descripción / Observación</label>
                <textarea
                  rows={2}
                  placeholder="Ej: Emitido por SENIAT. Vence el 15/10/2026."
                  value={formData.descripcion}
                  onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* DRAG & DROP FILE ZONE */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Seleccionar o Arrastrar Archivo (PDF, JPG, PNG) *</label>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center space-y-2 ${
                    isDragging
                      ? 'border-blue-600 bg-blue-50/90 scale-[1.01] shadow-md ring-4 ring-blue-100'
                      : formData.nombre_archivo
                      ? 'border-emerald-400 bg-emerald-50/60 hover:bg-emerald-50'
                      : 'border-slate-300 bg-slate-50/70 hover:bg-blue-50/50 hover:border-blue-400'
                  }`}
                >
                  {formData.nombre_archivo ? (
                    <div className="flex flex-col items-center space-y-1">
                      <div className="p-3 bg-emerald-100 text-emerald-700 rounded-full">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <span className="text-sm font-bold text-slate-800 break-all max-w-full px-2">
                        {formData.nombre_archivo}
                      </span>
                      <span className="text-xs text-emerald-700 font-mono font-bold">
                        {formData.mime_type.includes('pdf') ? '📄 Documento PDF' : '🖼️ Imagen'} {selectedFileSize && `(${selectedFileSize})`}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center space-y-2">
                      <div className={`p-3 rounded-full transition-transform ${isDragging ? 'bg-blue-600 text-white scale-110' : 'bg-blue-50 text-blue-600'}`}>
                        <CloudUpload className="w-8 h-8" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {isDragging ? '¡Suelta el archivo aquí!' : 'Arrastra y suelta tu documento aquí'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          o haz clic para explorar en tu computadora (<strong className="text-slate-700">PDF, JPG, PNG</strong>)
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {scanNotice && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
                  <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{scanNotice}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Fecha de Emisión</label>
                  <input
                    type="date"
                    value={formData.fecha_emision}
                    onChange={e => setFormData({ ...formData, fecha_emision: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Fecha Vencimiento</label>
                  <input
                    type="date"
                    value={formData.fecha_vencimiento}
                    onChange={e => setFormData({ ...formData, fecha_vencimiento: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 font-mono font-bold text-blue-700"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold"
                >
                  Cancelar (ESC)
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-md"
                >
                  {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{uploading ? 'Guardando...' : 'Guardar en Bóveda'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Documento */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800">Editar Documento Legal</h2>
                  <p className="text-xs text-slate-500">Actualiza las fechas o marca como versión histórica.</p>
                </div>
              </div>
              <button onClick={() => setEditingDoc(null)} className="text-slate-400 hover:text-slate-600 font-bold" title="Cerrar (ESC)">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Categoría de Ley</label>
                <select
                  value={editFormData.categoria}
                  onChange={e => setEditFormData({ ...editFormData, categoria: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500"
                >
                  <option value="SENIAT">SENIAT & Tributario (RIF, Declaraciones, Libros)</option>
                  <option value="MERCANTIL">Mercantil & Registro (Actas, Estatutos, Cédulas)</option>
                  <option value="MUNICIPAL">Patente & Permisología Municipal (Alcaldía, Bomberos)</option>
                  <option value="PARAFISCAL">Parafiscales & Laboral (IVSS, INCES, BANAVIH)</option>
                  <option value="OTROS">Otros Documentos Legales</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Título del Documento *</label>
                <input
                  type="text"
                  required
                  value={editFormData.titulo}
                  onChange={e => setEditFormData({ ...editFormData, titulo: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Fecha de Emisión</label>
                  <input
                    type="date"
                    value={editFormData.fecha_emision}
                    onChange={e => setEditFormData({ ...editFormData, fecha_emision: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Fecha Vencimiento *</label>
                    <button
                      type="button"
                      onClick={() => handleScanDocumentFile(editingDoc)}
                      disabled={scanning}
                      className="text-[11px] text-blue-600 font-extrabold flex items-center gap-1 hover:underline"
                    >
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span>{scanning ? 'Escaneando...' : 'Escanear PDF'}</span>
                    </button>
                  </div>
                  <input
                    type="date"
                    required
                    value={editFormData.fecha_vencimiento}
                    onChange={e => setEditFormData({ ...editFormData, fecha_vencimiento: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 font-mono text-red-600"
                  />
                </div>
              </div>

              {/* Checkbox Archivar como Histórico */}
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-purple-900 block">Archivar en Historial de Renovaciones</span>
                  <span className="text-[11px] text-purple-700">Mueve esta versión antigua al histórico conservando su registro.</span>
                </div>
                <input
                  type="checkbox"
                  checked={editFormData.es_historico}
                  onChange={e => setEditFormData({ ...editFormData, es_historico: e.target.checked })}
                  className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      const docId = editingDoc.id;
                      const docTitle = editingDoc.titulo;
                      setEditingDoc(null);
                      handleDelete(docId, docTitle);
                    }}
                    className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border border-red-200 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar Documento</span>
                  </button>
                )}

                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={() => setEditingDoc(null)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold"
                  >
                    Cancelar (ESC)
                  </button>
                  <button
                    type="submit"
                    disabled={updating}
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-md"
                  >
                    {updating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>{updating ? 'Guardando...' : 'Actualizar Datos'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Visor de Documento */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-2xl max-w-4xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-3 truncate">
                <ShieldCheck className="w-6 h-6 text-blue-400 flex-shrink-0" />
                <div className="truncate">
                  <h3 className="font-bold text-sm truncate">{previewDoc.titulo}</h3>
                  <p className="text-xs text-slate-400">Categoría: {previewDoc.categoria} • Archivo: {previewDoc.nombre_archivo}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canDelete && (
                  <button
                    onClick={() => {
                      const docId = previewDoc.id;
                      const docTitle = previewDoc.titulo;
                      setPreviewDoc(null);
                      handleDelete(docId, docTitle);
                    }}
                    className="p-2 bg-red-600/80 hover:bg-red-600 rounded-lg text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                    title="Eliminar Documento"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar</span>
                  </button>
                )}
                <a
                  href={getApiUrl(`/documentos-empresa/${previewDoc.id}/archivo`)}
                  target="_blank"
                  rel="noreferrer"
                  download={previewDoc.nombre_archivo}
                  className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar</span>
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-2 text-slate-400 hover:text-white font-bold"
                  title="Cerrar (ESC)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-900 p-2 flex items-center justify-center overflow-auto">
              {previewDoc.mime_type?.includes('image') ? (
                <img
                  src={getApiUrl(`/documentos-empresa/${previewDoc.id}/archivo`)}
                  alt={previewDoc.titulo}
                  className="max-h-full max-w-full object-contain rounded-lg shadow-lg"
                />
              ) : (
                <iframe
                  src={getApiUrl(`/documentos-empresa/${previewDoc.id}/archivo`)}
                  title={previewDoc.titulo}
                  className="w-full h-full rounded-lg border-0 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
