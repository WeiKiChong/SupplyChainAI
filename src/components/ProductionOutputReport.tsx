import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, LineChart, List, Zap, Calendar as CalendarIcon, Download, ChevronLeft, ChevronRight, Search, FileText, Filter, Save, X } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine, LabelList } from 'recharts';
import ExcelJS from 'exceljs';
import { cn, sortTeams, roundPrecise, getLocalDateString, parseLocalDate } from '../utils';
import { JobReport, TargetWorkingHour, ProductionResource, SystemSettings, StandardTime as StandardTimeType } from '../types';

interface Props {
  jobReports: JobReport[];
  targetWorkingHours: TargetWorkingHour[];
  resources: ProductionResource[];
  standardTimes: StandardTimeType[];
  settings: SystemSettings;
  addNotification?: (type: 'success' | 'error' | 'info', message: string) => void;
}

const DashboardTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 rounded-xl shadow-lg border border-slate-100 min-w-[220px]">
        <p className="font-semibold text-slate-800 mb-3 border-b border-slate-100 pb-2">{label}</p>
        <div className="space-y-2">
          {payload.map((entry: any, index: number) => {
            const color = entry.dataKey === 'actual' ? entry.payload.actualColor : entry.color;
            return (
              <div key={index} className="flex justify-between items-center gap-4">
                <span className="text-slate-500 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></span>
                  {entry.name}
                </span>
                <span className="font-medium text-slate-700 font-mono">
                  {entry.value}{entry.dataKey === 'rate' ? '%' : ' H'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

export default function ProductionOutputReport({ jobReports, targetWorkingHours, resources, standardTimes, settings, addNotification }: Props) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'achievement-dashboard' | 'efficiency-dashboard'>('achievement-dashboard');
  const [dashboardDate, setDashboardDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDateString(d);
  });
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'custom'>('week');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return getLocalDateString(d);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => getLocalDateString());
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Calculate Date Range
  const selectedDates = useMemo(() => {
    let start = new Date();
    let end = new Date();
    
    if (dateRange === 'week') {
      start.setDate(end.getDate() - 6);
    } else if (dateRange === 'month') {
      start.setMonth(end.getMonth() - 1);
    } else {
      start = parseLocalDate(customStartDate);
      end = parseLocalDate(customEndDate);
    }
    
    const dates: string[] = [];
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const targetEnd = new Date(end);
    targetEnd.setHours(0, 0, 0, 0);
    
    while (current <= targetEnd) {
      dates.push(getLocalDateString(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [dateRange, customStartDate, customEndDate]);

  // Derived state for controlled inputs so they match active Quick Selects
  const displayStartDate = useMemo(() => {
    if (dateRange === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return getLocalDateString(d);
    }
    if (dateRange === 'month') {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      return getLocalDateString(d);
    }
    return customStartDate;
  }, [dateRange, customStartDate]);

  const displayEndDate = useMemo(() => {
    if (dateRange === 'week' || dateRange === 'month') {
      return getLocalDateString();
    }
    return customEndDate;
  }, [dateRange, customEndDate]);

  // 2. Data Processing
  const reportData = useMemo(() => {
    // Mapping ResourceGroupId -> Team
    const resourceToTeamMap = new Map<string, string>();
    resources.forEach(r => resourceToTeamMap.set((r.id || '').toLowerCase(), r.team || '其他'));

    // Achievement Target Map
    const targetMap = new Map<string, number>();
    targetWorkingHours.forEach(t => {
      if (t.dailyTarget) targetMap.set(t.team, Math.round(t.dailyTarget));
    });

    // Group Job Reports by Date and Team
    const dailyOutput = new Map<string, Map<string, number>>(); // Map<DateStr, Map<Team, Hours>>
    
    jobReports.forEach(report => {
      const team = resourceToTeamMap.get((report.resourceGroupId || '').toLowerCase()) || '其他';
      
      // Parse reportTime
      let dateKey = '';
      if (report.reportTime.includes('/')) {
        const parts = report.reportTime.split(' ')[0].split('/');
        if (parts.length === 3) {
          dateKey = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
      } else if (report.reportTime.includes('-')) {
        dateKey = report.reportTime.split('T')[0].split(' ')[0];
      }
      
      if (!dateKey) return;
      
      // 修正 2: 实际报工工时汇总时["是否子流程"]为 TRUE 的行不计算
      const isAchievementSubProcess = report.rawRow?.["是否子流程"];
      if (isAchievementSubProcess === true || isAchievementSubProcess === "TRUE" || String(isAchievementSubProcess).toUpperCase() === "TRUE" || isAchievementSubProcess === 1) return;

      const actualHours = ((report.qualifiedQty || 0) + (report.dmrConcessionQty || 0)) * (report.standardHour || 0) / 60;
      
      if (!dailyOutput.has(dateKey)) dailyOutput.set(dateKey, new Map());
      const teamMap = dailyOutput.get(dateKey)!;
      teamMap.set(team, (teamMap.get(team) || 0) + actualHours);
    });

    // Final Table Data
    const allTeams = Array.from(new Set([
      ...Array.from(resourceToTeamMap.values()),
      ...Array.from(targetMap.keys())
    ])).filter(t => t && (t !== '其他' || jobReports.some(r => resourceToTeamMap.get((r.resourceGroupId || '').toLowerCase()) === '其他')));

    // Filter by search term
    const filteredTeams = allTeams.filter(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

    // Helper to check working day
    const isWorkingDay = (dateStr: string) => {
      if (settings.calendarOverrides?.[dateStr] !== undefined) {
        return settings.calendarOverrides[dateStr];
      }
      const date = parseLocalDate(dateStr);
      return date.getDay() !== 0; // Not Sunday
    };

    // Calculate Yesterday (T-1) based on working days
    const today = getLocalDateString();
    let yesterday = '';
    const d = new Date();
    d.setDate(d.getDate() - 1);
    while (d.getFullYear() > 2000) {
      const dStr = getLocalDateString(d);
      if (isWorkingDay(dStr)) {
        yesterday = dStr;
        break;
      }
      d.setDate(d.getDate() - 1);
    }
    
    // For specific dashboard filtering if needed, though this is for the details view

    const result = filteredTeams.map(team => {
      const dailyHours: Record<string, number> = {};
      let totalAchievementRate = 0;
      let validDaysCount = 0;

      selectedDates.forEach(date => {
        const hours = Math.round(dailyOutput.get(date)?.get(team) || 0);
        dailyHours[date] = hours;
        
        const target = targetMap.get(team);
        if (target && target > 0) {
          totalAchievementRate += (hours / target);
          validDaysCount++;
        }
      });

      const dailyTarget = targetMap.get(team) || 0;
      const yesterdayHours = Math.round(dailyOutput.get(yesterday)?.get(team) || 0);
      const yesterdayRate = dailyTarget > 0 ? Math.round((yesterdayHours / dailyTarget) * 100) : 0;
      const averageRate = validDaysCount > 0 ? Math.round((totalAchievementRate / validDaysCount) * 100) : 0;

      return {
        team,
        dailyTarget,
        dailyHours,
        yesterdayRate,
        averageRate
      };
    });

    const teamNames = result.map(r => r.team);
    const sortedTeamNames = sortTeams(teamNames, settings.teamOrder, settings.teamCategories);
    result.sort((a, b) => sortedTeamNames.indexOf(a.team) - sortedTeamNames.indexOf(b.team));

    return result;
  }, [jobReports, targetWorkingHours, resources, settings, selectedDates, searchTerm]);

  // 3. Equipment Efficiency Data Processing
  const efficiencyData = useMemo(() => {
    const resourceToTeamMap = new Map<string, string>();
    resources.forEach(r => resourceToTeamMap.set((r.id || '').toLowerCase(), r.team || '其他'));

    const stMap = new Map<string, StandardTimeType>();
    standardTimes?.forEach(st => stMap.set(st.team, st));

    const dailyOutput = new Map<string, Map<string, number>>(); 
    jobReports.forEach(report => {
      const team = resourceToTeamMap.get((report.resourceGroupId || '').toLowerCase()) || '其他';
      let dateKey = '';
      if (report.reportTime.includes('/')) {
        const parts = report.reportTime.split(' ')[0].split('/');
        if (parts.length === 3) dateKey = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else if (report.reportTime.includes('-')) {
        dateKey = report.reportTime.split('T')[0].split(' ')[0];
      }
      if (!dateKey) return;
      
      // 修正 2: 实际报工工时汇总时["是否子流程"]为 TRUE 的行不计算
      const isEfficiencySubProcess = report.rawRow?.["是否子流程"];
      if (isEfficiencySubProcess === true || isEfficiencySubProcess === "TRUE" || String(isEfficiencySubProcess).toUpperCase() === "TRUE" || isEfficiencySubProcess === 1) return;

      const actualHours = ((report.qualifiedQty || 0) + (report.dmrConcessionQty || 0)) * (report.standardHour || 0) / 60;
      if (!dailyOutput.has(dateKey)) dailyOutput.set(dateKey, new Map());
      const teamMap = dailyOutput.get(dateKey)!;
      teamMap.set(team, (teamMap.get(team) || 0) + actualHours);
    });

    
    const allTeams = Array.from(new Set([
      ...Array.from(resourceToTeamMap.values()),
      ...Array.from(stMap.keys())
    ])).filter(t => t && (t !== '其他' || jobReports.some(r => resourceToTeamMap.get((r.resourceGroupId || '').toLowerCase()) === '其他')))
      .filter(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const sortedTeams = sortTeams(allTeams, settings.teamOrder, settings.teamCategories);

    return sortedTeams.map(team => {
      const st = stMap.get(team);
      const machineCount = st?.machineCount || 0;
      const shifts = st?.machineShifts || 0;
      const duration = st?.machineDuration || 0;
      const oee = st?.machineOee || 0;
      const capacity = Math.round(machineCount * shifts * duration * oee);

      const dailyMetrics: Record<string, {
        actualHours: number;
        efficiency: number;
      }> = {};

      selectedDates.forEach(date => {
        const hours = Math.round(dailyOutput.get(date)?.get(team) || 0);
        const efficiency = capacity > 0 ? (hours / capacity) * 100 : 0;
        dailyMetrics[date] = { actualHours: hours, efficiency };
      });

      return {
        team,
        machineCount,
        shifts,
        duration,
        oee,
        capacity,
        dailyMetrics
      };
    });
  }, [jobReports, resources, settings, selectedDates, searchTerm, standardTimes]);

  const dashboardData = useMemo(() => {
    const resourceToTeamMap = new Map<string, string>();
    resources.forEach(r => resourceToTeamMap.set((r.id || '').toLowerCase(), r.team || '其他'));

    const targetMap = new Map<string, number>();
    targetWorkingHours.forEach(t => {
      if (t.dailyTarget) targetMap.set(t.team, Math.round(t.dailyTarget));
    });

    const dailyOutput = new Map<string, number>();
    jobReports.forEach(report => {
      const team = resourceToTeamMap.get((report.resourceGroupId || '').toLowerCase()) || '其他';
      let dateKey = '';
      if (report.reportTime.includes('/')) {
        const parts = report.reportTime.split(' ')[0].split('/');
        if (parts.length === 3) dateKey = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else if (report.reportTime.includes('-')) {
        dateKey = report.reportTime.split('T')[0].split(' ')[0];
      }
      
      if (dateKey === dashboardDate) {
        // 修正 2: 实际报工工时汇总时["是否子流程"]为 TRUE 的行不计算
        const isDashSubProcess = report.rawRow?.["是否子流程"];
        if (isDashSubProcess === true || isDashSubProcess === "TRUE" || String(isDashSubProcess).toUpperCase() === "TRUE" || isDashSubProcess === 1) return;

        const actualHours = ((report.qualifiedQty || 0) + (report.dmrConcessionQty || 0)) * (report.standardHour || 0) / 60;
        dailyOutput.set(team, (dailyOutput.get(team) || 0) + actualHours);
      }
    });

    // Include all teams defined in categories and team order to ensure we show even those without data
    const categoryTeams = (settings.teamCategories || []).flatMap(c => c.teamNames);
    const orderTeams = settings.teamOrder || [];
    
    const allTeams = Array.from(new Set([
      ...Array.from(resourceToTeamMap.values()),
      ...Array.from(targetMap.keys()),
      ...Array.from(dailyOutput.keys())
    ])).filter(t => t && (t !== '其他' || jobReports.some(r => resourceToTeamMap.get((r.resourceGroupId || '').toLowerCase()) === '其他')));
    
    // skip search filter in dashboard
    const filteredTeams = allTeams;

      const result = allTeams.map(team => {
        const target = targetMap.get(team) || 0;
        const actual = dailyOutput.get(team) || 0;
        const rate = target > 0 ? (actual / target) * 100 : 0;
        return { 
          team, 
          target: roundPrecise(target, 0), 
          actual: roundPrecise(actual, 0), 
          rate: Math.round(rate),
          actualColor: actual === 0 ? '#f8fafc' : (rate < 80 ? '#ef4444' : (rate < 100 ? '#f59e0b' : '#10b981'))
        };
      });

    const teamNames = result.map(n => n.team);
    const sortedTeamNames = sortTeams(teamNames, settings.teamOrder, settings.teamCategories);
    result.sort((a, b) => sortedTeamNames.indexOf(a.team) - sortedTeamNames.indexOf(b.team));

    return result;
  }, [jobReports, targetWorkingHours, resources, settings, dashboardDate]);

  const efficiencyDashboardData = useMemo(() => {
    const resourceToTeamMap = new Map<string, string>();
    resources.forEach(r => resourceToTeamMap.set((r.id || '').toLowerCase(), r.team || '其他'));

    const stMap = new Map<string, StandardTimeType>();
    standardTimes?.forEach(st => stMap.set(st.team, st));

    const dailyOutput = new Map<string, number>(); 
    jobReports.forEach(report => {
      const team = resourceToTeamMap.get((report.resourceGroupId || '').toLowerCase()) || '其他';
      let dateKey = '';
      if (report.reportTime.includes('/')) {
        const parts = report.reportTime.split(' ')[0].split('/');
        if (parts.length === 3) dateKey = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else if (report.reportTime.includes('-')) {
        dateKey = report.reportTime.split('T')[0].split(' ')[0];
      }
      
      if (dateKey === dashboardDate) {
        // 修正 2: 实际报工工时汇总时["是否子流程"]为 TRUE 的行不计算
        const isEffDashSubProcess = report.rawRow?.["是否子流程"];
        if (isEffDashSubProcess === true || isEffDashSubProcess === "TRUE" || String(isEffDashSubProcess).toUpperCase() === "TRUE" || isEffDashSubProcess === 1) return;

        const actualHours = ((report.qualifiedQty || 0) + (report.dmrConcessionQty || 0)) * (report.standardHour || 0) / 60;
        dailyOutput.set(team, (dailyOutput.get(team) || 0) + actualHours);
      }
    });

    const categoryTeams = (settings.teamCategories || []).flatMap(c => c.teamNames);
    const orderTeams = settings.teamOrder || [];
    
    const allTeams = Array.from(new Set([
      ...Array.from(resourceToTeamMap.values()),
      ...Array.from(stMap.keys())
    ])).filter(t => t && (t !== '其他' || jobReports.some(r => resourceToTeamMap.get((r.resourceGroupId || '').toLowerCase()) === '其他')))
      .filter(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const result = allTeams.map(team => {
      const st = stMap.get(team);
      const capacity = (st?.machineCount || 0) * (st?.machineShifts || 0) * (st?.machineDuration || 0) * (st?.machineOee || 0);
      const actual = dailyOutput.get(team) || 0;
      const rate = capacity > 0 ? (actual / capacity) * 100 : 0;
      
      return {
        team,
        actual: roundPrecise(actual, 0),
        capacity: roundPrecise(capacity, 0),
        rate: roundPrecise(rate, 0),
        actualColor: actual === 0 ? '#f8fafc' : (rate < 80 ? '#ef4444' : (rate < 100 ? '#f59e0b' : '#10b981'))
      };
    });

    const teamNames = result.map(n => n.team);
    const sortedTeamNames = sortTeams(teamNames, settings.teamOrder, settings.teamCategories);
    result.sort((a, b) => sortedTeamNames.indexOf(a.team) - sortedTeamNames.indexOf(b.team));

    return result;
  }, [jobReports, resources, settings, dashboardDate, standardTimes]);

  const getRateColor = (rate: number) => {
    if (rate === 0) return 'text-slate-400';
    if (rate < 80) return 'text-red-600 bg-red-50 font-bold';
    if (rate < 100) return 'text-amber-600 bg-amber-50 font-bold';
    return 'text-emerald-600 bg-emerald-50 font-bold';
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExportOverview = async () => {
    if (!jobReports || jobReports.length === 0) {
      if (addNotification) {
        addNotification('error', '暂无数据可以导出。');
      }
      return;
    }

    setIsExporting(true);
    
    // Simulate slight delay for UI feedback
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const workbook = new ExcelJS.Workbook();
      const dateFmt = (d: string) => d.split('-').slice(1).join('/');
      const formattedDates = selectedDates.map(dateFmt);

      // --- Sheet 1: 工时达成率明细 ---
      const detailsSheet = workbook.addWorksheet('工时达成率明细');
      const detailsHeaderRow = ['班组', '日均目标（H）', ...formattedDates, '昨日产出率', '平均产出率'];
      const detailsHeader = detailsSheet.addRow(detailsHeaderRow);
      detailsHeader.height = 22; // 显式设置表头行高
      
      // Style header
      detailsHeader.eachCell((cell) => {
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

      // Add data
      reportData.forEach(row => {
        const rowData = [
          row.team,
          row.dailyTarget.toFixed(0),
          ...selectedDates.map(d => (row.dailyHours[d] || 0).toFixed(0)),
          `${row.yesterdayRate.toFixed(0)}%`,
          `${row.averageRate.toFixed(0)}%`
        ];
        const newRow = detailsSheet.addRow(rowData);
        newRow.height = 22; // 显式设置数据行行高
        
        newRow.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          if (colNumber === 1) {
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            
            if (colNumber === formattedDates.length + 3 || colNumber === formattedDates.length + 4) {
              const util = colNumber === formattedDates.length + 3 ? row.yesterdayRate : row.averageRate;
              if (util === 0) {
                cell.font = { color: { argb: 'FF94A3B8' } };
              } else if (util < 80) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                cell.font = { color: { argb: 'FF991B1B' }, bold: true };
              } else if (util <= 100) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
                cell.font = { color: { argb: 'FF92400E' } };
              } else {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
                cell.font = { color: { argb: 'FF065F46' } };
              }
            }
          }
        });
      });

      detailsSheet.getColumn(1).width = 20;
      detailsSheet.getColumn(2).width = 15;
      formattedDates.forEach((_, i) => detailsSheet.getColumn(i + 3).width = 12);
      detailsSheet.getColumn(formattedDates.length + 3).width = 15;
      detailsSheet.getColumn(formattedDates.length + 4).width = 15;

      // --- Sheet 2: 资源组设备效率 ---
      const efficiencySheet = workbook.addWorksheet('资源组设备效率明细');
      const effHeaderRow = ['班组', '指标项', ...formattedDates];
      const effHeader = efficiencySheet.addRow(effHeaderRow);
      effHeader.height = 22; // 显式设置表头行高

      // Style header
      effHeader.eachCell((cell) => {
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

      let effCurrentRow = 2;
      efficiencyData.forEach(teamData => {
        const metrics = [
          { label: '实际报工工时', key: 'actualHours' },
          { label: '设备数量', val: teamData.machineCount },
          { label: '班次', val: teamData.shifts },
          { label: '上班时长（H）', val: teamData.duration },
          { label: 'OEE', val: teamData.oee },
          { label: '标准产能（H）', val: teamData.capacity },
          { label: '效率（%）', key: 'efficiency' }
        ];

        const startRow = effCurrentRow;
      metrics.forEach((m, idx) => {
          const rowData = [
            idx === 0 ? teamData.team : '',
            m.label,
            ...selectedDates.map(date => {
              const dMet = teamData.dailyMetrics[date];
              if (m.key === 'actualHours') return dMet.actualHours > 0 ? Math.round(dMet.actualHours) : 0;
              if (m.key === 'efficiency') return dMet.actualHours > 0 ? `${Math.round(dMet.efficiency)}%` : '0%';
              return m.val !== undefined ? (m.label === 'OEE' ? m.val : Math.round(Number(m.val))) : 0;
            })
          ];
          const newRow = efficiencySheet.addRow(rowData);
          newRow.height = 22; // 显式设置数据行行高
          
          let rowFill: any = null;
          if (m.key === 'efficiency') {
            rowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0F5' } }; // Light Blue
          }

          newRow.eachCell((cell, colNumber) => {
            if (rowFill && colNumber !== 1) {
              cell.fill = rowFill;
            }
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
            if (colNumber === 1 || colNumber === 2) {
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
              if (colNumber === 1 && idx === 0) cell.font = { bold: true };
            } else {
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }
          });
          effCurrentRow++;
        });
        
        // Merge team name cells
        efficiencySheet.mergeCells(startRow, 1, effCurrentRow - 1, 1);
      });

      efficiencySheet.getColumn(1).width = 15;
      efficiencySheet.getColumn(2).width = 20;
      formattedDates.forEach((_, i) => efficiencySheet.getColumn(i + 3).width = 12);

      // --- Download ---
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const today = getLocalDateString();
      anchor.href = url;
      anchor.download = `${today}_生产任务产出报表.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export Error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[98%] mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit shadow-inner">
          <button
            onClick={() => setViewMode('achievement-dashboard')}
            className={cn(
              "px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all",
              viewMode === 'achievement-dashboard' 
                ? "bg-white text-indigo-600 shadow-sm" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <BarChart3 size={18} />
            {t('por.achievement')}
          </button>
          <button
            onClick={() => setViewMode('efficiency-dashboard')}
            className={cn(
              "px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all",
              viewMode === 'efficiency-dashboard' 
                ? "bg-white text-indigo-600 shadow-sm" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <LineChart size={18} />
            {t('por.efficiency')}
          </button>
        </div>

        <button 
          onClick={handleExportOverview}
          disabled={isExporting || !jobReports || jobReports.length === 0}
          className={cn(
            "bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100",
            isExporting && "animate-pulse"
          )}
        >
          {isExporting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              正在导出报表...
            </>
          ) : (
            <>
              <Save size={18} />
              导出报表
            </>
          )}
        </button>
      </div>

      {viewMode === 'efficiency-dashboard' && (
         <div className="space-y-6">
            <div className="glass-card p-6 min-h-[400px]">
              <div className="flex items-start justify-between mb-10">
                <div className="flex items-center gap-4">
                  <h3 className="text-xl font-bold text-slate-800 leading-[28px]">{t('por.efficiency')}</h3>
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                    <span className="text-xs font-bold text-slate-400">日期</span>
                    <input 
                      type="date" 
                      value={dashboardDate} 
                      onChange={(e) => setDashboardDate(e.target.value)}
                      className="bg-transparent text-sm border-none focus:ring-0 p-0 text-slate-600 font-medium cursor-pointer outline-none"
                    />
                  </div>
                </div>
                <div></div>
              </div>

              {efficiencyDashboardData.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center text-slate-400 text-sm">暂无数据</div>
              ) : (
                <div className="flex flex-col w-full">
                  {/* Chart Area with fixed Y-axis */}
                  <div className="relative h-[440px] flex">
                    {/* Fixed Y-Axis label/scale */}
                    <div className="w-[60px] shrink-0 h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart 
                          data={efficiencyDashboardData} 
                          margin={{ top: 30, right: 0, bottom: 60, left: 10 }}
                        >
                          <XAxis dataKey="team" axisLine={false} tickLine={false} tick={<></>} height={60} />
                          <YAxis 
                            type="number" 
                            domain={[0, (dataMax: number) => Math.max(120, dataMax)]}
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#475569', fontSize: 12 }}
                            label={{ value: '效率（%）', angle: -90, position: 'insideLeft', style: { fill: '#475569', fontSize: 12, fontWeight: 400 }, offset: 0 }}
                            width={50}
                          />
                          <Line dataKey="rate" stroke="transparent" dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Scrollable Chart Data */}
                    <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar -ml-[1px]">
                      <div style={{ minWidth: efficiencyDashboardData.length > 15 ? `${efficiencyDashboardData.length * 60}px` : '100%', height: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart 
                            data={efficiencyDashboardData} 
                            margin={{ top: 30, right: 40, bottom: 60, left: 10 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} horizontal={true} stroke="#f1f5f9" />
                            
                            {/* X轴代表班组 */}
                            <XAxis 
                              dataKey="team" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#475569', fontSize: 12, fontWeight: 500 }}
                              dy={10}
                              angle={-45}
                              textAnchor="end"
                              interval={0}
                              height={60}
                            />
                            
                            {/* 隐藏的 Y 轴用于保持对齐 */}
                            <YAxis 
                              type="number" 
                              domain={[0, (dataMax: number) => Math.max(120, dataMax)]}
                              axisLine={false} 
                              tickLine={false} 
                              tick={<></>}
                              width={0}
                            />
                            
                            {/* 参考线 */}
                            <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '异常', position: 'right', fill: '#ef4444', fontSize: 10, fontWeight: 600 }} />
                            <ReferenceLine y={100} stroke="#10b981" strokeDasharray="3 3" label={{ value: '正常', position: 'right', fill: '#10b981', fontSize: 10, fontWeight: 600 }} />
  
                            {/* 折线代表各班组效率 */}
                            <Line 
                              type="monotone" 
                              dataKey="rate" 
                              name="设备效率" 
                              stroke="#6366f1" 
                              strokeWidth={3} 
                              animationDuration={1000}
                              dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
                              activeDot={{ r: 6, strokeWidth: 0 }}
                            >
                              <LabelList 
                                dataKey="rate" 
                                position="top" 
                                formatter={(value: number) => `${value}%`}
                                style={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                                offset={12}
                              />
                            </Line>
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Efficiency Details Table Card */}
            <div className="glass-card p-0 shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-6 pt-6 flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
                  <div className="flex items-center gap-2">
                    <List size={22} className="text-indigo-600" />
                    <h3 className="text-xl font-bold text-slate-800">资源组设备效率明细</h3>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-slate-500 shrink-0">日期范围</span>
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                        <input 
                          type="date" 
                          value={displayStartDate} 
                          onChange={(e) => {
                            setCustomStartDate(e.target.value);
                            setCustomEndDate(displayEndDate);
                            setDateRange('custom');
                          }}
                          className="bg-transparent text-sm border-none focus:ring-0 p-0 text-slate-600 font-medium cursor-pointer outline-none"
                        />
                        <span className="text-slate-400 text-xs px-1">至</span>
                        <input 
                          type="date" 
                          value={displayEndDate} 
                          onChange={(e) => {
                            setCustomStartDate(displayStartDate);
                            setCustomEndDate(e.target.value);
                            setDateRange('custom');
                          }}
                          className="bg-transparent text-sm border-none focus:ring-0 p-0 text-slate-600 font-medium cursor-pointer outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                      <button
                        onClick={() => setDateRange('month')}
                        className={cn(
                          "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                          dateRange === 'month' ? "bg-white text-indigo-600 border border-slate-200 shadow-none" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                        )}
                      >
                        近一月
                      </button>
                      <button
                        onClick={() => setDateRange('week')}
                        className={cn(
                          "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                          dateRange === 'week' ? "bg-white text-indigo-600 border border-slate-200 shadow-none" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                        )}
                      >
                        近一周
                      </button>
                    </div>

                    <div className="relative ml-auto xl:ml-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input 
                        type="text"
                        placeholder="搜索班组..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-48 transition-all"
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200/50 transition-colors"
                          title="清空搜索"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
               </div>

                <div className="px-6 flex justify-end items-center gap-4 text-xs relative z-10 mb-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-slate-50 border border-slate-200" />
                    <span className="text-slate-500 font-medium">无产出</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-slate-500 font-medium">异常 (&lt;80%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-slate-500 font-medium">预警 (80-100%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-slate-500 font-medium">正常 (&gt;100%)</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 bg-white overflow-hidden overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead className="bg-slate-50 sticky top-0 z-10 font-bold text-slate-700 text-sm">
                      <tr>
                        <th className="px-6 py-4 border-b border-slate-200 sticky left-0 bg-slate-50 z-20 w-[180px]">班组</th>
                        <th className="px-6 py-4 border-b border-slate-200 border-r sticky left-[180px] bg-slate-50 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)] w-[160px]">指标项</th>
                        {selectedDates.map(date => (
                          <th key={date} className="px-4 py-4 border-b border-slate-200 text-center min-w-[80px]">
                            <div className="flex flex-col items-center">
                              <span>{date.split('-').slice(1).join('/')}</span>
                              <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                                {['日', '一', '二', '三', '四', '五', '六'][new Date(date).getDay()]}
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {efficiencyData.length === 0 ? (
                        <tr>
                          <td colSpan={selectedDates.length + 2} className="py-24 text-center text-slate-400 text-sm">
                            暂无数据
                          </td>
                        </tr>
                      ) : (
                        efficiencyData.map((teamData) => {
                          const rows = [
                            { label: '实际报工工时', key: 'actualHours', format: (val: number) => val.toFixed(0), suffix: '' },
                            { label: '设备数量', value: teamData.machineCount, suffix: '' },
                            { label: '班次', value: teamData.shifts, suffix: '' },
                            { label: '上班时长（H）', value: teamData.duration, suffix: '' },
                            { label: 'OEE', value: teamData.oee, suffix: '' },
                            { label: '标准产能（H）', value: teamData.capacity.toFixed(0), suffix: '' },
                            { label: '效率（%）', key: 'efficiency', format: (val: number) => Math.round(val), suffix: '%' }
                          ];

                          return (
                            <React.Fragment key={teamData.team}>
                              {rows.map((row, rowIdx) => (
                                <tr key={`${teamData.team}-${rowIdx}`} className={cn(
                                  "group transition-colors",
                                  rowIdx === rows.length - 1 ? "border-b-2 border-slate-200" : "border-b border-slate-100",
                                  row.key === 'efficiency' ? "bg-slate-50/30" : "hover:bg-slate-50/50"
                                )}>
                                  {rowIdx === 0 && (
                                    <td rowSpan={rows.length} className="px-6 py-4 font-bold text-slate-900 border-r border-slate-100 sticky left-0 bg-white z-10 align-top group-hover:bg-slate-50 transition-colors w-[180px]">
                                      {teamData.team}
                                    </td>
                                  )}
                                  <td className={cn(
                                    "px-6 py-2 border-r border-slate-100 sticky left-[180px] z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)] font-medium transition-colors",
                                    row.key === 'efficiency' ? "bg-slate-100/50 text-slate-800" : "bg-white text-slate-500 group-hover:bg-slate-50"
                                  )}>
                                    {row.label}
                                  </td>
                                  {selectedDates.map(date => {
                                    const metric = teamData.dailyMetrics[date];
                                    let displayValue: string | number = '-';
                                    let cellStyle = '';

                                    if (row.key === 'actualHours') {
                                      displayValue = metric.actualHours > 0 ? metric.actualHours.toFixed(0) : '-';
                                    } else if (row.key === 'efficiency') {
                                      const eff = metric.efficiency;
                                      displayValue = metric.actualHours > 0 ? `${Math.round(eff)}%` : '0%';
                                      if (metric.actualHours > 0) {
                                        if (eff < 80) cellStyle = 'bg-red-50 text-red-600 font-bold';
                                        else if (eff < 100) cellStyle = 'bg-amber-50 text-amber-600 font-bold';
                                        else cellStyle = 'bg-emerald-50 text-emerald-600 font-bold';
                                      } else {
                                        cellStyle = 'text-slate-400 font-normal';
                                      }
                                    } else if ('value' in row) {
                                      displayValue = row.value;
                                    }

                                    return (
                                      <td key={date} className={cn(
                                        "px-4 py-2 text-center border-r border-slate-100 last:border-r-0",
                                        cellStyle
                                      )}>
                                        {displayValue}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
            </div>
         </div>
      )}


      <>
        {viewMode === 'achievement-dashboard' && (
          <div className="space-y-6">
            <div className="glass-card p-6 min-h-[400px]">
              <div className="flex items-start justify-between mb-10">
                <div className="flex items-center gap-4">
                  <h3 className="text-xl font-bold text-slate-800 leading-[28px]">工时达成率</h3>
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                    <span className="text-xs font-bold text-slate-400">日期</span>
                    <input 
                      type="date" 
                      value={dashboardDate} 
                      onChange={(e) => setDashboardDate(e.target.value)}
                      className="bg-transparent text-sm border-none focus:ring-0 p-0 text-slate-600 font-medium cursor-pointer outline-none"
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3 text-xs">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-slate-100 border border-slate-200" />
                      <span className="text-slate-500">无产出</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-slate-500">异常 (&lt;80%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-slate-500">预警 (80-100%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-slate-500">正常 (&gt;100%)</span>
                    </div>
                  </div>
                </div>
              </div>

              {dashboardData.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center text-slate-400 text-sm">暂无数据</div>
              ) : (
                <div className="flex h-[400px] w-full relative">
                  {/* Fixed Left Y Axis */}
                  <div className="w-[60px] h-full shrink-0 bg-white z-10">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={dashboardData} margin={{ top: 10, right: 0, bottom: 0, left: 10 }}>
                        <XAxis dataKey="team" axisLine={false} tickLine={false} tick={<></>} height={100} />
                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12 }} label={{ value: '工时（H）', angle: -90, position: 'insideLeft', style: { fill: '#475569', fontSize: 12, fontWeight: 400 }, offset: 10 }} width={50} />
                        <Bar yAxisId="left" dataKey="actual" fill="transparent" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Scrollable Center Chart */}
                  <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar h-full relative z-0 left-[-2px]">
                    <div style={{ minWidth: dashboardData.length > 15 ? `${dashboardData.length * 40}px` : '100%' }} className="h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={dashboardData} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis 
                            dataKey="team" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#475569', fontSize: 12, fontWeight: 500 }}
                            dy={10}
                            height={100}
                            angle={-45}
                            textAnchor="end"
                            interval={0}
                          />
                          <YAxis yAxisId="left" hide domain={['auto', 'auto']} />
                          <Tooltip 
                            content={<DashboardTooltip />}
                            cursor={{ fill: '#f8fafc' }}
                          />
                        
                          <Bar yAxisId="left" dataKey="actual" name="实际报工工时" radius={[4, 4, 0, 0]} maxBarSize={60} minPointSize={5}>
                            {dashboardData.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={
                                  entry.actual === 0 ? '#f1f5f9' : 
                                  entry.rate < 80 ? '#ef4444' : 
                                  entry.rate < 100 ? '#f59e0b' : '#10b981'
                                } 
                              />
                            ))}
                            <LabelList 
                              dataKey="rate" 
                              position="top" 
                              formatter={(value: number) => `${value}%`}
                              style={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                              offset={10}
                            />
                          </Bar>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Details Section Card */}
            <div className="glass-card p-0 shadow-sm border border-slate-100 overflow-hidden">
               {/* Card Header: Title & Filters combined */}
               <div className="px-6 pt-6 flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
                  <div className="flex items-center gap-2">
                    <List size={22} className="text-indigo-600" />
                    <h3 className="text-xl font-bold text-slate-800">工时达成率明细</h3>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-slate-500 shrink-0">日期范围</span>
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                        <input 
                          type="date" 
                          value={displayStartDate} 
                          onChange={(e) => {
                            setCustomStartDate(e.target.value);
                            setCustomEndDate(displayEndDate);
                            setDateRange('custom');
                          }}
                          className="bg-transparent text-sm border-none focus:ring-0 p-0 text-slate-600 font-medium cursor-pointer outline-none"
                        />
                        <span className="text-slate-400 text-xs px-1">至</span>
                        <input 
                          type="date" 
                          value={displayEndDate} 
                          onChange={(e) => {
                            setCustomStartDate(displayStartDate);
                            setCustomEndDate(e.target.value);
                            setDateRange('custom');
                          }}
                          className="bg-transparent text-sm border-none focus:ring-0 p-0 text-slate-600 font-medium cursor-pointer outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                      <button
                        onClick={() => setDateRange('month')}
                        className={cn(
                          "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                          dateRange === 'month' ? "bg-white text-indigo-600 border border-slate-200 shadow-none" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                        )}
                      >
                        近一月
                      </button>
                      <button
                        onClick={() => setDateRange('week')}
                        className={cn(
                          "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                          dateRange === 'week' ? "bg-white text-indigo-600 border border-slate-200 shadow-none" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                        )}
                      >
                        近一周
                      </button>
                    </div>

                    <div className="relative ml-auto xl:ml-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input 
                        type="text"
                        placeholder="搜索班组..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-48 transition-all"
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200/50 transition-colors"
                          title="清空搜索"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
               </div>

               {/* Legend Area */}
               <div className="px-6 flex justify-end items-center gap-4 text-xs relative z-10 mb-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-slate-100 border border-slate-200" />
                    <span className="text-slate-500 font-medium">无产出</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-slate-500 font-medium">异常 (&lt;80%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-slate-500 font-medium">预警 (80-100%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-slate-500 font-medium">正常 (&gt;100%)</span>
                  </div>
               </div>

               {/* Table Container */}
               <div className="border-t border-slate-100 bg-white overflow-hidden overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead className="bg-slate-50 sticky top-0 z-10 font-bold text-slate-700 text-sm">
                      <tr>
                        <th className="px-6 py-4 border-b border-slate-200 sticky left-0 bg-slate-50 z-20 w-[180px]">班组</th>
                        <th className="px-6 py-4 border-b border-slate-200 border-r sticky left-[180px] bg-slate-50 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)] w-[140px] whitespace-nowrap text-center text-sm">日均目标（H）</th>
                        {selectedDates.map(date => (
                          <th key={date} className="px-4 py-4 border-b border-slate-200 text-center min-w-[80px] text-sm">
                            <div className="flex flex-col items-center">
                              <span>{date.split('-').slice(1).join('/')}</span>
                              <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                                {['日', '一', '二', '三', '四', '五', '六'][new Date(date).getDay()]}
                              </span>
                            </div>
                          </th>
                        ))}
                        <th className="px-6 py-4 border-b border-slate-200 bg-slate-50 border-l sticky right-[120px] z-20 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] w-[120px] text-center text-sm">昨日产出率</th>
                        <th className="px-6 py-4 border-b border-slate-200 bg-slate-50 border-l sticky right-0 z-20 w-[120px] text-center text-sm">平均产出率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.length === 0 ? (
                        <tr>
                          <td colSpan={selectedDates.length + 4} className="py-24 text-center text-slate-400 text-sm">
                            暂无数据
                          </td>
                        </tr>
                      ) : (
                        reportData.map((row) => (
                          <tr key={row.team} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-3 border-b border-slate-100 font-bold text-slate-900 text-sm sticky left-0 bg-white group-hover:bg-slate-50 transition-colors z-10 w-[180px]">
                              {row.team}
                            </td>
                            <td className="px-6 py-3 border-b border-slate-100 border-r font-medium text-slate-600 text-sm bg-white group-hover:bg-slate-50 sticky left-[180px] z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)] w-[140px] transition-colors whitespace-nowrap text-center">
                              {row.dailyTarget.toFixed(0)}
                            </td>
                            {selectedDates.map(date => {
                              const hours = row.dailyHours[date] || 0;
                              const rate = row.dailyTarget > 0 ? (hours / row.dailyTarget) * 100 : 0;
                              return (
                                <td key={date} className="px-4 py-3 border-b border-slate-100 text-center group/cell relative">
                                  <div className="flex justify-center items-center gap-1.5">
                                    <div className={cn(
                                      "w-2 h-2 rounded-full shrink-0",
                                      hours === 0 ? "bg-slate-50 border border-slate-200" :
                                      rate < 80 ? "bg-red-500" :
                                      rate < 100 ? "bg-amber-500" : "bg-emerald-500"
                                    )} />
                                    <span className={cn(
                                      "text-sm font-medium",
                                      hours === 0 ? "text-slate-400" : "text-slate-700"
                                    )}>
                                      {hours > 0 ? hours.toFixed(0) : '-'}
                                    </span>
                                  </div>
                                </td>
                              );
                            })}
                            <td className="px-6 py-3 border-b border-slate-100 bg-white group-hover:bg-slate-50 border-l text-center sticky right-[120px] z-10 shadow-[-2px_0_5px_rgba(0,0,0,0.05)] w-[120px] transition-colors">
                              {row.yesterdayRate === 0 ? (
                                <span className="text-slate-400 font-bold text-sm">0%</span>
                              ) : (
                                <span className={cn(
                                  "px-3 py-1 rounded-full text-sm font-bold inline-block",
                                  row.yesterdayRate < 80 ? "bg-red-50 text-red-600" :
                                  row.yesterdayRate < 100 ? "bg-amber-50 text-amber-600" :
                                  "bg-emerald-50 text-emerald-600"
                                )}>
                                  {Math.round(row.yesterdayRate)}%
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3 border-b border-slate-100 bg-white group-hover:bg-slate-50 border-l text-center sticky right-0 z-10 w-[120px] transition-colors">
                              {row.averageRate === 0 ? (
                                <span className="text-slate-400 font-bold text-sm">0%</span>
                              ) : (
                                <span className={cn(
                                  "px-3 py-1 rounded-full text-sm font-bold inline-block",
                                  row.averageRate < 80 ? "bg-red-50 text-red-600" :
                                  row.averageRate < 100 ? "bg-amber-50 text-amber-600" :
                                  "bg-emerald-50 text-emerald-600"
                                )}>
                                  {Math.round(row.averageRate)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
               </div>
            </div>
          </div>
        )}



      </>
    </div>
  );
}
