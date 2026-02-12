import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const DEFAULT_LIMIT = 10000;
const MAX_LIMIT = 50000;
const DEFAULT_TIMEOUT_MS = 180000;

const PDF_SIGNATURE = '%PDF-';
const PYTHON_BIN_CANDIDATES = ['python3', 'python'];

export type NaturaMagazineProductCandidate = {
  code: string;
  name: string | null;
  price: number | null;
  page: number | null;
};

type ExtractNaturaMagazineOptions = {
  pdfPath?: string;
  pdfUrl?: string;
  pdfHeaders?: Record<string, string>;
  limit?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type ExtractedPayload = {
  data?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
  error?: string;
  message?: string;
};

const normalizeText = (value?: string | null) =>
  (value || '')
    .replace(/\s+/g, ' ')
    .trim();

const toSafeLimit = (value?: number) => {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(Number(value))));
};

const resolveExtractorScriptPath = () => {
  const candidates = [
    path.resolve(process.cwd(), 'scripts/extract_natura_magazine.py'),
    path.resolve(__dirname, '../../../../scripts/extract_natura_magazine.py'),
    path.resolve(__dirname, '../../../scripts/extract_natura_magazine.py')
  ];

  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error('natura_magazine_extractor_not_found');
  }

  return resolved;
};

const parseExtractorPayload = (stdout: string): ExtractedPayload => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('natura_magazine_empty_output');
  }

  try {
    return JSON.parse(trimmed) as ExtractedPayload;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as ExtractedPayload;
      } catch {
        // keep default error below
      }
    }
    throw new Error('natura_magazine_invalid_output');
  }
};

const toCandidate = (raw: Record<string, unknown>): NaturaMagazineProductCandidate | null => {
  const rawCode = normalizeText(typeof raw.code === 'string' ? raw.code : String(raw.code || ''));
  const code = rawCode.replace(/\D+/g, '');
  if (!code) return null;

  const nameValue = normalizeText(typeof raw.name === 'string' ? raw.name : '');
  const name = nameValue || null;
  const price =
    typeof raw.price === 'number' && Number.isFinite(raw.price)
      ? raw.price
      : typeof raw.price === 'string'
        ? (() => {
            const normalized = raw.price
              .replace(/[^\d,.-]/g, '')
              .replace(/\./g, '')
              .replace(',', '.');
            const parsed = Number(normalized);
            return Number.isFinite(parsed) ? parsed : null;
          })()
        : null;
  const page =
    typeof raw.page === 'number' && Number.isFinite(raw.page)
      ? Math.max(1, Math.trunc(raw.page))
      : null;

  return {
    code,
    name,
    price,
    page
  };
};

const scoreCandidate = (item: NaturaMagazineProductCandidate) =>
  (item.name ? 2 : 0) + (item.price !== null ? 2 : 0) + (item.page !== null ? 1 : 0);

const dedupeCandidates = (items: NaturaMagazineProductCandidate[]) => {
  const deduped = new Map<string, NaturaMagazineProductCandidate>();
  items.forEach((item) => {
    const current = deduped.get(item.code);
    if (!current || scoreCandidate(item) > scoreCandidate(current)) {
      deduped.set(item.code, item);
    }
  });
  return Array.from(deduped.values()).sort((a, b) => a.code.localeCompare(b.code));
};

const assertPdfFile = async (filePath: string) => {
  const buffer = await readFile(filePath);
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('utf8') !== PDF_SIGNATURE) {
    throw new Error('natura_magazine_not_pdf');
  }
};

