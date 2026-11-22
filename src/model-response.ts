import { inspectGeneratedScript, normalizeSkillName } from './security';
import { GeneratedSkill, runtimes, WazaRuntime } from './types';

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text.trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The model response did not contain a JSON object.');
  return candidate.slice(start, end + 1);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value.trim();
}

function optionalStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} must be an array of strings.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function runtimeFrom(value: unknown): WazaRuntime {
  const runtime = requiredString(value, 'runtime') as WazaRuntime;
  if (!runtimes.includes(runtime)) throw new Error(`runtime must be one of: ${runtimes.join(', ')}.`);
  return runtime;
}

export function parseGeneratedSkill(text: string): GeneratedSkill {
  const parsed = JSON.parse(extractJson(text)) as Record<string, unknown>;
  const scriptContent = requiredString(parsed.scriptContent, 'scriptContent');
  const skillName = normalizeSkillName(parsed.skillName);
  const skillMarkdown = requiredString(parsed.skillMarkdown, 'skillMarkdown');
  const frontmatter = skillMarkdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) throw new Error('skillMarkdown must start with YAML frontmatter.');
  if (!/^name:\s*\S+/m.test(frontmatter[1]) || !/^description:\s*\S+/m.test(frontmatter[1])) {
    throw new Error('skillMarkdown frontmatter must contain name and description.');
  }
  const declaredName = frontmatter[1].split(/\r?\n/)
    .find((line) => /^name:\s*/.test(line))
    ?.replace(/^name:\s*/, '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (declaredName !== skillName) throw new Error('skillMarkdown frontmatter name must match skillName.');
  const declaredWarnings = optionalStringArray(parsed.riskWarnings, 'riskWarnings');
  const warnings = [...new Set([...declaredWarnings, ...inspectGeneratedScript(scriptContent)])];

  return {
    skillName,
    description: requiredString(parsed.description, 'description'),
    summary: requiredString(parsed.summary, 'summary'),
    runtime: runtimeFrom(parsed.runtime),
    skillMarkdown,
    scriptRelativePath: requiredString(parsed.scriptRelativePath, 'scriptRelativePath').replace(/\\/g, '/'),
    scriptContent,
    samplePrompt: requiredString(parsed.samplePrompt, 'samplePrompt'),
    dryRunArgs: optionalStringArray(parsed.dryRunArgs, 'dryRunArgs'),
    riskWarnings: warnings,
  };
}
