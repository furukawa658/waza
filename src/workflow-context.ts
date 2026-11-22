import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { redactSecrets } from './security';
import { WorkflowContext } from './types';

const execFileAsync = promisify(execFile);

interface GitContext {
  status: string;
  diff: string;
  diffStat: string;
  changedFiles: string[];
  warnings: string[];
}

interface GitResult {
  text: string;
  error?: string;
}

async function runGit(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: 10000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return { text: stdout.trim() };
  } catch (error) {
    const failure = error as Error & { killed?: boolean; code?: string | number; signal?: string };
    const reason = failure.killed || failure.signal ? 'timed out' : (failure.code?.toString() || failure.message);
    return { text: '', error: `git ${args.join(' ')}: ${reason}` };
  }
}

async function collectGitContext(cwd: string): Promise<GitContext> {
  const [status, diffResult, diffStat, changedOutput] = await Promise.all([
    runGit(cwd, ['status', '--short']),
    runGit(cwd, ['diff', '--', '.']),
    runGit(cwd, ['diff', '--stat', '--', '.']),
    runGit(cwd, ['diff', '--name-only', '--', '.']),
  ]);
  const warnings = [status, diffResult, diffStat, changedOutput].flatMap((result) => result.error ? [result.error] : []);
  const diffLimit = 40000;
  if (diffResult.text.length > diffLimit) warnings.push(`git diff was truncated from ${diffResult.text.length} to ${diffLimit} characters`);
  return {
    status: status.text,
    diff: `${diffResult.text.slice(0, diffLimit)}${diffResult.text.length > diffLimit ? '\n[WAZA: git diff truncated]' : ''}`,
    diffStat: diffStat.text,
    changedFiles: changedOutput.text.split(/\r?\n/).filter(Boolean),
    warnings,
  };
}

async function chooseSources(): Promise<Array<{ label: string; text: string }> | undefined> {
  const active = vscode.window.activeTextEditor?.document;
  const choices: Array<vscode.QuickPickItem & { id: string }> = [];
  if (active && active.getText().trim()) {
    choices.push({
      id: 'active',
      label: '$(file-code) Use active editor',
      description: active.fileName || active.uri.toString(),
    });
  }
  choices.push({ id: 'files', label: '$(files) Select workflow files', description: 'Markdown, JSON, JSONL, text, or logs' });

  const choice = await vscode.window.showQuickPick(choices, {
    title: 'Waza: Select workflow evidence',
    placeHolder: 'Choose exactly what may be sent to the VS Code language model.',
    ignoreFocusOut: true,
  });
  if (!choice) return undefined;

  if (choice.id === 'active' && active) {
    return [{ label: active.fileName || active.uri.toString(), text: active.getText() }];
  }

  const files = await vscode.window.showOpenDialog({
    canSelectMany: true,
    canSelectFiles: true,
    canSelectFolders: false,
    openLabel: 'Use selected workflow files',
    filters: {
      'Workflow evidence': ['md', 'markdown', 'txt', 'json', 'jsonl', 'log'],
    },
  });
  if (!files?.length) return undefined;

  const sources = await Promise.all(files.map(async (uri) => ({
    label: vscode.workspace.asRelativePath(uri, true),
    text: await readFile(uri.fsPath, 'utf8'),
  })));
  return sources;
}

export async function collectWorkflowContext(): Promise<WorkflowContext | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error('Open a workspace folder before compiling a Waza skill.');

  const sources = await chooseSources();
  if (!sources) return undefined;

  const git = await collectGitContext(folder.uri.fsPath);
  const maxCharacters = vscode.workspace.getConfiguration('waza').get<number>('maxInputCharacters', 60000);
  const combined = [
    ...sources.map((source) => `# SOURCE: ${source.label}\n${source.text}`),
    '# GIT STATUS',
    git.status || '(clean or unavailable)',
    '# GIT DIFF STAT',
    git.diffStat || '(unavailable)',
    '# GIT DIFF',
    git.diff || '(unavailable)',
  ].join('\n\n');
  const redacted = redactSecrets(combined);
  const inputWasTruncated = redacted.text.length > maxCharacters;
  const selected = inputWasTruncated
    ? `${redacted.text.slice(0, maxCharacters)}\n\n[WAZA: input truncated; ${redacted.text.length - maxCharacters} characters omitted from the end]`
    : redacted.text;
  const warningSummary = git.warnings.length ? ` Git warnings: ${git.warnings.join('; ')}.` : '';
  const truncationSummary = inputWasTruncated ? ` Input was truncated by ${redacted.text.length - maxCharacters} characters; selected workflow sources were kept at the beginning.` : '';
  const confirm = await vscode.window.showInformationMessage(
    `Waza will send ${selected.length.toLocaleString()} characters from ${sources.length} explicitly selected file(s) and the current Git diff to the selected VS Code language model. ${redacted.count} secret-like value(s) were redacted.${truncationSummary}${warningSummary}`,
    { modal: true },
    'Send to model',
  );
  if (confirm !== 'Send to model') return undefined;

  return {
    sourceLabels: sources.map((source) => source.label),
    text: selected,
    redactionCount: redacted.count,
    gitStatus: git.status,
    gitDiffStat: git.diffStat,
    gitWarnings: git.warnings,
    inputWasTruncated,
    changedFiles: git.changedFiles,
  };
}
