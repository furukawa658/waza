import { describe, expect, it } from 'vitest';
import { inspectGeneratedScript, normalizeSkillName, redactSecrets } from '../src/security';

describe('redactSecrets', () => {
  it('redacts bearer, GitHub, API, and password values', () => {
    const input = 'Authorization: Bearer abc.def-123\ngh_token=ghp_12345678901234567890\napi_key="secret-value"\napi_key="secret-value-two"\npassword=hidden';
    const result = redactSecrets(input);

    expect(result.count).toBe(5);
    expect(result.text).not.toContain('abc.def-123');
    expect(result.text).not.toContain('ghp_12345678901234567890');
    expect(result.text).not.toContain('secret-value');
    expect(result.text).not.toContain('password=hidden');
  });
});

describe('inspectGeneratedScript', () => {
  it('reports destructive, network, and subprocess risks once', () => {
    const warnings = inspectGeneratedScript('rm -rf temp\nfetch("https://example.test")\nspawn("git")');
    expect(warnings).toEqual(expect.arrayContaining([
      'Deletes files or directories recursively.',
      'Performs or documents external network access.',
      'Starts external processes.',
    ]));
    expect(new Set(warnings).size).toBe(warnings.length);
  });
});

describe('normalizeSkillName', () => {
  it('normalizes names to kebab-case and rejects empty names', () => {
    expect(normalizeSkillName('  Update API Mocks  ')).toBe('update-api-mocks');
    expect(() => normalizeSkillName('---')).toThrow();
  });
});
