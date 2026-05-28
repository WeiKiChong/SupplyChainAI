import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { 
  Flag, 
  Search, 
  X, 
  Trash2, 
  Upload, 
  Download, 
  Plus, 
  LayoutGrid, 
  Clock, 
  AlertCircle, 
  RotateCcw 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, getLocalDateString } from '../utils';
import { TargetWorkingHour } from '../types';

interface TargetLaborHoursProps {
  targetWorkingHours: TargetWorkingHour[];
  setTargetWorkingHours: (hours: TargetWorkingHour[]) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  importStatus: Record<string, { fileName: string; time: string; error?: string }>;
  updateImportStatus: (type: string, fileName: string, error?: string) => void;
  clearImportStatus: (type: string) => void;
}

export function TargetLaborHours({
  targetWorkingHours,
  setTargetWorkingHours,
  addNotification,
  importStatus,
  updateImportStatus,
  clearImportStatus
}: TargetLaborHoursProps) {
  const { t } = useTranslation();
  const [searchTargetWorkingHour, setSearchTargetWorkingHour] = useState('');
  const [isConfirmingClearTargetWorkingHours, setIsConfirmingClearTargetWorkingHours] = useState(false);

  const filteredTargetWorkingHours = useMemo(() => {
    let result = targetWorkingHours;
    if (searchTargetWorkingHour.trim()) {
      const search = searchTargetWorkingHour.toLowerCase().trim();
      result = result.filter(t => 
        (t.team || '').toLowerCase().includes(search)
      );
    }
    return result;
  }, [targetWorkingHours, searchTargetWorkingHour]);

  const isRowModified = (item: TargetWorkingHour) => {
    if (!item.original) return false;
    return (
      item.team !== item.original.team ||
      item.dailyTarget !== item.original.dailyTarget
    );
  };

  const isFieldModified = (item: TargetWorkingHour, field: keyof Omit<TargetWorkingHour, 'original'>) => {
    if (!item.original) return false;
    return item[field] !== item.original[field];
  };

  const restoreRow = (idx: number) => {
    const item = targetWorkingHours[idx];
    if (!item.original) return;
    const newTargets = [...targetWorkingHours];
    newTargets[idx] = { ...item, ...item.original };
    setTargetWorkingHours(newTargets);
    addNotification('info', `已恢复班组 "${item.team}" 的目标工时数据`);
  };

  const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, allowDecimal: boolean = true) => {
    if (['e', 'E', '+', '-'].includes(e.key)) {
      e.preventDefault();
    }
    if (!allowDecimal && e.key === '.') {
      e.preventDefault();
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="glass-card p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Flag size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{t('twh.title')}</h3>
              <p className="text-sm text-slate-500">{t('twh.records_count', { count: targetWorkingHours.length })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder={t('twh.search_placeholder')}
                value={searchTargetWorkingHour}
                onChange={(e) => setSearchTargetWorkingHour(e.target.value)}
                className="pl-10 pr-10 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 w-64 transition-all outline-none"
              />
              {searchTargetWorkingHour && (
                <button 
                  onClick={() => setSearchTargetWorkingHour('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Clear Action */}
            <button 
              onClick={() => {
                if (isConfirmingClearTargetWorkingHours) {
                  setTargetWorkingHours([]);
                  clearImportStatus('target-working-hour');
                  setSearchTargetWorkingHour('');
                  setIsConfirmingClearTargetWorkingHours(false);
                } else {
                  setIsConfirmingClearTargetWorkingHours(true);
                  setTimeout(() => setIsConfirmingClearTargetWorkingHours(false), 3000);
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all border text-sm",
                isConfirmingClearTargetWorkingHours 
                  ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100 animate-pulse" 
                  : "bg-white text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-100 hover:bg-red-50"
              )}
            >
              <Trash2 size={16} />
              <span>{isConfirmingClearTargetWorkingHours ? t('twh.clear_confirm') : t('twh.clear')}</span>
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            {/* Data Management Group */}
            <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
              <button 
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.csv,.xlsx,.xls';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                      try {
                        const arrayBuffer = event.target?.result as ArrayBuffer;
                        let workbook;
                        workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
                        
                        const sheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[sheetName];
                        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                        
                        if (rawRows.length === 0) {
                          addNotification('error', t('twh.error_empty'));
                          return;
                        }

                        let headerIndex = -1;
                        let colMap: Record<string, number> = {};
                        
                        const matchOptions = [
                          ['班组', '班组_Team'],
                          ['日均目标（H）', '日均目标（H）_Daily Target (H)', '日均目标']
                        ];
                        
                        for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                          const row = rawRows[i];
                          if (!row) continue;
                          
                          const getIndex = (aliases: string[]) => row.findIndex(cell => aliases.includes(String(cell || '').trim()));
                          
                          const teamCol = getIndex(matchOptions[0]);
                          const dailyCol = getIndex(matchOptions[1]);
                          
                          if (teamCol !== -1 && dailyCol !== -1) {
                            headerIndex = i;
                            colMap = {
                              team: teamCol,
                              dailyTarget: dailyCol
                            };
                            break;
                          }
                        }

                        if (headerIndex === -1) {
                          addNotification('error', t('twh.error_header'));
                          return;
                        }

                        const dataRows = rawRows.slice(headerIndex + 1);
                        const validRows = dataRows.filter(row => row && row.length > 0 && row[colMap.team] !== undefined && String(row[colMap.team]).trim() !== '');
                        
                        if (validRows.length === 0) {
                          addNotification('error', t('twh.error_no_data'));
                          return;
                        }

                        const formattedData = validRows.map((row, index) => {
                          const data = {
                            id: `import-twh-${Date.now()}-${index}`,
                            team: String(row[colMap.team] ?? '').trim(),
                            dailyTarget: colMap.dailyTarget !== -1 ? Math.max(0, Math.round(parseFloat(String(row[colMap.dailyTarget])) || 0)) : 0
                          };
                          return {
                            ...data,
                            original: { ...data }
                          };
                        });

                        setTargetWorkingHours(formattedData);
                        addNotification('success', t('twh.import_success', { count: formattedData.length }));
                        updateImportStatus('target-working-hour', file.name);
                      } catch (err) {
                        console.error('Import failed:', err);
                        addNotification('error', t('twh.import_failed'));
                      }
                    };
                    reader.readAsArrayBuffer(file);
                  };
                  input.click();
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm"
              >
                <Upload size={14} />
                <span>{t('twh.import')}</span>
              </button>
              <div className="w-px h-4 bg-slate-300 mx-1" />
              <button 
                onClick={async () => {
                  const exportData = targetWorkingHours.map(item => ({
                    '班组_Team': item.team,
                    '日均目标（H）_Daily Target (H)': item.dailyTarget
                  }));
                  
                  const workbook = new ExcelJS.Workbook();
                  const worksheet = workbook.addWorksheet(t('twh.sheet_name'));
                  worksheet.properties.defaultRowHeight = 20;

                  const headers = ['班组_Team', '日均目标（H）_Daily Target (H)'];
                  const headerRow = worksheet.addRow(headers);
                  headerRow.height = 20;
                  
                  headerRow.eachCell((cell) => {
                    cell.font = { bold: true };
                    cell.alignment = { vertical: 'middle', horizontal: 'left' };
                    cell.fill = {
                      type: 'pattern' as const,
                      pattern: 'solid' as const,
                      fgColor: { argb: '00B0F0' } 
                    };
                  });

                  worksheet.autoFilter = {
                    from: { row: 1, column: 1 },
                    to: { row: 1, column: headers.length }
                  };

                  exportData.forEach(data => {
                    const row = worksheet.addRow(Object.values(data));
                    row.alignment = { vertical: 'middle', horizontal: 'left' };
                  });

                  worksheet.columns.forEach((col) => {
                    col.width = 20;
                  });

                  worksheet.eachRow({ includeEmpty: true }, (row) => {
                    row.eachCell({ includeEmpty: true }, (cell) => {
                      cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                      };
                    });
                  });

                  const buffer = await workbook.xlsx.writeBuffer();
                  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `目标工时明细_${getLocalDateString()}.xlsx`;
                  link.click();
                  addNotification('success', t('twh.export_success'));
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm"
              >
                <Download size={14} />
                <span>{t('twh.export')}</span>
              </button>
            </div>

            {/* Primary Action */}
            <button 
              onClick={() => {
                const newId = Math.random().toString(36).substr(2, 9);
                setTargetWorkingHours([{ 
                  id: newId, 
                  team: '', 
                  dailyTarget: 0
                }, ...targetWorkingHours]);
              }}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all active:scale-95 text-sm"
            >
              <Plus size={18} />
              {t('twh.add')}
            </button>
          </div>
        </div>

        <div className="overflow-auto max-h-[650px] border border-slate-200 rounded-2xl shadow-sm bg-white">
          <table className="w-full text-sm text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-50">
                <th className="py-4 px-4 font-bold text-slate-600 border-b border-r border-slate-200 min-w-[150px] bg-slate-50">
                  <div className="flex items-center gap-2">
                    <LayoutGrid size={16} className="text-slate-400" />
                    <span>{t('twh.team')}</span>
                  </div>
                </th>
                <th className="py-4 px-4 font-bold text-slate-600 border-b border-r border-slate-200 text-center bg-slate-50 min-w-[200px]">
                  <div className="flex items-center justify-center gap-2">
                    <Clock size={16} className="text-slate-400" />
                    <span>{t('twh.daily_target')}</span>
                  </div>
                </th>
                <th className="py-4 px-4 w-24 border-b border-slate-200 bg-slate-50 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTargetWorkingHours.map((item) => {
                const rowModified = isRowModified(item);
                const originalIdx = targetWorkingHours.findIndex(t => t.id === item.id);
                return (
                  <tr key={item.id} className={cn(
                    "group transition-all duration-200",
                    rowModified ? "bg-amber-50/30 hover:bg-amber-50/50" : "hover:bg-indigo-50/20"
                  )}>
                    <td className={cn(
                      "py-3 px-4 border-r border-slate-100 transition-colors",
                      isFieldModified(item, 'team') ? "bg-amber-50/50" : "group-hover:bg-indigo-50/30"
                    )}>
                      <input 
                        type="text" 
                        value={item.team}
                        onChange={(e) => {
                          const newTargets = [...targetWorkingHours];
                          newTargets[originalIdx].team = e.target.value;
                          setTargetWorkingHours(newTargets);
                        }}
                        placeholder={t('twh.team')}
                        className={cn(
                          "w-full bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded py-1 transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                          isFieldModified(item, 'team') ? "text-amber-600 font-bold" : "text-slate-600"
                        )}
                        title={item.original ? `${t('twh.original_value')}${item.original.team}` : undefined}
                      />
                    </td>
                    <td className={cn(
                      "py-3 px-4 border-r border-slate-100 transition-colors",
                      isFieldModified(item, 'dailyTarget') ? "bg-amber-50/50" : "group-hover:bg-indigo-50/30"
                    )}>
                      <input 
                        type="number" 
                        step="0.1"
                        min="0"
                        value={item.dailyTarget === '' as any ? '' : item.dailyTarget}
                        onKeyDown={(e) => handleNumberKeyDown(e, true)}
                        placeholder={t('twh.daily_target_short')}
                        onChange={(e) => {
                          const newTargets = [...targetWorkingHours];
                          newTargets[originalIdx].dailyTarget = e.target.value === '' ? '' as any : Math.max(0, parseFloat(e.target.value) || 0);
                          setTargetWorkingHours(newTargets);
                        }}
                        onBlur={() => {
                          if (String(item.dailyTarget) !== '') {
                            const newTargets = [...targetWorkingHours];
                            newTargets[originalIdx].dailyTarget = Math.max(0, Math.round(Number(item.dailyTarget)));
                            setTargetWorkingHours(newTargets);
                          }
                        }}
                        className={cn(
                          "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                          isFieldModified(item, 'dailyTarget') ? "text-amber-600 font-bold" : "text-slate-600"
                        )}
                        title={item.original ? `${t('twh.original_value')}${item.original.dailyTarget}` : undefined}
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {rowModified && (
                          <button 
                            onClick={() => restoreRow(originalIdx)}
                            className="p-1.5 text-amber-500 hover:bg-amber-100 rounded-lg transition-all"
                            title={t('twh.restore')}
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        <button 
                          onClick={() => setTargetWorkingHours(targetWorkingHours.filter(t => t.id !== item.id))}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="删除"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
