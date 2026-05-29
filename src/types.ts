export interface Notification {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface ProductionDemand {
  id: string;
  orderNo: string;
  orderLevelNo?: string;
  workOrderOpNo?: string;
  componentCode: string;
  componentDesc: string;
  partNumber?: string;
  opNo: string;
  opCode: string;
  opDesc: string;
  resourceGroupId: string;
  resourceGroupDesc?: string;
  dueDate: string;
  requiredQty: number;
  completedQty: number;
  rejectedQty: number;
  actualHours: number;
  isCompleted?: boolean;
  isStartConditionMet?: boolean;
  shortageDetails?: string;
  rawRow?: any;
  original?: {
    orderNo: string;
    orderLevelNo?: string;
    workOrderOpNo?: string;
    componentCode: string;
    componentDesc: string;
    partNumber?: string;
    opNo: string;
    opCode: string;
    opDesc: string;
    resourceGroupId: string;
    resourceGroupDesc?: string;
    dueDate: string;
    requiredQty: number;
    completedQty: number;
    rejectedQty: number;
    actualHours: number;
    isCompleted?: boolean;
    isStartConditionMet?: boolean;
    shortageDetails?: string;
  };
}

export interface ProductionResource {
  id: string;
  name?: string;
  type?: 'people' | 'machine';
  groupName: string;
  capacity?: number;
  team?: string;
  workshop?: string;
  original?: {
    id?: string;
    name?: string;
    type?: 'people' | 'machine';
    groupName?: string;
    capacity?: number;
    team?: string;
    workshop?: string;
  };
}

export interface StandardTime {
  id: string;
  team: string;
  peopleCount: number;
  peopleShifts: number;
  peopleDuration: number;
  peopleOle: number;
  machineCount: number;
  machineShifts: number;
  machineDuration: number;
  machineOee: number;
  original?: {
    team: string;
    peopleCount: number;
    peopleShifts: number;
    peopleDuration: number;
    peopleOle: number;
    machineCount: number;
    machineShifts: number;
    machineDuration: number;
    machineOee: number;
  };
}

export interface ProcessCycle {
  id: string;
  opCode?: string;
  opName?: string;
  standardCycleDays?: number;
  expeditedCycleDays?: number;
  isUrgent?: boolean;
  original?: {
    opCode?: string;
    opName?: string;
    standardCycleDays?: number;
    expeditedCycleDays?: number;
    isUrgent?: boolean;
  };
}

export interface TargetWorkingHour {
  id: string;
  team: string;
  dailyTarget?: number;
  original?: {
    team: string;
    dailyTarget?: number;
  };
}

export interface AnalysisResult {
  totalLoad: number;
  totalCapacity: number;
  utilizationRate: number;
  dailyData: {
    date: string;
    team: string;
    load: number;
    overdueLoad: number;
    plannedLoad: number;
    humanCapacity: number;
    machineCapacity: number;
  }[];
  monthlyTeamData: MonthlyTeamAnalysis[];
  totalWorkingDays: number;
  scheduledDemands: (ProductionDemand & { 
    demandHours: number; 
    startDate: Date; 
    isOverdue: boolean;
    team: string;
    monthStr: string;
    uncompletedQty: number;
    cycleDays: number;
  })[];
  exceptions: {
    unmatchedResourceGroups: { id: string; description: string }[];
    unmatchedOperations: { opCode: string; opDesc: string }[];
  };
}

export interface MonthlyTeamAnalysis {
  month: string;
  team: string;
  workingDays: number;
  human: {
    load: number;
    overdueLoad: number;
    plannedLoad: number;
    capacity: number;
    utilization: number;
  };
  machine: {
    load: number;
    overdueLoad: number;
    plannedLoad: number;
    capacity: number;
    utilization: number;
  };
}

export interface TeamCategory {
  id: string;
  name: string;
  order: number;
  teamNames: string[];
}

export interface SystemSettings {
  schedulingStrategy: 'EDD' | 'SPT' | 'FCFS';
  alertThreshold: number;
  displayDensity: 'compact' | 'comfortable';
  calendarOverrides?: { [date: string]: boolean };
  teamOrder?: string[];
  teamOrderVersion?: string;
  teamCategories?: TeamCategory[];
  customHolidays?: string[];
  defaultCycleDays?: number;
  aggregationLogic?: 'startDate' | 'dueDate';
  bufferDeliveryOffsets?: Record<string, number>;
}

export interface JobReport {
  id: string;
  workOrderOpNo: string;
  reportTime: string;
  componentCode: string;
  opNo: string;
  opDesc: string;
  qualifiedQty: number;
  dmrConcessionQty: number;
  resourceGroupId: string;
  standardHour: number;
  rawRow?: any;
}

export interface UnissuedMaterial {
  id: string;
  productCode: string;
  productDesc: string;
  partCode: string;
  partDesc: string;
  unitUsage: number;
  totalQty: number;
  requiredDate: string;
  woQty: number;
  workOrderNo: string;
  warehouse: string;
  requiredQty: number;
  effectiveStock: number;
  woRemark: string;
  unissuedQty: number;
  stockAllocation: string;
  satisfiedQty: number;
  purchaseStatus: string;
  requiredMonth: string;
  property: string;
  transitDelivery: string;
  bufferDelivery: string;
  satisfactionStatus: string;
  shortageQty: number;
  raw?: any;
}

export type Demand = ProductionDemand;
export type Resource = ProductionResource;
