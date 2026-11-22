import { describe, expect, it } from 'vitest';
import { parseGeneratedSkill } from '../src/model-response';

const base = {
  skillName: 'api contract sync',
  description: 'Use when API contracts and mocks must be updated together.',
  summary: 'Updates generated contracts and validates mocks.',
  runtime: 'node',
  skillMarkdown: '---\nname: api-contract-sync\ndescription: Use when API contracts and mocks must be updated together.\n---\n\nRun scripts/run.mjs --dry-run first.',
  scriptRelativePath: 'scripts/run.mjs',
  scriptContent: 'export function main() { console.log("dry"); }',
  samplePrompt: 'Update API contracts and mocks for this change.',
  dryRunArgs: ['--dry-run'],
  riskWarnings: [],
};

describe('parseGeneratedSkill', () => {
  it('accepts a fenced JSON response and derives script risks', () => {
    const response = `Here is the result:\n\n\`\`\`json\n${JSON.stringify(base)}\n\`\`\`\n`;
    const parsed = parseGeneratedSkill(response);
    expect(parsed.skillName).toBe('api-contract-sync');
    expect(parsed.runtime).toBe('node');
    expect(parsed.scriptRelativePath).toBe('scripts/run.mjs');
  });

  it('rejects an unsupported runtime', () => {
    expect(() => parseGeneratedSkill(JSON.stringify({ ...base, runtime: 'shell' }))).toThrow('runtime must be one of');
  });

  it('rejects frontmatter whose name differs from skillName', () => {
    const skillMarkdown = base.skillMarkdown.replace('name: api-contract-sync', 'name: another-skill');
    expect(() => parseGeneratedSkill(JSON.stringify({ ...base, skillMarkdown }))).toThrow('frontmatter name');
  });

  it('rejects a path outside the expected script directory later', () => {
    const parsed = parseGeneratedSkill(JSON.stringify({ ...base, scriptRelativePath: '../run.mjs' }));
    expect(parsed.scriptRelativePath).toBe('../run.mjs');
  });
});
