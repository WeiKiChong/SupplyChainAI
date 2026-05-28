import { useMemo } from 'react';
import { ProductionDemand, ProductionResource, StandardTime, AnalysisResult, SystemSettings, MonthlyTeamAnalysis, ProcessCycle } from '../types';
import { sortTeams, getLocalDateString, parseLocalDate } from '../utils';

export function useCapacityAnalysis(
  demands: ProductionDemand[],
  resources: ProductionResource[],
  standardTimes: StandardTime[],
  settings: SystemSettings,
  processCycles: ProcessCycle[],
  excludeAbnormalOrders: boolean = false
) {
  const analysisResult = useMemo<AnalysisResult>(() => {
    const isWorkingDay = (date: Date) => {
      const dateKey = getLocalDateString(date);
      if (settings.calendarOverrides?.[dateKey] !== undefined) {
        return settings.calendarOverrides[dateKey];
      }
      const dayOfWeek = date.getDay();
      const isSunday = dayOfWeek === 0;
      return !isSunday;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    // 1. Phase 1: Data Cleaning & Filtering
    // 1.1 Exclude completed rows (Only 'TRUE' counts as completed)
    let filteredDemands = demands.filter(d => {
      const val = (d.rawRow?.['工序完成'] || '').toString().trim().toUpperCase();
      return val !== 'TRUE';
    });

    // 1.25 NEW: Exclude abnormal work orders if toggle is ON
    if (excludeAbnormalOrders) {
      filteredDemands = filteredDemands.filter(d => {
        // Condition for NORMAL: 
        // ( "是否符合开工条件" == '正常' or empty ) AND ( "欠料信息" == '满足' or empty )
        const startConditionRaw = (d.rawRow?.['是否符合开工条件'] || '').toString().trim();
        const shortageInfoRaw = (d.rawRow?.['欠料信息'] || '').toString().trim();
        
        const isStartConditionNormal = startConditionRaw === '' || startConditionRaw === '正常';
        const isShortageInfoNormal = shortageInfoRaw === '' || shortageInfoRaw === '满足';
        
        return isStartConditionNormal && isShortageInfoNormal;
      });
    }
    
    // 1.2 Whole order removal logic (if dueDate is empty)
    const orderGroups = new Map<string, typeof demands>();
    filteredDemands.forEach(d => {
      if (!orderGroups.has(d.orderNo)) orderGroups.set(d.orderNo, []);
      orderGroups.get(d.orderNo)!.push(d);
    });
    const validOrders = new Set<string>();
    orderGroups.forEach((group, orderNo) => {
      const hasEmptyDueDate = group.some(d => !d.dueDate);
      if (!hasEmptyDueDate) validOrders.add(orderNo);
    });
    filteredDemands = filteredDemands.filter(d => validOrders.has(d.orderNo));
    
    // 1.3 Operation de-duplication (unique workOrderOpNo within an order)
    const seenOrderOp = new Set<string>();
    filteredDemands = filteredDemands.filter(d => {
      // Use workOrderOpNo as key. If missing, use orderLevelNo + " " + opNo
      const key = d.workOrderOpNo && d.workOrderOpNo.trim() !== '' 
        ? d.workOrderOpNo.trim() 
        : `${d.orderLevelNo || ''} ${d.opNo || ''}`;
      
      if (seenOrderOp.has(key)) return false;
      seenOrderOp.add(key);
      return true;
    });

    // 2. Phase 2: Calculations & Secondary Filtering
    const processCycleMap = new Map<string, ProcessCycle>();
    processCycles.forEach(pc => {
      if (pc.opCode) processCycleMap.set(pc.opCode.trim().toUpperCase(), pc);
    });

    const unmatchedResourceGroups = new Map<string, string>();
    const unmatchedOperations = new Map<string, string>();

    const cleanedDemands = filteredDemands.map(d => {
      // 1.4 Fill missing values (rejectedQty -> 0, actualHours -> 0)
      const uncompletedQty = d.requiredQty - d.completedQty - (d.rejectedQty || 0);
      const actualHours = d.actualHours || 0;
      
      // 2.2 Demand hours = (Qty * Time) / 60
      const demandHours = Number(((uncompletedQty * actualHours) / 60).toFixed(2));
      
      // 2.3 Process cycle matching logic
      const opCodeUpper = d.opCode ? d.opCode.trim().toUpperCase() : '';
      const pc = processCycleMap.get(opCodeUpper);
      
      if (!pc && d.opCode) {
        unmatchedOperations.set(opCodeUpper, d.opDesc || '');
      }
      
      // Urgent mode priority: 
      // If checked: expeditedCycleDays ?? standardCycleDays
      // Else: standardCycleDays
      const cycleDays = (pc 
        ? (pc.isUrgent 
            ? (pc.expeditedCycleDays ?? pc.standardCycleDays) 
            : pc.standardCycleDays) 
        : undefined) ?? settings.defaultCycleDays ?? 2;

      return { ...d, uncompletedQty, demandHours, cycleDays };
    }).filter(d => d.uncompletedQty > 0);

    // 3. Phase 3: Date & Scheduling Push Logic (Reverse Scheduling)
    const scheduledDemands: any[] = [];
    const groupedByOrder = new Map<string, typeof cleanedDemands>();
    cleanedDemands.forEach(d => {
      if (!groupedByOrder.has(d.orderNo)) groupedByOrder.set(d.orderNo, []);
      groupedByOrder.get(d.orderNo)!.push(d);
    });

    groupedByOrder.forEach((group) => {
      // Sort in reverse order (descending opNo)
      const sortedGroup = [...group].sort((a, b) => parseInt(b.opNo) - parseInt(a.opNo));
      let nextStartDate: Date | null = null;
      
      for (let i = 0; i < sortedGroup.length; i++) {
        const currentOp = sortedGroup[i] as any;
        const opCodeUpper = currentOp.opCode ? currentOp.opCode.trim().toUpperCase() : '';
        
        // 4.2 Continuous Outsourcing (WX) merged rule
        if (opCodeUpper.startsWith('WX')) {
          const wxGroup = [currentOp];
          let j = i + 1;
          while (j < sortedGroup.length) {
            const nextOp = sortedGroup[j] as any;
            const nextOpCodeUpper = nextOp.opCode ? nextOp.opCode.trim().toUpperCase() : '';
            if (nextOpCodeUpper.startsWith('WX')) {
              wxGroup.push(nextOp);
              j++;
            } else {
              break;
            }
          }
          
          // Total cycle = Max(group member cycles)
          const maxCycle = Math.max(...wxGroup.map(wx => wx.cycleDays));
          const baseDate = nextStartDate ? new Date(nextStartDate) : parseLocalDate(currentOp.dueDate);
          const groupStartDate = new Date(baseDate);
          groupStartDate.setDate(baseDate.getDate() - maxCycle);
          
          // All members share the same start date
          wxGroup.forEach(wx => {
            wx.startDate = new Date(groupStartDate);
            scheduledDemands.push(wx);
          });
          
          nextStartDate = groupStartDate;
          i = j - 1; // Skip the processed group
        } else {
          // Regular process
          const baseDate = nextStartDate ? new Date(nextStartDate) : parseLocalDate(currentOp.dueDate);
          const startDate = new Date(baseDate);
          startDate.setDate(baseDate.getDate() - currentOp.cycleDays);
          currentOp.startDate = startDate;
          scheduledDemands.push(currentOp);
          nextStartDate = startDate;
        }
      }
    });

    // 4. Phase 4: Load Partitioning & Aggregation
    const resourceMap = new Map<string, ProductionResource>();
    resources.forEach(r => resourceMap.set((r.id || '').toLowerCase(), r));

    const finalDemands = scheduledDemands.map(d => {
      const resource = resourceMap.get((d.resourceGroupId || '').toLowerCase());
      // 5.3 Team dimension classification (Default to '其他')
      const team = resource ? (resource.team || '其他').trim() : '其他';
      
      if ((!resource || !resource.team) && d.resourceGroupId) {
        unmatchedResourceGroups.set(d.resourceGroupId, d.resourceGroupDesc || resource?.groupName || '');
      }
      
      // 5.1 Overdue detection
      // If logic is dueDate, use dueDate for overdue check, else use startDate
      const baseRefDate = settings.aggregationLogic === 'dueDate' ? parseLocalDate(d.dueDate) : new Date(d.startDate);
      baseRefDate.setHours(0, 0, 0, 0);
      const isOverdue = baseRefDate.getTime() < todayTime;
      
      // 5.2 Overdue Task Squeeze Logic: 
      // All overdue tasks aggregated to "Today" / "Current Month"
      const aggregationDate = isOverdue ? today : baseRefDate;
      const monthStr = `${aggregationDate.getFullYear()}年${(aggregationDate.getMonth() + 1).toString().padStart(2, '0')}月`;
      
      return { ...d, team, isOverdue, monthStr, aggregationDate };
    });

    const dailyLoadMap = new Map<string, { overdue: number, planned: number }>();
    const monthlyTeamMap = new Map<string, MonthlyTeamAnalysis>();

    finalDemands.forEach(d => {
      // Outsourced (WX) operations do not consume internal capacity load
      if (d.opCode.toUpperCase().startsWith('WX')) return;

      // Aggregating load with squeeze logic
      const dateKey = getLocalDateString(d.aggregationDate);
      const dailyKey = `${dateKey}_${d.team}`;
      const currentDaily = dailyLoadMap.get(dailyKey) || { overdue: 0, planned: 0 };
      if (d.isOverdue) currentDaily.overdue += d.demandHours;
      else currentDaily.planned += d.demandHours;
      dailyLoadMap.set(dailyKey, currentDaily);

      const monthlyKey = `${d.monthStr}_${d.team}`;
      if (!monthlyTeamMap.has(monthlyKey)) {
        monthlyTeamMap.set(monthlyKey, {
          month: d.monthStr,
          team: d.team,
          workingDays: 0,
          human: { load: 0, overdueLoad: 0, plannedLoad: 0, capacity: 0, utilization: 0 },
          machine: { load: 0, overdueLoad: 0, plannedLoad: 0, capacity: 0, utilization: 0 }
        });
      }
      const entry = monthlyTeamMap.get(monthlyKey)!;
      entry.human.load += d.demandHours;
      entry.machine.load += d.demandHours;
      if (d.isOverdue) {
        entry.human.overdueLoad += d.demandHours;
        entry.machine.overdueLoad += d.demandHours;
      } else {
        entry.human.plannedLoad += d.demandHours;
        entry.machine.plannedLoad += d.demandHours;
      }
    });

    // 5. Phase 5 & 6: Capacity & Utilization
    const teams = sortTeams(
      Array.from(new Set(resources.map(r => (r?.team || '其他').trim()))),
      settings.teamOrder,
      settings.teamCategories
    );
    if (teams.length === 0) teams.push('其他');

    const dailyData: any[] = [];
    const startDateForDaily = new Date(today);
    for (let i = 0; i < 30; i++) {
      const currentDate = new Date(startDateForDaily);
      currentDate.setDate(startDateForDaily.getDate() + i);
      const dateStr = `${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}`;
      const fullDateStr = getLocalDateString(currentDate);
      
      // 6.1 Effective Working Day calculation
      const isWorking = isWorkingDay(currentDate);
      
      teams.forEach(team => {
        let dailyTeamHumanCapacity = 0;
        let dailyTeamMachineCapacity = 0;
        const teamStdTimes = standardTimes.filter(s => (s.team || '').trim() === team);
        
        teamStdTimes.forEach(std => {
          if (isWorking) {
            // 6.2 Available Capacity Formulas
            dailyTeamHumanCapacity += std.peopleCount * std.peopleShifts * std.peopleDuration * std.peopleOle;
            dailyTeamMachineCapacity += std.machineCount * std.machineShifts * std.machineDuration * std.machineOee;
          }
        });

        const dailyKey = `${fullDateStr}_${team}`;
        const loadInfo = dailyLoadMap.get(dailyKey) || { overdue: 0, planned: 0 };
        dailyData.push({
          date: dateStr,
          team: team,
          load: loadInfo.overdue + loadInfo.planned,
          overdueLoad: loadInfo.overdue,
          plannedLoad: loadInfo.planned,
          humanCapacity: dailyTeamHumanCapacity,
          machineCapacity: dailyTeamMachineCapacity
        });
      });
    }

    const uniqueMonthsForTotal = new Set<string>();
    let totalWorkingDays = 0;
    
    const allMonths = new Set<string>();
    finalDemands.forEach(d => allMonths.add(d.monthStr));

    // Ensure all teams and months are covered in monthly table
    allMonths.forEach(month => {
      teams.forEach(team => {
        const key = `${month}_${team}`;
        if (!monthlyTeamMap.has(key)) {
          monthlyTeamMap.set(key, {
            month: month,
            team: team,
            workingDays: 0,
            human: { load: 0, overdueLoad: 0, plannedLoad: 0, capacity: 0, utilization: 0 },
            machine: { load: 0, overdueLoad: 0, plannedLoad: 0, capacity: 0, utilization: 0 }
          });
        }
      });
    });

    monthlyTeamMap.forEach((entry) => {
      const match = entry.month.match(/(\d+)年(\d+)月/);
      if (!match) return;
      const year = parseInt(match[1]);
      const month = parseInt(match[2]);
      let workingDays = 0;
      const daysInMonth = new Date(year, month, 0).getDate();
      
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      
      let startDay = 1;
      // 6.1 History Rule: working days計為0
      if (year === currentYear && month === currentMonth) {
        startDay = today.getDate();
      } else if (year < currentYear || (year === currentYear && month < currentMonth)) {
        startDay = daysInMonth + 1; 
      }

      for (let day = startDay; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        if (isWorkingDay(date)) workingDays++;
      }
      entry.workingDays = workingDays;
      
      if (!uniqueMonthsForTotal.has(entry.month)) {
        totalWorkingDays += workingDays;
        uniqueMonthsForTotal.add(entry.month);
      }

      const teamStdTimes = standardTimes.filter(s => (s.team || '').trim() === entry.team);
      
      teamStdTimes.forEach(std => {
        // 6.2 Monthly Capacity = daily * workingDays
        entry.human.capacity += (std.peopleCount * std.peopleShifts * std.peopleDuration * std.peopleOle) * workingDays;
        entry.machine.capacity += (std.machineCount * std.machineShifts * std.machineDuration * std.machineOee) * workingDays;
      });
      
      // 6.3 Utilization = (Load (overdue + planned) / Capacity) * 100
      entry.human.utilization = entry.human.capacity > 0 ? (entry.human.load / entry.human.capacity) * 100 : 0;
      entry.machine.utilization = entry.machine.capacity > 0 ? (entry.machine.load / entry.machine.capacity) * 100 : 0;
    });

    const totalLoad = dailyData.reduce((acc, d) => acc + d.load, 0);
    const totalCapacity = dailyData.reduce((acc, d) => acc + d.humanCapacity + d.machineCapacity, 0);
    const utilizationRate = totalCapacity > 0 ? (totalLoad / totalCapacity) * 100 : 0;

    return {
      totalLoad: Math.ceil(totalLoad),
      totalCapacity: Math.floor(totalCapacity),
      utilizationRate: utilizationRate,
      dailyData: dailyData,
      monthlyTeamData: Array.from(monthlyTeamMap.values()).sort((a, b) => {
        const monthCompare = a.month.localeCompare(b.month);
        if (monthCompare !== 0) return monthCompare;
        const sortedTeams = sortTeams([a.team, b.team], settings.teamOrder, settings.teamCategories);
        return sortedTeams[0] === a.team ? -1 : 1;
      }),
      totalWorkingDays: totalWorkingDays,
      scheduledDemands: finalDemands,
      exceptions: {
        unmatchedResourceGroups: Array.from(unmatchedResourceGroups.entries()).map(([id, description]) => ({ id, description })),
        unmatchedOperations: Array.from(unmatchedOperations.entries()).map(([opCode, opDesc]) => ({ opCode, opDesc }))
      }
    };
  }, [demands, resources, standardTimes, settings, processCycles, excludeAbnormalOrders]);

  return analysisResult;
}
