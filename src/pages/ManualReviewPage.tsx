import React, { useMemo, useState } from 'react';
import {
  Search,
  Check,
  X,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  EmployeeAuditRecord,
  ManualMatchCandidate,
  ManualReviewDecision,
} from '../types/audit';
import { formatINR } from '../utils/formatters';

interface ManualReviewPageProps {
  candidates: ManualMatchCandidate[];
  records: EmployeeAuditRecord[];
  globalSearch: string;
  onDecision: (candidateId: string, decision: ManualReviewDecision) => void;
  onInspectEmployee: (recordId: string) => void;
}

export const ManualReviewPage: React.FC<ManualReviewPageProps> = ({
  candidates,
  records,
  globalSearch,
  onDecision,
  onInspectEmployee,
}) => {
  const [filter, setFilter] = useState<'All' | ManualReviewDecision>('Pending');
  const [localSearch, setLocalSearch] = useState('');

  const effectiveSearch = (localSearch || globalSearch).trim().toLowerCase();
  const needsReviewCount = useMemo(
    () =>
      records.filter(
        (record) => record.status === 'Needs Review' || record.status === 'Blank IP'
      ).length,
    [records]
  );

  const counts = useMemo(
    () => ({
      All: candidates.length,
      Pending: candidates.filter((c) => c.decision === 'Pending').length,
      Approved: candidates.filter((c) => c.decision === 'Approved').length,
      Rejected: candidates.filter((c) => c.decision === 'Rejected').length,
    }),
    [candidates]
  );

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (filter !== 'All' && c.decision !== filter) return false;
      if (effectiveSearch) {
        const hay = `${c.excelName} ${c.suggestedPdfName} ${c.empCode} ${c.excelUan ?? ''} ${c.pdfUanOrIp}`.toLowerCase();
        if (!hay.includes(effectiveSearch)) return false;
      }
      return true;
    });
  }, [candidates, filter, effectiveSearch]);

  return (
    <div className="min-h-full flex flex-col gap-2.5">
      {/* Header Banner + Filter Bar */}
      <div className="shrink-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-3 py-2 shadow-[3px_3px_0px_#0E0E10] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-[4px] bg-[#F59E0B]/15 border-2 border-[#F59E0B] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xs font-bold text-[#0F172A] leading-tight">
              Uncertain Employee Match Queue
            </h2>
            <p className="text-[10px] text-[#64748B] truncate">
              {needsReviewCount} employees need review · {counts.Pending} match suggestions pending.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search className="w-3 h-3 text-[#64748B] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search name or ID..."
              className="w-40 pl-7 pr-2 py-1 text-[11px] bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:border-[#9A7AF1]"
            />
          </div>

          <div className="flex items-center gap-1">
            {(['Pending', 'Approved', 'Rejected', 'All'] as Array<'All' | ManualReviewDecision>).map(
              (tab) => {
                const active = filter === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-bold rounded-[3px] border-2 cursor-pointer transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#F59E0B] border-[#0E0E10] text-[#0E0E10] shadow-[2px_2px_0px_#0E0E10]'
                        : 'bg-[#F7F3F0] border-[#1E293B] text-[#0F172A] hover:bg-[#ECE6FD]'
                    }`}
                  >
                    <span>{tab}</span>
                    <span className="font-mono text-[9.5px] px-1 bg-[#FFFFFF] border border-[#1E293B] rounded-[2px]">
                      {counts[tab]}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </div>
      </div>

      {/* Original match-candidate queue; the main content area scrolls as one page when needed. */}
      <div className="flex-1 space-y-2 pb-1">
        {filtered.length === 0 ? (
          <div className="h-full bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] shadow-[3px_3px_0px_#0E0E10] flex flex-col items-center justify-center p-6 text-center">
            <AlertTriangle className="w-7 h-7 text-[#F59E0B] mb-1.5" />
            <div className="font-display text-sm font-bold text-[#0F172A]">
              No {filter === 'All' ? '' : filter.toLowerCase()} review candidates found
            </div>
            <p className="text-xs text-[#64748B] mt-1">
              Adjust your filter tabs or search query to inspect other match decisions.
            </p>
          </div>
        ) : (
          filtered.map((item) => {
            const confColor =
              item.confidence >= 80
                ? 'bg-[#10B981]'
                : item.confidence >= 70
                ? 'bg-[#F59E0B]'
                : 'bg-[#F43F5E]';

            return (
              <article
                key={item.id}
                className="bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-3 py-2 shadow-[3px_3px_0px_#0E0E10] grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,1.15fr)_minmax(0,1.85fr)] gap-2.5 items-center"
              >
                {/* Excel Identity */}
                <div className="px-2 py-1.5 bg-[#FDF9F6] border border-[#E2DCD5] rounded-[4px] min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-[#64748B] truncate">
                    Excel · {item.empCode}
                  </div>
                  <div className="font-display text-xs font-bold text-[#0F172A] mt-0.5 truncate">
                    {item.excelName}
                  </div>
                  <div className="text-[10px] font-mono text-[#64748B] mt-0.5 leading-tight">
                    <div className="truncate">
                      UAN:{' '}
                      {item.excelUan ?? (
                        <span className="text-[#F59E0B] font-bold">UNMAPPED</span>
                      )}
                    </div>
                    <div className="truncate">
                      IP:{' '}
                      {item.excelIp ?? (
                        <span className="text-[#F59E0B] font-bold">UNMAPPED</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Confidence Bridge */}
                <div className="flex flex-col items-center justify-center text-center px-1 min-w-0">
                  <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-[#0F172A] tabular-nums whitespace-nowrap">
                    <span>{item.confidence}% Match</span>
                    <ArrowRight className="w-3 h-3 text-[#F59E0B] shrink-0" />
                  </div>
                  <div className="w-full h-2 bg-[#F7F3F0] border border-[#1E293B] rounded-[2px] mt-1 overflow-hidden">
                    <div
                      className={`h-full ${confColor}`}
                      style={{ width: `${item.confidence}%` }}
                    />
                  </div>
                  <div className="text-[9.5px] font-mono text-[#64748B] mt-1 tabular-nums whitespace-nowrap">
                    {item.excelAmount === null ? 'Blank' : formatINR(item.excelAmount)} vs{' '}
                    {item.pdfAmount === null ? 'Missing' : formatINR(item.pdfAmount)}
                  </div>
                </div>

                {/* Suggested PDF Identity */}
                <div className="px-2 py-1.5 bg-[#FBF7F4] border-2 border-[#F59E0B] rounded-[4px] min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-[#0F172A] truncate">
                    Suggested · {item.pdfSource}
                  </div>
                  <div className="font-display text-xs font-bold text-[#0F172A] mt-0.5 truncate">
                    {item.suggestedPdfName}
                  </div>
                  <div className="text-[10px] font-mono text-[#0F172A] mt-0.5 truncate">
                    PDF ID: <strong>{item.pdfUanOrIp}</strong>
                  </div>
                </div>

                {/* Reason & Actions */}
                <div className="flex flex-col justify-between gap-1.5 min-w-0">
                  <p className="text-[10px] text-[#64748B] leading-snug line-clamp-2">
                    <strong className="text-[#0F172A]">Flag:</strong> {item.reason}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span
                      className={`px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider rounded-[3px] border whitespace-nowrap shrink-0 ${
                        item.decision === 'Approved'
                          ? 'bg-[#E6F8F0] border-[#10B981] text-[#0F172A]'
                          : item.decision === 'Rejected'
                          ? 'bg-[#F43F5E]/15 border-[#F43F5E] text-[#0F172A]'
                          : 'bg-[#F59E0B]/15 border-[#F59E0B] text-[#0F172A]'
                      }`}
                    >
                      {item.decision}
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      {item.decision !== 'Pending' && (
                        <button
                          type="button"
                          onClick={() => onDecision(item.id, 'Pending')}
                          title="Reset to Pending"
                          className="p-1 bg-[#F7F3F0] border-2 border-[#1E293B] rounded-[3px] text-[#0F172A] hover:bg-[#ECE6FD] cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={item.decision === 'Rejected'}
                        onClick={() => onDecision(item.id, 'Rejected')}
                        className={`inline-flex items-center justify-center gap-1 px-1.5 py-0.5 border-2 rounded-[3px] text-[10px] font-bold transition-colors whitespace-nowrap ${
                          item.decision === 'Rejected'
                            ? 'bg-[#F43F5E] border-[#0E0E10] text-[#FFFFFF] opacity-90 cursor-default'
                            : 'bg-[#FFFFFF] border-[#1E293B] text-[#0F172A] hover:bg-[#F43F5E]/10 cursor-pointer'
                        }`}
                      >
                        <X className="w-2.5 h-2.5 shrink-0" />
                        <span>{item.decision === 'Rejected' ? 'Rejected' : 'Reject'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={item.decision === 'Approved'}
                        onClick={() => onDecision(item.id, 'Approved')}
                        className={`inline-flex items-center justify-center gap-1 px-1.5 py-0.5 border-2 rounded-[3px] text-[10px] font-bold transition-colors whitespace-nowrap ${
                          item.decision === 'Approved'
                            ? 'bg-[#10B981] border-[#0E0E10] text-[#FFFFFF] opacity-90 cursor-default'
                            : 'bg-[#9A7AF1] border-[#0E0E10] text-[#FFFFFF] shadow-[2px_2px_0px_#0E0E10] hover:bg-[#8965ec] cursor-pointer'
                        }`}
                      >
                        <Check className="w-2.5 h-2.5 shrink-0" />
                        <span>{item.decision === 'Approved' ? 'Approved' : 'Approve'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};
