'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { getJatOperationalWeek, formatDateToIsoString, parseIsoDateString } from '@/lib/utils/date-helpers';

export interface DateRangePickerProps {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  onRangeChange: (start: string, end: string, preset?: string) => void;
  preset?: string;
  showPresets?: boolean;
  className?: string;
}

export default function DateRangePicker({
  startDate,
  endDate,
  onRangeChange,
  preset = 'custom',
  showPresets = true,
  className = '',
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string>(preset);
  const [viewDate, setViewDate] = useState<Date>(() => startDate ? parseIsoDateString(startDate) : new Date());
  
  // Transient state for range picking in calendar
  const [selectingStart, setSelectingStart] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActivePreset(preset);
  }, [preset]);

  // Close calendar popover on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApplyPreset = (p: string) => {
    setActivePreset(p);
    const now = new Date();

    if (p === 'today') {
      const todayStr = formatDateToIsoString(now);
      onRangeChange(todayStr, todayStr, 'today');
    } else if (p === 'week') {
      const { startOfWeek, endOfWeek } = getJatOperationalWeek(now);
      const startStr = formatDateToIsoString(startOfWeek);
      const endStr = formatDateToIsoString(endOfWeek);
      onRangeChange(startStr, endStr, 'week');
    } else if (p === 'month') {
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      onRangeChange(formatDateToIsoString(startMonth), formatDateToIsoString(endMonth), 'month');
    } else if (p === 'custom') {
      onRangeChange(startDate, endDate, 'custom');
    }
    setSelectingStart(null);
  };

  const handleDayClick = (dayStr: string) => {
    setActivePreset('custom');
    if (!selectingStart) {
      setSelectingStart(dayStr);
    } else {
      if (dayStr < selectingStart) {
        onRangeChange(dayStr, selectingStart, 'custom');
      } else {
        onRangeChange(selectingStart, dayStr, 'custom');
      }
      setSelectingStart(null);
    }
  };

  // Calendar matrix calculation
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Monday = 0, Sunday = 6 for calendar grid
  let startDay = firstDayOfMonth.getDay() - 1;
  if (startDay === -1) startDay = 6;

  const totalDays = lastDayOfMonth.getDate();
  const calendarDays: (Date | null)[] = [];

  for (let i = 0; i < startDay; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    calendarDays.push(new Date(year, month, d));
  }

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  return (
    <div ref={containerRef} className={`relative inline-block text-xs font-sans ${className}`}>
      {/* Input Controls Container */}
      <div className="flex flex-wrap items-center gap-2">
        {showPresets && (
          <div className="flex items-center bg-[#0F172A] p-1 rounded-xl border border-[#334155]">
            <button
              type="button"
              onClick={() => handleApplyPreset('today')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activePreset === 'today' ? 'bg-[#FDDE12] text-[#0F172A]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('week')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activePreset === 'week' ? 'bg-[#FDDE12] text-[#0F172A]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Semana JAT
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('month')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activePreset === 'month' ? 'bg-[#FDDE12] text-[#0F172A]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mes Actual
            </button>
          </div>
        )}

        {/* Date Inputs & Calendar Toggle Button */}
        <div className="flex items-center gap-1.5 bg-[#1E293B] border border-[#334155] rounded-xl p-1 px-2.5">
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setActivePreset('custom');
              onRangeChange(e.target.value, endDate, 'custom');
            }}
            className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none [color-scheme:dark]"
          />
          <span className="text-slate-500 font-bold">→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setActivePreset('custom');
              onRangeChange(startDate, e.target.value, 'custom');
            }}
            className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none [color-scheme:dark]"
          />

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 text-slate-400 hover:text-[#FDDE12] transition-colors rounded-lg hover:bg-slate-800"
            title="Abrir Calendario Interactivo"
          >
            <CalendarIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Visual Calendar Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-2 z-50 w-72 bg-[#1E293B] border border-[#334155] rounded-2xl shadow-2xl p-4 space-y-3 animate-scaleUp">
          {/* Header Controls */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-200">
              {monthNames[month]} {year}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 text-center font-bold text-[10px] text-slate-400">
            <span>Lu</span>
            <span>Ma</span>
            <span>Mi</span>
            <span>Ju</span>
            <span>Vi</span>
            <span className="text-[#FDDE12]">Sá</span>
            <span className="text-rose-400">Do</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((d, idx) => {
              if (!d) return <div key={`empty-${idx}`} />;
              const dayStr = formatDateToIsoString(d);

              const isStart = dayStr === startDate;
              const isEnd = dayStr === endDate;
              const inRange = startDate && endDate && dayStr >= startDate && dayStr <= endDate;
              const isSelectedStart = dayStr === selectingStart;

              let btnClass = 'text-slate-300 hover:bg-slate-800';
              if (isStart || isEnd || isSelectedStart) {
                btnClass = 'bg-[#FDDE12] text-[#0F172A] font-extrabold shadow-sm';
              } else if (inRange) {
                btnClass = 'bg-slate-800/80 text-[#FDDE12] font-semibold';
              }

              return (
                <button
                  key={dayStr}
                  type="button"
                  onClick={() => handleDayClick(dayStr)}
                  className={`h-7 w-7 mx-auto rounded-lg text-xs flex items-center justify-center transition-all ${btnClass}`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer Status & Done Button */}
          <div className="pt-2 border-t border-[#334155] flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-mono">
              {selectingStart ? `Selecciona fin...` : `Rango activo`}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[#FDDE12] font-bold rounded-lg flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Listo</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
