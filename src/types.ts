export const runtimes = ['bun', 'node', 'python', 'powershell', 'rust', 'zig'] as const;

export type WazaRuntime = (typeof runtimes)[number];

export interface WorkflowContext {
  sourceLabels: string[];
  text: string;
  redactionCount: number;
  gitStatus: string;
  gitDiffStat: string;
  gitWarnings: string[];
  inputWasTruncated: boolean;
  changedFiles: string[];
}

export interface GeneratedSkill {
  skillName: string;
  description: string;
  summary: string;
  runtime: WazaRuntime;
  skillMarkdown: string;
  scriptRelativePath: string;
  scriptContent: string;
  samplePrompt: string;
  dryRunArgs: string[];
  riskWarnings: string[];
}

export interface ValidationResult {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
}

export interface StoredSkill {
  skillName: string;
  skillPath: string;
  samplePrompt: string;
  createdAt: string;
}