const downloadPdfToTemp = async ({
  pdfUrl,
  pdfHeaders,
  signal
}: {
  pdfUrl: string;
  pdfHeaders?: Record<string, string>;
  signal?: AbortSignal;
}) => {
  const response = await fetch(pdfUrl, {
    method: 'GET',
    headers: pdfHeaders,
    signal
  });

  if (!response.ok) {
    throw new Error(`natura_magazine_http_${response.status}`);
  }

  const content = Buffer.from(await response.arrayBuffer());
  if (content.length < 5 || content.subarray(0, 5).toString('utf8') !== PDF_SIGNATURE) {
    throw new Error('natura_magazine_not_pdf');
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'revendis-natura-magazine-'));
  const filePath = path.join(dir, 'catalogue.pdf');
  await writeFile(filePath, content);

  return {
    localPdfPath: filePath,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    }
  };
};

const runExtractor = async ({
  pythonBin,
  scriptPath,
  pdfPath,
  limit,
  timeoutMs,
  signal
}: {
  pythonBin: string;
  scriptPath: string;
  pdfPath: string;
  limit: number;
  timeoutMs: number;
  signal?: AbortSignal;
}) =>
  execFileAsync(
    pythonBin,
    [scriptPath, '--pdf', pdfPath, '--limit', String(limit)],
    {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      signal
    }
  );

export const extractNaturaMagazineProducts = async ({
  pdfPath,
  pdfUrl,
  pdfHeaders,
  limit = DEFAULT_LIMIT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal
}: ExtractNaturaMagazineOptions): Promise<{
  products: NaturaMagazineProductCandidate[];
  meta: Record<string, unknown>;
  source: { type: 'path' | 'url'; value: string };
}> => {
  const sourcePath = normalizeText(pdfPath);
  const sourceUrl = normalizeText(pdfUrl);
  if (!sourcePath && !sourceUrl) {
    throw new Error('natura_magazine_missing_source');
  }

  const safeLimit = toSafeLimit(limit);
  const safeTimeoutMs = Math.max(10000, Number.isFinite(timeoutMs) ? Math.trunc(timeoutMs) : DEFAULT_TIMEOUT_MS);
  const scriptPath = resolveExtractorScriptPath();

  let localPdfPath = '';
  let cleanupTemp: (() => Promise<void>) | null = null;

  try {
    if (sourceUrl) {
      const downloaded = await downloadPdfToTemp({
        pdfUrl: sourceUrl,
        pdfHeaders,
        signal
      });
      localPdfPath = downloaded.localPdfPath;
      cleanupTemp = downloaded.cleanup;
    } else {
      localPdfPath = path.resolve(sourcePath);
      if (!existsSync(localPdfPath)) {
        throw new Error('natura_magazine_pdf_not_found');
      }
      await assertPdfFile(localPdfPath);
    }

    const pythonBins = Array.from(
      new Set(
        [normalizeText(process.env.PYTHON_BIN || ''), ...PYTHON_BIN_CANDIDATES].filter(Boolean)
      )
    );

    let stdout = '';
    let parserError: unknown = null;

    for (const pythonBin of pythonBins) {
      try {
        const result = await runExtractor({
          pythonBin,
          scriptPath,
          pdfPath: localPdfPath,
          limit: safeLimit,
          timeoutMs: safeTimeoutMs,
          signal
        });
        stdout = result.stdout || '';
        parserError = null;
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          parserError = error;
          continue;
        }
        throw error;
      }
    }

    if (parserError) {
      throw new Error('natura_magazine_python_not_found');
    }

    const payload = parseExtractorPayload(stdout);
    if (payload.error) {
      throw new Error(payload.message ? `${payload.error}: ${payload.message}` : payload.error);
    }

    const rawData = Array.isArray(payload.data) ? payload.data : [];
    const parsed = dedupeCandidates(
      rawData
        .map((entry) => (entry && typeof entry === 'object' ? toCandidate(entry) : null))
        .filter((entry): entry is NaturaMagazineProductCandidate => entry !== null)
    ).slice(0, safeLimit);

    return {
      products: parsed,
      meta: payload.meta || {},
      source: sourceUrl
        ? {
            type: 'url',
            value: sourceUrl
          }
        : {
            type: 'path',
            value: sourcePath
          }
    };
  } finally {
    if (cleanupTemp) {
      await cleanupTemp();
    }
  }
};

