import React, { useEffect, useState } from 'react';
import { CheckCircle, Download, FileSignature, ShieldCheck, AlertCircle } from 'lucide-react';
import { errorMessage } from '../api/client';
import { store } from '../store';
import type { AgreementSummary, AgreementTemplate, AgreementType } from '../types';
import SignaturePad from './SignaturePad';

interface AgreementSignModalProps {
  type: AgreementType;
  cycleId: string;
  description: string;
  allowComments?: boolean;
  onSign: (signature: string, comments?: string) => Promise<AgreementSummary>;
  onClose: () => void;
}

/**
 * Presents the server's exact agreement text, captures the e-signature, and
 * offers the signed receipt (PDF certificate) as soon as signing completes.
 */
export default function AgreementSignModal({ type, cycleId, description, allowComments, onSign, onClose }: AgreementSignModalProps) {
  const [template, setTemplate] = useState<AgreementTemplate | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState<AgreementSummary | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    store.getAgreementTemplate(type, cycleId).then(setTemplate).catch(err => setError(errorMessage(err)));
  }, [type, cycleId]);

  const handleSign = async () => {
    if (!signature || !accepted) return;
    setSubmitting(true);
    setError(null);
    try {
      setSigned(await onSign(signature, allowComments ? comments.trim() : undefined));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!signed) return;
    setDownloading(true);
    try { await store.downloadAgreementReceipt(signed); }
    catch (err) { setError(errorMessage(err)); }
    finally { setDownloading(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={signed ? onClose : undefined} />
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-xl shadow-2xl p-6" style={{ backgroundColor: '#EDEBE8' }}>
        {signed ? (
          <div className="text-center py-4">
            <CheckCircle size={44} className="mx-auto mb-3" style={{ color: '#2E8B57' }} />
            <h3 className="text-lg font-semibold mb-1" style={{ color: '#002366' }}>{template?.title ?? 'Agreement'} Signed</h3>
            <p className="text-xs mb-4" style={{ color: '#4B5563' }}>Signed {new Date(signed.signedAt).toUTCString()}</p>
            <div className="text-left p-3 rounded-lg mb-4 text-xs space-y-1" style={{ backgroundColor: '#F8F6F1', border: '1px solid #D5D8DC' }}>
              <p><strong>Tracking ID:</strong> <span className="font-mono">{signed.trackingId}</span></p>
              <p className="break-all"><strong>SHA-256:</strong> <span className="font-mono">{signed.documentHash}</span></p>
            </div>
            {error && <p className="text-xs mb-3" style={{ color: '#C41E3A' }}>{error}</p>}
            <div className="flex justify-center gap-2">
              <button onClick={handleDownload} disabled={downloading} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#2E8B57' }}>
                <Download size={14} />{downloading ? 'Preparing…' : 'Download Signed Receipt (PDF)'}
              </button>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-black/5" style={{ borderColor: '#D5D8DC' }}>Close</button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-semibold mb-1 flex items-center gap-2" style={{ color: '#002366' }}>
              <FileSignature size={20} style={{ color: '#B87333' }} />{template?.title ?? 'Loading agreement…'}
            </h3>
            <p className="text-xs mb-4" style={{ color: '#4B5563' }}>{description}</p>
            <div className="p-4 rounded-lg mb-4" style={{ backgroundColor: '#F8F6F1', border: '1px solid #D5D8DC' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: '#002366' }}>Agreement Terms {template && <span className="font-normal" style={{ color: '#9CA3AF' }}>(v{template.version})</span>}</p>
              <ol className="text-xs space-y-1.5 list-decimal pl-4" style={{ color: '#4B5563' }}>
                {template?.clauses.map((c, i) => <li key={i}>{c}</li>)}
              </ol>
            </div>
            {allowComments && (
              <div className="mb-4">
                <label className="block text-xs font-medium mb-1">Oversight comments (optional)</label>
                <textarea value={comments} onChange={e => setComments(e.target.value)} maxLength={2000} rows={2} className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
              </div>
            )}
            <SignaturePad onSignatureChange={setSignature} width={500} height={180} />
            <label className="flex items-start gap-2 mt-4 text-xs cursor-pointer">
              <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-0.5" />
              <span>I have read and agree to the terms above, and I intend this electronic signature to be legally binding under RA 8792.</span>
            </label>
            <p className="mt-2 text-[10px] flex items-center gap-1" style={{ color: '#6B7280' }}>
              <ShieldCheck size={12} />A SHA-256 hash of the signed record is stored in an immutable audit trail.
            </p>
            {error && <div className="mt-3 flex items-center gap-2 p-2 rounded-lg text-xs" style={{ backgroundColor: '#FEE2E2', color: '#C41E3A' }}><AlertCircle size={14} />{error}</div>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onClose} disabled={submitting} className="px-3 py-1.5 rounded-lg text-sm border hover:bg-black/5" style={{ borderColor: '#D5D8DC' }}>Cancel</button>
              <button onClick={handleSign} disabled={!signature || !accepted || !template || submitting} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#002366' }}>
                {submitting ? 'Signing…' : 'Sign Agreement'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
