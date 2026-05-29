import React, { useState, useRef } from 'react';
import { PackageSearch, Trash2, LayoutGrid, Upload, FileText, AlertCircle, X, Download } from 'lucide-react';
import { FixedSizeList } from 'react-window';
import { useTranslation } from 'react-i18next';
import { cn, parseExcelDate, parseLocalDate, getLocalDateString, DEFAULT_BUFFER_DELIVERY_OFFSETS } from '../utils';
import { UnissuedMaterial, SystemSettings } from '../types';
import { toast } from 'sonner';
import * as XLSX from 'xlsx-js-style';
import Papa from 'papaparse';

interface UnissuedMaterialsProps {
  persistedData: UnissuedMaterial[];
  settings?: SystemSettings;
  onDataChange: (data: UnissuedMaterial[]) => void;
  persistedShowList: boolean;
  onShowListChange: (show: boolean) => void;
}

export default function UnissuedMaterials({
  persistedData,
  settings,
  onDataChange,
  persistedShowList,
  onShowListChange
}: UnissuedMaterialsProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const REQUIRED_FIELDS = [
    '成品编码', '成品描述', '物料编码', '物料描述', '单位用量',
    '总数量', '需求日期', '工单数量', '工单号', '仓库',
    '需求数量', '有效库存数', '工单备注', '未发料数量',
    '库存分配', '满足数量', '待申购状态'
  ];

  const FIELD_MAP: Record<string, keyof UnissuedMaterial> = {
    '成品编码': 'productCode',
    '成品描述': 'productDesc',
    '物料编码': 'partCode',
    '物料描述': 'partDesc',
    '单位用量': 'unitUsage',
    '总数量': 'totalQty',
    '需求日期': 'requiredDate',
    '工单数量': 'woQty',
    '工单号': 'workOrderNo',
    '仓库': 'warehouse',
    '需求数量': 'requiredQty',
    '有效库存数': 'effectiveStock',
    '工单备注': 'woRemark',
    '未发料数量': 'unissuedQty',
    '库存分配': 'stockAllocation',
    '满足数量': 'satisfiedQty',
    '待申购状态': 'purchaseStatus'
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const processData = (rawData: any[]) => {
    if (rawData.length === 0) {
      setImportError('文件内容为空');
      return;
    }

    const headers = Object.keys(rawData[0]);
    const missingFields = REQUIRED_FIELDS.filter(field => !headers.includes(field));

    if (missingFields.length > 0) {
      setImportError(`文件缺少以下必要列: ${missingFields.join(', ')}`);
      return;
    }

    const processedData: UnissuedMaterial[] = [];
    
    rawData.forEach((row, index) => {
      // 过滤规则
      if (row['工单号']?.startsWith('U')) return;
      const partCode = row['物料编码'] || '';
      let isValidPrefix = /^[CMHGQE]/.test(partCode) || partCode.startsWith('DM');
      if (isValidPrefix && /^M[a-zA-Z]/.test(partCode)) {
          isValidPrefix = false;
      }
      if (!isValidPrefix) return;

      // 属性判定
      let property = '';
      if (partCode.startsWith('DM')) {
          property = partCode.slice(2, 5).toUpperCase();
      } else if (partCode.startsWith('C')) {
          property = '化学品';
      } else if (partCode.startsWith('M')) {
          property = row['成品描述']?.includes('机') ? '机加原材料' : '钣金原材料';
      } else if (/^[HGQE]/.test(partCode)) {
          property = '五金件';
      }

      // 需求月份
      let requiredMonth = '';
      const reqDateStrForMonth = parseExcelDate(row['需求日期']);
      if (reqDateStrForMonth) {
          const [year, month] = reqDateStrForMonth.split('-');
          requiredMonth = `${year}/${month}`;
      }

      // 在途交期计算
      let transitDelivery = row['库存分配'] || '';
      let hasTransitDate = false;
      const dateMatch = transitDelivery.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g);
      if (dateMatch) {
          transitDelivery = dateMatch.map(d => d.replace(/-/g, '/')).sort((a,b) => new Date(b).getTime() - new Date(a).getTime())[0];
          hasTransitDate = true;
      }

      // 缓冲交期计算
      let bufferDelivery = '';
      if (transitDelivery && (hasTransitDate || /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(transitDelivery))) {
          const cleanDateStr = transitDelivery.replace(/\//g, '-');
          const parsed = parseLocalDate(cleanDateStr);
          if (parsed && !isNaN(parsed.getTime())) {
              const offsets = settings?.bufferDeliveryOffsets || DEFAULT_BUFFER_DELIVERY_OFFSETS;
              const daysToAdd = offsets[property] !== undefined ? offsets[property] : 15;
              const d = new Date(parsed);
              d.setDate(d.getDate() + daysToAdd);
              bufferDelivery = getLocalDateString(d).replace(/-/g, '/');
          }
      }

      // 满足情况判定
      let satisfactionStatus = '';
      if (!row['库存分配'] || row['库存分配'].toString().trim() === '') {
          satisfactionStatus = '其他';
      } else if (['满足', '待进料检验'].includes(row['库存分配'])) {
          satisfactionStatus = '满足';
      } else if (row['库存分配'] === '待申购') {
          satisfactionStatus = '待申购';
      } else if (bufferDelivery && row['需求日期']) {
          const reqDateStr = parseExcelDate(row['需求日期']);
          const buffDateStr = bufferDelivery.replace(/\//g, '-');
          
          if (buffDateStr && reqDateStr) {
              // String comparison works for YYYY-MM-DD formats
              satisfactionStatus = buffDateStr <= reqDateStr ? '在途交期满足' : '在途交期不满足';
          }
      }

      // 欠料数量
      const unissuedQtyTotal = parseFloat(row['未发料数量']) || 0;
      let shortageQty = 0;
      
      if (satisfactionStatus === '满足') {
          shortageQty = 0;
      } else {
          shortageQty = unissuedQtyTotal;
      }

      const item: any = { 
        id: `imported-${Date.now()}-${index}`,
        requiredMonth, property, transitDelivery, bufferDelivery, satisfactionStatus, shortageQty,
        raw: row
      };
      
      for (const [chinese, key] of Object.entries(FIELD_MAP)) {
        let value = row[chinese];
        if (['totalQty', 'woQty', 'requiredQty', 'effectiveStock', 'unissuedQty', 'satisfiedQty'].includes(key)) {
          value = parseFloat(value) || 0;
        } else if (key === 'requiredDate') {
          value = parseExcelDate(value);
        } else if (value === undefined || value === null) {
          value = '';
        }
        item[key] = value;
      }
      processedData.push(item as UnissuedMaterial);
    });

    setData(processedData);
    setImportError(null);
    toast.success(`成功导入 ${processedData.length} 条数据`);
  };

  const data = persistedData;
  const setData = onDataChange;
  const showList = persistedShowList;
  const setShowList = onShowListChange;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setImportError(null);

    const reader = new FileReader();

    if (file.name.endsWith('.csv')) {
      reader.onload = (event) => {
        const csvData = event.target?.result as string;
        Papa.parse(csvData, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            processData(results.data);
            setIsProcessing(false);
          },
          error: (error) => {
            setImportError(`解析CSV失败: ${error.message}`);
            setIsProcessing(false);
          }
        });
      };
      reader.readAsText(file, 'GBK'); // Handle potential GBK encoding for Chinese characters
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.onload = (event) => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        processData(jsonData);
        setIsProcessing(false);
      };
      reader.readAsArrayBuffer(file);
    } else {
      setImportError('仅支持 CSV 或 Excel (.xlsx, .xls) 文件');
      setIsProcessing(false);
    }
    
    e.target.value = ''; // Reset input
  };

  const handleExport = () => {
    if (data.length === 0) {
      toast.error('没有数据可导出');
      return;
    }

    // 获取所有原始数据的表头（去重）
    const allOriginalHeaders = Array.from(new Set(
      data.reduce((acc: string[], item) => {
        if (item.raw) acc.push(...Object.keys(item.raw));
        return acc;
      }, [])
    ));

    const toDateObject = (str: any) => {
      if (!str) return str;
      
      let date: Date;
      if (str instanceof Date) {
        date = new Date(str.getTime());
      } else if (typeof str === 'string') {
        // 匹配 YYYY/MM/DD 或 YYYY-MM-DD，忽略后续可能存在的时间字符串
        const match = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (!match) return str;
        date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      } else {
        return str;
      }

      if (isNaN(date.getTime())) return str;

      // 强制设置为午夜，确保 Excel 筛选器按年/月/日分级
      date.setHours(0, 0, 0, 0);
      return date;
    };

    const exportData = data.map(item => {
      // 1. 首先放置计算结果列
      const exportItem: any = {
        '需求月份': item.requiredMonth,
        '属性': item.property,
        '在途交期': toDateObject(item.transitDelivery),
        '缓冲交期': toDateObject(item.bufferDelivery),
        '满足情况': item.satisfactionStatus,
        '欠料数量': item.shortageQty,
      };
      
      // 2. 然后放置所有原始数据列
      if (item.raw) {
        allOriginalHeaders.forEach(header => {
          // 如果原始列中包含与计算结果同名的列，则跳过，避免覆盖计算出的核心数据
          if (!(header in exportItem)) {
            // 对原始数据也尝试进行日期转换，确保原始日期列也能在Excel中被识别
            exportItem[header] = toDateObject(item.raw?.[header]);
          }
        });
      }

      return exportItem;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // 样式设置
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    const borderStyle = { 
        top: { style: 'thin' }, bottom: { style: 'thin' }, 
        left: { style: 'thin' }, right: { style: 'thin' } 
    };
    
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            let address = XLSX.utils.encode_cell({c: C, r: R});
            if (!worksheet[address]) {
                worksheet[address] = { t: 's', v: '' };
            }
            
            const cell = worksheet[address];

            // 自动识别日期类型并设置格式
            if (cell.t === 'd' || cell.v instanceof Date) {
                cell.z = 'yyyy/mm/dd';
            }
            
            cell.s = {
                border: borderStyle,
                alignment: { 
                    vertical: "center", 
                    horizontal: R === 0 ? "center" : "left" 
                },
                font: { 
                    name: "宋体",
                    bold: R === 0 
                }
            };

            // Calculated columns (indices 0-5) get shallow blue background (#F0F7FF)
            if (C <= 5) {
                worksheet[address].s.fill = { fgColor: { rgb: "F0F7FF" } };
            }
        }
    }
    
    worksheet['!autofilter'] = { ref: worksheet['!ref'] };
    // 行高设置
    worksheet['!rows'] = Array.from({ length: range.e.r + 1 }, () => ({ hpx: 18 }));
    
    // 设置列宽 (wch: 12)
    worksheet['!cols'] = Array.from({ length: range.e.c + 1 }, () => ({ wch: 12 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "未发料解析");
    
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `未发料-解析_${today}.xlsx`);
    toast.success('数据已导出');
  };

  const handleClear = () => {
    if (isConfirmingClear) {
      setIsConfirmingClear(false);
      setData([]);
      toast.success('数据已清空');
    } else {
      setIsConfirmingClear(true);
      setTimeout(() => setIsConfirmingClear(false), 3000);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="glass-card p-4 sm:p-8">
        {/* Error Message */}
        {importError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-red-800">{t('common.hint')}</h4>
              <p className="text-sm text-red-700 mt-1">{importError}</p>
            </div>
            <button 
              onClick={() => setImportError(null)}
              className="text-red-400 hover:text-red-600 transition-colors p-1"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Header Section with Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <PackageSearch size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{t('unissued.title')}</h3>
              <p className="text-sm text-slate-500">{t('common.records_count', { count: data.length })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleClear}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all border text-sm cursor-pointer",
                isConfirmingClear 
                  ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100 animate-pulse" 
                  : "bg-white text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-100 hover:bg-red-50"
              )}
            >
              <Trash2 size={16} />
              <span>{isConfirmingClear ? t('common.clear_confirm') : t('common.clear')}</span>
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
              <button
                onClick={() => setShowList(!showList)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all font-medium text-sm cursor-pointer",
                  showList ? "text-slate-600 hover:bg-white hover:text-indigo-600" : "bg-indigo-100 text-indigo-700"
                )}
                title={showList ? t('unissued.hide_hint') : t('unissued.show_hint')}
              >
                <LayoutGrid size={14} />
                <span>{showList ? t('common.hide') : t('common.show')}</span>
              </button>
              <div className="w-px h-4 bg-slate-300 mx-1" />
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept=".csv, .xlsx, .xls"
                onChange={handleFileChange}
              />
              <button 
                onClick={handleImportClick}
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm cursor-pointer"
              >
                <Upload size={14} />
                <span>{t('common.import')}</span>
              </button>
              <div className="w-px h-4 bg-slate-300 mx-1" />
              <button 
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-1.5 text-indigo-600 hover:bg-white rounded-lg transition-all font-bold text-sm cursor-pointer"
              >
                <FileText size={14} />
                <span>{t('common.export_result')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Data Container */}
        <div className="border border-slate-200 rounded-2xl shadow-sm bg-white overflow-hidden relative">
          {isProcessing && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-indigo-100/10 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-slate-600 font-medium">{t('common.importing')}</p>
            </div>
          )}
          
          {!showList ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <LayoutGrid size={48} className="mb-4 opacity-20" />
              <p>{t('common.list_hidden')}</p>
              <p className="text-sm mt-2">{t('common.records_count', { count: data.length })}</p>
              <button 
                onClick={() => setShowList(true)}
                className="mt-6 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium cursor-pointer"
              >
                {t('common.show')}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <div className="w-fit">
                {/* Headers */}
                <div className="flex bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                  <div className="w-[140px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('unissued.columns.product_code')}</div>
                  <div className="w-[200px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('unissued.columns.product_desc')}</div>
                  <div className="w-[140px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('unissued.columns.part_code')}</div>
                  <div className="w-[200px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('unissued.columns.part_desc')}</div>
                  <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">{t('unissued.columns.unit_usage')}</div>
                  <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">{t('unissued.columns.total_qty')}</div>
                  <div className="w-[120px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('unissued.columns.required_date')}</div>
                  <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">{t('unissued.columns.wo_qty')}</div>
                  <div className="w-[120px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('unissued.columns.work_order')}</div>
                  <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('unissued.columns.warehouse')}</div>
                  <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">{t('unissued.columns.required_qty')}</div>
                  <div className="w-[120px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">{t('unissued.columns.effective_stock')}</div>
                  <div className="w-[150px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('unissued.columns.wo_remark')}</div>
                  <div className="w-[120px] shrink-0 py-4 px-4 font-bold text-indigo-600 border-r border-slate-200 text-right">{t('unissued.columns.unissued_qty')}</div>
                  <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('unissued.columns.stock_allocation')}</div>
                  <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">{t('unissued.columns.satisfied_qty')}</div>
                  <div className="w-[120px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">{t('unissued.columns.purchase_status')}</div>
                  <div className="w-[15px] shrink-0 bg-slate-50"></div>
                </div>

                <FixedSizeList
                  height={600}
                  itemCount={data.length}
                  itemSize={48}
                  width={2145}
                  style={{ overflowX: 'hidden' }}
                  className="custom-scrollbar"
                >
                  {({ index, style }) => {
                    const item = data[index];
                    return (
                      <div style={style} className="flex border-b border-slate-100 group hover:bg-indigo-50 transition-colors text-sm">
                        <div className="w-[140px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">{item.productCode}</div>
                        <div className="w-[200px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">{item.productDesc}</div>
                        <div className="w-[140px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">{item.partCode}</div>
                        <div className="w-[200px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">{item.partDesc}</div>
                        <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right">{item.unitUsage}</div>
                        <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right">{item.totalQty}</div>
                        <div className="w-[120px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">{item.requiredDate}</div>
                        <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right">{item.woQty}</div>
                        <div className="w-[120px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">{item.workOrderNo}</div>
                        <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">{item.warehouse}</div>
                        <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right">{item.requiredQty}</div>
                        <div className="w-[120px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right">{item.effectiveStock}</div>
                        <div className="w-[150px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">{item.woRemark}</div>
                        <div className="w-[120px] shrink-0 px-4 py-3 border-r border-slate-100 text-indigo-600 font-bold text-right">{item.unissuedQty}</div>
                        <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">{item.stockAllocation}</div>
                        <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right">{item.satisfiedQty}</div>
                        <div className="w-[120px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">{item.purchaseStatus}</div>
                        <div className="w-[15px] shrink-0"></div>
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
