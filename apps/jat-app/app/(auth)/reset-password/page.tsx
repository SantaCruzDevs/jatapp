'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bike, Lock, AlertCircle, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { updateUserPassword, logoutUser } from '@/lib/services/auth';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checkingContext, setCheckingContext] = useState(true);
  const [hasValidContext, setHasValidContext] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function verifyRecoveryContext() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          setHasValidContext(true);
        } else {
          setHasValidContext(false);
        }
      } catch (err) {
        console.error('Error verifying recovery context:', err);
        setHasValidContext(false);
      } finally {
        setCheckingContext(false);
      }
    }

    verifyRecoveryContext();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (password.length < 6) {
      setErrorMsg('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Las contraseñas ingresadas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      await updateUserPassword(password);
      setSuccessMsg('¡Contraseña actualizada exitosamente! Cerrando sesión de recuperación...');

      // Cleanly sign out the temporary recovery session and redirect to login
      setTimeout(async () => {
        await logoutUser();
        router.push('/login?resetSuccess=true');
      }, 2000);
    } catch (err: any) {
      console.error('Error updating password:', err);
      setErrorMsg(err.message || 'No se pudo actualizar la contraseña. Intente nuevamente.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col justify-center items-center p-4 relative">
      {/* Background glow accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#FDDE12]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-[#1E293B] border border-[#334155] rounded-2xl shadow-2xl p-8 relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Bike className="w-9 h-9 text-[#FDDE12]" />
            <div className="flex flex-col leading-none items-start">
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-300">Motoservi</span>
              <span className="text-3xl font-black text-[#FDDE12] uppercase font-heading tracking-wide">JAT</span>
            </div>
          </div>
          <span className="text-[#0F172A] text-[10px] font-extrabold tracking-widest bg-[#FDDE12] px-3 py-0.5 rounded uppercase font-heading">
            Justo a Tiempo
          </span>
          <h2 className="text-lg font-bold font-heading text-white mt-4">Restablecer Contraseña</h2>
          <p className="text-xs text-slate-400 mt-1">Ingrese su nueva contraseña para acceder a la plataforma</p>
        </div>

        {/* Loading Verification State */}
        {checkingContext && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
            <p className="text-xs text-slate-300">Verificando enlace de recuperación...</p>
          </div>
        )}

        {/* Invalid or Expired Context Warning */}
        {!checkingContext && !hasValidContext && (
          <div className="space-y-6">
            <div className="p-4 bg-amber-950/80 border border-amber-800 text-amber-200 rounded-xl text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="block text-amber-300 font-semibold mb-1">Enlace inválido o expirado</strong>
                No se detectó una sesión activa de recuperación. Si accedió directamente o el enlace ya fue utilizado, por favor solicite uno nuevo desde la pantalla de inicio de sesión.
              </div>
            </div>

            <button
              onClick={() => router.push('/login')}
              className="w-full bg-[#334155] hover:bg-[#475569] text-slate-100 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 font-heading text-xs uppercase"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a Inicio de Sesión</span>
            </button>
          </div>
        )}

        {/* Valid Context Form */}
        {!checkingContext && hasValidContext && (
          <>
            {errorMsg && (
              <div className="mb-6 p-4 bg-rose-950/80 border border-rose-800 text-rose-200 rounded-xl text-xs flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="leading-relaxed">{errorMsg}</div>
              </div>
            )}

            {successMsg && (
              <div className="mb-6 p-4 bg-emerald-950/80 border border-emerald-800 text-emerald-200 rounded-xl text-xs flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="leading-relaxed">{successMsg}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Nueva Contraseña
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#FDDE12] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Confirmar Nueva Contraseña
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#FDDE12] transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !!successMsg}
                className="w-full bg-[#FDDE12] hover:bg-[#E5C800] text-[#0F172A] font-bold py-3.5 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 font-heading tracking-wide uppercase text-sm disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#0F172A]" />
                    <span>Guardando Nueva Contraseña...</span>
                  </>
                ) : (
                  <span>Establecer Nueva Contraseña</span>
                )}
              </button>
            </form>
          </>
        )}

        {/* Footer info */}
        <div className="mt-8 text-center border-t border-[#334155] pt-4">
          <p className="text-[11px] text-slate-400">
            Powered by <strong className="text-slate-200">SantaCruzDevs</strong> • Enterprise Product v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
