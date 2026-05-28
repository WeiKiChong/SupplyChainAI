import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { FixedSizeList } from 'react-window';
import { 
  LayoutDashboard,
  LayoutGrid, 
  ClipboardList, 
  ChartNoAxesGantt,
  ClipboardCheck,
  Network, 
  Users, 
  Timer, 
  Settings, 
  Menu,
  ChevronRight,
  ChevronDown,
  User,
  Bell,
  Calendar,
  Check,
  X,
  ListOrdered,
  Tags,
  Upload,
  Download,
  Trash2,
  Plus,
  MoreHorizontal,
  RotateCcw,
  AlertCircle,
  Search,
  Filter,
  Shield,
  Activity,
  Database,
  Monitor,
  Save,
  Clock,
  CloudCog,
  Zap,
  Hash,
  FileText,
  TextQuote,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Info,
  BookOpen,
  CircleHelp,
  Building,
  Flag,
  Folder,
  Package,
  PackageSearch
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { cn, sortTeams, DEFAULT_TEAM_ORDER, DEFAULT_TEAM_CATEGORIES, DEFAULT_TEAM_ORDER_VERSION, roundPrecise, getLocalDateString } from './utils';
import { useCapacityAnalysis } from './hooks/useCapacityAnalysis';
import CapacityAnalysis from './components/CapacityAnalysis';
import ProductionOutputReport from './components/ProductionOutputReport';
import OneClickImport from './components/OneClickImport';
import Combobox from './components/Combobox';
import { DraggableTeamList } from './components/DraggableTeamList';
import ProductionCalendar from './components/ProductionCalendar';
import ExceptionMonitoring from './components/ExceptionMonitoring';
import { ProductionSchedule } from './components/ProductionSchedule';
import { ProductionReporting } from './components/ProductionReporting';
import { ResourceGrouping } from './components/ResourceGrouping';
import { StandardLaborHours } from './components/StandardLaborHours';
import { ProcessCycle as ProcessCycleComponent } from './components/ProcessCycle';
import { TargetLaborHours } from './components/TargetLaborHours';
import UnissuedMaterials from './components/UnissuedMaterials';
import MaterialShortageAnalysis from './components/MaterialShortageAnalysis';
import { SettingsPage } from './components/SettingsPage';
import { ProductionDemand, ProductionResource, StandardTime, ProcessCycle, AnalysisResult, SystemSettings, MonthlyTeamAnalysis, TargetWorkingHour, JobReport, UnissuedMaterial } from './types';

type Tab = 'analysis' | 'output-report' | 'material-shortage' | 'one-click-import' | 'demand' | 'resources' | 'standard-time' | 'process-cycle' | 'target-working-hour' | 'job-report' | 'unissued' | 'calendar' | 'settings' | 'exceptions';

interface SystemMessage {
  id: string;
  type: 'success' | 'warning' | 'info' | 'error';
  title: string;
  content: string;
  time: Date;
  isRead: boolean;
  category: 'import' | 'exception' | 'system';
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('analysis');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({ 'base-data': true });

  const [settings, setSettings] = useState<SystemSettings>(() => {
    try {
      const saved = localStorage.getItem('aps_settings');
      const parsed = saved ? JSON.parse(saved) || {} : {};
      const isVersionMatch = parsed.teamOrderVersion === DEFAULT_TEAM_ORDER_VERSION;
      return {
        schedulingStrategy: parsed.schedulingStrategy || 'EDD',
        alertThreshold: parsed.alertThreshold || 85,
        displayDensity: parsed.displayDensity || 'comfortable',
        calendarOverrides: parsed.calendarOverrides || {},
        teamOrder: isVersionMatch && Array.isArray(parsed.teamOrder) 
          ? parsed.teamOrder.filter(Boolean) 
          : DEFAULT_TEAM_ORDER,
        teamCategories: isVersionMatch && Array.isArray(parsed.teamCategories)
          ? parsed.teamCategories
          : DEFAULT_TEAM_CATEGORIES,
        teamOrderVersion: DEFAULT_TEAM_ORDER_VERSION,
        defaultCycleDays: parsed.defaultCycleDays ?? 2,
        aggregationLogic: parsed.aggregationLogic || 'startDate'
      };
    } catch {
      return {
        schedulingStrategy: 'EDD',
        alertThreshold: 85,
        displayDensity: 'comfortable',
        calendarOverrides: {},
        teamOrder: DEFAULT_TEAM_ORDER,
        teamCategories: DEFAULT_TEAM_CATEGORIES,
        teamOrderVersion: DEFAULT_TEAM_ORDER_VERSION,
        defaultCycleDays: 2,
        aggregationLogic: 'startDate'
      };
    }
  });

  const [tempSettings, setTempSettings] = useState<SystemSettings | null>(null);

  // Initialize tempSettings when entering settings tab
  useEffect(() => {
    if (activeTab === 'settings') {
      setTempSettings(JSON.parse(JSON.stringify(settings)));
    }
  }, [activeTab, settings]);
  const [dashboardFilters, setDashboardFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('aps_dashboard_filters');
      return saved ? JSON.parse(saved) : { year: 'all', month: 'all', team: 'all' };
    } catch {
      return { year: 'all', month: 'all', team: 'all' };
    }
  });
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language, i18n]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isConfirmingClearProcessCycles, setIsConfirmingClearProcessCycles] = useState(false);
  const [isConfirmingClearResources, setIsConfirmingClearResources] = useState(false);
  const [isConfirmingClearDemands, setIsConfirmingClearDemands] = useState(false);
  const [isConfirmingClearTargetWorkingHours, setIsConfirmingClearTargetWorkingHours] = useState(false);
  const [excludeAbnormalOrders, setExcludeAbnormalOrders] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; type: 'success' | 'error' | 'info'; message: string }[]>([]);
  const [systemMessages, setSystemMessages] = useState<SystemMessage[]>([]);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const [importStatus, setImportStatus] = useState<Record<string, { fileName: string; time: string; error?: string }>>(() => {
    try {
      const saved = localStorage.getItem('aps_import_status');
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      // 额外安全检查：过滤掉可能遗留在存储中的错误状态
      const filtered: Record<string, any> = {};
      Object.keys(parsed).forEach(key => {
        if (!parsed[key].error) {
          filtered[key] = parsed[key];
        }
      });
      return filtered;
    } catch { return {}; }
  });

  const updateImportStatus = (type: string, fileName: string, error?: string) => {
    const time = new Date().toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    setImportStatus(prev => {
      const next = { ...prev, [type]: { fileName, time, error } };
      
      // 持久化部分仅包含成功导入的记录
      const persistent: Record<string, any> = {};
      Object.keys(next).forEach(key => {
        if (!next[key].error) {
          persistent[key] = next[key];
        }
      });
      localStorage.setItem('aps_import_status', JSON.stringify(persistent));
      
      return next;
    });
  };

  const clearImportStatus = (type: string) => {
    setImportStatus(prev => {
      const next = { ...prev };
      delete next[type];
      localStorage.setItem('aps_import_status', JSON.stringify(next));
      return next;
    });
  };

  const addSystemMessage = (message: Omit<SystemMessage, 'id' | 'time' | 'isRead'>) => {
    const newMessage: SystemMessage = {
      ...message,
      id: Math.random().toString(36).substr(2, 9),
      time: new Date(),
      isRead: false
    };
    setSystemMessages(prev => [newMessage, ...prev].slice(0, 50));
  };

  const markAllAsRead = () => {
    setSystemMessages(prev => prev.map(m => ({ ...m, isRead: true })));
  };

  const clearMessages = () => {
    setSystemMessages([]);
  };

  const [demands, setDemands] = useState<ProductionDemand[]>([]);
  const [jobReports, setJobReports] = useState<JobReport[]>([]);
  const [unissuedMaterials, setUnissuedMaterials] = useState<UnissuedMaterial[]>([]);
  const [showDemandsList, setShowDemandsList] = useState<boolean>(false);
  const [showJobReportsList, setShowJobReportsList] = useState<boolean>(false);
  const [showUnissuedMaterialsList, setShowUnissuedMaterialsList] = useState<boolean>(false);
  const [materialShortageFilters, setMaterialShortageFilters] = useState({ year: 'all', month: 'all' });
  const [searchProcessCycle, setSearchProcessCycle] = useState('');
  const [searchTargetWorkingHour, setSearchTargetWorkingHour] = useState('');
  const [searchResource, setSearchResource] = useState('');
  const [searchStandardTime, setSearchStandardTime] = useState('');
  const [isImportingDemands, setIsImportingDemands] = useState(false);
  const [isImportingJobReports, setIsImportingJobReports] = useState(false);
  const [isConfirmingClearJobReports, setIsConfirmingClearJobReports] = useState(false);

  const addNotification = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };
  const [resources, setResources] = useState<ProductionResource[]>(() => {
    try {
      const saved = localStorage.getItem('aps_resources');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch { return []; }
  });
  const [standardTimes, setStandardTimes] = useState<StandardTime[]>(() => {
    try {
      const saved = localStorage.getItem('aps_standard_times');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch { return []; }
  });
  const [processCycles, setProcessCycles] = useState<ProcessCycle[]>(() => {
    try {
      const saved = localStorage.getItem('aps_process_cycles');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch { return []; }
  });
  const [targetWorkingHours, setTargetWorkingHours] = useState<TargetWorkingHour[]>(() => {
    try {
      const saved = localStorage.getItem('aps_target_working_hours');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch { return []; }
  });

  // 自动同步导入状态与实际数据：当数据为空时，清除对应的导入标记
  useEffect(() => {
    if (demands.length === 0 && importStatus['demand']) clearImportStatus('demand');
    if (resources.length === 0 && importStatus['resources']) clearImportStatus('resources');
    if (standardTimes.length === 0 && importStatus['standard-time']) clearImportStatus('standard-time');
    if (processCycles.length === 0 && importStatus['process-cycle']) clearImportStatus('process-cycle');
    if (jobReports.length === 0 && importStatus['job-report']) clearImportStatus('job-report');
    if (targetWorkingHours.length === 0 && importStatus['target-working-hour']) clearImportStatus('target-working-hour');
  }, [demands.length, resources.length, standardTimes.length, processCycles.length, jobReports.length, targetWorkingHours.length, importStatus]);

  const filteredProcessCycles = useMemo(() => {
    if (!searchProcessCycle.trim()) return processCycles;
    const search = searchProcessCycle.toLowerCase().trim();
    return processCycles.filter(pc => 
      (pc.opCode || '').toLowerCase().includes(search) || 
      (pc.opName || '').toLowerCase().includes(search)
    );
  }, [processCycles, searchProcessCycle]);

  const filteredTargetWorkingHours = useMemo(() => {
    if (!searchTargetWorkingHour.trim()) return targetWorkingHours;
    const search = searchTargetWorkingHour.toLowerCase().trim();
    return targetWorkingHours.filter(t => 
      (t.team || '').toLowerCase().includes(search)
    );
  }, [targetWorkingHours, searchTargetWorkingHour]);

  const filteredResources = useMemo(() => {
    let result = resources;
    
    if (searchResource.trim()) {
      const search = searchResource.toLowerCase().trim();
      result = result.filter(r => 
        (r.id || '').toLowerCase().includes(search) || 
        (r.groupName || '').toLowerCase().includes(search)
      );
    }
    
    return result;
  }, [resources, searchResource]);

  const filteredStandardTimes = useMemo(() => {
    if (!searchStandardTime.trim()) return standardTimes;
    const search = searchStandardTime.toLowerCase().trim();
    return standardTimes.filter(s => 
      (s.team || '').toLowerCase().includes(search)
    );
  }, [standardTimes, searchStandardTime]);

  const isRowModified = (item: StandardTime | ProcessCycle | ProductionResource | ProductionDemand | TargetWorkingHour) => {
    if (!item.original) return false;
    
    if ('orderNo' in item) {
      // ProductionDemand
      const itm = item as ProductionDemand;
      const orig = itm.original as any;
      return (
        itm.orderNo !== orig.orderNo ||
        itm.componentCode !== orig.componentCode ||
        itm.componentDesc !== orig.componentDesc ||
        itm.opNo !== orig.opNo ||
        itm.opCode !== orig.opCode ||
        itm.opDesc !== orig.opDesc ||
        itm.resourceGroupId !== orig.resourceGroupId ||
        itm.dueDate !== orig.dueDate ||
        itm.requiredQty !== orig.requiredQty ||
        itm.completedQty !== orig.completedQty ||
        itm.actualHours !== orig.actualHours
      );
    } else if ('peopleCount' in item && 'peopleOle' in item) {
      // StandardTime (Must be checked before ProductionResource if using 'team' check)
      const itm = item as any;
      const orig = itm.original as any;
      return (
        itm.team !== orig.team ||
        itm.peopleCount !== orig.peopleCount ||
        itm.peopleShifts !== orig.peopleShifts ||
        itm.peopleDuration !== orig.peopleDuration ||
        itm.peopleOle !== orig.peopleOle ||
        itm.machineCount !== orig.machineCount ||
        itm.machineShifts !== orig.machineShifts ||
        itm.machineDuration !== orig.machineDuration ||
        itm.machineOee !== orig.machineOee
      );
    } else if ('groupName' in item) {
      // ProductionResource
      const itm = item as ProductionResource;
      const orig = itm.original as any;
      return (
        itm.id !== orig.id ||
        itm.groupName !== orig.groupName ||
        itm.team !== orig.team ||
        itm.workshop !== orig.workshop
      );
    } else if ('opCode' in item) {
      // ProcessCycle
      const itm = item as ProcessCycle;
      const orig = itm.original as any;
      return (
        itm.opCode !== orig.opCode ||
        itm.opName !== orig.opName ||
        itm.standardCycleDays !== orig.standardCycleDays ||
        itm.expeditedCycleDays !== orig.expeditedCycleDays
      );
    } else if ('dailyTarget' in item) {
      // TargetWorkingHour
      const itm = item as TargetWorkingHour;
      const orig = itm.original as any;
      return (
        itm.team !== orig.team ||
        itm.dailyTarget !== orig.dailyTarget
      );
    }
    return false;
  };

  const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, allowDecimal: boolean = true) => {
    // Block e, E, +, -
    if (['e', 'E', '+', '-'].includes(e.key)) {
      e.preventDefault();
    }
    // Block . if not allowed
    if (!allowDecimal && e.key === '.') {
      e.preventDefault();
    }
  };

  const isFieldModified = <T extends StandardTime | ProcessCycle | ProductionResource | ProductionDemand | TargetWorkingHour>(item: T, field: string) => {
    if (!item.original) return false;
    return (item as any)[field] !== (item.original as any)[field];
  };

  const restoreRow = (idx: number, type: 'standard' | 'process' | 'resource' | 'target') => {
    if (type === 'standard') {
      const item = standardTimes[idx];
      if (!item.original) return;
      const newTimes = [...standardTimes];
      newTimes[idx] = { ...item, ...item.original };
      setStandardTimes(newTimes);
      addNotification('info', t('st.restore_success', { team: item.team }));
    } else if (type === 'process') {
      const item = processCycles[idx];
      if (!item.original) return;
      const newCycles = [...processCycles];
      newCycles[idx] = { ...item, ...item.original };
      setProcessCycles(newCycles);
      addNotification('info', `已恢复工序 "${item.opName || item.opCode}" 的原始数据`);
    } else if (type === 'target') {
      const item = targetWorkingHours[idx];
      if (!item.original) return;
      const newTargets = [...targetWorkingHours];
      newTargets[idx] = { ...item, ...item.original };
      setTargetWorkingHours(newTargets);
      addNotification('info', `已恢复班组 "${item.team}" 的目标工时数据`);
    } else {
      const item = resources[idx];
      if (!item.original) return;
      const newResources = [...resources];
      newResources[idx] = { ...item, ...item.original };
      setResources(newResources);
      addNotification('info', `已恢复资源组 "${item.groupName}" 的原始数据`);
    }
  };

  // Auto-save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('aps_resources', JSON.stringify(resources));
      localStorage.setItem('aps_standard_times', JSON.stringify(standardTimes));
      localStorage.setItem('aps_process_cycles', JSON.stringify(processCycles));
      localStorage.setItem('aps_target_working_hours', JSON.stringify(targetWorkingHours));
      localStorage.setItem('aps_settings', JSON.stringify(settings));
      localStorage.setItem('aps_dashboard_filters', JSON.stringify(dashboardFilters));
    } catch (e) {
      console.warn('Failed to save to localStorage, possibly due to quota limits:', e);
    }
  }, [resources, standardTimes, processCycles, targetWorkingHours, settings, dashboardFilters]);

  // Real capacity analysis calculation logic
  const analysisResult = useCapacityAnalysis(demands, resources, standardTimes, settings, processCycles, excludeAbnormalOrders);

  // Monitor exceptions for system messages
  const lastExceptionCount = useRef({ rg: 0, op: 0 });
  useEffect(() => {
    const rgCount = analysisResult.exceptions.unmatchedResourceGroups.length;
    const opCount = analysisResult.exceptions.unmatchedOperations.length;

    if (rgCount > 0 || opCount > 0) {
      if (rgCount !== lastExceptionCount.current.rg || opCount !== lastExceptionCount.current.op) {
        const parts = [];
        if (rgCount > 0) parts.push(t('exc.warning_rg', { count: rgCount }));
        if (opCount > 0) parts.push(t('exc.warning_op', { count: opCount }));
        
        addSystemMessage({
          type: 'warning',
          title: t('exc.warning_title'),
          content: t('exc.warning_content', { parts: parts.join(t('exc.and')) }),
          category: 'exception'
        });
      }
    }
    lastExceptionCount.current = { rg: rgCount, op: opCount };
  }, [analysisResult.exceptions]);

  // Close bell dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOneClickImport = async (type: string, file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          // ... (existing parsing logic)
          // I will use a flag to track success
          let success = false;
          
          const arrayBuffer = event.target?.result as ArrayBuffer;
          let workbook;
          if (file.name.toLowerCase().endsWith('.csv')) {
            let text;
            try {
              const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
              text = utf8Decoder.decode(arrayBuffer);
            } catch (e) {
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
            const errorMsg = '文件内容为空。';
            addNotification('error', errorMsg);
            updateImportStatus(type, file.name, errorMsg);
            resolve(false);
            return;
          }

          if (type === 'demand') {
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
               const errorMsg = t('oci.error_header');
               addNotification('error', errorMsg);
               updateImportStatus('demand', file.name, errorMsg);
               resolve(false);
               return;
            }
            const headerRow = rawRows[headerIndex];
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

            const formatted: ProductionDemand[] = [];
            const dataRows = rawRows.slice(headerIndex + 1);
            const CHUNK_SIZE = 500;
            
            for (let i = 0; i < dataRows.length; i += CHUNK_SIZE) {
              const chunk = dataRows.slice(i, i + CHUNK_SIZE);
              const formattedChunk = chunk.filter(row => row && row.length > 0 && row[colMap.orderNo] !== undefined && String(row[colMap.orderNo]).trim() !== '').map((row, idx) => {
                const rawRow: any = {};
                headerRow.forEach((header, i) => {
                  if (header !== undefined && header !== null) {
                    rawRow[String(header)] = row[i];
                  }
                });

                const data = {
                  id: `dem-import-oneclick-${Date.now()}-${i + idx}`,
                  orderNo: String(row[colMap.orderNo] ?? '').trim(),
                  orderLevelNo: String(row[colMap.orderLevelNo] ?? '').trim(),
                  workOrderOpNo: String(row[colMap.workOrderOpNo] ?? '').trim(),
                  componentCode: String(row[colMap.componentCode] ?? '').trim(),
                  componentDesc: colMap.componentDesc !== -1 ? String(row[colMap.componentDesc] ?? '').trim() : '',
                  partNumber: colMap.partNumber !== -1 ? String(row[colMap.partNumber] ?? '').trim() : '',
                  opNo: colMap.opNo !== -1 ? String(row[colMap.opNo] ?? '').trim() : '',
                  opCode: colMap.opCode !== -1 ? String(row[colMap.opCode] ?? '').trim() : '',
                  opDesc: colMap.opDesc !== -1 ? String(row[colMap.opDesc] ?? '').trim() : '',
                  resourceGroupId: String(row[colMap.resourceGroupId] ?? '').trim(),
                  resourceGroupDesc: colMap.resourceGroupDesc !== -1 ? String(row[colMap.resourceGroupDesc] ?? '').trim() : '',
                  dueDate: formatExcelDate(row[colMap.dueDate]),
                  requiredQty: parseFloat(row[colMap.requiredQty]) || 0,
                  completedQty: colMap.completedQty !== -1 ? parseFloat(row[colMap.completedQty]) || 0 : 0,
                  actualHours: colMap.actualHours !== -1 ? parseFloat(row[colMap.actualHours]) || 0 : 0,
                  rejectedQty: colMap.rejectedQty !== -1 ? parseFloat(row[colMap.rejectedQty]) || 0 : 0,
                  isCompleted: colMap.isCompleted !== -1 ? String(row[colMap.isCompleted] ?? '').trim().toUpperCase() === 'TRUE' : false,
                  isStartConditionMet: colMap.isStartConditionMet !== -1 ? (String(row[colMap.isStartConditionMet] ?? '').trim() === '' || String(row[colMap.isStartConditionMet] ?? '').trim() === '正常') : true,
                  shortageDetails: colMap.shortageDetails !== -1 ? String(row[colMap.shortageDetails] ?? '').trim() : '',
                  rawRow
                } as ProductionDemand;
                return { ...data, original: { ...data } };
              });
              formatted.push(...formattedChunk);
              // Yield to UI thread
              await new Promise(resolve => requestAnimationFrame(resolve));
            }
            setDemands(formatted);
            updateImportStatus('demand', file.name);
            addNotification('success', t('oci.import_success_demand', { count: formatted.length }));
            success = true;
          } else if (type === 'resources') {
            const matchOptions = [
              ['资源组ID', '资源组ID_Resource Group ID'],
              ['资源组描述', '资源组描述_Description'],
              ['班组', '班组_Team'],
              ['车间', '车间_Workshop']
            ];
            let headerIndex = -1;
            let colMap: Record<string, number> = {};
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
                colMap = { id: idCol, groupName: descCol, team: teamCol, workshop: workshopCol };
                break;
              }
            }
            if (headerIndex !== -1) {
              const formatted = rawRows.slice(headerIndex + 1).filter(r => r && r.length > 0 && r[colMap.id] !== undefined && String(r[colMap.id]).trim() !== '').map((row, idx) => {
                const data = {
                  id: String(row[colMap.id] ?? '').trim() || `res-import-${Date.now()}-${idx}`,
                  groupName: String(row[colMap.groupName] ?? '').trim() || t('oci.unknown_resource_group'),
                  team: String(row[colMap.team] ?? '').trim() || '',
                  workshop: String(row[colMap.workshop] ?? '').trim() || ''
                } as ProductionResource;
                return { ...data, original: { ...data } };
              });
              setResources(formatted);
              updateImportStatus('resources', file.name);
              addNotification('success', t('oci.import_success_resources', { count: formatted.length }));
              success = true;
            } else {
              const errorMsg = t('oci.error_header_resources');
              addNotification('error', errorMsg);
              updateImportStatus('resources', file.name, errorMsg);
              resolve(false);
              return;
            }
          } else if (type === 'standard-time') {
            let headerIndex = -1;
            let colMap: Record<string, number> = {};
            for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
              const row = rawRows[i];
              if (!row) continue;
              const getCol = (aliases: string[]) => row.findIndex(c => aliases.includes(String(c || '').trim()));
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
            if (headerIndex !== -1) {
              const formatted = rawRows.slice(headerIndex + 1).filter(r => r && r.length > 0 && r[colMap.team] !== undefined && String(r[colMap.team]).trim() !== '').map((row, idx) => {
                const data = {
                  id: `st-import-${Date.now()}-${idx}`,
                  team: String(row[colMap.team] || '').trim() || t('st.unknown_team'),
                  peopleCount: Math.round(parseFloat(row[colMap.peopleCount]) || 0),
                  peopleShifts: colMap.peopleShifts !== -1 ? Math.max(0, roundPrecise(parseFloat(row[colMap.peopleShifts]) || 1, 1)) : 1,
                  peopleDuration: colMap.peopleDuration !== -1 ? Math.max(0, roundPrecise(parseFloat(row[colMap.peopleDuration]) || 11, 1)) : 11,
                  peopleOle: colMap.peopleOle !== -1 ? Math.max(0, roundPrecise(parseFloat(row[colMap.peopleOle]) || 0.7, 2)) : 0.7,
                  machineCount: Math.round(parseFloat(row[colMap.machineCount]) || 0),
                  machineShifts: colMap.machineShifts !== -1 ? Math.max(0, roundPrecise(parseFloat(row[colMap.machineShifts]) || 1, 1)) : 1,
                  machineDuration: colMap.machineDuration !== -1 ? Math.max(0, roundPrecise(parseFloat(row[colMap.machineDuration]) || 11, 1)) : 11,
                  machineOee: colMap.machineOee !== -1 ? Math.max(0, roundPrecise(parseFloat(row[colMap.machineOee]) || 0.7, 2)) : 0.7
                } as StandardTime;
                return { ...data, original: { ...data } };
              });
              setStandardTimes(formatted);
              updateImportStatus('standard-time', file.name);
              addNotification('success', t('st.import_success', { count: formatted.length }));
              success = true;
            } else {
              const errorMsg = t('st.error_header');
              addNotification('error', errorMsg);
              updateImportStatus('standard-time', file.name, errorMsg);
              resolve(false);
              return;
            }
          } else if (type === 'process-cycle') {
             const matchOptions = [
               ['工序ID', '工序ID_Process ID'],
               ['工序描述', '工序描述_Description'],
               ['标准模式（天）', '标准模式（天）_Standard (Days)', '标准模式'],
               ['急件模式（天）', '急件模式（天）_Expedited (Days)', '急件模式'],
               ['启用急件模式', '启用急件模式_Is Urgent']
             ];
             let headerIndex = -1;
             let colMap: Record<string, number> = {};
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
                 colMap = { opCode: idCol, opName: descCol, standardCycleDays: standardCol, expeditedCycleDays: expeditedCol, isUrgent: urgentCol };
                 break;
               }
             }
             if (headerIndex !== -1) {
               const formatted = rawRows.slice(headerIndex + 1).filter(r => r && r.length > 0 && r[colMap.opCode] !== undefined && String(r[colMap.opCode]).trim() !== '').map((row, idx) => {
                 let isUrgentValue = false;
                 if (colMap.isUrgent !== -1 && row[colMap.isUrgent] !== undefined) {
                   const val = String(row[colMap.isUrgent]).trim().toLowerCase();
                   isUrgentValue = val === 'true' || val === '1' || val === '是' || val === 'yes';
                 }
                 const data = {
                   id: `pc-import-${Date.now()}-${idx}`,
                   opCode: String(row[colMap.opCode] ?? '').trim(),
                   opName: String(row[colMap.opName] ?? '').trim(),
                   standardCycleDays: Math.round(parseFloat(String(row[colMap.standardCycleDays]))) || 0,
                   expeditedCycleDays: colMap.expeditedCycleDays !== -1 ? (Math.round(parseFloat(String(row[colMap.expeditedCycleDays]))) || 0) : 0,
                   isUrgent: isUrgentValue
                 } as ProcessCycle;
                 return { ...data, original: { ...data } };
               });
               setProcessCycles(formatted);
               updateImportStatus('process-cycle', file.name);
               addNotification('success', t('oci.import_success_process', { count: formatted.length }));
               success = true;
             } else {
               const errorMsg = t('oci.error_header_process');
               addNotification('error', errorMsg);
               updateImportStatus('process-cycle', file.name, errorMsg);
               resolve(false);
               return;
             }
          } else if (type === 'job-report') {
            const targetHeaders = ['工单工序号', '报工时间', '物料编码', '工序号', '工序描述', '合格数量', 'DMR让步接收数量', '资源组ID', '标准工时'];
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
            if (headerIndex !== -1) {
               const headerRow = rawRows[headerIndex];
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
               const formatted = rawRows.slice(headerIndex + 1).filter(r => r && r[colMapping.workOrderOpNo]).map((row, idx) => {
                 const rawRowObj: any = {};
                 headerRow.forEach((header, index) => {
                   if (header !== undefined && header !== null) rawRowObj[String(header)] = row[index];
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
                 } as JobReport;
               });
               setJobReports(formatted);
               updateImportStatus('job-report', file.name);
               addNotification('success', t('oci.import_success_job', { count: formatted.length }));
               success = true;
            } else {
              const errorMsg = t('oci.error_header');
              addNotification('error', errorMsg);
              updateImportStatus('job-report', file.name, errorMsg);
              resolve(false);
              return;
            }
          } else if (type === 'target-working-hour') {
            const matchOptions = [
              ['班组', '班组_Team'],
              ['日均目标（H）', '日均目标（H）_Daily Target (H)', '日均目标']
            ];
             let headerIndex = -1;
             let colMap: Record<string, number> = {};
             for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
               const row = rawRows[i];
               if (!row) continue;
               const getIndex = (aliases: string[]) => row.findIndex(cell => aliases.includes(String(cell || '').trim()));
               const teamCol = getIndex(matchOptions[0]);
               const dailyCol = getIndex(matchOptions[1]);
               if (teamCol !== -1 && dailyCol !== -1) {
                 headerIndex = i;
                 colMap = { team: teamCol, dailyTarget: dailyCol };
                 break;
               }
             }
             if (headerIndex !== -1) {
               const formatted = rawRows.slice(headerIndex + 1).filter(r => r && r.length > 0 && r[colMap.team] !== undefined && String(r[colMap.team]).trim() !== '').map((row, idx) => {
                  const data = {
                    id: `twh-import-${Date.now()}-${idx}`,
                    team: String(row[colMap.team] ?? '').trim(),
                    dailyTarget: colMap.dailyTarget !== -1 ? Math.max(0, Math.round(parseFloat(String(row[colMap.dailyTarget])) || 0)) : 0
                  } as TargetWorkingHour;
                  return { ...data, original: { ...data } };
               });
               setTargetWorkingHours(formatted);
               updateImportStatus('target-working-hour', file.name);
               addNotification('success', t('oci.import_success_target', { count: formatted.length }));
               success = true;
             } else {
               const errorMsg = t('oci.error_header_target');
               addNotification('error', errorMsg);
               updateImportStatus('target-working-hour', file.name, errorMsg);
               resolve(false);
               return;
             }
          }
          resolve(success);
        } catch (err) {
          console.error('Import failed:', err);
          const errorMsg = t('oci.error_import');
          addNotification('error', errorMsg);
          updateImportStatus(type, file.name, errorMsg);
          resolve(false);
        }
      };
      reader.onerror = () => {
        const errorMsg = t('oci.error_read');
        addNotification('error', errorMsg);
        updateImportStatus(type, file.name, errorMsg);
        resolve(false);
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const navItems = [
    { id: 'analysis', label: t('nav.analysis'), icon: LayoutDashboard },
    { id: 'output-report', label: t('nav.output_report'), icon: Folder },
    { id: 'material-shortage', label: t('nav.material_analysis'), icon: Package },
    { 
      id: 'base-data', 
      label: t('nav.base_data', '基础数据'), 
      icon: Database,
      children: [
        { id: 'one-click-import', label: t('nav.one_click_import'), icon: CloudCog },
        { id: 'demand', label: t('nav.demand'), icon: ChartNoAxesGantt },
        { id: 'job-report', label: t('nav.job_report'), icon: ClipboardCheck },
        { id: 'unissued', label: t('nav.unissued'), icon: PackageSearch },
        { id: 'resources', label: t('nav.resources'), icon: Network },
        { id: 'standard-time', label: t('nav.standard_time'), icon: Timer },
        { id: 'process-cycle', label: t('nav.process_cycle'), icon: Clock },
        { id: 'target-working-hour', label: t('nav.target_working_hour'), icon: Flag },
      ]
    },
    { id: 'calendar', label: t('nav.calendar'), icon: Calendar },
    { id: 'exceptions', label: t('nav.exceptions'), icon: AlertCircle },
  ];

  const hasException = analysisResult.exceptions.unmatchedResourceGroups.length > 0 || analysisResult.exceptions.unmatchedOperations.length > 0;

  const renderContent = () => {
    switch (activeTab) {
      case 'output-report':
        return (
          <ProductionOutputReport 
            jobReports={jobReports}
            targetWorkingHours={targetWorkingHours}
            resources={resources}
            standardTimes={standardTimes}
            settings={settings}
            addNotification={addNotification}
          />
        );
      case 'analysis':
        return (
          <CapacityAnalysis 
            data={analysisResult} 
            demands={demands} 
            resources={resources} 
            settings={settings} 
            filters={dashboardFilters}
            onFiltersChange={setDashboardFilters}
            excludeAbnormalOrders={excludeAbnormalOrders}
            onExcludeAbnormalOrdersChange={setExcludeAbnormalOrders}
            addNotification={addNotification}
          />
        );
      case 'demand':
        return (
          <ProductionSchedule
            demands={demands}
            setDemands={setDemands}
            addNotification={addNotification}
            addSystemMessage={addSystemMessage}
            importStatus={importStatus}
            updateImportStatus={updateImportStatus}
            clearImportStatus={clearImportStatus}
            analysisResult={analysisResult}
            roundPrecise={roundPrecise}
          />
        );
      case 'job-report':
        return (
          <ProductionReporting
            jobReports={jobReports}
            setJobReports={setJobReports}
            resources={resources}
            addNotification={addNotification}
            addSystemMessage={addSystemMessage}
            importStatus={importStatus}
            updateImportStatus={updateImportStatus}
            clearImportStatus={clearImportStatus}
            roundPrecise={roundPrecise}
          />
        );
      case 'unissued':
        return (
          <UnissuedMaterials
            persistedData={unissuedMaterials}
            onDataChange={(newData) => {
              setUnissuedMaterials(newData);
              if (newData && newData.length > 0) {
                const now = new Date();
                const currentYear = now.getFullYear().toString();
                const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
                setMaterialShortageFilters({
                  year: currentYear,
                  month: currentMonth
                });
              }
            }}
            persistedShowList={showUnissuedMaterialsList}
            onShowListChange={setShowUnissuedMaterialsList}
          />
        );
      case 'material-shortage':
        return (
          <MaterialShortageAnalysis
            unissuedData={unissuedMaterials}
            filters={materialShortageFilters}
            onFilterChange={setMaterialShortageFilters}
          />
        );
      case 'resources':
        return (
          <ResourceGrouping
            resources={resources}
            setResources={setResources}
            addNotification={addNotification}
            importStatus={importStatus}
            updateImportStatus={updateImportStatus}
            clearImportStatus={clearImportStatus}
          />
        );
      case 'standard-time':
        return (
          <StandardLaborHours
            standardTimes={standardTimes}
            setStandardTimes={setStandardTimes}
            addNotification={addNotification}
            importStatus={importStatus}
            updateImportStatus={updateImportStatus}
            clearImportStatus={clearImportStatus}
            roundPrecise={roundPrecise}
          />
        );
      case 'process-cycle':
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
                                } catch (e) {
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

                              // 1. Find Header Row and Validate
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

                              // 2. Extract Data
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
                        
                        // Set default row height
                        worksheet.properties.defaultRowHeight = 20;

                        const headers = ['工序ID_Process ID', '工序描述_Description', '标准模式（天）_Standard (Days)', '急件模式（天）_Expedited (Days)', '启用急件模式_Is Urgent'];
                        const headerRow = worksheet.addRow(headers);
                        headerRow.height = 20;
                        
                        // Style header row
                        headerRow.eachCell((cell) => {
                          cell.font = { bold: true };
                          cell.alignment = { vertical: 'middle', horizontal: 'left' };
                          cell.fill = {
                            type: 'pattern' as const,
                            pattern: 'solid' as const,
                            fgColor: { argb: '00B0F0' } // Vibrant Blue
                          };
                        });

                        // Add Filter
                        worksheet.autoFilter = {
                          from: { row: 1, column: 1 },
                          to: { row: 1, column: headers.length }
                        };

                        // Add data rows
                        exportData.forEach(data => {
                          const row = worksheet.addRow(Object.values(data));
                          row.alignment = { vertical: 'middle', horizontal: 'left' };
                        });

                        // Set column widths
                        worksheet.columns.forEach((col) => {
                          col.width = 20; // Slightly wider for bilingual
                        });

                        // Apply borders to all cells
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
                    {filteredProcessCycles.map((item, index) => {
                      const rowModified = isRowModified(item);
                      // Find the actual index in the original array for updates
                      const originalIdx = processCycles.findIndex(pc => pc.id === item.id);
                      return (
                        <tr key={`${item.id}-${index}`} className={cn(
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
                                setProcessCycles(prev => {
                                  const next = [...prev];
                                  next[originalIdx] = { ...next[originalIdx], isUrgent: !item.isUrgent };
                                  return next;
                                });
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
                                  onClick={() => restoreRow(originalIdx, 'process')}
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
      case 'target-working-hour':
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
                              if (file.name.toLowerCase().endsWith('.csv')) {
                                workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
                              } else {
                                workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
                              }
                              
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                              
                              if (rawRows.length === 0) {
                                addNotification('error', t('twh.error_empty'));
                                return;
                              }

                              // 1. Find Header Row and Validate
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

                              // 2. Extract Data
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
                        
                        // Set default row height
                        worksheet.properties.defaultRowHeight = 20;

                        const headers = ['班组_Team', '日均目标（H）_Daily Target (H)'];
                        const headerRow = worksheet.addRow(headers);
                        headerRow.height = 20;
                        
                        // Style header row
                        headerRow.eachCell((cell) => {
                          cell.font = { bold: true };
                          cell.alignment = { vertical: 'middle', horizontal: 'left' };
                          cell.fill = {
                            type: 'pattern' as const,
                            pattern: 'solid' as const,
                            fgColor: { argb: '00B0F0' } 
                          };
                        });

                        // Add Filter
                        worksheet.autoFilter = {
                          from: { row: 1, column: 1 },
                          to: { row: 1, column: headers.length }
                        };

                        // Add data rows
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
                    {filteredTargetWorkingHours.map((item, index) => {
                      const rowModified = isRowModified(item);
                      const originalIdx = targetWorkingHours.findIndex(t => t.id === item.id);
                      return (
                        <tr key={`${item.id}-${index}`} className={cn(
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
                                  onClick={() => restoreRow(originalIdx, 'target')}
                                  className="p-1.5 text-amber-500 hover:bg-amber-100 rounded-lg transition-all"
                                  title={t('twh.restore')}
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                              <button 
                                onClick={() => setTargetWorkingHours(targetWorkingHours.filter(t => t.id !== item.id))}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                title="删除目标"
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
      case 'calendar':
        return <ProductionCalendar settings={settings} onSettingsChange={setSettings} />;
      case 'exceptions':
        return <ExceptionMonitoring analysisResult={analysisResult} />;
      case 'one-click-import':
        return <OneClickImport onImport={handleOneClickImport} importStatus={importStatus} />;
      case 'settings':
        if (!tempSettings) return <div className="flex items-center justify-center h-64 text-slate-400">正在加载设置...</div>;
        
        const hasSettingsChanged = JSON.stringify(tempSettings) !== JSON.stringify(settings);
        
        return (
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">系统设置</h2>
              </div>
              <div className="flex items-center gap-3 min-h-[44px]">
                <AnimatePresence>
                  {hasSettingsChanged && (
                    <>
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setActiveTab('analysis')}
                        className="flex items-center gap-2 bg-white text-slate-600 px-6 py-2.5 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 transition-all active:scale-95 text-sm shadow-sm"
                      >
                        取消修改
                      </motion.button>
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => {
                          setSettings(tempSettings);
                          addNotification('success', '系统配置已成功保存并应用。');
                          setActiveTab('analysis');
                        }}
                        className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-md shadow-slate-900/20 hover:bg-slate-800 transition-all active:scale-95 group text-sm"
                      >
                        <Save size={16} className="group-hover:scale-110 transition-transform" />
                        保存配置
                      </motion.button>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 items-start gap-6">
              {/* 班组排序设置 */}
              <div className="glass-card p-6 lg:col-span-2">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                    <Tags size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">班组展示优先级</h3>
                    <p className="text-xs text-slate-500">自定义班组在图表和表格中的显示顺序</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <DraggableTeamList 
                      categories={tempSettings.teamCategories || DEFAULT_TEAM_CATEGORIES}
                      onChange={(newCategories, newOrder) => setTempSettings({ 
                        ...tempSettings, 
                        teamCategories: newCategories,
                        teamOrder: newOrder, 
                        teamOrderVersion: DEFAULT_TEAM_ORDER_VERSION 
                      })}
                    />
                    <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                      <AlertCircle size={12} />
                      提示：系统会根据上述分类和班组名称按主类向上分类，未分类的班组将按拼音顺序排在最后。
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <button 
                      onClick={() => setTempSettings({ 
                        ...tempSettings, 
                        teamCategories: DEFAULT_TEAM_CATEGORIES,
                        teamOrder: DEFAULT_TEAM_ORDER, 
                        teamOrderVersion: DEFAULT_TEAM_ORDER_VERSION 
                      })}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors flex items-center gap-1"
                    >
                      <RotateCcw size={12} />
                      恢复默认排序和分类
                    </button>
                  </div>
                </div>
              </div>

              {/* 右侧配置列 */}
              <div className="lg:col-span-1 space-y-6">
                {/* 产能负荷计算逻辑 */}
                <div className="glass-card p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm">
                      <BarChart3 size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">产能负荷计算逻辑</h3>
                      <p className="text-xs text-slate-500">配置月度产能负荷的汇总统计方式</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3">
                      <button
                        onClick={() => setTempSettings({ ...tempSettings, aggregationLogic: 'startDate' })}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left group",
                          tempSettings.aggregationLogic === 'startDate'
                            ? "border-emerald-500 bg-emerald-50/50"
                            : "border-slate-100 hover:border-slate-200 bg-white"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                            tempSettings.aggregationLogic === 'startDate' ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
                          )}>
                            {tempSettings.aggregationLogic === 'startDate' && <Check size={12} className="text-white" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">按开始生产日期汇总</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">根据工序预计开始生产的月份进行产能统计（默认）</p>
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => setTempSettings({ ...tempSettings, aggregationLogic: 'dueDate' })}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left group",
                          tempSettings.aggregationLogic === 'dueDate'
                            ? "border-emerald-500 bg-emerald-50/50"
                            : "border-slate-100 hover:border-slate-200 bg-white"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                            tempSettings.aggregationLogic === 'dueDate' ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
                          )}>
                            {tempSettings.aggregationLogic === 'dueDate' && <Check size={12} className="text-white" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">按交货日期汇总</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">根据订单交货日期的月份进行产能统计</p>
                          </div>
                        </div>
                      </button>
                    </div>
                    
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      <AlertCircle size={10} className="inline mr-1 mb-0.5" />
                      提示：此设置将直接影响产能负荷分析计算结果。
                    </p>
                  </div>
                </div>

                {/* 参数配置 */}
                <div className="glass-card p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm">
                      <Zap size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">参数配置</h3>
                      <p className="text-xs text-slate-500">调整产能分析的核心计算参数</p>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-slate-700">工序周期默认值</label>
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          {tempSettings.defaultCycleDays} 天
                        </span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="14" 
                        step="1"
                        value={tempSettings.defaultCycleDays || 2}
                        onChange={(e) => setTempSettings({ ...tempSettings, defaultCycleDays: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-slate-400">1天</span>
                        <span className="text-[10px] text-slate-400">14天</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                        <AlertCircle size={10} className="inline mr-1 mb-0.5" />
                        提示：当系统在“工序周期”数据中匹配不到对应工序时，将自动使用此默认值进行产能分析计算。
                      </p>
                    </div>
                  </div>
                </div>

                {/* 数据与安全已移除 */}
              </div>

            </div>
          </div>
        );
      default:
        return <div className="p-8 text-center text-slate-400">功能开发中...</div>;
    }
  };

  return (
    <div className="h-screen flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-brand-dark text-white flex items-center justify-between px-6 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-4">
          <Menu 
            className="text-slate-400 cursor-pointer hover:text-white transition-colors" 
            size={20} 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          />
          <div className="flex items-center gap-3">
            <div className="h-10 flex items-center">
              <img 
                src="/logo.png" 
                alt="Hongshi Logo" 
                className="h-8 w-auto object-contain"
                onError={(e) => {
                  // Fallback to stylized H if image not found
                  e.currentTarget.style.display = 'none';
                  const placeholder = document.createElement('div');
                  placeholder.className = "w-8 h-8 bg-brand-red rounded-lg flex items-center justify-center font-bold text-lg shadow-inner";
                  placeholder.innerText = "H";
                  e.currentTarget.parentElement!.appendChild(placeholder);
                }}
              />
            </div>
            <div className="w-px h-6 bg-white/20 mx-1"></div>
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight">
                {language === 'zh' ? '供应链AI辅助系统' : 'SUPPLY CHAIN AI ASSISTANT SYSTEM'}
              </h1>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-1">
                {language === 'zh' ? 'SUPPLY CHAIN AI ASSISTANT SYSTEM' : 'Supply Chain AI Assistant System'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center bg-slate-800/50 p-1 rounded-xl border border-slate-700/50 ml-4">
            <button
              onClick={() => setLanguage('zh')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                language === 'zh' 
                  ? "bg-white text-brand-dark shadow-sm" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              中
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                language === 'en' 
                  ? "bg-white text-brand-dark shadow-sm" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              En
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={cn(
          "bg-white border-r border-slate-200 flex flex-col shadow-sm z-40 transition-all duration-300 ease-in-out",
          isSidebarOpen ? "w-64" : "w-20"
        )}>
          <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
            {navItems.map((item) => {
              const hasChildren = 'children' in item && item.children;
              const isExpanded = expandedCategories[item.id];
              const isActive = activeTab === item.id || (hasChildren && item.children!.some(child => child.id === activeTab));

              return (
                <div key={item.id} className="space-y-1">
                  <button
                    onClick={() => {
                      if (hasChildren) {
                        setExpandedCategories(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                        if (!isSidebarOpen) setIsSidebarOpen(true);
                      } else {
                        setActiveTab(item.id as Tab);
                      }
                    }}
                    className={cn(
                      "w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 group relative",
                      !hasChildren && activeTab === item.id 
                        ? "bg-brand-red/5 text-brand-red shadow-sm" 
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                      isActive && hasChildren && "text-slate-900 font-bold",
                      !isSidebarOpen && "justify-center px-0"
                    )}
                  >
                    <div className={cn("flex items-center gap-3 relative", !isSidebarOpen && "gap-0")}>
                      <item.icon size={20} className={cn(
                        "transition-transform duration-200 shrink-0",
                        activeTab === item.id || (hasChildren && isActive) ? "scale-110" : "group-hover:scale-110"
                      )} />
                      {item.id === 'exceptions' && hasException && (
                        <div 
                          className={cn(
                            "absolute bg-red-500 rounded-full border-2 border-white",
                            isSidebarOpen ? "-top-1 -left-1 w-2.5 h-2.5" : "top-0 right-0 w-3 h-3"
                          )}
                          title={t('exc.warning_tooltip')}
                        />
                      )}
                      <AnimatePresence>
                        {isSidebarOpen && (
                          <motion.span 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="text-sm font-medium whitespace-nowrap"
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                    {isSidebarOpen && (
                      <div className="ml-auto flex items-center gap-1">
                        {hasChildren ? (
                          <ChevronDown 
                            size={14} 
                            className={cn("transition-transform duration-200 opacity-40", isExpanded && "rotate-180")} 
                          />
                        ) : (
                          activeTab === item.id && <ChevronRight size={14} className="opacity-50 shrink-0" />
                        )}
                      </div>
                    )}
                  </button>

                  {/* Children Items */}
                  <AnimatePresence>
                    {isSidebarOpen && hasChildren && isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-1 ml-4 border-l border-slate-100"
                      >
                        {item.children!.map((child) => (
                          <button
                            key={child.id}
                            onClick={() => setActiveTab(child.id as Tab)}
                            className={cn(
                              "w-full flex items-center px-4 py-2 ml-2 rounded-lg transition-all duration-200 group text-sm",
                              activeTab === child.id
                                ? "bg-brand-red/5 text-brand-red font-bold"
                                : "text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <child.icon size={14} />
                              <span>{child.label}</span>
                            </div>
                            {activeTab === child.id && <div className="w-1 h-1 bg-brand-red rounded-full ml-auto" />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>
          
          <div className="p-3 border-t border-slate-100 space-y-1">
            <button
              onClick={() => setActiveTab('settings')}
              className={cn(
                "w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 group",
                activeTab === 'settings' 
                  ? "bg-slate-100 text-slate-900" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                !isSidebarOpen && "justify-center px-0"
              )}
            >
              <div className={cn("flex items-center gap-3", !isSidebarOpen && "gap-0")}>
                <Settings size={20} className="shrink-0" />
                <AnimatePresence>
                  {isSidebarOpen && (
                    <motion.span 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="text-sm font-medium whitespace-nowrap"
                    >
                      {t('nav.settings')}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50/50 p-8">
          <div key={activeTab}>
            {renderContent()}
          </div>
        </main>
      </div>
      {/* Notifications */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border min-w-[300px]",
                n.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" :
                n.type === 'error' ? "bg-red-50 border-red-100 text-red-800" :
                "bg-indigo-50 border-indigo-100 text-indigo-800"
              )}
            >
              {n.type === 'success' ? <Check size={18} className="text-emerald-500" /> :
               n.type === 'error' ? <X size={18} className="text-red-500" /> :
               <Bell size={18} className="text-indigo-500" />}
              <span className="font-medium text-sm">{n.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
