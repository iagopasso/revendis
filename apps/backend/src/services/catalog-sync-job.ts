import { DEFAULT_ORG_ID, MUTATION_AUTH_TOKEN } from '../config';
import { query, withClient, withTransaction } from '../db';
import {
  CATALOG_BRANDS,
  CATALOG_BRAND_LABELS,
  resolveCatalogBrandSlug,
  type CatalogBrandSlug
} from './brand-catalog';

const LOCK_NAMESPACE = 'catalog-preloaded-sync';
const DEFAULT_FULL_SYNC_INTERVAL_HOURS = 24 * 7;
const DEFAULT_FAILED_RETRY_HOURS = 6;
const DEFAULT_PRELOAD_MAX_AGE_HOURS = 24 * 7;
const DEFAULT_PRELOAD_LIMIT = 10000;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const MAX_PRELOAD_MAX_AGE_HOURS = 24 * 30;

type SyncMetaPayload = {
  selectedBrands?: string[];
  syncedBrands?: string[];
  cachedBrands?: string[];
  upsertedProducts?: number;
  removedProducts?: number;
  sources?: Array<{
    brand?: string;
    source?: 'sample' | 'upstream';
    cacheHit?: boolean;
    count?: number;
  }>;
};

type SyncResponsePayload = {
  message?: string;
  meta?: SyncMetaPayload;
};

type CatalogSyncStateRow = {
  sourceBrand: string;
  nextRunAt: string | Date | null;
  lastStatus: string | null;
};

type CatalogSyncRunStatus = 'success' | 'failed' | 'skipped' | 'locked';

export type CatalogSyncRunMode = 'auto' | 'full' | 'incremental';
export type CatalogSyncTriggerSource = 'scheduled' | 'manual';

export type RunCatalogSyncJobInput = {
  organizationId?: string;
  triggerSource: CatalogSyncTriggerSource;
  mode?: CatalogSyncRunMode;
  requestedBrands?: string[] | null;
  allBrands?: boolean;
  reason?: string | null;
  initiatedBy?: string | null;
  baseUrl?: string | null;
  force?: boolean;
  maxAgeHours?: number;
};

export type CatalogSyncRunResult = {
  runId: string | null;
  status: CatalogSyncRunStatus;
  triggerType: string;
  organizationId: string;
  mode: CatalogSyncRunMode;
  fullSyncDue: boolean;
  requestedBrands: string[];
  selectedBrands: string[];
  syncedBrands: string[];
  cachedBrands: string[];
  durationMs: number;
  message: string;
  metrics: Record<string, unknown>;
};

