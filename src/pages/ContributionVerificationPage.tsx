import React, { useMemo, useState } from 'react';
import {
  Search,
  AlertCircle,
  CheckCircle2,
  UserCheck,
  Info,
} from 'lucide-react';
import { EmployeeAuditRecord, VerificationStatus } from '../types/audit';
import { StatusTag } from '../components/StatusTag';
import { formatDiffINR, formatINR } from '../utils/formatters';

interface ContributionVerificationPageProps {
  records: EmployeeAuditRecord[];
  activeFilter: 'All' | VerificationStatus;
  onFilterChange: (filter: 'All' | VerificationStatus) => void;
  selectedEmployeeId: string | null;
  onSelectEmployee: (id: string) => void;
  globalSearch: string;
  differenceThreshold: number;
  compactRows: boolean;
  onUpdateStatus: (recordId: string, newStatus: VerificationStatus) => void;
  onGoToManualReview: () => void;
  onGoToSettings?: () => void;
  readOnly?: boolean;
}

const FILTER_OPTIONS: Array<'All' | VerificationStatus> = [
  'All',
  'Matched',
  'Mismatch',
  'Needs Review',
  'Blank IP',
  'Missing Record',
];

export const ContributionVerificationPage: React.FC<
  ContributionVerificationPageProps
