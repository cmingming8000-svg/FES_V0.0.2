import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Eraser, Undo } from 'lucide-react';

interface SignaturePadProps {
  onSignatureChange: (signature: string | null) => void;
  width?: number;
  height?: number;
}

export default function SignaturePad({ onSignatureChange, width = 400, height = 200 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [hasSignature, setHasSignature] = useState(false);

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => [...prev.slice(-10), imageData]);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#002366';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    saveState();
  }, [saveState]);

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveState();
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      const signature = canvas.toDataURL('image/png');
      onSignatureChange(signature);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSignatureChange(null);
    saveState();
  };

  const undo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (history.length > 1) {
      const previousState = history[history.length - 2];
      ctx.putImageData(previousState, 0, 0);
      setHistory(prev => prev.slice(0, -1));
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const isEmpty = imageData.data.every((value, index) => index % 4 === 3 ? value === 0 : value === 255);
      if (isEmpty) { setHasSignature(false); onSignatureChange(null); }
      else { const signature = canvas.toDataURL('image/png'); onSignatureChange(signature); }
    }
  };

  return (
    <div className="space-y-3">
      <div className="border-2 rounded-lg overflow-hidden" style={{ borderColor: '#D5D8DC', backgroundColor: '#FFFFFF' }}>
        <canvas ref={canvasRef} width={width} height={height} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} style={{ width: '100%', height: `${height}px`, cursor: 'crosshair', touchAction: 'none' }} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={undo} disabled={history.length <= 1} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#D5D8DC', color: '#1A1A1A' }}><Undo size={14} />Undo</button>
        <button type="button" onClick={clear} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90" style={{ backgroundColor: '#C41E3A', color: '#FFFFFF' }}><Eraser size={14} />Clear</button>
      </div>
      {!hasSignature && (<p className="text-xs italic" style={{ color: '#9CA3AF' }}>Please sign in the box above using your mouse, stylus, or finger</p>)}
    </div>
  );
}
