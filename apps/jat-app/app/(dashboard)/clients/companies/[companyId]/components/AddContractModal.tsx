'use client';

import React, { useState, useEffect } from 'react';
import { CompanyContract } from '@/types/database.types';
import {
  createCompanyContract,
  uploadContractPdf,
  hasActiveCompanyContract
} from '@/lib/services/company-contracts';
import {
  FileText,
  X,
  Loader2,
  Calendar,
  Upload,
  AlertCircle,
  FileCheck,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface AddContractModalProps {
  companyId: string;
  companyName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newContract: CompanyContract) => void;
}

export function AddContractModal({
  companyId,
  companyName,
  isOpen,
  onClose,
  onSuccess,
}: AddContractModalProps) {
  const todayStr = new Date().toISOString().split('T')[0];

  const [contractNumber, setContractNumber] = useState('');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState('');
  const [isIndefinite, setIsIndefinite] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pdfWarningMsg, setPdfWarningMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setContractNumber('');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate('');
      setIsIndefinite(false);
      setPdfFile(null);
      setNotes('');
      setErrorMsg(null);
      setPdfWarningMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setPdfFile(null);
      return;
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Formato no válido. Debe seleccionar únicamente archivos en formato PDF.');
      setPdfFile(null);
      return;
    }

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('El archivo seleccionado excede el límite máximo de 10 MB.');
      setPdfFile(null);
      return;
    }

    setErrorMsg(null);
    setPdfFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setPdfWarningMsg(null);

    const cleanNumber = contractNumber.trim();
    if (!cleanNumber) {
      setErrorMsg('El Número de Contrato es obligatorio.');
      return;
    }

    if (cleanNumber.length > 100) {
      setErrorMsg('El Número de Contrato no puede exceder 100 caracteres.');
      return;
    }

    if (!startDate) {
      setErrorMsg('La Fecha de Inicio es obligatoria.');
      return;
    }

    // Validation E & D: End Date Validations
    if (!isIndefinite && endDate) {
      // Rule 1: end_date < start_date
      if (endDate < startDate) {
        setErrorMsg('La Fecha de Finalización debe ser igual o posterior a la Fecha de Inicio.');
        return;
      }

      // Rule 2: end_date < CURRENT_DATE (Already expired)
      if (endDate < todayStr) {
        setErrorMsg('La fecha de finalización ya venció. No se puede registrar un contrato cuya vigencia haya concluido.');
        return;
      }
    }

    // Determine initial status according to approved lifecycle rules:
    // A) start_date <= todayStr -> 'active'
    // B) start_date > todayStr -> 'draft' (Future Contract)
    const initialStatus = startDate <= todayStr ? 'active' : 'draft';

    setSaving(true);

    try {
      // If initialStatus is 'active', pre-check if an active contract already exists
      if (initialStatus === 'active') {
        const activeExists = await hasActiveCompanyContract(companyId);
        if (activeExists) {
          setErrorMsg(
            'Esta empresa ya tiene un contrato vigente. Para registrar un nuevo contrato vigente primero debe gestionarse el contrato actual.'
          );
          setSaving(false);
          return;
        }
      }

      // 1. Create company contract record
      const createdContract = await createCompanyContract({
        company_id: companyId,
        contract_number: cleanNumber,
        start_date: startDate,
        end_date: isIndefinite ? null : (endDate || null),
        notes: notes.trim() || null,
        status: initialStatus,
      });

      // 2. Upload PDF if selected
      if (pdfFile) {
        try {
          await uploadContractPdf(companyId, createdContract.id, pdfFile);
        } catch (pdfErr: unknown) {
          console.error('Error uploading PDF during contract creation:', pdfErr);
          setPdfWarningMsg(
            `El contrato fue registrado exitosamente, pero el archivo PDF no pudo adjuntarse: ${(pdfErr as Error).message}`
          );
        }
      }

      onSuccess(createdContract);
      onClose();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error al registrar el contrato corporativo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-scaleUp">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-sky-500/10 border border-sky-500/30 text-sky-400 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">
                Agregar Contrato Corporativo
              </h3>
              <p className="text-[11px] text-slate-400">Empresa: {companyName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Error / Warning Banner */}
        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {pdfWarningMsg && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{pdfWarningMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Contract Number */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Número de Contrato <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={100}
              placeholder="Ej. CC-2026-0001"
              value={contractNumber}
              onChange={(e) => setContractNumber(e.target.value)}
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] focus:border-sky-500 rounded-xl text-white font-mono placeholder:text-slate-600 focus:outline-none transition-colors"
            />
          </div>

          {/* Dates Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Start Date */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Fecha de Inicio <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] focus:border-sky-500 rounded-xl text-white font-mono focus:outline-none transition-colors"
              />
            </div>

            {/* End Date */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Fecha de Finalización
              </label>
              <input
                type="date"
                disabled={isIndefinite}
                value={isIndefinite ? '' : endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] focus:border-sky-500 rounded-xl text-white font-mono focus:outline-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Indefinite Duration Checkbox */}
          <div className="flex items-center gap-2 pt-0.5">
            <input
              type="checkbox"
              id="chkIndefinite"
              checked={isIndefinite}
              onChange={(e) => {
                setIsIndefinite(e.target.checked);
                if (e.target.checked) setEndDate('');
              }}
              className="w-4 h-4 rounded bg-[#0F172A] border-[#334155] text-sky-500 focus:ring-sky-500 focus:ring-offset-[#1E293B]"
            />
            <label htmlFor="chkIndefinite" className="text-slate-300 font-medium cursor-pointer">
              Vigencia indefinida (sin fecha de término)
            </label>
          </div>

          {/* PDF Attachment (Optional) */}
          <div className="space-y-1 pt-1 border-t border-[#334155]">
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Documento PDF del Contrato <span className="text-slate-500 font-normal">(Opcional)</span>
            </label>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-[#0F172A] hover:bg-slate-800 border border-[#334155] hover:border-sky-500 text-sky-400 font-semibold rounded-xl transition-all">
                <Upload className="w-4 h-4" />
                <span>{pdfFile ? 'Cambiar PDF' : 'Seleccionar PDF'}</span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              {pdfFile ? (
                <span className="text-emerald-400 font-mono text-[11px] truncate max-w-xs flex items-center gap-1">
                  <FileCheck className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{pdfFile.name}</span>
                </span>
              ) : (
                <span className="text-slate-500 italic text-[11px]">Sin archivo seleccionado</span>
              )}
            </div>
          </div>

          {/* Observations / Notes */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Observaciones / Estipulaciones <span className="text-slate-500 font-normal">(Opcional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Notas comerciales, condiciones especiales o detalles del acuerdo..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] focus:border-sky-500 rounded-xl text-white placeholder:text-slate-600 focus:outline-none transition-colors"
            />
          </div>

          {/* Initial Status Preview Notice */}
          <div className="p-3 bg-[#0F172A]/70 border border-slate-700 rounded-xl flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">Estado inicial proyectado:</span>
            {startDate <= todayStr ? (
              <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full font-bold uppercase flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Vigente (Active)
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 rounded-full font-bold uppercase flex items-center gap-1">
                <Clock className="w-3 h-3" /> Programado (Borrador Futuro)
              </span>
            )}
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#334155]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-[#0F172A] rounded-xl font-extrabold flex items-center gap-2 shadow-md shadow-sky-500/20 transition-all disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>Guardar Contrato</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
