import type { CostSource } from './model';

/** Row shape for the session list ("strip"). */
export interface SessionRow {
  id: string;
  harness: string;
  title: string;
  projectPath: string | null;
  model: string | null;
  startedAt: string;
  updatedAt: string;
  totalTokens: number;
  toolCalls: number;
  toolErrors: number;
  costUsd: number;
  costSource: CostSource | null;
  live: boolean;
}

export interface OverviewData {
  costToday: number;
  cost7d: number;
  cost30d: number;
  liveCount: number;
  sessionCount: number;
  daily: { day: string; harness: string; costUsd: number }[];
  byModel: { model: string; harness: string; costUsd: number }[];
  cacheReadShare: number | null;
}

export interface SourceRow {
  sourceRef: string;
  harness: string;
  health: 'ok' | 'degraded' | 'failing';
  lastError: string | null;
  lastIngestAt: string | null;
  records: number;
}

/** The typed surface the preload exposes as `window.tycho`. Every method is one IPC channel. */
export interface TychoApi {
  overview(): Promise<OverviewData>;
  sessions(q: { harness?: string; limit?: number; offset?: number }): Promise<SessionRow[]>;
  sources(): Promise<SourceRow[]>;
  onChange(cb: (topic: 'usage' | 'sessions' | 'sources') => void): () => void;
}

export const IPC = {
  overview: 'tycho:overview',
  sessions: 'tycho:sessions',
  sources: 'tycho:sources',
  change: 'tycho:change',
} as const;
