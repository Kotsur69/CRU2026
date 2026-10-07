import path from "path";
import { mimeFor } from "./mime";
import {
  StorageBackendError,
  StorageUnavailableError,
  type StorageAdapter,
  type StoredObject,
} from "./types";

/**
 * Read-only storage on a SharePoint document library (or OneDrive for Business),
 * through Microsoft Graph with app-only credentials (client credentials flow).
 *
 * Required Entra ID setup (company IT): an app registration with the Graph
 * application permission `Sites.Selected` and a `read` grant on the one site that
 * holds the files. The app can then read that site and nothing else.
 *
 * Keys are the same as in the Attachment table (`attachments/<md5>.<ext>`) and map to
 * `<library root>/<rootFolder>/<key>`, so the folder copied from the Bytom export can
 * be uploaded as-is. Uploads and deletes are not enabled yet: put/remove answer
 * StorageUnavailableError, which routes turn into a 503 message.
 */

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const REQUEST_TIMEOUT_MS = 10_000;
/** Renew the app token this long before Entra says it expires. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
/** One path segment of a key: no separators, no Windows-reserved characters, not "."/"..". */
// eslint-disable-next-line no-control-regex
const KEY_SEGMENT = /^(?!\.{1,2}$)[^/\\:*?"<>|\x00-\x1f]{1,200}$/;
/** Listing guard: 100 pages × 999 items covers the 39k-file export with room to spare. */
const MAX_LIST_PAGES = 100;
/** Legacy keys are md5 stems; only those are unique enough for the fallback search. */
const MD5_STEM = /^[a-f0-9]{32}$/i;

export interface SharePointConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Site that holds the library, e.g. https://contoso.sharepoint.com/sites/CRU2026 */
  siteUrl: string;
  /** Folder inside the site's default library that contains `attachments/`; "" = library root. */
  rootFolder: string;
}

interface DriveItem {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  parentReference?: { path?: string };
  "@microsoft.graph.downloadUrl"?: string;
}

interface DriveItemPage {
  value?: DriveItem[];
  "@odata.nextLink"?: string;
}

/** Reads the adapter config from the environment; names every missing variable. */
export function sharePointConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SharePointConfig {
  const required = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_SITE_URL"];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`STORAGE_DRIVER=sharepoint needs: ${missing.join(", ")}`);
  }
  return {
    tenantId: env.GRAPH_TENANT_ID!.trim(),
    clientId: env.GRAPH_CLIENT_ID!.trim(),
    clientSecret: env.GRAPH_CLIENT_SECRET!.trim(),
    siteUrl: env.GRAPH_SITE_URL!.trim(),
    rootFolder: env.GRAPH_ROOT_FOLDER?.trim() ?? "",
  };
}

/** Splits a storage key into validated segments; throws on anything that could escape the root. */
function keySegments(key: string): string[] {
  const segments = key.split("/");
  if (!segments.every((segment) => KEY_SEGMENT.test(segment))) {
    throw new Error(`Niedozwolony klucz storage: ${key}`);
  }
  return segments;
}

function encodePath(segments: string[]): string {
  return segments.map(encodeURIComponent).join("/");
}

/** Graph path of the site's default library, from its URL. */
function siteDrivePath(siteUrl: string): string {
  const url = new URL(siteUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".sharepoint.com")) {
    throw new Error("GRAPH_SITE_URL must be an https://<tenant>.sharepoint.com address");
  }
  const sitePath = url.pathname.replace(/\/+$/, "");
  return sitePath
    ? `/sites/${url.hostname}:${sitePath}:/drive?$select=id`
    : `/sites/${url.hostname}/drive?$select=id`;
}

function toStoredObject(key: string, item: DriveItem): StoredObject {
  // Name and type come from the KEY, as in the local adapter: where legacy mangled an
  // extension on disk the key still carries the true one.
  const filename = path.posix.basename(key);
  return {
    key,
    filename,
    sizeBytes: item.size,
    mimeType: mimeFor(filename),
    modifiedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : undefined,
  };
}

export class SharePointStorageAdapter implements StorageAdapter {
  private readonly config: SharePointConfig;
  private readonly rootSegments: string[];
  private readonly drivePath: string;
  private token: { value: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;
  private driveIdRequest: Promise<string> | null = null;

  constructor(config: SharePointConfig) {
    this.config = config;
    this.rootSegments = config.rootFolder.split("/").filter(Boolean);
    if (!this.rootSegments.every((segment) => KEY_SEGMENT.test(segment))) {
      throw new Error("GRAPH_ROOT_FOLDER contains an invalid path segment");
    }
    this.drivePath = siteDrivePath(config.siteUrl);
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.token.value;
    }
    // Concurrent requests share one token call instead of each asking Entra.
    this.tokenRequest ??= this.requestToken().finally(() => {
      this.tokenRequest = null;
    });
    return this.tokenRequest;
  }

