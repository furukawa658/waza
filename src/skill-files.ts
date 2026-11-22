import { readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import * as vscode from 'vscode';
import { commitManagedFiles } from './file-transaction';
import { validateGeneratedSkill } from './runtime';
import { GeneratedSkill, StoredSkill } from './types';

function testDefinition(skill: GeneratedSkill): string {
  return `${JSON.stringify({
    samplePrompt: skill.samplePrompt,
    runtime: skill.runtime,
    dryRunArgs: skill.dryRunArgs,
    validation: {
      script: skill.scriptRelativePath,
      requiresHelpFlag: true,
      requiresDryRunFlag: true,
    },
  }, null, 2)}\n`;
}

function fenceFor(content: string, language = ''): string {
  const runs = [...content.matchAll(/`+/g)].map((match) => match[0].length);
  const fence = '`'.repeat(Math.max(3, ...runs.map((length) => length + 1)));
  return `${fence}${language}\n${content}\n${fence}`;
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[<>]/g, (character) => character === '<' ? '&lt;' : '&gt;');
}

export function previewMarkdown(skill: GeneratedSkill, validationCommand: string): string {
  const scriptLanguage = skill.runtime === 'powershell' ? 'powershell' : skill.runtime === 'python' ? 'python' : skill.runtime === 'rust' ? 'rust' : skill.runtime === 'zig' ? 'zig' : 'typescript';
  const warnings = skill.riskWarnings.length
    ? `\n## Risk warnings\n\n${skill.riskWarnings.map((warning) => `- ${singleLine(warning)}`).join('\n')}\n`
    : '';
  return `# Waza preview: ${skill.skillName}

${singleLine(skill.summary)}

- Runtime: \`${skill.runtime}\`
- Script: \`${skill.scriptRelativePath}\`
- Syntax check: \`${singleLine(validationCommand)}\`
- Dry-run: \`${singleLine(skill.dryRunArgs.join(' '))}\`
${warnings}
## SKILL.md

${fenceFor(skill.skillMarkdown, 'markdown')}

## ${skill.scriptRelativePath}

${fenceFor(skill.scriptContent, scriptLanguage)}

## Sample prompt

${fenceFor(skill.samplePrompt, 'text')}
`;
}

async function confirmRiskWarnings(skill: GeneratedSkill): Promise<boolean> {
  if (!skill.riskWarnings.length || !vscode.workspace.getConfiguration('waza').get<boolean>('showRiskWarnings', true)) return true;
  const choice = await vscode.window.showWarningMessage(
    `The generated script has ${skill.riskWarnings.length} risk warning(s): ${skill.riskWarnings.join(' ')}`,
    { modal: true },
    'Continue to save',
  );
  return choice === 'Continue to save';
}

export async function saveGeneratedSkill(skill: GeneratedSkill, workspaceRoot: string): Promise<StoredSkill | undefined> {
  const validation = await validateGeneratedSkill(skill);
  if (!validation.ok) {
    throw new Error(`Generated script did not pass syntax validation.\n${validation.command}\n${validation.stderr || validation.stdout}`);
  }
  if (!(await confirmRiskWarnings(skill))) return undefined;

  const skillDirectory = join(workspaceRoot, '.github', 'skills', skill.skillName);
  const scriptPath = resolve(skillDirectory, skill.scriptRelativePath);
  const root = resolve(skillDirectory);
  const scriptRelative = relative(root, scriptPath);
  if (scriptRelative.startsWith('..') || isAbsolute(scriptRelative)) {
    throw new Error('Generated script path escapes the skill directory. No files were saved.');
  }
  const skillPath = join(skillDirectory, 'SKILL.md');
  const testPath = join(skillDirectory, 'SKILL.test.json');

  let existing = false;
  try {
    existing = (await readdir(skillDirectory)).length > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (existing) {
    const overwrite = await vscode.window.showWarningMessage(
      `The skill ${skill.skillName} already exists. Replace its Waza-managed SKILL.md, script, and test definition? Other files are left untouched.`,
      { modal: true },
      'Replace Waza files',
    );
    if (overwrite !== 'Replace Waza files') return undefined;
  }

  await commitManagedFiles([
    { path: skillPath, content: `${skill.skillMarkdown.trim()}\n` },
    { path: scriptPath, content: `${skill.scriptContent.trim()}\n` },
    { path: testPath, content: testDefinition(skill) },
  ]);

  return {
    skillName: skill.skillName,
    skillPath,
    samplePrompt: skill.samplePrompt,
    createdAt: new Date().toISOString(),
  };
}
