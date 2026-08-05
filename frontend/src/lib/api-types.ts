import type { DepartmentId } from './departments';
import type { BriefBundle } from './brief-bundle';

/**
 * Shapes returned by the backend's JSON API.
 *
 * Mirrors backend/src/lib/repository.ts's `BriefRow`/`BriefRecord`/
 * `DepartmentCount`/`Totals` — kept as plain types here (no `pg`, no I/O) since
 * the frontend only ever sees these as already-serialized JSON.
 */

export interface BriefRow {
  id: string;
  title: string;
  department: DepartmentId;
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

export interface DepartmentCount {
  department: DepartmentId;
  count: number;
}

export interface Totals {
  briefs: number;
  last7Days: number;
  costUsd: number;
  avgScore: number | null;
  openFindings: number;
}

export interface BriefStats {
  byDepartment: DepartmentCount[];
  totals: Totals;
}

export interface BriefList {
  rows: BriefRow[];
  total: number;
}

export interface SessionInfo {
  signedIn: boolean;
  who: string | null;
}
