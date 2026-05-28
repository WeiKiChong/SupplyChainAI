import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  Line, ComposedChart, Cell, LabelList
} from 'recharts';
import ExcelJS from 'exceljs';
import { Hourglass, Factory, Activity, Download, Calendar, Users, Cpu, AlertTriangle, CheckCircle2, BarChart3, TrendingUp, Grid, Save, X, ListOrdered, Gauge, Info } from 'lucide-react';
import { formatNumber, cn, sortTeams, roundPrecise, getLocalDateString } from '../utils';
import { AnalysisResult, ProductionDemand, ProductionResource, SystemSettings, ProcessCycle } from '../types';
import { useTranslation } from 'react-i18next';

interface Props {
  data: AnalysisResult;
  demands: ProductionDemand[];
  resources: ProductionResource[];
  processCycles?: ProcessCycle[];
  settings?: SystemSettings;
  filters: {
    year: string;
    month: string;
    team: string;
  };
  onFiltersChange: (filters: { year: string; month: string; team: string }) => void;
  excludeAbnormalOrders: boolean;
  onExcludeAbnormalOrdersChange: (val: boolean) => void;
  addNotification?: (type: 'success' | 'error' | 'info', message: string) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  const { t } = useTranslation();
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const hasOverdue = data.overdueLoad > 0;
    
