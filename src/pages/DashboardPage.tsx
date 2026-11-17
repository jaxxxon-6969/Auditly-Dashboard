import React, { useMemo, useState } from 'react';
import {
  Users,
  CheckCircle2,
  XOctagon,
  AlertTriangle,
  ArrowUpRight,
  UploadCloud,
  FileSpreadsheet,
  FileWarning,
  ShieldCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import {
  EmployeeAuditRecord,
  NavRoute,
  VerificationStatus,
} from '../types/audit';
import { StatusTag } from '../components/StatusTag';
import { formatDiffINR, formatINR } from '../utils/formatters';

interface DashboardPageProps {
  records: EmployeeAuditRecord[];
  periodLabel: string;
  showDemoBanner: boolean;
  isRealData?: boolean;
  readOnly?: boolean;
  onNavigate: (route: NavRoute) => void;
  onSelectVerificationFilter: (filter: 'All' | VerificationStatus) => void;
  onInspectEmployee: (recordId: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  records,
  periodLabel,
  showDemoBanner,
  isRealData = false,
  readOnly = false,
  onNavigate,
  onSelectVerificationFilter,
  onInspectEmployee,
}) => {
  const [snapshotTab, setSnapshotTab] = useState<'all' | 'flagged'>('all');

  const stats = useMemo(() => {
    const total = records.length;
    const matched = records.filter((r) => r.status === 'Matched').length;
    const mismatches = records.filter((r) => r.status === 'Mismatch').length;
    const needsReview = records.filter(
      (r) => r.status === 'Needs Review' || r.status === 'Blank IP'
    ).length;
    const missingValues = records.filter((r) => r.status === 'Missing Record').length;

    const excelEETotal = records.reduce((acc, r) => acc + (r.excelEE ?? 0), 0);
    const epfEETotal = records.reduce((acc, r) => acc + (r.epfEE ?? 0), 0);
    const excelIPTotal = records.reduce((acc, r) => acc + (r.excelIP ?? 0), 0);
    const esicIPTotal = records.reduce((acc, r) => acc + (r.esicIP ?? 0), 0);

    const epfMatchedCount = records.filter(
      (r) => r.excelEE !== null && r.epfEE !== null && r.excelEE === r.epfEE
    ).length;
    const esicMatchedCount = records.filter(
      (r) => r.excelIP !== null && r.esicIP !== null && r.excelIP === r.esicIP
    ).length;

    const progressPct = total > 0 ? Math.round((matched / total) * 100) : 0;

    return {
      total,
      matched,
      mismatches,
      needsReview,
      missingValues,
      excelEETotal,
      epfEETotal,
      excelIPTotal,
      esicIPTotal,
      epfMatchedCount,
      esicMatchedCount,
      progressPct,
    };
  }, [records]);

  const chartData = useMemo(
    () => [
      { name: 'ExEE', amount: stats.excelEETotal, fill: '#0F172A' },
      { name: 'EPF', amount: stats.epfEETotal, fill: '#9A7AF1' },
      { name: 'ExIP', amount: stats.excelIPTotal, fill: '#64748B' },
      { name: 'ESIC', amount: stats.esicIPTotal, fill: '#10B981' },
    ],
    [stats]
  );

  const visibleRecords = useMemo(() => {
    if (snapshotTab === 'flagged') {
      return records.filter((r) => r.status !== 'Matched');
    }
    return records;
  }, [records, snapshotTab]);

  return (
    <div className="h-full min-h-0 flex flex-col gap-2 overflow-hidden">
      {/* Single-line Sub-bar */}
      <div className="shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] min-w-0">
          {isRealData ? (
            <span className="px-1.5 py-0.5 bg-[#E6F8F0] border border-[#10B981] rounded-[3px] font-mono font-bold text-[9.5px] uppercase tracking-wider text-[#0F172A] shrink-0">
              Live Scan
            </span>
          ) : (
            showDemoBanner && (
              <span className="px-1.5 py-0.5 bg-[#ECE6FD] border border-[#1E293B] rounded-[3px] font-mono font-bold text-[9.5px] uppercase tracking-wider text-[#0F172A] shrink-0">
                Demo Data
              </span>
            )
          )}
          <span className="text-[#64748B] font-medium truncate">
            Active Cycle: <strong className="text-[#0F172A]">{periodLabel}</strong> · Excel, EPF ECR & ESIC IP
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!readOnly && <button
            type="button"
            onClick={() => onNavigate('upload')}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] text-[11px] font-bold text-[#0F172A] hover:bg-[#ECE6FD] shadow-[2px_2px_0px_#0E0E10] cursor-pointer whitespace-nowrap"
          >
            <UploadCloud className="w-3 h-3" />
            <span>Upload Docs</span>
          </button>}
          <button
            type="button"
            onClick={() => {
              onSelectVerificationFilter('All');
              onNavigate('verification');
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#9A7AF1] border-2 border-[#0E0E10] rounded-[4px] text-[11px] font-bold text-[#FFFFFF] hover:bg-[#8965ec] shadow-[2px_2px_0px_#0E0E10] cursor-pointer whitespace-nowrap"
          >
            <span>Verification Grid</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Compact KPI Cards */}
      <div className="shrink-0 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={() => {
            onSelectVerificationFilter('Missing Record');
            onNavigate('verification');
          }}
          className="min-w-0 min-h-[68px] text-left bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-2.5 py-1.5 shadow-[3px_3px_0px_#0E0E10] hover:bg-[#FBF7F4] transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 pr-1">
              <div className="text-[9px] font-bold uppercase tracking-wider leading-tight text-[#64748B]">
                Total Employees
              </div>
              <div className="flex items-baseline gap-1.5 mt-1 min-w-0">
                <span className="font-display text-xl font-bold text-[#0F172A] tabular-nums leading-none shrink-0">
                  {stats.total || '—'}
                </span>
                <span className="text-[9px] leading-tight text-[#64748B] min-w-0 whitespace-normal break-words">
                  {stats.total ? 'active roster' : 'awaiting upload'}
                </span>
              </div>
            </div>
            <div className="w-7 h-7 rounded-[4px] bg-[#ECE6FD] border-2 border-[#1E293B] flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5 text-[#0F172A]" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onSelectVerificationFilter('Matched');
            onNavigate('verification');
          }}
          className="min-w-0 min-h-[68px] text-left bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-2.5 py-1.5 shadow-[3px_3px_0px_#0E0E10] hover:bg-[#E6F8F0]/40 transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 pr-1">
              <div className="text-[9px] font-bold uppercase tracking-wider leading-tight text-[#64748B]">
                Matched
              </div>
              <div className="flex items-baseline gap-1.5 mt-1 min-w-0">
                <span className="font-display text-xl font-bold text-[#0F172A] tabular-nums leading-none shrink-0">
                  {stats.total ? stats.matched : '—'}
                </span>
                <span className="text-[9px] leading-tight text-[#10B981] font-semibold min-w-0 whitespace-normal break-words">
                  {stats.total ? `${stats.progressPct}% verified` : 'awaiting upload'}
                </span>
              </div>
            </div>
            <div className="w-7 h-7 rounded-[4px] bg-[#E6F8F0] border-2 border-[#10B981] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onSelectVerificationFilter('Mismatch');
            onNavigate('verification');
          }}
          className="min-w-0 min-h-[68px] text-left bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-2.5 py-1.5 shadow-[3px_3px_0px_#0E0E10] hover:bg-[#F43F5E]/5 transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 pr-1">
              <div className="text-[9px] font-bold uppercase tracking-wider leading-tight text-[#64748B]">
                Mismatches
              </div>
              <div className="flex items-start gap-1.5 mt-1 min-w-0">
                <span className="font-display text-xl font-bold text-[#F43F5E] tabular-nums leading-none shrink-0">
                  {stats.total ? stats.mismatches : '—'}
                </span>
                <span className="text-[9px] leading-tight text-[#64748B] min-w-0 whitespace-normal break-words">amount differences</span>
              </div>
            </div>
            <div className="w-7 h-7 rounded-[4px] bg-[#F43F5E]/10 border-2 border-[#F43F5E] flex items-center justify-center shrink-0">
              <XOctagon className="w-3.5 h-3.5 text-[#F43F5E]" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (readOnly) {
              onSelectVerificationFilter('Needs Review');
              onNavigate('verification');
            } else {
              onNavigate('manual-review');
            }
          }}
          className="min-w-0 min-h-[68px] text-left bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-2.5 py-1.5 shadow-[3px_3px_0px_#0E0E10] hover:bg-[#F59E0B]/5 transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 pr-1">
              <div className="text-[9px] font-bold uppercase tracking-wider leading-tight text-[#64748B]">
                Needs Review
              </div>
              <div className="flex items-start gap-1.5 mt-1 min-w-0">
                <span className="font-display text-xl font-bold text-[#F59E0B] tabular-nums leading-none shrink-0">
                  {stats.total ? stats.needsReview : '—'}
                </span>
                <span className="text-[9px] leading-tight text-[#64748B] min-w-0 whitespace-normal break-words">fuzzy / blank IP</span>
              </div>
            </div>
            <div className="w-7 h-7 rounded-[4px] bg-[#F59E0B]/15 border-2 border-[#F59E0B] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('employees')}
          className="min-w-0 min-h-[68px] text-left bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-2.5 py-1.5 shadow-[3px_3px_0px_#0E0E10] hover:bg-[#0EA5E9]/5 transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 pr-1">
              <div className="text-[9px] font-bold uppercase tracking-wider leading-tight text-[#64748B]">
                Missing Values
              </div>
              <div className="flex items-start gap-1.5 mt-1 min-w-0">
                <span className="font-display text-xl font-bold text-[#0284C7] tabular-nums leading-none shrink-0">
                  {stats.total ? stats.missingValues : '—'}
                </span>
                <span className="text-[9px] leading-tight text-[#64748B] min-w-0 whitespace-normal break-words">
                  employees missing from challan
                </span>
              </div>
            </div>
            <div className="w-7 h-7 rounded-[4px] bg-[#E0F2FE] border-2 border-[#0284C7] flex items-center justify-center shrink-0">
              <FileWarning className="w-3.5 h-3.5 text-[#0284C7]" />
            </div>
          </div>
        </button>
      </div>

      {/* Compact Analytical Middle Row */}
      <div className="shrink-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5">
        {/* A. Audit Overview */}
        <section className="lg:col-span-5 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-3.5 py-2.5 shadow-[3px_3px_0px_#0E0E10] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <h2 className="font-display text-[11px] font-bold uppercase tracking-wider text-[#0F172A] flex items-center gap-1.5 whitespace-nowrap">
                <ShieldCheck className="w-3.5 h-3.5 text-[#9A7AF1] shrink-0" />
                <span>Audit Overview</span>
              </h2>
              <span className="font-mono text-xs font-bold text-[#0F172A] tabular-nums">
                {stats.total ? `${stats.progressPct}%` : '—'}
              </span>
            </div>
            <div className="w-full h-2.5 bg-[#F7F3F0] border border-[#1E293B] rounded-[2px] overflow-hidden">
              <div
                className="h-full bg-[#10B981] transition-all duration-300"
                style={{ width: `${stats.progressPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-2 pt-1.5 border-t border-[#E2DCD5]">
            <div>
              <div className="text-[9.5px] uppercase font-bold text-[#64748B]">Processed</div>
              <div className="font-mono text-xs font-bold text-[#0F172A] tabular-nums">
                {stats.total || '—'}
              </div>
            </div>
            <div>
              <div className="text-[9.5px] uppercase font-bold text-[#64748B]">Verified</div>
              <div className="font-mono text-xs font-bold text-[#10B981] tabular-nums">
                {stats.total ? stats.matched : '—'}
              </div>
            </div>
            <div>
              <div className="text-[9.5px] uppercase font-bold text-[#64748B]">Pending</div>
              <div className="font-mono text-xs font-bold text-[#F59E0B] tabular-nums">
                {stats.total ? stats.mismatches + stats.needsReview + stats.missingValues : '—'}
              </div>
            </div>
          </div>
        </section>

        {/* B. Contribution Summary */}
        <section className="lg:col-span-7 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-3.5 py-2.5 shadow-[3px_3px_0px_#0E0E10] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h2 className="font-display text-[11px] font-bold uppercase tracking-wider text-[#0F172A] flex items-center gap-1.5 whitespace-nowrap">
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#9A7AF1] shrink-0" />
              <span>Contribution Summary</span>
            </h2>
            <span className="text-[10px] font-mono font-semibold text-[#64748B] whitespace-nowrap">
              EXCEL vs CHALLAN
            </span>
          </div>

          <div className="grid grid-cols-12 gap-2.5 items-center">
            <div className="col-span-7 space-y-1.5">
              <div className="px-2 py-1 bg-[#F7F3F0] border border-[#E2DCD5] rounded-[3px] flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-[#0F172A] whitespace-nowrap">EPF EE</span>
                <span className="font-mono text-[#64748B] tabular-nums whitespace-nowrap">
                  {stats.total
                    ? `${formatINR(stats.excelEETotal)} / ${formatINR(stats.epfEETotal)}`
                    : '— / —'}
                </span>
                <span className="font-mono font-bold text-[#10B981] tabular-nums whitespace-nowrap">
                  {stats.total ? `${stats.epfMatchedCount}/${stats.total}` : '— / —'}
                </span>
              </div>
              <div className="px-2 py-1 bg-[#F7F3F0] border border-[#E2DCD5] rounded-[3px] flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-[#0F172A] whitespace-nowrap">ESIC IP</span>
                <span className="font-mono text-[#64748B] tabular-nums whitespace-nowrap">
                  {stats.total
                    ? `${formatINR(stats.excelIPTotal)} / ${formatINR(stats.esicIPTotal)}`
                    : '— / —'}
                </span>
                <span className="font-mono font-bold text-[#F59E0B] tabular-nums whitespace-nowrap">
                  {stats.total ? `${stats.esicMatchedCount}/${stats.total}` : '— / —'}
                </span>
              </div>
            </div>

            <div className="col-span-5 h-[62px]">
              {stats.total === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-[10px] text-[#64748B]">
                  Upload files to see contribution totals
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 2, right: 2, left: -24, bottom: 0 }}>
                  <XAxis
                    dataKey="name"
                    interval={0}
                    tick={{ fontSize: 9, fill: '#64748B', fontFamily: 'IBM Plex Mono' }}
                    axisLine={{ stroke: '#1E293B' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 8.5, fill: '#64748B', fontFamily: 'IBM Plex Mono' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(val) => [formatINR(Number(val ?? 0)), 'Amount']}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '2px solid #1E293B',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'IBM Plex Mono',
                    }}
                  />
                  <Bar dataKey="amount" radius={[2, 2, 0, 0]}>
                    {chartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* D. Employee Verification Table (Generous scrollable space) */}
      <section className="flex-1 min-h-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] shadow-[4px_4px_0px_#0E0E10] flex flex-col overflow-hidden">
        <div className="px-3 py-1.5 bg-[#F7F3F0] border-b-2 border-[#1E293B] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className="font-display text-[11px] font-bold uppercase tracking-wider text-[#0F172A] whitespace-nowrap">
              Employee Verification Snapshot
            </h2>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setSnapshotTab('all')}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-[3px] border cursor-pointer whitespace-nowrap ${
                  snapshotTab === 'all'
                    ? 'bg-[#9A7AF1] border-[#0E0E10] text-[#FFFFFF]'
                    : 'bg-[#FFFFFF] border-[#1E293B] text-[#0F172A] hover:bg-[#ECE6FD]'
                }`}
              >
                All ({records.length || '—'})
              </button>
              <button
                type="button"
                onClick={() => setSnapshotTab('flagged')}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-[3px] border cursor-pointer whitespace-nowrap ${
                  snapshotTab === 'flagged'
                    ? 'bg-[#F43F5E] border-[#0E0E10] text-[#FFFFFF]'
                    : 'bg-[#FFFFFF] border-[#1E293B] text-[#0F172A] hover:bg-[#F43F5E]/10'
                }`}
              >
                Flagged ({records.length ? records.filter((r) => r.status !== 'Matched').length : '—'})
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectVerificationFilter('All');
              onNavigate('verification');
            }}
            className="text-[11px] font-bold text-[#0F172A] hover:text-[#9A7AF1] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Open Full Comparison ({records.length || '—'})</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden audit-scroll">
          <table className="w-full table-fixed border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[#F7F3F0] border-b-2 border-[#1E293B]">
              <tr className="text-[9.5px] font-bold uppercase tracking-wider text-[#0F172A] whitespace-nowrap">
                <th className="w-[21%] py-1.5 px-2.5 text-left">Employee Name</th>
                <th className="w-[9%] py-1.5 px-1 text-center">Excel EE</th>
                <th className="w-[9%] py-1.5 px-1 text-center">EPF EE</th>
                <th className="w-[11%] py-1.5 px-1 text-center">EE Diff</th>
                <th className="w-[9%] py-1.5 px-1 text-center">Excel IP</th>
                <th className="w-[9%] py-1.5 px-1 text-center">ESIC IP</th>
                <th className="w-[13.5%] py-1.5 px-1 text-center">IP Diff</th>
                <th className="w-[18.5%] py-1.5 px-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2DCD5] text-[10.5px]">
              {visibleRecords.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-[#64748B]">
                    {records.length === 0
                      ? 'No scanned employee rows yet. Upload an Attendance Excel or challan PDF to begin.'
                      : 'All employees matched — switch to "All" tab to inspect all verified records.'}
                  </td>
                </tr>
              )}
              {visibleRecords.slice(0, 120).map((rec) => {
                const eeDiff = formatDiffINR(rec.excelEE, rec.epfEE);
                const ipDiff = formatDiffINR(rec.excelIP, rec.esicIP);

                return (
                  <tr
                    key={rec.id}
                    onClick={() => onInspectEmployee(rec.id)}
                    className="hover:bg-[#ECE6FD]/45 transition-colors cursor-pointer"
                  >
                    <td className="py-1.5 px-2.5 min-w-0 align-middle">
                      <div className="font-semibold text-[#0F172A] leading-tight truncate">
                        {rec.name}
                      </div>
                      <div className="text-[9.5px] font-mono text-[#64748B] truncate">
                        {rec.empCode} · {rec.department}
                      </div>
                    </td>
                    <td className="py-1.5 px-1 text-center align-middle font-mono tabular-nums text-[#0F172A] whitespace-nowrap">
                      {rec.excelEE === null ? (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-[#F59E0B]/15 text-[#0F172A] border border-[#F59E0B] rounded-[2px] text-[9px] font-bold leading-none">
                          Blank
                        </span>
                      ) : (
                        formatINR(rec.excelEE)
                      )}
                    </td>
                    <td className="py-1.5 px-1 text-center align-middle font-mono tabular-nums text-[#0F172A] whitespace-nowrap">
                      {rec.epfEE === null ? (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-[#F43F5E]/15 text-[#F43F5E] border border-[#F43F5E] rounded-[2px] text-[9px] font-bold leading-none">
                          Missing
                        </span>
                      ) : (
                        formatINR(rec.epfEE)
                      )}
                    </td>
                    <td
                      className={`py-1.5 px-1 text-center align-middle font-mono font-semibold tabular-nums whitespace-nowrap ${
                        eeDiff.isBlankOrMissing
                          ? 'text-[#64748B]'
                          : eeDiff.hasVariance
                          ? 'text-[#F43F5E]'
                          : 'text-[#10B981]'
                      }`}
                    >
                      {eeDiff.text === 'Blank Excel' ? (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-[#F59E0B]/15 text-[#0F172A] border border-[#F59E0B] rounded-[2px] text-[9px] font-bold leading-none">
                          {eeDiff.text}
                        </span>
                      ) : (
                        eeDiff.text
                      )}
                    </td>
                    <td className="py-1.5 px-1 text-center align-middle font-mono tabular-nums text-[#0F172A] whitespace-nowrap">
                      {rec.excelIP === null ? (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-[#F59E0B]/15 text-[#0F172A] border border-[#F59E0B] rounded-[2px] text-[9px] font-bold leading-none">
                          Blank
                        </span>
                      ) : (
                        formatINR(rec.excelIP)
                      )}
                    </td>
                    <td className="py-1.5 px-1 text-center align-middle font-mono tabular-nums text-[#0F172A] whitespace-nowrap">
                      {rec.esicIP === null ? (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-[#F43F5E]/15 text-[#F43F5E] border border-[#F43F5E] rounded-[2px] text-[9px] font-bold leading-none">
                          Missing
                        </span>
                      ) : (
                        formatINR(rec.esicIP)
                      )}
                    </td>
                    <td
                      className={`py-1.5 px-1 text-center align-middle font-mono font-semibold tabular-nums whitespace-nowrap ${
                        ipDiff.isBlankOrMissing
                          ? 'text-[#64748B]'
                          : ipDiff.hasVariance
                          ? 'text-[#F43F5E]'
                          : 'text-[#10B981]'
                      }`}
                    >
                      {ipDiff.text === 'Blank Excel' ? (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-[#F59E0B]/15 text-[#0F172A] border border-[#F59E0B] rounded-[2px] text-[9px] font-bold leading-none">
                          {ipDiff.text}
                        </span>
                      ) : (
                        ipDiff.text
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-center align-middle whitespace-nowrap">
                      <StatusTag status={rec.status} compact />
                    </td>
                  </tr>
                );
              })}
              {visibleRecords.length > 120 && (
                <tr className="bg-[#F7F3F0]">
                  <td colSpan={8} className="py-2 px-3 text-center text-[11px] font-semibold text-[#0F172A]">
                    Showing first 120 of {visibleRecords.length.toLocaleString('en-IN')} records —{' '}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectVerificationFilter('All');
                        onNavigate('verification');
                      }}
                      className="text-[#9A7AF1] underline font-bold cursor-pointer"
                    >
                      Open Full Comparison
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
