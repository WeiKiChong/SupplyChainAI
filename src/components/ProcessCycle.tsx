import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { 
  Clock, 
  Search, 
  X, 
  Trash2, 
  Upload, 
  Download, 
  Plus, 
  Hash, 
  TextQuote, 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, getLocalDateString } from '../utils';
import { ProcessCycle as ProcessCycleType } from '../types';

interface ProcessCycleProps {
  processCycles: ProcessCycleType[];
  setProcessCycles: (cycles: ProcessCycleType[]) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  importStatus: Record<string, { fileName: string; time: string; error?: string }>;
  updateImportStatus: (type: string, fileName: string, error?: string) => void;
  clearImportStatus: (type: string) => void;
}

export function ProcessCycle({
  processCycles,
  setProcessCycles,
  addNotification,
  importStatus,
  updateImportStatus,
  clearImportStatus
}: ProcessCycleProps) {
  const { t } = useTranslation();
  const [searchProcessCycle, setSearchProcessCycle] = useState('');
  const [isConfirmingClearProcessCycles, setIsConfirmingClearProcessCycles] = useState(false);

  const filteredProcessCycles = useMemo(() => {
    let result = processCycles;
    if (searchProcessCycle.trim()) {
      const search = searchProcessCycle.toLowerCase().trim();
      result = result.filter(pc => 
        (pc.opCode || '').toLowerCase().includes(search) || 
        (pc.opName || '').toLowerCase().includes(search)
      );
    }
    return result;
  }, [processCycles, searchProcessCycle]);

  const isRowModified = (item: ProcessCycleType) => {
    if (!item.original) return false;
    return (
      item.opCode !== item.original.opCode ||
      item.opName !== item.original.opName ||
      item.standardCycleDays !== item.original.standardCycleDays ||
      item.expeditedCycleDays !== item.original.expeditedCycleDays ||
      item.isUrgent !== item.original.isUrgent
    );
  };

  const isFieldModified = (item: ProcessCycleType, field: keyof Omit<ProcessCycleType, 'original'>) => {
    if (!item.original) return false;
    return item[field] !== item.original[field];
  };

  const restoreRow = (idx: number) => {
    const item = processCycles[idx];
    if (!item.original) return;
    const newCycles = [...processCycles];
    newCycles[idx] = { ...item, ...item.original };
    setProcessCycles(newCycles);
    addNotification('info', `已恢复工序 "${item.opName || item.opCode}" 的原始数据`);
  };

  const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, allowDecimal: boolean = false) => {
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
              <Clock size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{t('pc.title')}</h3>
              <p className="text-sm text-slate-500">{t('pc.records_count', { count: processCycles.length })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder={t('pc.search_placeholder')}
                value={searchProcessCycle}
                onChange={(e) => setSearchProcessCycle(e.target.value)}
                className="pl-10 pr-10 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 w-64 transition-all outline-none"
              />
              {searchProcessCycle && (
                <button 
                  onClick={() => setSearchProcessCycle('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Clear Action */}
            <button 
              onClick={() => {
                if (isConfirmingClearProcessCycles) {
                  setProcessCycles([]);
                  clearImportStatus('process-cycle');
                  setSearchProcessCycle('');
                  setIsConfirmingClearProcessCycles(false);
                } else {
                  setIsConfirmingClearProcessCycles(true);
                  setTimeout(() => setIsConfirmingClearProcessCycles(false), 3000);
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all border text-sm",
                isConfirmingClearProcessCycles 
                  ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100 animate-pulse" 
                  : "bg-white text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-100 hover:bg-red-50"
              )}
            >
              <Trash2 size={16} />
              <span>{isConfirmingClearProcessCycles ? t('pc.clear_confirm') : t('pc.clear')}</span>
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
                          addNotification('error', '文件内容为空。');
                          return;
                        }

                        let headerIndex = -1;
                        let colMap: Record<string, number> = {};
                        
                        const matchOptions = [
                          ['工序ID', '工序ID_Process ID'],
                          ['工序描述', '工序描述_Description'],
                          ['标准模式（天）', '标准模式（天）_Standard (Days)', '标准模式'],
                          ['急件模式（天）', '急件模式（天）_Expedited (Days)', '急件模式'],
                          ['启用急件模式', '启用急件模式_Is Urgent']
                        ];
                        
                        for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                          const row = rawRows[i];
                          if (!row) continue;
                          
                          const getIndex = (aliases: string[]) => row.findIndex(cell => aliases.includes(String(cell).trim()));
                          
                          const idCol = getIndex(matchOptions[0]);
                          const descCol = getIndex(matchOptions[1]);
                          const standardCol = getIndex(matchOptions[2]);
                          const expeditedCol = getIndex(matchOptions[3]);
                          const urgentCol = getIndex(matchOptions[4]);
                          
                          if (idCol !== -1 && descCol !== -1 && standardCol !== -1) {
                            headerIndex = i;
                            colMap = {
                              opCode: idCol,
                              opName: descCol,
                              standardCycleDays: standardCol,
                              expeditedCycleDays: expeditedCol,
                              isUrgent: urgentCol
                            };
                            break;
                          }
                        }

                        if (headerIndex === -1) {
                          addNotification('error', t('pc.error_header'));
                          return;
                        }

                        const dataRows = rawRows.slice(headerIndex + 1);
                        const validRows = dataRows.filter(row => row && row.length > 0 && row[colMap.opCode] !== undefined && String(row[colMap.opCode]).trim() !== '');
                        
                        if (validRows.length === 0) {
                          addNotification('error', t('pc.error_no_data'));
                          return;
                        }

                        const formattedData = validRows.map((row, index) => {
                          let isUrgentValue = false;
                          if (colMap.isUrgent !== -1 && row[colMap.isUrgent] !== undefined) {
                            const val = String(row[colMap.isUrgent]).trim().toLowerCase();
                            isUrgentValue = val === 'true' || val === '1' || val === '是' || val === 'yes';
                          }

                          const data = {
                            id: `pc-import-${Date.now()}-${index}`,
                            opCode: String(row[colMap.opCode] ?? '').trim(),
                            opName: String(row[colMap.opName] ?? '').trim(),
                            standardCycleDays: Math.round(parseFloat(String(row[colMap.standardCycleDays]))) || 0,
                            expeditedCycleDays: colMap.expeditedCycleDays !== -1 ? (Math.round(parseFloat(String(row[colMap.expeditedCycleDays]))) || 0) : 0,
                            isUrgent: isUrgentValue
                          };
                          return {
                            ...data,
                            original: {
                              opCode: data.opCode,
                              opName: data.opName,
                              standardCycleDays: data.standardCycleDays,
                              expeditedCycleDays: data.expeditedCycleDays,
                              isUrgent: data.isUrgent
                            }
                          };
                        });

                        setProcessCycles(formattedData);
                        addNotification('success', t('pc.import_success', { count: formattedData.length }));
                        updateImportStatus('process-cycle', file.name);
                      } catch (err) {
                        console.error('Import failed:', err);
                        addNotification('error', t('pc.import_failed'));
                      }
                    };
                    reader.readAsArrayBuffer(file);
                  };
                  input.click();
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm"
              >
                <Upload size={14} />
                <span>{t('pc.import')}</span>
              </button>
              <button 
                onClick={async () => {
                  const exportData = processCycles.map(item => ({
                    '工序ID_Process ID': item.opCode,
                    '工序描述_Description': item.opName,
                    '标准模式（天）_Standard (Days)': item.standardCycleDays,
                    '急件模式（天）_Expedited (Days)': item.expeditedCycleDays,
                    '启用急件模式_Is Urgent': item.isUrgent ? '是' : '否'
                  }));
                  
                  const workbook = new ExcelJS.Workbook();
                  const worksheet = workbook.addWorksheet(t('pc.sheet_name'));
                  worksheet.properties.defaultRowHeight = 20;

                  const headers = ['工序ID_Process ID', '工序描述_Description', '标准模式（天）_Standard (Days)', '急件模式（天）_Expedited (Days)', '启用急件模式_Is Urgent'];
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
                  const url = window.URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = `工序周期明细_${getLocalDateString()}.xlsx`;
                  anchor.click();
                  window.URL.revokeObjectURL(url);
                  addNotification('success', t('pc.export_success'));
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm"
              >
                <Download size={14} />
                <span>{t('pc.export')}</span>
              </button>
            </div>

            {/* Primary Action */}
            <button 
              onClick={() => {
                const newId = Math.random().toString(36).substr(2, 9);
                setProcessCycles([{ 
                  id: newId, 
                  opCode: '', 
                  opName: '', 
                  standardCycleDays: 0,
                  expeditedCycleDays: 0,
                  isUrgent: false
                }, ...processCycles]);
              }}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all active:scale-95 text-sm"
            >
              <Plus size={18} />
              {t('pc.add')}
            </button>
          </div>
        </div>

        <div className="overflow-auto max-h-[650px] border border-slate-200 rounded-2xl shadow-sm bg-white">
          <table className="w-full text-sm text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-50">
                <th className="py-4 px-4 font-bold text-slate-600 border-b border-r border-slate-200 min-w-[120px] bg-slate-50">
                  <div className="flex items-center gap-2">
                    <Hash size={16} className="text-slate-400" />
                    <span>{t('pc.op_code')}</span>
                  </div>
                </th>
                <th className="py-4 px-4 font-bold text-slate-600 border-b border-r border-slate-200 min-w-[200px] bg-slate-50">
                  <div className="flex items-center gap-2">
                    <TextQuote size={16} className="text-slate-400" />
                    <span>{t('pc.op_name')}</span>
                  </div>
                </th>
                <th className="py-4 px-4 font-bold text-slate-600 border-b border-r border-slate-200 text-center bg-slate-50 min-w-[140px]">
                  <div className="flex items-center justify-center gap-2">
                    <Clock size={16} className="text-slate-400" />
                    <span>{t('pc.standard_mode')}</span>
                  </div>
                </th>
                <th className="py-4 px-4 font-bold text-slate-600 border-b border-r border-slate-200 text-center bg-slate-50 min-w-[140px]">
                  <div className="flex items-center justify-center gap-2">
                    <Zap size={16} className="text-slate-400" />
                    <span>{t('pc.urgent_mode')}</span>
                  </div>
                </th>
                <th className="py-4 px-4 font-bold text-slate-600 border-b border-r border-slate-200 text-center bg-slate-50 min-w-[160px] whitespace-nowrap">
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 size={16} className="text-slate-400" />
                    <span>{t('pc.enable_urgent_mode')}</span>
                  </div>
                </th>
                <th className="py-4 px-4 w-24 border-b border-slate-200 bg-slate-50 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProcessCycles.map((item) => {
                const rowModified = isRowModified(item);
                const originalIdx = processCycles.findIndex(pc => pc.id === item.id);
                return (
                  <tr key={item.id} className={cn(
                    "group transition-all duration-200",
                    rowModified ? "bg-amber-50/30 hover:bg-amber-50/50" : "hover:bg-indigo-50/20"
                  )}>
                    <td className={cn(
                      "py-3 px-4 border-r border-slate-100 transition-colors",
                      isFieldModified(item, 'opCode') ? "bg-amber-50/50" : "group-hover:bg-indigo-50/30"
                    )}>
                      <div className="flex items-center gap-2">
                        {isFieldModified(item, 'opCode') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                        <input 
                          type="text" 
                          value={item.opCode}
                          onChange={(e) => {
                            const newCycles = [...processCycles];
                            newCycles[originalIdx].opCode = e.target.value;
                            setProcessCycles(newCycles);
                          }}
                          placeholder={t('pc.op_code')}
                          className={cn(
                            "bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded px-2 py-1 w-full transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                            isFieldModified(item, 'opCode') ? "text-amber-600 font-bold" : "text-slate-700"
                          )}
                          title={item.original ? `${t('pc.original_value')}${item.original.opCode}` : undefined}
                        />
                      </div>
                    </td>
                    <td className={cn(
                      "py-3 px-4 border-r border-slate-100 transition-colors",
                      isFieldModified(item, 'opName') ? "bg-amber-50/50" : "group-hover:bg-indigo-50/30"
                    )}>
                      <div className="flex items-center gap-2">
                        {isFieldModified(item, 'opName') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                        <input 
                          type="text" 
                          value={item.opName}
                          onChange={(e) => {
                            const newCycles = [...processCycles];
                            newCycles[originalIdx].opName = e.target.value;
                            setProcessCycles(newCycles);
                          }}
                          placeholder={t('pc.op_name')}
                          className={cn(
                            "bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded px-2 py-1 w-full transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                            isFieldModified(item, 'opName') ? "text-amber-600 font-bold" : "text-slate-700"
                          )}
                          title={item.original ? `${t('pc.original_value')}${item.original.opName}` : undefined}
                        />
                      </div>
                    </td>
                    <td className={cn(
                      "py-3 px-4 border-r border-slate-100 transition-colors",
                      isFieldModified(item, 'standardCycleDays') ? "bg-amber-50/50" : "group-hover:bg-indigo-50/30"
                    )}>
                      <input 
                        type="number" 
                        step="1"
                        min="0"
                        value={item.standardCycleDays === '' as any ? '' : item.standardCycleDays}
                        onKeyDown={(e) => handleNumberKeyDown(e, false)}
                        onChange={(e) => {
                          const newCycles = [...processCycles];
                          newCycles[originalIdx].standardCycleDays = e.target.value === '' ? '' as any : Math.floor(Math.max(0, parseFloat(e.target.value) || 0));
                          setProcessCycles(newCycles);
                        }}
                        onBlur={() => {
                          if (String(item.standardCycleDays) !== '') {
                            const newCycles = [...processCycles];
                            newCycles[originalIdx].standardCycleDays = Math.max(0, Math.round(Number(item.standardCycleDays)));
                            setProcessCycles(newCycles);
                          }
                        }}
                        placeholder={t('pc.standard_mode_short')}
                        className={cn(
                          "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                          isFieldModified(item, 'standardCycleDays') ? "text-amber-600 font-bold" : "text-slate-600"
                        )}
                        title={item.original ? `${t('pc.original_value')}${item.original.standardCycleDays}` : undefined}
                      />
                    </td>
                    <td className={cn(
                      "py-3 px-4 border-r border-slate-100 transition-colors",
                      isFieldModified(item, 'expeditedCycleDays') ? "bg-amber-50/50" : "group-hover:bg-indigo-50/30"
                    )}>
                      <input 
                        type="number" 
                        step="1"
                        min="0"
                        value={item.expeditedCycleDays === '' as any ? '' : item.expeditedCycleDays}
                        onKeyDown={(e) => handleNumberKeyDown(e, false)}
                        onChange={(e) => {
                          const newCycles = [...processCycles];
                          newCycles[originalIdx].expeditedCycleDays = e.target.value === '' ? '' as any : Math.floor(Math.max(0, parseFloat(e.target.value) || 0));
                          setProcessCycles(newCycles);
                        }}
                        onBlur={() => {
                          if (String(item.expeditedCycleDays) !== '') {
                            const newCycles = [...processCycles];
                            newCycles[originalIdx].expeditedCycleDays = Math.max(0, Math.round(Number(item.expeditedCycleDays)));
                            setProcessCycles(newCycles);
                          }
                        }}
                        placeholder={t('pc.urgent_mode_short')}
                        className={cn(
                          "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:font-sans placeholder:text-slate-300",
                          isFieldModified(item, 'expeditedCycleDays') ? "text-amber-600 font-bold" : "text-slate-600"
                        )}
                        title={item.original ? `${t('pc.original_value')}${item.original.expeditedCycleDays}` : undefined}
                      />
                    </td>
                    <td className={cn(
                      "py-3 px-4 border-r border-slate-100 transition-colors text-center",
                      isFieldModified(item, 'isUrgent') ? "bg-amber-50/50" : ""
                    )}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.isUrgent || false}
                        onClick={() => {
                          const next = [...processCycles];
                          next[originalIdx] = { ...next[originalIdx], isUrgent: !item.isUrgent };
                          setProcessCycles(next);
                        }}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
                          item.isUrgent ? "bg-amber-500" : "bg-slate-200"
                        )}
                        title={item.original ? `${t('pc.original_value')}${item.original.isUrgent ? '是' : '否'}` : undefined}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            item.isUrgent ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {rowModified && (
                          <button 
                            onClick={() => restoreRow(originalIdx)}
                            className="p-1.5 text-amber-500 hover:bg-amber-100 rounded-lg transition-all"
                            title={t('pc.restore')}
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        <button 
                          onClick={() => setProcessCycles(processCycles.filter(t => t.id !== item.id))}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="删除工序"
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
