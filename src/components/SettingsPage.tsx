import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Save, 
  Tags, 
  AlertCircle, 
  RotateCcw, 
  BarChart3, 
  Check, 
  Zap 
} from 'lucide-react';
import { cn } from '../utils';
import { SystemSettings } from '../types';
import { DraggableTeamList } from './DraggableTeamList';
import { 
  DEFAULT_TEAM_CATEGORIES, 
  DEFAULT_TEAM_ORDER, 
  DEFAULT_TEAM_ORDER_VERSION 
} from '../utils';

interface SettingsPageProps {
  settings: SystemSettings;
  setSettings: (settings: SystemSettings) => void;
  tempSettings: SystemSettings;
  setTempSettings: (settings: SystemSettings) => void;
  hasSettingsChanged: boolean;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  setActiveTab: (tab: string) => void;
}

export function SettingsPage({
  settings,
  setSettings,
  tempSettings,
  setTempSettings,
  hasSettingsChanged,
  addNotification,
  setActiveTab
}: SettingsPageProps) {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 选项卡标题 */}
      <div className="flex items-center justify-between">
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
                <p className="text-xs text-slate-500">调整产能 analysis 的核心计算参数</p>
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
        </div>
      </div>
    </div>
  );
}
