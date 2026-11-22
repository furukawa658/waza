import { describe, expect, it } from 'vitest';
import { normalizeScriptPath, validateGeneratedSkill } from '../src/runtime';
import { GeneratedSkill } from '../src/types';

function skill(scriptContent: string): GeneratedSkill {
  return {
    skillName: 'runtime-check',
    description: 'Use for a runtime check.',
    summary: 'Checks generated JavaScript.',
    runtime: 'node',
    skillMarkdown: '---\nname: runtime-check\ndescription: Use for a runtime check.\n---\n\nRun `scripts/run.mjs --dry-run` first.',
    scriptRelativePath: 'scripts/run.mjs',
    scriptContent,
    samplePrompt: 'Run the runtime check.',
    dryRunArgs: ['--dry-run'],
    riskWarnings: [],
  };
}

describe('validateGeneratedSkill', () => {
  it('passes a valid Node.js script with safety options', async () => {
    const result = await validateGeneratedSkill(skill(`
const dryRun = process.argv.includes('--dry-run');
if (process.argv.includes('--help')) console.log('Usage: run.mjs --dry-run');
else console.log({ dryRun });
`));
    expect(result.ok).toBe(true);
    expect(result.command).toContain('node --check');
  });

  it('rejects scripts without a dry-run option before invoking the runtime', async () => {
    const result = await validateGeneratedSkill(skill("if (process.argv.includes('--help')) console.log('help');"));
    expect(result.ok).toBe(false);
    expect(result.command).toBe('content gate');
    expect(result.stderr).toContain('--dry-run');
  });

  it('rejects scripts that mention safety flags without reading command-line arguments', async () => {
    const result = await validateGeneratedSkill(skill('// Supports --help and --dry-run\nconsole.log("done");'));
    expect(result.ok).toBe(false);
    expect(result.command).toBe('content gate');
    expect(result.stderr).toContain('without reading');
  });
});

describe('normalizeScriptPath', () => {
  it('replaces traversal paths with the runtime default', () => {
    expect(normalizeScriptPath('node', '../run.mjs', 'sample')).toBe('scripts/run.mjs');
    expect(normalizeScriptPath('python', 'scripts/custom.ps1', 'sample')).toBe('scripts/run.py');
  });
});
