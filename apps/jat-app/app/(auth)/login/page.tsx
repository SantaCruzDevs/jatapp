'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bike, Lock, Mail, AlertCircle, CheckCircle2, Loader2, X, ArrowLeft } from 'lucide-react';
import { loginWithCredentials, requestPasswordReset } from '@/lib/services/auth';
import { createClient as createBrowserClient } from '@/lib/supabase/client';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    const resetParam = searchParams.get('resetSuccess');

    if (errorParam === 'invalid_recovery_link') {
      setErrorMsg('El enlace de recuperación es inválido o ha expirado. Por favor solicite uno nuevo.');
    } else if (resetParam === 'true') {
      setInfoMsg('¡Contraseña actualizada exitosamente! Por favor ingrese con sus nuevas credenciales.');
    }

    const supabase = createBrowserClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.push('/reset-password');
      }
    });

    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      const search = window.location.search;
      if (hash.includes('type=recovery') || search.includes('type=recovery')) {
        router.push('/reset-password');
      }
    }

    return () => {
      subscription.unsubscribe();
    };
  }, [searchParams, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);

    try {
      const { role } = await loginWithCredentials(email, password);
      
      // Redirect based on returned role
      if (['SUPERADMIN', 'ADMIN'].includes(role)) {
        router.push('/admin');
      } else if (['SUPERVISOR', 'OPERATOR'].includes(role)) {
        router.push('/operations');
      } else if (role === 'DRIVER') {
        router.push('/driver');
      } else if (role === 'CLIENT_USER') {
        setErrorMsg('Su cuenta (Empresa / Cliente) no tiene acceso al Panel Logístico Corporativo. Contacte al administrador de MotoJAT.');
        return;
      } else {
        router.push('/operations');
      }
      router.refresh();
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg(err.message || 'Credenciales inválidas. Por favor verifique su correo y contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotSuccess(false);

    if (!forgotEmail || !forgotEmail.includes('@')) {
      setForgotError('Por favor ingrese un correo electrónico válido.');
      return;
    }

    setForgotLoading(true);

    try {
      await requestPasswordReset(forgotEmail);
      setForgotSuccess(true);
    } catch (err: any) {
      console.error('Password reset request error:', err);
      setForgotError(err.message || 'No se pudo enviar el correo de recuperación. Intente nuevamente.');
    } finally {
      setForgotLoading(false);
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
          <h2 className="text-lg font-bold font-heading text-white mt-4">Sistema Logístico Corporativo</h2>
          <p className="text-xs text-slate-400 mt-1">Ingrese sus credenciales corporativas para acceder a la plataforma</p>
        </div>

        {/* Error Alert Banner */}
        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-950/80 border border-rose-800 text-rose-200 rounded-xl text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">{errorMsg}</div>
          </div>
        )}

        {/* Success / Info Alert Banner */}
        {infoMsg && (
          <div className="mb-6 p-4 bg-emerald-950/80 border border-emerald-800 text-emerald-200 rounded-xl text-xs flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">{infoMsg}</div>
          </div>
        )}

        {/* Real Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@jatapp.bo"
                className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#FDDE12] transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Contraseña
              </label>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setShowForgotModal(true);
                  setForgotSuccess(false);
                  setForgotError(null);
                }}
                className="text-xs text-[#FDDE12] hover:underline font-medium focus:outline-none transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#FDDE12] transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FDDE12] hover:bg-[#E5C800] text-[#0F172A] font-bold py-3.5 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 font-heading tracking-wide uppercase text-sm disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#0F172A]" />
                <span>Verificando Credenciales...</span>
              </>
            ) : (
              <span>Iniciar Sesión</span>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 text-center border-t border-[#334155] pt-4">
          <p className="text-[11px] text-slate-400">
            Powered by <strong className="text-slate-200">SantaCruzDevs</strong> • Enterprise Product v1.0
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#1E293B] border border-[#334155] rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#FDDE12]/10 border border-[#FDDE12]/30 flex items-center justify-center">
                <Mail className="w-5 h-5 text-[#FDDE12]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-heading">Recuperar Contraseña</h3>
                <p className="text-xs text-slate-400">Enviaremos un enlace de restauración a su correo</p>
              </div>
            </div>

            {forgotError && (
              <div className="mb-4 p-3 bg-rose-950/80 border border-rose-800 text-rose-200 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>{forgotError}</div>
              </div>
            )}

            {forgotSuccess ? (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-emerald-950/80 border border-emerald-800 text-emerald-200 rounded-xl text-xs flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="block text-emerald-300 font-semibold mb-1">Enlace de recuperación enviado</strong>
                    Si el correo <strong>{forgotEmail}</strong> corresponde a una cuenta registrada, recibirá un enlace para restablecer su contraseña en breve. Por favor revise su bandeja de entrada.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="w-full bg-[#334155] hover:bg-[#475569] text-slate-100 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 font-heading text-xs uppercase"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Volver al Inicio de Sesión</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Correo Electrónico Registrado
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="usuario@jatapp.bo"
                      className="w-full bg-[#0F172A] border border-[#334155] text-slate-100 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#FDDE12] transition-colors"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="flex-1 bg-[#334155] hover:bg-[#475569] text-slate-200 font-bold py-3 px-4 rounded-xl transition-all text-xs font-heading uppercase"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 bg-[#FDDE12] hover:bg-[#E5C800] text-[#0F172A] font-bold py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 font-heading text-xs uppercase disabled:opacity-50"
                  >
                    {forgotLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-[#0F172A]" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <span>Enviar Enlace</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
      </div>
    }>
      <LoginFormContent />
    </Suspense>
  );
}
