'use client';

import React, { useState } from 'react';
import { CustomerWithCompany, normalizePhone, setPrimaryContact, createCustomer, updateCustomer } from '@/lib/services/customers';
import { 
  Users, 
  UserPlus, 
  Star, 
  Phone, 
  Mail, 
  Edit, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  X, 
  IdCard, 
  Briefcase, 
  MapPin, 
  Hash 
} from 'lucide-react';

interface CompanyRequestersTabProps {
  companyId: string;
  companyName: string;
  requesters: CustomerWithCompany[];
  loading: boolean;
  onRefresh: () => void;
}

export default function CompanyRequestersTab({
  companyId,
  companyName,
  requesters,
  loading,
  onRefresh,
}: CompanyRequestersTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithCompany | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [area, setArea] = useState('');
  const [position, setPosition] = useState('');
  const [ci, setCi] = useState('');
  const [address, setAddress] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);

  const handleOpenCreateModal = () => {
    setEditingCustomer(null);
    setFullName('');
    setPhone('');
    setEmail('');
    setArea('');
    setPosition('');
    setCi('');
    setAddress('');
    setIsActive(true);
    setIsPrimaryContact(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (c: CustomerWithCompany) => {
    setEditingCustomer(c);
    setFullName(c.full_name);
    setPhone(c.phone);
    setEmail(c.email || '');
    setArea(c.area || '');
    setPosition(c.position || '');
    setCi(c.ci || '');
    setAddress(c.address || '');
    setIsActive(c.is_active !== undefined ? c.is_active : true);
    setIsPrimaryContact(Boolean(c.is_primary_contact));
    setIsModalOpen(true);
  };

  const handleSaveRequester = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      setErrorMsg('El nombre completo y el teléfono son obligatorios.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (editingCustomer) {
        const { error } = await updateCustomer(editingCustomer.id, {
          full_name: fullName,
          phone,
          email: email.trim() || null,
          company_id: companyId,
          area: area.trim() || null,
          position: position.trim() || null,
          ci: ci.trim() || null,
          address: address.trim() || null,
          is_active: isActive,
          is_primary_contact: isPrimaryContact,
        });

        if (error) throw error;
        setSuccessMsg(`Solicitante "${fullName}" actualizado correctamente.`);
      } else {
        const { error } = await createCustomer({
          full_name: fullName,
          phone,
          email: email.trim() || null,
          company_id: companyId,
          area: area.trim() || null,
          position: position.trim() || null,
          ci: ci.trim() || null,
          address: address.trim() || null,
          is_active: isActive,
          is_primary_contact: isPrimaryContact,
        });

        if (error) throw error;
        setSuccessMsg(`Solicitante "${fullName}" registrado exitosamente para ${companyName}.`);
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al guardar el solicitante');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetPrimaryContact = async (c: CustomerWithCompany) => {
    if (!c.is_active) {
      setErrorMsg('No se puede designar un solicitante inactivo como contacto principal.');
      return;
    }

    if (c.company_id !== companyId) {
      setErrorMsg('Validación de seguridad: El solicitante no pertenece a esta empresa.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const { error } = await setPrimaryContact(companyId, c.id);
      if (error) throw error;
      setSuccessMsg(`"${c.full_name}" ha sido designado como Contacto Principal de ${companyName}.`);
      onRefresh();
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al designar el contacto principal');
    }
  };

  return (
    <div className="space-y-4">
      {/* Banner Feedback */}
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

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0F172A]/70 p-4 rounded-xl border border-[#334155]">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2 font-heading">
            <Users className="w-4 h-4 text-sky-400" />
            <span>Solicitantes Autorizados ({requesters.length})</span>
          </h3>
          <p className="text-xs text-slate-400">
            Personas autorizadas para solicitar carreras corporativas en nombre de {companyName}
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-3.5 py-2 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 flex-shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Registrar Solicitante</span>
        </button>
      </div>

      {/* Requesters Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
          <span className="text-xs">Cargando solicitantes autorizados...</span>
        </div>
      ) : requesters.length === 0 ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
          <Users className="w-12 h-12 text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">No hay solicitantes registrados para esta empresa</p>
          <p className="text-xs text-slate-500 max-w-sm">
            Utiliza el botón &quot;+ Registrar Solicitante&quot; para añadir miembros del personal.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#334155]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#334155] bg-[#0F172A]/80 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Solicitante</th>
                <th className="py-3 px-4">Área / Cargo</th>
                <th className="py-3 px-4">Teléfono & Normalizado</th>
                <th className="py-3 px-4">Correo / Dirección</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#334155] text-slate-300 bg-[#1E293B]">
              {requesters.map((c) => {
                const norm = normalizePhone(c.phone);
                const isActive = c.is_active !== undefined ? c.is_active : true;

                return (
                  <tr key={c.id} className="hover:bg-[#334155]/30 transition-colors">
                    {/* Solicitante */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                          c.is_primary_contact
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-slate-700 text-[#FDDE12]'
                        }`}>
                          {c.full_name.slice(0, 2)}
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-white">{c.full_name}</p>
                            {c.is_primary_contact && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-md font-bold text-[10px]" title="Contacto Principal / Responsable de Empresa">
                                <Star className="w-3 h-3 fill-amber-400" />
                                Contacto Principal
                              </span>
                            )}
                          </div>
                          {c.ci && (
                            <p className="text-[10px] text-slate-400 flex items-center gap-1">
                              <IdCard className="w-3 h-3 text-slate-500" />
                              <span>CI: {c.ci}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Área / Cargo */}
                    <td className="py-3.5 px-4">
                      {c.area || c.position ? (
                        <div className="space-y-0.5">
                          {c.area && (
                            <p className="font-medium text-slate-200 flex items-center gap-1">
                              <Briefcase className="w-3 h-3 text-sky-400" />
                              <span>{c.area}</span>
                            </p>
                          )}
                          {c.position && (
                            <p className="text-[10px] text-slate-400">{c.position}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600 italic">N/A</span>
                      )}
                    </td>

                    {/* Teléfono */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-slate-200 font-mono">
                          <Phone className="w-3.5 h-3.5 text-sky-400" />
                          <span>{c.phone}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                          <Hash className="w-3 h-3" />
                          <span>{norm}</span>
                        </div>
                      </div>
                    </td>

                    {/* Correo / Dirección */}
                    <td className="py-3.5 px-4 text-slate-400">
                      <div className="space-y-0.5">
                        {c.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-500" />
                            <span>{c.email}</span>
                          </div>
                        )}
                        {c.address && (
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <MapPin className="w-3 h-3 text-slate-500" />
                            <span>{c.address}</span>
                          </div>
                        )}
                        {!c.email && !c.address && (
                          <span className="text-slate-600 italic">No registrado</span>
                        )}
                      </div>
                    </td>

                    {/* Estado */}
                    <td className="py-3.5 px-4 text-center">
                      {isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full font-semibold text-[10px]">
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-full font-semibold text-[10px]">
                          Inactivo
                        </span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!c.is_primary_contact && (
                          <button
                            onClick={() => handleSetPrimaryContact(c)}
                            title="Designar como Contacto Principal de la Empresa"
                            className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg transition-colors font-medium text-[10px] flex items-center gap-1"
                          >
                            <Star className="w-3 h-3" />
                            <span>Hacer Principal</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenEditModal(c)}
                          title="Editar solicitante"
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-lg">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white font-heading">
                  {editingCustomer ? 'Editar Solicitante' : 'Nuevo Solicitante Autorizado'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRequester} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Nombre Completo <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Teléfono Móvil <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. 75500004"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Cédula de Identidad (CI)</label>
                  <input
                    type="text"
                    placeholder="Ej. 7891011 SC"
                    value={ci}
                    onChange={(e) => setCi(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Área / Departamento</label>
                  <input
                    type="text"
                    placeholder="Ej. RRHH Central"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Cargo / Puesto</label>
                  <input
                    type="text"
                    placeholder="Ej. Encargado de RRHH"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Correo Electrónico (Opcional)</label>
                <input
                  type="email"
                  placeholder="juan.perez@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Dirección Habitual (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ej. Av. Banzer Km 5"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-amber-300 font-semibold">
                  <input
                    type="checkbox"
                    checked={isPrimaryContact}
                    onChange={(e) => setIsPrimaryContact(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-500 text-[#FDDE12] focus:ring-0 bg-[#0F172A]"
                  />
                  <span>Marcar como Contacto Principal de la Empresa</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 rounded border-[#334155] text-[#FDDE12] focus:ring-0 bg-[#0F172A]"
                  />
                  <span>Solicitante Activo (Habilitado para pedir carreras)</span>
                </label>
              </div>

              <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingCustomer ? 'Guardar Cambios' : 'Registrar Solicitante'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
