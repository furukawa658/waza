import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { GeneratedSkill, ValidationResult, WazaRuntime } from './types';

const execFileAsync = promisify(execFile);

function candidatesFor(runtime: WazaRuntime): string[] {
  switch (runtime) {
    case 'bun': return ['bun'];
    case 'node': return ['node'];
    case 'python': return ['python', 'python3'];
    case 'powershell': return ['pwsh', 'powershell'];
    case 'rust': return ['rustc'];
    case 'zig': return ['zig'];
  }
}

async function canRun(command: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(command, args, { timeout: 5000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export async function detectRuntimes(): Promise<WazaRuntime[]> {
  const checks: Array<[WazaRuntime, string[]]> = [
    ['bun', ['--version']],
    ['node', ['--version']],
    ['python', ['--version']],
    ['powershell', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']],
    ['rust', ['--version']],
    ['zig', ['version']],
  ];
  const found = await Promise.all(checks.map(async ([runtime, args]) => {
    for (const command of candidatesFor(runtime)) {
      if (await canRun(command, args)) return runtime;
    }
    return undefined;
  }));
  return found.filter((runtime): runtime is WazaRuntime => Boolean(runtime));
}

function extensionFor(runtime: WazaRuntime): string {
  switch (runtime) {
    case 'bun': return '.ts';
    case 'node': return '.mjs';
    case 'python': return '.py';
    case 'powershell': return '.ps1';
    case 'rust': return '.rs';
    case 'zig': return '.zig';
  }
}

export function normalizeScriptPath(runtime: WazaRuntime, requestedPath: string, skillName: string): string {
  const extension = extensionFor(runtime);
  if (!requestedPath.startsWith('scripts/') || requestedPath.includes('..') || !requestedPath.endsWith(extension)) {
    return `scripts/run${extension}`;
  }
  return requestedPath.replace(/[^a-zA-Z0-9_./-]/g, '-') || `scripts/run${extension}`;
}

function handlesSafetyFlags(skill: GeneratedSkill): boolean {
  const { scriptContent, runtime } = skill;
  const hasHelp = scriptContent.includes('--help');
  const hasDryRun = scriptContent.includes('--dry-run');
  if (!hasHelp || !hasDryRun) return false;

  switch (runtime) {
    case 'bun':
    case 'node': return /(?:process|Bun)\.argv[\s\S]{0,300}--dry-run/.test(scriptContent) && /(?:process|Bun)\.argv[\s\S]{0,300}--help/.test(scriptContent);
    case 'python': return /(?:argparse|sys\.argv)/.test(scriptContent) && /--dry-run/.test(scriptContent);
    case 'powershell': return /\$(?:args|PSBoundParameters)/i.test(scriptContent) && /--dry-run/i.test(scriptContent);
    case 'rust': return /(?:env::args|args_os)/.test(scriptContent);
    case 'zig': return /(?:std\.process|argsAlloc|argsWithAllocator)/.test(scriptContent);
  }
}

export async function validateGeneratedSkill(skill: GeneratedSkill): Promise<ValidationResult> {
  if (!skill.scriptContent.includes('--help')) {
    return { ok: false, command: 'content gate', stdout: '', stderr: 'Generated script is missing a --help option.' };
  }
  if (!skill.scriptContent.includes('--dry-run')) {
    return { ok: false, command: 'content gate', stdout: '', stderr: 'Generated script is missing a --dry-run option.' };
  }
  if (!handlesSafetyFlags(skill)) {
    return { ok: false, command: 'content gate', stdout: '', stderr: 'Generated script mentions safety flags without reading them from command-line arguments.' };
  }

  const temp = await mkdtemp(join(tmpdir(), `waza-${skill.skillName}-`));
  const scriptPath = join(temp, `run${extensionFor(skill.runtime)}`);
  const command = describeValidation(skill.runtime, scriptPath, temp);
  await writeFile(scriptPath, skill.scriptContent, 'utf8');

  try {
    const { stdout, stderr } = await execFileAsync(command.executable, command.args, {
      cwd: temp,
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, command: [command.executable, ...command.args].join(' '), stdout, stderr };
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false,
      command: [command.executable, ...command.args].join(' '),
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message,
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

function describeValidation(runtime: WazaRuntime, scriptPath: string, cwd: string): { executable: string; args: string[] } {
  switch (runtime) {
    case 'bun': return { executable: 'bun', args: ['build', scriptPath, '--target=bun', `--outfile=${join(cwd, 'compiled.js')}`] };
    case 'node': return { executable: 'node', args: ['--check', scriptPath] };
    case 'python': return { executable: 'python', args: ['-m', 'py_compile', scriptPath] };
    case 'powershell': return { executable: 'pwsh', args: ['-NoProfile', '-NonInteractive', '-Command', `$tokens=$null; $errors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${scriptPath.replace(/'/g, "''")}', [ref]$tokens, [ref]$errors); if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }`] };
    case 'rust': return { executable: 'rustc', args: ['--emit', 'metadata', scriptPath, '-o', join(cwd, 'run.rmeta')] };
    case 'zig': return { executable: 'zig', args: ['fmt', '--check', scriptPath] };
  }
}
