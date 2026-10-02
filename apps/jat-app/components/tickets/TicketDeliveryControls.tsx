'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  getTicketDeliveries,
  sendTicketEmail,
  sendTicketWhatsApp,
  TicketDeliveryLog,
} from '@/lib/services/ticket-delivery';
import { Mail, MessageSquare, RefreshCw, CheckCircle2, AlertCircle, Clock, Send } from 'lucide-react';

interface TicketDeliveryControlsProps {
  rideId: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  companyAddress?: string | null;
}

export default function TicketDeliveryControls({
  rideId,
  customerEmail,
  customerPhone,
  companyAddress,
}: TicketDeliveryControlsProps) {
  const [deliveries, setDeliveries] = useState<TicketDeliveryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await getTicketDeliveries(rideId);
    if (data) setDeliveries(data);
    setLoading(false);
  }, [rideId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const latestEmail = deliveries.find((d) => d.channel === 'email');
  const latestWhatsApp = deliveries.find((d) => d.channel === 'whatsapp');

  const handleSendEmail = async () => {
    setSendingEmail(true);
    setFeedbackMsg(null);

    const { success, error } = await sendTicketEmail({
      ride_id: rideId,
      recipient_email: customerEmail || companyAddress || null,
      is_resend: Boolean(latestEmail),
    });

    setSendingEmail(false);
    if (error) {
      setFeedbackMsg({ type: 'error', text: `Error al enviar Email: ${error.message}` });
    } else if (success) {
      setFeedbackMsg({ type: 'success', text: '✓ Ticket enviado por Email correctamente.' });
      loadLogs();
    }
  };

  const handleSendWhatsApp = async () => {
    setSendingWhatsApp(true);
    setFeedbackMsg(null);

    const { success, error } = await sendTicketWhatsApp({
      ride_id: rideId,
      recipient_phone: customerPhone || null,
      is_resend: Boolean(latestWhatsApp),
    });

    setSendingWhatsApp(false);
    if (error) {
      setFeedbackMsg({ type: 'error', text: `Error al enviar WhatsApp: ${error.message}` });
    } else if (success) {
      setFeedbackMsg({ type: 'success', text: '✓ Ticket enviado por WhatsApp correctamente.' });
      loadLogs();
    }
  };

  return (
    <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5 space-y-4 shadow-lg print:hidden">
      <div className="flex items-center justify-between border-b border-[#334155] pb-3">
        <h4 className="text-sm font-bold text-white flex items-center gap-2 font-heading">
          <Send className="w-4 h-4 text-[#FDDE12]" />
          <span>Entrega & Reenvío Digital de Comprobantes</span>
        </h4>
        <span className="text-[10px] text-slate-400 font-mono">
          Email & WhatsApp Cloud API
        </span>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* EMAIL CHANNEL CARD */}
        <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Mail className="w-4 h-4 text-sky-400" />
              <span>Correo Electrónico</span>
            </div>
            {latestEmail ? (
              latestEmail.status === 'sent' ? (
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">
                  ✓ ENVIADO
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold">
                  ⚠ ERROR
                </span>
              )
            ) : (
              <span className="px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[10px]">
                PENDIENTE
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-400 truncate">
            {customerEmail || companyAddress || 'Sin email registrado'}
          </p>

          {latestEmail?.sent_at && (
            <p className="text-[10px] text-slate-500 font-mono">
              Último envío: {new Date(latestEmail.sent_at).toLocaleString('es-BO')}
            </p>
          )}

          <button
            onClick={handleSendEmail}
            disabled={sendingEmail}
            className="w-full py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {sendingEmail ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{latestEmail ? 'Reenviar Email' : 'Enviar por Email'}</span>
          </button>
        </div>

        {/* WHATSAPP CHANNEL CARD */}
        <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>WhatsApp Business</span>
            </div>
            {latestWhatsApp ? (
              latestWhatsApp.status === 'sent' ? (
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">
                  ✓ ENVIADO
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold">
                  ⚠ ERROR
                </span>
              )
            ) : (
              <span className="px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[10px]">
                PENDIENTE
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-400 truncate">
            {customerPhone || 'Sin teléfono registrado'}
          </p>

          {latestWhatsApp?.sent_at && (
            <p className="text-[10px] text-slate-500 font-mono">
              Último envío: {new Date(latestWhatsApp.sent_at).toLocaleString('es-BO')}
            </p>
          )}

          <button
            onClick={handleSendWhatsApp}
            disabled={sendingWhatsApp}
            className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {sendingWhatsApp ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{latestWhatsApp ? 'Reenviar WhatsApp' : 'Enviar por WhatsApp'}</span>
          </button>
        </div>
      </div>

      {/* History Log Table */}
      {deliveries.length > 0 && (
        <div className="pt-2 border-t border-[#334155]/60">
          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-2">
            Historial de Intentos de Entrega ({deliveries.length})
          </span>
          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
            {deliveries.map((log) => (
              <div
                key={log.id}
                className="text-[11px] bg-[#0F172A]/60 p-2 rounded-lg flex items-center justify-between font-mono"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                      log.channel === 'email' ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {log.channel}
                  </span>
                  <span className="text-slate-300">{log.recipient}</span>
                </div>

                <div className="flex items-center gap-3 text-slate-400 text-[10px]">
                  <span>{new Date(log.created_at).toLocaleTimeString('es-BO')}</span>
                  <span
                    className={
                      log.status === 'sent'
                        ? 'text-emerald-400 font-bold'
                        : 'text-rose-400 font-bold'
                    }
                  >
                    {log.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
