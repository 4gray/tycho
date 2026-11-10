export type WorkerEvent =
  | { type: 'progress'; harness: string; done: number; total: number }
  | { type: 'changed'; topic: 'usage' | 'sessions' | 'sources' }
  | { type: 'error'; harness: string; message: string }
  | { type: 'ready' };
