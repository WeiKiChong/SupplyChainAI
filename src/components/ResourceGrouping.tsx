import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { 
  Network, 
  Search, 
  X, 
  Trash2, 
  Upload, 
  Download, 
  Plus, 
  Hash, 
  TextQuote, 
  LayoutGrid, 
  Building, 
  AlertCircle, 
  RotateCcw 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, getLocalDateString } from '../utils';
import { ProductionResource } from '../types';
import Combobox from './Combobox';

interface ResourceGroupingProps {
  resources: ProductionResource[];
  setResources: (resources: ProductionResource[]) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  importStatus: Record<string, { fileName: string; time: string; error?: string }>;
  updateImportStatus: (type: string, fileName: string, error?: string) => void;
  clearImportStatus: (type: string) => void;
}

export function ResourceGrouping({
  resources,
  setResources,
  addNotification,
  importStatus,
  updateImportStatus,
  clearImportStatus
}: ResourceGroupingProps) {
  const { t } = useTranslation();
  const [searchResource, setSearchResource] = useState('');
  const [isConfirmingClearResources, setIsConfirmingClearResources] = useState(false);

  const filteredResources = useMemo(() => {
    let result = resources;
    if (searchResource.trim()) {
      const search = searchResource.toLowerCase().trim();
      result = result.filter(r => 
        (r.id || '').toLowerCase().includes(search) || 
        (r.groupName || '').toLowerCase().includes(search) || 
        (r.team || '').toLowerCase().includes(search) || 
        (r.workshop || '').toLowerCase().includes(search)
      );
    }
    return result;
  }, [resources, searchResource]);

  const isRowModified = (item: ProductionResource) => {
    if (!item.original) return false;
    return (
      item.id !== item.original.id ||
      item.groupName !== item.original.groupName ||
      item.team !== item.original.team ||
      item.workshop !== item.original.workshop
    );
  };

  const isFieldModified = (item: ProductionResource, field: keyof Omit<ProductionResource, 'original'>) => {
    if (!item.original) return false;
    return item[field] !== item.original[field];
  };

  const restoreRow = (idx: number) => {
    const item = resources[idx];
    if (!item.original) return;
    const newResources = [...resources];
    newResources[idx] = { ...item, ...item.original };
    setResources(newResources);
    addNotification('info', `已恢复资源组 "${item.groupName}" 的原始数据`);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="glass-card p-8 overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Network size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{t('res.title')}</h3>
              <p className="text-sm text-slate-500">{t('res.records_count', { count: resources.length })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder={t('res.search_placeholder')}
                value={searchResource}
                onChange={(e) => setSearchResource(e.target.value)}
                className="pl-10 pr-10 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 w-64 transition-all outline-none"
              />
              {searchResource && (
                <button 
                  onClick={() => setSearchResource('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Clear Action */}
            <button 
              onClick={() => {
                if (isConfirmingClearResources) {
                  setResources([]);
                  clearImportStatus('resources');
                  setSearchResource('');
                  setIsConfirmingClearResources(false);
                } else {
                  setIsConfirmingClearResources(true);
                  setTimeout(() => setIsConfirmingClearResources(false), 3000);
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all border text-sm",
                isConfirmingClearResources 
                  ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100 animate-pulse" 
                  : "bg-white text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-100 hover:bg-red-50"
              )}
            >
              <Trash2 size={16} />
              <span>{isConfirmingClearResources ? t('res.clear_confirm') : t('res.clear')}</span>
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
                          addNotification('error', t('res.error_empty'));
                          return;
                        }

                        let headerIndex = -1;
                        let colMap: Record<string, number> = {};
                        
                        const matchOptions = [
                          ['资源组ID', '资源组ID_Resource Group ID'],
                          ['资源组描述', '资源组描述_Description'],
                          ['班组', '班组_Team'],
                          ['车间', '车间_Workshop']
                        ];
                        
                        for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                          const row = rawRows[i];
                          if (!row) continue;
                          
                          const getIndex = (aliases: string[]) => row.findIndex(cell => aliases.includes(String(cell).trim()));
                          
                          const idCol = getIndex(matchOptions[0]);
                          const descCol = getIndex(matchOptions[1]);
                          const teamCol = getIndex(matchOptions[2]);
                          const workshopCol = getIndex(matchOptions[3]);
                          
                          if (idCol !== -1 && descCol !== -1 && teamCol !== -1 && workshopCol !== -1) {
                            headerIndex = i;
                            colMap = {
                              id: idCol,
                              groupName: descCol,
                              team: teamCol,
                              workshop: workshopCol
                            };
                            break;
                          }
                        }

                        if (headerIndex === -1) {
                          addNotification('error', t('res.error_header'));
                          return;
                        }

                        const dataRows = rawRows.slice(headerIndex + 1);
                        const validRows = dataRows.filter(row => row && row.length > 0 && row[colMap.id] !== undefined && String(row[colMap.id]).trim() !== '');
                        
                        if (validRows.length === 0) {
                          addNotification('error', t('res.error_no_data'));
                          return;
                        }

                        const formattedData = validRows.map((row, index) => {
                          const data = {
                            id: String(row[colMap.id] ?? '').trim() || `res-import-${Date.now()}-${index}`,
                            groupName: String(row[colMap.groupName] ?? '').trim() || '未知资源组',
                            team: String(row[colMap.team] ?? '').trim() || '',
                            workshop: String(row[colMap.workshop] ?? '').trim() || ''
                          };
                          return {
                            ...data,
                            original: {
                              id: data.id,
                              groupName: data.groupName,
                              team: data.team,
                              workshop: data.workshop
                            }
                          };
                        });

                        setResources(formattedData);
                        addNotification('success', t('res.import_success', { count: formattedData.length }));
                        updateImportStatus('resources', file.name);
                      } catch (err) {
                        console.error('Import failed:', err);
                        addNotification('error', t('res.import_failed'));
                      }
                    };
                    reader.readAsArrayBuffer(file);
                  };
                  input.click();
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm"
              >
                <Upload size={14} />
                <span>{t('res.import')}</span>
              </button>
              <button 
                onClick={async () => {
                  const exportData = resources.map(item => ({
                    '资源组ID_Resource Group ID': item.id,
                    '资源组描述_Description': item.groupName,
                    '班组_Team': item.team,
                    '车间_Workshop': item.workshop
                  }));
                  
                  const workbook = new ExcelJS.Workbook();
                  const worksheet = workbook.addWorksheet(t('res.sheet_name'));
                  worksheet.properties.defaultRowHeight = 20;

                  const headers = ['资源组ID_Resource Group ID', '资源组描述_Description', '班组_Team', '车间_Workshop'];
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
                  anchor.download = `资源分组明细_${getLocalDateString()}.xlsx`;
                  anchor.click();
                  window.URL.revokeObjectURL(url);
                  addNotification('success', t('res.export_success'));
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm"
              >
                <Download size={14} />
                <span>{t('res.export')}</span>
              </button>
            </div>

            {/* Primary Action */}
            <button 
              onClick={() => {
                setResources([{ 
                  id: '', 
                  groupName: '', 
                  team: '',
                  workshop: ''
                }, ...resources]);
              }}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all active:scale-95 text-sm"
            >
              <Plus size={18} />
              {t('res.add')}
            </button>
          </div>
        </div>

        <div className="overflow-auto max-h-[650px] border border-slate-200 rounded-2xl shadow-sm bg-white">
          <table className="w-full text-sm text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-50">
                <th className="py-4 px-4 font-bold text-left border-b border-r border-slate-200 text-slate-700 w-1/4">
                  <div className="flex items-center gap-2">
                    <Hash size={16} className="text-slate-400" />
                    {t('res.group_id')}
                  </div>
                </th>
                <th className="py-4 px-4 font-bold text-left border-b border-r border-slate-200 text-slate-700 w-1/4">
                  <div className="flex items-center gap-2">
                    <TextQuote size={16} className="text-slate-400" />
                    {t('res.group_name')}
                  </div>
                </th>
                <th className="py-4 px-4 font-bold text-left border-b border-r border-slate-200 text-slate-700 w-1/4">
                  <div className="flex items-center gap-2">
                    <LayoutGrid size={16} className="text-slate-400" />
                    {t('res.team')}
                  </div>
                </th>
                <th className="py-4 px-4 font-bold text-left border-b border-r border-slate-200 text-slate-700 w-1/4">
                  <div className="flex items-center gap-2">
                    <Building size={16} className="text-slate-400" />
                    {t('res.workshop')}
                  </div>
                </th>
                <th className="py-4 px-4 w-14 border-b border-slate-200 bg-slate-50"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredResources.map((item) => {
                const rowModified = isRowModified(item);
                const originalIdx = resources.findIndex(r => r.id === item.id);
                return (
                  <tr key={item.id} className={cn(
                    "group transition-all duration-200",
                    rowModified ? "bg-amber-50/30 hover:bg-amber-50/50" : "hover:bg-indigo-50/20"
                  )}>
                    <td className={cn(
                      "py-3 px-4 border-r border-slate-100 transition-colors",
                      rowModified ? "bg-amber-50/50 group-hover:bg-amber-50/60" : "bg-white group-hover:bg-indigo-50/30",
                      isFieldModified(item, 'id') ? "text-amber-600" : "text-slate-700"
                    )}>
                      <div className="flex items-center gap-2">
                        {isFieldModified(item, 'id') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                        <input 
                          type="text" 
                          value={item.id}
                          onChange={(e) => {
                            const newRes = [...resources];
                            newRes[originalIdx].id = e.target.value;
                            setResources(newRes);
                          }}
                          placeholder={t('res.group_id')}
                          className="bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded px-2 py-1 w-full transition-all outline-none placeholder:font-sans placeholder:text-slate-300"
                          title={item.original ? `${t('res.original_value')}${item.original.id}` : undefined}
                        />
                      </div>
                    </td>
                    <td className={cn(
                      "py-3 px-4 border-r border-slate-100 transition-colors",
                      isFieldModified(item, 'groupName') ? "bg-amber-50/50 text-amber-600" : "text-slate-700"
                    )}>
                      <div className="flex items-center gap-2">
                        {isFieldModified(item, 'groupName') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                        <input 
                          type="text" 
                          value={item.groupName}
                          onChange={(e) => {
                            const newRes = [...resources];
                            newRes[originalIdx].groupName = e.target.value;
                            setResources(newRes);
                          }}
                          placeholder={t('res.group_name')}
                          className="bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded px-2 py-1 w-full transition-all outline-none placeholder:font-sans placeholder:text-slate-300"
                          title={item.original ? `${t('res.original_value')}${item.original.groupName}` : undefined}
                        />
                      </div>
                    </td>
                    <td className={cn(
                      "py-3 px-4 border-r border-slate-100 transition-colors",
                      isFieldModified(item, 'team') ? "bg-amber-50/50 text-amber-600" : "text-slate-700"
                    )}>
                      <div className="flex items-center gap-2">
                        {isFieldModified(item, 'team') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                        <Combobox 
                          value={item.team}
                          onChange={(val) => {
                            const newRes = [...resources];
                            newRes[originalIdx].team = val;
                            setResources(newRes);
                          }}
                          options={Array.from(new Set(resources.map(r => r.team).filter(Boolean)))}
                          title={item.original ? `${t('res.original_value')}${item.original.team}` : undefined}
                          placeholder={t('res.team')}
                        />
                      </div>
                    </td>
                    <td className={cn(
                      "py-3 px-4 border-r border-slate-100 transition-colors",
                      isFieldModified(item, 'workshop') ? "bg-amber-50/50 text-amber-600" : "text-slate-700"
                    )}>
                      <div className="flex items-center gap-2">
                        {isFieldModified(item, 'workshop') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                        <input 
                          type="text" 
                          value={item.workshop}
                          onChange={(e) => {
                            const newRes = [...resources];
                            newRes[originalIdx].workshop = e.target.value;
                            setResources(newRes);
                          }}
                          placeholder={t('res.workshop')}
                          className="bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded px-2 py-1 w-full transition-all outline-none placeholder:font-sans placeholder:text-slate-300"
                          title={item.original ? `${t('res.original_value')}${item.original.workshop}` : undefined}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {rowModified && (
                          <button 
                            onClick={() => restoreRow(originalIdx)}
                            className="p-1.5 text-amber-500 hover:bg-amber-100 rounded-lg transition-all"
                            title={t('res.restore')}
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        <button 
                          onClick={() => setResources(resources.filter(r => r.id !== item.id))}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title={t('res.delete')}
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
