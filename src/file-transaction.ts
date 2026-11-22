import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ManagedFile {
  path: string;
  content: string;
}

export interface FileTransactionOps {
  mkdir(path: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

const defaultOps: FileTransactionOps = {
  async mkdir(path) { await mkdir(path, { recursive: true }); },
  async writeFile(path, content) { await writeFile(path, content, 'utf8'); },
  async rename(from, to) { await rename(from, to); },
  async remove(path) { await rm(path, { recursive: true, force: true }); },
};

export async function commitManagedFiles(files: ManagedFile[], ops: FileTransactionOps = defaultOps): Promise<void> {
  if (!files.length) return;
  const transactionId = randomUUID();
  const staged = files.map((file, index) => ({
    ...file,
    stagedPath: `${file.path}.waza-${transactionId}-${index}.tmp`,
    backupPath: `${file.path}.waza-${transactionId}-${index}.bak`,
  }));
  const backups: Array<{ target: string; backup: string }> = [];
  const committed: string[] = [];

  try {
    await Promise.all(staged.map(async (file) => {
      await ops.mkdir(dirname(file.path));
      await ops.writeFile(file.stagedPath, file.content);
    }));

    for (const file of staged) {
      try {
        await ops.rename(file.path, file.backupPath);
        backups.push({ target: file.path, backup: file.backupPath });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }

    for (const file of staged) {
      await ops.rename(file.stagedPath, file.path);
      committed.push(file.path);
    }

    await Promise.all(backups.map((backup) => ops.remove(backup.backup)));
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const target of committed.reverse()) {
      try { await ops.remove(target); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    for (const backup of backups.reverse()) {
      try { await ops.rename(backup.backup, backup.target); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], 'Waza could not complete or fully roll back the skill save.');
    }
    throw error;
  } finally {
    await Promise.all(staged.map((file) => ops.remove(file.stagedPath).catch(() => undefined)));
  }
}
