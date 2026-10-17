using System;
using System.Runtime.InteropServices;
using System.Threading;

[StructLayout(LayoutKind.Sequential)]
public struct FTRSCAN_IMAGE_SIZE {
    public int nWidth;
    public int nHeight;
    public int nImageSize;
}

public static class FingerprintEngine {
    public struct Template {
        public byte CentroidX;
        public byte CentroidY;
        public byte[] Orientations;
        public byte[] Coherences;
    }

    public const int WIDTH = 320;
    public const int HEIGHT = 480;
    public const int BLOCK_SIZE = 16;
    public const int COLS = 20;
    public const int ROWS = 30;
    public const int TOTAL_BLOCKS = 600;

    public static Template Extract(byte[] rawImage) {
        Template tpl = new Template();
        tpl.Orientations = new byte[TOTAL_BLOCKS];
        tpl.Coherences = new byte[TOTAL_BLOCKS];

        long sumCentroidX = 0;
        long sumCentroidY = 0;
        int validBlocks = 0;

        for (int r = 0; r < ROWS; r++) {
            for (int c = 0; c < COLS; c++) {
                int blockIdx = r * COLS + c;
                int startX = c * BLOCK_SIZE;
                int startY = r * BLOCK_SIZE;

                long sum = 0;
                long sumSq = 0;
                int count = 0;

                for (int y = startY; y < startY + BLOCK_SIZE; y++) {
                    int rowOff = y * WIDTH;
                    for (int x = startX; x < startX + BLOCK_SIZE; x++) {
                        byte p = rawImage[rowOff + x];
                        sum += p;
                        sumSq += (long)p * p;
                        count++;
                    }
                }

                double mean = (double)sum / count;
                double variance = ((double)sumSq / count) - (mean * mean);

                if (variance < 80.0) {
                    tpl.Orientations[blockIdx] = 255;
                    tpl.Coherences[blockIdx] = 0;
                    continue;
                }

                double Gxx = 0.0;
                double Gyy = 0.0;
                double Gxy = 0.0;

                for (int y = startY + 1; y < startY + BLOCK_SIZE - 1; y++) {
                    int rowOff = y * WIDTH;
                    for (int x = startX + 1; x < startX + BLOCK_SIZE - 1; x++) {
                        int gx = rawImage[(rowOff - WIDTH) + x + 1] + 2 * rawImage[rowOff + x + 1] + rawImage[(rowOff + WIDTH) + x + 1]
                               - (rawImage[(rowOff - WIDTH) + x - 1] + 2 * rawImage[rowOff + x - 1] + rawImage[(rowOff + WIDTH) + x - 1]);

                        int gy = rawImage[(rowOff + WIDTH) + x - 1] + 2 * rawImage[(rowOff + WIDTH) + x] + rawImage[(rowOff + WIDTH) + x + 1]
                               - (rawImage[(rowOff - WIDTH) + x - 1] + 2 * rawImage[(rowOff - WIDTH) + x] + rawImage[(rowOff - WIDTH) + x + 1]);

                        Gxy += 2.0 * gx * gy;
                        Gxx += (double)gx * gx;
                        Gyy += (double)gy * gy;
                    }
                }

                double Vx = Gxy;
                double Vy = Gxx - Gyy;
                double Vlen = Gxx + Gyy;

                if (Vlen < 800.0) {
                    tpl.Orientations[blockIdx] = 255;
                    tpl.Coherences[blockIdx] = 0;
                    continue;
                }

                double coherence = Math.Sqrt(Vx * Vx + Vy * Vy) / Vlen;
                if (coherence < 0.16) {
                    tpl.Orientations[blockIdx] = 255;
                    tpl.Coherences[blockIdx] = 0;
                    continue;
                }

                double theta = 0.5 * Math.Atan2(Vx, Vy);
                if (theta < 0.0) theta += Math.PI;

                int quantized = (int)Math.Round((theta / Math.PI) * 250.0);
                if (quantized > 250) quantized = 250;

                tpl.Orientations[blockIdx] = (byte)quantized;
                tpl.Coherences[blockIdx] = (byte)Math.Min(100.0, Math.Round(coherence * 100.0));

                sumCentroidX += c;
                sumCentroidY += r;
                validBlocks++;
            }
        }

        if (validBlocks > 0) {
            tpl.CentroidX = (byte)(sumCentroidX / validBlocks);
            tpl.CentroidY = (byte)(sumCentroidY / validBlocks);
        } else {
            tpl.CentroidX = 10;
            tpl.CentroidY = 15;
        }

        return tpl;
    }

