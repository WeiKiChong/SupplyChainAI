import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  Package, TextQuote, AlertTriangle, CheckCircle2, Factory, 
  Truck, ArrowRight, Save, Filter, MoreHorizontal, Search, X
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { formatNumber, cn } from '../utils';
import { UnissuedMaterial } from '../types';

// Material Shortage Analysis component
interface MaterialShortageAnalysisProps {
  unissuedData: UnissuedMaterial[];
  filters: { year: string; month: string };
  onFilterChange: (filters: { year: string; month: string }) => void;
}

export default function MaterialShortageAnalysis({ 
  unissuedData, 
  filters, 
  onFilterChange 
}: MaterialShortageAnalysisProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const [selectedMaterial, setSelectedMaterial] = useState<{ code: string; desc: string } | null>(null);

  // Reset visible count when filters or search change
  React.useEffect(() => {
    setVisibleCount(8);
  }, [filters, searchTerm]);

  const demandList = useMemo(() => {
    if (!selectedMaterial) return [];
    
    return unissuedData.filter(item => {
      if (item.partCode !== selectedMaterial.code) return false;
      
      if (!item.requiredDate) return false;
      const [y, m] = item.requiredDate.split('-');
      if (filters.year !== 'all' && y !== filters.year) return false;
      if (filters.month !== 'all' && m !== filters.month) return false;
      
      return true;
    }).sort((a, b) => (a.requiredDate || '').localeCompare(b.requiredDate || ''));
  }, [unissuedData, selectedMaterial, filters]);

  // Extract available years/months from data
  const { availableYears, availableMonths } = useMemo(() => {
    const yearsSet = new Set<string>();
    unissuedData.forEach(item => {
      if (item.requiredDate && item.requiredDate.includes('-')) {
        const [y] = item.requiredDate.split('-');
        if (y) yearsSet.add(y);
      }
    });

    const years = Array.from(yearsSet).sort((a, b) => a.localeCompare(b));

    const monthsSet = new Set<string>();
    unissuedData.forEach(item => {
      if (item.requiredDate && item.requiredDate.includes('-')) {
        const [y, m] = item.requiredDate.split('-');
        // If year is "all", show all months available in data across all years
        // If a year is selected, only show months available for that specific year
        if (filters.year === 'all' || y === filters.year) {
          if (m) monthsSet.add(m);
        }
      }
    });

    const months = Array.from(monthsSet).sort((a, b) => a.localeCompare(b));

    return {
      availableYears: years,
      availableMonths: months
    };
  }, [unissuedData, filters.year]);

  const shortageChartData = useMemo(() => {
    const categories = ['满足', '在途交期满足', '在途交期不满足', '待申购'];
    const summary: Record<string, number> = {};
    categories.forEach(cat => summary[cat] = 0);

    unissuedData.forEach(item => {
      if (!item.requiredDate) return;
      const [y, m] = item.requiredDate.split('-');
      
      // Filter by selection
      if (filters.year !== 'all' && y !== filters.year) return;
      if (filters.month !== 'all' && m !== filters.month) return;

      const status = item.satisfactionStatus || '';
      if (status.includes('满足') && !status.includes('在途')) {
        summary['满足']++;
      } else if (status.includes('在途交期满足')) {
        summary['在途交期满足']++;
      } else if (status.includes('在途交期不满足')) {
        summary['在途交期不满足']++;
      } else {
        summary['待申购']++;
      }
    });

    const colors = {
      '满足': '#10b981',
      '在途交期满足': '#6366f1',
      '在途交期不满足': '#f59e0b',
      '待申购': '#ef4444'
    };

    const getTranslatedName = (cat: string) => {
      switch (cat) {
        case '满足': return t('material_analysis.status.satisfied');
        case '在途交期满足': return t('material_analysis.status.transit_ok');
        case '在途交期不满足': return t('material_analysis.status.transit_fail');
        case '待申购': return t('material_analysis.status.to_buy');
        default: return cat;
      }
    };

    return categories.map(cat => ({
      name: getTranslatedName(cat),
      originalName: cat,
      value: summary[cat],
      color: colors[cat as keyof typeof colors]
    }));
  }, [unissuedData, filters]);

  const metrics = useMemo(() => {
    let totalItems = 0;
    let shortageItems = 0;

    unissuedData.forEach(item => {
      if (!item.requiredDate) return;
      const [y, m] = item.requiredDate.split('-');
      if (filters.year !== 'all' && y !== filters.year) return;
      if (filters.month !== 'all' && m !== filters.month) return;

      totalItems++;
      const status = item.satisfactionStatus || '';
      // Shortage items are strictly '在途交期不满足' or '待申购'
      if (status.includes('在途交期不满足') || status.includes('待申购')) {
        shortageItems++;
      }
    });

    const rate = totalItems > 0 
      ? ((totalItems - shortageItems) / totalItems) * 100
      : 0;
    
    const satisfactionRate = rate.toFixed(1);

    // Color logic: < 80% red, 80-90% amber, > 90% emerald
    let color: 'red' | 'amber' | 'emerald' = 'emerald';
    if (rate < 80) color = 'red';
    else if (rate < 90) color = 'amber';

    return { totalItems, shortageItems, satisfactionRate, color };
  }, [unissuedData, filters]);

  const materialAggregation = useMemo(() => {
    const agg: Record<string, {
      partCode: string;
      partDesc: string;
      totalDemandItems: number;
      shortageItemCount: number;
      totalShortageQuantity: number;
    }> = {};

    unissuedData.forEach(item => {
      if (!item.requiredDate) return;
      const [y, m] = item.requiredDate.split('-');
      if (filters.year !== 'all' && y !== filters.year) return;
      if (filters.month !== 'all' && m !== filters.month) return;

      const code = item.partCode;
      if (!agg[code]) {
        agg[code] = {
          partCode: code,
          partDesc: item.partDesc,
          totalDemandItems: 0,
          shortageItemCount: 0,
          totalShortageQuantity: 0
        };
      }

      agg[code].totalDemandItems++;
      const status = item.satisfactionStatus || '';
      if (status.includes('在途交期不满足') || status.includes('待申购')) {
        agg[code].shortageItemCount++;
        agg[code].totalShortageQuantity += (item.shortageQty || 0);
      }
    });

    let result = Object.values(agg).filter((item: any) => item.shortageItemCount > 0);
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        item => 
          item.partCode.toLowerCase().includes(term) || 
          item.partDesc.toLowerCase().includes(term)
      );
    }

    return result.sort((a, b) => a.partCode.localeCompare(b.partCode));
  }, [unissuedData, filters, searchTerm]);

  const propertyBreakdown = useMemo(() => {
    if (unissuedData.length === 0) return [];

    const propOrder = ['化学品', '五金件', '钣金原材料', '机加原材料'];
    const categories = Array.from(
      new Set(
        unissuedData
          .map(item => item.property || '')
          .filter(Boolean)
      )
    ).sort((a, b) => {
      const aIndex = propOrder.indexOf(a);
      const bIndex = propOrder.indexOf(b);
      const aPriority = aIndex !== -1 ? aIndex : 9999;
      const bPriority = bIndex !== -1 ? bIndex : 9999;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return a.localeCompare(b);
    });

    const statuses = ['满足', '在途交期满足', '在途交期不满足', '待申购'];
    
    const matrix: Record<string, Record<string, number>> = {};
    categories.forEach(cat => {
      matrix[cat] = {};
      statuses.forEach(status => matrix[cat][status] = 0);
    });

    unissuedData.forEach(item => {
      if (!item.requiredDate) return;
      const [y, m] = item.requiredDate.split('-');
      
      // Filter by selection
      if (filters.year !== 'all' && y !== filters.year) return;
      if (filters.month !== 'all' && m !== filters.month) return;

      const prop = item.property || '';
      const cat = categories.find(c => prop === c);
      if (!cat) return;

      const fullStatus = item.satisfactionStatus || '';
      let statusKey = '';
      if (fullStatus.includes('满足') && !fullStatus.includes('在途')) {
        statusKey = '满足';
      } else if (fullStatus.includes('在途交期满足')) {
        statusKey = '在途交期满足';
      } else if (fullStatus.includes('在途交期不满足')) {
        statusKey = '在途交期不满足';
      } else if (fullStatus.includes('待申购')) {
        statusKey = '待申购';
      }

      if (statusKey && matrix[cat]) {
        matrix[cat][statusKey]++;
      }
    });

    return categories.map(cat => ({
      category: cat,
      ...matrix[cat]
    }));
  }, [unissuedData, filters]);

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!unissuedData || unissuedData.length === 0) return;
    
    setIsExporting(true);
    try {
      // Allow UI to update with "正在生成总览报告..."
      await new Promise(resolve => setTimeout(resolve, 100));

      const XLSX = await import('xlsx-js-style');

      const headerStyle = {
        font: { name: "宋体", bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "0070C0" } },
        border: {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" }
        },
        alignment: { vertical: "center", horizontal: "center" }
      };

      const cellStyle = {
        font: { name: "宋体" },
        border: {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" }
        },
        alignment: { vertical: "center" }
      };
      
      const redBgCellStyle = {
        ...cellStyle,
        fill: { fgColor: { rgb: "FFC7CE" } }
      };

      // --- SHEET 1: 工单欠料情况 ---
      const monthAgg: Record<string, { total: number, satisfied: number, transitOk: number, transitFail: number, toBuy: number }> = {};
      const allMonthsSet = new Set<string>();
      
      unissuedData.forEach(item => {
        if (!item.requiredDate) return;
        const parts = item.requiredDate.split('-');
        if (parts.length >= 2) {
           const ym = `${parts[0]}-${parts[1]}`;
           allMonthsSet.add(ym);
           
           if (!monthAgg[ym]) {
             monthAgg[ym] = { total: 0, satisfied: 0, transitOk: 0, transitFail: 0, toBuy: 0 };
           }
           
           monthAgg[ym].total++;
           const status = item.satisfactionStatus || '';
           if (status.includes('满足') && !status.includes('在途')) {
             monthAgg[ym].satisfied++;
           } else if (status.includes('在途交期满足')) {
             monthAgg[ym].transitOk++;
           } else if (status.includes('在途交期不满足')) {
             monthAgg[ym].transitFail++;
           } else {
             monthAgg[ym].toBuy++;
           }
        }
      });

      const sortedMonths = Array.from(allMonthsSet).sort((a, b) => {
        // format is "YYYY-MM", parse back to compare correctly
        const [ya, ma] = a.split('-');
        const [yb, mb] = b.split('-');
        if (ya !== yb) return ya.localeCompare(yb);
        return parseInt(ma) - parseInt(mb);
      });
      
      const formatYM = (ym: string) => {
        const [y, m] = ym.split('-');
        return `${y}${t('material_analysis.export.year')}${m}${t('material_analysis.export.month')}`;
      };

      const ws1Data: any[][] = [];
      ws1Data.push([
        { v: t('material_analysis.export.ym'), t: "s", s: headerStyle },
        { v: t('material_analysis.table.total_demand'), t: "s", s: headerStyle },
        { v: t('material_analysis.table.satisfied_short'), t: "s", s: headerStyle },
        { v: t('material_analysis.table.transit_ok_short'), t: "s", s: headerStyle },
        { v: t('material_analysis.table.transit_fail_short'), t: "s", s: headerStyle },
        { v: t('material_analysis.table.to_buy_short'), t: "s", s: headerStyle }
      ]);
      
      sortedMonths.forEach(ym => {
        const d = monthAgg[ym];
        ws1Data.push([
          { v: formatYM(ym), t: "s", s: cellStyle },
          { v: d.total, t: "n", s: cellStyle },
          { v: d.satisfied, t: "n", s: cellStyle },
          { v: d.transitOk, t: "n", s: cellStyle },
          { v: d.transitFail, t: "n", s: cellStyle },
          { v: d.toBuy, t: "n", s: cellStyle }
        ]);
      });
      
      const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
      ws1['!rows'] = ws1Data.map(() => ({ hpt: 18 }));
      ws1['!autofilter'] = { ref: `A1:F${ws1Data.length}` };
      ws1['!cols'] = Array(6).fill({ wch: 12 });

      // --- SHEET 2: 物料欠料总明细 ---
      const matAgg: Record<string, any> = {};
      
      unissuedData.forEach(item => {
        if (!item.requiredDate) return;
        const code = item.partCode;
        if (!code) return;
        
        const prop = item.property || '';
        const aggKey = `${prop}_${code}`;
        
        if (!matAgg[aggKey]) {
          matAgg[aggKey] = {
            prop,
            code,
            desc: item.partDesc || '',
            totalDemandItems: 0,
            shortageItemCount: 0,
            totalShortageQty: 0,
            monthlyShortage: {}
          };
        }
        
        matAgg[aggKey].totalDemandItems++;
        
        // 欠料状态判定：无需考虑满足情况状态。将该条数据的欠料数量累加至该物料的总欠料数量和对应月份的欠料桶。
        const qty = item.shortageQty || 0;
        if (qty > 0) {
          matAgg[aggKey].shortageItemCount++;
          matAgg[aggKey].totalShortageQty += qty;
          
          const parts = item.requiredDate.split('-');
          if (parts.length >= 2) {
            const ym = `${parts[0]}-${parts[1]}`;
            if (!matAgg[aggKey].monthlyShortage[ym]) {
              matAgg[aggKey].monthlyShortage[ym] = 0;
            }
            matAgg[aggKey].monthlyShortage[ym] += qty;
          }
        }
      });
      
      const filteredMats = Object.values(matAgg)
        .filter(m => m.shortageItemCount > 0)
        .sort((a, b) => {
          const propOrder = ['化学品', '五金件', '钣金原材料', '机加原材料'];
          const aIndex = propOrder.indexOf(a.prop || '');
          const bIndex = propOrder.indexOf(b.prop || '');
          const aPriority = aIndex !== -1 ? aIndex : 9999;
          const bPriority = bIndex !== -1 ? bIndex : 9999;
          
          if (aPriority !== bPriority) {
            return aPriority - bPriority;
          }
          
          const propComp = (a.prop || '').localeCompare(b.prop || '');
          if (propComp !== 0) return propComp;
          
          return (a.code || '').localeCompare(b.code || '');
        });
        
      const ws2Data: any[][] = [];
      const ws2Headers = [
        { v: t('material_analysis.table.prop'), t: "s", s: headerStyle },
        { v: t('material_analysis.export.mat_code'), t: "s", s: headerStyle },
        { v: "物料描述", t: "s", s: headerStyle },
        { v: t('material_analysis.table.total_demand'), t: "s", s: headerStyle },
        { v: t('material_analysis.table.shortage_items'), t: "s", s: headerStyle },
        { v: t('material_analysis.table.total_shortage_qty'), t: "s", s: headerStyle },
        ...sortedMonths.map(ym => ({ v: formatYM(ym), t: "s", s: headerStyle }))
      ];
      ws2Data.push(ws2Headers);
      
      filteredMats.forEach(m => {
        const row = [
          { v: m.prop, t: "s", s: cellStyle },
          { v: m.code, t: "s", s: cellStyle },
          { v: m.desc, t: "s", s: cellStyle },
          { v: m.totalDemandItems, t: "n", s: cellStyle },
          { v: m.shortageItemCount, t: "n", s: cellStyle },
          { v: m.totalShortageQty, t: "n", s: cellStyle }
        ];
        
        sortedMonths.forEach(ym => {
          const qty = m.monthlyShortage[ym] || 0;
          if (qty > 0) {
             row.push({ v: qty, t: "n", s: redBgCellStyle });
          } else {
             row.push({ v: 0, t: "n", s: cellStyle });
          }
        });
        
        ws2Data.push(row);
      });
      
      const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
      ws2['!rows'] = ws2Data.map(() => ({ hpt: 18 }));
      const lastColIndex = ws2Headers.length - 1; 
      const lastColLetter = XLSX.utils.encode_col(lastColIndex);
      ws2['!autofilter'] = { ref: `A1:${lastColLetter}${ws2Data.length}` };
      ws2['!cols'] = ws2Headers.map((h, i) => {
        if (i === 2) return { wch: 25 };
        if (i === 1) return { wch: 15 };
        return { wch: 12 };
      });

      // --- SHEET 3: 物料欠料明细（3个月） ---
      const now = new Date();
      const currentY = now.getFullYear();
      const currentM = now.getMonth(); // 0-based month
      
      const getYMString = (offset: number) => {
        const d = new Date(currentY, currentM + offset, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
      };

      const m2 = getYMString(2); // e.g. "2026-07" if now is 2026-05
      
      const sortedMonths3 = sortedMonths.filter(ym => ym <= m2);
      const matAgg3: Record<string, any> = {};
      
      unissuedData.forEach(item => {
        if (!item.requiredDate) return;
        const parts = item.requiredDate.split('-');
        if (parts.length < 2) return;
        const ym = `${parts[0]}-${parts[1]}`;
        
        // 仅展示 逾期月份 + 近3个月 (即 <= m2)
        if (ym > m2) return;
        
        const code = item.partCode;
        if (!code) return;
        
        const prop = item.property || '';
        const aggKey = `${prop}_${code}`;
        
        if (!matAgg3[aggKey]) {
          matAgg3[aggKey] = {
            prop,
            code,
            desc: item.partDesc || '',
            totalDemandItems: 0,
            shortageItemCount: 0,
            totalShortageQty: 0,
            monthlyShortage: {}
          };
        }
        
        matAgg3[aggKey].totalDemandItems++;
        
        const qty = item.shortageQty || 0;
        if (qty > 0) {
          matAgg3[aggKey].shortageItemCount++;
          matAgg3[aggKey].totalShortageQty += qty;
          
          if (!matAgg3[aggKey].monthlyShortage[ym]) {
            matAgg3[aggKey].monthlyShortage[ym] = 0;
          }
          matAgg3[aggKey].monthlyShortage[ym] += qty;
        }
      });
      
      const filteredMats3 = Object.values(matAgg3)
        .filter(m => m.shortageItemCount > 0)
        .sort((a, b) => {
          const propOrder = ['化学品', '五金件', '钣金原材料', '机加原材料'];
          const aIndex = propOrder.indexOf(a.prop || '');
          const bIndex = propOrder.indexOf(b.prop || '');
          const aPriority = aIndex !== -1 ? aIndex : 9999;
          const bPriority = bIndex !== -1 ? bIndex : 9999;
          
          if (aPriority !== bPriority) {
            return aPriority - bPriority;
          }
          
          const propComp = (a.prop || '').localeCompare(b.prop || '');
          if (propComp !== 0) return propComp;
          
          return (a.code || '').localeCompare(b.code || '');
        });
        
      const ws3Data: any[][] = [];
      const ws3Headers = [
        { v: t('material_analysis.table.prop'), t: "s", s: headerStyle },
        { v: t('material_analysis.export.mat_code'), t: "s", s: headerStyle },
        { v: "物料描述", t: "s", s: headerStyle },
        { v: t('material_analysis.table.total_demand'), t: "s", s: headerStyle },
        { v: t('material_analysis.table.shortage_items'), t: "s", s: headerStyle },
        { v: t('material_analysis.table.total_shortage_qty'), t: "s", s: headerStyle },
        ...sortedMonths3.map(ym => ({ v: formatYM(ym), t: "s", s: headerStyle }))
      ];
      ws3Data.push(ws3Headers);
      
      filteredMats3.forEach(m => {
        const row = [
          { v: m.prop, t: "s", s: cellStyle },
          { v: m.code, t: "s", s: cellStyle },
          { v: m.desc, t: "s", s: cellStyle },
          { v: m.totalDemandItems, t: "n", s: cellStyle },
          { v: m.shortageItemCount, t: "n", s: cellStyle },
          { v: m.totalShortageQty, t: "n", s: cellStyle }
        ];
        
        sortedMonths3.forEach(ym => {
          const qty = m.monthlyShortage[ym] || 0;
          if (qty > 0) {
             row.push({ v: qty, t: "n", s: redBgCellStyle });
          } else {
             row.push({ v: 0, t: "n", s: cellStyle });
          }
        });
        
        ws3Data.push(row);
      });
      
      const ws3 = XLSX.utils.aoa_to_sheet(ws3Data);
      ws3['!rows'] = ws3Data.map(() => ({ hpt: 18 }));
      const lastColIndex3 = ws3Headers.length - 1; 
      const lastColLetter3 = XLSX.utils.encode_col(lastColIndex3);
      ws3['!autofilter'] = { ref: `A1:${lastColLetter3}${ws3Data.length}` };
      ws3['!cols'] = ws3Headers.map((h, i) => {
        if (i === 2) return { wch: 25 };
        if (i === 1) return { wch: 15 };
        return { wch: 12 };
      });
      
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, t('material_analysis.export.sheet_wo'));
      XLSX.utils.book_append_sheet(wb, ws2, "物料欠料总明细");
      XLSX.utils.book_append_sheet(wb, ws3, "物料欠料明细（3个月）");
      
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `${today}_${t('material_analysis.export.filename')}.xlsx`);
      toast.success(t('material_analysis.export.success'));
      
    } catch (error) {
      console.error(error);
      toast.error(t('material_analysis.export.fail'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Package size={22} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">{t('material_analysis.title')}</h3>
            <p className="text-sm text-slate-500">{t('material_analysis.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport}
            disabled={isExporting || unissuedData.length === 0}
            className={cn(
              "bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100",
              isExporting && "animate-pulse"
            )}
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('material_analysis.export.generating')}
              </>
            ) : (
              <>
                <Save size={18} />
                {t('dashboard.export_overview')}
              </>
            )}
          </button>
        </div>
      </div>

       {/* Filter Bar */}
       <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-500">{t('common.year')}</span>
              <select 
                value={filters.year}
                onChange={(e) => {
                  const newYear = e.target.value;
                  onFilterChange({ 
                    year: newYear, 
                    month: newYear === 'all' ? 'all' : filters.month 
                    });
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="all">{t('common.all')}</option>
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}{t('material_analysis.export.year')}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-500">{t('common.month')}</span>
              <select 
                value={filters.year === 'all' ? 'all' : filters.month}
                disabled={filters.year === 'all'}
                onChange={(e) => onFilterChange({ ...filters, month: e.target.value })}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                <option value="all">{t('common.all')}</option>
                {availableMonths.map(month => (
                  <option key={month} value={month}>{month}{t('material_analysis.export.month')}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium mb-1">{t('material_analysis.stats.total_demand')}</p>
              <h3 className="text-3xl font-bold text-slate-900">{metrics.totalItems}</h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <TextQuote size={24} />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-indigo-600 font-bold">
            <span>{t('material_analysis.stats.demand_total_hint')}</span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-500/10 group-hover:bg-indigo-500/30 transition-colors" />
        </div>

        <div className="glass-card p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium mb-1">{t('material_analysis.stats.shortage_items')}</p>
              <h3 className="text-3xl font-bold text-slate-900">{metrics.shortageItems}</h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
              <AlertTriangle size={24} />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-red-600 font-bold">
            <span>{t('material_analysis.stats.shortage_hint')}</span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-red-500/10 group-hover:bg-red-500/30 transition-colors" />
        </div>

        <div className="glass-card p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium mb-1">{t('material_analysis.stats.fill_rate')}</p>
              <h3 className={cn(
                "text-3xl font-bold transition-colors",
                metrics.color === 'emerald' ? "text-emerald-500" : metrics.color === 'amber' ? "text-amber-500" : "text-red-500"
              )}>
                {metrics.satisfactionRate}%
              </h3>
            </div>
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center",
              metrics.color === 'emerald' ? "bg-emerald-50 text-emerald-600" : metrics.color === 'amber' ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
            )}>
              <CheckCircle2 size={24} />
            </div>
          </div>
          <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={cn(
              "h-full transition-all duration-1000",
              metrics.color === 'emerald' ? "bg-emerald-500" : metrics.color === 'amber' ? "bg-amber-500" : "bg-red-500"
            )} style={{ width: `${metrics.satisfactionRate}%` }} />
          </div>
          <div className={cn(
            "absolute bottom-0 left-0 w-full h-1 transition-colors",
            metrics.color === 'emerald' ? "bg-emerald-500/10 group-hover:bg-emerald-500/30" : metrics.color === 'amber' ? "bg-amber-500/10 group-hover:bg-amber-500/30" : "bg-red-500/10 group-hover:bg-red-500/30"
          )} />
        </div>
      </div>

      {/* Main Analysis Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Card */}
        <div className="glass-card p-4 sm:p-8 lg:col-span-1">
          <h3 className="text-xl font-bold text-slate-800 mb-6 font-sans">{t('material_analysis.shortage_status_chart')}</h3>
          <div className="h-[280px]">
             <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={shortageChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {shortageChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                </PieChart>
             </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 py-3 border-t border-slate-100/50">
            {shortageChartData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">{item.name}</span>
              </div>
            ))}
          </div>

          {unissuedData.length === 0 || propertyBreakdown.length === 0 ? (
            <div className="mt-4 py-8 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <Package size={32} className="mb-2 opacity-30 text-slate-400" />
              <span className="text-xs font-medium">暂无数据</span>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-bold text-slate-500 border-b border-slate-100">{t('material_analysis.table.prop')}</th>
                    <th className="py-2.5 px-3 text-center font-bold text-slate-500 border-b border-slate-100">{t('material_analysis.table.satisfied_short')}</th>
                    <th className="py-2.5 px-3 text-center font-bold text-slate-500 border-b border-slate-100">{t('material_analysis.table.transit_ok_short')}</th>
                    <th className="py-2.5 px-3 text-center font-bold text-slate-500 border-b border-slate-100">{t('material_analysis.table.transit_fail_short')}</th>
                    <th className="py-2.5 px-3 text-center font-bold text-slate-500 border-b border-slate-100">{t('material_analysis.table.to_buy_short')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {propertyBreakdown.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-700">{row.category}</td>
                      <td className="py-2.5 px-3 text-center font-medium text-emerald-600">{row['满足']}</td>
                      <td className="py-2.5 px-3 text-center font-medium text-indigo-600">{row['在途交期满足']}</td>
                      <td className="py-2.5 px-3 text-center font-medium text-amber-600">{row['在途交期不满足']}</td>
                      <td className="py-2.5 px-3 text-center font-medium text-red-600">{row['待申购']}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detailed List Card */}
        <div className="glass-card p-4 sm:p-8 lg:col-span-2 flex flex-col">
           <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <h3 className="text-xl font-bold text-slate-800">{t('material_analysis.shortage_list')}</h3>
              
              <div className="flex items-center gap-3">
                {isSearchVisible && (
                  <div className="relative animate-in fade-in slide-in-from-right-4 duration-300">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder={t('material_analysis.search_placeholder')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full sm:w-64 transition-all"
                      autoFocus
                    />
                    {searchTerm && (
                      <button 
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}
                
                <button 
                  onClick={() => setIsSearchVisible(!isSearchVisible)}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    isSearchVisible 
                      ? "bg-indigo-50 text-indigo-600" 
                      : "text-slate-400 hover:bg-slate-50 hover:text-indigo-600"
                  )}
                  title={t('material_analysis.toggle_search')}
                >
                  <Filter size={18} />
                </button>
              </div>
           </div>
           
           <div className="space-y-4 flex-1">
              {materialAggregation.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Search size={48} className="mb-4 opacity-20" />
                  <p>{t('material_analysis.table.no_match')}</p>
                </div>
              ) : (
                materialAggregation.slice(0, visibleCount).map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all group">
                     <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-2 h-12 rounded-full",
                          item.shortageItemCount > 0 ? "bg-red-500" : "bg-emerald-500"
                        )} />
                        <div className="max-w-[250px] sm:max-w-[300px]">
                          <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate" title={item.partCode}>{item.partCode}</p>
                          <p className="text-xs text-slate-500 mt-1 truncate" title={item.partDesc}>{item.partDesc}</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-8 mt-4 sm:mt-0 overflow-x-auto pb-2 sm:pb-0">
                        <div className="text-right min-w-[70px]">
                          <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">{t('material_analysis.table.total_demand')}</p>
                          <p className="text-sm font-bold text-slate-700">{item.totalDemandItems}</p>
                        </div>
                        <div className="text-right min-w-[70px]">
                          <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">{t('material_analysis.table.shortage_items')}</p>
                          <p className="text-sm font-bold text-red-600">{item.shortageItemCount}</p>
                        </div>
                        <div className="text-right min-w-[70px]">
                          <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">{t('material_analysis.table.total_shortage_qty')}</p>
                          <p className="text-sm font-bold text-slate-700">{formatNumber(item.totalShortageQuantity, 0)}</p>
                        </div>
                        <button 
                          onClick={() => setSelectedMaterial({ code: item.partCode, desc: item.partDesc })}
                          className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-indigo-600 border border-transparent hover:border-slate-200 transition-all"
                          title={t('material_analysis.table.view_demand')}
                        >
                          <ArrowRight size={18} />
                        </button>
                     </div>
                  </div>
                ))
              )}
           </div>
           {materialAggregation.length > visibleCount && (
             <button 
                onClick={() => setVisibleCount(prev => prev + 15)}
                className="w-full py-3 mt-6 text-sm font-bold text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all flex items-center justify-center gap-2"
             >
                {t('material_analysis.table.more')} <MoreHorizontal size={14} />
             </button>
           )}
        </div>
      </div>

      {/* Demand List Modal */}
      {selectedMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selectedMaterial.code}</h3>
                <p className="text-sm text-slate-500 mt-1">{selectedMaterial.desc}</p>
              </div>
              <button 
                onClick={() => setSelectedMaterial(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-0">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="px-6 py-4 font-bold border-b border-slate-100">{t('material_analysis.demand.wo_no')}</th>
                    <th className="px-6 py-4 font-bold border-b border-slate-100">{t('material_analysis.demand.req_date')}</th>
                    <th className="px-6 py-4 font-bold border-b border-slate-100">{t('material_analysis.demand.product_code')}</th>
                    <th className="px-6 py-4 font-bold border-b border-slate-100 text-right">{t('material_analysis.demand.unit_usage')}</th>
                    <th className="px-6 py-4 font-bold border-b border-slate-100 text-right">{t('material_analysis.demand.total_qty')}</th>
                    <th className="px-6 py-4 font-bold border-b border-slate-100 text-right">{t('material_analysis.demand.wo_qty')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {demandList.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{item.workOrderNo}</td>
                      <td className="px-6 py-4 text-slate-600">{item.requiredDate}</td>
                      <td className="px-6 py-4 text-slate-600">{item.productCode}</td>
                      <td className="px-6 py-4 text-slate-600 text-right">{item.unitUsage}</td>
                      <td className="px-6 py-4 font-bold text-slate-700 text-right">{item.totalQty}</td>
                      <td className="px-6 py-4 font-bold text-slate-700 text-right">{formatNumber(item.woQty, 0)}</td>
                    </tr>
                  ))}
                  {demandList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        <Package size={32} className="mx-auto mb-3 opacity-20" />
                        <p>{t('material_analysis.demand.no_data')}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