const parsePositiveNumber = (
  value: string | undefined,
  fallback: number,
  {
    min = 1,
    max = Number.POSITIVE_INFINITY
  }: {
    min?: number;
    max?: number;
  } = {}
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const getFullSyncIntervalHours = () =>
  parsePositiveNumber(process.env.CATALOG_FULL_SYNC_INTERVAL_HOURS, DEFAULT_FULL_SYNC_INTERVAL_HOURS, {
    max: MAX_PRELOAD_MAX_AGE_HOURS
  });

const getFailedRetryHours = () =>
  parsePositiveNumber(process.env.CATALOG_FAILED_RETRY_HOURS, DEFAULT_FAILED_RETRY_HOURS, {
    max: MAX_PRELOAD_MAX_AGE_HOURS
  });

const getRequestTimeoutMs = () =>
  parsePositiveNumber(process.env.CATALOG_SYNC_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, {
    min: 1_000,
    max: 30 * 60 * 1000
  });

const sortBrands = (brands: CatalogBrandSlug[]) =>
  Array.from(new Set(brands)).sort((a, b) =>
    CATALOG_BRAND_LABELS[a].localeCompare(CATALOG_BRAND_LABELS[b], 'pt-BR')
  );

const parseRequestedBrands = (values?: string[] | null): CatalogBrandSlug[] => {
  if (!Array.isArray(values) || values.length === 0) return [];
  const parsed = values
    .map((value) => (typeof value === 'string' ? resolveCatalogBrandSlug(value.trim()) : null))
    .filter((value): value is CatalogBrandSlug => value !== null);
  return sortBrands(parsed);
};

const resolveConfiguredCatalogBrands = async (orgId: string): Promise<CatalogBrandSlug[]> => {
  const allowedBrands = new Set<CatalogBrandSlug>(CATALOG_BRANDS);
  const result = await query<{ sourceBrand: string | null }>(
    `SELECT source_brand AS "sourceBrand"
     FROM reseller_brands
     WHERE organization_id = $1
       AND source_brand IS NOT NULL`,
    [orgId]
  );

  const mapped = result.rows
    .map((row) => resolveCatalogBrandSlug(row.sourceBrand || ''))
    .filter((value): value is CatalogBrandSlug => value !== null)
    .filter((value) => allowedBrands.has(value));

  return sortBrands(mapped);
};

const resolveBaseUrl = ({ inputBaseUrl, fallbackPort }: { inputBaseUrl?: string | null; fallbackPort?: number }) => {
  const preferred = (inputBaseUrl || process.env.CATALOG_SYNC_BASE_URL || '').trim();
  if (preferred) return preferred.replace(/\/+$/, '');
  if (fallbackPort) return `http://127.0.0.1:${fallbackPort}`;
  return '';
};

const toIso = (value: Date) => value.toISOString();

const addHours = (base: Date, hours: number) => {
  const next = new Date(base);
  next.setHours(next.getHours() + hours);
  return next;
};

const hasDateExpired = (value: string | Date | null | undefined, nowMs: number) => {
  if (!value) return true;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return true;
  return time <= nowMs;
};

const extractSyncMessage = (payload: SyncResponsePayload | null) => payload?.message || 'Sync response error.';

const insertRun = async ({
  orgId,
  triggerType,
  status,
  requestedBrands,
  selectedBrands,
  metrics,
  errorMessage,
  startedAt,
  finishedAt,
  durationMs
}: {
  orgId: string;
  triggerType: string;
  status: string;
  requestedBrands: CatalogBrandSlug[];
  selectedBrands: CatalogBrandSlug[];
  metrics: Record<string, unknown>;
  errorMessage?: string | null;
  startedAt: Date;
  finishedAt?: Date | null;
  durationMs?: number | null;
}) => {
  const result = await query<{ id: string }>(
    `INSERT INTO catalog_sync_runs (
       organization_id,
       trigger_type,
       status,
       requested_brands,
       selected_brands,
       metrics,
       error_message,
       started_at,
       finished_at,
       duration_ms
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
     RETURNING id`,
    [
      orgId,
      triggerType,
      status,
      requestedBrands,
      selectedBrands,
      JSON.stringify(metrics),
      errorMessage || null,
      toIso(startedAt),
      finishedAt ? toIso(finishedAt) : null,
      durationMs ?? null
    ]
  );

  return result.rows[0]?.id || null;
};

const updateRun = async ({
  runId,
  status,
  syncedBrands,
  cachedBrands,
  metrics,
  errorMessage,
  finishedAt,
  durationMs
}: {
  runId: string;
  status: string;
  syncedBrands: CatalogBrandSlug[];
  cachedBrands: CatalogBrandSlug[];
  metrics: Record<string, unknown>;
  errorMessage?: string | null;
  finishedAt: Date;
  durationMs: number;
}) => {
  await query(
    `UPDATE catalog_sync_runs
     SET status = $2,
         synced_brands = $3,
         cached_brands = $4,
         metrics = $5::jsonb,
         error_message = $6,
         finished_at = $7,
         duration_ms = $8,
         updated_at = now()
     WHERE id = $1`,
    [
      runId,
      status,
      syncedBrands,
      cachedBrands,
      JSON.stringify(metrics),
      errorMessage || null,
      toIso(finishedAt),
      durationMs
    ]
  );
};

const markBrandsRunning = async ({
  orgId,
  brands,
  runId,
  now,
  fullSyncIntervalHours
}: {
  orgId: string;
  brands: CatalogBrandSlug[];
  runId: string;
  now: Date;
  fullSyncIntervalHours: number;
}) => {
  if (brands.length === 0) return;

  await withTransaction(async (client) => {
    for (const brand of brands) {
      await client.query(
        `INSERT INTO catalog_sync_state (
           organization_id,
           source_brand,
           last_run_id,
           last_attempt_at,
           last_status,
           last_error,
           full_sync_interval_hours
         )
         VALUES ($1, $2, $3, $4, $5, null, $6)
         ON CONFLICT (organization_id, source_brand)
         DO UPDATE SET
           last_run_id = EXCLUDED.last_run_id,
           last_attempt_at = EXCLUDED.last_attempt_at,
           last_status = EXCLUDED.last_status,
           last_error = null,
           full_sync_interval_hours = EXCLUDED.full_sync_interval_hours,
           updated_at = now()`,
        [orgId, brand, runId, toIso(now), 'running', fullSyncIntervalHours]
      );
    }
  });
};

const markBrandsFailed = async ({
  orgId,
  brands,
  runId,
  now,
  failureRetryHours,
  fullSyncIntervalHours,
  errorMessage
}: {
  orgId: string;
  brands: CatalogBrandSlug[];
  runId: string;
  now: Date;
  failureRetryHours: number;
  fullSyncIntervalHours: number;
  errorMessage: string;
}) => {
  if (brands.length === 0) return;
  const nextRunAt = addHours(now, failureRetryHours);

  await withTransaction(async (client) => {
    for (const brand of brands) {
      await client.query(
        `INSERT INTO catalog_sync_state (
           organization_id,
           source_brand,
           last_run_id,
           last_attempt_at,
           next_run_at,
           last_status,
           last_error,
           full_sync_interval_hours
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (organization_id, source_brand)
         DO UPDATE SET
           last_run_id = EXCLUDED.last_run_id,
           last_attempt_at = EXCLUDED.last_attempt_at,
           next_run_at = EXCLUDED.next_run_at,
           last_status = EXCLUDED.last_status,
           last_error = EXCLUDED.last_error,
           full_sync_interval_hours = EXCLUDED.full_sync_interval_hours,
           updated_at = now()`,
        [
          orgId,
          brand,
          runId,
          toIso(now),
          toIso(nextRunAt),
          'failed',
          errorMessage,
          fullSyncIntervalHours
        ]
      );
    }
  });
};

const markBrandsSuccess = async ({
  orgId,
  brands,
  runId,
  now,
  fullSyncIntervalHours
}: {
  orgId: string;
  brands: CatalogBrandSlug[];
  runId: string;
  now: Date;
  fullSyncIntervalHours: number;
}) => {
  if (brands.length === 0) return;
  const nextRunAt = addHours(now, fullSyncIntervalHours);

  await withTransaction(async (client) => {
    for (const brand of brands) {
      await client.query(
        `INSERT INTO catalog_sync_state (
           organization_id,
           source_brand,
           last_run_id,
           last_attempt_at,
           last_success_at,
           next_run_at,
           last_status,
           last_error,
           full_sync_interval_hours
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, null, $8)
         ON CONFLICT (organization_id, source_brand)
         DO UPDATE SET
           last_run_id = EXCLUDED.last_run_id,
           last_attempt_at = EXCLUDED.last_attempt_at,
           last_success_at = EXCLUDED.last_success_at,
           next_run_at = EXCLUDED.next_run_at,
           last_status = EXCLUDED.last_status,
           last_error = null,
           full_sync_interval_hours = EXCLUDED.full_sync_interval_hours,
           updated_at = now()`,
        [orgId, brand, runId, toIso(now), toIso(now), toIso(nextRunAt), 'success', fullSyncIntervalHours]
      );
    }
  });
};

const loadDueBrands = async ({
  orgId,
  candidateBrands,
  now
}: {
  orgId: string;
  candidateBrands: CatalogBrandSlug[];
  now: Date;
}) => {
  if (candidateBrands.length === 0) return [];

  const stateResult = await query<CatalogSyncStateRow>(
    `SELECT source_brand AS "sourceBrand",
            next_run_at AS "nextRunAt",
            last_status AS "lastStatus"
     FROM catalog_sync_state
     WHERE organization_id = $1
       AND source_brand = ANY($2::text[])`,
    [orgId, candidateBrands]
  );
  const stateMap = new Map(stateResult.rows.map((row) => [row.sourceBrand, row]));
  const nowMs = now.getTime();

  return candidateBrands.filter((brand) => {
    const row = stateMap.get(brand);
    if (!row) return true;
    if ((row.lastStatus || '').toLowerCase() === 'running') return false;
    return hasDateExpired(row.nextRunAt, nowMs);
  });
};

const isFullSyncDue = async ({
  orgId,
  fullSyncIntervalHours,
  now
}: {
  orgId: string;
  fullSyncIntervalHours: number;
  now: Date;
}) => {
  const result = await query<{ finishedAt: string | Date | null }>(
    `SELECT finished_at AS "finishedAt"
     FROM catalog_sync_runs
     WHERE organization_id = $1
       AND trigger_type IN ('scheduled_full', 'manual_full')
       AND status = 'success'
     ORDER BY finished_at DESC NULLS LAST
     LIMIT 1`,
    [orgId]
  );

  const lastFinishedAt = result.rows[0]?.finishedAt;
  if (!lastFinishedAt) return true;
  const cutoffMs = now.getTime() - fullSyncIntervalHours * 60 * 60 * 1000;
  const lastSyncMs = new Date(lastFinishedAt).getTime();
  return !Number.isFinite(lastSyncMs) || lastSyncMs < cutoffMs;
};

const callPreloadedSyncEndpoint = async ({
  orgId,
  selectedBrands,
  baseUrl,
  maxAgeHours
}: {
  orgId: string;
  selectedBrands: CatalogBrandSlug[];
  baseUrl: string;
  maxAgeHours: number;
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getRequestTimeoutMs());

  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-org-id': orgId
    };
    if (MUTATION_AUTH_TOKEN) {
      headers['x-mutation-token'] = MUTATION_AUTH_TOKEN;
    }

    const response = await fetch(`${baseUrl}/api/catalog/preloaded/sync`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        brands: selectedBrands,
        allBrands: false,
        inStockOnly: false,
        clearMissing: true,
        allowSampleFallback: true,
        limit: DEFAULT_PRELOAD_LIMIT,
        maxAgeHours,
        force: true
      })
    });

    const payload = (await response.json().catch(() => null)) as SyncResponsePayload | null;

    if (!response.ok) {
      throw new Error(
        `catalog/preloaded/sync failed (${response.status}): ${extractSyncMessage(payload)}`
      );
    }

    return payload || {};
  } finally {
    clearTimeout(timeout);
  }
};

