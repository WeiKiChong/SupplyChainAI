import React, { useState } from 'react';
import { 
  ClipboardList, 
  Network, 
  LayoutDashboard,
  Folder,
  Timer, 
  Clock, 
  Flag, 
  Upload, 
  CloudCog, 
  RefreshCw,
  CheckCircle2, 
  AlertCircle,
  FileText,
  RotateCcw,
  ChevronRight,
  X,
  CircleHelp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { cn } from '../utils';

interface ImportCardProps {
  title: string;
  icon: any;
  status?: { fileName: string; time: string; error?: string };
  onUpload: (file: File) => void;
  isSyncing?: boolean;
  error?: string;
  stagedFile: File | null;
  onClearStaged: () => void;
}

const ImportCard: React.FC<ImportCardProps> = ({ title, icon: Icon, status, onUpload, isSyncing, error, stagedFile, onClearStaged }) => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  };

  return (
    <div 
      className={cn(
        "glass-card p-5 relative transition-all duration-300",
        isDragging ? "ring-2 ring-indigo-500 bg-indigo-50/50" : "hover:shadow-md",
        isSyncing && "opacity-70 pointer-events-none"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
            stagedFile ? "bg-indigo-100 text-indigo-600" : "bg-slate-50 text-slate-500"
          )}>
            <Icon size={20} />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 whitespace-pre-line text-left leading-tight">{title}</h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              {stagedFile ? (
                <div className="flex items-center gap-1.5 text-[11px] text-indigo-600 font-medium">
                  <FileText size={12} />
                  <span className="truncate max-w-[120px]" title={stagedFile.name}>{stagedFile.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); onClearStaged(); }} className="text-slate-400 hover:text-red-500">
                    <X size={10} />
                  </button>
                </div>
              ) : status ? (
                <div className="flex items-center gap-1.5 text-[11px]">
                  {status.error ? (
                    <AlertCircle size={12} className="text-red-500" />
                  ) : (
                    <CheckCircle2 size={12} className="text-emerald-500" />
                  )}
                  <span className={cn(
                    "truncate max-w-[120px]",
                    status.error ? "text-red-500 font-medium" : "text-slate-500"
                  )} title={status.fileName}>{status.fileName}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-400">{status.time}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <AlertCircle size={12} />
                  <span>{t('oci.not_selected')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {(status?.error || error) && (
            <div 
              className="p-1 text-red-500 cursor-help group/error relative"
            >
              <AlertCircle size={16} />
              <div className="absolute right-0 bottom-full mb-2 w-56 p-3 bg-black text-white text-[11px] rounded-xl shadow-2xl opacity-0 invisible group-hover/error:opacity-100 group-hover/error:visible transition-all z-[100] pointer-events-none leading-relaxed border border-white/10 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-1.5 text-red-400 font-bold border-b border-white/10 pb-1.5">
                  <AlertCircle size={12} />
                  <span>{t('oci.validation_failed')}</span>
                </div>
                {status?.error || error}
                <div className="absolute bottom-[-5px] right-3 w-2.5 h-2.5 bg-black rotate-45 border-r border-b border-white/10" />
              </div>
            </div>
          )}
          <button 
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv,.xlsx,.xls';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) onUpload(file);
              };
              input.click();
            }}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-sm border",
              stagedFile ? "bg-indigo-50 text-indigo-600 border-indigo-200" : "bg-white text-slate-500 border-slate-200 hover:text-indigo-600 hover:border-indigo-200"
            )}
            disabled={isSyncing}
          >
            <Upload size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {isSyncing && (
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-indigo-500"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

interface Props {
  onImport: (type: string, file: File) => Promise<boolean>;
  importStatus: Record<string, { fileName: string; time: string; error?: string }>;
}

export default function OneClickImport({ onImport, importStatus }: Props) {
  const { t } = useTranslation();
  const [activeScenario, setActiveScenario] = useState<'capacity' | 'output'>('capacity');
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncQueue, setSyncQueue] = useState<string[]>([]);
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});
  const [stagedFiles, setStagedFiles] = useState<Record<string, File | null>>({});

  const scenarios = [
    { id: 'capacity', label: t('oci.scenario_capacity'), icon: LayoutDashboard },
    { id: 'output', label: t('oci.scenario_output'), icon: Folder },
  ];

  const scenarioDataModules: Record<string, { id: string; name: string; icon: any }[]> = {
    capacity: [
      { id: 'demand', name: t('oci.mod_demand'), icon: ClipboardList },
      { id: 'resources', name: t('oci.mod_resources'), icon: Network },
      { id: 'standard-time', name: t('oci.mod_st'), icon: Timer },
      { id: 'process-cycle', name: t('oci.mod_process'), icon: Clock },
    ],
    output: [
      { id: 'job-report', name: t('oci.mod_job_report'), icon: ClipboardList },
      { id: 'resources', name: t('oci.mod_resources'), icon: Network },
      { id: 'standard-time', name: t('oci.mod_st'), icon: Timer },
      { id: 'target-working-hour', name: t('oci.mod_target_hours'), icon: Flag },
    ]
  };

  const currentScenario = scenarios.find(s => s.id === activeScenario);

  const handleSyncAll = async () => {
    if (isSyncingAll) return;
    
    const modules = scenarioDataModules[activeScenario];
    const filesToSync = modules.filter(mod => stagedFiles[mod.id]);
    
    if (filesToSync.length === 0) {
      alert(t('oci.alert_no_files'));
      return;
    }

    setIsSyncingAll(true);
    setSyncErrors({});
    
    for (const mod of filesToSync) {
      const file = stagedFiles[mod.id];
      if (!file) continue;

      setSyncQueue(prev => [...prev, mod.id]);
      
      try {
        const success = await onImport(mod.id, file);
        if (!success) {
          // Error already handled/recorded in onImport via updateImportStatus
          setIsSyncingAll(false);
          setSyncQueue([]);
          return; // Stop sync on error
        }
        // Success: clear staged file
        setStagedFiles(prev => ({ ...prev, [mod.id]: null }));
      } catch (err) {
        setSyncErrors(prev => ({ ...prev, [mod.id]: t('oci.sync_exception') }));
        setIsSyncingAll(false);
        setSyncQueue([]);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      setSyncQueue(prev => prev.filter(id => id !== mod.id));
    }
    
    setIsSyncingAll(false);
  };

  return (
    <div className="max-w-[1240px] mx-auto p-6">
      <div className="flex gap-8">
        {/* Left Sidebar */}
        <div className="w-72 shrink-0 pt-0">
          <div className="space-y-6 sticky top-6">
            <div>
              <h3 className="text-slate-400 font-bold text-sm mb-4">{t('oci.task_target')}</h3>
              <div className="space-y-3">
                {scenarios.map(scenario => (
                  <button
                    key={scenario.id}
                    onClick={() => {
                      if (!isSyncingAll) {
                        setActiveScenario(scenario.id as any);
                        setSyncErrors({});
                      }
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-xl transition-all group border-2",
                      activeScenario === scenario.id 
                        ? "bg-indigo-50/50 border-indigo-200 text-indigo-700 shadow-sm" 
                        : "bg-transparent border-transparent text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-sm shrink-0",
                        activeScenario === scenario.id ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                      )}>
                        <scenario.icon size={18} />
                      </div>
                      <span className="font-bold text-[15px] whitespace-pre-line text-left leading-tight">{scenario.label}</span>
                    </div>
                    {activeScenario === scenario.id && (
                      <div className="w-2 h-2 bg-indigo-600 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.5)]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Usage Instructions Box */}
            <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100 flex gap-3 shadow-sm">
              <CircleHelp size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <span className="block text-[13px] font-bold text-amber-900/80">{t('oci.usage_instructions')}</span>
                <p className="text-[11px] text-amber-800/60 leading-relaxed font-medium">
                  {t('oci.instruction_1')}<br/>
                  {t('oci.instruction_2')}<br/>
                  {t('oci.instruction_3')}<br/>
                  <br/>
                  {t('oci.import_mode')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 space-y-6">
          {/* Top Configuration Area */}
          <div className="glass-card p-6 flex items-center justify-between border-slate-200/60 bg-white/50 backdrop-blur-md">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 flex items-center justify-center shadow-sm text-indigo-600">
                <CloudCog size={32} />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">{t('oci.current_target')}</span>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{currentScenario?.label}</h2>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={handleSyncAll}
                disabled={isSyncingAll}
                className={cn(
                  "bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100",
                  isSyncingAll && "animate-pulse"
                )}
              >
                {isSyncingAll ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{t('oci.syncing')}</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} />
                    <span>{t('oci.sync_all')}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {scenarioDataModules[activeScenario].map(mod => (
              <ImportCard
                key={mod.id}
                title={mod.name}
                icon={mod.icon}
                status={importStatus[mod.id]}
                stagedFile={stagedFiles[mod.id] || null}
                onUpload={(file) => setStagedFiles(prev => ({ ...prev, [mod.id]: file }))}
                onClearStaged={() => setStagedFiles(prev => ({ ...prev, [mod.id]: null }))}
                isSyncing={syncQueue.includes(mod.id)}
                error={syncErrors[mod.id]}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
