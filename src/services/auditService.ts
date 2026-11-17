import type {
  AuditSettings,
  EmployeeAuditRecord,
  ManualMatchCandidate,
  UploadedDocState,
} from '../types/audit';
import { apiFetch } from './authService';

export interface ServerAuditResponse {
  slot?: 'excel' | 'epf' | 'esic';
  docState?: UploadedDocState;
  warnings?: string[];
  hasRealData: boolean;
  docs: Record<'excel' | 'epf' | 'esic', UploadedDocState | null>;
  records: EmployeeAuditRecord[];
  manualCandidates?: ManualMatchCandidate[];
}

export async function uploadAuditDocument(
  slot: 'excel' | 'epf' | 'esic',
  file: File,
  periodId: string,
  settings: AuditSettings
): Promise<ServerAuditResponse> {
  const formData = new FormData();
  formData.append('slot', slot);
  formData.append('periodId', periodId);
  formData.append('settings', JSON.stringify(settings));
  formData.append('file', file);

  const res = await apiFetch('/api/audit/upload', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to parse uploaded document.');
  }
  return data as ServerAuditResponse;
}

export async function removeAuditDocument(
  slot: 'excel' | 'epf' | 'esic',
  periodId: string
): Promise<ServerAuditResponse> {
  const res = await apiFetch(
    `/api/audit/upload/${encodeURIComponent(slot)}?periodId=${encodeURIComponent(periodId)}`,
    { method: 'DELETE' }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to remove uploaded document.');
  }
  return data as ServerAuditResponse;
}

export async function runServerVerification(
  periodId: string,
  settings: AuditSettings
): Promise<ServerAuditResponse> {
  const res = await apiFetch('/api/audit/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ periodId, settings }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Verification failed on server.');
  }
  return data as ServerAuditResponse;
}

export async function recomputeAuditRecords(
  periodId: string,
  settings: AuditSettings,
  records: EmployeeAuditRecord[]
): Promise<{
  hasRealData: boolean;
  records: EmployeeAuditRecord[];
  manualCandidates?: ManualMatchCandidate[];
}> {
  const res = await apiFetch('/api/audit/recompute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ periodId, settings, records }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to recompute audit thresholds.');
  }
  return data;
}

export async function resetServerWorkspace(periodId: string): Promise<void> {
  await apiFetch('/api/audit/reset-demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ periodId }),
  });
}

export function generateDemoCsvContent(
  reportTitle: string,
  records: EmployeeAuditRecord[]
): string {
  const headers = [
    'Emp Code',
    'Employee Name',
    'Department',
    'UAN',
    'IP Number',
    'Attendance Days',
    'Excel EE (INR)',
    'EPF EE (INR)',
    'EE Diff (INR)',
    'Excel IP (INR)',
    'ESIC IP (INR)',
    'IP Diff (INR)',
    'Verification Status',
    'Audit Notes',
  ];

  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;

  const rows = records.map((r) => {
    const eeDiff =
      r.excelEE !== null && r.epfEE !== null ? String(r.excelEE - r.epfEE) : 'N/A';
    const ipDiff =
      r.excelIP !== null && r.esicIP !== null ? String(r.excelIP - r.esicIP) : 'N/A';

    return [
      r.empCode,
      r.name,
      r.department,
      r.uan ?? 'UNMAPPED',
      r.ipNumber ?? 'UNMAPPED',
      `${r.attendanceDays}/${r.workingDays}`,
      r.excelEE !== null ? String(r.excelEE) : 'BLANK',
      r.epfEE !== null ? String(r.epfEE) : 'MISSING',
      eeDiff,
      r.excelIP !== null ? String(r.excelIP) : 'BLANK',
      r.esicIP !== null ? String(r.esicIP) : 'MISSING',
      ipDiff,
      r.status,
      r.flagReason,
    ]
      .map(escape)
      .join(',');
  });

  return [`# ${reportTitle}`, headers.map(escape).join(','), ...rows].join('\n');
}

export function triggerClientFileDownload(
  filename: string,
  content: string,
  mimeType = 'text/csv;charset=utf-8;'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
