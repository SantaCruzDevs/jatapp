'use client';

import React, { useState, useEffect } from 'react';
import { Company, CompanyTaxMode } from '@/types/database.types';
import { updateCompany } from '@/lib/services/companies';
import { 
  Building2, 
  X, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Phone,
  Mail,
  MapPin,
  ShieldCheck
} from 'lucide-react';

interface EditCompanyModalProps {
  company: Company;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedCompany: Company) => void;
}

export function EditCompanyModal({
  company,
  isOpen,
  onClose,
  onSuccess,
}: EditCompanyModalProps) {
  const [businessName, setBusinessName] = useState(company.business_name || '');
  const [tradeName, setTradeName] = useState(company.trade_name || '');
  const [nit, setNit] = useState(company.nit || '');
  const [phone, setPhone] = useState(company.phone || '');
  const [email, setEmail] = useState(company.email || '');
  const [address, setAddress] = useState(company.address || '');
  const [taxMode, setTaxMode] = useState<CompanyTaxMode>(company.tax_mode || 'SIN_FACTURA');
  const [status, setStatus] = useState<'active' | 'inactive' | 'suspended'>(company.status || 'active');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && company) {
      setBusinessName(company.business_name || '');
      setTradeName(company.trade_name || '');
      setNit(company.nit || '');
      setPhone(company.phone || '');
      setEmail(company.email || '');
      setAddress(company.address || '');
      setTaxMode(company.tax_mode || 'SIN_FACTURA');
      setStatus(company.status || 'active');
      setErrorMsg(null);
    }
  }, [company, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setErrorMsg('La Razón Social de la empresa es obligatoria.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const updated = await updateCompany(company.id, {
        business_name: businessName,
        trade_name: tradeName || null,
        nit: nit || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        tax_mode: taxMode,
        status: status,
      });

      onSuccess(updated);
      onClose();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error al actualizar los datos de la empresa.');
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
            <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-heading">
                Editar Datos de Empresa
              </h3>
              <p className="text-xs text-slate-400">
                Actualización de perfil comercial, tributario y de contacto
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Error Banner */}
        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Razón Social <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Ej. MotoJAT Servicios S.R.L."
                className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Nombre Comercial</label>
              <input
                type="text"
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                placeholder="Ej. MotoJAT"
                className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">NIT</label>
              <input
                type="text"
                value={nit}
                onChange={(e) => setNit(e.target.value)}
                placeholder="Ej. 1020304050"
                className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Teléfono Empresa</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. +591 3 3334455"
                className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Correo Electrónico Corporativo</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contacto@empresa.com"
              className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Dirección Corporativa</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Av. Principal #123, Zona Central"
              className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-[#334155]/60">
            <div>
              <label className="block text-amber-300 font-bold mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                Tratamiento Tributario
              </label>
              <select
                value={taxMode}
                onChange={(e) => setTaxMode(e.target.value as CompanyTaxMode)}
                className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-amber-300 font-bold focus:outline-none focus:border-amber-500"
              >
                <option value="SIN_FACTURA">Sin Impuesto (0.00%)</option>
                <option value="IVA_13">Factura Directa IVA (13.00%)</option>
                <option value="EFECTIVA_14_94">Impuesto Efectivo (14.94%)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Estado de la Empresa
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-[#FDDE12]"
              >
                <option value="active">Activa</option>
                <option value="suspended">Suspendida</option>
                <option value="inactive">Inactiva</option>
              </select>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-[#FDDE12] hover:bg-[#e6c800] text-[#0F172A] font-bold rounded-xl flex items-center gap-2 transition-all shadow-md disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Guardar Cambios</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
