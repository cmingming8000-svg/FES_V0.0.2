import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { ApiError, errorMessage } from '../api/client';
import { store } from '../store';
import type { BulkImportResult } from '../types';
import { BULK_TEMPLATE_CSV, parseImportFile, type ParsedImport } from '../utils/bulkImport';
import { ROLE_LABELS } from '../utils/terminology';

export default function BulkImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const reset = () => { setParsed(null); setError(null); setRowErrors([]); setResult(null); };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    reset();
    setFileName(file.name);
    try {
      const p = await parseImportFile(file);
      setParsed(p);
      setRowErrors(p.problems);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    setError(null);
    setRowErrors([]);
    try {
      setResult(await store.bulkImportAccounts(parsed.rows));
      setParsed(null);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && Array.isArray(err.details)) setRowErrors(err.details as Array<{ row: number; message: string }>);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([BULK_TEMPLATE_CSV], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fes_bulk_onboarding_template.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const counts = parsed?.rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.role]: (m[r.role] ?? 0) + 1 }), {}) ?? {};

  return (
    <div className="rounded-xl p-6 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#002366' }}><FileSpreadsheet size={16} style={{ color: '#B87333' }} />Bulk Onboarding (CSV / Excel)</h3>
        <button type="button" onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-black/5" style={{ borderColor: '#D5D8DC' }}><Download size={12} />Download template</button>
      </div>
      <p className="text-xs mb-4" style={{ color: '#4B5563' }}>
        Import students, faculty, deans and HR / QA staff in one batch. The batch is validated and committed as a single transaction: if any row is invalid, nothing is created. Each new user receives an email invitation to set their own password.
      </p>
      <input ref={inputRef} type="file" accept=".csv,.xlsx" onChange={handleFile} className="hidden" />
      <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: '#B87333' }}><Upload size={14} />Choose file</button>
      {fileName && <p className="text-xs mt-2" style={{ color: '#6B7280' }}>{fileName}</p>}

      {parsed && (
        <div className="mt-4">
          <p className="text-xs mb-2"><strong>{parsed.rows.length}</strong> row(s): {Object.entries(counts).map(([role, n]) => `${n} ${ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}`).join(', ')}</p>
          <div className="overflow-x-auto max-h-56 rounded-lg border" style={{ borderColor: '#D5D8DC' }}>
            <table className="w-full text-xs">
              <thead><tr style={{ backgroundColor: '#002366' }}>{['Row', 'Role', 'ID', 'Name', 'Email', 'Department / Program'].map(h => <th key={h} className="text-left px-2 py-1.5 text-white font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {parsed.rows.slice(0, 50).map((r, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#F8F6F1' : '#EDEBE8' }}>
                    <td className="px-2 py-1">{i + 2}</td><td className="px-2 py-1">{ROLE_LABELS[r.role] ?? r.role}</td><td className="px-2 py-1">{r.institutionalId}</td>
                    <td className="px-2 py-1">{r.name}</td><td className="px-2 py-1">{r.email}</td><td className="px-2 py-1">{r.department ?? r.programId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > 50 && <p className="text-[10px] mt-1" style={{ color: '#9CA3AF' }}>Showing the first 50 rows.</p>}
          <button type="button" onClick={handleImport} disabled={importing || parsed.problems.length > 0} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#002366' }}>
            {importing ? 'Importing…' : `Import ${parsed.rows.length} account(s)`}
          </button>
        </div>
      )}

      {error && <div className="mt-4 flex items-start gap-2 p-3 rounded-lg text-xs" style={{ backgroundColor: '#FEE2E2', color: '#C41E3A' }}><AlertCircle size={14} className="flex-shrink-0 mt-0.5" />{error}</div>}
      {rowErrors.length > 0 && (
        <ul className="mt-2 max-h-40 overflow-y-auto text-xs space-y-1 p-3 rounded-lg" style={{ backgroundColor: '#FFF7ED', color: '#9A3412' }}>
          {rowErrors.map((e, i) => <li key={i}><strong>Row {e.row}:</strong> {e.message}</li>)}
        </ul>
      )}
      {result && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg text-xs" style={{ backgroundColor: '#D1FAE5', color: '#2E8B57' }}>
          <CheckCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>Created {result.created} account(s). Invitation emails have been sent.</span>
        </div>
      )}
    </div>
  );
}
