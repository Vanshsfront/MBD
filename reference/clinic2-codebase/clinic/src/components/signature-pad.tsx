"use client";

import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface Props {
  onChange?: (dataUrl: string | null) => void;
  height?: number;
}

/**
 * Touch/stylus/mouse-compatible signature capture.
 * Returns a base64 PNG data URL via `onChange`.
 *
 * NOTE: This signature is captured for internal clinic records. It is NOT a legally
 * binding e-signature in India without additional audit-trail infrastructure
 * (timestamps, certificates, DocuSign or equivalent). See project memory.
 */
export function SignaturePadComponent({ onChange, height = 180 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    // Size the canvas for HiDPI
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);

    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,1)",
      penColor: "#111827",
      minWidth: 0.8,
      maxWidth: 2.6,
    });
    padRef.current = pad;

    const onEnd = () => {
      if (!pad.isEmpty()) {
        setIsEmpty(false);
        onChange?.(pad.toDataURL("image/png"));
      } else {
        setIsEmpty(true);
        onChange?.(null);
      }
    };
    pad.addEventListener("endStroke", onEnd);

    return () => {
      pad.removeEventListener("endStroke", onEnd);
      pad.off();
    };
  }, [onChange]);

  const clear = () => {
    padRef.current?.clear();
    setIsEmpty(true);
    onChange?.(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg border border-dashed border-slate-300 bg-white" style={{ height }}>
        <canvas ref={canvasRef} className="w-full h-full rounded-lg touch-none" />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 pointer-events-none">
            Sign here with your finger or stylus
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-amber-700">
          Draft signature — not legally binding without DocuSign/e-sign certificate.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={clear} className="h-7 text-xs">
          <Eraser className="h-3 w-3 mr-1" /> Clear
        </Button>
      </div>
    </div>
  );
}
