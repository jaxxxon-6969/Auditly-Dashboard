import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  ArrowUpRight,
  User,
  ChevronDown,
} from 'lucide-react';
import { EmployeeAuditRecord } from '../types/audit';
import { formatINR } from '../utils/formatters';
import { StatusTag } from '../components/StatusTag';

interface EmployeeRecordsPageProps {
  records: EmployeeAuditRecord[];
  globalSearch: string;
  compactRows: boolean;
  onInspectInVerification: (recordId: string) => void;
}

type RecordFilter = 'All' | 'Full Attendance' | 'Partial Leave' | 'Unmapped ID';

const CONTRACTOR_COLORS: Record<string, { background: string; border: string; text: string }> = {
  TIWARI: { background: '#D8F3EE', border: '#0F766E', text: '#115E59' },
  PRAKASH: { background: '#DBEAFE', border: '#1D4ED8', text: '#1E3A8A' },
  MAQSOOD: { background: '#FFEDD5', border: '#C2410C', text: '#9A3412' },
  PANDEY: { background: '#DCFCE7', border: '#15803D', text: '#166534' },
  ABRAHAM: { background: '#FCE7F3', border: '#BE185D', text: '#9D174D' },
};

const contractorColor = (name: string) =>
  CONTRACTOR_COLORS[name.toUpperCase()] ?? {
    background: '#E5E7EB',
    border: '#475569',
    text: '#1E293B',
  };

const KNOWN_CONTRACTOR_ORDER = ['TIWARI', 'PRAKASH', 'MAQSOOD', 'PANDEY', 'ABRAHAM'];