  private async requestToken(): Promise<string> {
    const { tenantId, clientId, clientSecret } = this.config;
    let res: Response;
    try {
      res = await fetch(
        `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            scope: "https://graph.microsoft.com/.default",
            grant_type: "client_credentials",
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch (err) {
      throw new StorageBackendError("Entra ID token endpoint unreachable", { cause: err });
    }
    if (!res.ok) {
      throw new StorageBackendError(`Entra ID refused the app token (HTTP ${res.status})`);
    }
    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
      throw new StorageBackendError("Entra ID token response is malformed");
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  /** Authenticated Graph GET. 404 → null; any other failure → StorageBackendError. */
  private async graph<T>(pathOrUrl: string): Promise<T | null> {
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_ROOT}${pathOrUrl}`;
    // Paging links come from the response; never send the token anywhere but Graph.
    if (!url.startsWith(`${GRAPH_ROOT}/`)) {
      throw new StorageBackendError("Refusing to call a non-Graph URL");
    }
    const token = await this.accessToken();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new StorageBackendError("Microsoft Graph unreachable", { cause: err });
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new StorageBackendError(`Microsoft Graph answered HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  private driveId(): Promise<string> {
    this.driveIdRequest ??= (async () => {
      const drive = await this.graph<{ id?: unknown }>(this.drivePath);
      if (!drive || typeof drive.id !== "string") {
        throw new StorageBackendError("SharePoint site or its document library not found");
      }
      return drive.id;
    })().catch((err: unknown) => {
      // Do not cache a failure: the next request retries the lookup.
      this.driveIdRequest = null;
      throw err;
    });
    return this.driveIdRequest;
  }

  /** The drive item backing `key`, or null when it does not exist (or is not a file). */
  private async item(key: string): Promise<DriveItem | null> {
    const segments = keySegments(key);
    const driveId = await this.driveId();
    const exact = await this.graph<DriveItem>(
      `/drives/${driveId}/root:/${encodePath([...this.rootSegments, ...segments])}`,
    );
    if (exact) return exact.file ? exact : null;
    return this.itemByStem(driveId, segments);
  }

  /**
   * Same fallback as the local adapter: a few legacy uploads were written with a
   * mangled extension (`…5d3d.A` instead of `…5d3d.pdf`). The md5 stem is unique across
   * the export, so a search by stem within the same folder finds the real file.
   */
  private async itemByStem(driveId: string, segments: string[]): Promise<DriveItem | null> {
    const stem = segments[segments.length - 1].split(".")[0];
    if (!MD5_STEM.test(stem)) return null;

    const found = await this.graph<DriveItemPage>(
      `/drives/${driveId}/root/search(q='${stem}')?$select=id,name,file,parentReference`,
    );
    const folder = [...this.rootSegments, ...segments.slice(0, -1)].join("/");
    const match = found?.value?.find((candidate) => {
      const parent = decodeURIComponent(candidate.parentReference?.path ?? "");
      return (
        Boolean(candidate.file) &&
        candidate.name.split(".")[0] === stem &&
        parent.endsWith(folder ? `root:/${folder}` : "root:")
      );
    });
    if (!match) return null;
    // Search results carry no download URL; fetch the full item.
    return this.graph<DriveItem>(`/drives/${driveId}/items/${encodeURIComponent(match.id)}`);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.item(key)) !== null;
  }

  async stat(key: string): Promise<StoredObject | null> {
    const item = await this.item(key);
    return item ? toStoredObject(key, item) : null;
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const segments = prefix ? keySegments(prefix) : [];
    const driveId = await this.driveId();
    const folder = [...this.rootSegments, ...segments];
    const select = "$select=name,size,file,lastModifiedDateTime&$top=999";
    let next: string | null = folder.length
      ? `/drives/${driveId}/root:/${encodePath(folder)}:/children?${select}`
      : `/drives/${driveId}/root/children?${select}`;

    const out: StoredObject[] = [];
    for (let pages = 0; next; pages++) {
      // A paging link that never ends would otherwise loop until memory runs out.
      if (pages >= MAX_LIST_PAGES) {
        throw new StorageBackendError(`Listing exceeded ${MAX_LIST_PAGES} pages`);
      }
      const page: DriveItemPage | null = await this.graph<DriveItemPage>(next);
      if (!page) break;
      for (const item of page.value ?? []) {
        if (item.file) out.push(toStoredObject(prefix ? `${prefix}/${item.name}` : item.name, item));
      }
      next = page["@odata.nextLink"] ?? null;
    }
    return out;
  }

  async getBuffer(key: string): Promise<Buffer> {
    const url = await this.getDirectDownloadUrl(key);
    if (!url) throw new Error(`Brak pliku w storage: ${key}`);
    let res: Response;
    try {
      // Pre-authenticated URL: it must NOT carry our Graph token.
      res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new StorageBackendError("SharePoint download unreachable", { cause: err });
    }
    if (!res.ok) throw new StorageBackendError(`SharePoint download answered HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async getDownloadUrl(key: string): Promise<string> {
    // Links in the UI always go through the session-checking route.
    return `/api/files/${encodeURIComponent(key)}`;
  }

  async getDirectDownloadUrl(key: string): Promise<string | null> {
    const item = await this.item(key);
    if (!item) return null;
    const url = item["@microsoft.graph.downloadUrl"];
    if (typeof url !== "string" || !url.startsWith("https://")) {
      throw new StorageBackendError("Graph returned no download URL for an existing file");
    }
    return url;
  }

  async put(): Promise<string> {
    // Uploads need a write grant on the site; until then the form shows a 503 message.
    throw new StorageUnavailableError();
  }

  async remove(): Promise<void> {
    throw new StorageUnavailableError();
  }
}
