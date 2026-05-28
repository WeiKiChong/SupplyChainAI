import React from 'react';
import { AlertCircle, Download, Network, Clock, FileText } from 'lucide-react';
import ExcelJS from 'exceljs';
import { useTranslation } from 'react-i18next';
import { AnalysisResult } from '../types';
import { cn, getLocalDateString } from '../utils';

interface ExceptionMonitoringProps {
  analysisResult: AnalysisResult;
}

export default function ExceptionMonitoring({ analysisResult }: ExceptionMonitoringProps) {
  const { t } = useTranslation();
  const { exceptions } = analysisResult;
  const { unmatchedResourceGroups, unmatchedOperations } = exceptions;

  const handleExport = async () => {
    const workbook = new ExcelJS.Workbook();
    
    // Sheet 1: Unmatched Resource Groups
    const rgSheet = workbook.addWorksheet(t('exc.sheet_rg'));
    rgSheet.addRow([t('exc.rg_id'), t('exc.rg_desc')]);
    unmatchedResourceGroups.forEach(rg => {
      rgSheet.addRow([rg.id, rg.description]);
    });
    rgSheet.getRow(1).font = { bold: true };
    rgSheet.columns.forEach(col => col.width = 25);

    // Sheet 2: Unmatched Operations
    const opSheet = workbook.addWorksheet(t('exc.sheet_op'));
    opSheet.addRow([t('exc.op_id'), t('exc.op_desc')]);
    unmatchedOperations.forEach(op => {
      opSheet.addRow([op.opCode, op.opDesc]);
    });
    opSheet.getRow(1).font = { bold: true };
    opSheet.columns.forEach(col => col.width = 25);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${t('exc.filename')}_${getLocalDateString()}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-[98%] mx-auto">
      {/* Statistics Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6 border-l-4 border-amber-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Network size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{t('exc.unmatched_teams')}</p>
                <h3 className="text-2xl font-bold text-slate-900">{unmatchedResourceGroups.length} <span className="text-sm font-normal text-slate-400">{t('exc.unit_count')}</span></h3>
              </div>
            </div>
            {unmatchedResourceGroups.length > 0 && (
              <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-lg text-xs font-bold animate-pulse">
                <AlertCircle size={14} />
                <span>{t('exc.needs_attention')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="glass-card p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Clock size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{t('exc.unmatched_ops')}</p>
                <h3 className="text-2xl font-bold text-slate-900">{unmatchedOperations.length} <span className="text-sm font-normal text-slate-400">{t('exc.unit_count')}</span></h3>
              </div>
            </div>
            {unmatchedOperations.length > 0 && (
              <div className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-lg text-xs font-bold">
                <AlertCircle size={14} />
                <span>{t('exc.uses_default')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="glass-card p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
              <AlertCircle size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{t('exc.title')}</h3>
              <p className="text-sm text-slate-500">{t('exc.desc')}</p>
            </div>
          </div>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all font-medium text-sm shadow-sm"
          >
            <Download size={16} />
            <span>{t('exc.export')}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Unmatched Resource Groups Table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                {t('exc.unmatched_teams')}
              </h4>
              <span className="text-xs text-slate-400">{t('exc.unmatched_teams_desc')}</span>
            </div>
            <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/30">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('exc.rg_id')}</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('exc.rg_desc')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unmatchedResourceGroups.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-slate-400 text-sm italic">
                        {t('exc.no_data')}
                      </td>
                    </tr>
                  ) : (
                    unmatchedResourceGroups.map((rg, idx) => (
                      <tr key={idx} className="hover:bg-white transition-colors">
                        <td className="px-4 py-3 text-sm font-mono text-slate-600">{rg.id}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{rg.description || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Unmatched Operations Table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                {t('exc.unmatched_ops')}
              </h4>
              <span className="text-xs text-slate-400">{t('exc.unmatched_ops_desc')}</span>
            </div>
            <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/30">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('exc.op_id')}</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('exc.op_desc')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unmatchedOperations.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-slate-400 text-sm italic">
                        {t('exc.no_data')}
                      </td>
                    </tr>
                  ) : (
                    unmatchedOperations.map((op, idx) => (
                      <tr key={idx} className="hover:bg-white transition-colors">
                        <td className="px-4 py-3 text-sm font-mono text-slate-600">{op.opCode}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{op.opDesc || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
