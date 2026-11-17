export interface AuditlyIdentity {
  uid: string;
  email: string;
  role: 'owner' | 'client';
  clientId?: string;
  clientName?: string;
  mustChangePassword?: boolean;
}

export interface ClientWorkspaceSummary {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface RuntimeConfig {
  authEnabled: boolean;
  supabaseUrl: string;
  supabasePublishableKey: string;
}

interface StoredCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

declare global {
  interface Window {
    AUDITLY_CONFIG?: RuntimeConfig;
  }
}

const CREDENTIALS_KEY = 'auditly:supabase-auth:v1';
const CLIENT_ID_KEY = 'auditly:selected-client:v1';

export const runtimeConfig: RuntimeConfig = window.AUDITLY_CONFIG ?? {
  authEnabled: false,
  supabaseUrl: '',
  supabasePublishableKey: '',
};

function getCredentials(): StoredCredentials | null {
  try {
    const raw = window.localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as StoredCredentials;
    return value.accessToken && value.refreshToken ? value : null;
  } catch {
    return null;
  }
}

function saveCredentials(value: StoredCredentials): void {
  window.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(value));
}

function getSelectedClientId(): string {
  try {
    return window.sessionStorage.getItem(CLIENT_ID_KEY) ?? '';
  } catch {
    return '';
  }
}

export function selectClientWorkspace(clientId: string | null): void {
  try {
    if (clientId) window.sessionStorage.setItem(CLIENT_ID_KEY, clientId);
    else window.sessionStorage.removeItem(CLIENT_ID_KEY);
  } catch {
    // The signed-in account remains the source of truth if browser storage is blocked.
  }
}

export function clearAuditlySignIn(): void {
  window.localStorage.removeItem(CREDENTIALS_KEY);
  selectClientWorkspace(null);
}

async function currentAccessToken(): Promise<string | null> {
  if (!runtimeConfig.authEnabled) return null;
  let credentials = getCredentials();
  if (!credentials) return null;
  if (credentials.expiresAt > Date.now() + 90_000) return credentials.accessToken;

  const response = await fetch(
    runtimeConfig.supabaseUrl.replace(/\/+$/, '') + '/auth/v1/token?grant_type=refresh_token',
    {
      method: 'POST',
      headers: {
        apikey: runtimeConfig.supabasePublishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: credentials.refreshToken }),
    }
  );
  const result = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!response.ok || !result.access_token || !result.refresh_token) {
    clearAuditlySignIn();
    return null;
  }
  credentials = {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000,
  };
  saveCredentials(credentials);
  return credentials.accessToken;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = await currentAccessToken();
  if (token) headers.set('Authorization', 'Bearer ' + token);
  const clientId = getSelectedClientId();
  if (clientId) headers.set('x-auditly-client-id', clientId);
  return fetch(input, { ...init, headers });
}

async function supabasePasswordSignIn(email: string, password: string) {
  if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabasePublishableKey) {
    throw new Error('Hosted sign-in is not configured.');
  }
  const response = await fetch(
    runtimeConfig.supabaseUrl.replace(/\/+$/, '') + '/auth/v1/token?grant_type=password',
    {
      method: 'POST',
      headers: {
        apikey: runtimeConfig.supabasePublishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    }
  );
  const result = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    msg?: string;
    message?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !result.access_token || !result.refresh_token) {
    const code = `${result.error ?? ''} ${result.error_description ?? ''} ${result.message ?? ''} ${result.msg ?? ''}`.toLowerCase();
    const message = code.includes('invalid_credentials') || code.includes('invalid login credentials')
      ? 'The email or password does not match.'
      : code.includes('too many') || response.status === 429
        ? 'Too many sign-in attempts. Wait a little and try again.'
        : code.includes('email not confirmed')
          ? 'Confirm this email address before signing in.'
          : 'Sign-in could not be completed. Check the account details and try again.';
    throw new Error(message);
  }
  saveCredentials({
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000,
  });
  return result;
}

export async function signInWithPassword(email: string, password: string): Promise<AuditlyIdentity> {
  await supabasePasswordSignIn(email, password);
  return getAuditlyIdentity();
}

export async function getAuditlyIdentity(): Promise<AuditlyIdentity> {
  const response = await apiFetch('/api/auth/session');
  const result = (await response.json()) as AuditlyIdentity | { error?: string } | null;
  if (!response.ok) {
    const message = result && 'error' in result ? result.error : undefined;
    throw new Error(message ?? 'Please sign in again.');
  }
  if (!result || !('role' in result)) throw new Error('Please sign in to continue.');
  return result;
}

export async function changeTemporaryPassword(password: string): Promise<void> {
  const response = await apiFetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'The password could not be changed.');
}

export async function listClientWorkspaces(): Promise<ClientWorkspaceSummary[]> {
  const response = await apiFetch('/api/admin/clients');
  const result = (await response.json()) as { clients?: ClientWorkspaceSummary[]; error?: string };
  if (!response.ok) throw new Error(result.error ?? 'Client workspaces could not be loaded.');
  return result.clients ?? [];
}

export async function createClientWorkspace(name: string, email: string): Promise<{
  client: ClientWorkspaceSummary;
  temporaryPassword: string;
}> {
  const response = await apiFetch('/api/admin/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  });
  const result = (await response.json()) as {
    client?: ClientWorkspaceSummary;
    temporaryPassword?: string;
    error?: string;
  };
  if (!response.ok || !result.client || !result.temporaryPassword) {
    throw new Error(result.error ?? 'Client workspace could not be created.');
  }
  return { client: result.client, temporaryPassword: result.temporaryPassword };
}

export async function loadRemoteWorkspace(): Promise<unknown | null> {
  const response = await apiFetch('/api/workspace/state');
  const result = (await response.json()) as { state?: unknown; error?: string };
  if (!response.ok) throw new Error(result.error ?? 'The saved client workspace could not be loaded.');
  return result.state ?? null;
}

export async function saveRemoteWorkspace(state: unknown): Promise<void> {
  const response = await apiFetch('/api/workspace/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!response.ok) {
    const result = (await response.json()) as { error?: string };
    throw new Error(result.error ?? 'The client workspace could not be saved.');
  }
}
