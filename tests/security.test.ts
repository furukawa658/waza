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

  it('redacts JSON-quoted keys, AWS and Slack tokens, and private key blocks', () => {
    const input = '{"password": "hunter2", "api_key": "abc123"}\nAKIAABCDEFGHIJKLMNOP\nxoxb-1234567890-abcdef\n-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----';
    const result = redactSecrets(input);

    for (const secret of ['hunter2', 'abc123', 'AKIAABCDEFGHIJKLMNOP', 'xoxb-1234567890-abcdef', 'MIIB']) expect(result.text).not.toContain(secret);
    expect(result.count).toBe(5);
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
