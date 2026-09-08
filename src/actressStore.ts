import browser from "webextension-polyfill";

export interface ActressRecord {
  id: string;
  name: string;
  otherNames: string[];
  postImage: string | null;
  cachedImage: string | null;
  isFavorite: boolean;
  createdAt: number;
}

const ACTRESSES_KEY = "prnlbActresses";

function normalizeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function decodeActress(value: unknown): ActressRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ActressRecord>;
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : createId(),
    name: raw.name.trim(),
    otherNames: normalizeNames(raw.otherNames),
    postImage: typeof raw.postImage === "string" && raw.postImage.trim() ? raw.postImage.trim() : null,
    cachedImage: typeof raw.cachedImage === "string" && raw.cachedImage.startsWith("data:image/") ? raw.cachedImage : null,
    isFavorite: raw.isFavorite === true,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function getActresses(): Promise<ActressRecord[]> {
  const stored = await browser.storage.local.get(ACTRESSES_KEY);
  const raw = stored[ACTRESSES_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map(decodeActress).filter((item): item is ActressRecord => item !== null);
}

async function saveAll(items: ActressRecord[]): Promise<void> {
  await browser.storage.local.set({ [ACTRESSES_KEY]: items });
}

export async function saveActress(input: {
  id?: string;
  name: string;
  otherNames?: unknown;
  postImage?: string | null;
  cachedImage?: string | null;
  isFavorite?: boolean;
}): Promise<ActressRecord> {
  const name = input.name.trim();
  if (!name) throw new RangeError("Name is required");
  const items = await getActresses();
  const existing = input.id ? items.find((item) => item.id === input.id) : undefined;
  const record: ActressRecord = {
    id: existing?.id ?? input.id ?? createId(),
    name,
    otherNames: normalizeNames(input.otherNames),
    postImage: typeof input.postImage === "string" && input.postImage.trim() ? input.postImage.trim() : null,
    cachedImage:
      input.cachedImage !== undefined
        ? (typeof input.cachedImage === "string" && input.cachedImage.startsWith("data:image/") ? input.cachedImage : null)
        : existing?.cachedImage ?? null,
    isFavorite: input.isFavorite ?? existing?.isFavorite ?? false,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  const next = existing ? items.map((item) => (item.id === record.id ? record : item)) : [...items, record];
  await saveAll(next);
  return record;
}

export async function deleteActress(id: string): Promise<boolean> {
  const items = await getActresses();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  await saveAll(next);
  return true;
}

export async function toggleActressFavorite(id: string): Promise<boolean | undefined> {
  const items = await getActresses();
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return undefined;
  item.isFavorite = !item.isFavorite;
  await saveAll(items);
  return item.isFavorite;
}

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsName(text: string, name: string): boolean {
  const normalized = name.trim();
  if (!normalized) return false;
  try {
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapedRegExp(normalized)}($|[^\\p{L}\\p{N}])`, "iu").test(text);
  } catch {
    return text.toLocaleLowerCase().includes(normalized.toLocaleLowerCase());
  }
}

export function findActressMatches(cast: string, actresses: ActressRecord[]): ActressRecord[] {
  if (!cast) return [];
  // A topic may contain several catalogue names. Favorites take precedence
  // so the first match is the one used for row highlighting.
  return [...actresses]
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))
    .filter((actress) => {
    const names = [actress.name, ...actress.otherNames].sort((a, b) => b.length - a.length);
      return names.some((name) => containsName(cast, name));
    });
}

export function findActressMatch(cast: string, actresses: ActressRecord[]): ActressRecord | null {
  return findActressMatches(cast, actresses)[0] ?? null;
}
