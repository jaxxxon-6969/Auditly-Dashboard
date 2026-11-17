import React, { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  UploadCloud,
  CheckCircle2,
  Trash2,
  Play,
  Loader2,
  FileCheck2,
  AlertTriangle,
  Download,
} from 'lucide-react';
import { AuditSettings, UploadedDocState } from '../types/audit';
import {
  removeAuditDocument,
  runServerVerification,
  ServerAuditResponse,
  triggerClientFileDownload,
  uploadAuditDocument,
} from '../services/auditService';

const SALARY_CSV_TEMPLATE = [
  'Emp Code,Employee Name,Department,UAN,IP Number,Attendance Days,Working Days,Gross Wages,PF 12% (EE),ESIC 0.75% (IP)',
  'EMP-1001,Aarav Kulkarni,Operations,100948271104,3119827104,26,26,10000,1200,75',
  'EMP-1002,Priya Nair,Finance,100948271219,3119827219,26,26,12500,1500,94',
].join('\n');

const SAMPLE_CSV_CONTENT = [
  'Emp Code,Employee Name,Department,UAN,IP Number,Attendance Days,Working Days,Gross Wages,PF 12% (EE),ESIC 0.75% (IP)',
  'EMP-2001,Sumit Yadav,Operations,102011918422,,26,26,23292,1800,',
  'EMP-2002,Raj Mali,Operations,101462830368,,25,26,20967,1626,',
  'EMP-2003,Pradip Palekar,Site Staff,,3119827401,22,26,3371,290,25',
  'EMP-2004,Prince Tiwari,Site Staff,,3119827402,26,26,5506,581,41',
  'EMP-2005,Haresh Gore,Accounts,100585702894,,24,26,9000,523,',
].join('\n');

interface UploadDocumentsPageProps {
  periodId: string;
  settings: AuditSettings;
  uploadedDocs: Record<'excel' | 'epf' | 'esic', UploadedDocState | null>;
  onUploadDoc: (
    slot: 'excel' | 'epf' | 'esic',
    doc: UploadedDocState | null
  ) => void;
  onServerSync: (
    result: ServerAuditResponse,
    activityTitle: string,
    activityDetail: string,
    toastMsg: string
  ) => void;
  onStartVerification: (serverResult?: ServerAuditResponse) => void;
}

