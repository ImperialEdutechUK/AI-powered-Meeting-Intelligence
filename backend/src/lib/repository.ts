import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, queryOne } from './db';
import { BriefBundleSchema, type BriefBundle } from './brief-bundle';
import { isDepartmentId, type DepartmentId } from './departments';

/**
 * Brief persistence.
 *
 * Every row is validated against `BriefBundleSchema` on the way out as well as
 * in. A row written by an older build that no longer satisfies the schema is
 * reported as unreadable rather than rendered half-broken.
 */

export interface BriefRow {
  id: string;
  title: string;
  /** Primary department: theme, footer code and filing. */
  department: DepartmentId;
  /** Every department selected, primary first. */
  departments: DepartmentId[];
  dateLabel: string;
  meetingDate: string | null;
  groundingScore: number;
  findingsHigh: number;
  sourceFile: string;
  model: string;
  costUsd: number | null;
  createdBy: string;
  createdAt: string;
}

export interface BriefRecord extends BriefRow {
  bundle: BriefBundle;
}

const DbRow = z.object({
  id: z.string(),
  title: z.string(),
  department: z.string(),
  /** Extracted from the `bundle` JSONB column; null for briefs stored before multi-select existed. */
  departments: z.array(z.string()).nullable(),
  date_label: z.string(),
  meeting_date: z.union([z.string(), z.date(), z.null()]),
  grounding_score: z.number(),
  findings_high: z.number(),
  source_file: z.string(),
  model: z.string(),
  cost_usd: z.union([z.string(), z.number(), z.null()]),
  created_by: z.string(),
  created_at: z.union([z.string(), z.date()]),
});

type DbRowShape = z.infer<typeof DbRow>;

