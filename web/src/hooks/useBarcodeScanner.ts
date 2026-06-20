import { useEffect, useRef, useState } from "react";
import { prepareZXingModule, readBarcodes, type ReaderOptions, type ReadResult } from "zxing-wasm/reader";
import zxingReaderWasmURL from "../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm?url";

// Always decode with the bundled zxing-wasm (no native BarcodeDetector) so the
// behaviour is identical on every platform, and load the wasm locally instead
// of the default CDN.
prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => (path.endsWith(".wasm") ? zxingReaderWasmURL : prefix + path)
  }
});

export type BarcodeScanResult = {
  value: string;
  format: string;
  overlay?: { points: string; viewBox: string };
};

type UseBarcodeScannerOptions = {
  active: boolean;
  onResult: (result: BarcodeScanResult) => void;
  onError: (error: unknown) => void;
};

// tryHarder/tryRotate/tryInvert/tryDownscale dramatically improve real-world 1D
// reads (skew, glare, low contrast) and aren't exposed by react-zxing.
const READER_OPTIONS: ReaderOptions = {
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 1
};

// Request a high-resolution rear camera with continuous autofocus; thin 1D bars
// are unreadable at the ~640x480 default the browser otherwise picks.
const SCAN_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet]
  },
  audio: false
};

const DECODE_INTERVAL_MS = 120;

export function useBarcodeScanner({ active, onResult, onError }: UseBarcodeScannerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    let decoding = false;
    let lastDecode = 0;
    pausedRef.current = false;

    function grabFrame(video: HTMLVideoElement): ImageData | null {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) {
        return null;
      }
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      if (canvas.width !== width) {
        canvas.width = width;
      }
      if (canvas.height !== height) {
        canvas.height = height;
      }
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return null;
      }
      context.drawImage(video, 0, 0, width, height);
      return context.getImageData(0, 0, width, height);
    }

    async function tick() {
      if (cancelled) {
        return;
      }
      const video = videoRef.current;
      const now = performance.now();
      if (
        video &&
        !pausedRef.current &&
        !decoding &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        now - lastDecode >= DECODE_INTERVAL_MS
      ) {
        lastDecode = now;
        decoding = true;
        try {
          const frame = grabFrame(video);
          if (frame) {
            const results = await readBarcodes(frame, READER_OPTIONS);
            const hit = results.find((result) => result.text);
            if (hit && !cancelled && !pausedRef.current) {
              pausedRef.current = true;
              onResultRef.current(toScanResult(hit, video));
            }
          }
        } catch {
          // Per-frame decode failures are expected; keep scanning.
        } finally {
          decoding = false;
        }
      }
      requestNext();
    }

    function requestNext() {
      if (cancelled) {
        return;
      }
      const video = videoRef.current as
        | (HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number })
        | null;
      if (video?.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(() => void tick());
      } else {
        requestAnimationFrame(() => void tick());
      }
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(SCAN_CONSTRAINTS);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchAvailable(Boolean(capabilities?.torch));
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        requestNext();
      } catch (error) {
        if (!cancelled) {
          onErrorRef.current(error);
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      pausedRef.current = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
      }
      setTorchOn(false);
      setTorchAvailable(false);
    };
  }, [active]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) {
      return;
    }
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch (error) {
      onErrorRef.current(error);
    }
  }

  function resume() {
    pausedRef.current = false;
  }

  return { videoRef, torchOn, torchAvailable, toggleTorch, resume };
}

function toScanResult(result: ReadResult, video: HTMLVideoElement): BarcodeScanResult {
  return {
    value: result.text,
    format: String(result.format),
    overlay: overlayFromResult(result, video)
  };
}

function overlayFromResult(result: ReadResult, video: HTMLVideoElement): BarcodeScanResult["overlay"] | undefined {
  const position = result.position;
  if (!position) {
    return undefined;
  }
  const corners = [position.topLeft, position.topRight, position.bottomRight, position.bottomLeft];
  if (corners.some((point) => !point)) {
    return undefined;
  }
  return {
    viewBox: `0 0 ${video.videoWidth || 1} ${video.videoHeight || 1}`,
    points: corners.map((point) => `${point.x},${point.y}`).join(" ")
  };
}
