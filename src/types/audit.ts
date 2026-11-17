export type NavRoute =
  | 'dashboard'
  | 'upload'
  | 'employees'
  | 'verification'
  | 'manual-review'
  | 'reports'
  | 'settings';

export type VerificationStatus =
  | 'Matched'
  | 'Mismatch'
  | 'Needs Review'
  | 'Missing Record'
  | 'Blank IP';

export type ManualReviewDecision = 'Pending' | 'Approved' | 'Rejected';

export interface AuditPeriod {
  id: string;
  label: string;
  monthLabel: string;
  isDemo: boolean;
}

export interface EmployeeAuditRecord {
  id: string;
  empCode: string;
  name: string;
  department: string;
  contractorName?: string | null;
  uan: string | null;
  ipNumber: string | null;
  attendanceDays: number;
  workingDays: number;
  grossWages: number;
  excelEE: number | null;
  epfEE: number | null;
  excelIP: number | null;
  esicIP: number | null;
  esicReason?: string | null;
  status: VerificationStatus;
  flagReason: string;
  sourceNotes: string;
  matchConfidence: number;
}

export interface ManualMatchCandidate {
  id: string;
  employeeRecordId: string;
  excelName: string;
  empCode: string;
  excelUan: string | null;
  excelIp: string | null;
  suggestedPdfName: string;
  pdfSource: 'EPF ECR PDF' | 'ESIC IP PDF';
  pdfUanOrIp: string;
  confidence: number;
  reason: string;
  decision: ManualReviewDecision;
  excelAmount: number | null;
  pdfAmount: number | null;
}

export interface AuditActivityEvent {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  category: 'upload' | 'verification' | 'review' | 'report';
}

export interface UploadedDocState {
  fileName: string;
  periodLabel?: string;
  fileSizeLabel: string;
  uploadedAt: string;
  recordCount: number;
  status: 'Loaded' | 'Pending';
  isDemoSample: boolean;
}

export interface AuditSettings {
  differenceThreshold: number;
  fuzzyNameThreshold: number;
  strictUanMatching: boolean;
  flagBlankIpAsReview: boolean;
  compactTableRows: boolean;
  showDemoBanner: boolean;
  currencyCode: 'INR';
  organizationName: string;
  reportPreparedBy: string;
  reportReviewedBy: string;
  reportPageSize: 'A4' | 'Letter';
  reportFileNameOrder: 'report-period' | 'period-report';
  reportIncludeOverview: boolean;
  reportIncludeSummary: boolean;
  reportIncludeEmployeeDetails: boolean;
  reportIncludeReviewDecisions: boolean;
  reportIncludeSources: boolean;
  reportIncludeRecommendations: boolean;
  unresolvedReportPolicy: 'warn' | 'confirm';
}
