import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { FixedSizeList } from 'react-window';
import { 
  ClipboardCheck, 
  Trash2, 
  LayoutGrid, 
  Upload, 
  FileText 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, getLocalDateString, parseLocalDate } from '../utils';
import { JobReport, ProductionResource } from '../types';

interface ProductionReportingProps {
  jobReports: JobReport[];
  setJobReports: (reports: JobReport[]) => void;
  resources: ProductionResource[];
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  addSystemMessage: (message: { type: 'success' | 'warning' | 'info' | 'error'; title: string; content: string; category: 'import' | 'exception' | 'system' }) => void;
  importStatus: Record<string, { fileName: string; time: string; error?: string }>;
  updateImportStatus: (type: string, fileName: string, error?: string) => void;
  clearImportStatus: (type: string) => void;
  roundPrecise: (num: number, decimals: number) => number;
}

export function ProductionReporting({
  jobReports,
  setJobReports,
  resources,
  addNotification,
  addSystemMessage,
  importStatus,
  updateImportStatus,
  clearImportStatus,
  roundPrecise
}: ProductionReportingProps) {
  const { t } = useTranslation();
  const [showJobReportsList, setShowJobReportsList] = useState<boolean>(false);
  const [isImportingJobReports, setIsImportingJobReports] = useState(false);
  const [isConfirmingClearJobReports, setIsConfirmingClearJobReports] = useState(false);

  return (
    <div className="space-y-6 max-w-[98%] mx-auto">
      <div className="glass-card p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ClipboardCheck size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{t('jr.title')}</h3>
              <p className="text-sm text-slate-500">{t('jr.records_count', { count: jobReports.length })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Clear Action */}
            <button 
              onClick={() => {
                if (isConfirmingClearJobReports) {
                  setJobReports([]);
                  clearImportStatus('job-report');
                  setShowJobReportsList(false);
                  setIsConfirmingClearJobReports(false);
                } else {
                  setIsConfirmingClearJobReports(true);
                  setTimeout(() => setIsConfirmingClearJobReports(false), 3000);
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all border text-sm",
                isConfirmingClearJobReports 
                  ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100 animate-pulse" 
                  : "bg-white text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-100 hover:bg-red-50"
              )}
            >
              <Trash2 size={16} />
              <span>{isConfirmingClearJobReports ? t('jr.clear_confirm') : t('jr.clear')}</span>
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            {/* Data Management Group */}
            <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
              <button
                onClick={() => setShowJobReportsList(!showJobReportsList)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all font-medium text-sm",
                  showJobReportsList ? "text-slate-600 hover:bg-white hover:text-indigo-600" : "bg-indigo-100 text-indigo-700"
                )}
                title={showJobReportsList ? t('jr.hide_hint') : t('jr.show_hint')}
              >
                <LayoutGrid size={14} />
                <span>{showJobReportsList ? t('jr.hide') : t('jr.show')}</span>
              </button>
              <div className="w-px h-4 bg-slate-300 mx-1" />
              <button 
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.csv,.xlsx,.xls';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;

                    setIsImportingJobReports(true);
                    const reader = new FileReader();
                    reader.readAsArrayBuffer(file);
                    reader.onload = (event) => {
                      setTimeout(() => {
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
                            addNotification('error', t('jr.error_empty'));
                            setIsImportingJobReports(false);
                            return;
                          }

                          const targetHeaders = ['工单工序号', '报工时间', '物料编码', '工序号', '工序描述', '合格数量', 'DMR让步接收数量', '资源组ID', '标准工时'];
                          let headerRowIndex = -1;
                          
                          for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                            const row = rawRows[i];
                            if (!row) continue;
                            const matchCount = targetHeaders.filter(h => row.some(cell => String(cell).trim() === h)).length;
                            if (matchCount === targetHeaders.length) {
                              headerRowIndex = i;
                              break;
                            }
                          }

                          if (headerRowIndex === -1) {
                            addNotification('error', t('jr.error_header'));
                            setIsImportingJobReports(false);
                            return;
                          }

                          const headerRow = rawRows[headerRowIndex];
                          const missingHeaders = targetHeaders.filter(h => !headerRow.some(cell => String(cell).trim() === h));
                          
                          if (missingHeaders.length > 0) {
                            addNotification('error', `验证失败，缺少必要表头：${missingHeaders.join('、')}。`);
                            setIsImportingJobReports(false);
                            return;
                          }

                          const getColIndex = (name: string) => headerRow.findIndex(cell => String(cell).trim() === name);
                          const colMapping = {
                            workOrderOpNo: getColIndex('工单工序号'),
                            reportTime: getColIndex('报工时间'),
                            componentCode: getColIndex('物料编码'),
                            opNo: getColIndex('工序号'),
                            opDesc: getColIndex('工序描述'),
                            qualifiedQty: getColIndex('合格数量'),
                            dmrConcessionQty: getColIndex('DMR让步接收数量'),
                            resourceGroupId: getColIndex('资源组ID'),
                            standardHour: getColIndex('标准工时')
                          };

                          const formatReportDateTime = (val: any) => {
                            if (!val) return '';
                            let date: Date;
                            const isExcelNumber = typeof val === 'number';
                            if (isExcelNumber) {
                              date = new Date(Math.round((val - 25569) * 86400 * 1000));
                            } else {
                              date = new Date(String(val).trim());
                            }
                            
                            if (isNaN(date.getTime())) return String(val);
                            
                            const Y = isExcelNumber ? date.getUTCFullYear() : date.getFullYear();
                            const M = String((isExcelNumber ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0');
                            const D = String(isExcelNumber ? date.getUTCDate() : date.getDate()).padStart(2, '0');
                            const h = String(isExcelNumber ? date.getUTCHours() : date.getHours()).padStart(2, '0');
                            const m = String(isExcelNumber ? date.getUTCMinutes() : date.getMinutes()).padStart(2, '0');
                            const s = String(isExcelNumber ? date.getUTCSeconds() : date.getSeconds()).padStart(2, '0');
                            return `${Y}/${M}/${D} ${h}:${m}:${s}`;
                          };

                          const newReports: JobReport[] = [];
                          const dataRows = rawRows.slice(headerRowIndex + 1);
                          const CHUNK_SIZE = 500;
                          let processedCount = 0;

                          const processChunk = () => {
                            const chunk = dataRows.slice(processedCount, processedCount + CHUNK_SIZE);
                            if (chunk.length === 0) {
                              setJobReports(newReports);
                              addNotification('success', t('jr.import_success', { count: newReports.length }));
                              updateImportStatus('job-report', file.name);
                              addSystemMessage({
                                type: 'success',
                                title: t('jr.import_result_title'),
                                content: t('jr.import_result_msg', { count: newReports.length }),
                                category: 'import'
                              });
                              setIsImportingJobReports(false);
                              return;
                            }

                            const formattedChunk = chunk.filter(r => r && r[colMapping.workOrderOpNo]).map((row) => {
                              const rawRowObj: any = {};
                              headerRow.forEach((header, index) => {
                                if (header !== undefined && header !== null) {
                                  rawRowObj[String(header)] = row[index];
                                }
                              });

                              return {
                                id: Math.random().toString(36).substr(2, 9),
                                workOrderOpNo: String(row[colMapping.workOrderOpNo] || ''),
                                reportTime: formatReportDateTime(row[colMapping.reportTime]),
                                componentCode: String(row[colMapping.componentCode] || ''),
                                opNo: String(row[colMapping.opNo] || ''),
                                opDesc: String(row[colMapping.opDesc] || ''),
                                qualifiedQty: parseFloat(row[colMapping.qualifiedQty]) || 0,
                                dmrConcessionQty: parseFloat(row[colMapping.dmrConcessionQty]) || 0,
                                resourceGroupId: String(row[colMapping.resourceGroupId] || ''),
                                standardHour: parseFloat(row[colMapping.standardHour]) || 0,
                                rawRow: rawRowObj
                              };
                            });

                            newReports.push(...formattedChunk);
                            processedCount += chunk.length;
                            requestAnimationFrame(processChunk);
                          };

                          processChunk();
                        } catch (err) {
                          addNotification('error', t('jr.import_failed'));
                          setIsImportingJobReports(false);
                        }
                      }, 50);
                    };
                  };
                  input.click();
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm"
              >
                <Upload size={14} />
                <span>{t('jr.import')}</span>
              </button>
              <div className="w-px h-4 bg-slate-300 mx-1" />
              <button 
                onClick={async () => {
                  if (jobReports.length === 0) {
                    addNotification('error', t('jr.error_no_export_data'));
                    return;
                  }
                  
                  const workbook = new ExcelJS.Workbook();
                  const worksheet = workbook.addWorksheet(t('jr.sheet_name'));
                  worksheet.properties.defaultRowHeight = 20;

                  const exportData = jobReports.map(item => {
                    let dateStr = '-';
                    if (item.reportTime && item.reportTime.includes('/') && item.reportTime.includes(' ')) {
                      const datePart = item.reportTime.split(' ')[0];
                      const parts = datePart.split('/');
                      if (parts.length >= 3) {
                        dateStr = `${parts[1]}/${parts[2]}`;
                      }
                    } else if (item.reportTime) {
                      const date = parseLocalDate(item.reportTime);
                      if (!isNaN(date.getTime())) {
                        const M = String(date.getMonth() + 1).padStart(2, '0');
                        const D = String(date.getDate()).padStart(2, '0');
                        dateStr = `${M}/${D}`;
                      }
                    }
                    
                    const team = resources.find(r => (r.id || '').toLowerCase() === (item.resourceGroupId || '').toLowerCase())?.team || '-';
                    
                    const totalQty = (item.qualifiedQty || 0) + (item.dmrConcessionQty || 0);
                    const actualHours = roundPrecise((totalQty * (item.standardHour || 0)) / 60, 4);
                    
                    const calculated = {
                      '日期': dateStr,
                      '班组': team,
                      '实际报工工时（小时）': actualHours
                    };

                    const base = item.rawRow ? { ...item.rawRow } : {
                      '工单工序号': item.workOrderOpNo,
                      '报工时间': item.reportTime,
                      '物料编码': item.componentCode,
                      '工序号': item.opNo,
                      '工序描述': item.opDesc,
                      '合格数量': item.qualifiedQty,
                      'DMR让步接收数量': item.dmrConcessionQty,
                      '资源组ID': item.resourceGroupId,
                      '标准工时': item.standardHour
                    };

                    return { ...calculated, ...base };
                  });

                  const headers = Object.keys(exportData[0]);
                  const headerRow = worksheet.addRow(headers);
                  headerRow.height = 20;
                  worksheet.columns = headers.map(() => ({ width: 12 }));

                  exportData.forEach(data => {
                    worksheet.addRow(Object.values(data));
                  });

                  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
                    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                      if (rowNumber === 1) cell.font = { bold: true };
                      cell.alignment = { vertical: 'middle', horizontal: 'left' };
                      cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                      };
                      
                      if (colNumber <= 3) {
                        cell.fill = {
                          type: 'pattern',
                          pattern: 'solid',
                          fgColor: { argb: 'DDEBF7' }
                        };
                      }
                    });
                  });

                  worksheet.autoFilter = {
                    from: { row: 1, column: 1 },
                    to: { row: 1, column: headers.length }
                  };

                  const buffer = await workbook.xlsx.writeBuffer();
                  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                  const url = window.URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = `${t('jr.filename')}_${getLocalDateString()}.xlsx`;
                  anchor.click();
                  window.URL.revokeObjectURL(url);
                  
                  addNotification('success', t('jr.export_success'));
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-indigo-600 hover:bg-white rounded-lg transition-all font-bold text-sm"
              >
                <FileText size={14} />
                <span>{t('jr.export_result')}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="border border-slate-200 rounded-2xl shadow-sm bg-white overflow-hidden relative">
          {isImportingJobReports && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-slate-600 font-medium">{t('jr.importing')}</p>
            </div>
          )}
          
          {!showJobReportsList ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <LayoutGrid size={48} className="mb-4 opacity-20" />
              <p>{t('jr.list_hidden')}</p>
              <p className="text-sm mt-2">{t('jr.records_count', { count: jobReports.length })}</p>
              <button 
                onClick={() => setShowJobReportsList(true)}
                className="mt-6 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
              >
                {t('jr.show')}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <div className="w-fit">
                {/* Header */}
                <div className="flex bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                  <div className="w-[180px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('pd.work_order_op_no')}</div>
                  <div className="w-[180px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('jr.report_time')}</div>
                  <div className="w-[160px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('jr.component_code')}</div>
                  <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('jr.op_code')}</div>
                  <div className="w-[200px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('pd.op_name')}</div>
                  <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">{t('jr.report_qty')}</div>
                  <div className="w-[150px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">{t('jr.dmr_concession')}</div>
                  <div className="w-[150px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('res.group_id')}</div>
                  <div className="w-[120px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">{t('jr.standard_hours')}</div>
                  <div className="w-[15px] shrink-0 bg-slate-50"></div>
                </div>

                <FixedSizeList
                  height={600}
                  itemCount={jobReports.length}
                  itemSize={48}
                  width={1355}
                  className="custom-scrollbar"
                >
                  {({ index, style }) => {
                    const item = jobReports[index];
                    return (
                      <div style={style} className="flex border-b border-slate-100 group hover:bg-indigo-50/10 transition-colors text-sm">
                        <div className="w-[180px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.workOrderOpNo}
                        </div>
                        <div className="w-[180px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.reportTime}
                        </div>
                        <div className="w-[160px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.componentCode}
                        </div>
                        <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.opNo}
                        </div>
                        <div className="w-[200px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.opDesc}
                        </div>
                        <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right">
                          {item.qualifiedQty}
                        </div>
                        <div className="w-[150px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right">
                          {item.dmrConcessionQty}
                        </div>
                        <div className="w-[150px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.resourceGroupId}
                        </div>
                        <div className="w-[120px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right">
                          {item.standardHour}
                        </div>
                      </div>
                    );
                  }}
                </FixedSizeList>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
