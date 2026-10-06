'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { 
  getCompanies, 
  createCompany, 
  updateCompany, 
  setCompanyPrimaryContact,
  getCompanyUsers, 
  linkCompanyUser, 
  unlinkCompanyUser 
} from '@/lib/services/companies';
import { 
  getCompanyContacts, 
  createCustomer, 
  updateCustomer, 
  CustomerWithCompany 
} from '@/lib/services/customers';
import { getProfiles } from '@/lib/services/users';
import { Company, CompanyUser, Profile } from '@/types/database.types';
import { EditCompanyModal } from '@/app/(dashboard)/clients/companies/[companyId]/components/EditCompanyModal';
import { 
  Building2, 
  Search, 
  Plus, 
  Edit3, 
  Users, 
  UserPlus, 
  Trash2, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  X,
  FileText,
  MapPin,
  Wallet,
  Star,
  UserCheck,
  UserX,
  Phone,
  Briefcase
} from 'lucide-react';

export default function CompaniesAdminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Company Create / Edit Modal
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [isCreateModal, setIsCreateModal] = useState<boolean>(false);
  
  const [formBusinessName, setFormBusinessName] = useState<string>('');
  const [formNit, setFormNit] = useState<string>('');
  const [formAddress, setFormAddress] = useState<string>('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive' | 'suspended'>('active');
  const [savingCompany, setSavingCompany] = useState<boolean>(false);

  // Company Contacts Modal
  const [selectedCompanyContacts, setSelectedCompanyContacts] = useState<Company | null>(null);
  const [companyContactsList, setCompanyContactsList] = useState<CustomerWithCompany[]>([]);
  const [loadingContacts, setLoadingContacts] = useState<boolean>(false);
  const [showAddContactForm, setShowAddContactForm] = useState<boolean>(false);
  const [editingContact, setEditingContact] = useState<CustomerWithCompany | null>(null);
  const [savingContact, setSavingContact] = useState<boolean>(false);

  // Contact Form Fields
  const [cFullName, setCFullName] = useState<string>('');
  const [cPhone, setCPhone] = useState<string>('');
  const [cCi, setCCi] = useState<string>('');
  const [cEmail, setCEmail] = useState<string>('');
  const [cArea, setCArea] = useState<string>('');
  const [cPosition, setCPosition] = useState<string>('');
  const [cAddress, setCAddress] = useState<string>('');
  const [cIsActive, setCIsActive] = useState<boolean>(true);
  const [cIsPrimary, setCIsPrimary] = useState<boolean>(false);

  // Corporate Users Modal
  const [selectedCompanyUsers, setSelectedCompanyUsers] = useState<Company | null>(null);
  const [companyUsersList, setCompanyUsersList] = useState<(CompanyUser & { profile: Profile })[]>([]);
  const [allClientProfiles, setAllClientProfiles] = useState<Profile[]>([]);
  const [selectedProfileToLink, setSelectedProfileToLink] = useState<string>('');
  
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [linkingUser, setLinkingUser] = useState<boolean>(false);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getCompanies(searchQuery);
      setCompanies(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al obtener las empresas corporativas');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCompanies();
  };

  const openCreateModal = () => {
    setIsCreateModal(true);
    setEditingCompany(null);
    setFormBusinessName('');
    setFormNit('');
    setFormAddress('');
    setFormStatus('active');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const openEditModal = (comp: Company) => {
    setIsCreateModal(false);
    setEditingCompany(comp);
    setFormBusinessName(comp.business_name);
    setFormNit(comp.nit || '');
    setFormAddress(comp.address || '');
    setFormStatus(comp.status);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const closeCompanyModal = () => {
    setIsCreateModal(false);
    setEditingCompany(null);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formBusinessName.trim()) {
      setErrorMsg('La Razón Social es requerida');
      return;
    }

    setSavingCompany(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (isCreateModal) {
        await createCompany({
          business_name: formBusinessName.trim(),
          nit: formNit.trim() || null,
          address: formAddress.trim() || null,
        });
        setSuccessMsg(`Empresa "${formBusinessName}" creada exitosamente.`);
      } else if (editingCompany) {
        await updateCompany(editingCompany.id, {
          business_name: formBusinessName.trim(),
          nit: formNit.trim() || null,
          address: formAddress.trim() || null,
          status: formStatus,
        });
        setSuccessMsg(`Empresa "${formBusinessName}" actualizada exitosamente.`);
      }
      closeCompanyModal();
      fetchCompanies();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al guardar la empresa corporativa');
    } finally {
      setSavingCompany(false);
    }
  };

  // Company Contacts Management Handlers
  const loadCompanyContacts = async (companyId: string) => {
    setLoadingContacts(true);
    try {
      const { data, error } = await getCompanyContacts(companyId);
      if (error) throw error;
      setCompanyContactsList(data || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar contactos de la empresa');
    } finally {
      setLoadingContacts(false);
    }
  };

  const openContactsModal = async (comp: Company) => {
    setSelectedCompanyContacts(comp);
    setShowAddContactForm(false);
    setEditingContact(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    await loadCompanyContacts(comp.id);
  };

  const closeContactsModal = () => {
    setSelectedCompanyContacts(null);
    setShowAddContactForm(false);
    setEditingContact(null);
  };

  const handleOpenAddContact = () => {
    setEditingContact(null);
    setCFullName('');
    setCPhone('');
    setCCi('');
    setCEmail('');
    setCArea('');
    setCPosition('');
    setCAddress('');
    setCIsActive(true);
    setCIsPrimary(companyContactsList.length === 0);
    setShowAddContactForm(true);
  };

  const handleOpenEditContact = (contact: CustomerWithCompany) => {
    setEditingContact(contact);
    setCFullName(contact.full_name);
    setCPhone(contact.phone);
    setCCi(contact.ci || '');
    setCEmail(contact.email || '');
    setCArea(contact.area || '');
    setCPosition(contact.position || '');
    setCAddress(contact.address || '');
    setCIsActive(contact.is_active !== undefined ? contact.is_active : true);
    setCIsPrimary(Boolean(contact.is_primary_contact));
    setShowAddContactForm(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyContacts) return;
    if (!cFullName.trim() || !cPhone.trim()) {
      setErrorMsg('Nombre completo y teléfono son obligatorios para el contacto.');
      return;
    }

    setSavingContact(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (editingContact) {
        const { error } = await updateCustomer(editingContact.id, {
          full_name: cFullName,
          phone: cPhone,
          ci: cCi.trim() || null,
          email: cEmail.trim() || null,
          area: cArea.trim() || null,
          position: cPosition.trim() || null,
          address: cAddress.trim() || null,
          company_id: selectedCompanyContacts.id,
          is_active: cIsActive,
          is_primary_contact: cIsPrimary,
        });
        if (error) throw error;
        setSuccessMsg(`Contacto "${cFullName}" actualizado exitosamente.`);
      } else {
        const { error } = await createCustomer({
          full_name: cFullName,
          phone: cPhone,
          ci: cCi.trim() || null,
          email: cEmail.trim() || null,
          area: cArea.trim() || null,
          position: cPosition.trim() || null,
          address: cAddress.trim() || null,
          company_id: selectedCompanyContacts.id,
          is_active: cIsActive,
          is_primary_contact: cIsPrimary,
        });
        if (error) throw error;
        setSuccessMsg(`Contacto "${cFullName}" registrado exitosamente.`);
      }

      setShowAddContactForm(false);
      setEditingContact(null);
      await loadCompanyContacts(selectedCompanyContacts.id);
      fetchCompanies();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar contacto');
    } finally {
      setSavingContact(false);
    }
  };

  const handleToggleContactActive = async (contact: CustomerWithCompany) => {
    if (!selectedCompanyContacts) return;
    const newActiveState = !contact.is_active;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await updateCustomer(contact.id, {
        is_active: newActiveState,
      });
      if (error) throw error;
      setSuccessMsg(`Contacto "${contact.full_name}" ${newActiveState ? 'activado' : 'desactivado'} correctamente.`);
      await loadCompanyContacts(selectedCompanyContacts.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al actualizar estado del contacto');
    }
  };

  const handleSetPrimaryContact = async (contact: CustomerWithCompany) => {
    if (!selectedCompanyContacts) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await setCompanyPrimaryContact(selectedCompanyContacts.id, contact.id);
      setSuccessMsg(`"${contact.full_name}" establecido como Contacto Principal de ${selectedCompanyContacts.business_name}.`);
      await loadCompanyContacts(selectedCompanyContacts.id);
      fetchCompanies();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al asignar contacto principal');
    }
  };

  // Corporate Users Management
  const openUsersModal = async (comp: Company) => {
    setSelectedCompanyUsers(comp);
    setLoadingUsers(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const [users, clientProfs] = await Promise.all([
        getCompanyUsers(comp.id),
        getProfiles({ role: 'CLIENT_USER' }),
      ]);
      setCompanyUsersList(users);
      setAllClientProfiles(clientProfs);
      if (clientProfs.length > 0) {
        setSelectedProfileToLink(clientProfs[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar usuarios de la empresa');
    } finally {
      setLoadingUsers(false);
    }
  };

  const closeUsersModal = () => {
    setSelectedCompanyUsers(null);
  };

  const handleLinkUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyUsers || !selectedProfileToLink) return;

    setLinkingUser(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await linkCompanyUser(selectedCompanyUsers.id, selectedProfileToLink);
      setSuccessMsg('Usuario vinculado exitosamente a la empresa.');
      const updatedList = await getCompanyUsers(selectedCompanyUsers.id);
      setCompanyUsersList(updatedList);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al vincular el usuario');
    } finally {
      setLinkingUser(false);
    }
  };

  const handleUnlinkUser = async (profileId: string) => {
    if (!selectedCompanyUsers) return;
    setLinkingUser(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await unlinkCompanyUser(selectedCompanyUsers.id, profileId);
      setSuccessMsg('Usuario desvinculado exitosamente.');
      const updatedList = await getCompanyUsers(selectedCompanyUsers.id);
      setCompanyUsersList(updatedList);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al desvincular el usuario');
    } finally {
      setLinkingUser(false);
    }
  };

  const getStatusBadge = (st: 'active' | 'inactive' | 'suspended') => {
    switch (st) {
      case 'active':
        return <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-800 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-heading uppercase">Activa</span>;
      case 'suspended':
        return <span className="bg-rose-950/80 text-rose-300 border border-rose-800 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-heading uppercase">Suspendida</span>;
      default:
        return <span className="bg-slate-800 text-slate-400 border border-slate-700 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-heading uppercase">Inactiva</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <Topbar
        title="Administración de Empresas Corporativas"
        subtitle="Gestión de clientes corporativos y usuarios vinculados en public.companies"
      />

      <main className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        {/* Banner Alert Messages */}
        {errorMsg && (
          <div className="p-4 bg-rose-950/80 border border-rose-800 text-rose-200 rounded-xl text-xs flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-emerald-950/80 border border-emerald-800 text-emerald-200 rounded-xl text-xs flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Filter and Control Bar */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar empresa por Razón Social o NIT..."
                className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-[#FDDE12] transition-colors"
              />
            </div>
            <button
              type="submit"
              className="bg-[#334155] hover:bg-slate-700 text-white font-medium px-4 py-2.5 rounded-xl text-xs transition-colors flex-shrink-0 font-heading"
            >
              Buscar
            </button>
          </form>

          <button
            onClick={openCreateModal}
            className="bg-[#FDDE12] hover:bg-[#E5C800] text-[#0F172A] font-bold px-4 py-2.5 rounded-xl text-xs font-heading uppercase flex items-center gap-2 shadow-lg transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Nueva Empresa</span>
          </button>
        </div>

        {/* Companies Table */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl shadow-lg overflow-hidden">
          <div className="p-5 border-b border-[#334155] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold font-heading text-white">Clientes Corporativos</h2>
                <p className="text-xs text-slate-400">Listado de empresas autorizadas con crédito y vales</p>
              </div>
            </div>
            <span className="text-xs text-slate-400 font-medium">Total: <strong className="text-slate-200">{companies.length}</strong> empresas</span>
          </div>

          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
              <span className="text-xs font-medium">Cargando directorio de empresas...</span>
            </div>
          ) : companies.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Building2 className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">No se encontraron empresas corporativas</p>
              <p className="text-xs text-slate-500">Haga clic en &quot;Registrar Nueva Empresa&quot; para agregar la primera entidad.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 min-w-[700px]">
                <thead className="bg-[#0F172A] text-slate-400 font-semibold uppercase tracking-wider border-b border-[#334155]">
                  <tr>
                    <th className="px-6 py-3.5">Empresa / Razón Social</th>
                    <th className="px-6 py-3.5">NIT</th>
                    <th className="px-6 py-3.5">Dirección Corporativa</th>
                    <th className="px-6 py-3.5">Estado</th>
                    <th className="px-6 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#334155]">
                  {companies.map((comp) => (
                    <tr key={comp.id} className="hover:bg-[#334155]/40 transition-colors">
                      <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#0F172A] border border-[#334155] flex items-center justify-center text-[#FDDE12] flex-shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-100">{comp.business_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">{comp.id}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-slate-300 font-mono">
                          <FileText className="w-3.5 h-3.5 text-slate-500" />
                          <span>{comp.nit || 'Sin NIT'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                          <span className="truncate max-w-xs">{comp.address || 'Sin dirección registrada'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(comp.status)}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => openContactsModal(comp)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg transition-colors font-medium text-xs font-heading"
                          title="Gestionar contactos y solicitantes de la empresa"
                        >
                          <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                          <span>Contactos</span>
                        </button>
                        <Link
                          href={`/admin/companies/${comp.id}/account`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg transition-colors font-medium text-xs font-heading"
                        >
                          <Wallet className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Cuenta Corriente</span>
                        </Link>
                        <button
                          onClick={() => openUsersModal(comp)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F172A] hover:bg-slate-900 text-slate-200 border border-[#334155] rounded-lg transition-colors font-medium text-xs font-heading"
                        >
                          <Users className="w-3.5 h-3.5 text-sky-400" />
                          <span>Usuarios Corp.</span>
                        </button>
                        <button
                          onClick={() => openEditModal(comp)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#334155] hover:bg-[#475569] text-white rounded-lg transition-colors font-medium text-xs font-heading"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#FDDE12]" />
                          <span>Editar</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Company Create Modal */}
      {isCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between border-b border-[#334155] pb-4">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-[#FDDE12]" />
                <h3 className="text-base font-bold font-heading text-white">
                  Registrar Empresa Corporativa
                </h3>
              </div>
              <button onClick={closeCompanyModal} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Razón Social / Nombre Comercial *
                </label>
                <input
                  type="text"
                  required
                  value={formBusinessName}
                  onChange={(e) => setFormBusinessName(e.target.value)}
                  placeholder="ej: Banco Mercantil Santa Cruz S.A."
                  className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Número de NIT
                </label>
                <input
                  type="text"
                  value={formNit}
                  onChange={(e) => setFormNit(e.target.value)}
                  placeholder="102030405"
                  className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Dirección Corporativa / Oficina Principal
                </label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Av. Cristo Redentor 3er Anillo #350"
                  className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCompanyModal}
                  className="px-4 py-2 bg-[#334155] hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium font-heading"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCompany}
                  className="px-4 py-2 bg-[#FDDE12] hover:bg-[#E5C800] text-[#0F172A] font-bold rounded-xl text-xs transition-all font-heading uppercase flex items-center gap-2 disabled:opacity-50"
                >
                  {savingCompany ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Registrar Empresa</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modern Full Edit Company Modal */}
      {editingCompany && (
        <EditCompanyModal
          company={editingCompany}
          isOpen={!!editingCompany}
          onClose={() => setEditingCompany(null)}
          onSuccess={() => {
            setEditingCompany(null);
            fetchCompanies();
          }}
        />
      )}

      {/* Corporate Users Link Modal */}
      {selectedCompanyUsers && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between border-b border-[#334155] pb-4">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold font-heading text-white">
                  Usuarios Corporativos: <span className="text-[#FDDE12]">{selectedCompanyUsers.business_name}</span>
                </h3>
              </div>
              <button onClick={closeUsersModal} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form to Link User */}
            <form onSubmit={handleLinkUser} className="bg-[#0F172A] p-4 rounded-xl border border-[#334155] space-y-3">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Vincular Nuevo Usuario Cliente (&quot;CLIENT_USER&quot;)
              </label>
              <div className="flex items-center gap-3">
                <select
                  value={selectedProfileToLink}
                  onChange={(e) => setSelectedProfileToLink(e.target.value)}
                  className="flex-1 bg-[#1E293B] border border-[#334155] text-slate-100 text-xs rounded-xl px-3 py-2.5 focus:outline-none cursor-pointer"
                >
                  {allClientProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.phone || 'Sin teléfono'})
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={linkingUser || !selectedProfileToLink}
                  className="px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl text-xs font-heading uppercase flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
                >
                  {linkingUser ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>Vincular</span>
                </button>
              </div>
            </form>

            {/* List of linked users */}
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              <h4 className="text-xs font-bold font-heading text-slate-300 uppercase tracking-wider">
                Usuarios Vinculados (&quot;company_users&quot;)
              </h4>

              {loadingUsers ? (
                <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#FDDE12]" />
                  <span>Cargando usuarios...</span>
                </div>
              ) : companyUsersList.length === 0 ? (
                <p className="text-xs text-slate-500 p-4 text-center bg-[#0F172A] rounded-xl border border-[#334155]">
                  No hay usuarios vinculados a esta empresa.
                </p>
              ) : (
                companyUsersList.map((cu) => (
                  <div
                    key={cu.id}
                    className="p-3 bg-[#0F172A] border border-[#334155] rounded-xl flex items-center justify-between text-xs text-slate-200"
                  >
                    <div>
                      <div className="font-semibold text-white">{cu.profile.full_name}</div>
                      <div className="text-[10px] text-slate-400">{cu.profile.phone || 'Sin teléfono'}</div>
                    </div>

                    <button
                      onClick={() => handleUnlinkUser(cu.profile.id)}
                      disabled={linkingUser}
                      className="p-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg transition-colors text-xs"
                      title="Desvincular usuario de empresa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#334155] flex justify-end">
              <button
                type="button"
                onClick={closeUsersModal}
                className="px-4 py-2 bg-[#334155] hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium font-heading"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Company Contacts Management Modal */}
      {selectedCompanyContacts && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-3xl p-6 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#334155] pb-4">
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-bold font-heading text-white">
                    Contactos / Solicitantes Autorizados: <span className="text-[#FDDE12]">{selectedCompanyContacts.business_name}</span>
                  </h3>
                  <p className="text-xs text-slate-400">Gestión de solicitantes y contacto principal de la empresa</p>
                </div>
              </div>
              <button onClick={closeContactsModal} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action Bar inside Modal */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 font-semibold">
                Total Solicitantes: <strong className="text-amber-400">{companyContactsList.length}</strong>
              </span>
              {!showAddContactForm && (
                <button
                  onClick={handleOpenAddContact}
                  className="px-3.5 py-2 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl text-xs font-heading flex items-center gap-1.5 transition-all shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar Contacto</span>
                </button>
              )}
            </div>

            {/* ADD / EDIT CONTACT SUB-FORM */}
            {showAddContactForm && (
              <form onSubmit={handleSaveContact} className="p-4 bg-[#0F172A] border border-amber-500/30 rounded-xl space-y-3 animate-fadeIn text-xs">
                <div className="flex items-center justify-between border-b border-[#334155] pb-2 text-amber-300 font-bold font-heading">
                  <span>{editingContact ? 'Editar Contacto' : 'Nuevo Contacto / Solicitante'}</span>
                  <button type="button" onClick={() => setShowAddContactForm(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      required
                      value={cFullName}
                      onChange={(e) => setCFullName(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      className="w-full bg-[#1E293B] border border-[#334155] text-white rounded-xl px-3 py-2 focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Teléfono *</label>
                    <input
                      type="text"
                      required
                      value={cPhone}
                      onChange={(e) => setCPhone(e.target.value)}
                      placeholder="Ej. 75500004"
                      className="w-full bg-[#1E293B] border border-[#334155] text-white rounded-xl px-3 py-2 focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">CI</label>
                    <input
                      type="text"
                      value={cCi}
                      onChange={(e) => setCCi(e.target.value)}
                      placeholder="Ej. 7891011 SC"
                      className="w-full bg-[#1E293B] border border-[#334155] text-white rounded-xl px-3 py-2 focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      value={cEmail}
                      onChange={(e) => setCEmail(e.target.value)}
                      placeholder="correo@empresa.com"
                      className="w-full bg-[#1E293B] border border-[#334155] text-white rounded-xl px-3 py-2 focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Área / Departamento</label>
                    <input
                      type="text"
                      value={cArea}
                      onChange={(e) => setCArea(e.target.value)}
                      placeholder="Ej. RRHH Central"
                      className="w-full bg-[#1E293B] border border-[#334155] text-white rounded-xl px-3 py-2 focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Cargo / Puesto</label>
                    <input
                      type="text"
                      value={cPosition}
                      onChange={(e) => setCPosition(e.target.value)}
                      placeholder="Ej. Encargado de RRHH"
                      className="w-full bg-[#1E293B] border border-[#334155] text-white rounded-xl px-3 py-2 focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-amber-300 font-semibold">
                    <input
                      type="checkbox"
                      checked={cIsPrimary}
                      onChange={(e) => setCIsPrimary(e.target.checked)}
                      className="w-4 h-4 rounded border-amber-500 text-[#FDDE12] focus:ring-0 bg-[#1E293B]"
                    />
                    <span>Marcar como Contacto Principal</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={cIsActive}
                      onChange={(e) => setCIsActive(e.target.checked)}
                      className="w-4 h-4 rounded border-[#334155] text-[#FDDE12] focus:ring-0 bg-[#1E293B]"
                    />
                    <span>Contacto Activo</span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[#334155]">
                  <button
                    type="button"
                    onClick={() => setShowAddContactForm(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingContact}
                    className="px-3 py-1.5 bg-[#FDDE12] text-[#0F172A] font-bold rounded-lg text-xs flex items-center gap-1"
                  >
                    {savingContact && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>{editingContact ? 'Guardar Cambios' : 'Registrar Contacto'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* LIST OF COMPANY CONTACTS */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {loadingContacts ? (
                <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-[#FDDE12]" />
                  <span>Cargando contactos...</span>
                </div>
              ) : companyContactsList.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-[#0F172A] rounded-xl border border-[#334155]">
                  <Users className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                  <p className="text-xs font-semibold text-slate-300">No hay contactos registrados para esta empresa</p>
                  <p className="text-[11px] text-slate-500 mt-1">Haga clic en &quot;Agregar Contacto&quot; para registrar el primer solicitante.</p>
                </div>
              ) : (
                companyContactsList.map((contact) => (
                  <div
                    key={contact.id}
                    className={`p-3.5 bg-[#0F172A] border rounded-xl flex items-center justify-between text-xs transition-colors ${
                      contact.is_primary_contact
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : 'border-[#334155]'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{contact.full_name}</span>
                        {contact.is_primary_contact && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded text-[10px] font-bold">
                            <Star className="w-3 h-3 fill-amber-400" />
                            Contacto Principal
                          </span>
                        )}
                        {!contact.is_active && (
                          <span className="px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded text-[10px]">
                            Inactivo
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
                        {contact.area || contact.position ? (
                          <span className="flex items-center gap-1 text-slate-300">
                            <Briefcase className="w-3 h-3 text-sky-400" />
                            {contact.area || 'Sin área'} {contact.position ? `· ${contact.position}` : ''}
                          </span>
                        ) : null}

                        <span className="flex items-center gap-1 font-mono text-slate-300">
                          <Phone className="w-3 h-3 text-emerald-400" />
                          {contact.phone}
                        </span>

                        {contact.ci && <span>CI: {contact.ci}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!contact.is_primary_contact && (
                        <button
                          onClick={() => handleSetPrimaryContact(contact)}
                          title="Establecer como Contacto Principal"
                          className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-medium flex items-center gap-1"
                        >
                          <Star className="w-3 h-3" />
                          <span>Hacer Principal</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenEditContact(contact)}
                        title="Editar datos del contacto"
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleToggleContactActive(contact)}
                        title={contact.is_active ? 'Desactivar contacto' : 'Activar contacto'}
                        className={`p-1.5 border rounded-lg text-xs transition-colors ${
                          contact.is_active
                            ? 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border-rose-800'
                            : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border-emerald-800'
                        }`}
                      >
                        {contact.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#334155] flex justify-end">
              <button
                type="button"
                onClick={closeContactsModal}
                className="px-4 py-2 bg-[#334155] hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium font-heading"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
