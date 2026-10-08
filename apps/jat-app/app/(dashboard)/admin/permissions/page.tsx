'use client';

import React, { useState, useEffect } from 'react';
import Topbar from '@/components/layout/Topbar';
import { getProfiles } from '@/lib/services/users';
import { getUserPermissions, grantPermission, revokePermission } from '@/lib/services/permissions';
import { Profile, UserPermission } from '@/types/database.types';
import { 
  Key, 
  Users, 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  X,
  Search,
  Lock
} from 'lucide-react';

export default function PermissionsAdminPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [loadingPerms, setLoadingPerms] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  
  const [newPermissionKey, setNewPermissionKey] = useState<string>('financial_balances.view');
  const [customKeyInput, setCustomKeyInput] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await getProfiles();
      setProfiles(data);
      if (data.length > 0) {
        setSelectedProfileId(data[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar los usuarios');
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchPermissions = async (profileId: string) => {
    if (!profileId) return;
    setLoadingPerms(true);
    setErrorMsg(null);
    try {
      const perms = await getUserPermissions(profileId);
      setUserPermissions(perms);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al obtener los permisos del usuario');
    } finally {
      setLoadingPerms(false);
    }
  };

  useEffect(() => {
    if (selectedProfileId) {
      fetchPermissions(selectedProfileId);
    }
  }, [selectedProfileId]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfileId) return;

    const keyToGrant = newPermissionKey === 'CUSTOM' ? customKeyInput.trim() : newPermissionKey;
    if (!keyToGrant) {
      setErrorMsg('Por favor especifique la clave de permiso a otorgar.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await grantPermission(selectedProfileId, keyToGrant);
      setSuccessMsg(`Permiso '${keyToGrant}' otorgado exitosamente.`);
      setCustomKeyInput('');
      fetchPermissions(selectedProfileId);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al otorgar el permiso');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (permissionKey: string) => {
    if (!selectedProfileId) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await revokePermission(selectedProfileId, permissionKey);
      setSuccessMsg(`Permiso '${permissionKey}' revocado exitosamente.`);
      fetchPermissions(selectedProfileId);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al revocar el permiso');
    } finally {
      setSaving(false);
    }
  };

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <Topbar
        title="Gestión de Permisos Granulares"
        subtitle="Administración explícita de privilegios en public.user_permissions"
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User Selector Panel */}
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-3 border-b border-[#334155] pb-3">
              <Users className="w-5 h-5 text-[#FDDE12]" />
              <h2 className="text-sm font-bold font-heading text-white">1. Seleccionar Usuario</h2>
            </div>

            {loadingUsers ? (
              <div className="p-8 flex items-center justify-center gap-2 text-slate-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-[#FDDE12]" />
                <span>Cargando lista de usuarios...</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {profiles.map((p) => {
                  const isSelected = p.id === selectedProfileId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProfileId(p.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#FDDE12]/10 border-[#FDDE12] text-white font-semibold'
                          : 'bg-[#0F172A] border-[#334155] text-slate-300 hover:bg-[#334155]'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-semibold truncate">{p.full_name}</div>
                        <div className="text-[10px] text-slate-400 uppercase font-heading">
                          {p.role === 'SUPERADMIN' ? 'SOPORTE' : p.role}
                        </div>
                      </div>
                      {isSelected && <ShieldCheck className="w-4 h-4 text-[#FDDE12] flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Permissions Active Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Grant Permission Form */}
            <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-[#334155] pb-3">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-[#FDDE12]" />
                  <h2 className="text-sm font-bold font-heading text-white">
                    Otorgar Permiso Granular a: <span className="text-[#FDDE12]">{selectedProfile?.full_name || 'Seleccione usuario'}</span>
                  </h2>
                </div>
              </div>

              <form onSubmit={handleGrant} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Clave de Permiso
                    </label>
                    <select
                      value={newPermissionKey}
                      onChange={(e) => setNewPermissionKey(e.target.value)}
                      className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12] cursor-pointer"
                    >
                      <option value="financial_balances.view">financial_balances.view (Vista Balances Financieros)</option>
                      <option value="tickets.cancel">tickets.cancel (Anulación de Comprobantes)</option>
                      <option value="CUSTOM">Otro permiso personalizado...</option>
                    </select>
                  </div>

                  {newPermissionKey === 'CUSTOM' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Nombre de Clave Personalizada
                      </label>
                      <input
                        type="text"
                        required
                        value={customKeyInput}
                        onChange={(e) => setCustomKeyInput(e.target.value)}
                        placeholder="ej: reports.export_all"
                        className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-xs rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#FDDE12]"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving || !selectedProfileId}
                    className="px-4 py-2.5 bg-[#FDDE12] hover:bg-[#E5C800] text-[#0F172A] font-bold rounded-xl text-xs transition-all font-heading uppercase flex items-center gap-2 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Procesando...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>Conceder Permiso</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Active Permissions List */}
            <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-[#334155] pb-3">
                <h3 className="text-sm font-bold font-heading text-white">Permisos Granulares Activos</h3>
                <span className="text-xs text-slate-400 font-medium">Total: <strong>{userPermissions.length}</strong></span>
              </div>

              {loadingPerms ? (
                <div className="p-8 flex items-center justify-center gap-2 text-slate-400 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-[#FDDE12]" />
                  <span>Cargando permisos del usuario...</span>
                </div>
              ) : userPermissions.length === 0 ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <Lock className="w-8 h-8 mx-auto text-slate-600 mb-1" />
                  <p className="text-xs font-medium">El usuario no posee permisos explícitos otorgados en `user_permissions`.</p>
                  <p className="text-[11px] text-slate-500">Nota: Los roles Soporte y Administrador tienen acceso implícito por RLS.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {userPermissions.map((perm) => (
                    <div
                      key={perm.id}
                      className="p-4 bg-[#0F172A] border border-[#334155] rounded-xl flex items-center justify-between text-xs text-slate-200"
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-[#FDDE12] font-mono">{perm.permission_key}</div>
                        <div className="text-[10px] text-slate-400">
                          Otorgado el {new Date(perm.created_at).toLocaleDateString('es-ES')} por {perm.granted_by ? `ID: ${perm.granted_by}` : 'Sistema'}
                        </div>
                      </div>

                      <button
                        onClick={() => handleRevoke(perm.permission_key)}
                        disabled={saving}
                        className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg transition-colors font-semibold text-[11px] flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Revocar</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