export const UploadDocumentsPage: React.FC<UploadDocumentsPageProps> = ({
  periodId,
  settings,
  uploadedDocs,
  onUploadDoc,
  onServerSync,
  onStartVerification,
}) => {
  const excelInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const epfInputRef = useRef<HTMLInputElement>(null);
  const esicInputRef = useRef<HTMLInputElement>(null);

  const [registerMode, setRegisterMode] = useState<'excel' | 'csv'>(() =>
    uploadedDocs.excel?.fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'excel'
  );
  const [dragSlot, setDragSlot] = useState<'excel' | 'epf' | 'esic' | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<'excel' | 'epf' | 'esic' | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const handleFileSelection = async (
    slot: 'excel' | 'epf' | 'esic',
    file: File | undefined
  ) => {
    if (!file) return;
    setUploadError(null);
    setParseWarnings([]);

    const lowerName = file.name.toLowerCase();
    if (slot === 'excel') {
      if (!/\.(xlsx|xls|csv)$/i.test(lowerName)) {
        setUploadError(
          'Unsupported format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) employee salary file.'
        );
        return;
      }
      setRegisterMode(lowerName.endsWith('.csv') ? 'csv' : 'excel');
    } else if (!lowerName.endsWith('.pdf')) {
      setUploadError('Unsupported format. Please upload a PDF (.pdf) statutory challan file.');
      return;
    }

    setUploadingSlot(slot);

    try {
      const result = await uploadAuditDocument(slot, file, periodId, settings);
      if (result.warnings && result.warnings.length > 0) {
        setParseWarnings(result.warnings);
      }
      const isCsv = lowerName.endsWith('.csv');
      const label =
        slot === 'excel'
          ? isCsv
            ? 'Salary CSV'
            : 'Attendance Excel'
          : slot === 'epf'
          ? 'EPF ECR PDF'
          : 'ESIC IP PDF';
      const count = result.docState?.recordCount ?? 0;
      onServerSync(
        result,
        `${label} Scanned`,
        `${file.name} · ${count} rows extracted`,
        `${label} scanned (${count} rows) — dashboard updated`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse uploaded file.';
      setUploadError(msg);
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleLoadSampleCsv = () => {
    const sampleFile = new File(
      [SAMPLE_CSV_CONTENT],
      'Employee_Salary_Register_Sample.csv',
      { type: 'text/csv;charset=utf-8' }
    );
    void handleFileSelection('excel', sampleFile);
  };

  const handleDownloadCsvTemplate = () => {
    triggerClientFileDownload(
      'Salary_Register_Template.csv',
      SALARY_CSV_TEMPLATE,
      'text/csv;charset=utf-8;'
    );
  };

  const handleRemoveSlot = async (slot: 'excel' | 'epf' | 'esic') => {
    setUploadError(null);
    setParseWarnings([]);
    const current = uploadedDocs[slot];
    if (current && !current.isDemoSample) {
      try {
        const result = await removeAuditDocument(slot, periodId);
        onServerSync(
          result,
          'Document Removed',
          `Removed ${current.fileName}`,
          `${current.fileName} removed`
        );
        return;
      } catch {
        // fallback to local clear
      }
    }
    onUploadDoc(slot, null);
  };

  const handleLoadSample = (slot: 'excel' | 'epf' | 'esic') => {
    setUploadError(null);
    setParseWarnings([]);
    const samples: Record<'excel' | 'epf' | 'esic', UploadedDocState> = {
      excel: {
        fileName: 'Attendance_Salary_Register_Oct2026_Demo.xlsx',
        periodLabel: 'October 2026',
        fileSizeLabel: '248 KB',
        uploadedAt: 'Just now',
        recordCount: 16,
        status: 'Loaded',
        isDemoSample: true,
      },
      epf: {
        fileName: 'EPF_ECR_Challan_Oct2026_Demo.pdf',
        fileSizeLabel: '412 KB',
        uploadedAt: 'Just now',
        recordCount: 15,
        status: 'Loaded',
        isDemoSample: true,
      },
      esic: {
        fileName: 'ESIC_IP_Contribution_Oct2026_Demo.pdf',
        fileSizeLabel: '318 KB',
        uploadedAt: 'Just now',
        recordCount: 14,
        status: 'Loaded',
        isDemoSample: true,
      },
    };
    onUploadDoc(slot, samples[slot]);
  };

  const handleTriggerVerification = async () => {
    setUploadError(null);
    setIsVerifying(true);
    try {
      const hasRealUpload = Object.values(uploadedDocs).some(
        (d) => d && !d.isDemoSample
      );
      if (hasRealUpload) {
        const result = await runServerVerification(periodId, settings);
        onStartVerification(result);
      } else {
        onStartVerification();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed.';
      setUploadError(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  const canVerify = Boolean(
    uploadedDocs.excel || uploadedDocs.epf || uploadedDocs.esic
  );

  const uploadedIsCsv = Boolean(
    uploadedDocs.excel?.fileName.toLowerCase().endsWith('.csv')
  );

  return (
    <div className="h-full min-h-0 flex flex-col gap-2.5 overflow-hidden">
      {(uploadError || parseWarnings.length > 0) && (
        <div
          className={`shrink-0 px-3 py-1.5 rounded-[4px] border-2 text-[11px] flex items-center gap-2 ${
            uploadError
              ? 'bg-[#F43F5E]/10 border-[#F43F5E] text-[#0F172A]'
              : 'bg-[#F59E0B]/15 border-[#F59E0B] text-[#0F172A]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#0F172A]" />
          <span className="truncate font-medium">
            {uploadError ?? parseWarnings.join(' · ')}
          </span>
        </div>
      )}

      {/* SECTION 1 — ATTENDANCE / SALARY EXCEL OR CSV FILE */}
      <section className="shrink-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] p-3 shadow-[3px_3px_0px_#0E0E10]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[4px] bg-[#ECE6FD] border-2 border-[#1E293B] flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4 text-[#9A7AF1]" />
            </div>
            <div>
              <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#9A7AF1] leading-none">
                Section 1 · Master Payroll Register
              </div>
              <h2 className="font-display text-sm font-bold text-[#0F172A] leading-tight mt-0.5">
                Attendance / Salary Register (Excel or CSV)
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div
              role="tablist"
              aria-label="Payroll file import format"
              className="inline-flex bg-[#F7F3F0] border-2 border-[#1E293B] rounded-[4px] p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={registerMode === 'excel'}
                onClick={() => setRegisterMode('excel')}
                className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-[2px] cursor-pointer transition-colors whitespace-nowrap ${
                  registerMode === 'excel'
                    ? 'bg-[#0E0E10] text-[#FFFFFF]'
                    : 'text-[#0F172A] hover:bg-[#ECE6FD]'
                }`}
              >
                Excel (.xlsx / .xls)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={registerMode === 'csv'}
                onClick={() => setRegisterMode('csv')}
                className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-[2px] cursor-pointer transition-colors whitespace-nowrap ${
                  registerMode === 'csv'
                    ? 'bg-[#9A7AF1] text-[#FFFFFF]'
                    : 'text-[#0F172A] hover:bg-[#ECE6FD]'
                }`}
              >
                CSV (.csv)
              </button>
            </div>
            <button
              type="button"
              onClick={handleDownloadCsvTemplate}
              title="Download standard CSV salary template"
              className="inline-flex items-center gap-1 px-2 py-1 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] text-[10px] font-bold text-[#0F172A] hover:bg-[#ECE6FD] cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3 h-3" />
              <span>CSV Template</span>
            </button>
          </div>
        </div>

        <input
          ref={excelInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            handleFileSelection('excel', e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            handleFileSelection('excel', e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragSlot('excel');
          }}
          onDragLeave={() => setDragSlot(null)}
          onDrop={(e) => {
            e.preventDefault();
            setDragSlot(null);
            handleFileSelection('excel', e.dataTransfer.files?.[0]);
          }}
          className={`border-2 border-dashed rounded-[4px] px-3 py-2.5 transition-colors flex flex-col sm:flex-row items-center justify-between gap-2.5 ${
            dragSlot === 'excel'
              ? 'border-[#9A7AF1] bg-[#ECE6FD]/60'
              : 'border-[#1E293B] bg-[#FDF9F6]'
          }`}
        >
          {uploadingSlot === 'excel' ? (
            <div className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-[#0F172A]">
              <Loader2 className="w-4 h-4 animate-spin text-[#9A7AF1]" />
              <span>
                {registerMode === 'csv'
                  ? 'Parsing CSV salary records & contributions...'
                  : 'Scanning Excel employees & contributions...'}
              </span>
            </div>
          ) : uploadedDocs.excel ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-[4px] bg-[#E6F8F0] border-2 border-[#10B981] flex items-center justify-center shrink-0">
                  <FileCheck2 className="w-4 h-4 text-[#10B981]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#0F172A] truncate">
                      {uploadedDocs.excel.fileName}
                    </span>
                    <span className="px-1.5 py-0.5 bg-[#ECE6FD] border border-[#1E293B] rounded-[3px] text-[9.5px] font-mono font-bold uppercase text-[#0F172A] shrink-0">
                      {uploadedIsCsv ? 'CSV' : 'Excel'}
                    </span>
                    <span className="px-1.5 py-0.5 bg-[#E6F8F0] border border-[#10B981] rounded-[3px] text-[9.5px] font-bold uppercase text-[#0F172A] shrink-0">
                      {uploadedDocs.excel.isDemoSample ? 'Demo' : 'Scanned'}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[#64748B]">
                    {uploadedDocs.excel.fileSizeLabel} · {uploadedDocs.excel.recordCount} employee rows · {uploadedDocs.excel.uploadedAt}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    (registerMode === 'csv' ? csvInputRef : excelInputRef).current?.click()
                  }
                  className="px-2.5 py-1 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] text-[11px] font-bold text-[#0F172A] hover:bg-[#ECE6FD] cursor-pointer whitespace-nowrap"
                >
                  {registerMode === 'csv' ? 'Replace CSV' : 'Replace File'}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveSlot('excel')}
                  aria-label="Remove payroll file"
                  className="p-1 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] text-[#F43F5E] hover:bg-[#F43F5E]/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5">
                <UploadCloud className="w-5 h-5 text-[#9A7AF1] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#0F172A]">
                    {registerMode === 'csv'
                      ? 'Drag & drop Employee Salary CSV file here'
                      : 'Drag & drop Attendance / Salary Excel or CSV file here'}
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    {registerMode === 'csv'
                      ? 'Comma, semicolon, or tab-separated CSV with Names, UAN/IP IDs, and EE/IP shares'
                      : 'Master register with UAN/IP IDs, paid days, and expected EE/IP deductions'}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {registerMode === 'csv' ? (
                  <>
                    <button
                      type="button"
                      onClick={handleLoadSampleCsv}
                      className="px-2.5 py-1 bg-[#F7F3F0] border-2 border-[#1E293B] rounded-[4px] text-[11px] font-semibold text-[#0F172A] hover:bg-[#ECE6FD] cursor-pointer whitespace-nowrap"
                    >
                      Load Sample CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => csvInputRef.current?.click()}
                      className="px-2.5 py-1 bg-[#9A7AF1] border-2 border-[#0E0E10] rounded-[4px] text-[11px] font-bold text-[#FFFFFF] shadow-[2px_2px_0px_#0E0E10] hover:bg-[#8965ec] cursor-pointer whitespace-nowrap"
                    >
                      Import CSV
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleLoadSample('excel')}
                      className="px-2.5 py-1 bg-[#F7F3F0] border-2 border-[#1E293B] rounded-[4px] text-[11px] font-semibold text-[#0F172A] hover:bg-[#ECE6FD] cursor-pointer whitespace-nowrap"
                    >
                      Load Demo Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => csvInputRef.current?.click()}
                      className="px-2.5 py-1 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] text-[11px] font-bold text-[#0F172A] hover:bg-[#ECE6FD] cursor-pointer whitespace-nowrap"
                    >
                      Import CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => excelInputRef.current?.click()}
                      className="px-2.5 py-1 bg-[#9A7AF1] border-2 border-[#0E0E10] rounded-[4px] text-[11px] font-bold text-[#FFFFFF] shadow-[2px_2px_0px_#0E0E10] hover:bg-[#8965ec] cursor-pointer whitespace-nowrap"
                    >
                      Browse Excel
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* SECTION 2 — CONTRIBUTION DOCUMENTS (Two independent panels) */}
      <section className="flex-1 min-h-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] p-3 shadow-[3px_3px_0px_#0E0E10] flex flex-col overflow-hidden">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#9A7AF1] leading-none">
              Section 2 · Statutory Challan PDFs
            </div>
            <h2 className="font-display text-sm font-bold text-[#0F172A] leading-tight mt-0.5">
              Contribution Documents
            </h2>
          </div>
          <span className="text-[11px] text-[#64748B] font-medium">
            Upload EPF ECR and ESIC IP independently — simultaneous upload is not required.
          </span>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto audit-scroll">
          {/* Panel A: EE CONTRIBUTION — EPF ECR */}
          <div className="bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] p-3 flex flex-col gap-2 min-h-0">
            <div className="shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-[4px] bg-[#ECE6FD] border-2 border-[#1E293B] flex items-center justify-center shrink-0">
                    <FileText className="w-3.5 h-3.5 text-[#9A7AF1]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#64748B] leading-none">
                      Document A
                    </div>
                    <h3 className="font-display text-xs font-bold text-[#0F172A] truncate mt-0.5">
                      EE Contribution — EPF ECR
                    </h3>
                  </div>
                </div>
                <span className="px-1.5 py-0.5 bg-[#FFFFFF] border border-[#1E293B] rounded-[3px] text-[9.5px] font-mono font-bold shrink-0">
                  PDF
                </span>
              </div>
              <p className="text-[11px] text-[#64748B] mt-1.5 leading-snug">
                EPF ECR challan PDF with member UANs and Employee (EE) shares.
              </p>
            </div>

            <input
              ref={epfInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                handleFileSelection('epf', e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragSlot('epf');
              }}
              onDragLeave={() => setDragSlot(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragSlot(null);
                handleFileSelection('epf', e.dataTransfer.files?.[0]);
              }}
              className={`flex-1 min-h-[104px] border-2 border-dashed rounded-[4px] p-2.5 flex flex-col items-center justify-center text-center transition-colors ${
                dragSlot === 'epf'
                  ? 'border-[#9A7AF1] bg-[#ECE6FD]/60'
                  : 'border-[#1E293B] bg-[#FFFFFF]'
              }`}
            >
              {uploadingSlot === 'epf' ? (
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#0F172A]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#9A7AF1]" />
                  <span>Parsing EPF ECR PDF...</span>
                </div>
              ) : uploadedDocs.epf ? (
                <div className="w-full space-y-1.5">
                  <div className="flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                    <span className="text-[11.5px] font-bold text-[#0F172A] truncate max-w-[260px]">
                      {uploadedDocs.epf.fileName}
                    </span>
                  </div>
                  <div className="text-[10.5px] font-mono text-[#64748B]">
                    {uploadedDocs.epf.fileSizeLabel} · {uploadedDocs.epf.recordCount} EE lines ·{' '}
                    <span className="text-[#10B981] font-bold">Ready</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => epfInputRef.current?.click()}
                      className="px-2.5 py-1 bg-[#9A7AF1] border-2 border-[#0E0E10] rounded-[4px] text-[11px] font-bold text-[#FFFFFF] shadow-[2px_2px_0px_#0E0E10] hover:bg-[#8965ec] cursor-pointer whitespace-nowrap"
                    >
                      Upload / Replace PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSlot('epf')}
                      className="px-2.5 py-1 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] text-[11px] font-bold text-[#F43F5E] hover:bg-[#F43F5E]/10 cursor-pointer whitespace-nowrap"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <UploadCloud className="w-5 h-5 text-[#9A7AF1] mx-auto" />
                  <div className="text-xs font-bold text-[#0F172A]">
                    Drop EPF ECR PDF here
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoadSample('epf')}
                      className="px-2.5 py-1 bg-[#F7F3F0] border-2 border-[#1E293B] rounded-[4px] text-[11px] font-semibold text-[#0F172A] hover:bg-[#ECE6FD] cursor-pointer whitespace-nowrap"
                    >
                      Load Demo EPF
                    </button>
                    <button
                      type="button"
                      onClick={() => epfInputRef.current?.click()}
                      className="px-2.5 py-1 bg-[#9A7AF1] border-2 border-[#0E0E10] rounded-[4px] text-[11px] font-bold text-[#FFFFFF] shadow-[2px_2px_0px_#0E0E10] hover:bg-[#8965ec] cursor-pointer whitespace-nowrap"
                    >
                      Browse Files
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Panel B: ESIC CONTRIBUTION — IP */}
          <div className="bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] p-3 flex flex-col gap-2 min-h-0">
            <div className="shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-[4px] bg-[#E6F8F0] border-2 border-[#1E293B] flex items-center justify-center shrink-0">
                    <FileText className="w-3.5 h-3.5 text-[#10B981]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#64748B] leading-none">
                      Document B
                    </div>
                    <h3 className="font-display text-xs font-bold text-[#0F172A] truncate mt-0.5">
                      ESIC Contribution — IP
                    </h3>
                  </div>
                </div>
                <span className="px-1.5 py-0.5 bg-[#FFFFFF] border border-[#1E293B] rounded-[3px] text-[9.5px] font-mono font-bold shrink-0">
                  PDF
                </span>
              </div>
              <p className="text-[11px] text-[#64748B] mt-1.5 leading-snug">
                ESIC monthly statement PDF with IP numbers and deducted IP shares.
              </p>
            </div>

            <input
              ref={esicInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                handleFileSelection('esic', e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragSlot('esic');
              }}
              onDragLeave={() => setDragSlot(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragSlot(null);
                handleFileSelection('esic', e.dataTransfer.files?.[0]);
              }}
              className={`flex-1 min-h-[104px] border-2 border-dashed rounded-[4px] p-2.5 flex flex-col items-center justify-center text-center transition-colors ${
                dragSlot === 'esic'
                  ? 'border-[#9A7AF1] bg-[#ECE6FD]/60'
                  : 'border-[#1E293B] bg-[#FFFFFF]'
              }`}
            >
              {uploadingSlot === 'esic' ? (
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#0F172A]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#10B981]" />
                  <span>Parsing ESIC IP PDF...</span>
                </div>
              ) : uploadedDocs.esic ? (
                <div className="w-full space-y-1.5">
                  <div className="flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                    <span className="text-[11.5px] font-bold text-[#0F172A] truncate max-w-[260px]">
                      {uploadedDocs.esic.fileName}
                    </span>
                  </div>
                  <div className="text-[10.5px] font-mono text-[#64748B]">
                    {uploadedDocs.esic.fileSizeLabel} · {uploadedDocs.esic.recordCount} IP lines ·{' '}
                    <span className="text-[#10B981] font-bold">Ready</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => esicInputRef.current?.click()}
                      className="px-2.5 py-1 bg-[#9A7AF1] border-2 border-[#0E0E10] rounded-[4px] text-[11px] font-bold text-[#FFFFFF] shadow-[2px_2px_0px_#0E0E10] hover:bg-[#8965ec] cursor-pointer whitespace-nowrap"
                    >
                      Upload / Replace PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSlot('esic')}
                      className="px-2.5 py-1 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] text-[11px] font-bold text-[#F43F5E] hover:bg-[#F43F5E]/10 cursor-pointer whitespace-nowrap"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <UploadCloud className="w-5 h-5 text-[#9A7AF1] mx-auto" />
                  <div className="text-xs font-bold text-[#0F172A]">
                    Drop ESIC IP PDF here
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoadSample('esic')}
                      className="px-2.5 py-1 bg-[#F7F3F0] border-2 border-[#1E293B] rounded-[4px] text-[11px] font-semibold text-[#0F172A] hover:bg-[#ECE6FD] cursor-pointer whitespace-nowrap"
                    >
                      Load Demo ESIC
                    </button>
                    <button
                      type="button"
                      onClick={() => esicInputRef.current?.click()}
                      className="px-2.5 py-1 bg-[#9A7AF1] border-2 border-[#0E0E10] rounded-[4px] text-[11px] font-bold text-[#FFFFFF] shadow-[2px_2px_0px_#0E0E10] hover:bg-[#8965ec] cursor-pointer whitespace-nowrap"
                    >
                      Browse Files
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Action Bar */}
      <div className="shrink-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] px-3.5 py-2 shadow-[3px_3px_0px_#0E0E10] flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-[#0F172A] uppercase tracking-wider text-[10.5px]">
            Document Status:
          </span>
          <span
            className={`px-2 py-0.5 rounded-[3px] border text-[10.5px] font-semibold ${
              uploadedDocs.excel
                ? 'bg-[#E6F8F0] border-[#10B981] text-[#0F172A]'
                : 'bg-[#F7F3F0] border-[#E2DCD5] text-[#64748B]'
            }`}
          >
            {uploadedIsCsv ? 'CSV' : 'Excel / CSV'}:{' '}
            {uploadedDocs.excel ? `Loaded (${uploadedDocs.excel.recordCount})` : 'Optional'}
          </span>
          <span
            className={`px-2 py-0.5 rounded-[3px] border text-[10.5px] font-semibold ${
              uploadedDocs.epf
                ? 'bg-[#E6F8F0] border-[#10B981] text-[#0F172A]'
                : 'bg-[#F7F3F0] border-[#E2DCD5] text-[#64748B]'
            }`}
          >
            EPF ECR: {uploadedDocs.epf ? `Loaded (${uploadedDocs.epf.recordCount})` : 'Not Loaded'}
          </span>
          <span
            className={`px-2 py-0.5 rounded-[3px] border text-[10.5px] font-semibold ${
              uploadedDocs.esic
                ? 'bg-[#E6F8F0] border-[#10B981] text-[#0F172A]'
                : 'bg-[#F7F3F0] border-[#E2DCD5] text-[#64748B]'
            }`}
          >
            ESIC IP: {uploadedDocs.esic ? `Loaded (${uploadedDocs.esic.recordCount})` : 'Not Loaded'}
          </span>
        </div>

        <button
          type="button"
          disabled={!canVerify || isVerifying || uploadingSlot !== null}
          onClick={handleTriggerVerification}
          className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#9A7AF1] border-2 border-[#0E0E10] rounded-[4px] text-xs font-bold uppercase tracking-wider text-[#FFFFFF] shadow-[3px_3px_0px_#0E0E10] hover:bg-[#8965ec] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          {isVerifying ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Verifying Records...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Verification</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
