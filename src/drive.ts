const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
const MAX_RETRIES = 5;

export class DriveError extends Error {
  constructor(public status: number, public reason?: string) {
    super(`Drive ${status}${reason ? ` (${reason})` : ''}`);
    this.name = 'DriveError';
  }
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
}

export interface Drive {
  findOrCreateFolder(name: string, parentId?: string): Promise<string>;
  findFile(name: string, parentId: string): Promise<string | null>;
  readJson<T>(fileId: string): Promise<T>;
  writeJson(name: string, parentId: string, data: unknown, fileId?: string): Promise<string>;
  uploadBlob(name: string, parentId: string, blob: Blob): Promise<string>;
  downloadBlob(fileId: string, signal?: AbortSignal): Promise<Blob>;
  listChildren(folderId: string): Promise<DriveFile[]>;
  deleteFile(fileId: string): Promise<void>;
}

type GetToken = (o?: { forceRefresh?: boolean }) => Promise<string>;

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export function createDrive(
  getToken: GetToken,
  fetchFn: typeof fetch = (...a) => fetch(...a),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Drive {
  async function reasonOf(res: Response): Promise<string | undefined> {
    try {
      const j = await res.clone().json();
      return j?.error?.errors?.[0]?.reason ?? j?.error?.status;
    } catch {
      return undefined;
    }
  }

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    let token = await getToken();
    let refreshed = false;
    for (let attempt = 0; ; ) {
      const res = await fetchFn(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
      });
      if (res.ok) return res;
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        token = await getToken({ forceRefresh: true });
        continue;
      }
      const reason = await reasonOf(res);
      const retryable =
        res.status === 429 ||
        res.status >= 500 ||
        (res.status === 403 && (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded'));
      if (!retryable || attempt >= MAX_RETRIES) throw new DriveError(res.status, reason);
      const base = Math.min(500 * 2 ** attempt, 16000);
      await sleep(Math.min(base + Math.random() * base * 0.25, 16000));
      attempt++;
    }
  }

  const getJson = async <T>(url: string): Promise<T> => (await request(url)).json();

  async function find(q: string): Promise<string | null> {
    const r = await getJson<{ files?: { id: string }[] }>(
      `${API}?${new URLSearchParams({ q: `${q} and trashed=false`, fields: 'files(id,name,mimeType)', pageSize: '1' })}`,
    );
    return r.files?.[0]?.id ?? null;
  }

  function multipart(meta: object, blob: Blob): { body: Blob; headers: Record<string, string> } {
    const b = `cr${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${b}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
      blob,
      `\r\n--${b}--`,
    ]);
    return { body, headers: { 'Content-Type': `multipart/related; boundary=${b}` } };
  }

  async function create(name: string, parentId: string, blob: Blob): Promise<string> {
    const { body, headers } = multipart({ name, parents: [parentId] }, blob);
    const res = await request(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', headers, body });
    return (await res.json()).id;
  }

  return {
    async findFile(name, parentId) {
      return find(`name='${esc(name)}' and '${esc(parentId)}' in parents`);
    },

    async findOrCreateFolder(name, parentId) {
      const parent = parentId ? ` and '${esc(parentId)}' in parents` : '';
      const existing = await find(`name='${esc(name)}' and mimeType='${FOLDER}'${parent}`);
      if (existing) return existing;
      const res = await request(`${API}?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) }),
      });
      return (await res.json()).id;
    },

    readJson<T>(fileId: string) {
      return getJson<T>(`${API}/${encodeURIComponent(fileId)}?alt=media`);
    },

    async writeJson(name, parentId, data, fileId) {
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      if (!fileId) return create(name, parentId, blob);
      await request(`${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: blob,
      });
      return fileId;
    },

    uploadBlob: create,

    async downloadBlob(fileId, signal) {
      return (await request(`${API}/${encodeURIComponent(fileId)}?alt=media`, { signal })).blob();
    },

    async listChildren(folderId) {
      const out: DriveFile[] = [];
      let pageToken: string | undefined;
      do {
        const p = new URLSearchParams({
          q: `'${esc(folderId)}' in parents and trashed=false`,
          fields: 'nextPageToken,files(id,name,mimeType,createdTime)',
          pageSize: '1000',
        });
        if (pageToken) p.set('pageToken', pageToken);
        const r = await getJson<{ files?: DriveFile[]; nextPageToken?: string }>(`${API}?${p}`);
        out.push(...(r.files ?? []));
        pageToken = r.nextPageToken;
      } while (pageToken);
      return out;
    },

    async deleteFile(fileId) {
      await request(`${API}/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    },
  };
}
