import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { AccessGate } from './components/AccessGate';
import {
  AuditActivityEvent,
  AuditSettings,
  EmployeeAuditRecord,
  ManualMatchCandidate,
  ManualReviewDecision,
  NavRoute,
  UploadedDocState,
  VerificationStatus,
} from './types/audit';
import {
  DEMO_EMPLOYEES_BY_PERIOD,
  INITIAL_MANUAL_REVIEW_QUEUE,
  INITIAL_UPLOADED_DOCS,
} from './data/demoAuditData';
import {
  recomputeAuditRecords,
  resetServerWorkspace,
  runServerVerification,
  ServerAuditResponse,
} from './services/auditService';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { DashboardPage } from './pages/DashboardPage';
import { UploadDocumentsPage } from './pages/UploadDocumentsPage';
import { EmployeeRecordsPage } from './pages/EmployeeRecordsPage';
import { ContributionVerificationPage } from './pages/ContributionVerificationPage';
import { ManualReviewPage } from './pages/ManualReviewPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import {
  AuditlyIdentity,
  ClientWorkspaceSummary,
  clearAuditlySignIn,
  getAuditlyIdentity,
  loadRemoteWorkspace,
  runtimeConfig,
  saveRemoteWorkspace,
  selectClientWorkspace,
} from './services/authService';

const DEFAULT_SETTINGS: AuditSettings = {
  differenceThreshold: 0,
  fuzzyNameThreshold: 75,
  strictUanMatching: true,
  flagBlankIpAsReview: true,
  compactTableRows: false,
  showDemoBanner: false,
  currencyCode: 'INR',
  organizationName: '',
  reportPreparedBy: '',
  reportReviewedBy: '',
  reportPageSize: 'A4',
  reportFileNameOrder: 'report-period',
  reportIncludeOverview: true,
  reportIncludeSummary: true,
  reportIncludeEmployeeDetails: true,
  reportIncludeReviewDecisions: true,
  reportIncludeSources: true,
  reportIncludeRecommendations: true,
  unresolvedReportPolicy: 'confirm',
};

const AUDIT_STATE_STORAGE_KEY = 'challan-audit-pro:latest-workspace:v1';

interface PersistedAuditState {
  version: 1;
  selectedPeriodId: string;
  recordsByPeriod: Record<string, EmployeeAuditRecord[]>;
  isRealDataByPeriod: Record<string, boolean>;
  uploadedDocsByPeriod: Record<
    string,
    Record<'excel' | 'epf' | 'esic', UploadedDocState | null>
  >;
  manualCandidates: ManualMatchCandidate[];
  activities: AuditActivityEvent[];
  settings: AuditSettings;
}

function periodFromFileName(fileName?: string): string | null {
  if (!fileName) return null;
  const months = [
    ['January', 'Jan'], ['February', 'Feb'], ['March', 'Mar'], ['April', 'Apr'],
    ['May', 'May'], ['June', 'Jun'], ['July', 'Jul'], ['August', 'Aug'],
    ['September', 'Sep'], ['October', 'Oct'], ['November', 'Nov'], ['December', 'Dec'],
  ];
  for (let index = 0; index < months.length; index += 1) {
    const [full, short] = months[index];
    if (new RegExp(`(?:${full}|${short})[\\s._-]*(20\\d{2})`, 'i').test(fileName)) {
      const year = fileName.match(new RegExp(`(?:${full}|${short})[\\s._-]*(20\\d{2})`, 'i'))?.[1];
      if (year) return `${full} ${year}`;
    }
  }
  const numeric = fileName.match(/(?:^|\D)(0?[1-9]|1[0-2])[-_.](20\d{2})(?:\D|$)/);
  if (numeric) return `${months[Number(numeric[1]) - 1][0]} ${numeric[2]}`;
  return null;
}

