import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  deleteSupabaseObject,
  isSupabaseStorageConfigured,
  readSupabaseJson,
  writeSupabaseJson,
} from './server/supabaseStorage.ts';
import {
  createSupabaseUser,
  deleteSupabaseUser,
  getSupabasePublishableKey,
  getSupabaseUrl,
  isSupabaseAuthConfigured,
  updateSupabasePassword,
  verifySupabaseAccessToken,
} from './server/supabaseAuth.ts';
import type {
  AuditSettings,
  EmployeeAuditRecord,
  UploadedDocState,
} from './src/types/audit.ts';
import {
  classifyRecordWithSettings,
  parseAttendanceExcel,
  detectPayrollPeriod,
  parseEpfEcrPdf,
  parseEsicIpPdf,
  reconcileAuditData,
} from './server/auditEngine.ts';
import type {
  EpfEcrRow,
  EsicIpRow,
  ExcelEmployeeRow,
} from './server/auditEngine.ts';

interface PeriodAuditWorkspace {
  excelRows: ExcelEmployeeRow[];
  epfRows: EpfEcrRow[];
  esicRows: EsicIpRow[];
  docs: Record<'excel' | 'epf' | 'esic', UploadedDocState | null>;
}

interface ClientAccount {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface ClientMembership {
  clientId: string;
  clientName: string;
  email: string;
  mustChangePassword: boolean;
}

interface AuditIdentity {
  uid: string;
  email: string;
  role: 'owner' | 'client';
  clientId?: string;
  clientName?: string;
  mustChangePassword?: boolean;
}

interface AuditRequest extends Request {
  auditIdentity?: AuditIdentity;
}

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

function formatFileBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = Math.round(bytes / 1024);
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatNowTime(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getEpfUanOverlapWarning(
  excelRows: ExcelEmployeeRow[],
  epfRows: EpfEcrRow[]
): string | null {
  const excelUans = new Set(excelRows.map((row) => row.uan).filter(Boolean));
  if (excelUans.size === 0 || epfRows.length === 0) return null;

  const epfUans = new Set(epfRows.map((row) => row.uan).filter(Boolean));
  const matchedUanCount = [...excelUans].filter((uan) => epfUans.has(uan)).length;
  if (matchedUanCount / excelUans.size >= 0.5) return null;

  return `Only ${matchedUanCount} of ${excelUans.size} payroll UANs were found in this EPF ECR. Check that the PDF is for the same company and month as the Excel file.`;
}

const workspaces = new Map<string, PeriodAuditWorkspace>();
const localStates = new Map<string, unknown>();
const hostedAuthConfigured = Boolean(
  isSupabaseAuthConfigured &&
  process.env.AUDITLY_OWNER_EMAIL
);
const ownerEmail = process.env.AUDITLY_OWNER_EMAIL?.trim().toLowerCase() ?? '';
function getPublicRuntimeConfig() {
  return {
    authEnabled: hostedAuthConfigured,
    supabaseUrl: getSupabaseUrl() ?? '',
    supabasePublishableKey: getSupabasePublishableKey() ?? '',
  };
}
function getRuntimeConfigScript(): string {
  const safeRuntimeConfig = JSON.stringify(getPublicRuntimeConfig()).replace(/</g, '\\u003c');
  return '<script>window.AUDITLY_CONFIG = ' + safeRuntimeConfig + ';</script>';
}
function safeStoragePathPart(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error('Invalid workspace path.');
  }
  return value;
}
const workspaceObject = (clientId: string, periodId: string) =>
  'auditly/workspaces/' + safeStoragePathPart(clientId) + '/' + safeStoragePathPart(periodId) + '.json';
const stateObject = (clientId: string) =>
  'auditly/client-states/' + safeStoragePathPart(clientId) + '.json';

function createEmptyWorkspace(): PeriodAuditWorkspace {
  return {
    excelRows: [],
    epfRows: [],
    esicRows: [],
    docs: { excel: null, epf: null, esic: null },
  };
}

async function getWorkspace(clientId: string, periodId: string): Promise<PeriodAuditWorkspace> {
  if (isSupabaseStorageConfigured) {
    return (await readSupabaseJson<PeriodAuditWorkspace>(workspaceObject(clientId, periodId))) ?? createEmptyWorkspace();
  }
  const key = clientId + '::' + periodId;
  return workspaces.get(key) ?? createEmptyWorkspace();
}

async function saveWorkspace(
  clientId: string,
  periodId: string,
  workspace: PeriodAuditWorkspace
): Promise<void> {
  if (isSupabaseStorageConfigured) {
    await writeSupabaseJson(workspaceObject(clientId, periodId), workspace);
    return;
  }
  workspaces.set(clientId + '::' + periodId, workspace);
}

async function removeWorkspace(clientId: string, periodId: string): Promise<void> {
  if (isSupabaseStorageConfigured) {
    await deleteSupabaseObject(workspaceObject(clientId, periodId));
    return;
  }
  workspaces.delete(clientId + '::' + periodId);
}

async function readClientMemberships(): Promise<Record<string, ClientMembership>> {
  if (!isSupabaseStorageConfigured) return {};
  return (await readSupabaseJson<Record<string, ClientMembership>>('auditly/client-users.json')) ?? {};
}

async function writeClientMemberships(
  memberships: Record<string, ClientMembership>
): Promise<void> {
  if (isSupabaseStorageConfigured) {
    await writeSupabaseJson('auditly/client-users.json', memberships);
  }
}

async function getRequestIdentity(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  const req = request as AuditRequest;
  if (!hostedAuthConfigured) {
    req.auditIdentity = { uid: 'local-owner', email: 'local', role: 'owner' };
    return next();
  }

  const authHeader = request.header('authorization') ?? '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!accessToken) {
    response.status(401).json({ error: 'Please sign in to access this client workspace.' });
    return;
  }

