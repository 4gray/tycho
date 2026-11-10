export * from './types';
export { claudeCode } from './claude-code/spec';
import { claudeCode } from './claude-code/spec';
import type { AdapterSpec } from './types';

export const ADAPTERS: AdapterSpec[] = [claudeCode];