function isoOf(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function dateOnly(value: string | Date | null): string | null {
  if (value === null) return null;
  const iso = isoOf(value);
  return iso.slice(0, 10);
}

function toRow(raw: unknown): BriefRow {
  const parsed = DbRow.parse(raw) satisfies DbRowShape;
  const department = isDepartmentId(parsed.department)
    ? parsed.department
    : 'course-development';
  const departments = (parsed.departments ?? []).filter(isDepartmentId);
  return {
    id: parsed.id,
    title: parsed.title,
    department,
    departments: departments.length > 0 ? departments : [department],
    dateLabel: parsed.date_label,
    meetingDate: dateOnly(parsed.meeting_date),
    groundingScore: Number(parsed.grounding_score),
    findingsHigh: Number(parsed.findings_high),
    sourceFile: parsed.source_file,
    model: parsed.model,
    costUsd: parsed.cost_usd === null ? null : Number(parsed.cost_usd),
    createdBy: parsed.created_by,
    createdAt: isoOf(parsed.created_at),
  };
}

const LIST_COLUMNS = `
  id, title, department, bundle -> 'departments' AS departments, date_label, meeting_date,
  grounding_score, findings_high, source_file, model, cost_usd,
  created_by, created_at
`;

export class BriefNotFoundError extends Error {
  constructor(id: string) {
    super(`No brief with id ${id}`);
    this.name = 'BriefNotFoundError';
  }
}

export class BriefCorruptError extends Error {
  readonly detail: string;
  constructor(id: string, detail: string) {
    super(`The stored brief ${id} could not be read.`);
    this.name = 'BriefCorruptError';
    this.detail = detail;
  }
}

export interface CreateBriefInput {
  bundle: BriefBundle;
  meetingDate: string | null;
  createdBy: string;
}

export async function createBrief(input: CreateBriefInput): Promise<string> {
  const { bundle, meetingDate, createdBy } = input;
  const id = randomUUID();

  const findingsHigh = bundle.grounding.findings.filter((f) => f.severity === 'high').length;

  await query(
    `INSERT INTO briefs (
       id, title, department, meeting_type, confidentiality, date_label, meeting_date,
       bundle, grounding_score, findings_high, source_file, model, cost_usd, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id,
      bundle.brief.title,
      bundle.department,
      bundle.meetingType,
      bundle.confidentiality,
      bundle.brief.dateLabel,
      meetingDate,
      JSON.stringify(bundle),
      Math.round(bundle.grounding.score),
      findingsHigh,
      bundle.transcript.fileName,
      bundle.telemetry.model,
      bundle.telemetry.costUsd,
      createdBy,
    ],
  );

  return id;
}

export interface ListOptions {
  department?: DepartmentId | 'all';
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listBriefs(
  options: ListOptions = {},
): Promise<{ rows: BriefRow[]; total: number }> {
  const { department = 'all', search = '', limit = 30, offset = 0 } = options;

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (department !== 'all') {
    params.push(department);
    clauses.push(`department = $${params.length}`);
  }

  const term = search.trim();
  if (term) {
    // Escape the LIKE metacharacters *and* the escape character itself, then
    // declare the escape explicitly rather than relying on the server default.
    params.push(`%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    const like = `$${params.length}`;
    clauses.push(
      `(title ILIKE ${like} ESCAPE '\\'` +
        ` OR bundle -> 'brief' ->> 'summary' ILIKE ${like} ESCAPE '\\'` +
        ` OR source_file ILIKE ${like} ESCAPE '\\')`,
    );
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM briefs ${where}`,
    params,
  );

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const safeOffset = Math.max(Math.trunc(offset), 0);
  params.push(safeLimit, safeOffset);

  const rows = await query<Record<string, unknown>>(
    `SELECT ${LIST_COLUMNS} FROM briefs ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    rows: rows.map(toRow),
    total: Number(countRow?.count ?? 0),
  };
}

/** Postgres rejects a malformed uuid with an error; screen it first. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBriefId(value: string): boolean {
  return UUID_RE.test(value);
}

export async function getBrief(id: string): Promise<BriefRecord> {
  if (!isBriefId(id)) {
    throw new BriefNotFoundError(id);
  }

  const raw = await queryOne<Record<string, unknown>>(
    `SELECT ${LIST_COLUMNS}, bundle FROM briefs WHERE id = $1`,
    [id],
  );
  if (!raw) throw new BriefNotFoundError(id);

  const parsed = BriefBundleSchema.safeParse(raw.bundle);
  if (!parsed.success) {
    throw new BriefCorruptError(
      id,
      parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );
  }

  return { ...toRow(raw), bundle: parsed.data };
}

export async function deleteBrief(id: string): Promise<boolean> {
  if (!isBriefId(id)) return false;
  const rows = await query<{ id: string }>('DELETE FROM briefs WHERE id = $1 RETURNING id', [
    id,
  ]);
  return rows.length > 0;
}

export interface DepartmentCount {
  department: DepartmentId;
  count: number;
}

/** Counts per department for the dashboard bento tiles. */
export async function countByDepartment(): Promise<DepartmentCount[]> {
  const rows = await query<{ department: string; count: string }>(
    `SELECT department, COUNT(*)::text AS count FROM briefs GROUP BY department`,
  );
  return rows
    .filter((r) => isDepartmentId(r.department))
    .map((r) => ({ department: r.department as DepartmentId, count: Number(r.count) }));
}

export interface Totals {
  briefs: number;
  last7Days: number;
  costUsd: number;
  avgScore: number | null;
  openFindings: number;
}

export async function totals(): Promise<Totals> {
  const row = await queryOne<{
    briefs: string;
    last7: string;
    cost: string | null;
    avg_score: string | null;
    findings: string | null;
  }>(
    `SELECT
       COUNT(*)::text                                                  AS briefs,
       COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::text AS last7,
       COALESCE(SUM(cost_usd), 0)::text                                AS cost,
       ROUND(AVG(grounding_score))::text                               AS avg_score,
       COALESCE(SUM(findings_high), 0)::text                           AS findings
     FROM briefs`,
  );

  return {
    briefs: Number(row?.briefs ?? 0),
    last7Days: Number(row?.last7 ?? 0),
    costUsd: Number(row?.cost ?? 0),
    avgScore: row?.avg_score ? Number(row.avg_score) : null,
    openFindings: Number(row?.findings ?? 0),
  };
}
