type SecretReplacement = string | ((match: string) => string);

const secretPatterns: Array<{ pattern: RegExp; replacement: SecretReplacement }> = [
  { pattern: /\bBearer\s+[A-Za-z0-9._~+\-/]+=*/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{16,}\b/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replacement: '[REDACTED_API_KEY]' },
  { pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*['\"][^'\"\r\n]+['\"]/gi, replacement: (match) => `${match.split(/[:=]/, 1)[0]}=[REDACTED]` },
  { pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*(?!\[REDACTED\])[^\s,;]+/gi, replacement: (match: string) => `${match.split(/[:=]/, 1)[0]}=[REDACTED]` },
];

export interface RedactionResult {
  text: string;
  count: number;
}

export function redactSecrets(input: string): RedactionResult {
  let text = input;
  let count = 0;

  for (const entry of secretPatterns) {
    text = text.replace(entry.pattern, (match: string) => {
      count += 1;
      return typeof entry.replacement === 'function' ? entry.replacement(match) : entry.replacement;
    });
  }

  return { text, count };
}

const riskPatterns: Array<{ pattern: RegExp; warning: string }> = [
  { pattern: /\brm\s+-[a-z]*r[a-z]*f?\b|\brmSync\s*\(|\bRemove-Item\b[^\r\n]*-Recurse/gi, warning: 'Deletes files or directories recursively.' },
  { pattern: /\bgit\s+(?:push|reset|clean)\b|\bforce-with-lease\b/gi, warning: 'Changes Git history or remote state.' },
  { pattern: /\b(?:curl|wget)\b|\bfetch\s*\(|https?:\/\//gi, warning: 'Performs or documents external network access.' },
  { pattern: /\bprocess\.env\b|\bos\.environ\b|\$env:/gi, warning: 'Reads environment variables.' },
  { pattern: /\bexec\s*\(|\bspawn\s*\(|\bchild_process\b|\bStart-Process\b/gi, warning: 'Starts external processes.' },
  { pattern: /\bchmod\b|\bchown\b|\bSet-Acl\b|\bfs\.unlink/gi, warning: 'Changes file permissions or removes files.' },
];

export function inspectGeneratedScript(script: string): string[] {
  const warnings: string[] = [];
  for (const entry of riskPatterns) {
    if (entry.pattern.test(script)) warnings.push(entry.warning);
    entry.pattern.lastIndex = 0;
  }
  return [...new Set(warnings)];
}

export function normalizeSkillName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('skillName must be a string.');
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!normalized || normalized.length > 64) throw new Error('skillName must become a non-empty kebab-case value of at most 64 characters.');
  return normalized;
}