    public static string Serialize(Template tpl) {
        byte[] payload = new byte[1204];
        payload[0] = 70; // 'F'
        payload[1] = 80; // 'P'
        payload[2] = tpl.CentroidX;
        payload[3] = tpl.CentroidY;
        Array.Copy(tpl.Orientations, 0, payload, 4, 600);
        Array.Copy(tpl.Coherences, 0, payload, 604, 600);

        string b64 = Convert.ToBase64String(payload);
        return "FPE1_" + b64.Replace('/', '_').Replace('+', '-');
    }
}

class Program {
    [DllImport("ftrScanAPI.dll")]
    static extern IntPtr ftrScanOpenDevice();

    [DllImport("ftrScanAPI.dll")]
    static extern void ftrScanCloseDevice(IntPtr ftrHandle);

    [DllImport("ftrScanAPI.dll")]
    static extern bool ftrScanGetImageSize(IntPtr ftrHandle, out FTRSCAN_IMAGE_SIZE pImageSize);

    [DllImport("ftrScanAPI.dll")]
    static extern bool ftrScanGetFrame(IntPtr ftrHandle, byte[] pBuffer, IntPtr pReserved);

    [DllImport("ftrScanAPI.dll")]
    static extern int ftrScanGetLastError();

    [DllImport("ftrScanAPI.dll")]
    static extern bool ftrScanSetDiodesStatus(IntPtr ftrHandle, byte byGreenDiodeStatus, byte byRedDiodeStatus);

    static void Main(string[] args) {
        int timeout = 6;
        if (args.Length > 0) {
            int.TryParse(args[0], out timeout);
        }

        IntPtr ftrHandle = ftrScanOpenDevice();
        if (ftrHandle == IntPtr.Zero) {
            Console.WriteLine("{\"success\":false,\"error\":\"No se pudo abrir el lector Futronic. Verifique el cable USB.\"}");
            return;
        }

        try {
            // Enciende el LED verde inmediatamente al iniciar la espera de huella
            try {
                ftrScanSetDiodesStatus(ftrHandle, 255, 0);
            } catch {}

            FTRSCAN_IMAGE_SIZE pImageSize;
            if (!ftrScanGetImageSize(ftrHandle, out pImageSize)) {
                Console.WriteLine("{\"success\":false,\"error\":\"Error al obtener tamaño de imagen del sensor.\"}");
                return;
            }

            byte[] rawImage = new byte[pImageSize.nImageSize];
            DateTime start = DateTime.Now;
            bool fingerCaptured = false;

            while ((DateTime.Now - start).TotalSeconds < timeout) {
                // Mantener el LED verde iluminado durante toda la espera
                try {
                    ftrScanSetDiodesStatus(ftrHandle, 255, 0);
                } catch {}

                bool frameOk = ftrScanGetFrame(ftrHandle, rawImage, IntPtr.Zero);
                if (frameOk) {
                    fingerCaptured = true;
                    break;
                }
                int err = ftrScanGetLastError();
                Thread.Sleep(60);
            }

            if (!fingerCaptured) {
                // Si venció el tiempo de espera, apagar diodos limpiamente
                try {
                    ftrScanSetDiodesStatus(ftrHandle, 0, 0);
                } catch {}
                Console.WriteLine("{\"success\":false,\"error\":\"Tiempo agotado. No se detectó ningún dedo sobre el sensor.\"}");
                return;
            }

            // Huella detectada con éxito: mantener LED verde para dar confirmación táctil y visual
            try {
                ftrScanSetDiodesStatus(ftrHandle, 255, 0);
                Thread.Sleep(150);
                ftrScanSetDiodesStatus(ftrHandle, 0, 0);
            } catch {}

            var tpl = FingerprintEngine.Extract(rawImage);
            string b64 = FingerprintEngine.Serialize(tpl);
            Console.WriteLine("{\"success\":true,\"template\":\"" + b64 + "\",\"quality\":95,\"message\":\"Huella capturada exitosamente.\"}");
        } finally {
            try {
                ftrScanSetDiodesStatus(ftrHandle, 0, 0);
            } catch {}
            ftrScanCloseDevice(ftrHandle);
        }
    }
}
