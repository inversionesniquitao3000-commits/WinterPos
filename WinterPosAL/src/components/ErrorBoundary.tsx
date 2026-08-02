import { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-6 m-4 shadow-xl text-slate-800 font-sans animate-fade-in space-y-4">
          <div className="flex items-center gap-3 border-b border-red-200 pb-3">
            <div className="bg-red-100 p-2 rounded-xl border border-red-300">
              <ShieldAlert className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-red-900 uppercase tracking-wide">
                Error al Cargar Módulo {this.props.moduleName || 'Inventario'}
              </h2>
              <p className="text-xs text-red-700 font-medium">
                Se detectó una excepción durante la renderización del componente.
              </p>
            </div>
          </div>

          <div className="bg-slate-900 text-red-300 font-mono text-xs p-4 rounded-xl overflow-x-auto space-y-2 border border-slate-800">
            <div className="font-bold text-red-400">
              {this.state.error?.toString()}
            </div>
            {this.state.errorInfo?.componentStack && (
              <pre className="text-[10px] text-slate-400 whitespace-pre-wrap leading-relaxed">
                {this.state.errorInfo.componentStack}
              </pre>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={this.handleReset}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow"
            >
              <RefreshCw className="w-4 h-4" />
              Reintentar Cargar Módulo
            </button>
            <button
              onClick={() => window.location.reload()}
              className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs px-4 py-2 rounded-lg transition-all"
            >
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
