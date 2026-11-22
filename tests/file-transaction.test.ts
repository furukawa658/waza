import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commitManagedFiles, FileTransactionOps } from '../src/file-transaction';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'waza-transaction-'));
  directories.push(path);
  return path;
}

function failNthStagedCommit(nth: number): FileTransactionOps {
  let commits = 0;
  return {
    async mkdir(path) {
      const fs = await import('node:fs/promises');
      await fs.mkdir(path, { recursive: true });
    },
    async writeFile(path, content) {
      await writeFile(path, content, 'utf8');
    },
    async rename(from, to) {
      const fs = await import('node:fs/promises');
      if (from.endsWith('.tmp') && ++commits === nth) throw new Error('injected commit failure');
      await fs.rename(from, to);
    },
    async remove(path) {
      await rm(path, { recursive: true, force: true });
    },
  };
}

describe('commitManagedFiles', () => {
  it('restores existing files when a later replacement fails', async () => {
    const root = await workspace();
    const targets = ['SKILL.md', 'scripts/run.mjs', 'SKILL.test.json'].map((file) => join(root, file));
    await (await import('node:fs/promises')).mkdir(join(root, 'scripts'), { recursive: true });
    await Promise.all(targets.map((target, index) => writeFile(target, `old-${index}`, 'utf8')));

    await expect(commitManagedFiles(targets.map((path, index) => ({ path, content: `new-${index}` })), failNthStagedCommit(2)))
      .rejects.toThrow('injected commit failure');

    await expect(Promise.all(targets.map((target) => readFile(target, 'utf8')))).resolves.toEqual(['old-0', 'old-1', 'old-2']);
    expect((await readdir(root, { recursive: true })).some((entry) => entry.toString().includes('.waza-'))).toBe(false);
  });

  it('leaves no managed target files when a new save fails midway', async () => {
    const root = await workspace();
    const targets = ['SKILL.md', 'scripts/run.mjs', 'SKILL.test.json'].map((file) => join(root, file));

    await expect(commitManagedFiles(targets.map((path, index) => ({ path, content: `new-${index}` })), failNthStagedCommit(2)))
      .rejects.toThrow('injected commit failure');

    await expect(readFile(targets[0], 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(targets[1], 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(targets[2], 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
