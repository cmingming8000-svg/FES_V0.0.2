import React from 'react';
import { AlertTriangle, Info, XCircle, X } from 'lucide-react';

interface ConfirmDialogProps { isOpen: boolean; title: string; message: string; type?: 'danger' | 'warning' | 'info'; confirmLabel?: string; cancelLabel?: string; onConfirm: () => void; onCancel: () => void; }

export default function ConfirmDialog({ isOpen, title, message, type = 'warning', confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel }: ConfirmDialogProps) {
  if (!isOpen) return null;
  const typeStyles = { danger: { icon: <XCircle size={24} />, iconColor: '#C41E3A', bgColor: '#FEE2E2', btnColor: '#C41E3A' }, warning: { icon: <AlertTriangle size={24} />, iconColor: '#B87333', bgColor: '#FEF3C7', btnColor: '#B87333' }, info: { icon: <Info size={24} />, iconColor: '#002366', bgColor: '#DBEAFE', btnColor: '#002366' } };
  const style = typeStyles[type];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-xl shadow-2xl p-6" style={{ backgroundColor: '#EDEBE8' }}>
        <button onClick={onCancel} className="absolute top-3 right-3 p-1 rounded-lg hover:bg-black/10"><X size={18} /></button>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: style.bgColor, color: style.iconColor }}>{style.icon}</div>
          <div className="flex-1"><h3 className="text-lg font-semibold mb-1">{title}</h3><p className="text-sm" style={{ color: '#4B5563' }}>{message}</p></div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-black/5" style={{ borderColor: '#D5D8DC' }}>{cancelLabel}</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: style.btnColor }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