    return (
      <div className="bg-white p-3 rounded-xl shadow-lg border border-slate-100 min-w-[200px]">
        <p className="font-semibold text-slate-800 mb-3 border-b border-slate-100 pb-2">{label}</p>
        <div className="space-y-2">
          {hasOverdue ? (
            <>
              <div className="flex justify-between items-center gap-4">
                <span className="text-slate-500 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  {t('ca.total_load')}
                </span>
                <span className="font-medium text-slate-700">{Math.ceil(data.load)}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-slate-500 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  {t('ca.normal_load')}
                </span>
                <span className="font-medium text-slate-700">{Math.ceil(data.plannedLoad)}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-slate-500 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  {t('ca.overdue_load')}
                </span>
                <span className="font-medium text-slate-700">{Math.ceil(data.overdueLoad)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-500 text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                {t('ca.normal_load')}
              </span>
              <span className="font-medium text-slate-700">{Math.ceil(data.plannedLoad)}</span>
            </div>
          )}
          
          {payload.filter((p: any) => p.dataKey !== 'overdueLoad' && p.dataKey !== 'plannedLoad').map((entry: any, index: number) => (
            <div key={index} className="flex justify-between items-center gap-4">
              <span className="text-slate-500 text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                {entry.name}
              </span>
              <span className="font-medium text-slate-700">{Math.floor(entry.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default function CapacityAnalysis({ 
  data, 
  demands, 
  resources, 
  processCycles = [], 
  settings, 
  filters, 
  onFiltersChange,
  excludeAbnormalOrders,
  onExcludeAbnormalOrdersChange,
  addNotification
}: Props) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'dashboard' | 'heatmap' | 'top10'>('dashboard');
  const [heatmapCategory, setHeatmapCategory] = useState<'human' | 'machine'>('machine');
  const [selectedBarData, setSelectedBarData] = useState<{ team: string, month: string } | null>(null);
  const [isExportingOverview, setIsExportingOverview] = useState(false);

  const { year: selectedYear, month: selectedMonth, team: selectedTeam } = filters;

  // Handle chart click is now handled directly on the Bar component

  const topDemands = useMemo(() => {
    if (!selectedBarData || !data.scheduledDemands) return [];
    const { team: targetTeam, month: targetMonth } = selectedBarData;

    const filtered = data.scheduledDemands.filter(d => {
      const teamMatch = targetTeam === 'all' || d.team === targetTeam;
      const monthMatch = targetMonth === 'all' || d.monthStr === targetMonth;
      return teamMatch && monthMatch && d.demandHours > 0;
    });

    return filtered.sort((a, b) => b.demandHours - a.demandHours).slice(0, 10);
  }, [selectedBarData, data.scheduledDemands]);

  const setSelectedYear = (year: string) => onFiltersChange({ ...filters, year });
  const setSelectedMonth = (month: string) => onFiltersChange({ ...filters, month });
  const setSelectedTeam = (team: string) => onFiltersChange({ ...filters, team });

  // Extract unique years from data
  const uniqueYears = useMemo(() => {
    return Array.from(new Set(data.monthlyTeamData.map(d => d.month.substring(0, 4)))).sort();
  }, [data.monthlyTeamData]);

  // Base data filtered by year (applies to all views)
  const yearFilteredData = useMemo(() => {
    return data.monthlyTeamData.filter(d => selectedYear === 'all' || d.month.startsWith(`${selectedYear}年`));
  }, [data.monthlyTeamData, selectedYear]);

  // Extract unique months based on selected year
  const uniqueMonths = useMemo(() => {
    return Array.from(new Set(yearFilteredData.map(d => d.month))).sort();
  }, [yearFilteredData]);

  // Extract unique teams
  const uniqueTeams = useMemo(() => {
    return sortTeams(Array.from(new Set(data.monthlyTeamData.map(d => d.team))), settings?.teamOrder, settings?.teamCategories);
  }, [data.monthlyTeamData, settings?.teamOrder, settings?.teamCategories]);

  // Validate and reset filters if they don't exist in current data
  useEffect(() => {
    let changed = false;
    const newFilters = { ...filters };

    if (selectedYear !== 'all' && !uniqueYears.includes(selectedYear)) {
      newFilters.year = 'all';
      changed = true;
    }
    
    if (selectedMonth !== 'all' && !uniqueMonths.includes(selectedMonth)) {
      newFilters.month = 'all';
      changed = true;
    }

    if (selectedTeam !== 'all' && !uniqueTeams.includes(selectedTeam)) {
      newFilters.team = 'all';
      changed = true;
    }

    if (changed) {
      onFiltersChange(newFilters);
    }
  }, [uniqueYears, uniqueMonths, uniqueTeams, selectedYear, selectedMonth, selectedTeam, filters, onFiltersChange]);

  // Active data for metrics and charts based on viewMode
  const activeData = useMemo(() => {
    if (viewMode === 'dashboard') {
      return yearFilteredData.filter(d => 
        (selectedMonth === 'all' || d.month === selectedMonth) &&
        (selectedTeam === 'all' || d.team === selectedTeam)
      );
    } else {
      return yearFilteredData; // heatmap uses all teams and all months in the year
    }
  }, [yearFilteredData, viewMode, selectedMonth, selectedTeam]);

  // Compare Chart Data (by Team)
  const compareChartData = useMemo(() => {
    const filtered = yearFilteredData.filter(d => selectedMonth === 'all' || d.month === selectedMonth);
    const teamMap = new Map<string, any>();
    filtered.forEach(d => {
      if (!teamMap.has(d.team)) {
        teamMap.set(d.team, { 
          name: d.team, 
          load: 0, 
          overdueLoad: 0,
          plannedLoad: 0,
          humanCapacity: 0, 
          machineCapacity: 0 
        });
      }
      const entry = teamMap.get(d.team)!;
      entry.load += d.human.load;
      entry.overdueLoad += d.human.overdueLoad;
      entry.plannedLoad += d.human.plannedLoad;
      entry.humanCapacity += d.human.capacity;
      entry.machineCapacity += d.machine.capacity;
    });
    return sortTeams(Array.from(teamMap.values()).map(v => v.name), settings?.teamOrder, settings?.teamCategories).map(name => teamMap.get(name)!);
  }, [yearFilteredData, selectedMonth, settings?.teamOrder, settings?.teamCategories]);

  // Trend Chart Data (by Month)
  const trendChartData = useMemo(() => {
    const filtered = yearFilteredData.filter(d => selectedTeam === 'all' || d.team === selectedTeam);
    const monthMap = new Map<string, any>();
    filtered.forEach(d => {
      const monthLabel = selectedYear !== 'all' ? d.month.replace(/\d+年/, '') : d.month;
      if (!monthMap.has(monthLabel)) {
        monthMap.set(monthLabel, { 
          name: monthLabel, 
          load: 0, 
          overdueLoad: 0,
          plannedLoad: 0,
          humanCapacity: 0, 
          machineCapacity: 0, 
          originalMonth: d.month 
        });
      }
      const entry = monthMap.get(monthLabel)!;
      entry.load += d.human.load;
      entry.overdueLoad += d.human.overdueLoad;
      entry.plannedLoad += d.human.plannedLoad;
      entry.humanCapacity += d.human.capacity;
      entry.machineCapacity += d.machine.capacity;
    });
    return Array.from(monthMap.values()).sort((a, b) => a.originalMonth.localeCompare(b.originalMonth));
  }, [yearFilteredData, selectedTeam, selectedYear]);

  // Heatmap Data Preparation
  const heatmapData = useMemo(() => {
    if (viewMode !== 'heatmap') return { months: [], teams: [], matrix: {} as Record<string, any> };
    
    const months = Array.from(new Set(activeData.map(d => d.month))).sort();
    const teams = sortTeams(Array.from(new Set(activeData.map(d => d.team))), settings?.teamOrder, settings?.teamCategories);
    
    const matrix: Record<string, Record<string, { 
      human: { load: number, capacity: number, utilization: number },
      machine: { load: number, capacity: number, utilization: number }
    }>> = {};
    
    teams.forEach(t => {
      matrix[t] = {};
      months.forEach(m => {
        const entry = activeData.find(d => d.team === t && d.month === m);
        if (entry) {
          matrix[t][m] = {
            human: {
              load: entry.human.load,
              capacity: entry.human.capacity,
              utilization: entry.human.utilization
            },
            machine: {
              load: entry.machine.load,
              capacity: entry.machine.capacity,
              utilization: entry.machine.utilization
            }
          };
        } else {
          matrix[t][m] = { 
            human: { load: 0, capacity: 0, utilization: 0 },
            machine: { load: 0, capacity: 0, utilization: 0 }
          };
        }
      });
    });
    
    return { months, teams, matrix };
  }, [activeData, viewMode, settings?.teamOrder]);

  // Top 10 Part Number Ranking (Single piece processing time)
  const top10PartHours = useMemo(() => {
    if (viewMode !== 'top10') return [];
    
    // 1. Team Mapping
    const resourceToTeam = new Map<string, string>();
    resources.forEach(r => {
      if (r.id) resourceToTeam.set(r.id, r.team || '其他');
      if (r.groupName) resourceToTeam.set(r.groupName, r.team || '其他');
    });

    // 2. Operation De-duplication & Team Assignment
    const seenWorkOrderOps = new Set<string>();
    const processedDemands: { team: string, partNumber: string, componentCode: string, actualHours: number }[] = [];

    // Use data.scheduledDemands as it is already filtered by abnormal order logic in useCapacityAnalysis
    data.scheduledDemands.forEach(d => {
      const opKey = d.workOrderOpNo;
      if (!opKey) {
        const team = resourceToTeam.get(d.resourceGroupId) || '其他';
        processedDemands.push({
          team,
          partNumber: d.partNumber || d.componentCode || '未知',
          componentCode: d.componentCode || '未知',
          actualHours: d.actualHours || 0
        });
        return;
      }

      if (seenWorkOrderOps.has(opKey)) return;
      seenWorkOrderOps.add(opKey);

      const team = resourceToTeam.get(d.resourceGroupId) || '其他';
      processedDemands.push({
        team,
        partNumber: d.partNumber || d.componentCode || '未知',
        componentCode: d.componentCode || '未知',
        actualHours: d.actualHours || 0
      });
    });

    // 3. Grouping by Team and then by PartNumber (No summing)
    const teamGroups = new Map<string, Map<string, { hours: number, componentCode: string }>>();
    
    processedDemands.forEach(d => {
      if (!teamGroups.has(d.team)) {
        teamGroups.set(d.team, new Map());
      }
      const componentMap = teamGroups.get(d.team)!;
      const val = d.actualHours || 0;
      const existing = componentMap.get(d.partNumber);
      if (!existing || val > existing.hours) {
        componentMap.set(d.partNumber, { hours: val, componentCode: d.componentCode });
      }
    });

    // 4. Transform to final structure with system sorting
    const sortedTeamNames = sortTeams(Array.from(teamGroups.keys()), settings?.teamOrder, settings?.teamCategories);
    
    return sortedTeamNames.map(teamName => {
      const componentMap = teamGroups.get(teamName)!;
      const data = Array.from(componentMap.entries())
        .map(([name, info]) => ({
          name,
          componentCode: info.componentCode,
          value: roundPrecise(info.hours, 2)
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
      
      return {
        team: teamName,
        data
      };
    });
  }, [demands, resources, viewMode, settings?.teamOrder, settings?.teamCategories]);

  // Metrics Calculation
  const totalDemandLoad = activeData.reduce((acc, d) => acc + d.human.load, 0);
  const totalCapacity = activeData.reduce((acc, d) => acc + d.human.capacity, 0);
  
  // 计算每一行人力和设备负荷率的最小值，然后取平均值
  const totalMinUtilization = activeData.reduce((acc, d) => {
    const minUtil = Math.min(d.human.utilization, d.machine.utilization);
    return acc + minUtil;
  }, 0);
  const avgLoadRate = activeData.length > 0 ? (totalMinUtilization / activeData.length) : 0;
  
  const bottleneckCount = useMemo(() => {
    let count = 0;
    activeData.forEach(d => {
      // 只要人力或设备其中一个超负荷（>120%），即计为一个瓶颈
      if (d.human.utilization > 120 || d.machine.utilization > 120) {
        count++;
      }
    });
    return count;
  }, [activeData]);

  const currentWorkingDays = useMemo(() => {
    if (viewMode === 'dashboard' && selectedMonth !== 'all') {
      const monthData = activeData.find(m => m.month === selectedMonth);
      return monthData ? monthData.workingDays : 0;
    }
    // Sum up unique months in activeData
    const uniqueMonthsInActive = Array.from(new Set(activeData.map(d => d.month)));
    if (uniqueMonthsInActive.length === 1) {
      const m = activeData.find(d => d.month === uniqueMonthsInActive[0]);
      return m ? m.workingDays : 0;
    }
    return data.totalWorkingDays;
  }, [activeData, viewMode, selectedMonth, data.totalWorkingDays]);

  const getChartTitle = () => {
    if (viewMode === 'top10') {
      return '料号工时排名 Top 10';
    }

    if (viewMode === 'heatmap') {
      if (selectedYear === 'all') return '全局产能热力图';
      return `${selectedYear}年 - 全局产能热力图`;
    }

    if (data.monthlyTeamData.length === 0) {
      return '产能分析看板';
    }

    const yearLabel = selectedYear === 'all' ? '全部年份' : `${selectedYear}年`;
    
    // Use actual valid team for title, even if state hasn't updated yet
    const actualTeam = selectedTeam !== 'all' && uniqueTeams.includes(selectedTeam) ? selectedTeam : 'all';
    
    if (actualTeam !== 'all') {
      return `${actualTeam} - ${yearLabel}月度负荷趋势`;
    } else {
      if (selectedMonth === 'all') {
        return `${yearLabel}全年 - 各班组产能负荷对比`;
      } else {
        // selectedMonth already contains the year (e.g., "2026年03月")
        return `${selectedMonth} - 各班组产能负荷对比`;
      }
    }
  };

  const handleExportOverview = async () => {
    if (!demands || demands.length === 0) {
      if (addNotification) {
        addNotification('error', '暂无数据可以导出。');
      }
      return;
    }

    setIsExportingOverview(true);
    
    // Small delay to allow UI to update and show loading state
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const workbook = new ExcelJS.Workbook();
      
      // 1. Calculate Full Heatmap Data
      const allMonths = Array.from(new Set(data.monthlyTeamData.map(d => d.month))).sort();
      const allTeams = sortTeams(Array.from(new Set(data.monthlyTeamData.map(d => d.team))), settings?.teamOrder, settings?.teamCategories);
      
      const fullMatrix: Record<string, Record<string, { 
        human: { load: number, capacity: number, utilization: number },
        machine: { load: number, capacity: number, utilization: number }
      }>> = {};
      
      allTeams.forEach(t => {
        fullMatrix[t] = {};
        allMonths.forEach(m => {
          const entry = data.monthlyTeamData.find(d => d.team === t && d.month === m);
          if (entry) {
            fullMatrix[t][m] = {
              human: {
                load: entry.human.load,
                capacity: entry.human.capacity,
                utilization: entry.human.utilization
              },
              machine: {
                load: entry.machine.load,
                capacity: entry.machine.capacity,
                utilization: entry.machine.utilization
              }
            };
          } else {
            fullMatrix[t][m] = { 
              human: { load: 0, capacity: 0, utilization: 0 },
              machine: { load: 0, capacity: 0, utilization: 0 }
            };
          }
        });
      });

      // 2. Calculate Full Top 10 Data
      const resourceToTeam = new Map<string, string>();
      resources.forEach(r => {
        if (r.id) resourceToTeam.set(r.id, r.team || '其他');
        if (r.groupName) resourceToTeam.set(r.groupName, r.team || '其他');
      });

      const seenWorkOrderOps = new Set<string>();
      const processedDemands: { team: string, partNumber: string, componentCode: string, actualHours: number }[] = [];

      // Use data.scheduledDemands as it is already filtered by abnormal order logic in useCapacityAnalysis
      data.scheduledDemands.forEach(d => {
        const opKey = d.workOrderOpNo;
        if (!opKey) {
          const team = resourceToTeam.get(d.resourceGroupId) || '其他';
          processedDemands.push({
            team,
            partNumber: d.partNumber || d.componentCode || '未知',
            componentCode: d.componentCode || '未知',
            actualHours: d.actualHours || 0
          });
          return;
        }

        if (seenWorkOrderOps.has(opKey)) return;
        seenWorkOrderOps.add(opKey);

        const team = resourceToTeam.get(d.resourceGroupId) || '其他';
        processedDemands.push({
          team,
          partNumber: d.partNumber || d.componentCode || '未知',
          componentCode: d.componentCode || '未知',
          actualHours: d.actualHours || 0
        });
      });

      const teamGroups = new Map<string, Map<string, { hours: number, componentCode: string }>>();
      processedDemands.forEach(d => {
        if (!teamGroups.has(d.team)) {
          teamGroups.set(d.team, new Map());
        }
        const componentMap = teamGroups.get(d.team)!;
        const val = d.actualHours || 0;
        const existing = componentMap.get(d.partNumber);
        if (!existing || val > existing.hours) {
          componentMap.set(d.partNumber, { hours: val, componentCode: d.componentCode });
        }
      });

      const fullTop10 = allTeams.map(teamName => {
        const componentMap = teamGroups.get(teamName) || new Map();
        const data = Array.from(componentMap.entries())
          .map(([name, info]) => ({
            name,
            componentCode: info.componentCode,
            value: roundPrecise(info.hours, 2)
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10);
        
        return {
          team: teamName,
          data
        };
      });

      // --- Sheet 1: 产能分析明细 ---
      const detailSheet = workbook.addWorksheet('产能分析明细');
      const detailHeaderRow = ['班组', '指标项', ...allMonths];
      const detailHeader = detailSheet.addRow(detailHeaderRow);
      
      detailHeader.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      let currentRowIndex = 2;
      allTeams.forEach(team => {
        const teamData = data.monthlyTeamData.filter(d => d.team === team);
        
        const metrics = [
          { name: '需求工时', key: 'load' },
          { name: '人员可用产能', key: 'humanCap' },
          { name: '人员缺口', key: 'humanGap' },
          { name: '人员负荷率', key: 'humanUtil' },
          { name: '设备可用产能', key: 'machineCap' },
          { name: '设备缺口', key: 'machineGap' },
          { name: '设备负荷率', key: 'machineUtil' },
        ];

        const startRow = currentRowIndex;

        metrics.forEach(metric => {
          const rowData: any[] = [team, metric.name];
          allMonths.forEach(month => {
            const monthData = teamData.find(d => d.month === month);
            if (monthData) {
              if (metric.key === 'load') rowData.push(Math.ceil(monthData.human.load));
              else if (metric.key === 'humanCap') rowData.push(Math.floor(monthData.human.capacity));
              else if (metric.key === 'humanUtil') rowData.push(`${monthData.human.utilization.toFixed(2)}%`);
              else if (metric.key === 'humanGap') rowData.push(Math.floor(monthData.human.capacity) - Math.ceil(monthData.human.load));
              else if (metric.key === 'machineCap') rowData.push(Math.floor(monthData.machine.capacity));
              else if (metric.key === 'machineUtil') rowData.push(`${monthData.machine.utilization.toFixed(2)}%`);
              else if (metric.key === 'machineGap') rowData.push(Math.floor(monthData.machine.capacity) - Math.ceil(monthData.machine.load));
            } else {
              rowData.push('-');
            }
          });
          const row = detailSheet.addRow(rowData);
          
          let rowFill: any = null;
          if (metric.name === '需求工时') {
            rowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Yellow
          } else if (metric.name === '人员负荷率' || metric.name === '设备负荷率') {
            rowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0F5' } }; // Light Blue
          }
          
          row.eachCell((cell, colNumber) => {
            if (rowFill && colNumber !== 1) {
              cell.fill = rowFill;
            }
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
            if (colNumber === 1) {
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
            } else if (colNumber === 2) {
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
            } else {
              cell.alignment = { horizontal: 'right', vertical: 'middle' };
              // Negative values in gap columns shown in red
              if (colNumber >= 3 && (metric.key === 'humanGap' || metric.key === 'machineGap')) {
                if (typeof cell.value === 'number' && cell.value < 0) {
                  cell.font = { color: { argb: 'FFFF0000' } };
                }
              }
            }
          });
          
          currentRowIndex++;
        });

        detailSheet.mergeCells(startRow, 1, currentRowIndex - 1, 1);
        const teamCell = detailSheet.getCell(startRow, 1);
        teamCell.value = team;
        teamCell.font = { bold: true };
        teamCell.alignment = { horizontal: 'left', vertical: 'middle' };
      });

      detailSheet.getColumn(1).width = 15;
      detailSheet.getColumn(2).width = 20;
      for (let i = 3; i <= allMonths.length + 2; i++) {
        detailSheet.getColumn(i).width = 12;
      }

      // --- Sheet 2 & 3: 热力图 ---
      const addHeatmapSheet = (category: 'human' | 'machine') => {
        const sheetName = category === 'human' ? '热力图-人员负荷' : '热力图-设备负荷';
        const worksheet = workbook.addWorksheet(sheetName);
        
        // Header Row
        const headerRow = ['班组 \\ 月份', ...allMonths];
        const header = worksheet.addRow(headerRow);
        
        header.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { 
            type: 'pattern', 
            pattern: 'solid', 
            fgColor: { argb: category === 'human' ? 'FF4F46E5' : 'FFD97706' }
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });

        // Data Rows
        allTeams.forEach(team => {
          const rowData = [team];
          allMonths.forEach(month => {
            const cell = fullMatrix[team][month][category];
            rowData.push(cell.utilization > 0 ? `${cell.utilization.toFixed(1)}%` : '-');
          });
          const row = worksheet.addRow(rowData);
          
          row.eachCell((cell, colNumber) => {
            if (colNumber === 1) {
              cell.font = { bold: true };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
              return;
            }
            
            const monthIndex = colNumber - 2;
            const month = allMonths[monthIndex];
            const util = fullMatrix[team][month][category].utilization;
            
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            
            if (util === 0) {
              cell.font = { color: { argb: 'FF94A3B8' } };
            } else if (util < 90) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
              cell.font = { color: { argb: 'FF065F46' } };
            } else if (util <= 120) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
              cell.font = { color: { argb: 'FF92400E' } };
            } else {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
              cell.font = { color: { argb: 'FF991B1B' }, bold: true };
            }
          });
        });

        worksheet.getColumn(1).width = 20;
        for (let i = 2; i <= allMonths.length + 1; i++) {
          worksheet.getColumn(i).width = 12;
        }
      };

      addHeatmapSheet('human');
      addHeatmapSheet('machine');

      // --- Sheet 4: 料号工时排名 ---
      const top10Sheet = workbook.addWorksheet('料号工时排名');
      const top10HeaderRow = ['班组', '排名', '物料编码', '料号', '单件工时 (MIN)'];
      const top10Header = top10Sheet.addRow(top10HeaderRow);
      
      top10Header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      fullTop10.forEach(teamData => {
        teamData.data.forEach((item, index) => {
          const row = top10Sheet.addRow([
            teamData.team,
            index + 1,
            item.componentCode,
            item.name,
            item.value
          ]);
          
          // Bold team names
          row.getCell(1).font = { bold: true };
          
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        });
        
        top10Sheet.addRow([]);
      });

      top10Sheet.getColumn(1).width = 20;
      top10Sheet.getColumn(2).width = 10;
      top10Sheet.getColumn(3).width = 25;
      top10Sheet.getColumn(4).width = 25;
      top10Sheet.getColumn(5).width = 20;

      // --- Sheet 5: 需求工时Top10（峰值） ---
      const peakSheet = workbook.addWorksheet('需求工时Top10（峰值）');
      const peakHeaderRow = [
        '班组', 
        '峰值月份', 
        '排名', 
        '工单号', 
        '物料编码', 
        '料号', 
        '工序', 
        '交货日期', 
        '未完成数量', 
        '需求工时(H)', 
        '工时占比'
      ];
      const peakHeader = peakSheet.addRow(peakHeaderRow);
      
      peakHeader.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Synced with detail sheet color
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      allTeams.forEach(team => {
        // 1. 找到该班组的峰值月份
        const teamMonthlyData = data.monthlyTeamData.filter(d => d.team === team);
        if (teamMonthlyData.length === 0) return;

        const peakMonthData = [...teamMonthlyData].sort((a, b) => b.human.load - a.human.load)[0];
        const peakMonth = peakMonthData.month;
        const totalMonthLoad = peakMonthData.human.load;

        // 2. 获取该班组在峰值月份的前10个工单
        const peakDemands = data.scheduledDemands
          .filter(d => d.team === team && d.monthStr === peakMonth)
          .sort((a, b) => b.demandHours - a.demandHours)
          .slice(0, 10);

        if (peakDemands.length === 0) return;

        const startRow = peakSheet.lastRow!.number + 1;

        peakDemands.forEach((demand, index) => {
          const ratio = totalMonthLoad > 0 ? (demand.demandHours / totalMonthLoad) * 100 : 0;
          const row = peakSheet.addRow([
            team,
            peakMonth,
            index + 1,
            demand.orderNo,
            demand.componentCode,
            demand.partNumber || '-',
            demand.opDesc,
            demand.dueDate,
            demand.uncompletedQty,
            roundPrecise(demand.demandHours, 1),
            `${ratio.toFixed(1)}%`
          ]);

          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        });

        // 合并前两列（班组、峰值月）
        peakSheet.mergeCells(startRow, 1, startRow + peakDemands.length - 1, 1);
        peakSheet.mergeCells(startRow, 2, startRow + peakDemands.length - 1, 2);

        // 设置合并单元格的对齐方式
        [1, 2].forEach(col => {
          const cell = peakSheet.getCell(startRow, col);
          cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' };
          if (col === 1) cell.font = { bold: true };
        });

        // 添加空行分隔
        peakSheet.addRow([]);
      });

      peakSheet.getColumn(1).width = 15; // 班组
      peakSheet.getColumn(2).width = 15; // 峰值月份
      peakSheet.getColumn(3).width = 8;  // 排名
      peakSheet.getColumn(4).width = 20; // 工单号
      peakSheet.getColumn(5).width = 25; // 物料编码
      peakSheet.getColumn(6).width = 25; // 料号
      peakSheet.getColumn(7).width = 20; // 工序
      peakSheet.getColumn(8).width = 15; // 交货日期
      peakSheet.getColumn(9).width = 12; // 未完成数量
      peakSheet.getColumn(10).width = 15; // 需求工时
      peakSheet.getColumn(11).width = 12; // 工时占比

      // --- Finalize and Download ---
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const today = getLocalDateString();
      const suffix = excludeAbnormalOrders ? '(扣除异常工单)' : '';
      anchor.download = `${today}_产能负荷分析总览${suffix}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Export Overview Error:', error);
    } finally {
      setIsExportingOverview(false);
    }
  };

  const HeatmapView = ({ hData }: { hData: typeof heatmapData }) => {
    if (hData.months.length === 0 || hData.teams.length === 0) {
      return <div className="h-[400px] flex items-center justify-center text-slate-400 text-sm">暂无数据</div>;
    }

    const getCellColor = (utilization: number) => {
      if (utilization === 0) return 'bg-slate-50 text-slate-400';
      if (utilization < 90) return 'bg-emerald-100 text-emerald-700';
      if (utilization <= 120) return 'bg-amber-100 text-amber-700';
      return 'bg-red-100 text-red-700 font-bold shadow-sm ring-1 ring-red-200';
    };

    return (
      <div className="space-y-4">
        {/* Heatmap Category Toggle */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg w-fit mb-4">
          <button
            onClick={() => setHeatmapCategory('human')}
            className={cn(
              "px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2",
              heatmapCategory === 'human' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:bg-white/50"
            )}
          >
            <Users size={14} /> 人员负荷
          </button>
          <button
            onClick={() => setHeatmapCategory('machine')}
            className={cn(
              "px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2",
              heatmapCategory === 'machine' ? "bg-white text-amber-600 shadow-sm" : "text-slate-500 hover:bg-white/50"
            )}
          >
            <Cpu size={14} /> 设备负荷
          </button>
        </div>

        <div className="overflow-x-auto custom-scrollbar pb-4">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-3 text-left font-bold text-slate-500 border-b border-slate-200 min-w-[120px] sticky left-0 bg-white z-10">班组 \ 月份</th>
                {hData.months.map(m => (
                  <th key={m} className="p-3 text-center font-bold text-slate-500 border-b border-slate-200 min-w-[100px]">
                    {m.substring(2).replace('年0', '年')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hData.teams.map(team => (
                <tr key={team} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold text-slate-700 sticky left-0 bg-white/90 backdrop-blur-sm z-10">{team}</td>
                  {hData.months.map(month => {
                    const cell = hData.matrix[team][month][heatmapCategory];
                    return (
                      <td key={month} className="p-2">
                        <div 
                          className={cn("h-10 rounded-md flex items-center justify-center text-sm transition-all hover:scale-105 cursor-default", getCellColor(cell.utilization))} 
                          title={`需求: ${formatNumber(Math.ceil(cell.load), 0)}h\n产能: ${formatNumber(Math.floor(cell.capacity), 0)}h`}
                        >
                          {cell.utilization > 0 ? `${cell.utilization.toFixed(1)}%` : '-'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* View Mode Toggle & Global Export */}
      <div className="flex items-center justify-between">
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit shadow-inner border border-slate-200/50">
          <button 
            onClick={() => setViewMode('dashboard')} 
            className={cn("px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all", viewMode === 'dashboard' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            <BarChart3 size={18} /> {t('ca.dashboard')}
          </button>
          <button 
            onClick={() => setViewMode('heatmap')} 
            className={cn("px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all", viewMode === 'heatmap' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            <Grid size={18} /> {t('ca.heatmap')}
          </button>
          <button 
            onClick={() => setViewMode('top10')} 
            className={cn("px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all", viewMode === 'top10' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            <ListOrdered size={18} /> {t('ca.top10')}
          </button>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-700">扣除异常工单</span>
              <div className="group relative">
                <Info size={14} className="text-slate-400 cursor-help" />
                <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl pointer-events-none leading-relaxed">
                  开启后，系统将自动扣除开工条件异常或欠料的工单负荷。
                  <div className="absolute bottom-full right-1 border-8 border-transparent border-b-slate-900"></div>
                </div>
              </div>
            </div>
            <button 
              onClick={() => onExcludeAbnormalOrdersChange(!excludeAbnormalOrders)}
              className={cn(
                "w-12 h-6 rounded-full transition-all relative",
                excludeAbnormalOrders ? "bg-indigo-600" : "bg-slate-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                excludeAbnormalOrders ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          <button 
            onClick={handleExportOverview}
            disabled={isExportingOverview || !demands || demands.length === 0}
            className={cn(
              "bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100",
              isExportingOverview && "animate-pulse"
            )}
          >
            {isExportingOverview ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                正在生成总览报告...
              </>
            ) : (
              <>
                <Save size={18} />
                导出总览
              </>
            )}
          </button>
        </div>
      </div>

      {/* Header Controls */}
      {viewMode === 'dashboard' && (
        <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-500">年份</span>
                  <select 
                    value={selectedYear}
                    onChange={(e) => {
                      onFiltersChange({
                        ...filters,
                        year: e.target.value,
                        month: 'all' // Reset month when year changes
                      });
                    }}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="all">全部年份</option>
                    {uniqueYears.map(y => <option key={y} value={y}>{y}年</option>)}
                  </select>
                </div>
              
                <>
                  <div className={cn("flex items-center gap-2 transition-opacity", selectedTeam !== 'all' && "opacity-50")}>
                    <span className="text-sm font-bold text-slate-500">月份</span>
                    <select 
                      value={selectedMonth}
                      onChange={(e) => {
                        const val = e.target.value;
                        onFiltersChange({
                          ...filters,
                          month: val,
                          team: val !== 'all' ? 'all' : filters.team
                        });
                      }}
                      disabled={selectedTeam !== 'all'}
                      className={cn(
                        "bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all",
                        selectedTeam !== 'all' ? "cursor-not-allowed" : "hover:border-slate-300"
                      )}
                    >
                      <option value="all">全部月份</option>
                      {uniqueMonths.map(m => (
                        <option key={m} value={m}>
                          {selectedYear !== 'all' ? m.replace(/\d+年/, '') : m}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className={cn("flex items-center gap-2 ml-4 transition-opacity", selectedMonth !== 'all' && "opacity-50")}>
                    <span className="text-sm font-bold text-slate-500">班组</span>
                    <select 
                      value={selectedTeam}
                      onChange={(e) => {
                        const val = e.target.value;
                        onFiltersChange({
                          ...filters,
                          team: val,
                          month: val !== 'all' ? 'all' : filters.month
                        });
                      }}
                      disabled={selectedMonth !== 'all'}
                      className={cn(
                        "bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all",
                        selectedMonth !== 'all' ? "cursor-not-allowed" : "hover:border-slate-300"
                      )}
                    >
                      <option value="all">全部班组</option>
                      {uniqueTeams.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      {viewMode === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium mb-1">总需求工时</p>
              <div className="flex items-baseline gap-1">
                <h3 className="text-3xl font-bold text-slate-900">{formatNumber(Math.ceil(totalDemandLoad), 0)}</h3>
                <span className="text-slate-400 text-sm font-normal">h</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Hourglass size={24} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider">计算范围正常</span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-500/10 group-hover:bg-indigo-500/30 transition-colors" />
        </div>

        <div className="glass-card p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium mb-1">总可用产能</p>
              <div className="flex items-baseline gap-1">
                <h3 className="text-3xl font-bold text-slate-900">{formatNumber(Math.floor(totalCapacity), 0)}</h3>
                <span className="text-slate-400 text-sm font-normal">h</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Factory size={24} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <Calendar size={10} /> 工作天数: {currentWorkingDays} 天
            </span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-emerald-500/10 group-hover:bg-emerald-500/30 transition-colors" />
        </div>

        <div className="glass-card p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium mb-1">平均负荷率</p>
              <div className="flex items-baseline gap-1">
                <h3 className="text-3xl font-bold text-slate-900">{formatNumber(avgLoadRate)}</h3>
                <span className="text-slate-400 text-sm font-normal">%</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500">
              <Gauge size={24} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider",
              avgLoadRate > 120 ? "bg-red-50 text-red-600" : 
              avgLoadRate > 90 ? "bg-amber-50 text-amber-600" :
              "bg-blue-50 text-blue-600"
            )}>
              {avgLoadRate > 120 ? "资源严重超负荷" : 
               avgLoadRate > 90 ? "资源负荷较高" : 
               "资源分配均衡"}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500/10 group-hover:bg-blue-500/30 transition-colors" />
        </div>

        <div className="glass-card p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium mb-1">瓶颈资源数</p>
              <div className="flex items-baseline gap-1">
                <h3 className="text-3xl font-bold text-slate-900">{bottleneckCount}</h3>
                <span className="text-slate-400 text-sm font-normal">个班组</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-brand-red/5 flex items-center justify-center text-brand-red">
              <AlertTriangle size={24} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider",
              bottleneckCount > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
            )}>
              {bottleneckCount > 0 ? "存在产能瓶颈" : "无明显瓶颈"}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-brand-red/10 group-hover:bg-brand-red/30 transition-colors" />
        </div>
      </div>
      )}

      {/* Chart Section */}
      <div className="glass-card p-8">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-bold text-slate-800">{getChartTitle()}</h3>
          {viewMode === 'heatmap' ? (
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-slate-50 border border-slate-200" />
                <span className="text-slate-500">无任务</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-slate-500">正常 (&lt;90%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-slate-500">预警 (90-120%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-slate-500">超负荷 (&gt;120%)</span>
              </div>
            </div>
          ) : viewMode === 'top10' ? null : (
            <div className="flex items-center gap-6 text-xs font-medium">
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-indigo-500 border-t-2 border-dashed border-indigo-600" />
                <span className="text-slate-500">可用产能 (人员)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-amber-500 border-t-2 border-dashed border-amber-600" />
                <span className="text-slate-500">可用产能 (设备)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-blue-500" />
                <span className="text-slate-500">需求工时</span>
              </div>
            </div>
          )}
        </div>

        {viewMode === 'heatmap' ? (
          <HeatmapView hData={heatmapData} />
        ) : viewMode === 'top10' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {top10PartHours.length === 0 ? (
              <div className="col-span-full h-[400px] flex items-center justify-center text-slate-400 text-sm">暂无数据</div>
            ) : (top10PartHours as any[]).map((teamData, tIndex) => (
              <div key={tIndex} className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                    {teamData.team}
                  </h3>
                </div>
                <div className="flex-1">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/50 text-slate-500 font-medium border-b border-slate-100">
                        <th className="px-4 py-2 font-bold">排名</th>
                        <th className="px-4 py-2 font-bold">料号</th>
                        <th className="px-4 py-2 font-bold text-right">工时 (MIN)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamData.data.map((item: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className={cn(
                              "w-5 h-5 rounded-full flex items-center justify-center font-bold",
                              idx === 0 ? "bg-amber-100 text-amber-600" : 
                              idx === 1 ? "bg-slate-200 text-slate-600" :
                              idx === 2 ? "bg-orange-100 text-orange-600" : "text-slate-400"
                            )}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-medium text-slate-700 truncate max-w-[120px]" title={item.name}>
                            {item.name}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-600">
                            {item.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto pb-4 custom-scrollbar">
            {(selectedTeam !== 'all' ? trendChartData.length : compareChartData.length) === 0 ? (
              <div className="h-[400px] flex items-center justify-center text-slate-400 text-sm">暂无数据</div>
            ) : (
              <div style={{ minWidth: (selectedTeam !== 'all' ? trendChartData.length : compareChartData.length) > 10 ? `${(selectedTeam !== 'all' ? trendChartData.length : compareChartData.length) * 80}px` : '100%' }} className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart 
                    data={selectedTeam !== 'all' ? trendChartData : compareChartData} 
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    onClick={(state: any) => {
                      if (state && state.activePayload && state.activePayload.length > 0) {
                        const data = state.activePayload[0].payload;
                        if (selectedTeam !== 'all') {
                          setSelectedBarData({ team: selectedTeam, month: data.originalMonth });
                        } else {
                          setSelectedBarData({ team: data.name, month: selectedMonth });
                        }
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }}
                      dy={10}
                      interval={0}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      tickFormatter={(value) => Math.floor(value).toString()}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar 
                      dataKey="overdueLoad" 
                      name="需求工时（逾期）"
                      stackId="a"
                      fill="#ef4444" 
                      radius={[0, 0, 0, 0]}
                      barSize={30}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={(data: any) => {
                        const payload = data.payload || data;
                        if (payload) {
                          if (selectedTeam !== 'all') {
                            setSelectedBarData({ team: selectedTeam, month: payload.originalMonth });
                          } else {
                            setSelectedBarData({ team: payload.name, month: selectedMonth });
                          }
                        }
                      }}
                    />
                    <Bar 
                      dataKey="plannedLoad" 
                      name="需求工时（正常）"
                      stackId="a"
                      fill="#3b82f6" 
                      radius={[4, 4, 0, 0]}
                      barSize={30}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={(data: any) => {
                        const payload = data.payload || data;
                        if (payload) {
                          if (selectedTeam !== 'all') {
                            setSelectedBarData({ team: selectedTeam, month: payload.originalMonth });
                          } else {
                            setSelectedBarData({ team: payload.name, month: selectedMonth });
                          }
                        }
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="humanCapacity" 
                      name="可用产能 (人员)"
                      stroke="#6366f1" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="machineCapacity" 
                      name="可用产能 (设备)"
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Monthly Team Analysis Table */}
      {viewMode === 'dashboard' && (
        <div className="glass-card overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Activity size={18} />
              </div>
              <h3 className="font-bold text-slate-800">产能负荷明细</h3>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-slate-500">正常 (&lt;90%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-slate-500">预警 (90-120%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-slate-500">超负荷 (&gt;120%)</span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th rowSpan={2} className="py-4 px-6 text-[11px] font-bold text-slate-500 uppercase tracking-wider">月份</th>
                  <th rowSpan={2} className="py-4 px-6 text-[11px] font-bold text-slate-500 uppercase tracking-wider">班组</th>
                  <th rowSpan={2} className="py-4 px-6 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right border-l border-slate-200">需求工时 (H)</th>
                  <th colSpan={3} className="py-2 px-6 text-[11px] font-bold text-indigo-600 uppercase tracking-wider text-center border-l border-slate-200 bg-indigo-50/30">
                    <div className="flex items-center justify-center gap-2">
                      <Users size={14} /> 人员
                    </div>
                  </th>
                  <th colSpan={3} className="py-2 px-6 text-[11px] font-bold text-amber-600 uppercase tracking-wider text-center border-l border-slate-200 bg-amber-50/30">
                    <div className="flex items-center justify-center gap-2">
                      <Cpu size={14} /> 设备
                    </div>
                  </th>
                </tr>
                <tr className="border-t border-slate-100">
                  <th className="py-2 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right border-l border-slate-200 bg-indigo-50/10">可用产能(H)</th>
                  <th className="py-2 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right bg-indigo-50/10">缺口(H)</th>
                  <th className="py-2 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center bg-indigo-50/10">负荷率</th>
                  <th className="py-2 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right border-l border-slate-200 bg-amber-50/10">可用产能(H)</th>
                  <th className="py-2 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right bg-amber-50/10">缺口(H)</th>
                  <th className="py-2 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center bg-amber-50/10">负荷率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {activeData.length > 0 ? activeData.map((item, idx) => (
                  <tr 
                    key={`${item.month}-${item.team}-${idx}`} 
                    className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                    onClick={() => setSelectedBarData({ team: item.team, month: item.month })}
                  >
                    <td className="py-4 px-6 text-sm text-slate-600">
                      {selectedYear !== 'all' ? item.month.replace(/\d+年/, '') : item.month}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-slate-300" />
                        <span className="text-sm font-bold text-slate-800">{item.team}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-600 text-right border-l border-slate-100 font-mono bg-slate-50/20">
                      {formatNumber(Math.ceil(item.human.load), 0)}
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-600 text-right border-l border-slate-100 font-mono">{formatNumber(Math.floor(item.human.capacity), 0)}</td>
                    <td className={cn(
                      "py-4 px-6 text-sm text-right font-mono",
                      Math.floor(item.human.capacity) - Math.ceil(item.human.load) < 0 ? "text-red-600 font-bold" : "text-slate-600"
                    )}>
                      {formatNumber(Math.floor(item.human.capacity) - Math.ceil(item.human.load), 0)}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs",
                        item.human.utilization > 120 ? "bg-red-50 text-red-600" :
                        item.human.utilization > 90 ? "bg-amber-50 text-amber-600" :
                        "bg-emerald-50 text-emerald-600"
                      )}>
                        {item.human.utilization > 120 ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                        {formatNumber(item.human.utilization)}%
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-600 text-right border-l border-slate-100 font-mono">{formatNumber(Math.floor(item.machine.capacity), 0)}</td>
                    <td className={cn(
                      "py-4 px-6 text-sm text-right font-mono",
                      Math.floor(item.machine.capacity) - Math.ceil(item.machine.load) < 0 ? "text-red-600 font-bold" : "text-slate-600"
                    )}>
                      {formatNumber(Math.floor(item.machine.capacity) - Math.ceil(item.machine.load), 0)}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs",
                        item.machine.utilization > 120 ? "bg-red-50 text-red-600" :
                        item.machine.utilization > 90 ? "bg-amber-50 text-amber-600" :
                        "bg-emerald-50 text-emerald-600"
                      )}>
                        {item.machine.utilization > 120 ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                        {formatNumber(item.machine.utilization)}%
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={10} className="py-24 text-center text-slate-400 text-sm">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Demands Modal */}
      {selectedBarData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    {selectedBarData.team !== 'all' ? selectedBarData.team : '全部班组'} 
                    {selectedBarData.month !== 'all' ? ` - ${selectedBarData.month}` : ' - 全年'} 
                    生产进度明细
                  </h3>
                  <p className="text-sm text-slate-500">需求工时最长的前10个工单</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedBarData(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-0">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/90 backdrop-blur-md sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider w-16 text-center border-b border-slate-200">排名</th>
                    <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">工单号</th>
                    <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">物料编码</th>
                    <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">料号</th>
                    <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">工序</th>
                    <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">交货日期</th>
                    <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right border-b border-slate-200">未完成数量</th>
                    <th className="py-4 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right border-b border-slate-200">需求工时(H)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topDemands.length > 0 ? topDemands.map((demand, idx) => {
                    const isTop3 = idx < 3;
                    const rankColors = [
                      'bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 border-amber-200 shadow-sm', // 1st
                      'bg-gradient-to-br from-slate-200 to-slate-100 text-slate-700 border-slate-300 shadow-sm', // 2nd
                      'bg-gradient-to-br from-orange-100 to-orange-50 text-orange-700 border-orange-200 shadow-sm' // 3rd
                    ];
                    const rankColor = isTop3 ? rankColors[idx] : 'bg-slate-50 text-slate-400 border-slate-100';
                    const rowBg = idx === 0 ? 'bg-amber-50/10' : idx === 1 ? 'bg-slate-50/30' : idx === 2 ? 'bg-orange-50/10' : 'bg-white';

                    return (
                      <tr key={`${demand.id}-${idx}`} className={cn("group hover:bg-slate-50/80 transition-all duration-200", rowBg)}>
                        <td className="py-4 px-6 text-center">
                          <div className={cn("w-7 h-7 mx-auto rounded-full flex items-center justify-center text-xs border", rankColor)}>
                            {idx + 1}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-sm text-slate-800">{demand.orderNo}</td>
                        <td className="py-4 px-6 text-sm font-mono text-slate-600">{demand.componentCode}</td>
                        <td className="py-4 px-6 text-sm font-mono text-slate-600">{demand.partNumber || '-'}</td>
                        <td className="py-4 px-6 text-sm text-slate-500">{demand.opDesc}</td>
                        <td className="py-4 px-6 text-sm text-slate-500 font-mono">{demand.dueDate}</td>
                        <td className="py-4 px-6 text-sm text-slate-600 text-right font-mono">{formatNumber(demand.uncompletedQty, 0)}</td>
                        <td className="py-4 px-6 text-sm text-blue-600 text-right font-mono">{formatNumber(demand.demandHours, 1)}</td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={8} className="py-24 text-center text-slate-400 text-sm">
                        暂无数据
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
