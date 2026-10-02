'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users,
  UserCheck,
  FileText,
  Key,
  Building2,
  Headset, 
  Wallet, 
  LogOut,
  Bike,
  BarChart3,
  Settings,
  HardDrive
} from 'lucide-react';
import { logoutUser } from '@/lib/services/auth';
import { getCompanyPortalEnabled } from '@/lib/services/system-settings';

interface SidebarProps {
  role?: string;
  userName?: string;
  avatarUrl?: string;
}

export default function Sidebar({
  role = 'ADMIN',
  userName = 'Usuario JAT',
  avatarUrl = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200',
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [portalEnabled, setPortalEnabled] = useState<boolean>(false);

  useEffect(() => {
    async function checkPortal() {
      if (role === 'CLIENT_USER') {
        const enabled = await getCompanyPortalEnabled();
        setPortalEnabled(enabled);
      }
    }
    checkPortal();
  }, [role]);

  const handleLogout = async () => {
    try {
      await logoutUser();
      router.push('/login');
      router.refresh();
    } catch (e) {
      console.error('Error in logout:', e);
    }
  };

  const roleLabels: Record<string, string> = {
    SUPERADMIN: 'Soporte',
    ADMIN: 'Administrador',
    SUPERVISOR: 'Supervisor',
    OPERATOR: 'Operador',
    DRIVER: 'Motoquero',
    CLIENT_USER: 'Empresa / Cliente',
  };

  const navItems = [
    {
      label: 'Dashboard Ejecutivo',
      href: '/admin',
      icon: LayoutDashboard,
      roles: ['SUPERADMIN', 'ADMIN'],
    },
    {
      label: 'Centro de Operaciones',
      href: '/operations',
      icon: Headset,
      roles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'],
    },
    {
      label: 'Mis Carreras',
      href: '/driver',
      icon: Bike,
      roles: ['DRIVER'],
    },
    {
      label: 'Mi Balance',
      href: '/driver/balance',
      icon: Wallet,
      roles: ['DRIVER'],
    },
    {
      label: role === 'DRIVER' ? 'Historial de Carreras' : 'Tickets Digitales',
      href: '/tickets',
      icon: FileText,
      roles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR', 'DRIVER'],
    },
    {
      label: 'Clientes',
      href: '/clients',
      icon: Users,
      roles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'],
    },
    {
      label: 'Motoqueros & Liquidaciones',
      href: '/drivers',
      icon: Bike,
      roles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'],
    },
    {
      label: 'Reportes & Cierre Global',
      href: '/reports',
      icon: BarChart3,
      roles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'],
    },
    {
      label: 'Usuarios & Roles',
      href: '/admin/users',
      icon: Users,
      roles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'],
    },
    {
      label: 'Permisos Granulares',
      href: '/admin/permissions',
      icon: Key,
      roles: ['SUPERADMIN', 'ADMIN'],
    },
    {
      label: 'Backups & Exportaciones',
      href: '/admin/backups',
      icon: HardDrive,
      roles: ['SUPERADMIN', 'ADMIN'],
    },
    {
      label: 'Configuraciones',
      href: '/admin/settings',
      icon: Settings,
      roles: ['SUPERADMIN'],
    },
    // Corporate Portal items (visible ONLY for CLIENT_USER when COMPANY_PORTAL_ENABLED is true)
    {
      label: 'Mi Cuenta Corriente',
      href: '/company/account',
      icon: Wallet,
      roles: portalEnabled ? ['CLIENT_USER'] : [],
    },
    {
      label: 'Tickets Corporativos',
      href: '/company/tickets',
      icon: FileText,
      roles: portalEnabled ? ['CLIENT_USER'] : [],
    },
    {
      label: 'Historial de Carreras',
      href: '/company/rides',
      icon: Bike,
      roles: portalEnabled ? ['CLIENT_USER'] : [],
    },
    {
      label: 'Reportes de Consumo',
      href: '/company/reports',
      icon: BarChart3,
      roles: portalEnabled ? ['CLIENT_USER'] : [],
    },
  ];

  const getRoleColor = (r: string) => {
    if (r === 'SUPERADMIN') return 'text-rose-400';
    if (r === 'ADMIN') return 'text-amber-400';
    if (r === 'SUPERVISOR') return 'text-indigo-400';
    return 'text-[#FDDE12]';
  };

  const filteredNavItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside className="w-64 bg-[#0F172A] border-r border-[#1E293B] min-h-screen flex flex-col justify-between p-4 flex-shrink-0">
      <div className="space-y-6">
        {/* Logo JATapp */}
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FDDE12] to-amber-300 p-0.5 shadow-lg shadow-[#FDDE12]/10 flex items-center justify-center">
            <div className="w-full h-full bg-[#0F172A] rounded-[10px] flex items-center justify-center">
              <Bike className="w-6 h-6 text-[#FDDE12]" />
            </div>
          </div>
          <div>
            <span className="font-heading font-black text-xl text-white tracking-wider block leading-none">
              MOTO<span className="text-[#FDDE12]">JAT</span>
            </span>
            <span className="text-[10px] text-slate-400 font-medium tracking-widest uppercase block mt-1">
              Plataforma v1.0
            </span>
          </div>
        </div>

        {/* User Badge */}
        <div className="p-3 bg-[#1E293B]/60 border border-[#334155]/50 rounded-2xl flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-xl overflow-hidden border border-[#334155] flex-shrink-0">
            <Image
              src={avatarUrl}
              alt={userName}
              fill
              className="object-cover"
            />
          </div>
          <div className="overflow-hidden">
            <h4 className="text-xs font-bold text-white truncate">{userName}</h4>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${getRoleColor(role)}`}>
              {roleLabels[role] || role}
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs transition-all duration-200 ${
                  isActive
                    ? 'bg-[#FDDE12] text-[#0F172A] font-bold shadow-md shadow-[#FDDE12]/20'
                    : 'text-slate-400 hover:text-white hover:bg-[#1E293B]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#0F172A]' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Logout Button */}
      <div className="pt-4 border-t border-[#1E293B]">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-all duration-200"
        >
          <LogOut className="w-4 h-4" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
}
