import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { 
  Timer, 
  Search, 
  X, 
  Trash2, 
  Upload, 
  Download, 
  Plus, 
  LayoutGrid, 
  AlertCircle, 
  RotateCcw 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, getLocalDateString } from '../utils';
import { StandardTime } from '../types';

interface StandardLaborHoursProps {
  standardTimes: StandardTime[];
  setStandardTimes: (times: StandardTime[]) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  importStatus: Record<string, { fileName: string; time: string; error?: string }>;
  updateImportStatus: (type: string, fileName: string, error?: string) => void;
  clearImportStatus: (type: string) => void;
  roundPrecise: (num: number, decimals: number) => number;
}

export function StandardLaborHours({
  standardTimes,
  setStandardTimes,
  addNotification,
  importStatus,
  updateImportStatus,
  clearImportStatus,
  roundPrecise
}: StandardLaborHoursProps) {
  const { t } = useTranslation();
  const [searchStandardTime, setSearchStandardTime] = useState('');
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const filteredStandardTimes = useMemo(() => {
    let result = standardTimes;
    if (searchStandardTime.trim()) {
      const search = searchStandardTime.toLowerCase().trim();
      result = result.filter(s => 
        (s.team || '').toLowerCase().includes(search)
      );
    }
    return result;
  }, [standardTimes, searchStandardTime]);

  const isRowModified = (item: StandardTime) => {
    if (!item.original) return false;
    return (
      item.team !== item.original.team ||
      item.peopleCount !== item.original.peopleCount ||
      item.peopleShifts !== item.original.peopleShifts ||
      item.peopleDuration !== item.original.peopleDuration ||
      item.peopleOle !== item.original.peopleOle ||
      item.machineCount !== item.original.machineCount ||
      item.machineShifts !== item.original.machineShifts ||
      item.machineDuration !== item.original.machineDuration ||
      item.machineOee !== item.original.machineOee
    );
  };

  const isFieldModified = (item: StandardTime, field: keyof Omit<StandardTime, 'original'>) => {
    if (!item.original) return false;
    return item[field] !== item.original[field];
  };

  const restoreRow = (idx: number) => {
    const item = standardTimes[idx];
    if (!item.original) return;
    const newTimes = [...standardTimes];
    newTimes[idx] = { ...item, ...item.original };
    setStandardTimes(newTimes);
    addNotification('info', t('st.restore_success', { team: item.team }));
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
              <Timer size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{t('st.title')}</h3>
              <p className="text-sm text-slate-500">{t('st.records_count', { count: standardTimes.length })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder={t('st.search_placeholder')}
                value={searchStandardTime}
                onChange={(e) => setSearchStandardTime(e.target.value)}
                className="pl-10 pr-10 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 w-64 transition-all outline-none"
              />
              {searchStandardTime && (
                <button 
                  onClick={() => setSearchStandardTime('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Clear Action */}
            <button 
              onClick={() => {
                if (isConfirmingClear) {
                  setStandardTimes([]);
                  clearImportStatus('standard-time');
                  setSearchStandardTime('');
                  setIsConfirmingClear(false);
                } else {
                  setIsConfirmingClear(true);
                  setTimeout(() => setIsConfirmingClear(false), 3000);
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all border text-sm",
                isConfirmingClear 
                  ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100 animate-pulse" 
                  : "bg-white text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-100 hover:bg-red-50"
              )}
            >
              <Trash2 size={16} />
              <span>{isConfirmingClear ? t('st.clear_confirm') : t('st.clear')}</span>
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
                        
                        if (file.name.toLowerCase().endsWith('.csv')) {
                          let text;
                          try {
                            const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                            text = utf8Decoder.decode(arrayBuffer);
                          } catch {
                            const gbkDecoder = new TextDecoder('gbk');
                            text = gbkDecoder.decode(arrayBuffer);
                          }
                          workbook = XLSX.read(text, { type: 'string' });
                        } else {
                          workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
                        }
                        
                        const sheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[sheetName];
                        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                        
                        if (rawRows.length === 0) {
                          addNotification('error', t('st.error_empty'));
                          return;
                        }

                        let headerIndex = -1;
                        let colMap: Record<string, number> = {};
                        
                        for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                          const row = rawRows[i];
                          if (!row) continue;
                          
                          const getCol = (aliases: string[]) => row.findIndex(c => {
                            const s = String(c || '').trim();
                            return aliases.includes(s);
                          });

                          const teamCol = getCol(['班组', '班组_Team']);
                          const peopleCol = getCol(['人员', '人员_Manpower']);
                          const machineCol = getCol(['设备', '设备_Equipment']);
                          
                          if (teamCol !== -1 && peopleCol !== -1 && machineCol !== -1) {
                            headerIndex = i;
                            
                            const findFlexCol = (keywords: string[], fallbackOffset: number) => {
                              const idx = row.findIndex(c => keywords.some(k => String(c||'').includes(k)));
                              return idx !== -1 ? idx : fallbackOffset;
                            };

                            colMap = {
                              team: teamCol,
                              peopleCount: peopleCol,
                              peopleShifts: findFlexCol(['人员班次', '人员班次_Shift'], peopleCol + 1),
                              peopleDuration: findFlexCol(['人员工作时长（H）', '人员工作时长（H）_Working Hours'], peopleCol + 2),
                              peopleOle: findFlexCol(['人员OLE'], peopleCol + 3),
                              machineCount: machineCol,
                              machineShifts: findFlexCol(['人员班次', '人员班次_Shift'], machineCol + 1),
                              machineDuration: findFlexCol(['人员工作时长（H）', '人员工作时长（H）_Working Hours'], machineCol + 2),
                              machineOee: findFlexCol(['设备OEE'], machineCol + 3)
                            };
                            break;
                          }
                        }

                        if (headerIndex === -1) {
                          addNotification('error', t('st.error_header'));
                          return;
                        }

                        const dataRows = rawRows.slice(headerIndex + 1);
                        const validRows = dataRows.filter(row => row && row.length > 0 && row[colMap.team] !== undefined && String(row[colMap.team]).trim() !== '');
                        
                        if (validRows.length === 0) {
                          addNotification('error', t('st.error_no_data'));
                          return;
                        }

                        const formattedData = validRows.map((row, index) => {
                          const data = {
                            id: `import-${Date.now()}-${index}`,
                            team: String(row[colMap.team] || '').trim() || t('st.unknown_team'),
                            peopleCount: Math.round(parseFloat(row[colMap.peopleCount]) || 0),
                            peopleShifts: colMap.peopleShifts !== -1 ? Math.max(0, roundPrecise(parseFloat(row[colMap.peopleShifts]) || 1, 1)) : 1,
                            peopleDuration: colMap.peopleDuration !== -1 ? Math.max(0, roundPrecise(parseFloat(row[colMap.peopleDuration]) || 11, 1)) : 11,
                            peopleOle: colMap.peopleOle !== -1 ? Math.max(0, roundPrecise(parseFloat(row[colMap.peopleOle]) || 0.7, 2)) : 0.7,
                            machineCount: Math.round(parseFloat(row[colMap.machineCount]) || 0),
                            machineShifts: colMap.machineShifts !== -1 ? Math.max(0, roundPrecise(parseFloat(row[colMap.machineShifts]) || 1, 1)) : 1,
                            machineDuration: colMap.machineDuration !== -1 ? Math.max(0, roundPrecise(parseFloat(row[colMap.machineDuration]) || 11, 1)) : 11,
                            machineOee: colMap.machineOee !== -1 ? Math.max(0, roundPrecise(parseFloat(row[colMap.machineOee]) || 0.7, 2)) : 0.7
                          };
                          return {
                            ...data,
                            original: {
                              team: data.team,
                              peopleCount: data.peopleCount,
                              peopleShifts: data.peopleShifts,
                              peopleDuration: data.peopleDuration,
                              peopleOle: data.peopleOle,
                              machineCount: data.machineCount,
                              machineShifts: data.machineShifts,
                              machineDuration: data.machineDuration,
                              machineOee: data.machineOee
                            }
                          };
                        });

                        setStandardTimes(formattedData);
                        addNotification('success', t('st.import_success', { count: formattedData.length }));
                        updateImportStatus('standard-time', file.name);
                      } catch (err) {
                        console.error('Import failed:', err);
                        addNotification('error', t('st.import_failed'));
                      }
                    };
                    reader.readAsArrayBuffer(file);
                  };
                  input.click();
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm"
              >
                <Upload size={14} />
                <span>{t('st.import')}</span>
              </button>
              <button 
                onClick={async () => {
                  const exportData = standardTimes.map(item => [
                    item.team,
                    item.peopleCount,
                    item.peopleShifts,
                    item.peopleDuration,
                    item.peopleOle,
                    item.machineCount,
                    item.machineShifts,
                    item.machineDuration,
                    item.machineOee
                  ]);
                  
                  const workbook = new ExcelJS.Workbook();
                  const worksheet = workbook.addWorksheet(t('st.sheet_name'));
                  worksheet.properties.defaultRowHeight = 20;

                  const row1 = worksheet.addRow([
                    '班组_Team', 
                    '人员_Manpower', '', '', '',
                    '设备_Equipment', '', '', ''
                  ]);
                  row1.height = 20;
                  
                  const row2 = worksheet.addRow([
                    '', 
                    '数量_Qty', '班次_Shift', '工作时长（H）_Working Hours', 'OLE',
                    '数量_Qty', '班次_Shift', '工作时长（H）_Working Hours', 'OEE'
                  ]);
                  row2.height = 20;

                  worksheet.mergeCells('A1:A2'); 
                  worksheet.mergeCells('B1:E1'); 
                  worksheet.mergeCells('F1:I1'); 

                  row1.eachCell((cell) => {
                    cell.font = { bold: true };
                    cell.fill = {
                      type: 'pattern',
                      pattern: 'solid',
                      fgColor: { argb: '00B0F0' }
                    };
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                  });

                  row2.eachCell((cell) => {
                    cell.font = { bold: true };
                    cell.fill = {
                      type: 'pattern',
                      pattern: 'solid',
                      fgColor: { argb: 'D9E1F2' }
                    };
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                  });

                  worksheet.autoFilter = {
                    from: { row: 2, column: 1 },
                    to: { row: 2, column: 9 }
                  };

                  exportData.forEach(rowData => {
                    const row = worksheet.addRow(rowData);
                    row.alignment = { vertical: 'middle' };
                  });

                  worksheet.columns.forEach((col, idx) => {
                    col.width = idx === 0 ? 20 : 15;
                  });

                  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
                    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                      cell.alignment = cell.alignment || {};
                      cell.alignment.vertical = 'middle';
                      cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                      };

                      if (colNumber === 1) {
                        cell.alignment = { vertical: 'middle', horizontal: 'left' };
                      } else if (rowNumber > 2) {
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                      }
                    });
                  });

                  const buffer = await workbook.xlsx.writeBuffer();
                  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                  const url = window.URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = `${t('st.filename')}_${getLocalDateString()}.xlsx`;
                  anchor.click();
                  window.URL.revokeObjectURL(url);
                  addNotification('success', t('st.export_success'));
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm"
              >
                <Download size={14} />
                <span>{t('st.export')}</span>
              </button>
            </div>

            {/* Primary Action */}
            <button 
              onClick={() => {
                const newId = Math.random().toString(36).substr(2, 9);
                setStandardTimes([{ 
                  id: newId, 
                  team: '', 
                  peopleCount: '' as any, 
                  peopleShifts: '' as any, 
                  peopleDuration: '' as any, 
                  peopleOle: '' as any,
                  machineCount: '' as any,
                  machineShifts: '' as any,
                  machineDuration: '' as any,
                  machineOee: '' as any
                }, ...standardTimes]);
              }}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all active:scale-95 text-sm"
            >
              <Plus size={18} />
              {t('st.add')}
            </button>
          </div>
        </div>

        <div className="overflow-auto max-h-[650px] border border-slate-200 rounded-2xl shadow-sm bg-white">
          <table className="w-full text-sm text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-50">
                <th rowSpan={2} className="py-5 px-4 font-bold text-slate-600 border-b border-r border-slate-200 min-w-[160px] sticky left-0 z-30 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <LayoutGrid size={16} className="text-slate-400" />
                    <span>{t('st.team')}</span>
                  </div>
                </th>
                <th colSpan={4} className="py-3 font-bold text-center border-b border-r border-slate-200 text-indigo-600 bg-indigo-50/50">
                  {t('st.manpower')}
                </th>
                <th colSpan={4} className="py-3 font-bold text-center border-b border-r border-slate-200 text-emerald-600 bg-emerald-50/50">
                  {t('st.equipment')}
                </th>
                <th rowSpan={2} className="py-5 px-4 w-14 border-b border-slate-200 bg-slate-50"></th>
              </tr>
              <tr className="bg-slate-50">
                <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">{t('st.qty')}</th>
                <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">{t('st.shift')}</th>
                <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">{t('st.duration')}</th>
                <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">{t('st.ole')}</th>
                <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">{t('st.qty')}</th>
                <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">{t('st.shift')}</th>
                <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">{t('st.duration')}</th>
                <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">{t('st.oee')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStandardTimes.map((item) => {
                const rowModified = isRowModified(item);
                const originalIdx = standardTimes.findIndex(st => st.id === item.id);
                return (
                  <tr key={item.id} className={cn(
                    "group transition-all duration-200",
                    rowModified ? "bg-amber-50/30 hover:bg-amber-50/50" : "hover:bg-indigo-50/20"
                  )}>
                    <td className={cn(
                      "py-3 px-4 font-semibold border-r border-slate-100 sticky left-0 z-10 transition-colors",
                      rowModified ? "bg-amber-50/50 group-hover:bg-amber-50/60" : "bg-white group-hover:bg-indigo-50/30",
                      isFieldModified(item, 'team') ? "text-amber-600" : "text-slate-700"
                    )}>
                      <div className="flex items-center gap-2">
                        {isFieldModified(item, 'team') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                        <input 
                          type="text" 
                          value={item.team}
                          onChange={(e) => {
                            const newTimes = [...standardTimes];
                            newTimes[originalIdx].team = e.target.value;
                            setStandardTimes(newTimes);
                          }}
                          placeholder="班组"
                          className="bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded px-2 py-1 w-full font-semibold transition-all outline-none placeholder:font-sans placeholder:text-slate-300"
                          title={item.original ? `原始值: ${item.original.team}` : undefined}
                        />
                      </div>
                    </td>
                    {/* People Section */}
                    <td className={cn("py-3 px-1 border-r border-slate-100", isFieldModified(item, 'peopleCount') && "bg-amber-50/50")}>
                      <input 
                        type="number" 
                        step="1"
                        min="0"
                        value={item.peopleCount === '' as any ? '' : item.peopleCount}
                        onKeyDown={(e) => handleNumberKeyDown(e, false)}
                        onChange={(e) => {
                          const newTimes = [...standardTimes];
                          newTimes[originalIdx].peopleCount = e.target.value === '' ? '' as any : Math.floor(Math.max(0, parseFloat(e.target.value) || 0));
                          setStandardTimes(newTimes);
                        }}
                        onBlur={() => {
                          if (String(item.peopleCount) !== '') {
                            const newTimes = [...standardTimes];
                            newTimes[originalIdx].peopleCount = Math.max(0, Math.round(Number(item.peopleCount)));
                            setStandardTimes(newTimes);
                          }
                        }}
                        placeholder="数量"
                        className={cn(
                          "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                          isFieldModified(item, 'peopleCount') ? "text-amber-600 font-bold" : "text-slate-600"
                        )}
                        title={item.original ? `原始值: ${item.original.peopleCount}` : undefined}
                      />
                    </td>
                    <td className={cn("py-3 px-1 border-r border-slate-100", isFieldModified(item, 'peopleShifts') && "bg-amber-50/50")}>
                      <input 
                        type="number" 
                        step="0.1"
                        min="0"
                        value={item.peopleShifts === '' as any ? '' : item.peopleShifts}
                        onKeyDown={(e) => handleNumberKeyDown(e, true)}
                        onChange={(e) => {
                          const newTimes = [...standardTimes];
                          newTimes[originalIdx].peopleShifts = e.target.value === '' ? '' as any : Math.max(0, parseFloat(e.target.value) || 0);
                          setStandardTimes(newTimes);
                        }}
                        onBlur={() => {
                          if (String(item.peopleShifts) !== '') {
                            const newTimes = [...standardTimes];
                            newTimes[originalIdx].peopleShifts = Math.max(0, roundPrecise(Number(item.peopleShifts), 1));
                            setStandardTimes(newTimes);
                          }
                        }}
                        placeholder="班次"
                        className={cn(
                          "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                          isFieldModified(item, 'peopleShifts') ? "text-amber-600 font-bold" : "text-slate-600"
                        )}
                        title={item.original ? `原始值: ${item.original.peopleShifts}` : undefined}
                      />
                    </td>
                    <td className={cn("py-3 px-1 border-r border-slate-100", isFieldModified(item, 'peopleDuration') && "bg-amber-50/50")}>
                      <input 
                        type="number" 
                        step="0.1"
                        min="0"
                        value={item.peopleDuration === '' as any ? '' : item.peopleDuration}
                        onKeyDown={(e) => handleNumberKeyDown(e, true)}
                        onChange={(e) => {
                          const newTimes = [...standardTimes];
                          newTimes[originalIdx].peopleDuration = e.target.value === '' ? '' as any : Math.max(0, parseFloat(e.target.value) || 0);
                          setStandardTimes(newTimes);
                        }}
                        onBlur={() => {
                          if (String(item.peopleDuration) !== '') {
                            const newTimes = [...standardTimes];
                            newTimes[originalIdx].peopleDuration = Math.max(0, roundPrecise(Number(item.peopleDuration), 1));
                            setStandardTimes(newTimes);
                          }
                        }}
                        placeholder="时长"
                        className={cn(
                          "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                          isFieldModified(item, 'peopleDuration') ? "text-amber-600 font-bold" : "text-slate-600"
                        )}
                        title={item.original ? `原始值: ${item.original.peopleDuration}` : undefined}
                      />
                    </td>
                    <td className={cn("py-3 px-1 border-r border-slate-100", isFieldModified(item, 'peopleOle') && "bg-amber-50/50")}>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0"
                        value={item.peopleOle === '' as any ? '' : item.peopleOle}
                        onKeyDown={(e) => handleNumberKeyDown(e, true)}
                        onChange={(e) => {
                          const newTimes = [...standardTimes];
                          newTimes[originalIdx].peopleOle = e.target.value === '' ? '' as any : Math.max(0, parseFloat(e.target.value) || 0);
                          setStandardTimes(newTimes);
                        }}
                        onBlur={() => {
                          if (String(item.peopleOle) !== '') {
                            const newTimes = [...standardTimes];
                            newTimes[originalIdx].peopleOle = Math.max(0, roundPrecise(Number(item.peopleOle), 2));
                            setStandardTimes(newTimes);
                          }
                        }}
                        placeholder="OLE"
                        className={cn(
                          "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                          isFieldModified(item, 'peopleOle') ? "text-amber-600 font-bold" : "text-indigo-600 font-medium"
                        )}
                        title={item.original ? `原始值: ${item.original.peopleOle}` : undefined}
                      />
                    </td>
                    {/* Machine Section */}
                    <td className={cn("py-3 px-1 border-r border-slate-100 bg-indigo-50/5 group-hover:bg-indigo-50/10 transition-colors", isFieldModified(item, 'machineCount') && "bg-amber-50/50")}>
                      <input 
                        type="number" 
                        step="1"
                        min="0"
                        value={item.machineCount === '' as any ? '' : item.machineCount}
                        onKeyDown={(e) => handleNumberKeyDown(e, false)}
                        onChange={(e) => {
                          const newTimes = [...standardTimes];
                          newTimes[originalIdx].machineCount = e.target.value === '' ? '' as any : Math.floor(Math.max(0, parseFloat(e.target.value) || 0));
                          setStandardTimes(newTimes);
                        }}
                        onBlur={() => {
                          if (String(item.machineCount) !== '') {
                            const newTimes = [...standardTimes];
                            newTimes[originalIdx].machineCount = Math.max(0, Math.round(Number(item.machineCount)));
                            setStandardTimes(newTimes);
                          }
                        }}
                        placeholder="数量"
                        className={cn(
                          "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                          isFieldModified(item, 'machineCount') ? "text-amber-600 font-bold" : "text-slate-600"
                        )}
                        title={item.original ? `原始值: ${item.original.machineCount}` : undefined}
                      />
                    </td>
                    <td className={cn("py-3 px-1 border-r border-slate-100 bg-indigo-50/5 group-hover:bg-indigo-50/10 transition-colors", isFieldModified(item, 'machineShifts') && "bg-amber-50/50")}>
                      <input 
                        type="number" 
                        step="0.1"
                        min="0"
                        value={item.machineShifts === '' as any ? '' : item.machineShifts}
                        onKeyDown={(e) => handleNumberKeyDown(e, true)}
                        onChange={(e) => {
                          const newTimes = [...standardTimes];
                          newTimes[originalIdx].machineShifts = e.target.value === '' ? '' as any : Math.max(0, parseFloat(e.target.value) || 0);
                          setStandardTimes(newTimes);
                        }}
                        onBlur={() => {
                          if (String(item.machineShifts) !== '') {
                            const newTimes = [...standardTimes];
                            newTimes[originalIdx].machineShifts = Math.max(0, roundPrecise(Number(item.machineShifts), 1));
                            setStandardTimes(newTimes);
                          }
                        }}
                        placeholder="班次"
                        className={cn(
                          "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                          isFieldModified(item, 'machineShifts') ? "text-amber-600 font-bold" : "text-slate-600"
                        )}
                        title={item.original ? `原始值: ${item.original.machineShifts}` : undefined}
                      />
                    </td>
                    <td className={cn("py-3 px-1 border-r border-slate-100 bg-indigo-50/5 group-hover:bg-indigo-50/10 transition-colors", isFieldModified(item, 'machineDuration') && "bg-amber-50/50")}>
                      <input 
                        type="number" 
                        step="0.1"
                        min="0"
                        value={item.machineDuration === '' as any ? '' : item.machineDuration}
                        onKeyDown={(e) => handleNumberKeyDown(e, true)}
                        onChange={(e) => {
                          const newTimes = [...standardTimes];
                          newTimes[originalIdx].machineDuration = e.target.value === '' ? '' as any : Math.max(0, parseFloat(e.target.value) || 0);
                          setStandardTimes(newTimes);
                        }}
                        onBlur={() => {
                          if (String(item.machineDuration) !== '') {
                            const newTimes = [...standardTimes];
                            newTimes[originalIdx].machineDuration = Math.max(0, roundPrecise(Number(item.machineDuration), 1));
                            setStandardTimes(newTimes);
                          }
                        }}
                        placeholder="时长"
                        className={cn(
                          "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                          isFieldModified(item, 'machineDuration') ? "text-amber-600 font-bold" : "text-slate-600"
                        )}
                        title={item.original ? `原始值: ${item.original.machineDuration}` : undefined}
                      />
                    </td>
                    <td className={cn("py-3 px-1 border-r border-slate-100 bg-indigo-50/5 group-hover:bg-indigo-50/10 transition-colors", isFieldModified(item, 'machineOee') && "bg-amber-50/50")}>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0"
                        value={item.machineOee === '' as any ? '' : item.machineOee}
                        onKeyDown={(e) => handleNumberKeyDown(e, true)}
                        onChange={(e) => {
                          const newTimes = [...standardTimes];
                          newTimes[originalIdx].machineOee = e.target.value === '' ? '' as any : Math.max(0, parseFloat(e.target.value) || 0);
                          setStandardTimes(newTimes);
                        }}
                        onBlur={() => {
                          if (String(item.machineOee) !== '') {
                            const newTimes = [...standardTimes];
                            newTimes[originalIdx].machineOee = Math.max(0, roundPrecise(Number(item.machineOee), 2));
                            setStandardTimes(newTimes);
                          }
                        }}
                        placeholder="OEE"
                        className={cn(
                          "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                          isFieldModified(item, 'machineOee') ? "text-amber-600 font-bold" : "text-emerald-600 font-medium"
                        )}
                        title={item.original ? `原始值: ${item.original.machineOee}` : undefined}
                      />
                    </td>
                    <td className="py-3 px-4 text-right border-r border-slate-100">
                      <div className="flex items-center justify-end gap-1">
                        {rowModified && (
                          <button 
                            onClick={() => restoreRow(originalIdx)}
                            className="p-1.5 text-amber-500 hover:bg-amber-100 rounded-lg transition-all"
                            title="恢复原始数据"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        <button 
                          onClick={() => setStandardTimes(standardTimes.filter(t => t.id !== item.id))}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="删除班组"
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
