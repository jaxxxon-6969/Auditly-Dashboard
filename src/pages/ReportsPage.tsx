import React, { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  X,
  CheckCircle2,
  Pencil,
  Printer,
} from 'lucide-react';
import { AuditSettings, EmployeeAuditRecord, ManualMatchCandidate, UploadedDocState } from '../types/audit';
import { formatDiffINR, formatINR } from '../utils/formatters';
import { triggerClientFileDownload } from '../services/auditService';

interface ReportsPageProps {
  records: EmployeeAuditRecord[];
  candidates: ManualMatchCandidate[];
  periodLabel: string;
  settings: AuditSettings;
  uploadedDocs: Record<'excel' | 'epf' | 'esic', UploadedDocState | null>;
  onReportExported: (reportTitle: string, format: 'CSV' | 'Word' | 'PDF') => void;
  readOnly?: boolean;
}

interface ReportDefinition {
  id: string;
  title: string;
  subtitle: string;
  categoryLabel: string;
  subset: EmployeeAuditRecord[];
  metricLabel: string;
  metricValue: string;
  accent: 'lilac' | 'emerald' | 'coral' | 'amber';
}

interface ReportDraft {
  report: ReportDefinition;
  title: string;
  reportDate: string;
  overview: string;
  observations: string;
  recommendations: string;
  organizationName: string;
  preparedBy: string;
  reviewedBy: string;
  pageSize: AuditSettings['reportPageSize'];
  fileNameOrder: AuditSettings['reportFileNameOrder'];
  includeOverview: boolean;
  includeSummary: boolean;
  includeEmployeeDetails: boolean;
  includeReviewDecisions: boolean;
  includeSources: boolean;
  includeRecommendations: boolean;
  recordScope: 'open' | 'mismatch' | 'needs-review' | 'blank-ip' | 'missing';
  readyWithExceptions: boolean;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);

