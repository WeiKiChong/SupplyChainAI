import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { FixedSizeList } from 'react-window';
import { 
  ChartNoAxesGantt, 
  Trash2, 
  LayoutGrid, 
  Upload, 
  FileText 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, getLocalDateString, parseLocalDate } from '../utils';
import { ProductionDemand, AnalysisResult } from '../types';

interface ProductionScheduleProps {
  demands: ProductionDemand[];
  setDemands: (demands: ProductionDemand[]) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  addSystemMessage: (message: { type: 'success' | 'warning' | 'info' | 'error'; title: string; content: string; category: 'import' | 'exception' | 'system' }) => void;
  importStatus: Record<string, { fileName: string; time: string; error?: string }>;
  updateImportStatus: (type: string, fileName: string, error?: string) => void;
  clearImportStatus: (type: string) => void;
  analysisResult: AnalysisResult;
  roundPrecise: (num: number, decimals: number) => number;
}

export function ProductionSchedule({
  demands,
  setDemands,
  addNotification,
  addSystemMessage,
  importStatus,
  updateImportStatus,
  clearImportStatus,
  analysisResult,
  roundPrecise
}: ProductionScheduleProps) {
  const { t } = useTranslation();
  const [showDemandsList, setShowDemandsList] = useState<boolean>(false);
  const [isImportingDemands, setIsImportingDemands] = useState(false);
  const [isConfirmingClearDemands, setIsConfirmingClearDemands] = useState(false);

  return (
    <div className="space-y-6 max-w-[98%] mx-auto">
      <div className="glass-card p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ChartNoAxesGantt size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{t('pd.title')}</h3>
              <p className="text-sm text-slate-500">{t('pd.records_count', { count: demands.length })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Clear Action */}
            <button 
              onClick={() => {
                if (isConfirmingClearDemands) {
                  setDemands([]);
                  clearImportStatus('demand');
                  setIsConfirmingClearDemands(false);
                } else {
                  setIsConfirmingClearDemands(true);
                  setTimeout(() => setIsConfirmingClearDemands(false), 3000);
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all border text-sm",
                isConfirmingClearDemands 
                  ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100 animate-pulse" 
                  : "bg-white text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-100 hover:bg-red-50"
              )}
            >
              <Trash2 size={16} />
              <span>{isConfirmingClearDemands ? t('pd.clear_confirm') : t('pd.clear')}</span>
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            {/* Data Management Group */}
            <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
              <button
                onClick={() => setShowDemandsList(!showDemandsList)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all font-medium text-sm",
                  showDemandsList ? "text-slate-600 hover:bg-white hover:text-indigo-600" : "bg-indigo-100 text-indigo-700"
                )}
                title={showDemandsList ? t('pd.hide_hint') : t('pd.show_hint')}
              >
                <LayoutGrid size={14} />
                <span>{showDemandsList ? t('pd.hide') : t('pd.show')}</span>
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

                    setIsImportingDemands(true);
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
                          addNotification('error', t('pd.error_empty'));
                          setIsImportingDemands(false);
                          return;
                        }

                        const targetHeaders = ['工单号', '工单阶层号', '工单工序号', '组件物料编码', '料号', '工序代码', '工序描述', '资源组ID', '交货日期', '需求数量', '完成数量', '工序完成', '不合格数量', '实际工时', '是否符合开工条件', '欠料信息'];
                        let headerIndex = -1;
                        
                        for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                          const row = rawRows[i];
                          if (!row) continue;
                          const matchCount = targetHeaders.filter(h => row.some(cell => String(cell).trim() === h)).length;
                          if (matchCount === targetHeaders.length) {
                            headerIndex = i;
                            break;
                          }
                        }

                        if (headerIndex === -1) {
                          addNotification('error', t('pd.error_header'));
                          setIsImportingDemands(false);
                          return;
                        }

                        const headerRow = rawRows[headerIndex];
                        const missingHeaders = targetHeaders.filter(h => !headerRow.some(cell => String(cell).trim() === h));
                        
                        if (missingHeaders.length > 0) {
                          addNotification('error', `验证失败，缺少必要表头：${missingHeaders.join('、')}。`);
                          setIsImportingDemands(false);
                          return;
                        }

                        const getColIndex = (name: string) => headerRow.findIndex(cell => String(cell).trim() === name);

                        const colMap = {
                          orderNo: getColIndex('工单号'),
                          orderLevelNo: getColIndex('工单阶层号'),
                          workOrderOpNo: getColIndex('工单工序号'),
                          componentCode: getColIndex('组件物料编码'),
                          componentDesc: getColIndex('组件描述'),
                          partNumber: getColIndex('料号'),
                          opNo: getColIndex('工序号'),
                          opCode: getColIndex('工序代码'),
                          opDesc: getColIndex('工序描述'),
                          resourceGroupId: getColIndex('资源组ID'),
                          resourceGroupDesc: getColIndex('资源组描述'),
                          dueDate: getColIndex('交货日期'),
                          requiredQty: getColIndex('需求数量'),
                          completedQty: getColIndex('完成数量'),
                          actualHours: getColIndex('实际工时'),
                          rejectedQty: getColIndex('不合格数量'),
                          isCompleted: getColIndex('工序完成'),
                          isStartConditionMet: getColIndex('是否符合开工条件'),
                          shortageDetails: getColIndex('欠料信息')
                        };

                        const dataRows = rawRows.slice(headerIndex + 1);
                        const validRows = dataRows.filter(row => row && row.length > 0 && row[0] !== undefined && String(row[0]).trim() !== '');
                        
                        const formatExcelDate = (val: any) => {
                          if (!val) return '';
                          if (typeof val === 'number') {
                            const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                            if (isNaN(date.getTime())) return '';
                            const Y = date.getUTCFullYear();
                            const M = String(date.getUTCMonth() + 1).padStart(2, '0');
                            const D = String(date.getUTCDate()).padStart(2, '0');
                            return `${Y}-${M}-${D}`;
                          }
                          return String(val).trim();
                        };

                        const chunkSize = 5000;
                        let processedCount = 0;
                        const allFormattedData: any[] = [];

                        const processChunk = () => {
                          const chunk = validRows.slice(processedCount, processedCount + chunkSize);
                          if (chunk.length === 0) {
                            setDemands(allFormattedData);
                            addNotification('success', t('pd.import_success', { count: allFormattedData.length }));
                            updateImportStatus('demand', file.name);
                            addSystemMessage({
                              type: 'success',
                              title: t('pd.import_result_title'),
                              content: t('pd.import_result_msg', { count: allFormattedData.length }),
                              category: 'import'
                            });
                            setIsImportingDemands(false);
                            return;
                          }

                          const formattedChunk = chunk.map((row, index) => {
                            const getValue = (colIdx: number) => colIdx !== -1 ? row[colIdx] : undefined;
                            
                            const rawRow: any = {};
                            headerRow.forEach((header, i) => {
                              if (header !== undefined && header !== null) {
                                rawRow[String(header)] = row[i];
                              }
                            });

                            const data = {
                              id: `dem-import-${Date.now()}-${processedCount + index}`,
                              orderNo: String(getValue(colMap.orderNo) ?? '').trim(),
                              orderLevelNo: String(getValue(colMap.orderLevelNo) ?? '').trim(),
                              workOrderOpNo: String(getValue(colMap.workOrderOpNo) ?? '').trim(),
                              componentCode: String(getValue(colMap.componentCode) ?? '').trim(),
                              componentDesc: String(getValue(colMap.componentDesc) ?? '').trim(),
                              partNumber: String(getValue(colMap.partNumber) ?? '').trim(),
                              opNo: String(getValue(colMap.opNo) ?? '').trim(),
                              opCode: String(getValue(colMap.opCode) ?? '').trim(),
                              opDesc: String(getValue(colMap.opDesc) ?? '').trim(),
                              resourceGroupId: String(getValue(colMap.resourceGroupId) ?? '').trim(),
                              resourceGroupDesc: String(getValue(colMap.resourceGroupDesc) ?? '').trim(),
                              dueDate: formatExcelDate(getValue(colMap.dueDate)),
                              requiredQty: parseFloat(getValue(colMap.requiredQty)) || 0,
                              completedQty: parseFloat(getValue(colMap.completedQty)) || 0,
                              rejectedQty: parseFloat(getValue(colMap.rejectedQty)) || 0,
                              actualHours: parseFloat(getValue(colMap.actualHours)) || 0,
                              isCompleted: String(getValue(colMap.isCompleted) ?? '').trim().toUpperCase() === 'TRUE',
                              isStartConditionMet: String(getValue(colMap.isStartConditionMet) ?? '').trim() === '' || String(getValue(colMap.isStartConditionMet) ?? '').trim() === '正常',
                              shortageDetails: String(getValue(colMap.shortageDetails) ?? '').trim(),
                              rawRow
                            };
                            return {
                              ...data,
                              original: { ...data }
                            };
                          });

                          allFormattedData.push(...formattedChunk);
                          processedCount += chunk.length;
                          requestAnimationFrame(processChunk);
                        };

                        processChunk();
                      } catch (err) {
                        console.error('Import failed:', err);
                        addNotification('error', t('pd.import_failed'));
                        setIsImportingDemands(false);
                      }
                    };
                    reader.readAsArrayBuffer(file);
                  };
                  input.click();
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm"
              >
                <Upload size={14} />
                <span>{t('pd.import')}</span>
              </button>
              <div className="w-px h-4 bg-slate-300 mx-1" />
              <button 
                onClick={async () => {
                  if (demands.length === 0) {
                    addNotification('error', t('pd.error_no_export_data'));
                    return;
                  }
                  
                  const exportData = analysisResult.scheduledDemands.map(item => {
                    const startDate = item.startDate ? new Date(item.startDate) : null;
                    const dueDate = item.dueDate ? parseLocalDate(item.dueDate) : null;
                    
                    const calculated = {
                      '交货月份': dueDate ? `${dueDate.getFullYear()}/${String(dueDate.getMonth() + 1).padStart(2, '0')}` : '-',
                      '开始生产日期': startDate ? getLocalDateString(startDate) : '-',
                      '开始生产月份': startDate ? `${startDate.getFullYear()}/${String(startDate.getMonth() + 1).padStart(2, '0')}` : '-',
                      '备注': item.isOverdue ? '逾期' : '正常',
                      '班组': item.team,
                      '工序周期': item.cycleDays || 0,
                      '未完成数量': Math.max(0, item.uncompletedQty),
                      '需求工时（H）': roundPrecise(item.demandHours, 2)
                    };

                    const base = item.rawRow ? { ...item.rawRow } : {
                      '工单号': item.orderNo,
                      '工单阶层号': item.orderLevelNo,
                      '组件物料编码': item.componentCode,
                      '料号': item.partNumber || '',
                      '工序号': item.opNo,
                      '工序代码': item.opCode,
                      '工序描述': item.opDesc,
                      '资源组ID': item.resourceGroupId,
                      '交货日期': item.dueDate,
                      '需求数量': item.requiredQty,
                      '完成数量': item.completedQty,
                      '不合格数量': item.rejectedQty || 0,
                      '实际工时': item.actualHours
                    };

                    return {
                      ...calculated,
                      ...base
                    };
                  });

                  const workbook = new ExcelJS.Workbook();
                  const worksheet = workbook.addWorksheet(t('pd.sheet_name'));
                  
                  if (exportData.length > 0) {
                    const headers = Object.keys(exportData[0]);
                    worksheet.properties.defaultRowHeight = 20;

                    const headerRow = worksheet.addRow(headers);
                    headerRow.height = 20;
                    headerRow.font = { bold: true };
                    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
                    
                    worksheet.autoFilter = {
                      from: { row: 1, column: 1 },
                      to: { row: 1, column: headers.length }
                    };

                    exportData.forEach(data => {
                      const newRow = worksheet.addRow(Object.values(data));
                      newRow.alignment = { vertical: 'middle', horizontal: 'left' };
                    });

                    worksheet.columns.forEach((col) => {
                      col.width = 12;
                    });

                    const CALCULATED_COLS_COUNT = 8;
                    const lightBlueFill = {
                      type: 'pattern' as const,
                      pattern: 'solid' as const,
                      fgColor: { argb: 'DDEBF7' }
                    };

                    worksheet.eachRow((row) => {
                      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        cell.border = {
                          top: { style: 'thin' },
                          left: { style: 'thin' },
                          bottom: { style: 'thin' },
                          right: { style: 'thin' }
                        };

                        if (colNumber <= CALCULATED_COLS_COUNT) {
                          cell.fill = lightBlueFill;
                        }
                      });
                    });
                  }

                  const buffer = await workbook.xlsx.writeBuffer();
                  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                  const url = window.URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = `${t('pd.filename')}_${getLocalDateString()}.xlsx`;
                  anchor.click();
                  window.URL.revokeObjectURL(url);
                  
                  addNotification('success', t('pd.export_success'));
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-indigo-600 hover:bg-white rounded-lg transition-all font-bold text-sm"
                title={t('pd.export_result_hint')}
              >
                <FileText size={14} />
                <span>{t('pd.export_result')}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="border border-slate-200 rounded-2xl shadow-sm bg-white overflow-hidden relative">
          {isImportingDemands && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-slate-600 font-medium">{t('pd.importing')}</p>
            </div>
          )}
          
          {!showDemandsList ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <LayoutGrid size={48} className="mb-4 opacity-20" />
              <p>{t('pd.list_hidden')}</p>
              <p className="text-sm mt-2">{t('pd.records_count', { count: demands.length })}</p>
              <button 
                onClick={() => setShowDemandsList(true)}
                className="mt-6 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
              >
                {t('pd.show')}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <div className="w-fit">
                {/* Header */}
                <div className="flex bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                  <div className="w-[140px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('pd.work_order')}</div>
                  <div className="w-[200px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('pd.component_code')}</div>
                  <div className="w-[150px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('pd.component_name')}</div>
                  <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('pd.work_order_op_no')}</div>
                  <div className="w-[150px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('pd.op_code')}</div>
                  <div className="w-[200px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('pd.op_name')}</div>
                  <div className="w-[150px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('res.group_id')}</div>
                  <div className="w-[140px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('pd.arrival_date')}</div>
                  <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">{t('pd.demand_qty')}</div>
                  <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">{t('jr.report_qty')}</div>
                  <div className="w-[120px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">{t('pd.actual_hours')}</div>
                  <div className="w-[15px] shrink-0 bg-slate-50"></div>
                </div>

                <FixedSizeList
                  height={600}
                  itemCount={demands.length}
                  itemSize={48}
                  width={1565}
                  className="custom-scrollbar"
                >
                  {({ index, style }) => {
                    const item = demands[index];
                    return (
                      <div style={style} className="flex border-b border-slate-100 group hover:bg-indigo-50/10 transition-colors text-sm">
                        <div className="w-[140px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.orderNo}
                        </div>
                        <div className="w-[200px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.componentCode}
                        </div>
                        <div className="w-[150px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.partNumber}
                        </div>
                        <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.opNo}
                        </div>
                        <div className="w-[150px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.opCode}
                        </div>
                        <div className="w-[200px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.opDesc}
                        </div>
                        <div className="w-[150px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.resourceGroupId}
                        </div>
                        <div className="w-[140px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                          {item.dueDate}
                        </div>
                        <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right truncate shadow-inner">
                          {item.requiredQty}
                        </div>
                        <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right truncate">
                          {item.completedQty}
                        </div>
                        <div className="w-[120px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right truncate">
                          {item.actualHours}
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
