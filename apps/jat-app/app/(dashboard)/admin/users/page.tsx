'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Topbar from '@/components/layout/Topbar';
import { getProfiles, updateProfile, updateProfileRole, createUser, completeDriverProfile, formatProfileError, ProfileWithDriver } from '@/lib/services/users';
import { getNextAvailableMovilNumber } from '@/lib/services/drivers';
import { uploadAvatar, deleteAvatar, validateAvatarFile } from '@/lib/services/storage';
import { createClient } from '@/lib/supabase/client';
import { UserRole } from '@/types/database.types';
import { 
  Users, 
  Search, 
  Filter, 
  ShieldAlert, 
  ShieldCheck, 
  Edit3, 
  UserPlus, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  X,
  Phone,
  Calendar,
  Lock,
  Mail,
  Bike,
  MapPin,
  FileText,
  Camera,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';

export default function UsersAdminPage() {
  const [profiles, setProfiles] = useState<ProfileWithDriver[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active User Role & ID
  const [activeUserRole, setActiveUserRole] = useState<UserRole | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  // Filter state
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal edit state
  const [editingProfile, setEditingProfile] = useState<ProfileWithDriver | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editRole, setEditRole] = useState<UserRole>('CLIENT_USER');
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);

  // Modal create user state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createName, setCreateName] = useState<string>('');
  const [createEmail, setCreateEmail] = useState<string>('');
  const [createPhone, setCreatePhone] = useState<string>('');
  const [createPassword, setCreatePassword] = useState<string>('');
  const [createRole, setCreateRole] = useState<UserRole>('CLIENT_USER');
  const [createAvatarFile, setCreateAvatarFile] = useState<File | null>(null);
  const [createAvatarPreview, setCreateAvatarPreview] = useState<string | null>(null);
  const [avatarErrorMsg, setAvatarErrorMsg] = useState<string | null>(null);

  // Additional Driver fields for create user
  const [createMovilNumber, setCreateMovilNumber] = useState<string>('');
  const [createVehicleType, setCreateVehicleType] = useState<string>('');
  const [createVehiclePlate, setCreateVehiclePlate] = useState<string>('');
  const [createZone, setCreateZone] = useState<string>('');

  const [creating, setCreating] = useState<boolean>(false);

  useEffect(() => {
    if (isCreateModalOpen && createRole === 'DRIVER') {
      getNextAvailableMovilNumber().then((movil) => {
        setCreateMovilNumber(String(movil));
      }).catch((err) => console.warn('Error fetching next movil:', err));
    }
  }, [isCreateModalOpen, createRole]);

  // Modal complete existing driver profile state
  const [isCompleteDriverModalOpen, setIsCompleteDriverModalOpen] = useState<boolean>(false);
  const [completingProfile, setCompletingProfile] = useState<ProfileWithDriver | null>(null);
  const [completeMovilNumber, setCompleteMovilNumber] = useState<string>('');
  const [completeVehicleType, setCompleteVehicleType] = useState<string>('');
  const [completeVehiclePlate, setCompleteVehiclePlate] = useState<string>('');
  const [completeZone, setCompleteZone] = useState<string>('');
  const [completing, setCompleting] = useState<boolean>(false);

  // Security Helper: Determine if active user can edit target profile
  const canEditProfile = (targetProf: ProfileWithDriver): boolean => {
    if (targetProf.role === 'SUPERADMIN') {
      return activeUserId === targetProf.id;
    }
    if (targetProf.role === 'ADMIN') {
      return activeUserRole === 'SUPERADMIN' || activeUserId === targetProf.id;
    }
    if (targetProf.role === 'SUPERVISOR') {
      return ['SUPERADMIN', 'ADMIN'].includes(activeUserRole || '') || activeUserId === targetProf.id;
    }
    return ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(activeUserRole || '') || activeUserId === targetProf.id;
  };

  // Security Helper: Determine if active user can change target profile's role
  const canChangeRole = (targetProf: ProfileWithDriver): boolean => {
    if (!activeUserRole) return false;
    if (targetProf.id === activeUserId) return false;
    if (targetProf.role === 'SUPERADMIN') return false;
    if (targetProf.role === 'ADMIN' && activeUserRole !== 'SUPERADMIN') return false;
    if (activeUserRole === 'SUPERVISOR') return true;
    return ['SUPERADMIN', 'ADMIN'].includes(activeUserRole);
  };

  // Load active user profile role
  useEffect(() => {
    async function loadActiveRole() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setActiveUserId(user.id);
          const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single();
          if (prof?.role) {
            setActiveUserRole(prof.role as UserRole);
          }
        }
      } catch (e) {
        console.error('Error loading active user role:', e);
      }
    }
    loadActiveRole();
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getProfiles({ role: roleFilter, search: searchQuery });
      setProfiles(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar el listado de usuarios');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  const openCreateModal = () => {
    setCreateName('');
    setCreateEmail('');
    setCreatePhone('');
    setCreatePassword('');
    setCreateMovilNumber('');
    setCreateVehicleType('');
    setCreateVehiclePlate('');
    setCreateZone('');
    setCreateAvatarFile(null);
    if (createAvatarPreview) {
      URL.revokeObjectURL(createAvatarPreview);
    }
    setCreateAvatarPreview(null);
    setAvatarErrorMsg(null);

    // Default role based on active user privileges
    if (activeUserRole === 'SUPERVISOR') {
      setCreateRole('OPERATOR');
    } else {
      setCreateRole('CLIENT_USER');
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (createAvatarPreview) {
      URL.revokeObjectURL(createAvatarPreview);
    }
    setCreateAvatarFile(null);
    setCreateAvatarPreview(null);
    setAvatarErrorMsg(null);
    setIsCreateModalOpen(false);
  };

  const handleCreateAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateAvatarFile(file);
    if (!validation.valid) {
      setAvatarErrorMsg(validation.error || 'Archivo de imagen no válido.');
      return;
    }

    setAvatarErrorMsg(null);
    setCreateAvatarFile(file);
    if (createAvatarPreview) {
      URL.revokeObjectURL(createAvatarPreview);
    }
    setCreateAvatarPreview(URL.createObjectURL(file));
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const driverPayload = createRole === 'DRIVER' ? {
        movil_number: Number(createMovilNumber),
        vehicle_type: createVehicleType,
        vehicle_plate: createVehiclePlate,
        zone: createZone,
      } : {};

      const createdUser = await createUser({
        full_name: createName,
        email: createEmail,
        phone: createPhone || undefined,
        password: createPassword,
        role: createRole,
        ...driverPayload,
      });

      let photoNotice = '';
      if (createAvatarFile && createdUser?.id) {
        try {
          await uploadAvatar(createdUser.id, createAvatarFile);
        } catch (photoErr: any) {
          console.error('Error al subir la foto durante la creación de usuario:', photoErr);
          photoNotice = ' (Nota: No se pudo subir la foto de perfil, pero el usuario fue creado exitosamente).';
        }
      }

      setSuccessMsg(createRole === 'DRIVER' 
        ? `Motoquero Móvil #${createMovilNumber} (${createName}) creado y configurado exitosamente.${photoNotice}`
        : `Usuario ${createName} (${createEmail}) creado e inicializado exitosamente.${photoNotice}`
      );
      closeCreateModal();
      fetchUsers();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al crear el nuevo usuario.');
    } finally {
      setCreating(false);
    }
  };

  const handleEditPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingProfile) return;

    const validation = validateAvatarFile(file);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Archivo de foto no válido.');
      return;
    }

    setUploadingPhoto(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const newAvatarUrl = await uploadAvatar(editingProfile.id, file);
      setEditingProfile(prev => prev ? { ...prev, avatar_url: newAvatarUrl } : null);
      setSuccessMsg('Foto de perfil actualizada exitosamente.');
      fetchUsers();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al subir la foto de perfil.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleEditPhotoDelete = async () => {
    if (!editingProfile) return;

    setUploadingPhoto(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await deleteAvatar(editingProfile.id);
      setEditingProfile(prev => prev ? { ...prev, avatar_url: null } : null);
      setSuccessMsg('Foto de perfil eliminada exitosamente.');
      fetchUsers();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al eliminar la foto de perfil.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Complete Existing Driver Profile Handler
  const openCompleteDriverModal = (profile: ProfileWithDriver) => {
    setCompletingProfile(profile);
    setCompleteMovilNumber('');
    setCompleteVehicleType('');
    setCompleteVehiclePlate('');
    setCompleteZone('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsCompleteDriverModalOpen(true);
  };

  const closeCompleteDriverModal = () => {
    setIsCompleteDriverModalOpen(false);
    setCompletingProfile(null);
  };

  const handleCompleteDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingProfile) return;

    setCompleting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await completeDriverProfile({
        profile_id: completingProfile.id,
        movil_number: Number(completeMovilNumber),
        vehicle_type: completeVehicleType,
        vehicle_plate: completeVehiclePlate,
        zone: completeZone,
      });

      setSuccessMsg(`Ficha de motoquero Móvil #${completeMovilNumber} vinculada exitosamente a ${completingProfile.full_name}.`);
      closeCompleteDriverModal();
      fetchUsers();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al completar la ficha de motoquero.');
    } finally {
      setCompleting(false);
    }
  };

  const openEditModal = (profile: ProfileWithDriver) => {
    setEditingProfile(profile);
    setEditName(profile.full_name);
    setEditPhone(profile.phone || '');
    setEditRole(profile.role);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const closeEditModal = () => {
    setEditingProfile(null);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // 1. Update basic info if changed
      if (editName !== editingProfile.full_name || editPhone !== (editingProfile.phone || '')) {
        await updateProfile(editingProfile.id, {
          full_name: editName,
          phone: editPhone || null,
        });
      }

      // 2. Update role if changed
      if (editRole !== editingProfile.role) {
        await updateProfileRole(editingProfile.id, editRole);
      }

      setSuccessMsg(`Perfil de ${editName} actualizado exitosamente.`);
      closeEditModal();
      fetchUsers();
    } catch (err: any) {
      console.error('Error guardando los cambios del perfil:', err);
      const friendlyMsg = formatProfileError(err, {
        targetRole: editingProfile?.role,
        newRole: editRole,
      });
      setErrorMsg(friendlyMsg);
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'SUPERADMIN':
        return <span className="bg-rose-950/80 text-rose-300 border border-rose-800 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-heading uppercase">Soporte</span>;
      case 'ADMIN':
        return <span className="bg-amber-950/80 text-amber-300 border border-amber-800 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-heading uppercase">Administrador</span>;
      case 'SUPERVISOR':
        return <span className="bg-indigo-950/80 text-indigo-300 border border-indigo-800 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-heading uppercase">Supervisor</span>;
      case 'OPERATOR':
        return <span className="bg-sky-950/80 text-sky-300 border border-sky-800 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-heading uppercase">Operador</span>;
      case 'DRIVER':
        return <span className="bg-[#FDDE12]/10 text-[#FDDE12] border border-[#FDDE12]/30 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-heading uppercase">Motoquero</span>;
      default:
        return <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-heading uppercase">Empresa / Cliente</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <Topbar
        title="Administración de Usuarios y Perfiles"
        subtitle="Gestión autoritativa de roles, perfiles y fichas de flota MotoJAT"
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
                placeholder="Buscar por nombre o teléfono..."
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

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-[#0F172A] border border-[#334155] px-3 py-1.5 rounded-xl">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-400 font-medium">Rol:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-[#1E293B] text-slate-200">Todos los Roles</option>
                <option value="SUPERADMIN" className="bg-[#1E293B] text-slate-200">Soporte</option>
                <option value="ADMIN" className="bg-[#1E293B] text-slate-200">Administrador</option>
                <option value="SUPERVISOR" className="bg-[#1E293B] text-slate-200">Supervisor</option>
                <option value="OPERATOR" className="bg-[#1E293B] text-slate-200">Operador</option>
                <option value="DRIVER" className="bg-[#1E293B] text-slate-200">Motoquero</option>
                <option value="CLIENT_USER" className="bg-[#1E293B] text-slate-200">Empresa / Cliente</option>
              </select>
            </div>

            {/* + Nuevo Usuario Button (Visible for SUPERADMIN, ADMIN, SUPERVISOR) */}
            {activeUserRole && ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(activeUserRole) && (
              <button
                onClick={openCreateModal}
                className="bg-[#FDDE12] hover:bg-[#E5C800] text-[#0F172A] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md font-heading uppercase"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Nuevo Usuario</span>
              </button>
            )}
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl shadow-lg overflow-hidden">
          <div className="p-5 border-b border-[#334155] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold font-heading text-white">Directorio de Usuarios Registrados</h2>
                <p className="text-xs text-slate-400">Mostrando perfiles autenticados sincronizados con Supabase Auth</p>
              </div>
            </div>
            <span className="text-xs text-slate-400 font-medium">Total: <strong className="text-slate-200">{profiles.length}</strong> usuarios</span>
          </div>

          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
              <span className="text-xs font-medium">Cargando directorio de usuarios...</span>
            </div>
          ) : profiles.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Users className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">No se encontraron usuarios</p>
              <p className="text-xs text-slate-500">Intente modificar el filtro de búsqueda o el rol seleccionado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 min-w-[800px]">
                <thead className="bg-[#0F172A] text-slate-400 font-semibold uppercase tracking-wider border-b border-[#334155]">
                  <tr>
                    <th className="px-6 py-3.5">Usuario / Nombre</th>
                    <th className="px-6 py-3.5">Rol Autoritativo</th>
                    <th className="px-6 py-3.5">Estado Ficha Flota</th>
                    <th className="px-6 py-3.5">Teléfono Contacto</th>
                    <th className="px-6 py-3.5">Fecha Registro</th>
                    <th className="px-6 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#334155]">
                  {profiles.map((prof) => (
                    <tr key={prof.id} className="hover:bg-[#334155]/40 transition-colors">
                      <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                        {prof.avatar_url ? (
                          <img
                            src={prof.avatar_url}
                            alt={prof.full_name}
                            className="w-8 h-8 rounded-full border border-[#FDDE12]/40 object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#0F172A] border border-[#334155] flex items-center justify-center font-bold text-[#FDDE12] uppercase font-heading text-xs flex-shrink-0">
                            {prof.full_name.charAt(0) || 'U'}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-100">{prof.full_name}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{prof.email || 'Sin correo registrado'}</div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        {getRoleBadge(prof.role)}
                      </td>

                      {/* Driver Status Column */}
                      <td className="px-6 py-4">
                        {prof.role === 'DRIVER' ? (
                          prof.driver ? (
                            <div className="flex flex-col items-start gap-1">
                              <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                ✓ Ficha Configurada (Móvil #{prof.driver.movil_number})
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {prof.driver.vehicle_type} • Placa: {prof.driver.vehicle_plate}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-start gap-1.5">
                              <span className="bg-amber-950/80 text-amber-300 border border-amber-800 px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 text-amber-400" />
                                ⚠ Ficha Pendiente
                              </span>
                              {activeUserRole && ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(activeUserRole) && (
                                <button
                                  onClick={() => openCompleteDriverModal(prof)}
                                  className="px-2.5 py-1 bg-[#FDDE12] hover:bg-[#E5C800] text-[#0F172A] rounded font-bold text-[10px] flex items-center gap-1 transition-all shadow"
                                >
                                  <Bike className="w-3 h-3" />
                                  <span>+ Completar Ficha Motoquero</span>
                                </button>
                              )}
                            </div>
                          )
                        ) : (
                          <span className="text-slate-500 text-[11px]">— N/A —</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Phone className="w-3.5 h-3.5 text-slate-500" />
                          <span>{prof.phone || 'Sin registro'}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>{new Date(prof.created_at).toLocaleDateString('es-ES')}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        {canEditProfile(prof) ? (
                          <button
                            onClick={() => openEditModal(prof)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#334155] hover:bg-[#475569] text-white rounded-lg transition-colors font-medium text-xs font-heading"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#FDDE12]" />
                            <span>Editar Rol / Datos</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800/80 border border-slate-700 text-slate-400 rounded-lg text-[11px] font-medium cursor-not-allowed" title="Protegido por políticas de seguridad de roles">
                            <Lock className="w-3 h-3 text-slate-500" />
                            <span>Protegido</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* CREATE NEW USER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 relative animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#334155] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold font-heading text-white">Registrar Nuevo Usuario</h3>
              </div>
              <button onClick={closeCreateModal} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Foto de Perfil (Opcional)
                </label>
                <div className="flex items-center gap-4 p-3 bg-[#0F172A] border border-[#334155] rounded-xl">
                  {createAvatarPreview ? (
                    <img
                      src={createAvatarPreview}
                      alt="Preview"
                      className="w-12 h-12 rounded-full border border-[#FDDE12]/50 object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#1E293B] border border-[#334155] flex items-center justify-center text-slate-500 flex-shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>
                  )}
                  <div className="flex-1 space-y-1">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-[#334155] hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors">
                      <ImageIcon className="w-3.5 h-3.5 text-[#FDDE12]" />
                      <span>{createAvatarFile ? 'Cambiar Selección' : 'Seleccionar Imagen'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleCreateAvatarChange}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[10px] text-slate-400">JPG, PNG o WEBP (máx. 2 MB)</p>
                    {avatarErrorMsg && (
                      <p className="text-[11px] text-rose-400 font-medium">{avatarErrorMsg}</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Correo Electrónico (Login) *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="usuario@empresa.com"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl pl-10 pr-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Teléfono de Contacto
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="+591 70000000"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl pl-10 pr-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Contraseña Inicial *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl pl-10 pr-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Mínimo 6 caracteres.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Rol Autoritativo en Sistema *
                </label>
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value as UserRole)}
                  className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12] cursor-pointer font-medium"
                >
                  <option value="CLIENT_USER">Empresa / Cliente (CLIENT_USER)</option>
                  <option value="DRIVER">Motoquero (DRIVER)</option>
                  <option value="OPERATOR">Operador (OPERATOR)</option>

                  {['SUPERADMIN', 'ADMIN'].includes(activeUserRole || '') && (
                    <option value="SUPERVISOR">Supervisor (SUPERVISOR)</option>
                  )}
                  {['SUPERADMIN', 'ADMIN'].includes(activeUserRole || '') && (
                    <option value="ADMIN">Administrador (ADMIN)</option>
                  )}
                </select>
              </div>

              {/* DYNAMIC SECTION: FICHA DE MOTOQUERO (Only when createRole === 'DRIVER') */}
              {createRole === 'DRIVER' && (
                <div className="p-4 bg-[#0F172A] border border-[#FDDE12]/30 rounded-xl space-y-3.5 animate-fadeIn">
                  <div className="flex items-center gap-2 text-[#FDDE12] font-bold text-xs">
                    <Bike className="w-4 h-4" />
                    <span>Ficha del Motoquero (Registro en Flota)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Número de Móvil (Asignación Automática) *
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          readOnly
                          value={createMovilNumber ? `Móvil #${createMovilNumber}` : 'Calculando menor número disponible...'}
                          className="w-full bg-[#0F172A] border border-[#334155] text-[#FDDE12] font-bold text-xs rounded-lg px-3 py-2 cursor-not-allowed"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60 font-semibold">
                          Automático
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">El menor número entero libre será reservado atómicamente por el sistema.</p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Placa del Vehículo *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. 4592-XYZ"
                        value={createVehiclePlate}
                        onChange={(e) => setCreateVehiclePlate(e.target.value)}
                        className="w-full bg-[#1E293B] border border-[#334155] text-slate-100 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#FDDE12]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Tipo / Modelo Vehículo *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Motocicleta 150cc"
                        value={createVehicleType}
                        onChange={(e) => setCreateVehicleType(e.target.value)}
                        className="w-full bg-[#1E293B] border border-[#334155] text-slate-100 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#FDDE12]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Zona de Operación *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Zona Central / Equipetrol"
                        value={createZone}
                        onChange={(e) => setCreateZone(e.target.value)}
                        className="w-full bg-[#1E293B] border border-[#334155] text-slate-100 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#FDDE12]"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Nota: La calificación iniciará en 5.00 y el estado operativo estará disponible (available).
                  </p>
                </div>
              )}

              <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="px-4 py-2 bg-[#334155] hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium font-heading"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-[#FDDE12] hover:bg-[#E5C800] text-[#0F172A] font-bold rounded-xl text-xs transition-all font-heading uppercase flex items-center gap-2 disabled:opacity-50 shadow-md"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creando...</span>
                    </>
                  ) : (
                    <span>Registrar Usuario</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLETE EXISTING DRIVER PROFILE MODAL */}
      {isCompleteDriverModalOpen && completingProfile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 relative animate-scaleUp">
            <div className="flex items-center justify-between border-b border-[#334155] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
                  <Bike className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-heading text-white">Completar Ficha Motoquero</h3>
                  <p className="text-xs text-slate-400">Usuario: <strong className="text-white">{completingProfile.full_name}</strong></p>
                </div>
              </div>
              <button onClick={closeCompleteDriverModal} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCompleteDriverSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Número de Móvil *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Ej. 101"
                    value={completeMovilNumber}
                    onChange={(e) => setCompleteMovilNumber(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Placa del Vehículo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. 4592-XYZ"
                    value={completeVehiclePlate}
                    onChange={(e) => setCompleteVehiclePlate(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Tipo / Modelo de Vehículo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Motocicleta Honda 150cc"
                    value={completeVehicleType}
                    onChange={(e) => setCompleteVehicleType(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Zona Habitual de Operación *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Zona Central / Equipetrol"
                    value={completeZone}
                    onChange={(e) => setCompleteZone(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCompleteDriverModal}
                  className="px-4 py-2 bg-[#334155] hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium font-heading"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={completing}
                  className="px-4 py-2 bg-[#FDDE12] hover:bg-[#E5C800] text-[#0F172A] font-bold rounded-xl text-xs transition-all font-heading uppercase flex items-center gap-2 disabled:opacity-50 shadow-md"
                >
                  {completing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Ficha</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile & Role Modal */}
      {editingProfile && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between border-b border-[#334155] pb-4">
              <div className="flex items-center gap-3">
                <Edit3 className="w-5 h-5 text-[#FDDE12]" />
                <h3 className="text-base font-bold font-heading text-white">Editar Perfil de Usuario</h3>
              </div>
              <button onClick={closeEditModal} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Photo Management Section */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Fotografía de Perfil
                </label>
                <div className="flex items-center gap-4 p-3 bg-[#0F172A] border border-[#334155] rounded-xl">
                  {editingProfile.avatar_url ? (
                    <img
                      src={editingProfile.avatar_url}
                      alt={editingProfile.full_name}
                      className="w-14 h-14 rounded-full border-2 border-[#FDDE12]/50 object-cover flex-shrink-0 shadow-md"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-[#1E293B] border border-[#334155] flex items-center justify-center font-bold text-[#FDDE12] uppercase font-heading text-lg flex-shrink-0">
                      {editingProfile.full_name.charAt(0) || 'U'}
                    </div>
                  )}

                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#334155] hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors">
                        {uploadingPhoto ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FDDE12]" />
                        ) : (
                          <Camera className="w-3.5 h-3.5 text-[#FDDE12]" />
                        )}
                        <span>{editingProfile.avatar_url ? 'Cambiar Foto' : 'Subir Foto'}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={uploadingPhoto}
                          onChange={handleEditPhotoUpload}
                          className="hidden"
                        />
                      </label>

                      {editingProfile.avatar_url && (
                        <button
                          type="button"
                          disabled={uploadingPhoto}
                          onClick={handleEditPhotoDelete}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg text-xs font-medium transition-colors"
                          title="Eliminar Foto de Perfil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Eliminar</span>
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">JPG, PNG o WEBP normalizado a .webp (máx. 2 MB)</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Teléfono de Contacto
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+591 70000000"
                  className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Rol Autoritativo en Sistema
                </label>
                <select
                  value={editRole}
                  disabled={!canChangeRole(editingProfile)}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed font-medium"
                >
                  <option value="CLIENT_USER">Empresa / Cliente (CLIENT_USER)</option>
                  <option value="DRIVER">Motoquero (DRIVER)</option>
                  <option value="OPERATOR">Operador (OPERATOR)</option>

                  {['SUPERADMIN', 'ADMIN'].includes(activeUserRole || '') && (
                    <option value="SUPERVISOR">Supervisor (SUPERVISOR)</option>
                  )}
                  {['SUPERADMIN', 'ADMIN'].includes(activeUserRole || '') && (
                    <option value="ADMIN">Administrador (ADMIN)</option>
                  )}
                  {editingProfile?.role === 'SUPERADMIN' && (
                    <option value="SUPERADMIN" disabled>Soporte (Lectura únicamente)</option>
                  )}
                </select>
                {!canChangeRole(editingProfile) ? (
                  <p className="text-[11px] text-amber-400 font-medium mt-1.5 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span>
                      {editingProfile.id === activeUserId
                        ? 'No puedes modificar tu propio rol por seguridad.'
                        : editingProfile.role === 'SUPERADMIN'
                        ? 'El rol Soporte (SUPERADMIN) es inmutable y protegido por RLS.'
                        : editingProfile.role === 'ADMIN' && activeUserRole !== 'SUPERADMIN'
                        ? 'Solo un usuario Soporte (SUPERADMIN) puede modificar el rol de un Administrador.'
                        : 'No tienes permisos suficientes para cambiar el rol de este usuario.'}
                    </span>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nota: El cambio de rol está sujeto a las políticas RBAC y RLS aplicables en la base de datos.
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 bg-[#334155] hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium font-heading"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#FDDE12] hover:bg-[#E5C800] text-[#0F172A] font-bold rounded-xl text-xs transition-all font-heading uppercase flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Cambios</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