  try {
    const supabaseUser = await verifySupabaseAccessToken(accessToken);
    if (supabaseUser.email.trim().toLowerCase() === ownerEmail) {
      if (!supabaseUser.emailConfirmed) {
        response.status(403).json({ error: 'Confirm the auditor email address in Supabase before signing in.' });
        return;
      }
      req.auditIdentity = {
        uid: supabaseUser.uid,
        email: supabaseUser.email,
        role: 'owner',
      };
    } else {
      const membership = (await readClientMemberships())[supabaseUser.uid];
      if (!membership || membership.email.trim().toLowerCase() !== supabaseUser.email.trim().toLowerCase()) {
        response.status(403).json({ error: 'This account has not been assigned to a client workspace.' });
        return;
      }
      req.auditIdentity = {
        uid: supabaseUser.uid,
        email: supabaseUser.email,
        role: 'client',
        clientId: membership.clientId,
        clientName: membership.clientName,
        mustChangePassword: membership.mustChangePassword,
      };
      const endpointPath = request.originalUrl.split('?')[0];
      if (
        membership.mustChangePassword &&
        endpointPath !== '/api/auth/session' &&
        endpointPath !== '/api/auth/change-password'
      ) {
        response.status(403).json({ error: 'Change your temporary password before continuing.' });
        return;
      }
    }
    next();
  } catch {
    response.status(401).json({ error: 'Your sign-in has expired. Please sign in again.' });
  }
}

