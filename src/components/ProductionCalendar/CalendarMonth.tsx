import React from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../utils';

interface Props {
  month: {
    index: number;
    name: string;
    daysInMonth: number;
    firstDayOfWeek: number;
  };
  selectedYear: number;
  isWorkingDay: (year: number, month: number, day: number) => boolean;
  toggleDay: (year: number, month: number, day: number) => void;
  setDaysStatus: (days: { year: number; month: number; day: number }[], status: boolean) => void;
  batchAction: (type: 'weekends-single' | 'weekends-double' | 'all-working', monthIndex: number) => void;
  stats: {
    workingDays: number;
    restDays: number;
  };
}

export function CalendarMonth({ 
  month, 
  selectedYear, 
  isWorkingDay, 
  toggleDay, 
  setDaysStatus,
  batchAction, 
  stats 
}: Props) {
  const { t } = useTranslation();
  const [dragStart, setDragStart] = React.useState<number | null>(null);
  const [dragEnd, setDragEnd] = React.useState<number | null>(null);
  const [hasDragged, setHasDragged] = React.useState(false);

  const handleMouseDown = (day: number) => {
    setDragStart(day);
    setDragEnd(day);
    setHasDragged(false);
  };

  const handleMouseEnter = (day: number) => {
    if (dragStart !== null) {
      setDragEnd(day);
      if (day !== dragStart) {
        setHasDragged(true);
      }
    }
  };

  const handleMouseUp = () => {
    if (dragStart !== null && dragEnd !== null && hasDragged) {
      const start = Math.min(dragStart, dragEnd);
      const end = Math.max(dragStart, dragEnd);
      
      // Determine target state based on the first day's current state
      const firstDayCurrentStatus = isWorkingDay(selectedYear, month.index, dragStart);
      const targetStatus = !firstDayCurrentStatus;

      const daysToUpdate = [];
      for (let d = start; d <= end; d++) {
        daysToUpdate.push({ year: selectedYear, month: month.index, day: d });
      }
      
      if (daysToUpdate.length > 0) {
        setDaysStatus(daysToUpdate, targetStatus);
      }
    }
    
    // We don't clear dragStart/dragEnd immediately to allow onClick to check them
    // But we need to clear them eventually. 
    // Actually, let's use a timeout or just clear them here and use hasDragged in onClick.
    setTimeout(() => {
      setDragStart(null);
      setDragEnd(null);
      setHasDragged(false);
    }, 50);
  };

  // Add global mouseup listener
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragStart !== null) {
        handleMouseUp();
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [dragStart, dragEnd, hasDragged]);

  const isInSelection = (day: number) => {
    if (dragStart === null || dragEnd === null) return false;
    const start = Math.min(dragStart, dragEnd);
    const end = Math.max(dragStart, dragEnd);
    return day >= start && day <= end;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: month.index * 0.05 }}
      className="glass-card overflow-hidden flex flex-col select-none"
    >
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h4 className="font-bold text-slate-800">{month.name}</h4>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('cal.working_days_title')}</p>
          <p className="text-sm font-black text-indigo-600">{stats.workingDays} {t('cal.days_unit')}</p>
        </div>
      </div>
      
      <div className="p-4 flex-1">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {[t('cal.sun'), t('cal.mon'), t('cal.tue'), t('cal.wed'), t('cal.thu'), t('cal.fri'), t('cal.sat')].map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">
              {d}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: month.firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          
          {Array.from({ length: month.daysInMonth }).map((_, i) => {
            const day = i + 1;
            const working = isWorkingDay(selectedYear, month.index, day);
            const selected = isInSelection(day);
            return (
              <button
                key={day}
                onMouseDown={(e) => {
                  if (e.button === 0) handleMouseDown(day);
                }}
                onMouseEnter={() => handleMouseEnter(day)}
                onClick={() => {
                  // Only toggle if it wasn't a drag selection
                  if (!hasDragged) {
                    toggleDay(selectedYear, month.index, day);
                  }
                }}
                className={cn(
                  "aspect-square rounded-lg flex flex-col items-center justify-center transition-all relative group",
                  working 
                    ? "bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100" 
                    : "bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100",
                  selected && "ring-2 ring-indigo-400 ring-inset z-10"
                )}
              >
                <span className="text-xs font-bold">{day}</span>
                <div className={cn(
                  "w-1 h-1 rounded-full mt-0.5 transition-all",
                  working ? "bg-indigo-500 scale-100" : "bg-transparent scale-0"
                )} />
                
                <div className={cn(
                  "absolute top-1 right-1 w-3 h-3 rounded-sm border flex items-center justify-center transition-all",
                  working 
                    ? "bg-indigo-500 border-indigo-500" 
                    : "bg-white border-slate-200 opacity-0 group-hover:opacity-100"
                )}>
                  {working && <Check size={8} className="text-white" strokeWidth={4} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-3 border-t border-slate-100 flex items-center justify-center gap-2 bg-slate-50/30">
        <button onClick={() => batchAction('weekends-single', month.index)} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded hover:border-indigo-300">{t('cal.single_weekend_short')}</button>
        <button onClick={() => batchAction('weekends-double', month.index)} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded hover:border-indigo-300">{t('cal.double_weekend_short')}</button>
        <button onClick={() => batchAction('all-working', month.index)} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded hover:border-indigo-300">{t('cal.no_rest_short')}</button>
      </div>
    </motion.div>
  );
}
