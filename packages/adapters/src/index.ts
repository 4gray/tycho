export * from './types';
export { claudeCode } from './claude-code/spec';
export { opencode, opencodeJson } from './opencode/spec';
import { claudeCode } from './claude-code/spec';
import { opencode, opencodeJson } from './opencode/spec';
import type { AdapterSpec } from './types';

export const ADAPTERS: AdapterSpec[] = [claudeCode, opencode, opencodeJson];
