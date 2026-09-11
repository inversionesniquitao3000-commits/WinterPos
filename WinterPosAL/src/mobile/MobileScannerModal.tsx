import { useEffect, useRef, useState } from 'react';
import { Camera, X, AlertCircle, RefreshCw, Zap } from 'lucide-react';

interface MobileScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export default function MobileScannerModal({ isOpen, onClose, onScan }: MobileScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isScanningRef = useRef(false);

  // Play a quick synthesized beep when a code is detected
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
      if (navigator.vibrate) {
        navigator.vibrate(80);
      }
    } catch (_) {}
  };

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    isScanningRef.current = false;
  };

  const startCamera = async () => {
    stopCamera();
    setErrorMessage(null);
    setHasPermission(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasPermission(false);
      setErrorMessage('Tu navegador no permite el acceso a la cámara o se requiere HTTPS.');
      return;
    }

    try {
      // Prioritize the back/environment camera for barcode scanning
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setHasPermission(true);

      // Check if torch/flashlight is supported
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as any;
        if (capabilities.torch) {
          setHasTorch(true);
        }
      }

      // Start detection loop
      isScanningRef.current = true;
      startDetectionLoop();
    } catch (err: any) {
      console.error('Camera access error:', err);
      setHasPermission(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Permiso de cámara denegado. Por favor concédele permisos en tu navegador.');
      } else {
        setErrorMessage(err.message || 'No se pudo iniciar la cámara del dispositivo.');
      }
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextState = !torchEnabled;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }]
      });
      setTorchEnabled(nextState);
    } catch (e) {
      console.warn('Torch not supported or failed to toggle:', e);
    }
  };

  const startDetectionLoop = () => {
    const video = videoRef.current;
    if (!video) return;

    const hasBarcodeDetector = 'BarcodeDetector' in window;
    let detector: any = null;

    if (hasBarcodeDetector) {
      try {
        detector = new (window as any).BarcodeDetector({
          formats: [
            'qr_code',
            'ean_13',
            'ean_8',
            'code_128',
            'code_39',
            'upc_a',
            'upc_e',
            'data_matrix'
          ]
        });
      } catch (e) {
        console.warn('Could not initialize BarcodeDetector with custom formats:', e);
        try {
          detector = new (window as any).BarcodeDetector();
        } catch (_) {}
      }
    }

    const checkFrame = async () => {
      if (!isScanningRef.current) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA && detector) {
        try {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            if (rawValue && rawValue.trim().length > 0) {
              isScanningRef.current = false;
              playBeep();
              onScan(rawValue.trim());
              onClose();
              return;
            }
          }
        } catch (detErr) {
          // Frame detection skipped
        }
      }

      animationFrameRef.current = requestAnimationFrame(checkFrame);
    };

    animationFrameRef.current = requestAnimationFrame(checkFrame);
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between max-w-md mx-auto">
      {/* Top Controls */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent z-10">
        <div className="flex items-center gap-2 text-white">
          <Camera className="w-5 h-5 text-blue-400" />
          <span className="font-bold text-sm tracking-wide">Escanear QR o Código</span>
        </div>

        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-xl transition ${
                torchEnabled
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-400/30'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              title="Linterna"
            >
              <Zap className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition active:scale-95"
            title="Cerrar escáner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Camera Viewport Area */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Framing & Animated Target Reticle */}
        {hasPermission && (
          <div className="relative z-10 w-64 h-64 sm:w-72 sm:h-72 border-2 border-dashed border-blue-400/70 rounded-2xl flex flex-col items-center justify-center p-4 shadow-[0_0_40px_rgba(59,130,246,0.3)]">
            {/* Corner Indicators */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-xl"></div>
            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-xl"></div>
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-xl"></div>
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-xl"></div>

            {/* Scanning Laser Line Animation */}
            <div className="absolute inset-x-3 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-[bounce_2s_infinite]"></div>

            <p className="text-[11px] text-white/90 bg-black/60 px-3 py-1 rounded-full font-medium backdrop-blur-sm mt-auto shadow">
              Enfoca el código QR o de barras
            </p>
          </div>
        )}

        {/* Error or Permission Denied State */}
        {hasPermission === false && (
          <div className="relative z-10 px-6 text-center max-w-xs">
            <div className="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto mb-3 text-red-400">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h4 className="text-white font-bold text-sm mb-1">Cámara no disponible</h4>
            <p className="text-xs text-slate-300 mb-4">{errorMessage}</p>
            <button
              onClick={startCamera}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg transition active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reintentar Acceso</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Information Tip */}
      <div className="p-4 bg-gradient-to-t from-black/90 to-transparent text-center z-10">
        <p className="text-[11px] text-slate-300">
          Lee automáticamente códigos QR, EAN-13, barras de productos y etiquetas de balanza.
        </p>
      </div>
    </div>
  );
}
