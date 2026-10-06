import React from 'react';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import { getCurrentUserProfile } from '@/lib/services/auth-server';
import {
  ShieldCheck,
  Bike,
  Lock,
  CheckCircle,
  ShieldAlert,
  Headset,
  Users,
  BarChart3,
  FileText,
  UserCheck,
  ChevronRight,
  Sparkles
} from 'lucide-react';

interface QuickAccessModule {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  allowedRoles: string[];
  accentColor: string;
  borderColor: string;
}

export default async function AdminDashboardPage() {
  const { user, profile } = await getCurrentUserProfile();

  const userRole = (profile?.role || user?.user_metadata?.role || 'ADMIN').toUpperCase();
  const isSuperAdmin = userRole === 'SUPERADMIN';

  const roleLabels: Record<string, string> = {
    SUPERADMIN: 'Soporte',
    ADMIN: 'Administrador',
    SUPERVISOR: 'Supervisor',
    OPERATOR: 'Operador',
    DRIVER: 'Motoquero',
    CLIENT_USER: 'Empresa / Cliente',
  };

  const quickAccessModules: QuickAccessModule[] = [
    {
      id: 'operations',
      title: 'Centro de Operaciones',
      description: 'Monitoreo en tiempo real, gestión de carreras, asignación de móviles y control de despacho.',
      href: '/operations',
      icon: Headset,
      allowedRoles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'],
      accentColor: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
      borderColor: 'group-hover:border-sky-500/50',
    },
    {
      id: 'clients',
      title: 'Clientes',
      description: 'Gestión de cuentas corporativas, clientes particulares e historial de consumos.',
      href: '/clients',
      icon: Users,
      allowedRoles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'],
      accentColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      borderColor: 'group-hover:border-emerald-500/50',
    },
    {
      id: 'drivers',
      title: 'Motoqueros & Liquidaciones',
      description: 'Control de flota, estados operativos, precierres 80/20 y liquidaciones de conductores.',
      href: '/drivers',
      icon: Bike,
      allowedRoles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'],
      accentColor: 'bg-[#FDDE12]/10 text-[#FDDE12] border-[#FDDE12]/30',
      borderColor: 'group-hover:border-[#FDDE12]/50',
    },
    {
      id: 'users',
      title: 'Usuarios & Roles',
      description: 'Administración de perfiles de usuario, asignación de roles y control de accesos.',
      href: '/admin/users',
      icon: UserCheck,
      allowedRoles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'],
      accentColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      borderColor: 'group-hover:border-purple-500/50',
    },
    {
      id: 'reports',
      title: 'Reportes & Cierre Global',
      description: 'Consolidados de facturación bruta, comisiones, cierres de periodo y exportaciones.',
      href: '/reports',
      icon: BarChart3,
      allowedRoles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'],
      accentColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      borderColor: 'group-hover:border-amber-500/50',
    },
    {
      id: 'tickets',
      title: 'Tickets Digitales',
      description: 'Búsqueda y descarga de comprobantes de servicio en PDF y envío por WhatsApp.',
      href: '/tickets',
      icon: FileText,
      allowedRoles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR', 'DRIVER'],
      accentColor: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
      borderColor: 'group-hover:border-teal-500/50',
    },
  ];

  const visibleModules = quickAccessModules.filter((mod) => mod.allowedRoles.includes(userRole));

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Topbar
        title="Dashboard Ejecutivo — Administración"
        subtitle="Vista panorámica de supervisión estratégica y acceso rápido a módulos MotoJAT"
      />

      <main className="p-3 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
        {/* Welcome Card */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 relative overflow-hidden shadow-lg">
          <div className="flex items-start justify-between relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] text-xs font-semibold px-3 py-1 rounded-full mb-3">
                {isSuperAdmin ? <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>Rol: {roleLabels[userRole] || userRole}</span>
              </div>
              <h2 className="text-2xl font-bold font-heading text-white">
                Bienvenido, {profile?.full_name || user?.email || 'Administrador'}
              </h2>
              <p className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Plataforma de Gestión Logística MotoJAT. Seleccione un módulo principal para ingresar.
              </p>
            </div>
            <div className="hidden md:flex flex-col items-end text-xs text-slate-400">
              <span className="font-semibold text-slate-200">Organización:</span>
              <span className="text-[#FDDE12] font-semibold mt-0.5">MotoJAT Single-Company</span>
            </div>
          </div>
        </div>

        {/* Quick Access Modules */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold font-heading text-white">Módulos Principales</h3>
            <p className="text-xs text-slate-400">Acceso directo a las principales funciones operativas y administrativas según sus permisos</p>
          </div>

          {visibleModules.length === 0 ? (
            <div className="p-8 bg-[#1E293B] border border-[#334155] rounded-2xl text-center text-slate-400 text-xs">
              No hay módulos principales configurados para su rol en esta vista. Por favor utilice la navegación lateral.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleModules.map((mod) => {
                const IconComp = mod.icon;
                return (
                  <Link
                    key={mod.id}
                    href={mod.href}
                    className={`group bg-[#1E293B] border border-[#334155] ${mod.borderColor} rounded-2xl p-6 transition-all duration-200 hover:shadow-xl hover:-translate-y-1 flex flex-col justify-between space-y-4 cursor-pointer`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className={`p-3 rounded-xl border ${mod.accentColor}`}>
                          <IconComp className="w-6 h-6" />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 group-hover:text-[#FDDE12] group-hover:bg-slate-800 transition-colors">
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-white group-hover:text-[#FDDE12] transition-colors font-heading">
                          {mod.title}
                        </h4>
                        <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                          {mod.description}
                        </p>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                      <span>Acceder al módulo</span>
                      <span className="text-[#FDDE12] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Ir →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Superadmin Technical Section (Exclusively for SUPERADMIN / Soporte) */}
        {isSuperAdmin && (
          <div className="space-y-4 pt-4 border-t border-[#334155]/60">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-bold text-slate-300 font-heading uppercase tracking-wider">
                Infraestructura & Soporte Técnico (Exclusivo Soporte)
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5 flex items-start gap-4">
                <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-400 rounded-xl">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Esquema MotoJAT</h4>
                  <p className="text-xs text-slate-400 mt-1">Base de datos optimizada sin capas multitenant innecesarias.</p>
                </div>
              </div>

              <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5 flex items-start gap-4">
                <div className="p-3 bg-sky-950/60 border border-sky-800 text-sky-400 rounded-xl">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Seguridad RLS Activa</h4>
                  <p className="text-xs text-slate-400 mt-1">Políticas de seguridad forzadas a nivel de PostgreSQL.</p>
                </div>
              </div>

              <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5 flex items-start gap-4">
                <div className="p-3 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
                  <Bike className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Soporte</h4>
                  <p className="text-xs text-slate-400 mt-1">Acceso de soporte técnico configurado y protegido.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