async function getClientIdForRequest(req: AuditRequest, res: Response): Promise<string | null> {
  const identity = req.auditIdentity;
  if (!identity) {
    res.status(401).json({ error: 'Please sign in to access this client workspace.' });
    return null;
  }
  if (!hostedAuthConfigured) return req.header('x-auditly-client-id') || 'local';
  if (identity.role === 'client') return identity.clientId ?? null;

  const selectedId = req.header('x-auditly-client-id');
  if (!selectedId) {
    res.status(400).json({ error: 'Select a client workspace first.' });
    return null;
  }
  const clients = (await readSupabaseJson<ClientAccount[]>('auditly/clients.json')) ?? [];
  if (!clients.some((client) => client.id === selectedId)) {
    res.status(403).json({ error: 'That client workspace is unavailable.' });
    return null;
  }
  return selectedId;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<unknown>
) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !hostedAuthConfigured) {
    throw new Error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and AUDITLY_OWNER_EMAIL before publishing Auditly.');
  }
  if (isProd && !isSupabaseStorageConfigured) {
    throw new Error('Set SUPABASE_SECRET_KEY and AUDITLY_STORAGE_BUCKET to a private Supabase Storage bucket before publishing Auditly.');
  }

  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'challan-audit-pro' });
  });

  app.use('/api', getRequestIdentity);

  app.get('/api/auth/session', (request, response) => {
    const identity = (request as AuditRequest).auditIdentity;
    response.json(identity ?? null);
  });

  app.post('/api/auth/change-password', async (request, response) => {
    const req = request as AuditRequest;
    const identity = req.auditIdentity;
    const password = String(req.body?.password ?? '');
    if (!identity || identity.role !== 'client' || !identity.mustChangePassword) {
      return response.status(403).json({ error: 'No temporary password change is required for this account.' });
    }
    if (password.length < 10) {
      return response.status(400).json({ error: 'Choose a password with at least 10 characters.' });
    }

    try {
      await updateSupabasePassword(identity.uid, password);
      const memberships = await readClientMemberships();
      const membership = memberships[identity.uid];
      if (membership) {
        memberships[identity.uid] = { ...membership, mustChangePassword: false };
        await writeClientMemberships(memberships);
      }
      return response.json({ ok: true });
    } catch (error) {
      console.error('[change-password] failed:', error);
      const message = error instanceof Error ? error.message : '';
      return response.status(400).json({
        error: message.toLowerCase().includes('password')
          ? 'Choose a stronger password.'
          : 'The password could not be changed. Please sign in again and retry.',
      });
    }
  });

  app.get('/api/admin/clients', asyncRoute(async (request, response) => {
    const identity = (request as AuditRequest).auditIdentity;
    if (identity?.role !== 'owner') return response.status(403).json({ error: 'Owner access is required.' });
    try {
      const clients = (await readSupabaseJson<ClientAccount[]>('auditly/clients.json')) ?? [];
      return response.json({ clients });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load client workspaces.';
      return response.status(500).json({ error: message });
    }
  }));

  app.post('/api/admin/clients', asyncRoute(async (request, response) => {
    const identity = (request as AuditRequest).auditIdentity;
    if (identity?.role !== 'owner') return response.status(403).json({ error: 'Owner access is required.' });
    if (!hostedAuthConfigured || !isSupabaseStorageConfigured) {
      return response.status(503).json({ error: 'Client accounts are available after Supabase Auth and private storage are configured.' });
    }
    const name = String(request.body?.name ?? '').trim().slice(0, 120);
    const email = String(request.body?.email ?? '').trim().toLowerCase();
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response.status(400).json({ error: 'Enter a client name and a valid email address.' });
    }

    const clientId = randomUUID();
    const temporaryPassword = randomBytes(18).toString('base64url') + 'aA7!';
    let supabaseUid: string | null = null;
    let clients: ClientAccount[] = [];
    try {
      clients = (await readSupabaseJson<ClientAccount[]>('auditly/clients.json')) ?? [];
      const memberships = await readClientMemberships();
      if (
        clients.some((client) => client.email.toLowerCase() === email) ||
        Object.values(memberships).some((membership) => membership.email.toLowerCase() === email)
      ) {
        return response.status(409).json({ error: 'A client workspace already uses this email address.' });
      }
      const supabaseUser = await createSupabaseUser(email, temporaryPassword, name);
      supabaseUid = supabaseUser.uid;
      const nextMemberships = { ...memberships };
      nextMemberships[supabaseUser.uid] = {
        clientId,
        clientName: name,
        email,
        mustChangePassword: true,
      };
      await writeClientMemberships(nextMemberships);
      await writeSupabaseJson('auditly/clients.json', [
        ...clients,
        { id: clientId, name, email, createdAt: new Date().toISOString() },
      ]);
      return response.status(201).json({
        client: { id: clientId, name, email },
        temporaryPassword,
      });
    } catch (error) {
            console.error('[client setup] failed:', error);
      if (supabaseUid) {
        try {
          const currentClients = (await readSupabaseJson<ClientAccount[]>('auditly/clients.json')) ?? [];
          await writeSupabaseJson('auditly/clients.json', currentClients.filter((client) => client.id !== clientId));
          await deleteSupabaseUser(supabaseUid);
          const nextMemberships = await readClientMemberships();
          delete nextMemberships[supabaseUid];
          await writeClientMemberships(nextMemberships);
        } catch {
          console.error('[client setup] Could not roll back Supabase account ' + supabaseUid);
        }
      }
      const message = error instanceof Error ? error.message : '';
      const friendly = message.toLowerCase().includes('already') || message.toLowerCase().includes('registered')
        ? 'That email already has an Auditly login. Use a different email address.'
        : 'The client workspace could not be created. Check that Supabase Auth and the private storage bucket are enabled.';
      return response.status(500).json({ error: friendly });
    }
  }));

  app.get('/api/workspace/state', asyncRoute(async (request, response) => {
    const req = request as AuditRequest;
    const clientId = await getClientIdForRequest(req, response);
    if (!clientId) return;
    try {
      const state = isSupabaseStorageConfigured
        ? await readSupabaseJson<unknown>(stateObject(clientId))
        : localStates.get(clientId) ?? null;
      return response.json({ state });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load the saved workspace.';
      return response.status(500).json({ error: message });
    }
  }));

  app.put('/api/workspace/state', asyncRoute(async (request, response) => {
    const req = request as AuditRequest;
    if (req.auditIdentity?.role !== 'owner') return response.status(403).json({ error: 'Only the auditor can update this workspace.' });
    const clientId = await getClientIdForRequest(req, response);
    if (!clientId) return;
    if (!request.body || typeof request.body !== 'object') {
      return response.status(400).json({ error: 'The workspace data is invalid.' });
    }
    try {
      if (isSupabaseStorageConfigured) {
        await writeSupabaseJson(stateObject(clientId), request.body);
      } else {
        localStates.set(clientId, request.body);
      }
      return response.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save the workspace.';
      return response.status(500).json({ error: message });
    }
  }));

  // Upload & immediately parse Excel, EPF ECR PDF, or ESIC IP PDF
  app.post('/api/audit/upload', upload.single('file'), asyncRoute(async (request, res) => {
    const req = request as AuditRequest;
    if (req.auditIdentity?.role !== 'owner') {
      return res.status(403).json({ error: 'Only the auditor can upload source files.' });
    }
    try {
      const slot = String(req.body?.slot ?? req.query?.slot ?? '') as
        | 'excel'
        | 'epf'
        | 'esic';
      const periodId = String(req.body?.periodId ?? req.query?.periodId ?? 'oct-2026');
      let settings: AuditSettings = DEFAULT_SETTINGS;
      if (req.body?.settings) {
        try {
          settings = { ...DEFAULT_SETTINGS, ...JSON.parse(String(req.body.settings)) };
        } catch {
          // ignore malformed settings JSON
        }
      }

      if (!['excel', 'epf', 'esic'].includes(slot)) {
        return res.status(400).json({ error: 'Invalid upload slot. Must be excel, epf, or esic.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file received.' });
      }

      const clientId = await getClientIdForRequest(req, res);
      if (!clientId) return;
      const ws = await getWorkspace(clientId, periodId);
      const buffer = req.file.buffer;
      const fileName = req.file.originalname;
      let recordCount = 0;
      let warnings: string[] = [];

      if (slot === 'excel') {
        const result = parseAttendanceExcel(buffer, fileName);
        ws.excelRows = result.rows;
        recordCount = result.rows.length;
        warnings = result.warnings;
      } else if (slot === 'epf') {
        const result = await parseEpfEcrPdf(buffer);
        ws.epfRows = result.rows;
        recordCount = result.rows.length;
        warnings = result.warnings;
      } else {
        const result = await parseEsicIpPdf(buffer);
        ws.esicRows = result.rows;
        recordCount = result.rows.length;
        warnings = result.warnings;
      }

      const detectedPeriodLabel =
        slot === 'excel' ? detectPayrollPeriod(buffer, fileName) : null;
      const docState: UploadedDocState = {
        fileName,
        ...(detectedPeriodLabel ? { periodLabel: detectedPeriodLabel } : {}),
        fileSizeLabel: formatFileBytes(req.file.size),
        uploadedAt: `Today, ${formatNowTime()}`,
        recordCount,
        status: 'Loaded',
        isDemoSample: false,
      };
      ws.docs[slot] = docState;
      await saveWorkspace(clientId, periodId, ws);

      // Immediately reconcile whatever documents are currently uploaded in this workspace
      const hasExcel = Boolean(ws.docs.excel);
      const hasEpf = Boolean(ws.docs.epf);
      const hasEsic = Boolean(ws.docs.esic);

      if (hasExcel && hasEpf) {
        const epfOverlapWarning = getEpfUanOverlapWarning(ws.excelRows, ws.epfRows);
        if (epfOverlapWarning) warnings.push(epfOverlapWarning);
      }

      const reconciled = reconcileAuditData({
        excelRows: ws.excelRows,
        epfRows: ws.epfRows,
        esicRows: ws.esicRows,
        settings,
        hasExcel,
        hasEpf,
        hasEsic,
      });

      return res.json({
        slot,
        docState,
        warnings,
        hasRealData: hasExcel || hasEpf || hasEsic,
        docs: ws.docs,
        records: reconciled.records,
        manualCandidates: reconciled.manualCandidates,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse uploaded document.';
      console.error('[upload error]', err);
      return res.status(500).json({ error: msg });
    }
  }));

  // Remove a previously uploaded file slot
  app.delete('/api/audit/upload/:slot', asyncRoute(async (request, res) => {
    const req = request as AuditRequest;
    if (req.auditIdentity?.role !== 'owner') {
      return res.status(403).json({ error: 'Only the auditor can remove source files.' });
    }
    const slot = req.params.slot as 'excel' | 'epf' | 'esic';
    const periodId = String(req.query?.periodId ?? 'oct-2026');
    if (!['excel', 'epf', 'esic'].includes(slot)) {
      return res.status(400).json({ error: 'Invalid slot.' });
    }

    const clientId = await getClientIdForRequest(req, res);
    if (!clientId) return;
    const ws = await getWorkspace(clientId, periodId);
    ws.docs[slot] = null;
    if (slot === 'excel') ws.excelRows = [];
    if (slot === 'epf') ws.epfRows = [];
    if (slot === 'esic') ws.esicRows = [];
    await saveWorkspace(clientId, periodId, ws);

    const hasExcel = Boolean(ws.docs.excel);
    const hasEpf = Boolean(ws.docs.epf);
    const hasEsic = Boolean(ws.docs.esic);

    const reconciled =
      hasExcel || hasEpf || hasEsic
        ? reconcileAuditData({
            excelRows: ws.excelRows,
            epfRows: ws.epfRows,
            esicRows: ws.esicRows,
            settings: DEFAULT_SETTINGS,
            hasExcel,
            hasEpf,
            hasEsic,
          })
        : { records: [], manualCandidates: [] };

    return res.json({
      hasRealData: hasExcel || hasEpf || hasEsic,
      docs: ws.docs,
      records: reconciled.records,
      manualCandidates: reconciled.manualCandidates,
    });
  }));

  // Run full cross-verification on uploaded files for a period
  app.post('/api/audit/verify', asyncRoute(async (request, res) => {
    const req = request as AuditRequest;
    const periodId = String(req.body?.periodId ?? 'oct-2026');
    const settings: AuditSettings = {
      ...DEFAULT_SETTINGS,
      ...(req.body?.settings ?? {}),
    };
    const clientId = await getClientIdForRequest(req, res);
    if (!clientId) return;
    const ws = await getWorkspace(clientId, periodId);

    const hasExcel = Boolean(ws.docs.excel);
    const hasEpf = Boolean(ws.docs.epf);
    const hasEsic = Boolean(ws.docs.esic);

    if (!hasExcel && !hasEpf && !hasEsic) {
      return res.json({
        hasRealData: false,
        docs: ws.docs,
        records: [],
        manualCandidates: [],
      });
    }

    const reconciled = reconcileAuditData({
      excelRows: ws.excelRows,
      epfRows: ws.epfRows,
      esicRows: ws.esicRows,
      settings,
      hasExcel,
      hasEpf,
      hasEsic,
    });

    return res.json({
      hasRealData: true,
      docs: ws.docs,
      records: reconciled.records,
      manualCandidates: reconciled.manualCandidates,
    });
  }));

  // Re-evaluate records immediately whenever threshold or matching settings change
  app.post('/api/audit/recompute', asyncRoute(async (request, res) => {
    const req = request as AuditRequest;
    const periodId = String(req.body?.periodId ?? 'oct-2026');
    const settings: AuditSettings = {
      ...DEFAULT_SETTINGS,
      ...(req.body?.settings ?? {}),
    };
    const clientRecords = Array.isArray(req.body?.records)
      ? (req.body.records as EmployeeAuditRecord[])
      : null;

    const clientId = await getClientIdForRequest(req, res);
    if (!clientId) return;
    const ws = await getWorkspace(clientId, periodId);
    const hasExcel = Boolean(ws.docs.excel);
    const hasEpf = Boolean(ws.docs.epf);
    const hasEsic = Boolean(ws.docs.esic);

    if (hasExcel || hasEpf || hasEsic) {
      const reconciled = reconcileAuditData({
        excelRows: ws.excelRows,
        epfRows: ws.epfRows,
        esicRows: ws.esicRows,
        settings,
        hasExcel,
        hasEpf,
        hasEsic,
      });

      const clientById = new Map<string, EmployeeAuditRecord>();
      if (clientRecords) {
        for (const cr of clientRecords) {
          clientById.set(cr.id, cr);
        }
      }

      const mergedRecords = reconciled.records.map((rec) => {
        const cr = clientById.get(rec.id);
        if (!cr) return rec;
        if (cr.flagReason.startsWith('Manually approved match')) {
          return classifyRecordWithSettings(
            {
              ...rec,
              uan: cr.uan ?? rec.uan,
              ipNumber: cr.ipNumber ?? rec.ipNumber,
              epfEE: cr.epfEE ?? rec.epfEE,
              esicIP: cr.esicIP ?? rec.esicIP,
              matchConfidence: 100,
              flagReason: cr.flagReason,
            },
            settings,
            { hasEpf, hasEsic }
          );
        }
        if (cr.flagReason.includes('rejected during manual review')) {
          return {
            ...rec,
            status: 'Mismatch' as const,
            flagReason: cr.flagReason,
          };
        }
        return rec;
      });

      return res.json({
        hasRealData: true,
        records: mergedRecords,
        manualCandidates: reconciled.manualCandidates,
      });
    }

    if (clientRecords) {
      const updated = clientRecords.map((rec) =>
        classifyRecordWithSettings(rec, settings, { hasEpf: true, hasEsic: true })
      );
      return res.json({
        hasRealData: false,
        records: updated,
      });
    }

    return res.json({ hasRealData: false, records: [] });
  }));

  // Clear uploaded workspace to restore demo mode if requested
  app.post('/api/audit/reset-demo', asyncRoute(async (request, res) => {
    const req = request as AuditRequest;
    if (req.auditIdentity?.role !== 'owner') {
      return res.status(403).json({ error: 'Only the auditor can clear uploaded source files.' });
    }
    const periodId = String(req.body?.periodId ?? 'oct-2026');
    const clientId = await getClientIdForRequest(req, res);
    if (!clientId) return;
    await removeWorkspace(clientId, periodId);
    res.json({ ok: true });
  }));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    console.error('[request error]', error);
    if (!response.headersSent) {
      response.status(500).json({ error: 'The request could not be completed. Please try again.' });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.get('/', asyncRoute(async (request, response) => {
      const indexHtml = await readFile(path.join(process.cwd(), 'index.html'), 'utf8');
      const htmlWithConfig = indexHtml.replace('</head>', getRuntimeConfigScript() + '</head>');
      const transformedHtml = await vite.transformIndexHtml(request.originalUrl, htmlWithConfig);
      return response
        .type('html')
        .set('Cache-Control', 'no-store')
        .send(transformedHtml);
    }));
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const sendAppShell = asyncRoute(async (_request, response) => {
      const runtimeScript = getRuntimeConfigScript();
      const indexHtml = await readFile(path.join(distDir, 'index.html'), 'utf8');
      return response
        .type('html')
        .set('Cache-Control', 'no-store')
        .send(indexHtml.replace('</head>', runtimeScript + '</head>'));
    });
    app.get('/', sendAppShell);
    app.use(express.static(distDir));
    app.get('*', sendAppShell);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`AUDITLY server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

