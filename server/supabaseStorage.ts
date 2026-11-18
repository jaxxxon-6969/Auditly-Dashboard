const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.AUDITLY_STORAGE_BUCKET;

function requireStorageConfig(): { url: string; key: string; bucket: string } {
  if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured.');
  if (!secretKey) throw new Error('SUPABASE_SECRET_KEY is not configured.');
  if (!bucketName) throw new Error('AUDITLY_STORAGE_BUCKET is not configured.');
  return { url: supabaseUrl, key: secretKey, bucket: bucketName };
}

function getObjectUrl(url: string, bucket: string, objectName: string): string {
  const encodedPath = objectName.split('/').map(encodeURIComponent).join('/');
  return `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
}

function apiHeaders(key: string): Headers {
  // Supabase publishable and secret keys belong in `apikey`; they are not JWT bearer tokens.
  return new Headers({ apikey: key });
}

function isMissingObject(status: number, body: string): boolean {
  // Supabase can report a missing object as 400 with "not found" in the body.
  return status === 404 || (status === 400 && /not.?found/i.test(body));
}

export async function readSupabaseJson<T>(objectName: string): Promise<T | null> {
  const { url, key, bucket } = requireStorageConfig();
  const response = await fetch(getObjectUrl(url, bucket, objectName), {
    headers: apiHeaders(key),
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (isMissingObject(response.status, body)) return null;
    console.error('[storage read]', objectName, response.status, body);
    throw new Error(`Could not read protected Auditly storage (${response.status}).`);
  }
  return (await response.json()) as T;
}

export async function writeSupabaseJson(objectName: string, value: unknown): Promise<void> {
  const { url, key, bucket } = requireStorageConfig();
  const headers = apiHeaders(key);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('x-upsert', 'true');
  const response = await fetch(getObjectUrl(url, bucket, objectName), {
    method: 'POST',
    headers,
    body: JSON.stringify(value),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[storage write]', objectName, response.status, body);
    throw new Error(`Could not save protected Auditly data (${response.status}).`);
  }
}

export async function deleteSupabaseObject(objectName: string): Promise<void> {
  const { url, key, bucket } = requireStorageConfig();
  const headers = apiHeaders(key);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ prefixes: [objectName] }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (isMissingObject(response.status, body)) return;
    console.error('[storage delete]', objectName, response.status, body);
    throw new Error(`Could not remove protected Auditly data (${response.status}).`);
  }
}

export const isSupabaseStorageConfigured = Boolean(supabaseUrl && secretKey && bucketName);