interface FilterDropdownOption {
  value: string;
  label: string;
  style?: React.CSSProperties;
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: FilterDropdownOption[];
  onChange: (value: string) => void;
  selectedStyle?: React.CSSProperties;
  className?: string;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({
  label,
  value,
  options,
  onChange,
  selectedStyle,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    const closeWhenOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', closeWhenOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeWhenOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (!selectedOption) return null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="h-[34px] w-full inline-flex items-center justify-between gap-2 px-2.5 text-[11px] font-bold bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] text-[#0F172A] shadow-[2px_2px_0px_#0E0E10] hover:bg-[#ECE6FD] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9A7AF1] cursor-pointer"
        style={selectedStyle}
      >
        <span className="truncate">{selectedOption.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full z-40 mt-1 w-full min-w-[168px] max-h-64 overflow-y-auto audit-scroll bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[3px] shadow-[4px_4px_0px_#0E0E10] p-1"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] font-bold border-2 border-transparent rounded-[2px] cursor-pointer hover:border-[#1E293B] focus:outline-none focus-visible:border-[#1E293B] ${
                value === option.value ? 'border-[#1E293B] shadow-[2px_2px_0px_#0E0E10]' : ''
              }`}
              style={option.style}
            >
              <span className="truncate">{option.label}</span>
              {value === option.value && <span className="font-mono text-[9px]">SELECTED</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const EmployeeRecordsPage: React.FC<EmployeeRecordsPageProps> = ({
  records,
  globalSearch,
  compactRows,
  onInspectInVerification,
}) => {
  const [localSearch, setLocalSearch] = useState('');
  const [contractorFilter, setContractorFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [attendanceFilter, setAttendanceFilter] = useState<RecordFilter>('All');
  const [selectedId, setSelectedId] = useState<string>(records[0]?.id ?? '');

  // When a new verification result arrives, clear old filters and selection
  // so the employee list immediately reflects the latest data.
  useEffect(() => {
    setLocalSearch('');
    setContractorFilter('All');
    setDepartmentFilter('All');
    setAttendanceFilter('All');
    setSelectedId(records[0]?.id ?? '');
  }, [records]);

  const departments = useMemo(() => {
    const set = new Set(records.map((r) => r.department));
    return ['All', ...Array.from(set)];
  }, [records]);

  const contractors = useMemo(() => {
    const names = Array.from(
      new Set(records.map((record) => record.contractorName?.trim()).filter(Boolean) as string[])
    );
    return names.sort((a, b) => {
      const aIndex = KNOWN_CONTRACTOR_ORDER.indexOf(a.toUpperCase());
      const bIndex = KNOWN_CONTRACTOR_ORDER.indexOf(b.toUpperCase());
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
          (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      }
      return a.localeCompare(b);
    });
  }, [records]);

  const effectiveSearch = (localSearch || globalSearch).trim().toLowerCase();

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (contractorFilter !== 'All' && r.contractorName !== contractorFilter) {
        return false;
      }
      if (departmentFilter !== 'All' && r.department !== departmentFilter) {
        return false;
      }
      if (attendanceFilter === 'Full Attendance' && r.attendanceDays < r.workingDays) {
        return false;
      }
      if (attendanceFilter === 'Partial Leave' && r.attendanceDays >= r.workingDays) {
        return false;
      }
      if (attendanceFilter === 'Unmapped ID' && r.uan && r.ipNumber) {
        return false;
      }
      if (effectiveSearch) {
        const hay = `${r.name} ${r.empCode} ${r.uan ?? ''} ${r.ipNumber ?? ''} ${r.department} ${r.contractorName ?? ''}`.toLowerCase();
        if (!hay.includes(effectiveSearch)) return false;
      }
      return true;
    });
  }, [records, contractorFilter, departmentFilter, attendanceFilter, effectiveSearch]);

  const selectedRecord =
    filteredRecords.find((r) => r.id === selectedId) ?? filteredRecords[0] ?? null;

  const contractorOptions = useMemo(
    () => [
      { value: 'All', label: 'All Contractors' },
      ...contractors.map((contractor) => {
        const colors = contractorColor(contractor);
        return {
          value: contractor,
          label: contractor,
          style: { backgroundColor: colors.background, color: colors.text },
        };
      }),
    ],
    [contractors]
  );

  const departmentOptions = useMemo(
    () =>
      departments.map((department) => ({
        value: department,
        label: department === 'All' ? 'All Departments' : department,
      })),
    [departments]
  );

  const rowPad = compactRows ? 'py-1' : 'py-1.5';

  return (
    <div className="h-full min-h-0 flex flex-col gap-2.5 overflow-hidden">
      {/* Compact Filter & Search Toolbar */}
      <div className="shrink-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-3 py-2 shadow-[3px_3px_0px_#0E0E10] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Filter name, UAN, IP..."
              className="w-44 pl-8 pr-2.5 py-1 text-[11px] bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:border-[#9A7AF1]"
            />
          </div>

          {contractors.length > 0 && (
            <FilterDropdown
              label="Filter by contractor"
              value={contractorFilter}
              options={contractorOptions}
              onChange={setContractorFilter}
              className="w-[152px]"
              selectedStyle={
                contractorFilter === 'All'
                  ? undefined
                  : {
                      borderColor: contractorColor(contractorFilter).border,
                      backgroundColor: contractorColor(contractorFilter).background,
                      color: contractorColor(contractorFilter).text,
                    }
              }
            />
          )}

          <FilterDropdown
            label="Filter by department"
            value={departmentFilter}
            options={departmentOptions}
            onChange={setDepartmentFilter}
            className="w-[188px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {(['All', 'Full Attendance', 'Partial Leave', 'Unmapped ID'] as RecordFilter[]).map(
            (tab) => {
              const active = attendanceFilter === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setAttendanceFilter(tab)}
                  className={`px-2 py-1 text-[10.5px] font-bold rounded-[3px] border-2 transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#9A7AF1] border-[#0E0E10] text-[#FFFFFF]'
                      : 'bg-[#F7F3F0] border-[#1E293B] text-[#0F172A] hover:bg-[#ECE6FD]'
                  }`}
                >
                  {tab}
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Balanced Side-by-Side Split: Compact Employee Table + Employee Info Panel */}
      <div className="flex-1 min-h-0 flex gap-2.5 overflow-hidden">
        {/* Employee Table */}
        <div className="flex-1 min-w-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] shadow-[4px_4px_0px_#0E0E10] flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden audit-scroll">
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[#F7F3F0] border-b-2 border-[#1E293B]">
                <tr className="text-[9px] font-bold uppercase tracking-wider text-[#0F172A] whitespace-nowrap">
                  <th className="w-[30%] py-1.5 px-2.5">Employee</th>
                  <th className="w-[22%] py-1.5 px-1.5">UAN / IP</th>
                  <th className="w-[9%] py-1.5 px-1.5">Days</th>
                  <th className="w-[12%] py-1.5 px-1.5 text-right">Excel EE</th>
                  <th className="w-[10%] py-1.5 px-1.5 text-right">Excel IP</th>
                  <th className="w-[17%] py-1.5 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DCD5] text-[9px]">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#64748B]">
                      No employee records match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => {
                    const isSelected = selectedRecord?.id === rec.id;
                    const pct = Math.round((rec.attendanceDays / rec.workingDays) * 100);
                    return (
                      <tr
                        key={rec.id}
                        onClick={() => setSelectedId(rec.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#ECE6FD]' : 'hover:bg-[#FDF9F6]'
                        }`}
                      >
                        <td className={`${rowPad} px-2.5 min-w-0 border-l-[3px] ${isSelected ? 'border-l-[#9A7AF1]' : 'border-l-transparent'}`}>
                          <div className="font-display text-[9px] font-bold tracking-tight text-[#0F172A] leading-tight whitespace-normal break-words">
                            {rec.name}
                          </div>
                          <div className="text-[8.5px] text-[#64748B] font-mono truncate">
                            {rec.empCode} · {rec.department}
                          </div>
                          {rec.contractorName && (
                            <span
                              className="mt-0.5 inline-flex rounded-[2px] border px-1 py-0.5 text-[8px] font-bold leading-none"
                              style={{
                                backgroundColor: contractorColor(rec.contractorName).background,
                                borderColor: contractorColor(rec.contractorName).border,
                                color: contractorColor(rec.contractorName).text,
                              }}
                            >
                              {rec.contractorName}
                            </span>
                          )}
                        </td>
                        <td className={`${rowPad} px-1.5 font-mono text-[8.5px] tabular-nums whitespace-nowrap`}>
                          <div className="text-[#0F172A]">
                            U:{' '}
                            {rec.uan ? (
                              rec.uan
                            ) : (
                              <span className="text-[#F59E0B] font-bold">UNMAPPED</span>
                            )}
                          </div>
                          <div className="text-[#64748B]">
                            I:{' '}
                            {rec.ipNumber ? (
                              rec.ipNumber
                            ) : (
                              <span className="text-[#F59E0B] font-bold">UNMAPPED</span>
                            )}
                          </div>
                        </td>
                        <td className={`${rowPad} px-1.5 whitespace-nowrap`}>
                          <div className="font-mono font-semibold text-[#0F172A] tabular-nums">
                            {rec.attendanceDays}/{rec.workingDays}
                          </div>
                          <div className="text-[9.5px] text-[#64748B] font-mono tabular-nums">
                            {pct}%
                          </div>
                        </td>
                        <td
                          className={`${rowPad} px-1.5 text-right font-mono font-semibold tabular-nums text-[#0F172A] whitespace-nowrap`}
                        >
                          {rec.excelEE === null ? (
                            <span className="text-[#F59E0B]">Blank</span>
                          ) : (
                            formatINR(rec.excelEE)
                          )}
                        </td>
                        <td
                          className={`${rowPad} px-1.5 text-right font-mono font-semibold tabular-nums text-[#0F172A] whitespace-nowrap`}
                        >
                          {rec.excelIP === null ? (
                            <span className="text-[#F59E0B]">Blank</span>
                          ) : (
                            formatINR(rec.excelIP)
                          )}
                        </td>
                        <td className={`${rowPad} px-2 whitespace-nowrap`}>
                          <StatusTag status={rec.status} compact />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Employee count footer; the list itself scrolls above. */}
          <div className="shrink-0 px-3 py-1.5 bg-[#F7F3F0] border-t-2 border-[#1E293B] flex items-center justify-between gap-2 text-xs">
            <span className="font-mono text-[11px] text-[#64748B] tabular-nums whitespace-nowrap">
              {filteredRecords.length} employee{filteredRecords.length === 1 ? '' : 's'}
            </span>
            <span className="text-[10.5px] text-[#64748B]">Scroll the list to view all records</span>
          </div>
        </div>

