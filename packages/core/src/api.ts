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
  subagents: number;
  /** True when some usage has no known price, so costUsd is a lower bound. */
  unpriced: boolean;
}

export interface OverviewData {
  costToday: number;
  cost7d: number;
  cost30d: number;
  liveCount: number;
  sessionCount: number;
  daily: { day: string; harness: string; costUsd: number }[];
  byModel: { model: string; harness: string; costUsd: number; unpriced: boolean }[];
  cacheReadShare: number | null;
}

export interface SessionDetail {
  session: SessionRow;
  toolCalls: { id: string; name: string; status: string; startedAt: string | null; endedAt: string | null; sessionId: string }[];
  turns: { timestamp: string; model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number | null }[];
  messages: { id: string; role: string; timestamp: string; model: string | null; text: string | null; sessionId: string }[];
  /** Messages beyond this cap were not returned. */
  truncated: boolean;
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
  session(id: string): Promise<SessionDetail | null>;
  sources(): Promise<SourceRow[]>;
  onChange(cb: (topic: 'usage' | 'sessions' | 'sources') => void): () => void;
}

export const IPC = {
  overview: 'tycho:overview',
  sessions: 'tycho:sessions',
  session: 'tycho:session',
  sources: 'tycho:sources',
  change: 'tycho:change',
} as const;