const safeFileName = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'audit_report';

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const ReportsPage: React.FC<ReportsPageProps> = ({
  records,
  candidates,
  periodLabel,
  settings,
  uploadedDocs,
  onReportExported,
  readOnly = false,
}) => {
  const [draft, setDraft] = useState<ReportDraft | null>(null);

  const reports = useMemo<ReportDefinition[]>(() => {
    const epfIssues = records.filter(
      (r) => r.epfEE === null || r.excelEE === null || r.excelEE !== r.epfEE
    );
    const esicIssues = records.filter(
      (r) => r.esicIP === null || r.excelIP === null || r.excelIP !== r.esicIP
    );
    const mismatches = records.filter((r) => r.status === 'Mismatch');
    const unmatched = records.filter(
      (r) => r.status === 'Missing Record' || r.status === 'Needs Review'
    );
    const blankIp = records.filter(
      (r) => r.excelIP === null || r.status === 'Blank IP'
    );

    const matchedCount = records.filter((r) => r.status === 'Matched').length;
    const totalEE = records.reduce((s, r) => s + (r.excelEE ?? 0), 0);
    const totalIP = records.reduce((s, r) => s + (r.excelIP ?? 0), 0);

    return [
      {
        id: 'overall-summary',
        title: 'Overall Audit Summary',
        subtitle: 'Cross-document audit across Excel, EPF & ESIC.',
        categoryLabel: 'MASTER AUDIT',
        subset: records,
        metricLabel: 'Matched',
        metricValue: `${matchedCount} / ${records.length} (${formatINR(totalEE + totalIP)})`,
        accent: 'lilac',
      },
      {
        id: 'epf-verification',
        title: 'EPF Verification Report',
        subtitle: 'Member EE check against EPF ECR challan.',
        categoryLabel: 'EPF ECR',
        subset: records,
        metricLabel: 'EE Flagged',
        metricValue: `${epfIssues.length} flagged`,
        accent: 'emerald',
      },
      {
        id: 'esic-verification',
        title: 'ESIC Verification Report',
        subtitle: 'Member IP check against ESIC contribution PDF.',
        categoryLabel: 'ESIC IP',
        subset: records,
        metricLabel: 'IP Flagged',
        metricValue: `${esicIssues.length} flagged`,
        accent: 'emerald',
      },
      {
        id: 'mismatch-report',
        title: 'Mismatch Report',
        subtitle: 'Non-zero rupee differences vs statutory PDFs.',
        categoryLabel: 'VARIANCES',
        subset: mismatches,
        metricLabel: 'Mismatches',
        metricValue: `${mismatches.length} employees`,
        accent: 'coral',
      },
      {
        id: 'unmatched-employee',
        title: 'Unmatched Employees',
        subtitle: 'Missing PDF records or uncertain identity queue.',
        categoryLabel: 'IDENTITY',
        subset: unmatched,
        metricLabel: 'Unmatched',
        metricValue: `${unmatched.length} employees`,
        accent: 'amber',
      },
      {
        id: 'blank-ip-report',
        title: 'Blank IP Report',
        subtitle: 'Blank Excel IP cells (never treated as ₹0).',
        categoryLabel: 'DATA HYGIENE',
        subset: blankIp,
        metricLabel: 'Blank Cells',
        metricValue: `${blankIp.length} records`,
        accent: 'amber',
      },
    ];
  }, [records]);

  const openEditor = (rep: ReportDefinition) => {
    const dateLabel = new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(new Date());

    setDraft({
      report: rep,
      title: rep.title,
      reportDate: dateLabel,
      overview: `${periodLabel}: This report reflects the current payroll contribution verification results for the selected employee scope.`,
      observations: 'Review the discrepancy summary, employee status, and contribution details for the records included in this report.',
      recommendations: 'Resolve any flagged records and confirm the supporting source documents before sharing final figures.',
      organizationName: settings.organizationName,
      preparedBy: settings.reportPreparedBy,
      reviewedBy: settings.reportReviewedBy,
      pageSize: settings.reportPageSize,
      fileNameOrder: settings.reportFileNameOrder,
      includeOverview: settings.reportIncludeOverview,
      includeSummary: settings.reportIncludeSummary,
      includeEmployeeDetails: settings.reportIncludeEmployeeDetails,
      includeReviewDecisions: settings.reportIncludeReviewDecisions,
      includeSources: settings.reportIncludeSources,
      includeRecommendations: settings.reportIncludeRecommendations,
      recordScope: 'open',
      readyWithExceptions: false,
    });
  };

  const getDraftRecords = (reportDraft: ReportDraft) => {
    const openRecords = reportDraft.report.subset.filter((record) => record.status !== 'Matched');
    const scopeStatus: Partial<Record<ReportDraft['recordScope'], EmployeeAuditRecord['status']>> = {
      mismatch: 'Mismatch',
      'needs-review': 'Needs Review',
      'blank-ip': 'Blank IP',
      missing: 'Missing Record',
    };
    if (reportDraft.recordScope === 'open') return openRecords;
    const exactStatus = scopeStatus[reportDraft.recordScope];
    return exactStatus
      ? openRecords.filter((record) => record.status === exactStatus)
      : openRecords;
  };

  const draftRecords = draft ? getDraftRecords(draft) : [];
  const relatedCandidates = draft
    ? candidates.filter((candidate) =>
        draftRecords.some((record) => record.id === candidate.employeeRecordId)
      )
    : [];
  const openRecordCount = draftRecords.filter((record) => record.status !== 'Matched').length;
  const pendingReviewCount = relatedCandidates.filter((candidate) => candidate.decision === 'Pending').length;
  const hasReportData = Boolean(draft?.report.subset.length);
  const isReadyToShare = hasReportData && openRecordCount === 0 && pendingReviewCount === 0;
  const readinessLabel = !hasReportData
    ? 'No data'
    : isReadyToShare
    ? 'Ready to Share'
    : draft?.readyWithExceptions
    ? 'Ready with exceptions'
    : 'Draft';
  const sourceDocuments = [
    { label: 'Attendance Excel', doc: uploadedDocs.excel },
    { label: 'EPF ECR PDF', doc: uploadedDocs.epf },
    { label: 'ESIC IP PDF', doc: uploadedDocs.esic },
  ].filter((source): source is { label: string; doc: UploadedDocState } => Boolean(source.doc));
  const exportFileBase = (reportDraft: ReportDraft) => {
    const reportName = safeFileName(reportDraft.title);
    const periodName = safeFileName(periodLabel);
    return reportDraft.fileNameOrder === 'period-report'
      ? `${periodName}_${reportName}`
      : `${reportName}_${periodName}`;
  };

  const buildCsv = (reportDraft: ReportDraft) => {
    const reportRecords = getDraftRecords(reportDraft);
    const reviewByEmployee = new Map<string, string[]>();
    relatedCandidates.forEach((candidate) => {
      const current = reviewByEmployee.get(candidate.employeeRecordId) ?? [];
      current.push(`${candidate.pdfSource}: ${candidate.decision}`);
      reviewByEmployee.set(candidate.employeeRecordId, current);
    });
    const headers = [
      'Employee Code', 'Employee Name', 'Department', 'UAN', 'ESIC IP',
      'Attendance', 'Excel EE', 'EPF EE', 'EE Difference', 'Excel IP', 'ESIC IP Amount',
      'IP Difference', 'Verification Status',
      ...(reportDraft.includeReviewDecisions ? ['Manual Review'] : []), 'Audit Notes',
    ];
    const rows = reportDraft.includeEmployeeDetails ? reportRecords.map((record) => {
      const eeDiff = formatDiffINR(record.excelEE, record.epfEE);
      const ipDiff = formatDiffINR(record.excelIP, record.esicIP);
      const row = [
        record.empCode,
        record.name,
        record.department,
        record.uan ?? 'UNMAPPED',
        record.ipNumber ?? 'UNMAPPED',
        `${record.attendanceDays}/${record.workingDays}`,
        record.excelEE === null ? 'BLANK' : record.excelEE,
        record.epfEE === null ? 'MISSING' : record.epfEE,
        eeDiff.text,
        record.excelIP === null ? 'BLANK' : record.excelIP,
        record.esicIP === null ? 'MISSING' : record.esicIP,
        ipDiff.text,
        record.status,
      ];
      if (reportDraft.includeReviewDecisions) {
        row.push((reviewByEmployee.get(record.id) ?? []).join('; ') || '-');
      }
      const auditNote = record.flagReason && record.sourceNotes && record.flagReason !== record.sourceNotes
        ? `${record.flagReason} ${record.sourceNotes}`
        : record.flagReason || record.sourceNotes || '-';
      row.push(auditNote);
      return row;
    }) : [];
    const reportFields = [
      ['Report Field', 'Value'].map(csvCell).join(','),
      ['Report title', reportDraft.title].map(csvCell).join(','),
      ['Organization', reportDraft.organizationName || '-'].map(csvCell).join(','),
      ['Prepared by', reportDraft.preparedBy || '-'].map(csvCell).join(','),
      ['Reviewed by', reportDraft.reviewedBy || '-'].map(csvCell).join(','),
      ['Period', periodLabel].map(csvCell).join(','),
      ['Report date', reportDraft.reportDate].map(csvCell).join(','),
      ['Report status', readinessLabel].map(csvCell).join(','),
      ...(reportDraft.includeOverview ? [['Executive overview', reportDraft.overview].map(csvCell).join(',')] : []),
      ...(reportDraft.includeSummary ? [['Records included', reportRecords.length].map(csvCell).join(',')] : []),
      ...(reportDraft.includeSummary ? [['Key observations / risk analysis', reportDraft.observations].map(csvCell).join(',')] : []),
      ...(reportDraft.includeRecommendations ? [['Recommended remediation', reportDraft.recommendations].map(csvCell).join(',')] : []),
      ...(reportDraft.includeSources ? [[
        'Source files',
        sourceDocuments.map(({ label, doc }) => `${label}: ${doc.fileName} (${doc.recordCount} records)`).join('; ') || 'None recorded',
      ].map(csvCell).join(',')] : []),
    ];
    const detailLines = reportDraft.includeEmployeeDetails
      ? ['', headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))]
      : [];
    return [...reportFields, ...detailLines].join('\r\n');
  };

  const buildReportHtml = (reportDraft: ReportDraft) => {
    const reportRecords = getDraftRecords(reportDraft);
    const reviewByEmployee = new Map<string, string[]>();
    relatedCandidates.forEach((candidate) => {
      const current = reviewByEmployee.get(candidate.employeeRecordId) ?? [];
      current.push(`${candidate.pdfSource}: ${candidate.decision}`);
      reviewByEmployee.set(candidate.employeeRecordId, current);
    });
    const reportCandidates = candidates.filter((candidate) =>
      reportRecords.some((record) => record.id === candidate.employeeRecordId)
    );
    const openCount = reportRecords.filter((record) => record.status !== 'Matched').length;
    const pendingCount = reportCandidates.filter((candidate) => candidate.decision === 'Pending').length;
    const reportStatus = reportDraft.report.subset.length === 0
      ? 'No data'
      : openCount === 0 && pendingCount === 0
      ? 'Ready to Share'
      : reportDraft.readyWithExceptions
      ? 'Ready with exceptions'
      : 'Draft';
    const countFor = (status: string) =>
      reportDraft.report.subset.filter((record) => record.status === status).length;
    const employeeCards = reportDraft.includeEmployeeDetails ? reportRecords.map((record) => {
      const eeDiff = formatDiffINR(record.excelEE, record.epfEE);
      const ipDiff = formatDiffINR(record.excelIP, record.esicIP);
      const reviewText = (reviewByEmployee.get(record.id) ?? []).join('; ') || 'No manual review decision';
      const auditNote = record.flagReason && record.sourceNotes && record.flagReason !== record.sourceNotes
        ? `${record.flagReason} ${record.sourceNotes}`
        : record.flagReason || record.sourceNotes || 'No audit notes';
      const statusClass = record.status === 'Matched'
        ? 'status-matched'
        : record.status === 'Mismatch'
        ? 'status-mismatch'
        : 'status-review';
      return `<article class="employee-card">
        <div class="employee-head"><div><div class="record-label">EMPLOYEE RECORD</div><h3>${escapeHtml(record.name)}</h3><div class="employee-sub">${escapeHtml(record.empCode)} <span>&bull;</span> ${escapeHtml(record.department)} <span>&bull;</span> Attendance ${record.attendanceDays}/${record.workingDays} days</div></div><span class="status ${statusClass}">${escapeHtml(record.status)}</span></div>
        <div class="identifiers"><strong>IDENTIFIERS</strong><div class="identifier-values"><span><small>UAN</small>${escapeHtml(record.uan ?? 'Unmapped')}</span><span><small>ESIC IP</small>${escapeHtml(record.ipNumber ?? 'Unmapped')}</span></div></div>
        <div class="contribution-grid">
          <section class="contribution-block epf"><strong>EPF employee contribution</strong><div class="amount-line"><span>Excel register</span><b>${record.excelEE === null ? 'Blank' : escapeHtml(formatINR(record.excelEE))}</b></div><div class="amount-line"><span>EPF challan</span><b>${record.epfEE === null ? 'Missing' : escapeHtml(formatINR(record.epfEE))}</b></div><div class="amount-line difference"><span>Difference</span><b>${escapeHtml(eeDiff.text)}</b></div></section>
          <section class="contribution-block esic"><strong>ESIC contribution</strong><div class="amount-line"><span>Excel register</span><b>${record.excelIP === null ? 'Blank' : escapeHtml(formatINR(record.excelIP))}</b></div><div class="amount-line"><span>ESIC challan</span><b>${record.esicIP === null ? 'Missing' : escapeHtml(formatINR(record.esicIP))}</b></div><div class="amount-line difference"><span>Difference</span><b>${escapeHtml(ipDiff.text)}</b></div></section>
        </div>
        ${reportDraft.includeReviewDecisions ? `<p class="review-detail"><strong>MANUAL REVIEW</strong><br>${escapeHtml(reviewText)}</p>` : ''}
        <p class="audit-note"><strong>AUDIT NOTES</strong><br>${escapeHtml(auditNote)}</p>
      </article>`;
    }).join('') : '';
    const paragraphize = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>');
    const emptyMessage = reportDraft.report.subset.length === 0 && reportDraft.report.id === 'mismatch-report'
      ? 'No contribution mismatches were identified in this period.'
      : reportDraft.report.subset.length === 0 && reportDraft.report.id === 'unmatched-employee'
      ? 'There are no unmatched employee records to review.'
      : reportDraft.report.subset.length === 0 && reportDraft.report.id === 'blank-ip-report'
      ? 'No blank ESIC IP entries were found.'
      : reportRecords.length === 0
      ? 'No open employee issues were found for this period. Matched employee names are excluded from report details.'
      : 'No employee records are available for this report.';
    const scopeLabel = reportDraft.recordScope === 'open'
      ? 'All open items · matched names omitted'
      : reportDraft.recordScope === 'mismatch'
      ? 'Mismatches · matched names omitted'
      : reportDraft.recordScope === 'needs-review'
      ? 'Needs review · matched names omitted'
      : reportDraft.recordScope === 'blank-ip'
      ? 'Blank IP · matched names omitted'
      : 'Missing records · matched names omitted';

    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(reportDraft.title)}</title>
      <style>
        @page{size:${reportDraft.pageSize} portrait;margin:13mm}*{box-sizing:border-box}body{font:10.5pt Arial,sans-serif;color:#172033;margin:22px;line-height:1.5;background:#f5f3f8}.report-sheet{max-width:980px;margin:0 auto;background:#fff;padding:22px;border:1px solid #d8d2e4}.masthead{background:#172033;color:#fff;padding:20px 22px;margin:-22px -22px 18px;border-bottom:5px solid #9a7af1}.brand{display:flex;align-items:center;gap:9px;color:#e8defe;font-size:9pt;font-weight:bold;letter-spacing:.08em}.brand-mark{display:grid;place-items:center;width:27px;height:27px;background:#9a7af1;color:#fff;border:2px solid #fff;font-weight:bold}.brand small{display:block;margin-top:3px;color:#c7d2e2;font-size:6.5pt;letter-spacing:.12em}.report-kicker{margin-top:17px;color:#c4b5fd;font-size:8pt;font-weight:bold;letter-spacing:.12em}.masthead h1{font-size:23pt;line-height:1.2;margin:5px 0 14px;color:#fff}.meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px;color:#e2e8f0;font-size:9pt}.meta-grid span{display:block;color:#b7c2d3;font-size:7pt;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px}.scope-note{display:inline-block;border:1px solid #c4b5fd;background:#f3efff;color:#5b36a7;border-radius:3px;padding:5px 9px;margin:0 0 10px;font-size:8pt;font-weight:bold}.readiness{border:1px solid #8b6de0;border-left:5px solid #8b6de0;background:#f3efff;padding:9px 12px;margin:0 0 17px;font-weight:bold;color:#41277c}.readiness-warning{border-color:#f59e0b;border-left-color:#f59e0b;background:#fff7e6;color:#713f12}h2{font-size:14pt;margin:20px 0 9px;padding:0 0 6px;border-bottom:2px solid #e8e2f2;color:#24304a}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:10px 0}.summary div{border:1px solid #ddd5eb;border-top:4px solid #9a7af1;border-radius:3px;padding:10px 11px;background:#faf8ff}.summary div:nth-child(2){border-top-color:#10b981;background:#f2fbf7}.summary div:nth-child(3){border-top-color:#f43f5e;background:#fff5f6}.summary div:nth-child(4){border-top-color:#f59e0b;background:#fff9ed}.summary b{display:block;font-size:8pt;color:#64748b;text-transform:uppercase;letter-spacing:.05em}.summary strong{display:block;font-size:16pt;margin-top:3px}.source-item{border-left:4px solid #10b981;background:#f2fbf7;padding:9px 12px;margin:8px 0;font-size:9pt}p{line-height:1.55;margin:9px 0}.section-caption{margin:-3px 0 11px;color:#64748b;font-size:9pt}.employee-card{border:1px solid #d3c9e8;border-left:6px solid #8b6de0;background:#fcfbff;padding:17px 18px;margin:15px 0 18px;break-inside:avoid;page-break-inside:avoid}.employee-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;border-bottom:2px solid #e9e2f5;padding-bottom:12px;margin-bottom:12px}.employee-head h3{font-size:15pt;line-height:1.3;margin:3px 0 4px;overflow-wrap:anywhere}.record-label{font-size:7pt;color:#7b61c8;font-weight:bold;letter-spacing:.12em}.employee-sub{font-size:9pt;color:#596579}.employee-sub span{color:#a78bfa;padding:0 3px}.status{font-size:8pt;font-weight:bold;border:1px solid #cbd5e1;border-radius:3px;padding:5px 8px;white-space:nowrap;background:#fff}.status-matched{background:#e7f7ee;color:#11613c}.status-mismatch{background:#fff0f0;color:#aa2430}.status-review{background:#fff6df;color:#805400}.identifiers{margin:0 0 12px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:3px;background:#f8fafc;font-size:8pt;color:#475569}.identifiers>strong,.review-detail>strong,.audit-note>strong{font-size:7pt;color:#6d58ad;letter-spacing:.08em}.identifier-values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:6px;font-size:9pt;color:#172033;overflow-wrap:anywhere}.identifier-values small{display:block;color:#64748b;font-size:7pt;font-weight:bold;margin-bottom:2px}.contribution-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}.contribution-block{font-size:9pt;padding:11px 12px;background:#f5f1ff;border:1px solid #d9cff0;border-top:3px solid #9a7af1;border-radius:3px}.contribution-block.esic{background:#eefaf6;border-color:#cbe9dd;border-top-color:#10b981}.contribution-block>strong{display:block;margin-bottom:7px;color:#33245c;font-size:9pt}.contribution-block.esic>strong{color:#155c45}.amount-line{display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-top:1px solid rgba(100,116,139,.16);font-size:8.5pt}.amount-line span{color:#64748b}.amount-line b{text-align:right;overflow-wrap:anywhere}.amount-line.difference{font-weight:bold}.review-detail{font-size:9pt;margin:12px 0;padding:10px 12px;background:#fff8e8;border-left:4px solid #f59e0b}.audit-note{font-size:9pt;margin:12px 0 0;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #94a3b8;overflow-wrap:anywhere}.empty-state{border:1px solid #a7d8c3;border-left:5px solid #10b981;background:#effaf4;color:#155c45;padding:16px;margin:10px 0;font-weight:bold;border-radius:3px}@media(max-width:650px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.contribution-grid,.meta-grid{grid-template-columns:1fr}}@media print{body{margin:0;background:#fff}.report-sheet{max-width:none;border:0;padding:0}.masthead{margin:0 0 16px;padding:16px 18px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.summary div,.employee-card,.identifiers,.contribution-block,.review-detail,.audit-note,.readiness,.scope-note,.empty-state,.source-item{print-color-adjust:exact;-webkit-print-color-adjust:exact}.employee-card{margin:13px 0 16px;padding:15px 16px}.employee-card+ .employee-card{break-before:auto}.contribution-block,.identifiers,.review-detail,.audit-note{break-inside:avoid}}
      </style></head><body><main class="report-sheet">
      <header class="masthead"><div class="brand"><span class="brand-mark">A</span><div>AUDITLY<small>PAYROLL CONTRIBUTION AUDIT</small></div></div><div class="report-kicker">${escapeHtml(reportDraft.report.categoryLabel)} REPORT</div><h1>${escapeHtml(reportDraft.title)}</h1><div class="meta-grid"><div><span>Company / client</span>${escapeHtml(reportDraft.organizationName || 'Organization not set')}</div><div><span>Audit period</span>${escapeHtml(periodLabel)}</div><div><span>Report date</span>${escapeHtml(reportDraft.reportDate)}</div><div><span>Prepared / reviewed</span>${escapeHtml([reportDraft.preparedBy, reportDraft.reviewedBy].filter(Boolean).join(' / ') || 'Not specified')}</div></div></header>
      <div class="scope-note">EMPLOYEE DETAIL SCOPE &nbsp; ${escapeHtml(scopeLabel)}</div>
      <div class="readiness ${reportStatus === 'Draft' ? 'readiness-warning' : ''}">Report status: ${escapeHtml(reportStatus)}${openCount || pendingCount ? ` &middot; ${openCount} open employee items &middot; ${pendingCount} pending review suggestions` : ''}</div>
      ${reportDraft.includeOverview ? `<h2>Executive Overview</h2><p>${paragraphize(reportDraft.overview)}</p>` : ''}
      ${reportDraft.includeSummary ? `<h2>Audit-wide Snapshot</h2><div class="summary">
        <div><b>Total records</b><strong>${reportDraft.report.subset.length}</strong></div><div><b>Matched</b><strong>${countFor('Matched')}</strong></div>
        <div><b>Mismatches</b><strong>${countFor('Mismatch')}</strong></div><div><b>Needs review / missing</b><strong>${countFor('Needs Review') + countFor('Blank IP') + countFor('Missing Record')}</strong></div>
      </div><h2>Key Observations &amp; Risk Analysis</h2><p>${paragraphize(reportDraft.observations)}</p>${reportDraft.includeReviewDecisions ? `<p><strong>Manual review decisions:</strong> ${reportCandidates.filter((candidate) => candidate.decision === 'Approved').length} approved &middot; ${reportCandidates.filter((candidate) => candidate.decision === 'Rejected').length} rejected &middot; ${pendingCount} pending</p>` : ''}` : ''}
      ${reportDraft.includeSources ? `<h2>Source Documents</h2>${sourceDocuments.length ? sourceDocuments.map(({ label, doc }) => `<div class="source-item"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(doc.fileName)} &middot; ${doc.recordCount} records &middot; Uploaded ${escapeHtml(doc.uploadedAt)}${doc.isDemoSample ? ' &middot; Demo sample' : ''}</div>`).join('') : '<div class="empty-state">No source files are recorded for this period.</div>'}` : ''}
      ${reportDraft.includeRecommendations ? `<h2>Recommended Remediation</h2><p>${paragraphize(reportDraft.recommendations)}</p>` : ''}
      ${reportDraft.includeEmployeeDetails ? `<h2>Open Employee Issues</h2><p class="section-caption">${reportRecords.length} employee ${reportRecords.length === 1 ? 'record' : 'records'} in this section. Matched employees are omitted.</p>${employeeCards || `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`}` : ''}
      </main></body></html>`;
  };
  // Word's HTML importer does not consistently support CSS grid or flexbox.
  // Use tables and inline formatting here so the editable Word file keeps the
  // same Auditly hierarchy and colors as the report preview.
  const buildWordHtml = (reportDraft: ReportDraft) => {
    const reportRecords = getDraftRecords(reportDraft);
    const reportCandidates = candidates.filter((candidate) =>
      reportRecords.some((record) => record.id === candidate.employeeRecordId)
    );
    const openCount = reportRecords.filter((record) => record.status !== 'Matched').length;
    const pendingCount = reportCandidates.filter((candidate) => candidate.decision === 'Pending').length;
    const reportStatus = reportDraft.report.subset.length === 0
      ? 'No data'
      : openCount === 0 && pendingCount === 0
      ? 'Ready to Share'
      : reportDraft.readyWithExceptions
      ? 'Ready with exceptions'
      : 'Draft';
    const countFor = (status: string) =>
      reportDraft.report.subset.filter((record) => record.status === status).length;
    const paragraphize = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>');
    const scopeLabels: Record<ReportDraft['recordScope'], string> = {
      open: 'All open items - matched names omitted',
      mismatch: 'Mismatches only - matched names omitted',
      'needs-review': 'Needs review - matched names omitted',
      'blank-ip': 'Blank IP - matched names omitted',
      missing: 'Missing records - matched names omitted',
    };
    const labelStyle = 'margin:0 0 3pt;color:#b7c2d3;font-size:7pt;font-weight:bold;letter-spacing:1pt;text-transform:uppercase;';
    const valueStyle = 'margin:0;color:#ffffff;font-size:10pt;line-height:1.3;';
    const metaCell = (label: string, value: string) =>
      '<td width="50%" valign="top" style="padding:5pt 8pt 7pt 0;">' +
      '<p style="' + labelStyle + '">' + label + '</p>' +
      '<p style="' + valueStyle + '">' + escapeHtml(value) + '</p></td>';
    const summaryCell = (label: string, value: number, fill: string, accent: string) =>
      '<td width="25%" valign="middle" bgcolor="' + fill + '" style="padding:10pt 9pt;border:1px solid #ddd5eb;border-top:4px solid ' + accent + ';">' +
      '<p style="margin:0;color:#64748b;font-size:7.5pt;font-weight:bold;text-transform:uppercase;">' + label + '</p>' +
      '<p style="margin:4pt 0 0;color:#172033;font-size:18pt;font-weight:bold;">' + value + '</p></td>';
    const amountRow = (label: string, value: string, emphasized = false) =>
      '<tr><td width="58%" style="padding:5pt 6pt;border-top:1px solid #e5e7eb;color:#64748b;font-size:9pt;">' + label + '</td>' +
      '<td width="42%" align="right" style="padding:5pt 6pt;border-top:1px solid #e5e7eb;color:#172033;font-size:9pt;' + (emphasized ? 'font-weight:bold;' : '') + '">' + value + '</td></tr>';
    const contributionTable = (title: string, excelValue: string, challanLabel: string, challanValue: string, difference: string, tint: string, accent: string) =>
      '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d9cff0;">' +
      '<tr><td bgcolor="' + tint + '" colspan="2" style="padding:8pt 8pt;color:#33245c;font-size:9pt;font-weight:bold;border-top:3px solid ' + accent + ';">' + title + '</td></tr>' +
      amountRow('Excel register', excelValue) +
      amountRow(challanLabel, challanValue) +
      amountRow('Difference', difference, true) +
      '</table>';
    const employeeCards = reportDraft.includeEmployeeDetails ? reportRecords.map((record) => {
      const eeDiff = formatDiffINR(record.excelEE, record.epfEE);
      const ipDiff = formatDiffINR(record.excelIP, record.esicIP);
      const reviewText = reportCandidates
        .filter((candidate) => candidate.employeeRecordId === record.id)
        .map((candidate) => candidate.pdfSource + ': ' + candidate.decision)
        .join('; ') || 'No manual review decision';
      const auditNote = record.flagReason && record.sourceNotes && record.flagReason !== record.sourceNotes
        ? record.flagReason + ' ' + record.sourceNotes
        : record.flagReason || record.sourceNotes || 'No audit notes';
      const statusFill = record.status === 'Mismatch' ? '#fff0f0' : '#fff6df';
      const statusColor = record.status === 'Mismatch' ? '#aa2430' : '#805400';
      const epf = contributionTable(
        'EPF employee contribution',
        record.excelEE === null ? 'Blank' : escapeHtml(formatINR(record.excelEE)),
        'EPF challan',
        record.epfEE === null ? 'Missing' : escapeHtml(formatINR(record.epfEE)),
        escapeHtml(eeDiff.text),
        '#f5f1ff',
        '#9a7af1'
      );
      const esic = contributionTable(
        'ESIC contribution',
        record.excelIP === null ? 'Blank' : escapeHtml(formatINR(record.excelIP)),
        'ESIC challan',
        record.esicIP === null ? 'Missing' : escapeHtml(formatINR(record.esicIP)),
        escapeHtml(ipDiff.text),
        '#eefaf6',
        '#10b981'
      );
      return '<table width="100%" border="1" bordercolor="#d3c9e8" cellspacing="0" cellpadding="0" bgcolor="#fcfbff" style="width:100%;margin:0 0 14pt;border:1px solid #d3c9e8;border-left:6px solid #8b6de0;background-color:#fcfbff;page-break-inside:avoid;">' +
        '<tr><td colspan="2" bgcolor="#f5f1ff" style="padding:12pt 13pt 9pt;border-bottom:1px solid #e9e2f5;">' +
        '<p style="margin:0 0 3pt;color:#7b61c8;font-size:7pt;font-weight:bold;letter-spacing:1pt;">EMPLOYEE RECORD</p>' +
        '<p style="margin:0;color:#172033;font-size:15pt;font-weight:bold;line-height:1.25;">' + escapeHtml(record.name) + '</p>' +
        '<p style="margin:4pt 0 0;color:#596579;font-size:9pt;">' + escapeHtml(record.empCode) + ' &nbsp;|&nbsp; ' + escapeHtml(record.department) + ' &nbsp;|&nbsp; Attendance ' + record.attendanceDays + '/' + record.workingDays + ' days</p>' +
        '</td><td width="23%" align="right" valign="top" bgcolor="#f5f1ff" style="padding:14pt 12pt 9pt;border-bottom:1px solid #e9e2f5;">' +
        '<table border="0" cellspacing="0" cellpadding="0" align="right"><tr><td bgcolor="' + statusFill + '" style="padding:5pt 7pt;border:1px solid ' + statusColor + ';color:' + statusColor + ';font-size:8pt;font-weight:bold;">' + escapeHtml(record.status) + '</td></tr></table></td></tr>' +
        '<tr><td colspan="3" style="padding:10pt 13pt 4pt;">' +
        '<p style="margin:0 0 5pt;color:#6d58ad;font-size:7pt;font-weight:bold;letter-spacing:1pt;">IDENTIFIERS</p>' +
        '<table width="100%" border="1" bordercolor="#e5e7eb" cellspacing="0" cellpadding="0" bgcolor="#f8fafc" style="border-collapse:collapse;background:#f8fafc;border:1px solid #e5e7eb;">' +
        '<tr><td width="50%" valign="top" style="padding:7pt 8pt;"><p style="margin:0 0 2pt;color:#64748b;font-size:7pt;font-weight:bold;">UAN</p><p style="margin:0;color:#172033;font-size:9pt;">' + escapeHtml(record.uan ?? 'Unmapped') + '</p></td>' +
        '<td width="50%" valign="top" style="padding:7pt 8pt;"><p style="margin:0 0 2pt;color:#64748b;font-size:7pt;font-weight:bold;">ESIC IP</p><p style="margin:0;color:#172033;font-size:9pt;">' + escapeHtml(record.ipNumber ?? 'Unmapped') + '</p></td></tr></table></td></tr>' +
        '<tr><td width="50%" valign="top" style="padding:8pt 5pt 5pt 13pt;">' + epf + '</td><td width="50%" valign="top" colspan="2" style="padding:8pt 13pt 5pt 5pt;">' + esic + '</td></tr>' +
        (reportDraft.includeReviewDecisions
          ? '<tr><td colspan="3" style="padding:7pt 13pt 3pt;"><table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td bgcolor="#fff8e8" style="padding:8pt 9pt;border-left:4px solid #f59e0b;"><p style="margin:0 0 3pt;color:#805400;font-size:7pt;font-weight:bold;letter-spacing:1pt;">MANUAL REVIEW</p><p style="margin:0;color:#172033;font-size:9pt;">' + escapeHtml(reviewText) + '</p></td></tr></table></td></tr>'
          : '') +
        '<tr><td colspan="3" style="padding:6pt 13pt 12pt;"><table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td bgcolor="#f8fafc" style="padding:8pt 9pt;border:1px solid #e2e8f0;border-left:4px solid #94a3b8;"><p style="margin:0 0 3pt;color:#6d58ad;font-size:7pt;font-weight:bold;letter-spacing:1pt;">AUDIT NOTES</p><p style="margin:0;color:#334155;font-size:9pt;line-height:1.4;">' + escapeHtml(auditNote) + '</p></td></tr></table></td></tr>' +
        '</table>';
    }).join('') : '';
    const emptyMessage = reportDraft.report.id === 'mismatch-report' && reportDraft.report.subset.length === 0
      ? 'No contribution mismatches were identified in this period.'
      : reportDraft.report.id === 'unmatched-employee' && reportDraft.report.subset.length === 0
      ? 'There are no unmatched employee records to review.'
      : reportDraft.report.id === 'blank-ip-report' && reportDraft.report.subset.length === 0
      ? 'No blank ESIC IP entries were found.'
      : reportRecords.length === 0
      ? 'No open employee issues were found for this period. Matched employee names are excluded from report details.'
      : 'No employee records are available for this report.';
    const sources = reportDraft.includeSources
      ? '<h2 style="margin:18pt 0 7pt;color:#24304a;font-size:14pt;border-bottom:2px solid #e8e2f2;padding-bottom:5pt;">Source Documents</h2>' +
        (sourceDocuments.length
          ? '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">' + sourceDocuments.map(({ label, doc }, index) =>
            '<tr><td bgcolor="' + (index % 2 === 0 ? '#f2fbf7' : '#ffffff') + '" style="padding:7pt 9pt;border:1px solid #d9e9e1;border-left:4px solid #10b981;font-size:9pt;"><b>' + escapeHtml(label) + ':</b> ' + escapeHtml(doc.fileName) + ' &nbsp;|&nbsp; ' + doc.recordCount + ' records &nbsp;|&nbsp; Uploaded ' + escapeHtml(doc.uploadedAt) + (doc.isDemoSample ? ' &nbsp;|&nbsp; Demo sample' : '') + '</td></tr>'
          ).join('') + '</table>'
          : '<p style="margin:8pt 0;color:#64748b;font-size:10pt;">No source files are recorded for this period.</p>')
      : '';
    const pageWidth = reportDraft.pageSize === 'Letter' ? '612pt 792pt' : '595.3pt 841.9pt';

    return '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><meta name="ProgId" content="Word.Document"><title>' + escapeHtml(reportDraft.title) + '</title>' +
      '<style>@page Section1{size:' + pageWidth + ';margin:42pt 42pt 42pt 42pt;mso-header-margin:18pt;mso-footer-margin:18pt;}div.Section1{page:Section1;}body{font-family:Arial,sans-serif;color:#172033;font-size:10pt;line-height:1.35;}table{mso-table-lspace:0pt;mso-table-rspace:0pt;}p{mso-pagination:widow-orphan;}</style></head><body><div class="Section1">' +
      '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">' +
      '<tr><td bgcolor="#172033" style="padding:18pt 18pt 16pt;color:#ffffff;">' +
      '<table border="0" cellspacing="0" cellpadding="0"><tr><td width="33" height="33" align="center" valign="middle" bgcolor="#9a7af1" style="border:2px solid #ffffff;color:#ffffff;font-size:16pt;font-weight:bold;">A</td><td valign="middle" style="padding-left:8pt;color:#ffffff;font-size:11pt;font-weight:bold;letter-spacing:1pt;">AUDITLY<br><span style="color:#c7d2e2;font-size:7pt;letter-spacing:1pt;">PAYROLL CONTRIBUTION AUDIT</span></td></tr></table>' +
      '<p style="margin:17pt 0 4pt;color:#c4b5fd;font-size:8pt;font-weight:bold;letter-spacing:1.4pt;">' + escapeHtml(reportDraft.report.categoryLabel) + ' REPORT</p>' +
      '<p style="margin:0 0 15pt;color:#ffffff;font-size:25pt;font-weight:bold;line-height:1.15;">' + escapeHtml(reportDraft.title) + '</p>' +
      '<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>' +
      metaCell('Company / client', reportDraft.organizationName || 'Organization not set') +
      metaCell('Audit period', periodLabel) +
      '</tr><tr>' +
      metaCell('Report date', reportDraft.reportDate) +
      metaCell('Prepared / reviewed', [reportDraft.preparedBy, reportDraft.reviewedBy].filter(Boolean).join(' / ') || 'Not specified') +
      '</tr></table></td></tr>' +
      '<tr><td height="5" bgcolor="#9a7af1" style="font-size:1pt;line-height:1pt;">&nbsp;</td></tr></table>' +
      '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:12pt;border-collapse:collapse;"><tr><td bgcolor="#f3efff" style="padding:7pt 9pt;border:1px solid #c4b5fd;color:#5b36a7;font-size:8pt;font-weight:bold;">EMPLOYEE DETAIL SCOPE &nbsp; ' + escapeHtml(scopeLabels[reportDraft.recordScope]) + '</td></tr></table>' +
      '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:7pt;border-collapse:collapse;"><tr><td bgcolor="' + (reportStatus === 'Draft' ? '#fff7e6' : '#f3efff') + '" style="padding:9pt 11pt;border:1px solid ' + (reportStatus === 'Draft' ? '#f59e0b' : '#8b6de0') + ';border-left:5px solid ' + (reportStatus === 'Draft' ? '#f59e0b' : '#8b6de0') + ';color:' + (reportStatus === 'Draft' ? '#713f12' : '#41277c') + ';font-size:10pt;font-weight:bold;">Report status: ' + escapeHtml(reportStatus) + (openCount || pendingCount ? ' &nbsp;|&nbsp; ' + openCount + ' open employee items &nbsp;|&nbsp; ' + pendingCount + ' pending review suggestions' : '') + '</td></tr></table>' +
      (reportDraft.includeOverview
        ? '<h2 style="margin:18pt 0 7pt;color:#24304a;font-size:14pt;border-bottom:2px solid #e8e2f2;padding-bottom:5pt;">Executive Overview</h2><p style="margin:0 0 10pt;color:#334155;font-size:10pt;line-height:1.45;">' + paragraphize(reportDraft.overview) + '</p>'
        : '') +
      (reportDraft.includeSummary
        ? '<h2 style="margin:18pt 0 7pt;color:#24304a;font-size:14pt;border-bottom:2px solid #e8e2f2;padding-bottom:5pt;">Audit-wide Snapshot</h2>' +
          '<table width="100%" border="0" cellspacing="5" cellpadding="0" style="border-collapse:separate;"><tr>' +
          summaryCell('Total records', reportDraft.report.subset.length, '#faf8ff', '#9a7af1') +
          summaryCell('Matched', countFor('Matched'), '#f2fbf7', '#10b981') +
          summaryCell('Mismatches', countFor('Mismatch'), '#fff5f6', '#f43f5e') +
          summaryCell('Needs review / missing', countFor('Needs Review') + countFor('Blank IP') + countFor('Missing Record'), '#fff9ed', '#f59e0b') +
          '</tr></table>' +
          '<h2 style="margin:18pt 0 7pt;color:#24304a;font-size:14pt;border-bottom:2px solid #e8e2f2;padding-bottom:5pt;">Key Observations and Risk Analysis</h2><p style="margin:0 0 8pt;color:#334155;font-size:10pt;line-height:1.45;">' + paragraphize(reportDraft.observations) + '</p>' +
          (reportDraft.includeReviewDecisions
            ? '<p style="margin:0 0 10pt;color:#475569;font-size:9pt;"><b>Manual review decisions:</b> ' + reportCandidates.filter((candidate) => candidate.decision === 'Approved').length + ' approved &nbsp;|&nbsp; ' + reportCandidates.filter((candidate) => candidate.decision === 'Rejected').length + ' rejected &nbsp;|&nbsp; ' + pendingCount + ' pending</p>'
            : '')
        : '') +
      sources +
      (reportDraft.includeRecommendations
        ? '<h2 style="margin:18pt 0 7pt;color:#24304a;font-size:14pt;border-bottom:2px solid #e8e2f2;padding-bottom:5pt;">Recommended Remediation</h2><p style="margin:0 0 10pt;color:#334155;font-size:10pt;line-height:1.45;">' + paragraphize(reportDraft.recommendations) + '</p>'
        : '') +
      (reportDraft.includeEmployeeDetails
        ? '<h2 style="margin:18pt 0 4pt;color:#24304a;font-size:14pt;border-bottom:2px solid #e8e2f2;padding-bottom:5pt;">Open Employee Issues</h2><p style="margin:0 0 10pt;color:#64748b;font-size:9pt;">' + reportRecords.length + ' employee ' + (reportRecords.length === 1 ? 'record' : 'records') + ' in this section. Matched employees are omitted.</p>' +
          (employeeCards || '<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td bgcolor="#effaf4" style="padding:12pt;border:1px solid #a7d8c3;border-left:5px solid #10b981;color:#155c45;font-size:10pt;font-weight:bold;">' + escapeHtml(emptyMessage) + '</td></tr></table>')
        : '') +
      '</div></body></html>';
  };

  const markReadyWithExceptions = () => {
    if (!draft || !hasReportData || (!openRecordCount && !pendingReviewCount)) return;
    const message = `This report still has ${openRecordCount} open employee items and ${pendingReviewCount} pending review suggestions. Mark it ready with these exceptions?`;
    if (settings.unresolvedReportPolicy === 'confirm' && !window.confirm(message)) return;
    setDraft({ ...draft, readyWithExceptions: true });
  };

  const downloadCsv = () => {
    if (!draft) return;
    triggerClientFileDownload(`${exportFileBase(draft)}.csv`, buildCsv(draft));
    onReportExported(draft.title, 'CSV');
  };

  const downloadWord = () => {
    if (!draft) return;
    triggerClientFileDownload(
      `${exportFileBase(draft)}.doc`,
      buildWordHtml(draft),
      'application/msword;charset=utf-8'
    );
    onReportExported(draft.title, 'Word');
  };

  const printPdf = () => {
    if (!draft) return;
    const html = buildReportHtml(draft);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      triggerClientFileDownload(`${exportFileBase(draft)}.html`, html, 'text/html;charset=utf-8');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      if (!printWindow.closed) printWindow.print();
    }, 300);
    onReportExported(draft.title, 'PDF');
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-2.5 overflow-hidden">
      {/* Top Info Bar */}
      <div className="shrink-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-3.5 py-2 shadow-[3px_3px_0px_#0E0E10] flex items-center justify-between gap-2">
        <div className="text-[11px] text-[#64748B] truncate">
          Reports use current verification results for <strong className="text-[#0F172A]">{periodLabel}</strong>. Review decisions are included in exports.
        </div>
        <span className="px-2 py-0.5 bg-[#ECE6FD] border border-[#1E293B] rounded-[3px] text-[9.5px] font-mono font-bold text-[#0F172A] whitespace-nowrap shrink-0">
          {records.length} RECORDS · {candidates.filter((candidate) => candidate.decision === 'Pending').length} PENDING REVIEWS
        </span>
      </div>

      {/* 3x2 Report Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden audit-scroll">
        <div className="h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2 gap-2.5 pb-1">
          {reports.map((rep) => {
            const badgeBg =
              rep.accent === 'coral'
                ? 'bg-[#F43F5E]/12 border-[#F43F5E]'
                : rep.accent === 'amber'
                ? 'bg-[#F59E0B]/15 border-[#F59E0B]'
                : rep.accent === 'emerald'
                ? 'bg-[#E6F8F0] border-[#10B981]'
                : 'bg-[#ECE6FD] border-[#9A7AF1]';

            return (
              <article
                key={rep.id}
                className="bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] p-3 shadow-[3px_3px_0px_#0E0E10] flex flex-col justify-between gap-2 min-h-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span
                      className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-[3px] border ${badgeBg} text-[#0F172A] whitespace-nowrap`}
                    >
                      {rep.categoryLabel}
                    </span>
                    {!readOnly && <button
                      type="button"
                      onClick={() => openEditor(rep)}
                      className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#64748B] hover:text-[#0F172A] cursor-pointer whitespace-nowrap"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit report</span>
                    </button>}
                  </div>

                  <h3 className="font-display text-[13.5px] font-bold text-[#0F172A] leading-tight truncate">
                    {rep.title}
                  </h3>
                  <p className="text-[11px] text-[#64748B] mt-1 leading-snug line-clamp-2">
                    {rep.subtitle}
                  </p>
                </div>

                <div className="space-y-2 shrink-0">
                  <div className="px-2.5 py-1.5 bg-[#F7F3F0] border border-[#E2DCD5] rounded-[3px] flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-[#64748B] font-medium whitespace-nowrap">
                      {rep.metricLabel}
                    </span>
                    <span className="font-mono font-bold text-[#0F172A] tabular-nums whitespace-nowrap truncate">
                      {rep.metricValue}
                    </span>
                  </div>

                  {!readOnly ? <button
                    type="button"
                    onClick={() => openEditor(rep)}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#9A7AF1] border-2 border-[#0E0E10] rounded-[4px] text-[11px] font-bold text-[#FFFFFF] shadow-[2px_2px_0px_#0E0E10] hover:bg-[#8965ec] cursor-pointer whitespace-nowrap"
                  >
                    <Pencil className="w-3.5 h-3.5 shrink-0" />
                    <span>Edit &amp; Export</span>
                  </button> : <div className="w-full border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-[#64748B]">Auditor-managed report</div>}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 bg-[#0E0E10]/60 flex items-center justify-center p-3 sm:p-5">
          <div className="w-full max-w-6xl max-h-[94vh] bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] shadow-[6px_6px_0px_#0E0E10] flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-[#F7F3F0] border-b-2 border-[#1E293B] flex items-center justify-between gap-3 shrink-0">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#9A7AF1]">Edit before export · {periodLabel}</div>
                <h3 className="font-display text-base font-bold text-[#0F172A]">Prepare report</h3>
              </div>
              <button type="button" onClick={() => setDraft(null)} aria-label="Close report editor" className="p-1.5 bg-white border-2 border-[#1E293B] rounded-[4px] hover:bg-[#ECE6FD] cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className={`px-4 py-2 border-b-2 border-[#1E293B] flex items-center gap-2 text-xs text-[#0F172A] shrink-0 ${readinessLabel === 'Draft' || readinessLabel === 'No data' ? 'bg-[#FFF7E6]' : 'bg-[#E6F8F0]'}`}>
              <CheckCircle2 className={`w-4 h-4 shrink-0 ${readinessLabel === 'Draft' || readinessLabel === 'No data' ? 'text-[#B45309]' : 'text-[#10B981]'}`} />
              <span><strong>{readinessLabel}</strong> · {draftRecords.length} records · {openRecordCount} open employee items · {pendingReviewCount} pending review suggestions.</span>
            </div>
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)] overflow-hidden">
              <div className="overflow-y-auto audit-scroll p-4 border-b lg:border-b-0 lg:border-r border-[#E2DCD5] space-y-3">
                <label className="block text-xs font-bold text-[#0F172A]">Report title
                  <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1 w-full px-2.5 py-2 text-sm font-semibold bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]" />
                </label>
                <label className="block text-xs font-bold text-[#0F172A]">Company / client
                  <input value={draft.organizationName} onChange={(event) => setDraft({ ...draft, organizationName: event.target.value })} placeholder="Organization name" className="mt-1 w-full px-2.5 py-2 text-sm bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-bold text-[#0F172A]">Prepared by
                    <input value={draft.preparedBy} onChange={(event) => setDraft({ ...draft, preparedBy: event.target.value })} placeholder="Name" className="mt-1 w-full px-2 py-2 text-sm bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]" />
                  </label>
                  <label className="block text-xs font-bold text-[#0F172A]">Reviewed by
                    <input value={draft.reviewedBy} onChange={(event) => setDraft({ ...draft, reviewedBy: event.target.value })} placeholder="Name" className="mt-1 w-full px-2 py-2 text-sm bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]" />
                  </label>
                </div>
                <label className="block text-xs font-bold text-[#0F172A]">Report date
                  <input value={draft.reportDate} onChange={(event) => setDraft({ ...draft, reportDate: event.target.value })} className="mt-1 w-full px-2.5 py-2 text-sm bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]" />
                </label>
                <label className="block text-xs font-bold text-[#0F172A]">Employee scope
                  <select value={draft.recordScope} onChange={(event) => setDraft({ ...draft, recordScope: event.target.value as ReportDraft['recordScope'], readyWithExceptions: false })} className="mt-1 w-full px-2.5 py-2 text-sm bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]"><option value="open">All open items (matched excluded)</option><option value="mismatch">Mismatches only</option><option value="needs-review">Needs review</option><option value="blank-ip">Blank IP</option><option value="missing">Missing records</option></select>
                </label>
                <fieldset className="p-2.5 border border-[#E2DCD5] rounded-[4px] bg-[#FBF9F7]">
                  <legend className="px-1 text-xs font-bold text-[#0F172A]">Include in this report</legend>
                  {([
                    ['includeOverview', 'Executive overview'],
                    ['includeSummary', 'Discrepancy summary'],
                    ['includeEmployeeDetails', 'Employee details'],
                    ['includeReviewDecisions', 'Manual review decisions'],
                    ['includeSources', 'Source files'],
                    ['includeRecommendations', 'Recommendations'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between gap-2 py-1 text-[11px] font-medium text-[#334155] cursor-pointer">
                      <span>{label}</span><input type="checkbox" checked={draft[key]} onChange={() => setDraft({ ...draft, [key]: !draft[key] })} className="w-3.5 h-3.5 accent-[#9A7AF1] cursor-pointer" />
                    </label>
                  ))}
                </fieldset>
                {([
                  ['overview', 'Executive summary', 3],
                  ['observations', 'Key observations / risk analysis', 4],
                  ['recommendations', 'Recommended remediation', 4],
                ] as const).map(([key, label, rows]) => (
                  <label key={key} className="block text-xs font-bold text-[#0F172A]">{label}
                    <textarea rows={rows} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} className="mt-1 w-full resize-y px-2.5 py-2 text-xs leading-relaxed font-normal bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]" />
                  </label>
                ))}
              </div>
              <div className="min-h-0 min-w-0 bg-[#E5E7EB] overflow-hidden">
                <iframe
                  title="Report preview"
                  srcDoc={buildReportHtml(draft)}
                  sandbox=""
                  className="w-full h-full min-h-[360px] border-0"
                />
              </div>
            </div>
            <div className="px-4 py-3 bg-[#F7F3F0] border-t-2 border-[#1E293B] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <button type="button" onClick={() => setDraft(null)} className="px-3 py-1.5 bg-white border-2 border-[#1E293B] rounded-[4px] text-xs font-bold cursor-pointer">Cancel</button>
              <div className="flex flex-wrap items-center gap-2">
                {hasReportData && (openRecordCount > 0 || pendingReviewCount > 0) && !draft.readyWithExceptions && (
                  <button type="button" onClick={markReadyWithExceptions} className="px-3 py-1.5 bg-[#FFF7E6] border-2 border-[#F59E0B] rounded-[4px] text-xs font-bold text-[#713F12] cursor-pointer">Mark ready with exceptions</button>
                )}
                {draft.readyWithExceptions && (
                  <button type="button" onClick={() => setDraft({ ...draft, readyWithExceptions: false })} className="px-3 py-1.5 bg-white border-2 border-[#1E293B] rounded-[4px] text-xs font-bold cursor-pointer">Return to Draft</button>
                )}
                <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border-2 border-[#1E293B] rounded-[4px] text-xs font-bold cursor-pointer hover:bg-[#ECE6FD]"><FileSpreadsheet className="w-3.5 h-3.5 text-[#10B981]" />Download CSV</button>
                <button type="button" onClick={downloadWord} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border-2 border-[#1E293B] rounded-[4px] text-xs font-bold cursor-pointer hover:bg-[#ECE6FD]"><FileText className="w-3.5 h-3.5 text-[#9A7AF1]" />Editable Word</button>
                <button type="button" onClick={printPdf} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#9A7AF1] border-2 border-[#0E0E10] rounded-[4px] text-xs font-bold text-white cursor-pointer shadow-[2px_2px_0px_#0E0E10]"><Printer className="w-3.5 h-3.5" />Print / Save PDF</button>
              </div>
            </div>
          </div>
        </div>
      )}    </div>
  );
};
