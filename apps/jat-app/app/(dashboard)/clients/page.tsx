'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Topbar from '@/components/layout/Topbar';
import { 
  getCustomers, 
  createCustomer, 
  updateCustomer, 
  CustomerWithCompany 
} from '@/lib/services/customers';
import { getCompanies, createCompanyWithFirstContact } from '@/lib/services/companies';
import { Company } from '@/types/database.types';
import CompaniesTable from './components/CompaniesTable';
import ParticularsTable from './components/ParticularsTable';
import { 
  Users, 
  UserPlus, 
  Search, 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  X
} from 'lucide-react';

type MainTab = 'empresas' | 'particulares';
type RegistrationType = 'company' | 'particular';

export default function ClientsPage() {
  const [customers, setCustomers] = useState<CustomerWithCompany[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mainTab, setMainTab] = useState<MainTab>('empresas');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithCompany | null>(null);
  const [regType, setRegType] = useState<RegistrationType>('company');
  const [isSaving, setIsSaving] = useState(false);

  // Company Form Fields (For new Company + First Contact)
  const [businessName, setBusinessName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [nit, setNit] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');

  // Contact / Person Form Fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [area, setArea] = useState('');
  const [position, setPosition] = useState('');
  const [ci, setCi] = useState('');
  const [address, setAddress] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isPrimaryContact, setIsPrimaryContact] = useState(true);

  const loadData = useCallback(async (searchQuery?: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [custRes, compData] = await Promise.all([
        getCustomers(searchQuery),
        getCompanies(),
      ]);

      if (custRes.error) setErrorMsg(custRes.error.message);
      else setCustomers(custRes.data || []);

      if (compData) setCompanies(compData);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al cargar listado de clientes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Efficient in-memory counts & primary contact lookup without N+1 queries
  const companySolicitanteCounts = useMemo(() => {
    const map: Record<string, number> = {};
    customers.forEach((c) => {
      if (c.company_id) {
        map[c.company_id] = (map[c.company_id] || 0) + 1;
      }
    });
    return map;
  }, [customers]);

  const companyPrimaryContacts = useMemo(() => {
    const map: Record<string, CustomerWithCompany> = {};
    customers.forEach((c) => {
      if (c.company_id && c.is_primary_contact) {
        map[c.company_id] = c;
      }
    });
    return map;
  }, [customers]);

  // Filtered lists by search term
  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase().trim();
    return companies.filter(
      (comp) =>
        comp.business_name.toLowerCase().includes(q) ||
        (comp.trade_name && comp.trade_name.toLowerCase().includes(q)) ||
        (comp.nit && comp.nit.toLowerCase().includes(q))
    );
  }, [companies, search]);

  const particularCustomers = useMemo(() => {
    const particulars = customers.filter((c) => !c.company_id);
    if (!search.trim()) return particulars;
    const q = search.toLowerCase().trim();
    return particulars.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.ci && c.ci.toLowerCase().includes(q))
    );
  }, [customers, search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(search);
  };

  const handleOpenCreateModal = (type: RegistrationType) => {
    setEditingCustomer(null);
    setRegType(type);
    setBusinessName('');
    setTradeName('');
    setNit('');
    setCompanyPhone('');
    setCompanyEmail('');
    setCompanyAddress('');
    setFullName('');
    setPhone('');
    setEmail('');
    setCompanyId('');
    setArea('');
    setPosition('');
    setCi('');
    setAddress('');
    setIsActive(true);
    setIsPrimaryContact(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (c: CustomerWithCompany) => {
    setEditingCustomer(c);
    setFullName(c.full_name);
    setPhone(c.phone);
    setEmail(c.email || '');
    setCompanyId(c.company_id || '');
    setArea(c.area || '');
    setPosition(c.position || '');
    setCi(c.ci || '');
    setAddress(c.address || '');
    setIsActive(c.is_active !== undefined ? c.is_active : true);
    setIsPrimaryContact(Boolean(c.is_primary_contact));
    setIsModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (editingCustomer) {
        if (!fullName.trim() || !phone.trim()) {
          throw new Error('Nombre completo y teléfono son obligatorios.');
        }

        const { error } = await updateCustomer(editingCustomer.id, {
          full_name: fullName,
          phone,
          email: email.trim() || null,
          company_id: companyId || null,
          area: area.trim() || null,
          position: position.trim() || null,
          ci: ci.trim() || null,
          address: address.trim() || null,
          is_active: isActive,
          is_primary_contact: Boolean(companyId && isPrimaryContact),
        });

        if (error) throw error;
        setSuccessMsg(`Cliente "${fullName}" actualizado correctamente.`);
      } else if (regType === 'company') {
        if (!businessName.trim()) {
          throw new Error('La Razón Social de la empresa es obligatoria.');
        }
        if (!fullName.trim()) {
          throw new Error('El nombre del primer contacto es obligatorio.');
        }
        if (!phone.trim()) {
          throw new Error('El teléfono del primer contacto es obligatorio.');
        }

        await createCompanyWithFirstContact({
          business_name: businessName,
          trade_name: tradeName,
          nit,
          company_phone: companyPhone,
          company_email: companyEmail,
          company_address: companyAddress,
          contact_full_name: fullName,
          contact_phone: phone,
          contact_ci: ci,
          contact_email: email,
          contact_area: area,
          contact_position: position,
          contact_address: address,
          is_primary_contact: isPrimaryContact,
          is_active: isActive,
        });

        setSuccessMsg(`Empresa "${businessName}" y primer contacto "${fullName}" creados correctamente.`);
      } else {
        if (!fullName.trim() || !phone.trim()) {
          throw new Error('Nombre completo y teléfono son obligatorios para el cliente particular.');
        }

        const { error } = await createCustomer({
          full_name: fullName,
          phone,
          email: email.trim() || null,
          company_id: null,
          area: null,
          position: null,
          ci: ci.trim() || null,
          address: address.trim() || null,
          is_active: isActive,
          is_primary_contact: false,
        });

        if (error) throw error;
        setSuccessMsg(`Cliente Particular "${fullName}" registrado exitosamente.`);
      }

      setIsModalOpen(false);
      loadData(search);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al guardar el registro');
    } finally {
      setIsSaving(false);
    }
  };

  const totalParticulars = useMemo(() => customers.filter((c) => !c.company_id).length, [customers]);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <Topbar
        title="Directorio de Clientes"
        subtitle="Gestión unificada de empresas corporativas y clientes particulares de MotoJAT"
      />

      <main className="p-6 space-y-6 flex-1 max-w-7xl mx-auto w-full">
        {/* Banner Feedback */}
        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Navigation Tabs (EMPRESAS vs PARTICULARES) */}
        <div className="flex items-center justify-between gap-4 border-b border-[#334155] pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMainTab('empresas')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                mainTab === 'empresas'
                  ? 'bg-[#FDDE12] text-[#0F172A] shadow-md shadow-[#FDDE12]/20'
                  : 'bg-[#1E293B] text-slate-400 hover:text-white border border-[#334155]'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Empresas ({companies.length})</span>
            </button>

            <button
              onClick={() => setMainTab('particulares')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                mainTab === 'particulares'
                  ? 'bg-[#FDDE12] text-[#0F172A] shadow-md shadow-[#FDDE12]/20'
                  : 'bg-[#1E293B] text-slate-400 hover:text-white border border-[#334155]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Particulares ({totalParticulars})</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <form onSubmit={handleSearchSubmit} className="relative w-64 sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={
                  mainTab === 'empresas'
                    ? 'Buscar empresa por razón social, NIT...'
                    : 'Buscar particular por nombre, teléfono, CI...'
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#1E293B] border border-[#334155] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
              />
            </form>

            {mainTab === 'empresas' ? (
              <button
                onClick={() => handleOpenCreateModal('company')}
                className="px-4 py-2 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 flex-shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Nueva Empresa</span>
              </button>
            ) : (
              <button
                onClick={() => handleOpenCreateModal('particular')}
                className="px-4 py-2 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 flex-shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Nuevo Particular</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-[#1E293B] rounded-2xl border border-[#334155] overflow-hidden shadow-xl">
          {mainTab === 'empresas' ? (
            <CompaniesTable
              companies={filteredCompanies}
              companySolicitanteCounts={companySolicitanteCounts}
              companyPrimaryContacts={companyPrimaryContacts}
              loading={loading}
            />
          ) : (
            <ParticularsTable
              customers={particularCustomers}
              loading={loading}
              onEdit={handleOpenEditModal}
            />
          )}
        </div>
      </main>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-lg">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white font-heading">
                  {editingCustomer
                    ? 'Editar Cliente'
                    : regType === 'company'
                    ? 'Nueva Empresa Corporativa'
                    : 'Nuevo Cliente Particular'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-4 text-xs">
              {/* Type Selector (Only when creating a new record) */}
              {!editingCustomer && (
                <div className="grid grid-cols-2 gap-3 pb-2 border-b border-[#334155]">
                  <button
                    type="button"
                    onClick={() => setRegType('company')}
                    className={`p-3 rounded-xl border flex flex-col items-start text-left transition-all ${
                      regType === 'company'
                        ? 'bg-[#FDDE12]/10 border-[#FDDE12] text-white shadow-md'
                        : 'bg-[#0F172A] border-[#334155] text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Building2 className={`w-4 h-4 ${regType === 'company' ? 'text-[#FDDE12]' : 'text-slate-500'}`} />
                      <span>Empresa</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">Empresa corporativa + primer contacto</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegType('particular')}
                    className={`p-3 rounded-xl border flex flex-col items-start text-left transition-all ${
                      regType === 'particular'
                        ? 'bg-[#FDDE12]/10 border-[#FDDE12] text-white shadow-md'
                        : 'bg-[#0F172A] border-[#334155] text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Users className={`w-4 h-4 ${regType === 'particular' ? 'text-[#FDDE12]' : 'text-slate-500'}`} />
                      <span>Particular</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">Persona física independiente</span>
                  </button>
                </div>
              )}

              {/* NEW COMPANY FORM */}
              {!editingCustomer && regType === 'company' && (
                <div className="space-y-4">
                  <div className="p-3.5 bg-[#0F172A]/70 border border-indigo-500/30 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-indigo-300 font-bold border-b border-indigo-500/20 pb-2">
                      <Building2 className="w-4 h-4" />
                      <span>DATOS DE LA EMPRESA</span>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Razón Social <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. FARMACORP SRL"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Nombre Comercial</label>
                        <input
                          type="text"
                          placeholder="Ej. Farmacorp"
                          value={tradeName}
                          onChange={(e) => setTradeName(e.target.value)}
                          className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-medium mb-1">NIT</label>
                        <input
                          type="text"
                          placeholder="Ej. 102030405"
                          value={nit}
                          onChange={(e) => setNit(e.target.value)}
                          className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Teléfono Empresa</label>
                        <input
                          type="text"
                          placeholder="Ej. 33445566"
                          value={companyPhone}
                          onChange={(e) => setCompanyPhone(e.target.value)}
                          className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Correo Empresa</label>
                        <input
                          type="email"
                          placeholder="contacto@empresa.com"
                          value={companyEmail}
                          onChange={(e) => setCompanyEmail(e.target.value)}
                          className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Dirección Corporativa</label>
                      <input
                        type="text"
                        placeholder="Ej. Av. Cristóbal de Mendoza #450"
                        value={companyAddress}
                        onChange={(e) => setCompanyAddress(e.target.value)}
                        className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                      />
                    </div>
                  </div>

                  <div className="p-3.5 bg-[#0F172A]/70 border border-amber-500/30 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-amber-300 font-bold border-b border-amber-500/20 pb-2">
                      <UserPlus className="w-4 h-4" />
                      <span>DATOS DEL PRIMER CONTACTO / SOLICITANTE</span>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Nombre Completo del Contacto <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Juan Pérez"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
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
                          className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Cédula de Identidad (CI)</label>
                        <input
                          type="text"
                          placeholder="Ej. 7891011 SC"
                          value={ci}
                          onChange={(e) => setCi(e.target.value)}
                          className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
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
                          className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Cargo / Puesto</label>
                        <input
                          type="text"
                          placeholder="Ej. Encargado de RRHH"
                          value={position}
                          onChange={(e) => setPosition(e.target.value)}
                          className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                        />
                      </div>
                    </div>

                    <div className="pt-2 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer text-amber-300 font-semibold">
                        <input
                          type="checkbox"
                          checked={isPrimaryContact}
                          onChange={(e) => setIsPrimaryContact(e.target.checked)}
                          className="w-4 h-4 rounded border-amber-500 text-[#FDDE12] focus:ring-0 bg-[#0F172A]"
                        />
                        <span>Marcar como Contacto Principal</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* NEW PARTICULAR FORM */}
              {!editingCustomer && regType === 'particular' && (
                <div className="p-3.5 bg-[#0F172A]/70 border border-[#334155] rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-sky-300 font-bold border-b border-[#334155] pb-2">
                    <Users className="w-4 h-4" />
                    <span>DATOS DE LA PERSONA PARTICULAR</span>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Nombre Completo <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Carlos Méndez"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Teléfono <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. 75567890"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">CI</label>
                      <input
                        type="text"
                        placeholder="Ej. 4567890 SC"
                        value={ci}
                        onChange={(e) => setCi(e.target.value)}
                        className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Correo Electrónico (Opcional)</label>
                    <input
                      type="email"
                      placeholder="carlos@correo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Dirección (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. Barrio Sirari Calle 4 #12"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>
                </div>
              )}

              {/* EDITING MODE */}
              {editingCustomer && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Empresa Vinculada</label>
                    <select
                      value={companyId}
                      onChange={(e) => {
                        setCompanyId(e.target.value);
                        if (!e.target.value) {
                          setIsPrimaryContact(false);
                          setArea('');
                          setPosition('');
                        }
                      }}
                      className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-[#FDDE12]"
                    >
                      <option value="">-- Cliente Particular (Persona Física) --</option>
                      {companies.map((comp) => (
                        <option key={comp.id} value={comp.id}>
                          Empresa: {comp.business_name} {comp.nit ? `(NIT: ${comp.nit})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Nombre Completo <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>

                  {companyId && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer text-amber-300 font-semibold">
                        <input
                          type="checkbox"
                          checked={isPrimaryContact}
                          onChange={(e) => setIsPrimaryContact(e.target.checked)}
                          className="w-4 h-4 rounded border-amber-500 text-[#FDDE12] focus:ring-0 bg-[#0F172A]"
                        />
                        <span>Marcar como Contacto Principal de la Empresa</span>
                      </label>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Teléfono <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-[#FDDE12]"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">CI</label>
                      <input
                        type="text"
                        value={ci}
                        onChange={(e) => setCi(e.target.value)}
                        className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-[#FDDE12]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Dirección</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="w-4 h-4 rounded border-[#334155] text-[#FDDE12] focus:ring-0 bg-[#0F172A]"
                      />
                      <span>Registro Activo</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingCustomer ? 'Guardar Cambios' : 'Crear Registro'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
