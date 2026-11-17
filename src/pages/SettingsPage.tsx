import React, { useEffect, useState } from 'react';
import { Sliders, Shield, Monitor, Info, RotateCcw, Check, Building2, FileText, ListChecks } from 'lucide-react';
import { AuditSettings } from '../types/audit';

interface SettingsPageProps {
  settings: AuditSettings;
  onUpdateSettings: (next: AuditSettings, notifyMessage?: string) => void;
  onResetDefaults: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onUpdateSettings,
  onResetDefaults,
}) => {
  const [activeSection, setActiveSection] = useState<'audit' | 'organization' | 'reports' | 'workflow'>('audit');
  const [thresholdDraft, setThresholdDraft] = useState<string>(
    String(settings.differenceThreshold)
  );

  useEffect(() => {
    setThresholdDraft(String(settings.differenceThreshold));
  }, [settings.differenceThreshold]);

  const applyThresholdDraft = () => {
    const cleaned = thresholdDraft.trim();
    const parsed = cleaned === '' ? 0 : Math.max(0, Math.min(100000, Math.round(Number(cleaned))));
    const safeVal = Number.isFinite(parsed) ? parsed : 0;
    setThresholdDraft(String(safeVal));
    onUpdateSettings(
      { ...settings, differenceThreshold: safeVal },
      `Threshold limit set to ₹${safeVal.toLocaleString('en-IN')} — statuses recalculated`
    );
  };

  const toggleField = (
    key: 'strictUanMatching' | 'flagBlankIpAsReview' | 'compactTableRows' | 'showDemoBanner'
  ) => {
    onUpdateSettings({
      ...settings,
      [key]: !settings[key],
    });
  };

  const updateSetting = <K extends keyof AuditSettings>(key: K, value: AuditSettings[K]) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 overflow-hidden">
      <nav className="shrink-0 flex flex-wrap gap-1.5" aria-label="Settings sections">
        {([
          ['audit', 'Audit rules', Sliders],
          ['organization', 'Organization', Building2],
          ['reports', 'Reports', FileText],
          ['workflow', 'Workflow', ListChecks],
        ] as const).map(([section, label, Icon]) => (
          <button
            key={section}
            type="button"
            onClick={() => setActiveSection(section)}
            aria-pressed={activeSection === section}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border-2 rounded-[4px] text-[11px] font-bold cursor-pointer transition-colors ${
              activeSection === section
                ? 'bg-[#9A7AF1] border-[#0E0E10] text-white shadow-[2px_2px_0px_#0E0E10]'
                : 'bg-white border-[#1E293B] text-[#334155] hover:bg-[#ECE6FD]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden audit-scroll pr-1 lg:pr-0">
        {activeSection === 'audit' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-2.5 h-full min-h-0 pb-1">
          {/* 1. Difference Threshold Configuration */}
          <section className="min-h-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] p-3 shadow-[4px_4px_0px_#0E0E10] space-y-2">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#E2DCD5]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[4px] bg-[#ECE6FD] border-2 border-[#1E293B] flex items-center justify-center">
                  <Sliders className="w-4 h-4 text-[#9A7AF1]" />
                </div>
                <div>
                  <h2 className="font-display text-sm font-bold text-[#0F172A]">
                    Difference Threshold Configuration
                  </h2>
                  <p className="text-[11px] text-[#64748B]">
                    Control rupee variance tolerance before flagging mismatches
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-[#ECE6FD] border border-[#1E293B] rounded-[3px] font-mono text-[11px] font-bold">
                Active: ₹{settings.differenceThreshold.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="threshold-input"
                className="block text-xs font-bold text-[#0F172A]"
              >
                Tolerance Amount (INR)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-xs text-[#64748B]">
                    ₹
                  </span>
                  <input
                    id="threshold-input"
                    type="text"
                    inputMode="numeric"
                    value={thresholdDraft}
                    onChange={(e) => {
                      const next = e.target.value.replace(/[^\d]/g, '');
                      setThresholdDraft(next);
                    }}
                    onBlur={() => {
                      const cleaned = thresholdDraft.trim();
                      const parsed = cleaned === '' ? 0 : Math.max(0, Math.min(100000, Math.round(Number(cleaned))));
                      const safeVal = Number.isFinite(parsed) ? parsed : 0;
                      if (safeVal !== settings.differenceThreshold || cleaned === '') {
                        applyThresholdDraft();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyThresholdDraft();
                      }
                    }}
                    className="w-full pl-7 pr-2.5 py-1.5 font-mono text-sm font-bold bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] text-[#0F172A] focus:outline-none focus:border-[#9A7AF1]"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyThresholdDraft}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 border-2 border-[#0E0E10] rounded-[4px] text-xs font-bold text-[#FFFFFF] shadow-[2px_2px_0px_#0E0E10] cursor-pointer transition-colors ${
                    thresholdDraft !== String(settings.differenceThreshold)
                      ? 'bg-[#10B981] hover:bg-[#059669]'
                      : 'bg-[#9A7AF1] hover:bg-[#8965ec]'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {thresholdDraft !== String(settings.differenceThreshold) ? 'Apply Change' : 'Apply'}
                  </span>
                </button>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[0, 50, 100, 250, 500].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setThresholdDraft(String(preset));
                        onUpdateSettings(
                          { ...settings, differenceThreshold: preset },
                          `Threshold limit set to ₹${preset} — statuses recalculated`
                        );
                      }}
                      className={`px-2 py-1 text-[11px] font-mono font-bold rounded-[3px] border-2 cursor-pointer ${
                        settings.differenceThreshold === preset
                          ? 'bg-[#9A7AF1] border-[#0E0E10] text-[#FFFFFF]'
                          : 'bg-[#F7F3F0] border-[#1E293B] text-[#0F172A] hover:bg-[#ECE6FD]'
                      }`}
                    >
                      ₹{preset}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-[#64748B]">
                Variances up to <strong>₹{settings.differenceThreshold.toLocaleString('en-IN')}</strong> pass as Matched; differences exceeding this limit are flagged as Mismatch.
              </p>
            </div>
          </section>

          {/* 2. Matching Preferences */}
          <section className="min-h-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] p-3 shadow-[4px_4px_0px_#0E0E10] space-y-2">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#E2DCD5]">
              <div className="w-8 h-8 rounded-[4px] bg-[#F59E0B]/15 border-2 border-[#F59E0B] flex items-center justify-center">
                <Shield className="w-4 h-4 text-[#F59E0B]" />
              </div>
              <div>
                <h2 className="font-display text-sm font-bold text-[#0F172A]">
                  Matching Preferences
                </h2>
                <p className="text-[11px] text-[#64748B]">
                  Configure UAN/IP identity linking & blank cell rules
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-[#0F172A]">
                    Fuzzy Name Confidence Cutoff
                  </span>
                  <span className="font-mono font-bold text-[#9A7AF1] tabular-nums">
                    {settings.fuzzyNameThreshold}%
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={95}
                  step={1}
                  value={settings.fuzzyNameThreshold}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      fuzzyNameThreshold: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[#9A7AF1] cursor-pointer"
                />
              </div>

              <label className="flex items-center justify-between gap-3 p-2 bg-[#FDF9F6] border border-[#E2DCD5] rounded-[4px] cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-[#0F172A]">
                    Strict UAN / IP Identifier Matching
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    Route unmapped UAN/IP records to Manual Review
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.strictUanMatching}
                  onChange={() => toggleField('strictUanMatching')}
                  className="w-4 h-4 accent-[#9A7AF1] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between gap-3 p-2 bg-[#FDF9F6] border border-[#E2DCD5] rounded-[4px] cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-[#0F172A]">
                    Flag Blank IP Cells Separately
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    Never display or coerce blank ESIC IP entries as ₹0
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.flagBlankIpAsReview}
                  onChange={() => toggleField('flagBlankIpAsReview')}
                  className="w-4 h-4 accent-[#9A7AF1] cursor-pointer"
                />
              </label>
            </div>
          </section>

          {/* 3. Display Preferences */}
          <section className="min-h-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] p-3 shadow-[4px_4px_0px_#0E0E10] space-y-2">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#E2DCD5]">
              <div className="w-8 h-8 rounded-[4px] bg-[#E6F8F0] border-2 border-[#10B981] flex items-center justify-center">
                <Monitor className="w-4 h-4 text-[#10B981]" />
              </div>
              <div>
                <h2 className="font-display text-sm font-bold text-[#0F172A]">
                  Display Preferences
                </h2>
                <p className="text-[11px] text-[#64748B]">
                  Adjust table density and demonstration indicators
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center justify-between gap-3 p-2 bg-[#FDF9F6] border border-[#E2DCD5] rounded-[4px] cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-[#0F172A]">
                    Compact Audit Table Rows
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    Increases visible records inside fixed-viewport tables
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.compactTableRows}
                  onChange={() => toggleField('compactTableRows')}
                  className="w-4 h-4 accent-[#9A7AF1] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between gap-3 p-2 bg-[#FDF9F6] border border-[#E2DCD5] rounded-[4px] cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-[#0F172A]">
                    Display Demo Data Tag on Dashboard
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    Highlights fictional sample figures clearly across screens
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showDemoBanner}
                  onChange={() => toggleField('showDemoBanner')}
                  className="w-4 h-4 accent-[#9A7AF1] cursor-pointer"
                />
              </label>

              <div className="flex items-center justify-between p-2 bg-[#F7F3F0] border border-[#E2DCD5] rounded-[4px] text-xs">
                <span className="font-bold text-[#0F172A]">Reporting Currency</span>
                <span className="font-mono font-bold text-[#0F172A]">INR (₹)</span>
              </div>
            </div>
          </section>

          {/* 4. Application Information */}
          <section className="min-h-0 bg-[#FFFFFF] border-2 border-[#1E293B] rounded-[4px] p-3 shadow-[4px_4px_0px_#0E0E10] flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center gap-2.5 pb-2 border-b border-[#E2DCD5]">
                <div className="w-8 h-8 rounded-[4px] bg-[#0E0E10] border-2 border-[#1E293B] flex items-center justify-center">
                  <Info className="w-4 h-4 text-[#9A7AF1]" />
                </div>
                <div>
                  <h2 className="font-display text-sm font-bold text-[#0F172A]">
                    Application Information
                  </h2>
                  <p className="text-[11px] text-[#64748B]">
                    Live reconciliation engine & supported statutory formats
                  </p>
                </div>
              </div>

              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-[#E2DCD5]">
                  <span className="text-[#64748B]">Application</span>
                  <span className="font-bold text-[#0F172A]">AUDITLY</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E2DCD5]">
                  <span className="text-[#64748B]">Edition</span>
                  <span className="font-semibold text-[#0F172A]">
                    Full-Stack Reconciliation Suite
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E2DCD5]">
                  <span className="text-[#64748B]">Audit Engine</span>
                  <span className="font-mono font-semibold text-[#0F172A]">
                    Node Express + XLSX / PDF.js
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#64748B]">Audited Inputs</span>
                  <span className="font-semibold text-[#0F172A]">
                    Excel · EPF ECR PDF · ESIC IP PDF
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={onResetDefaults}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#F7F3F0] border-2 border-[#1E293B] rounded-[4px] text-xs font-bold text-[#0F172A] hover:bg-[#ECE6FD] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Default Settings (₹100)</span>
              </button>
            </div>
          </section>
        </div>
        )}

        {activeSection === 'organization' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 h-full min-h-0 pb-1">
            <section className="bg-white border-2 border-[#1E293B] rounded-[4px] p-4 shadow-[4px_4px_0px_#0E0E10] space-y-3">
              <div className="flex items-center gap-2.5 pb-2 border-b border-[#E2DCD5]">
                <div className="w-8 h-8 rounded-[4px] bg-[#ECE6FD] border-2 border-[#1E293B] flex items-center justify-center"><Building2 className="w-4 h-4 text-[#9A7AF1]" /></div>
                <div><h2 className="font-display text-sm font-bold text-[#0F172A]">Organization Profile</h2><p className="text-[11px] text-[#64748B]">Saved details appear in future report drafts.</p></div>
              </div>
              <label className="block text-xs font-bold text-[#0F172A]">Company / client name
                <input value={settings.organizationName} onChange={(event) => updateSetting('organizationName', event.target.value)} placeholder="Enter organization name" className="mt-1 w-full px-2.5 py-2 text-sm bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]" />
              </label>
              <label className="block text-xs font-bold text-[#0F172A]">Prepared by
                <input value={settings.reportPreparedBy} onChange={(event) => updateSetting('reportPreparedBy', event.target.value)} placeholder="Auditor or payroll preparer" className="mt-1 w-full px-2.5 py-2 text-sm bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]" />
              </label>
              <label className="block text-xs font-bold text-[#0F172A]">Reviewed by
                <input value={settings.reportReviewedBy} onChange={(event) => updateSetting('reportReviewedBy', event.target.value)} placeholder="Reviewer name" className="mt-1 w-full px-2.5 py-2 text-sm bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]" />
              </label>
            </section>
            <section className="bg-[#F7F3F0] border-2 border-[#1E293B] rounded-[4px] p-4 shadow-[4px_4px_0px_#0E0E10]">
              <h3 className="text-sm font-bold text-[#0F172A]">Report identity preview</h3>
              <p className="mt-1 text-xs text-[#64748B]">These details are saved in this browser and prefilled when you prepare a report.</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="border-b border-[#E2DCD5] pb-2"><span className="text-[#64748B]">Organization</span><div className="font-bold text-[#0F172A]">{settings.organizationName || 'Not set'}</div></div>
                <div className="border-b border-[#E2DCD5] pb-2"><span className="text-[#64748B]">Prepared by</span><div className="font-bold text-[#0F172A]">{settings.reportPreparedBy || 'Not set'}</div></div>
                <div><span className="text-[#64748B]">Reviewed by</span><div className="font-bold text-[#0F172A]">{settings.reportReviewedBy || 'Not set'}</div></div>
              </div>
            </section>
          </div>
        )}

        {activeSection === 'reports' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 h-full min-h-0 pb-1">
            <section className="bg-white border-2 border-[#1E293B] rounded-[4px] p-4 shadow-[4px_4px_0px_#0E0E10] space-y-3">
              <div className="flex items-center gap-2.5 pb-2 border-b border-[#E2DCD5]"><div className="w-8 h-8 rounded-[4px] bg-[#E6F8F0] border-2 border-[#10B981] flex items-center justify-center"><FileText className="w-4 h-4 text-[#10B981]" /></div><div><h2 className="font-display text-sm font-bold text-[#0F172A]">Export Defaults</h2><p className="text-[11px] text-[#64748B]">Choose how report files are laid out and named.</p></div></div>
              <label className="block text-xs font-bold text-[#0F172A]">Page size
                <select value={settings.reportPageSize} onChange={(event) => updateSetting('reportPageSize', event.target.value as AuditSettings['reportPageSize'])} className="mt-1 w-full px-2.5 py-2 text-sm bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]"><option value="A4">A4</option><option value="Letter">Letter</option></select>
              </label>
              <label className="block text-xs font-bold text-[#0F172A]">Downloaded file name
                <select value={settings.reportFileNameOrder} onChange={(event) => updateSetting('reportFileNameOrder', event.target.value as AuditSettings['reportFileNameOrder'])} className="mt-1 w-full px-2.5 py-2 text-sm bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]"><option value="report-period">Report name — payroll period</option><option value="period-report">Payroll period — report name</option></select>
              </label>
            </section>
            <section className="bg-white border-2 border-[#1E293B] rounded-[4px] p-4 shadow-[4px_4px_0px_#0E0E10] overflow-y-auto audit-scroll">
              <h2 className="font-display text-sm font-bold text-[#0F172A]">Included by default</h2>
              <p className="text-[11px] text-[#64748B] mb-3">You can change these choices for an individual report before exporting.</p>
              {([
                ['reportIncludeOverview', 'Executive overview'],
                ['reportIncludeSummary', 'Discrepancy summary'],
                ['reportIncludeEmployeeDetails', 'Employee reconciliation details'],
                ['reportIncludeReviewDecisions', 'Manual review decisions'],
                ['reportIncludeSources', 'Uploaded source files'],
                ['reportIncludeRecommendations', 'Recommendations'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-3 py-2 border-b border-[#E2DCD5] text-xs font-semibold text-[#0F172A] cursor-pointer">
                  <span>{label}</span><input type="checkbox" checked={settings[key]} onChange={() => updateSetting(key, !settings[key])} className="w-4 h-4 accent-[#9A7AF1] cursor-pointer" />
                </label>
              ))}
            </section>
          </div>
        )}

        {activeSection === 'workflow' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 h-full min-h-0 pb-1">
            <section className="bg-white border-2 border-[#1E293B] rounded-[4px] p-4 shadow-[4px_4px_0px_#0E0E10] space-y-3">
              <div className="flex items-center gap-2.5 pb-2 border-b border-[#E2DCD5]"><div className="w-8 h-8 rounded-[4px] bg-[#F59E0B]/15 border-2 border-[#F59E0B] flex items-center justify-center"><ListChecks className="w-4 h-4 text-[#F59E0B]" /></div><div><h2 className="font-display text-sm font-bold text-[#0F172A]">Report Readiness</h2><p className="text-[11px] text-[#64748B]">Choose how to handle open verification items.</p></div></div>
              <label className="block text-xs font-bold text-[#0F172A]">When a report has unresolved items
                <select value={settings.unresolvedReportPolicy} onChange={(event) => updateSetting('unresolvedReportPolicy', event.target.value as AuditSettings['unresolvedReportPolicy'])} className="mt-1 w-full px-2.5 py-2 text-sm bg-[#FDF9F6] border-2 border-[#1E293B] rounded-[4px] focus:outline-none focus:border-[#9A7AF1]"><option value="warn">Show a warning; allow marking ready</option><option value="confirm">Ask for confirmation before marking ready</option></select>
              </label>
              <div className="p-3 bg-[#FFF7E6] border border-[#F59E0B] rounded-[4px] text-xs text-[#713F12]">Reports with open mismatches, blank IP values, missing records, or pending review suggestions remain marked Draft until you explicitly mark them ready.</div>
            </section>
            <section className="bg-[#F7F3F0] border-2 border-[#1E293B] rounded-[4px] p-4 shadow-[4px_4px_0px_#0E0E10]"><h3 className="text-sm font-bold text-[#0F172A]">How the label works</h3><ul className="mt-3 space-y-2 text-xs text-[#475569]"><li><strong>Draft:</strong> verification items remain open.</li><li><strong>Ready to Share:</strong> no open items remain.</li><li><strong>Ready with exceptions:</strong> you explicitly acknowledge the open items.</li></ul></section>
          </div>
        )}
      </div>
    </div>
  );
};
