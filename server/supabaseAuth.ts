const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface SupabaseUserIdentity {
  uid: string;
  email: string;
  emailConfirmed: boolean;
  displayName?: string;
}

interface SupabaseUserResponse {
  id?: string;
  email?: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
}

interface SupabaseErrorResponse {
  message?: string;
  msg?: string;
  error?: string;
  error_description?: string;
}

async function callSupabaseAuth<T>(
  endpoint: string,
  apiKey: string,
  init: RequestInit = {}
): Promise<T> {
  if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured.');
  if (!apiKey) throw new Error('The required Supabase API key is not configured.');

  const headers = new Headers(init.headers);
  headers.set('apikey', apiKey);
  if (apiKey.startsWith('eyJ') && !headers.has('Authorization')) {
    // Legacy anon/service_role keys are JWTs and still need the bearer header.
    // New sb_publishable/sb_secret keys are opaque and must only use apikey.
    headers.set('Authorization', `Bearer ${apiKey}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/${endpoint}`, { ...init, headers });
  const result = (await response.json().catch(() => ({}))) as T & SupabaseErrorResponse;
  if (!response.ok) {
    throw new Error(
      result.message ?? result.msg ?? result.error_description ?? result.error ??
      `Supabase authentication request failed (${response.status}).`
    );
  }
  return result;
}

function toIdentity(user: SupabaseUserResponse): SupabaseUserIdentity {
  if (!user.id || !user.email) throw new Error('Supabase did not return a valid user.');
  const metadata = user.user_metadata ?? {};
  const displayName = metadata.display_name ?? metadata.name;
  return {
    uid: user.id,
    email: user.email,
    emailConfirmed: Boolean(user.email_confirmed_at),
    ...(typeof displayName === 'string' && displayName ? { displayName } : {}),
  };
}

export async function verifySupabaseAccessToken(accessToken: string): Promise<SupabaseUserIdentity> {
  if (!publishableKey) throw new Error('SUPABASE_PUBLISHABLE_KEY is not configured.');
  const user = await callSupabaseAuth<SupabaseUserResponse>('user', publishableKey, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return toIdentity(user);
}

export async function createSupabaseUser(
  email: string,
  password: string,
  displayName: string
): Promise<SupabaseUserIdentity> {
  if (!secretKey) throw new Error('SUPABASE_SECRET_KEY is not configured.');
  const user = await callSupabaseAuth<SupabaseUserResponse>('admin/users', secretKey, {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    }),
  });
  return toIdentity(user);
}

export async function deleteSupabaseUser(uid: string): Promise<void> {
  if (!secretKey) throw new Error('SUPABASE_SECRET_KEY is not configured.');
  await callSupabaseAuth<unknown>(`admin/users/${encodeURIComponent(uid)}`, secretKey, {
    method: 'DELETE',
  });
}

export async function updateSupabasePassword(uid: string, password: string): Promise<void> {
  if (!secretKey) throw new Error('SUPABASE_SECRET_KEY is not configured.');
  await callSupabaseAuth<unknown>(`admin/users/${encodeURIComponent(uid)}`, secretKey, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  });
}

export function getSupabasePublishableKey(): string | undefined {
  return publishableKey;
}

export function getSupabaseUrl(): string | undefined {
  return supabaseUrl;
}

export const isSupabaseAuthConfigured = Boolean(supabaseUrl && publishableKey);
