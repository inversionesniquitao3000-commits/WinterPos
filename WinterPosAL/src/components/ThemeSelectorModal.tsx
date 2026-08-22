import React from 'react';
import { Palette, Sun, Moon, Check, RotateCcw, X, Sparkles } from 'lucide-react';

export type ThemeMode = 'light' | 'dark';
export type ThemePalette = 'winter' | 'emerald' | 'purple' | 'amber' | 'slate' | 'ruby' | 'cyan';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: ThemeMode;
  currentPalette: ThemePalette;
  onSelectMode: (mode: ThemeMode) => void;
  onSelectPalette: (palette: ThemePalette) => void;
  onResetDefault: () => void;
}

interface PaletteOption {
  id: ThemePalette;
  name: string;
  subtitle: string;
  headerColor: string;
  primaryColor: string;
  accentColor: string;
  badge: string;
}

export const PALETTES: PaletteOption[] = [
  {
    id: 'winter',
    name: 'Azul Winter',
    subtitle: 'Clásico corporativo WinterPOS con detalles dorados',
    headerColor: '#0f3562',
    primaryColor: '#0b5fa5',
    accentColor: '#ffd700',
    badge: 'Predeterminado',
  },
  {
    id: 'emerald',
    name: 'Verde Esmeralda',
    subtitle: 'Estilo farmacia, salud y ecológico con alta vitalidad',
    headerColor: '#064e3b',
    primaryColor: '#059669',
    accentColor: '#34d399',
    badge: 'Farmacia / Eco',
  },
  {
    id: 'purple',
    name: 'Púrpura Índigo',
    subtitle: 'Amatista futurista y elegante de alta tecnología',
    headerColor: '#3b0764',
    primaryColor: '#7c3aed',
    accentColor: '#a78bfa',
    badge: 'Moderno',
  },
  {
    id: 'amber',
    name: 'Ámbar / Atardecer',
    subtitle: 'Tonos dorados y amaderados cálidos y acogedores',
    headerColor: '#78350f',
    primaryColor: '#d97706',
    accentColor: '#fbbf24',
    badge: 'Cálido',
  },
  {
    id: 'slate',
    name: 'Acero / Slate',
    subtitle: 'Minimalismo sobrio en escala de grises y carbón',
    headerColor: '#0f172a',
    primaryColor: '#334155',
    accentColor: '#94a3b8',
    badge: 'Minimalista',
  },
  {
    id: 'ruby',
    name: 'Rubí / Borgoña',
    subtitle: 'Rojo carmesí premium con gran impacto comercial',
    headerColor: '#881337',
    primaryColor: '#e11d48',
    accentColor: '#fda4af',
    badge: 'Premium',
  },
  {
    id: 'cyan',
    name: 'Océano / Turquesa',
    subtitle: 'Frescura marina y dinamismo azul cielo',
    headerColor: '#164e63',
    primaryColor: '#0891b2',
    accentColor: '#22d3ee',
    badge: 'Fresco',
  },
];

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({
  isOpen,
  onClose,
  currentMode,
  currentPalette,
  onSelectMode,
  onSelectPalette,
  onResetDefault,
}) => {
  // Listener para cerrar con tecla ESC
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-[999] animate-fade-in font-sans text-slate-800"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden w-full max-w-2xl shadow-2xl transition-all max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-900/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-md">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
                PERSONALIZACIÓN VISUAL DEL SISTEMA
                <span className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-[10px] font-black px-2 py-0.5 rounded-full font-mono">
                  TEMAS
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Seleccione el modo de iluminación y su paleta de colores preferida.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-slate-800 dark:text-slate-200">
          
          {/* SECTION 1: MODO DE ILUMINACIÓN (CLARO / OSCURO) */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Modo de Iluminación</span>
              </label>
              <span className="text-[11px] text-slate-400">
                Por defecto: <strong className="text-slate-700 dark:text-slate-300">Modo Claro</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Option: Light Mode */}
              <button
                type="button"
                onClick={() => onSelectMode('light')}
                className={`p-3.5 rounded-xl border-2 transition-all flex items-center gap-3 cursor-pointer text-left ${
                  currentMode === 'light'
                    ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 shadow-sm ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800/60'
                }`}
              >
                <div className={`p-2.5 rounded-xl ${currentMode === 'light' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                  <Sun className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-slate-900 dark:text-white">Modo Claro</span>
                    {currentMode === 'light' && (
                      <span className="p-0.5 bg-blue-600 text-white rounded-full">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5 line-clamp-2">
                    Luminosidad diurna y contraste óptimo
                  </span>
                </div>
              </button>

              {/* Option: Dark Mode */}
              <button
                type="button"
                onClick={() => onSelectMode('dark')}
                className={`p-3.5 rounded-xl border-2 transition-all flex items-center gap-3 cursor-pointer text-left ${
                  currentMode === 'dark'
                    ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/50 shadow-sm ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800/60'
                }`}
              >
                <div className={`p-2.5 rounded-xl ${currentMode === 'dark' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                  <Moon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-slate-900 dark:text-white">Modo Oscuro</span>
                    {currentMode === 'dark' && (
                      <span className="p-0.5 bg-indigo-600 text-white rounded-full">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5 line-clamp-2">
                    Descanso visual para turnos nocturnos
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* SECTION 2: PALETAS DE COLORES */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-blue-500" />
                <span>Paletas de Colores Corporativas ({PALETTES.length})</span>
              </label>
              <span className="text-[11px] text-slate-400">
                Cambio instantáneo en todo el sistema
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PALETTES.map((pal) => {
                const isSelected = currentPalette === pal.id;
                return (
                  <button
                    key={pal.id}
                    type="button"
                    onClick={() => onSelectPalette(pal.id)}
                    className={`p-3 rounded-xl border-2 transition-all flex items-start gap-3 cursor-pointer text-left ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 shadow-sm ring-1 ring-blue-500/30'
                        : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/40'
                    }`}
                  >
                    {/* Color Swatch Circles */}
                    <div className="flex -space-x-1.5 items-center flex-shrink-0 mt-0.5">
                      <div
                        className="w-5 h-5 rounded-full border-2 border-white dark:border-slate-900 shadow-xs"
                        style={{ backgroundColor: pal.headerColor }}
                        title="Color Cabecera"
                      />
                      <div
                        className="w-5 h-5 rounded-full border-2 border-white dark:border-slate-900 shadow-xs"
                        style={{ backgroundColor: pal.primaryColor }}
                        title="Color Primario"
                      />
                      <div
                        className="w-5 h-5 rounded-full border-2 border-white dark:border-slate-900 shadow-xs"
                        style={{ backgroundColor: pal.accentColor }}
                        title="Color de Acento"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                          {pal.name}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}>
                          {isSelected ? 'Activo' : pal.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        {pal.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-200 dark:border-slate-800 px-6 py-3.5 bg-slate-50 dark:bg-slate-900/60 flex flex-col sm:flex-row justify-between items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onResetDefault}
            className="w-full sm:w-auto px-3.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            title="Restablecer tema a Modo Claro y Azul Winter"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Restablecer Predeterminado</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
          >
            LISTO / GUARDAR
          </button>
        </div>

      </div>
    </div>
  );
};