const buildTriggerType = (
  triggerSource: CatalogSyncTriggerSource,
  effectiveMode: Exclude<CatalogSyncRunMode, 'auto'>
) => `${triggerSource}_${effectiveMode}`;

export const runCatalogPreloadedSyncJob = async (
  input: RunCatalogSyncJobInput
): Promise<CatalogSyncRunResult> => {
  const orgId = input.organizationId || DEFAULT_ORG_ID;
  const requestedMode = input.mode || 'auto';
  const force = typeof input.force === 'boolean' ? input.force : input.triggerSource === 'manual';
  const fullSyncIntervalHours = getFullSyncIntervalHours();
  const failedRetryHours = getFailedRetryHours();
  const requestedMaxAgeHours =
    typeof input.maxAgeHours === 'number' && Number.isFinite(input.maxAgeHours)
      ? Math.trunc(input.maxAgeHours)
      : fullSyncIntervalHours;
  const maxAgeHours = Math.min(
    MAX_PRELOAD_MAX_AGE_HOURS,
    Math.max(1, requestedMaxAgeHours || DEFAULT_PRELOAD_MAX_AGE_HOURS)
  );
  const now = new Date();
  const startedAt = new Date();

  const lockedResult = await withClient<CatalogSyncRunResult | null>(async (lockClient) => {
    const lock = await lockClient.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS locked`,
      [LOCK_NAMESPACE, orgId]
    );
    if (!lock.rows[0]?.locked) return null;

    try {
      const configuredBrands = await resolveConfiguredCatalogBrands(orgId);
      const configuredSet = new Set(configuredBrands);
      const requestedBrands = parseRequestedBrands(input.requestedBrands);
      const useAllBrands = input.allBrands === true;

      const baseRequestedBrands =
        useAllBrands
          ? configuredBrands
          : requestedBrands.length > 0
          ? requestedBrands.filter((brand) => configuredSet.has(brand))
          : configuredBrands;

      const requestedSelection = sortBrands(baseRequestedBrands);
      const hasConfiguredBrands = configuredBrands.length > 0;

      if (!hasConfiguredBrands || requestedSelection.length === 0) {
        const triggerType = buildTriggerType(input.triggerSource, requestedMode === 'full' ? 'full' : 'incremental');
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        const message = hasConfiguredBrands
          ? 'Nenhuma marca solicitada esta configurada para sincronizacao.'
          : 'Nenhuma marca configurada para sincronizacao.';
        const metrics = {
          reason: input.reason || null,
          initiatedBy: input.initiatedBy || null,
          allBrands: useAllBrands,
          configuredBrands: configuredBrands.length,
          requestedBrands: requestedBrands.length
        };
        const runId = await insertRun({
          orgId,
          triggerType,
          status: 'skipped',
          requestedBrands: requestedSelection,
          selectedBrands: [],
          metrics,
          errorMessage: message,
          startedAt,
          finishedAt,
          durationMs
        });

        return {
          runId,
          status: 'skipped' as const,
          triggerType,
          organizationId: orgId,
          mode: requestedMode,
          fullSyncDue: requestedMode === 'full',
          requestedBrands: requestedSelection,
          selectedBrands: [],
          syncedBrands: [],
          cachedBrands: [],
          durationMs,
          message,
          metrics
        };
      }

      const fullSyncDue =
        requestedMode === 'full'
          ? true
          : requestedMode === 'incremental'
            ? false
            : await isFullSyncDue({
                orgId,
                fullSyncIntervalHours,
                now
              });

      const effectiveMode: Exclude<CatalogSyncRunMode, 'auto'> = fullSyncDue ? 'full' : 'incremental';
      const triggerType = buildTriggerType(input.triggerSource, effectiveMode);

      const dueBrands =
        force || effectiveMode === 'full'
          ? requestedSelection
          : await loadDueBrands({
              orgId,
              candidateBrands: requestedSelection,
              now
            });

      if (dueBrands.length === 0) {
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        const message = 'Nenhuma marca pendente para sincronizacao neste ciclo.';
        const metrics = {
          reason: input.reason || null,
          initiatedBy: input.initiatedBy || null,
          allBrands: useAllBrands,
          fullSyncDue,
          force,
          configuredBrands: configuredBrands.length,
          requestedBrands: requestedSelection.length,
          dueBrands: 0
        };
        const runId = await insertRun({
          orgId,
          triggerType,
          status: 'skipped',
          requestedBrands: requestedSelection,
          selectedBrands: [],
          metrics,
          errorMessage: message,
          startedAt,
          finishedAt,
          durationMs
        });

        return {
          runId,
          status: 'skipped',
          triggerType,
          organizationId: orgId,
          mode: requestedMode,
          fullSyncDue,
          requestedBrands: requestedSelection,
          selectedBrands: [],
          syncedBrands: [],
          cachedBrands: [],
          durationMs,
          message,
          metrics
        };
      }

      const runId = await insertRun({
        orgId,
        triggerType,
        status: 'running',
        requestedBrands: requestedSelection,
        selectedBrands: dueBrands,
        metrics: {
          reason: input.reason || null,
          initiatedBy: input.initiatedBy || null,
          allBrands: useAllBrands,
          fullSyncDue,
          force,
          configuredBrands: configuredBrands.length,
          requestedBrands: requestedSelection.length,
          dueBrands: dueBrands.length
        },
        startedAt
      });

      if (!runId) {
        throw new Error('Nao foi possivel iniciar registro de sincronizacao.');
      }

      await markBrandsRunning({
        orgId,
        brands: dueBrands,
        runId,
        now,
        fullSyncIntervalHours
      });

      try {
        const baseUrl = resolveBaseUrl({
          inputBaseUrl: input.baseUrl,
          fallbackPort: Number(process.env.PORT || 3001) || 3001
        });
        if (!baseUrl) {
          throw new Error('Base URL do backend indisponivel para sincronizacao.');
        }

        // eslint-disable-next-line no-console
        console.log(
          `[catalog-sync] Iniciando run=${runId} tipo=${triggerType} marcas=${dueBrands.join(',') || '-'}`
        );

        const payload = await callPreloadedSyncEndpoint({
          orgId,
          selectedBrands: dueBrands,
          baseUrl,
          maxAgeHours
        });
        const syncedBrands = parseRequestedBrands(payload.meta?.syncedBrands || []);
        const cachedBrands = parseRequestedBrands(payload.meta?.cachedBrands || []);
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();

        const metrics = {
          reason: input.reason || null,
          initiatedBy: input.initiatedBy || null,
          allBrands: useAllBrands,
          fullSyncDue,
          force,
          maxAgeHours,
          configuredBrands: configuredBrands.length,
          requestedBrands: requestedSelection.length,
          dueBrands: dueBrands.length,
          selectedBrands: payload.meta?.selectedBrands?.length || dueBrands.length,
          syncedBrands: syncedBrands.length,
          cachedBrands: cachedBrands.length,
          upsertedProducts: Number(payload.meta?.upsertedProducts ?? 0) || 0,
          removedProducts: Number(payload.meta?.removedProducts ?? 0) || 0,
          sources: payload.meta?.sources || []
        };

        await markBrandsSuccess({
          orgId,
          brands: dueBrands,
          runId,
          now: finishedAt,
          fullSyncIntervalHours
        });

        await updateRun({
          runId,
          status: 'success',
          syncedBrands,
          cachedBrands,
          metrics,
          finishedAt,
          durationMs
        });

        const message = `Sincronizacao concluida para ${dueBrands.length} marca(s).`;
        // eslint-disable-next-line no-console
        console.log(
          `[catalog-sync] Sucesso run=${runId} marcas=${dueBrands.length} upserts=${metrics.upsertedProducts} removidos=${metrics.removedProducts} duracaoMs=${durationMs}`
        );

        return {
          runId,
          status: 'success',
          triggerType,
          organizationId: orgId,
          mode: requestedMode,
          fullSyncDue,
          requestedBrands: requestedSelection,
          selectedBrands: dueBrands,
          syncedBrands,
          cachedBrands,
          durationMs,
          message,
          metrics
        };
      } catch (error) {
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        const message =
          error instanceof Error ? error.message : 'Falha ao sincronizar catalogo no backend.';

        const metrics = {
          reason: input.reason || null,
          initiatedBy: input.initiatedBy || null,
          allBrands: useAllBrands,
          fullSyncDue,
          force,
          maxAgeHours,
          configuredBrands: configuredBrands.length,
          requestedBrands: requestedSelection.length,
          dueBrands: dueBrands.length
        };

        await markBrandsFailed({
          orgId,
          brands: dueBrands,
          runId,
          now: finishedAt,
          failureRetryHours: failedRetryHours,
          fullSyncIntervalHours,
          errorMessage: message
        });

        await updateRun({
          runId,
          status: 'failed',
          syncedBrands: [],
          cachedBrands: [],
          metrics,
          errorMessage: message,
          finishedAt,
          durationMs
        });

        // eslint-disable-next-line no-console
        console.error(`[catalog-sync] Falha run=${runId}: ${message}`);

        return {
          runId,
          status: 'failed',
          triggerType,
          organizationId: orgId,
          mode: requestedMode,
          fullSyncDue,
          requestedBrands: requestedSelection,
          selectedBrands: dueBrands,
          syncedBrands: [],
          cachedBrands: [],
          durationMs,
          message,
          metrics
        };
      }
    } finally {
      try {
        await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1), hashtext($2))`, [
          LOCK_NAMESPACE,
          orgId
        ]);
      } catch {
        // ignore unlock errors to avoid masking the sync result.
      }
    }
  });

  if (lockedResult) return lockedResult;

  return {
    runId: null,
    status: 'locked',
    triggerType: `${input.triggerSource}_${input.mode || 'auto'}`,
    organizationId: orgId,
    mode: input.mode || 'auto',
    fullSyncDue: false,
    requestedBrands: [],
    selectedBrands: [],
    syncedBrands: [],
    cachedBrands: [],
    durationMs: 0,
    message: 'Sincronizacao em execucao por outro processo.',
    metrics: {}
  };
};