function readPersistedAuditState(): PersistedAuditState | null {
  if (typeof window === 'undefined') return null;

  try {
    const saved = window.localStorage.getItem(AUDIT_STATE_STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved) as PersistedAuditState;
    if (
      parsed.version !== 1 ||
      typeof parsed.selectedPeriodId !== 'string' ||
      !parsed.recordsByPeriod ||
      !parsed.uploadedDocsByPeriod ||
      !parsed.settings
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const [savedInitialState] = useState(readPersistedAuditState);
  const [identity, setIdentity] = useState<AuditlyIdentity | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeClient, setActiveClient] = useState<ClientWorkspaceSummary | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(!runtimeConfig.authEnabled);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceLoadSeq, setWorkspaceLoadSeq] = useState(0);
  const [activeRoute, setActiveRoute] = useState<NavRoute>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(
    () => savedInitialState?.selectedPeriodId ?? 'oct-2026'
  );
  const [globalSearch, setGlobalSearch] = useState('');

  const [recordsByPeriod, setRecordsByPeriod] = useState<
    Record<string, EmployeeAuditRecord[]>
  >(() => savedInitialState?.recordsByPeriod ?? {});
  const [isRealDataByPeriod, setIsRealDataByPeriod] = useState<
    Record<string, boolean>
  >(() => savedInitialState?.isRealDataByPeriod ?? {});
  const [uploadedDocsByPeriod, setUploadedDocsByPeriod] = useState<
    Record<string, Record<'excel' | 'epf' | 'esic', UploadedDocState | null>>
  >(() => savedInitialState?.uploadedDocsByPeriod ?? ({
    'oct-2026': { ...INITIAL_UPLOADED_DOCS },
    'sep-2026': { ...INITIAL_UPLOADED_DOCS },
    'aug-2026': { ...INITIAL_UPLOADED_DOCS },
  }));
  const [manualCandidates, setManualCandidates] = useState<
    ManualMatchCandidate[]
  >(() => savedInitialState?.manualCandidates ?? []);
  const [activities, setActivities] = useState<AuditActivityEvent[]>(
    () => savedInitialState?.activities ?? []
  );
  const [settings, setSettings] = useState<AuditSettings>(
    () => ({ ...DEFAULT_SETTINGS, ...savedInitialState?.settings })
  );

  const [verificationFilter, setVerificationFilter] = useState<
    'All' | VerificationStatus
  >('All');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const recomputeSeqRef = useRef(0);
  const workspaceHydratedRef = useRef(!runtimeConfig.authEnabled);

  useEffect(() => {
    let cancelled = false;
    getAuditlyIdentity()
      .then((nextIdentity) => {
        if (cancelled) return;
        setIdentity(nextIdentity);
        if (!runtimeConfig.authEnabled) setWorkspaceReady(true);
      })
      .catch(() => {
        if (!cancelled && !runtimeConfig.authEnabled) {
          setIdentity({ uid: 'local-owner', email: 'local', role: 'owner' });
        }
      })
      .finally(() => { if (!cancelled) setAuthLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (runtimeConfig.authEnabled) return;
    const stateToSave: PersistedAuditState = {
      version: 1,
      selectedPeriodId,
      recordsByPeriod,
      isRealDataByPeriod,
      uploadedDocsByPeriod,
      manualCandidates,
      activities,
      settings,
    };

    try {
      window.localStorage.setItem(
        AUDIT_STATE_STORAGE_KEY,
        JSON.stringify(stateToSave)
      );
    } catch (error) {
      console.warn('Could not save the latest audit workspace in this browser.', error);
    }
  }, [
    selectedPeriodId,
    recordsByPeriod,
    isRealDataByPeriod,
    uploadedDocsByPeriod,
    manualCandidates,
    activities,
    settings,
  ]);

  useEffect(() => {
    if (!runtimeConfig.authEnabled) return;
    if (!identity) {
      workspaceHydratedRef.current = false;
      setWorkspaceReady(false);
      return;
    }
    if (identity.role === 'client') {
      if (identity.mustChangePassword) {
        setWorkspaceReady(false);
        return;
      }
      if (!identity.clientId) {
        setWorkspaceError('This login is not assigned to a client workspace.');
        setWorkspaceReady(false);
        return;
      }
      if (activeClient?.id !== identity.clientId) {
        setActiveClient({
          id: identity.clientId,
          name: identity.clientName ?? 'Client workspace',
          email: identity.email,
          createdAt: '',
        });
      }
      selectClientWorkspace(identity.clientId);
    }
    if (identity.role === 'owner' && !activeClient) {
      workspaceHydratedRef.current = false;
      setWorkspaceReady(false);
      return;
    }

    let cancelled = false;
    workspaceHydratedRef.current = false;
    setWorkspaceReady(false);
    setWorkspaceError(null);
    loadRemoteWorkspace()
      .then((remoteState) => {
        if (cancelled) return;
        const state = remoteState as PersistedAuditState | null;
        if (
          state?.version === 1 &&
          typeof state.selectedPeriodId === 'string' &&
          state.recordsByPeriod && state.uploadedDocsByPeriod && state.settings
        ) {
          setSelectedPeriodId(state.selectedPeriodId);
          setRecordsByPeriod(state.recordsByPeriod);
          setIsRealDataByPeriod(state.isRealDataByPeriod ?? {});
          setUploadedDocsByPeriod(state.uploadedDocsByPeriod);
          setManualCandidates(state.manualCandidates ?? []);
          setActivities(state.activities ?? []);
          setSettings({ ...DEFAULT_SETTINGS, ...state.settings });
        } else {
          setSelectedPeriodId('oct-2026');
          setRecordsByPeriod({});
          setIsRealDataByPeriod({});
          setUploadedDocsByPeriod({
            'oct-2026': { excel: null, epf: null, esic: null },
          });
          setManualCandidates([]);
          setActivities([]);
          setSettings(DEFAULT_SETTINGS);
        }
        setActiveRoute('dashboard');
        workspaceHydratedRef.current = true;
        setWorkspaceReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setWorkspaceError(error instanceof Error ? error.message : 'The client workspace could not be loaded.');
          setWorkspaceReady(false);
        }
      });
    return () => { cancelled = true; };
  }, [identity, activeClient, workspaceLoadSeq]);

  useEffect(() => {
    if (
      !runtimeConfig.authEnabled || !identity ||
      !activeClient || !workspaceReady || !workspaceHydratedRef.current
    ) return;
    const stateToSave: PersistedAuditState = {
      version: 1,
      selectedPeriodId,
      recordsByPeriod,
      isRealDataByPeriod,
      uploadedDocsByPeriod,
      manualCandidates,
      activities,
      settings,
    };
    const timer = window.setTimeout(() => {
      saveRemoteWorkspace(stateToSave).then(
        () => setWorkspaceError(null),
        (error: unknown) => setWorkspaceError(error instanceof Error ? error.message : 'The client workspace could not be saved.')
      );
    }, 650);
    return () => window.clearTimeout(timer);
  }, [
    identity,
    activeClient,
    workspaceReady,
    selectedPeriodId,
    recordsByPeriod,
    isRealDataByPeriod,
    uploadedDocsByPeriod,
    manualCandidates,
    activities,
    settings,
  ]);

  useEffect(() => {
    // Recover an existing in-memory server audit once when upgrading to this saved workspace.
    if (runtimeConfig.authEnabled) return;
    if (savedInitialState?.isRealDataByPeriod[selectedPeriodId]) return;

    let cancelled = false;
    runServerVerification(selectedPeriodId, settings)
      .then((result) => {
        if (cancelled || !result.hasRealData) return;
        setUploadedDocsByPeriod((prev) => ({
          ...prev,
          [selectedPeriodId]: result.docs,
        }));
        setIsRealDataByPeriod((prev) => ({
          ...prev,
          [selectedPeriodId]: true,
        }));
        setRecordsByPeriod((prev) => ({
          ...prev,
          [selectedPeriodId]: result.records,
        }));
        setManualCandidates(result.manualCandidates ?? []);
      })
      .catch(() => {
        // The server may be empty or unavailable; keep any browser-saved state.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const pushActivity = (
    title: string,
    detail: string,
    category: AuditActivityEvent['category']
  ) => {
    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title,
        detail,
        timestamp: 'Just now',
        category,
      },
      ...prev,
    ]);
  };

  const currentRecords = recordsByPeriod[selectedPeriodId] ?? [];
  const currentDocs = uploadedDocsByPeriod[selectedPeriodId] ?? {
    excel: null,
    epf: null,
    esic: null,
  };
  const isCurrentPeriodReal = Boolean(isRealDataByPeriod[selectedPeriodId]);
  const today = new Date();
  const todayLabel = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(today);
  const currentMonthYear = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(today);
  const currentPeriodLabel = currentDocs.excel
    ? currentDocs.excel.periodLabel ??
      periodFromFileName(currentDocs.excel.fileName) ??
      'Period unavailable'
    : currentMonthYear;

  const flaggedCount = useMemo(
    () => currentRecords.filter((r) => r.status !== 'Matched').length,
    [currentRecords]
  );

  const pendingReviewCount = useMemo(
    () => manualCandidates.filter((c) => c.decision === 'Pending').length,
    [manualCandidates]
  );

  const handleUploadDoc = (
    slot: 'excel' | 'epf' | 'esic',
    doc: UploadedDocState | null
  ) => {
    setUploadedDocsByPeriod((prev) => {
      const current = prev[selectedPeriodId] ?? {
        excel: null,
        epf: null,
        esic: null,
      };
      return {
        ...prev,
        [selectedPeriodId]: { ...current, [slot]: doc },
      };
    });

    if (doc?.isDemoSample) {
      setIsRealDataByPeriod((prev) => ({ ...prev, [selectedPeriodId]: false }));
      setRecordsByPeriod((prev) => ({
        ...prev,
        [selectedPeriodId]: DEMO_EMPLOYEES_BY_PERIOD[selectedPeriodId] ?? [],
      }));
      setManualCandidates(INITIAL_MANUAL_REVIEW_QUEUE);
      resetServerWorkspace(selectedPeriodId).catch(() => {});
    }

    if (doc) {
      const label =
        slot === 'excel'
          ? 'Attendance Excel'
          : slot === 'epf'
          ? 'EPF ECR PDF'
          : 'ESIC IP PDF';
      pushActivity(
        `${label} Loaded`,
        `${doc.fileName} (${doc.fileSizeLabel})`,
        'upload'
      );
      showToast(`${label} ready for verification`);
    }
  };

  const handleServerSync = (
    result: ServerAuditResponse,
    activityTitle: string,
    activityDetail: string,
    toastMsg: string
  ) => {
    setUploadedDocsByPeriod((prev) => ({
      ...prev,
      [selectedPeriodId]: result.docs,
    }));

    if (result.hasRealData) {
      setIsRealDataByPeriod((prev) => ({ ...prev, [selectedPeriodId]: true }));
      setRecordsByPeriod((prev) => ({
        ...prev,
        [selectedPeriodId]: result.records,
      }));
      setManualCandidates(result.manualCandidates ?? []);
    } else {
      setIsRealDataByPeriod((prev) => ({ ...prev, [selectedPeriodId]: false }));
      setRecordsByPeriod((prev) => ({
        ...prev,
        [selectedPeriodId]: [],
      }));
      setManualCandidates([]);
    }

    pushActivity(activityTitle, activityDetail, 'upload');
    showToast(toastMsg);
  };

  const handleStartVerification = (serverResult?: ServerAuditResponse) => {
    let totalCount = currentRecords.length;

    if (serverResult) {
      setUploadedDocsByPeriod((prev) => ({
        ...prev,
        [selectedPeriodId]: serverResult.docs,
      }));
      if (serverResult.hasRealData) {
        setIsRealDataByPeriod((prev) => ({ ...prev, [selectedPeriodId]: true }));
        setRecordsByPeriod((prev) => ({
          ...prev,
          [selectedPeriodId]: serverResult.records,
        }));
        setManualCandidates(serverResult.manualCandidates ?? []);
        totalCount = serverResult.records.length;
      }
    }

    pushActivity(
      serverResult?.hasRealData
        ? 'Verified Uploaded Documents'
        : 'Demo Verification Completed',
      `Reconciled ${totalCount} employee rows for ${currentPeriodLabel}`,
      'verification'
    );
    setVerificationFilter('All');
    setActiveRoute('dashboard');
    showToast(
      `Verification complete (${totalCount} employees) — dashboard updated`
    );
  };

  const handleUpdateSettings = (
    next: AuditSettings,
    notifyMessage?: string
  ) => {
    if (identity?.role === 'client') return;
    const matchingChanged =
      next.differenceThreshold !== settings.differenceThreshold ||
      next.fuzzyNameThreshold !== settings.fuzzyNameThreshold ||
      next.strictUanMatching !== settings.strictUanMatching ||
      next.flagBlankIpAsReview !== settings.flagBlankIpAsReview;

    setSettings(next);

    if (matchingChanged) {
      const seq = ++recomputeSeqRef.current;
      const periodSnapshot = selectedPeriodId;
      const recordsSnapshot = currentRecords;

      recomputeAuditRecords(periodSnapshot, next, recordsSnapshot)
        .then((res) => {
          if (seq !== recomputeSeqRef.current) return;
          setRecordsByPeriod((prev) => ({
            ...prev,
            [periodSnapshot]: res.records,
          }));
          if (res.manualCandidates) {
            setManualCandidates(res.manualCandidates);
          }
          if (notifyMessage) {
            showToast(notifyMessage);
          }
        })
        .catch(() => {
          if (notifyMessage) {
            showToast(notifyMessage);
          }
        });
    } else if (notifyMessage) {
      showToast(notifyMessage);
    }
  };

  const handleResetDefaultSettings = () => {
    handleUpdateSettings(
      DEFAULT_SETTINGS,
      'Restored default audit settings (₹100 threshold)'
    );
  };

  const handleUpdateRecordStatus = (
    recordId: string,
    newStatus: VerificationStatus
  ) => {
    if (identity?.role === 'client') return;
    setRecordsByPeriod((prev) => ({
      ...prev,
      [selectedPeriodId]: (prev[selectedPeriodId] ?? []).map((rec) =>
        rec.id === recordId ? { ...rec, status: newStatus } : rec
      ),
    }));
    const target = currentRecords.find((r) => r.id === recordId);
    if (target) {
      pushActivity(
        'Record Status Updated',
        `${target.name} marked as ${newStatus}`,
        'verification'
      );
      showToast(`${target.name} updated to ${newStatus}`);
    }
  };

  const handleManualReviewDecision = (
    candidateId: string,
    decision: ManualReviewDecision
  ) => {
    const candidate = manualCandidates.find((c) => c.id === candidateId);
    setManualCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, decision } : c))
    );

    if (candidate) {
      if (decision === 'Approved') {
        setRecordsByPeriod((prev) => ({
          ...prev,
          [selectedPeriodId]: (prev[selectedPeriodId] ?? []).map((rec) => {
            if (rec.id !== candidate.employeeRecordId) return rec;
            const isEpf = candidate.pdfSource.includes('EPF');
            return {
              ...rec,
              uan: isEpf && !rec.uan ? candidate.pdfUanOrIp : rec.uan,
              ipNumber:
                !isEpf && !rec.ipNumber ? candidate.pdfUanOrIp : rec.ipNumber,
              epfEE:
                isEpf && rec.epfEE === null && candidate.pdfAmount !== null
                  ? candidate.pdfAmount
                  : rec.epfEE,
              esicIP:
                !isEpf && rec.esicIP === null && candidate.pdfAmount !== null
                  ? candidate.pdfAmount
                  : rec.esicIP,
              status: 'Matched',
              matchConfidence: 100,
              flagReason: `Manually approved match with "${candidate.suggestedPdfName}" (${candidate.pdfSource}).`,
            };
          }),
        }));
      } else if (decision === 'Rejected') {
        setRecordsByPeriod((prev) => ({
          ...prev,
          [selectedPeriodId]: (prev[selectedPeriodId] ?? []).map((rec) =>
            rec.id === candidate.employeeRecordId
              ? {
                  ...rec,
                  status: 'Mismatch',
                  flagReason: `Suggested match "${candidate.suggestedPdfName}" rejected during manual review.`,
                }
              : rec
          ),
        }));
      } else {
        const original = !isCurrentPeriodReal
          ? (DEMO_EMPLOYEES_BY_PERIOD[selectedPeriodId] ?? []).find(
              (r) => r.id === candidate.employeeRecordId
            )
          : undefined;
        setRecordsByPeriod((prev) => ({
          ...prev,
          [selectedPeriodId]: (prev[selectedPeriodId] ?? []).map((rec) =>
            rec.id === candidate.employeeRecordId
              ? original ?? {
                  ...rec,
                  status: 'Needs Review',
                  matchConfidence: candidate.confidence,
                  flagReason: candidate.reason,
                }
              : rec
          ),
        }));
      }

      pushActivity(
        `Match ${decision}`,
        `${candidate.excelName} ↔ ${candidate.suggestedPdfName}`,
        'review'
      );
      showToast(`${candidate.excelName}: Match ${decision}`);
    }
  };

  const handleInspectEmployee = (recordId: string) => {
    setSelectedEmployeeId(recordId);
    setVerificationFilter('All');
    setActiveRoute('verification');
  };

  const isClientViewer = identity?.role === 'client';
  const accountName = isClientViewer
    ? identity?.clientName ?? identity?.email ?? 'Client'
    : identity?.email === 'local'
      ? 'JACKSON ABRAHAM'
      : identity?.email?.split('@')[0]?.replace(/[._-]+/g, ' ').toUpperCase() ?? 'AUDITLY USER';

  const handleNavigate = (route: NavRoute) => {
    
    setActiveRoute(route);
  };

  const handleSignedIn = (nextIdentity: AuditlyIdentity) => {
    setWorkspaceError(null);
    setIdentity(nextIdentity);
    setActiveClient(null);
    selectClientWorkspace(nextIdentity.role === 'client' ? nextIdentity.clientId ?? null : null);
  };

  const handlePasswordChanged = async () => {
    try {
      const nextIdentity = await getAuditlyIdentity();
      setIdentity(nextIdentity);
      setWorkspaceError(null);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'Please sign in again.');
      clearAuditlySignIn();
      setIdentity(null);
    }
  };

  const handleSignOut = () => {
    clearAuditlySignIn();
    setIdentity(null);
    setActiveClient(null);
    setWorkspaceReady(false);
    workspaceHydratedRef.current = false;
    setRecordsByPeriod({});
    setIsRealDataByPeriod({});
    setUploadedDocsByPeriod({});
    setManualCandidates([]);
    setActivities([]);
    setSettings(DEFAULT_SETTINGS);
    setSelectedPeriodId('oct-2026');
    setActiveRoute('dashboard');
    setAuthLoading(false);
  };

  const handleSelectWorkspace = (client: ClientWorkspaceSummary) => {
    selectClientWorkspace(client.id);
    setActiveClient(client);
    setWorkspaceError(null);
  };

  const handleSwitchWorkspace = () => {
    if (isClientViewer) return;
    selectClientWorkspace(null);
    setActiveClient(null);
    setWorkspaceError(null);
    setWorkspaceReady(false);
    workspaceHydratedRef.current = false;
    setActiveRoute('dashboard');
  };

  if (authLoading) {
    return <div className="min-h-dvh bg-[#F7F3F0] flex items-center justify-center text-sm font-semibold text-[#64748B]">Opening your private Auditly workspace…</div>;
  }

  if (runtimeConfig.authEnabled && !identity) {
    return <AccessGate mode="login" onSignedIn={handleSignedIn} onPasswordChanged={handlePasswordChanged} onSelectWorkspace={handleSelectWorkspace} onSignOut={handleSignOut} />;
  }

  if (identity?.mustChangePassword) {
    return <AccessGate mode="password" identity={identity} onSignedIn={handleSignedIn} onPasswordChanged={handlePasswordChanged} onSelectWorkspace={handleSelectWorkspace} onSignOut={handleSignOut} />;
  }

  if (runtimeConfig.authEnabled && identity?.role === 'owner' && !activeClient) {
    return <AccessGate mode="workspaces" identity={identity} onSignedIn={handleSignedIn} onPasswordChanged={handlePasswordChanged} onSelectWorkspace={handleSelectWorkspace} onSignOut={handleSignOut} />;
  }

  if (runtimeConfig.authEnabled && !workspaceReady) {
    return (
      <div className="min-h-dvh bg-[#F7F3F0] p-5 flex items-center justify-center">
        <div className="max-w-lg border-2 border-[#1E293B] bg-white p-6 shadow-[5px_5px_0px_#0E0E10]">
          <p className="text-sm font-bold text-[#0F172A]">{workspaceError ? 'Workspace needs attention' : 'Opening your private Auditly workspace…'}</p>
          {workspaceError && <p role="alert" className="mt-2 text-sm text-[#64748B]">{workspaceError}</p>}
          {workspaceError && (
          <button onClick={() => { setWorkspaceError(null); setWorkspaceLoadSeq((value) => value + 1); }} className="mt-4 border-2 border-[#1E293B] bg-[#ECE6FD] px-3 py-2 text-xs font-bold">Retry</button>
          )}
          <button onClick={handleSignOut} className="ml-2 mt-4 border-2 border-[#1E293B] bg-white px-3 py-2 text-xs font-bold">Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh w-screen overflow-hidden bg-[#F7F3F0] flex items-center justify-center">
      <div className="relative w-full h-full lg:w-[min(100vw,calc(100dvh*16/9))] lg:h-[min(100dvh,calc(100vw*9/16))] overflow-hidden flex bg-[#FDF9F6] text-[#0F172A] lg:border-2 lg:border-[#1E293B]">
        <Sidebar
          activeRoute={activeRoute}
          onNavigate={handleNavigate}
          clientViewer={false}
          accountName={accountName}
          accountRole={isClientViewer ? 'Client access' : 'Lead Payroll Auditor'}
          flaggedCount={flaggedCount}
          pendingReviewCount={pendingReviewCount}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <TopHeader
            activeRoute={activeRoute}
            todayLabel={todayLabel}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onNavigate={handleNavigate}
            identity={identity}
            workspaceName={isClientViewer ? identity?.clientName : activeClient?.name}
            onSignOut={handleSignOut}
            onSwitchWorkspace={handleSwitchWorkspace}
          />

          {workspaceError && (
            <div role="status" className="shrink-0 border-b border-[#F59E0B] bg-[#FFF7E6] px-3 py-1 text-[11px] text-[#7C3E00]">Workspace save notice: {workspaceError}</div>
          )}

          {runtimeConfig.authEnabled && (
            <div className="shrink-0 border-b border-[#E2DCD5] bg-[#F7F3F0] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
              {isClientViewer ? 'Client workspace' : 'Auditor view'}
              {activeClient?.name ? <span className="normal-case tracking-normal"> · {activeClient.name}</span> : null}
            </div>
          )}

          <main className={`flex-1 min-h-0 p-2.5 bg-[#FDF9F6] ${activeRoute === 'manual-review' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
            {activeRoute === 'dashboard' && (
              <DashboardPage
                records={currentRecords}
                periodLabel={currentPeriodLabel}
                showDemoBanner={settings.showDemoBanner}
                isRealData={isCurrentPeriodReal}
                onNavigate={handleNavigate}
                onSelectVerificationFilter={setVerificationFilter}
                onInspectEmployee={handleInspectEmployee}
                readOnly={false}
              />
            )}

            {activeRoute === 'upload' && (
              <UploadDocumentsPage
                periodId={selectedPeriodId}
                settings={settings}
                uploadedDocs={currentDocs}
                onUploadDoc={handleUploadDoc}
                onServerSync={handleServerSync}
                onStartVerification={handleStartVerification}
              />
            )}

            {activeRoute === 'employees' && (
              <EmployeeRecordsPage
                records={currentRecords}
                globalSearch={globalSearch}
                compactRows={settings.compactTableRows}
                onInspectInVerification={handleInspectEmployee}
              />
            )}

            {activeRoute === 'verification' && (
              <ContributionVerificationPage
                records={currentRecords}
                activeFilter={verificationFilter}
                onFilterChange={setVerificationFilter}
                selectedEmployeeId={selectedEmployeeId}
                onSelectEmployee={setSelectedEmployeeId}
                globalSearch={globalSearch}
                differenceThreshold={settings.differenceThreshold}
                compactRows={settings.compactTableRows}
                onUpdateStatus={handleUpdateRecordStatus}
                onGoToManualReview={() => handleNavigate('manual-review')}
                onGoToSettings={() => handleNavigate('settings')}
                readOnly={false}
              />
            )}

            {activeRoute === 'manual-review' && (
              <ManualReviewPage
                candidates={manualCandidates}
                records={currentRecords}
                globalSearch={globalSearch}
                onDecision={handleManualReviewDecision}
                onInspectEmployee={handleInspectEmployee}
              />
            )}

            {activeRoute === 'reports' && (
              <ReportsPage
                records={currentRecords}
                candidates={manualCandidates}
                periodLabel={currentPeriodLabel}
                settings={settings}
                uploadedDocs={currentDocs}
                onReportExported={(title, fmt) => {
                  pushActivity(
                    `${fmt} Report Exported`,
                    `${title} (${currentPeriodLabel})`,
                    'report'
                  );
                  showToast(`${title} (${fmt}) ready`);
                }}
                readOnly={false}
              />
            )}

            {activeRoute === 'settings' && (
              <SettingsPage
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                onResetDefaults={handleResetDefaultSettings}
              />
            )}
          </main>
        </div>

        {/* Neo-brutalist Toast Notification (top-center so it never covers card action buttons) */}
        {toastMessage && (
          <div
            role="status"
            className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-[#0E0E10] text-[#FFFFFF] border-2 border-[#9A7AF1] rounded-[4px] px-3 py-1.5 shadow-[3px_3px_0px_#9A7AF1] flex items-center gap-2 text-[11px] font-semibold whitespace-nowrap"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              aria-label="Dismiss notification"
              className="text-[#94A3B8] hover:text-[#FFFFFF] cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
