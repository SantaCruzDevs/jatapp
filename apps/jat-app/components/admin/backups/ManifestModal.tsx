'use client';

import React from 'react';
import { X, FileCode, CheckCircle, Copy, Check } from 'lucide-react';

interface ManifestModalProps {
  isOpen: boolean;
  onClose: () => void;
  backupCode: string;
  manifest: any;
  sha256Checksum?: string | null;
}

export default function ManifestModal({
  isOpen,
  onClose,
  backupCode,
  manifest,
  sha256Checksum,
}: ManifestModalProps) {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const handleCopyHash = () => {
    if (sha256Checksum) {
      navigator.clipboard.writeText(sha256Checksum);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#1E293B] border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between bg-[#0F172A]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Detalle del Manifiesto</h3>
              <p className="text-xs text-slate-400 font-mono">{backupCode}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-300">
          {/* Checksum Badge */}
          {sha256Checksum && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Checksum SHA-256 (ZIP Completo)
                </span>
                <span className="font-mono text-xs text-emerald-400 break-all">{sha256Checksum}</span>
              </div>
              <button
                onClick={handleCopyHash}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-md border border-slate-700 transition shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado' : 'Copiar Hash'}
              </button>
            </div>
          )}

          {/* JSON Tree */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Contenido del MANIFEST.json
            </span>
            <pre className="bg-[#090D16] p-4 rounded-lg border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto max-h-[350px]">
              {JSON.stringify(manifest || { message: 'Manifiesto no disponible' }, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-700 bg-[#0F172A] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