        {/* Right Side Employee Info Panel */}
        <aside className="hidden md:flex w-[240px] xl:w-[276px] shrink-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] shadow-[4px_4px_0px_#0E0E10] flex-col justify-between p-3 min-h-0 overflow-y-auto audit-scroll">
          {selectedRecord ? (
            <>
              <div className="space-y-2.5">
                <div className="flex items-start gap-2 pb-2 border-b border-[#E2DCD5]">
                  <div className="w-8 h-8 rounded-[4px] bg-[#0E0E10] text-[#FFFFFF] flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-[#9A7AF1]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-[10px] font-bold tracking-tight text-[#0F172A] leading-snug whitespace-normal break-words">
                      {selectedRecord.name}
                    </h3>
                    <div className="text-[10.5px] font-mono text-[#64748B] truncate">
                      {selectedRecord.empCode} · {selectedRecord.department}
                    </div>
                  </div>
                </div>
                {selectedRecord.contractorName && (
                  <div className="-mt-1 min-w-0">
                    <span
                      className="inline-flex max-w-full whitespace-normal break-words rounded-[2px] border px-1.5 py-0.5 text-[9px] font-bold"
                      style={{
                        backgroundColor: contractorColor(selectedRecord.contractorName).background,
                        borderColor: contractorColor(selectedRecord.contractorName).border,
                        color: contractorColor(selectedRecord.contractorName).text,
                      }}
                    >
                      {selectedRecord.contractorName}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                    Status
                  </span>
                  <StatusTag status={selectedRecord.status} compact />
                </div>

                <div className="bg-[#F7F3F0] border border-[#E2DCD5] rounded-[4px] p-2.5 space-y-1.5 text-[10px]">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#64748B]">UAN</span>
                    <span className="font-mono font-bold text-[#0F172A]">
                      {selectedRecord.uan ?? 'Unmapped'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#64748B]">ESIC IP</span>
                    <span className="font-mono font-bold text-[#0F172A]">
                      {selectedRecord.ipNumber ?? 'Unmapped'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#64748B]">Paid Days</span>
                    <span className="font-mono font-bold text-[#0F172A]">
                      {selectedRecord.attendanceDays} / {selectedRecord.workingDays}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#64748B]">Gross Wages</span>
                    <span className="font-mono font-bold text-[#0F172A] tabular-nums">
                      {formatINR(selectedRecord.grossWages)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px]">
                    <div className="text-[9.5px] font-bold uppercase text-[#64748B]">
                      Excel EE
                    </div>
                    <div className="font-mono text-xs font-bold text-[#0F172A] tabular-nums mt-0.5">
                      {selectedRecord.excelEE === null ? 'Blank' : formatINR(selectedRecord.excelEE)}
                    </div>
                  </div>
                  <div className="p-2 bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px]">
                    <div className="text-[9.5px] font-bold uppercase text-[#64748B]">
                      Excel IP
                    </div>
                    <div className="font-mono text-xs font-bold text-[#0F172A] tabular-nums mt-0.5">
                      {selectedRecord.excelIP === null ? 'Blank' : formatINR(selectedRecord.excelIP)}
                    </div>
                  </div>
                </div>

                <div className="p-2 bg-[#FBF7F4] border border-[#E2DCD5] rounded-[4px]">
                  <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#64748B] mb-0.5">
                    Register Note
                  </div>
                  <p className="text-[11px] text-[#0F172A] leading-snug">
                    {selectedRecord.flagReason}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onInspectInVerification(selectedRecord.id)}
                className="mt-2.5 w-full py-1.5 px-2.5 bg-[#9A7AF1] border-2 border-[#0E0E10] rounded-[4px] text-[11px] font-bold text-[#FFFFFF] shadow-[2px_2px_0px_#0E0E10] hover:bg-[#8965ec] flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <span>Inspect Diff</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="text-xs text-[#64748B]">Select an employee row to inspect details.</div>
          )}
        </aside>
      </div>
    </div>
  );
};