> = ({
  records,
  activeFilter,
  onFilterChange,
  selectedEmployeeId,
  onSelectEmployee,
  globalSearch,
  differenceThreshold,
  compactRows,
  onUpdateStatus,
  onGoToManualReview,
  onGoToSettings,
  readOnly = false,
}) => {
  const [localSearch, setLocalSearch] = useState('');

  const effectiveSearch = (localSearch || globalSearch).trim().toLowerCase();

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (activeFilter !== 'All' && r.status !== activeFilter) return false;
      if (effectiveSearch) {
        const hay = `${r.name} ${r.empCode} ${r.uan ?? ''} ${r.ipNumber ?? ''}`.toLowerCase();
        if (!hay.includes(effectiveSearch)) return false;
      }
      return true;
    });
  }, [records, activeFilter, effectiveSearch]);

  const inspectedRecord =
    filtered.find((r) => r.id === selectedEmployeeId) ??
    records.find((r) => r.id === selectedEmployeeId) ??
    filtered[0] ??
    null;

  const rowPad = compactRows ? 'py-1' : 'py-1.5';

  const eeVarianceTotal = useMemo(() => {
    return filtered.reduce((acc, r) => {
      if (r.excelEE !== null && r.epfEE !== null) {
        return acc + Math.abs(r.excelEE - r.epfEE);
      }
      return acc;
    }, 0);
  }, [filtered]);

  const ipVarianceTotal = useMemo(() => {
    return filtered.reduce((acc, r) => {
      if (r.excelIP !== null && r.esicIP !== null) {
        return acc + Math.abs(r.excelIP - r.esicIP);
      }
      return acc;
    }, 0);
  }, [filtered]);

  return (
    <div className="h-full min-h-0 flex flex-col gap-2 overflow-hidden">
      {/* Filter & Threshold Control Strip */}
      <div className="shrink-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-2.5 py-2 shadow-[3px_3px_0px_#0E0E10] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = activeFilter === opt;
            const count =
              opt === 'All'
                ? records.length
                : records.filter((r) => r.status === opt).length;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onFilterChange(opt)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10.5px] font-bold rounded-[3px] border-2 transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#9A7AF1] border-[#0E0E10] text-[#FFFFFF] shadow-[2px_2px_0px_#0E0E10]'
                    : 'bg-[#F7F3F0] border-[#1E293B] text-[#0F172A] hover:bg-[#ECE6FD]'
                }`}
              >
                <span>{opt}</span>
                <span
                  className={`font-mono text-[9.5px] px-1 rounded-[2px] ${
                    isActive ? 'bg-[#0E0E10]/25 text-[#FFFFFF]' : 'bg-[#FFFFFF] text-[#0F172A]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3 h-3 text-[#64748B] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search comparison..."
              className="w-40 pl-7 pr-2 py-0.5 text-[11px] bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:border-[#9A7AF1]"
            />
          </div>

          <button
            type="button"
            onClick={() => { if (!readOnly) onGoToSettings?.(); }}
            title="Adjust difference threshold in Settings"
            className={`px-2 py-0.5 bg-[#F7F3F0] border border-[#1E293B] rounded-[3px] text-[10.5px] font-mono font-semibold text-[#0F172A] whitespace-nowrap ${readOnly ? 'cursor-default' : 'hover:bg-[#ECE6FD] cursor-pointer'}`}
          >
            Threshold: {formatINR(differenceThreshold)}
          </button>
        </div>
      </div>

      {/* Main Split: Single-Page Scrollable Comparison Table (Left) + Compact Employee Card (Right) */}
      <div className="flex-1 min-h-0 flex gap-2.5 overflow-hidden">
        {/* Comparison Grid */}
        <section className="flex-1 min-w-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] shadow-[4px_4px_0px_#0E0E10] flex flex-col min-h-0 overflow-hidden">
          <div className="px-2.5 py-1.5 bg-[#F7F3F0] border-b-2 border-[#1E293B] flex items-center justify-between gap-2 shrink-0 text-[10px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-display font-bold uppercase tracking-wider text-[#0F172A] whitespace-nowrap truncate">
                Side-by-Side Audit
              </span>
              <span className="px-1.5 py-0.5 bg-[#FFFFFF] border border-[#1E293B] rounded-[2px] font-mono text-[9.5px] font-bold text-[#64748B] tabular-nums whitespace-nowrap">
                {filtered.length} records
              </span>
            </div>
            <div className="flex items-center gap-2.5 font-mono tabular-nums whitespace-nowrap shrink-0">
              <span className="text-[#64748B]">
                EE Var: <strong className="text-[#F43F5E]">{formatINR(eeVarianceTotal)}</strong>
              </span>
              <span className="text-[#64748B]">
                IP Var: <strong className="text-[#F59E0B]">{formatINR(ipVarianceTotal)}</strong>
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden audit-scroll">
            <table className="w-full table-fixed border-collapse text-center">
              <thead className="sticky top-0 z-10 bg-[#F7F3F0] border-b-2 border-[#1E293B]">
                <tr className="text-[9px] font-bold uppercase tracking-wider text-[#0F172A] whitespace-nowrap">
                  <th className="w-[24%] py-1.5 px-2 text-left">Employee</th>
                  <th className="w-[9.5%] py-1.5 px-1 text-center">Excel EE</th>
                  <th className="w-[9.5%] py-1.5 px-1 text-center">EPF EE</th>
                  <th className="w-[10.5%] py-1.5 px-1 text-center">EE Diff</th>
                  <th className="w-[9.5%] py-1.5 px-1 text-center">Excel IP</th>
                  <th className="w-[9.5%] py-1.5 px-1 text-center">ESIC IP</th>
                  <th className="w-[11.5%] py-1.5 px-1 text-center">IP Diff</th>
                  <th className="w-[16%] py-1.5 px-1.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DCD5] text-[9px]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[#64748B]">
                      No records match this verification filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((rec) => {
                    const eeDiff = formatDiffINR(rec.excelEE, rec.epfEE);
                    const ipDiff = formatDiffINR(rec.excelIP, rec.esicIP);
                    const isSelected = inspectedRecord?.id === rec.id;

                    const rowTint = isSelected
                      ? 'bg-[#ECE6FD]'
                      : rec.status === 'Mismatch' || rec.status === 'Missing Record'
                      ? 'bg-[#F43F5E]/[0.03] hover:bg-[#ECE6FD]/50'
                      : rec.status === 'Needs Review' || rec.status === 'Blank IP'
                      ? 'bg-[#F59E0B]/[0.04] hover:bg-[#ECE6FD]/50'
                      : 'hover:bg-[#FDF9F6]';

                    return (
                      <tr
                        key={rec.id}
                        onClick={() => onSelectEmployee(rec.id)}
                        className={`cursor-pointer transition-colors ${rowTint}`}
                      >
                        <td className={`${rowPad} px-2 text-left align-middle min-w-0 border-l-[3px] ${isSelected ? 'border-l-[#9A7AF1]' : 'border-l-transparent'}`}>
                          <div className="font-display font-bold tracking-tight text-[#0F172A] text-[9px] leading-tight whitespace-normal break-words">
                            {rec.name}
                          </div>
                          <div className="text-[8.5px] font-mono text-[#64748B] truncate">
                            {rec.empCode}
                            {!rec.uan && (
                              <span className="ml-1 text-[#F59E0B] font-bold">
                                · NO UAN
                              </span>
                            )}
                          </div>
                        </td>

                        <td className={`${rowPad} px-1 text-center align-middle font-mono tabular-nums text-[#0F172A] whitespace-nowrap`}>
                          {rec.excelEE === null ? (
                            <span className="inline-flex items-center justify-center px-1 py-0.5 bg-[#F59E0B]/15 text-[#0F172A] border border-[#F59E0B] rounded-[2px] text-[8.5px] font-bold leading-none">
                              Blank
                            </span>
                          ) : (
                            formatINR(rec.excelEE)
                          )}
                        </td>

                        <td className={`${rowPad} px-1 text-center align-middle font-mono tabular-nums text-[#0F172A] whitespace-nowrap`}>
                          {rec.epfEE === null ? (
                            <span className="inline-flex items-center justify-center px-1 py-0.5 bg-[#F43F5E]/15 text-[#F43F5E] border border-[#F43F5E] rounded-[2px] text-[8.5px] font-bold leading-none">
                              Missing
                            </span>
                          ) : (
                            formatINR(rec.epfEE)
                          )}
                        </td>

                        <td
                          className={`${rowPad} px-1 text-center align-middle font-mono font-bold tabular-nums whitespace-nowrap ${
                            eeDiff.isBlankOrMissing
                              ? 'text-[#64748B]'
                              : eeDiff.hasVariance
                              ? 'text-[#F43F5E]'
                              : 'text-[#10B981]'
                          }`}
                        >
                          {eeDiff.text === 'Blank Excel' ? (
                            <span className="inline-flex items-center justify-center px-1 py-0.5 bg-[#F59E0B]/15 text-[#0F172A] border border-[#F59E0B] rounded-[2px] text-[8.5px] font-bold leading-none">
                              {eeDiff.text}
                            </span>
                          ) : (
                            eeDiff.text
                          )}
                        </td>

                        <td className={`${rowPad} px-1 text-center align-middle font-mono tabular-nums text-[#0F172A] whitespace-nowrap`}>
                          {rec.excelIP === null ? (
                            <span className="inline-flex items-center justify-center px-1 py-0.5 bg-[#F59E0B]/15 text-[#0F172A] border border-[#F59E0B] rounded-[2px] text-[8.5px] font-bold leading-none">
                              Blank
                            </span>
                          ) : (
                            formatINR(rec.excelIP)
                          )}
                        </td>

                        <td className={`${rowPad} px-1 text-center align-middle font-mono tabular-nums text-[#0F172A] whitespace-nowrap`}>
                          {rec.esicIP === null ? (
                            <span className="inline-flex items-center justify-center px-1 py-0.5 bg-[#F43F5E]/15 text-[#F43F5E] border border-[#F43F5E] rounded-[2px] text-[8.5px] font-bold leading-none">
                              Missing
                            </span>
                          ) : (
                            formatINR(rec.esicIP)
                          )}
                        </td>

                        <td
                          className={`${rowPad} px-1 text-center align-middle font-mono font-bold tabular-nums whitespace-nowrap ${
                            ipDiff.isBlankOrMissing
                              ? 'text-[#64748B]'
                              : ipDiff.hasVariance
                              ? 'text-[#F43F5E]'
                              : 'text-[#10B981]'
                          }`}
                        >
                          {ipDiff.text === 'Blank Excel' ? (
                            <span className="inline-flex items-center justify-center px-1 py-0.5 bg-[#F59E0B]/15 text-[#0F172A] border border-[#F59E0B] rounded-[2px] text-[8.5px] font-bold leading-none">
                              {ipDiff.text}
                            </span>
                          ) : (
                            ipDiff.text
                          )}
                        </td>

                        <td className={`${rowPad} px-1.5 text-center align-middle whitespace-nowrap`}>
                          <StatusTag status={rec.status} compact />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Compact Employee Card / Record Explanation Panel */}
        <aside className="hidden md:flex w-[204px] xl:w-[222px] shrink-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] shadow-[4px_4px_0px_#0E0E10] flex-col justify-between p-2 min-h-0 overflow-y-auto audit-scroll">
          {inspectedRecord ? (
            <>
              <div className="space-y-2">
                {/* Header */}
                <div className="pb-1.5 border-b border-[#E2DCD5] space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[8.5px] font-bold uppercase tracking-wider text-[#9A7AF1]">
                      Employee Detail
                    </span>
                    <StatusTag status={inspectedRecord.status} compact />
                  </div>
                  <h3 className="font-display text-[10px] font-bold tracking-tight text-[#0F172A] leading-snug whitespace-normal break-words">
                    {inspectedRecord.name}
                  </h3>
                  <div className="text-[9.5px] font-mono text-[#64748B] truncate">
                    {inspectedRecord.empCode} · {inspectedRecord.department}
                  </div>
                </div>

                {/* Why Flagged Box */}
                <div
                  className={`p-2 rounded-[4px] border ${
                    inspectedRecord.status === 'Matched'
                      ? 'bg-[#E6F8F0] border-[#10B981]'
                      : inspectedRecord.status === 'Mismatch' ||
                        inspectedRecord.status === 'Missing Record'
                      ? 'bg-[#F43F5E]/8 border-[#F43F5E]'
                      : 'bg-[#F59E0B]/12 border-[#F59E0B]'
                  }`}
                >
                  <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[#0F172A] mb-0.5">
                    {inspectedRecord.status === 'Matched' ? (
                      <CheckCircle2 className="w-3 h-3 text-[#10B981] shrink-0" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-[#0F172A] shrink-0" />
                    )}
                    <span>Audit Finding</span>
                  </div>
                  <p className="text-[10px] text-[#0F172A] leading-snug font-medium">
                    {inspectedRecord.flagReason}
                  </p>
                </div>

                {/* Identifier & Source Matrix */}
                <div className="bg-[#F7F3F0] border border-[#E2DCD5] rounded-[4px] p-2 space-y-1 text-[10px]">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[#64748B] shrink-0">UAN</span>
                    <span className="font-mono font-bold text-[#0F172A] truncate">
                      {inspectedRecord.uan ?? 'Unmapped'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[#64748B] shrink-0">ESIC IP</span>
                    <span className="font-mono font-bold text-[#0F172A] truncate">
                      {inspectedRecord.ipNumber ?? 'Unmapped'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[#64748B] shrink-0">Confidence</span>
                    <span className="font-mono font-bold text-[#0F172A] tabular-nums">
                      {inspectedRecord.matchConfidence}%
                    </span>
                  </div>
                  <div className="pt-1 border-t border-[#E2DCD5] flex items-start gap-1 text-[9.5px] text-[#64748B] leading-tight">
                    <Info className="w-3 h-3 shrink-0 mt-0.5 text-[#9A7AF1]" />
                    <span className="break-words">{inspectedRecord.sourceNotes}</span>
                  </div>
                </div>

                {/* Comparison Breakdown */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="p-1.5 border border-[#1E293B] rounded-[4px] bg-[#FDF9F6]">
                    <div className="text-[8.5px] font-bold uppercase text-[#64748B] mb-0.5">
                      EPF EE
                    </div>
                    <div className="space-y-0.5 font-mono text-[9.5px] tabular-nums">
                      <div className="flex justify-between gap-1">
                        <span className="text-[#64748B]">Ex:</span>
                        <strong>
                          {inspectedRecord.excelEE === null
                            ? 'Blank'
                            : formatINR(inspectedRecord.excelEE)}
                        </strong>
                      </div>
                      <div className="flex justify-between gap-1">
                        <span className="text-[#64748B]">PDF:</span>
                        <strong>
                          {inspectedRecord.epfEE === null
                            ? 'Missing'
                            : formatINR(inspectedRecord.epfEE)}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="p-1.5 border border-[#1E293B] rounded-[4px] bg-[#FDF9F6]">
                    <div className="text-[8.5px] font-bold uppercase text-[#64748B] mb-0.5">
                      ESIC IP
                    </div>
                    <div className="space-y-0.5 font-mono text-[9.5px] tabular-nums">
                      <div className="flex justify-between gap-1">
                        <span className="text-[#64748B]">Ex:</span>
                        <strong>
                          {inspectedRecord.excelIP === null
                            ? 'Blank'
                            : formatINR(inspectedRecord.excelIP)}
                        </strong>
                      </div>
                      <div className="flex justify-between gap-1">
                        <span className="text-[#64748B]">PDF:</span>
                        <strong>
                          {inspectedRecord.esicIP === null
                            ? 'Missing'
                            : formatINR(inspectedRecord.esicIP)}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Auditor Actions */}
              {!readOnly ? <div className="pt-2 mt-2 border-t border-[#E2DCD5] space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(inspectedRecord.id, 'Matched')}
                    className="py-1 px-1.5 bg-[#E6F8F0] border border-[#10B981] rounded-[3px] text-[10px] font-bold text-[#0F172A] hover:bg-[#10B981] hover:text-[#FFFFFF] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Mark Matched
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(inspectedRecord.id, 'Needs Review')}
                    className="py-1 px-1.5 bg-[#F59E0B]/15 border border-[#F59E0B] rounded-[3px] text-[10px] font-bold text-[#0F172A] hover:bg-[#F59E0B] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Flag Review
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onGoToManualReview}
                  className="w-full py-1.5 px-2 bg-[#9A7AF1] border-2 border-[#0E0E10] rounded-[4px] text-[10px] font-bold text-[#FFFFFF] shadow-[2px_2px_0px_#0E0E10] hover:bg-[#8965ec] flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <UserCheck className="w-3 h-3 shrink-0" />
                  <span>Manual Matching</span>
                </button>
              </div> : <div className="pt-2 mt-2 border-t border-[#E2DCD5] text-[9px] font-semibold uppercase tracking-wider text-[#64748B]">Client view · audit actions are disabled</div>}
            </>
          ) : (
            <div className="text-[11px] text-[#64748B] p-1">
              Select a row to inspect audit details.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
