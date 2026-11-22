import * as vscode from 'vscode';
import { compileSkill } from './skill-compiler';
import { previewMarkdown, saveGeneratedSkill } from './skill-files';
import { detectRuntimes, validateGeneratedSkill } from './runtime';
import { StoredSkill } from './types';
import { collectWorkflowContext } from './workflow-context';

const LAST_SKILL_KEY = 'waza.lastSkill';

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function animateKey(item: vscode.StatusBarItem, normal: string, busy: string, action: () => Promise<void>): Promise<void> {
  item.text = busy;
  item.show();
  await sleep(120);
  try {
    await action();
  } finally {
    item.text = normal;
  }
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  void vscode.window.showErrorMessage(`Waza: ${message}`, 'Open Output').then((choice) => {
    if (choice === 'Open Output') void vscode.commands.executeCommand('workbench.action.output.toggleOutput');
  });
}

export function activate(context: vscode.ExtensionContext): void {
  const compileKey = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  compileKey.text = '$(zap) WAZA';
  compileKey.name = 'Waza compile key';
  compileKey.command = 'waza.compileSkill';
  compileKey.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
  compileKey.tooltip = new vscode.MarkdownString('**Waza: スキル化**\n\nExplicitly selected workflow files and the current Git diff are compiled into an Agent Skill.');
  compileKey.show();

  const tryKey = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  tryKey.text = '$(play) TRY';
  tryKey.name = 'Waza try key';
  tryKey.command = 'waza.tryLastSkill';
  tryKey.tooltip = 'Open the most recently compiled Waza skill as a partial, reviewable chat prompt.';
  tryKey.show();

  const updateTryKey = (skill?: StoredSkill) => {
    const last = skill ?? context.globalState.get<StoredSkill>(LAST_SKILL_KEY);
    tryKey.text = last ? `$(play) TRY ${last.skillName}` : '$(play) TRY';
    tryKey.tooltip = last
      ? new vscode.MarkdownString(`Try **${last.skillName}** in a new chat. Waza keeps the query partial so you can review it before sending.`)
      : 'Compile a workflow with Waza first.';
  };
  updateTryKey();

  const compile = vscode.commands.registerCommand('waza.compileSkill', async () => {
    await animateKey(compileKey, '$(zap) WAZA', '$(sync~spin) COMPILING', async () => {
      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Waza is compiling the selected workflow',
          cancellable: true,
        }, async (_progress, token) => {
          const workflow = await collectWorkflowContext();
          if (!workflow) return;

          const runtimes = await detectRuntimes();
          const preferred = vscode.workspace.getConfiguration('waza').get<string>('preferredRuntime', 'auto');
          const skill = await compileSkill(workflow, preferred, runtimes, token);
          if (!skill || token.isCancellationRequested) return;

          const validation = await validateGeneratedSkill(skill);
          const preview = previewMarkdown(skill, validation.command);
          const document = await vscode.workspace.openTextDocument({ content: preview, language: 'markdown' });
          await vscode.window.showTextDocument(document, { preview: false });

          if (!validation.ok) {
            throw new Error(`Generated script failed its syntax gate.\n${validation.command}\n${validation.stderr || validation.stdout}`);
          }

          const save = await vscode.window.showInformationMessage(
            `Save ${skill.skillName} after reviewing the generated preview?`,
            { modal: true },
            'Save validated skill',
          );
          if (save !== 'Save validated skill') return;

          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!workspaceRoot) return;
          const stored = await saveGeneratedSkill(skill, workspaceRoot);
          if (!stored) return;

          await context.globalState.update(LAST_SKILL_KEY, stored);
          updateTryKey(stored);
          const open = await vscode.window.showInformationMessage(
            `Waza saved ${stored.skillName} with syntax validation.`,
            'Open SKILL.md',
            'Try in chat',
          );
          if (open === 'Open SKILL.md') {
            const uri = vscode.Uri.file(stored.skillPath);
            await vscode.window.showTextDocument(uri, { preview: false });
          } else if (open === 'Try in chat') {
            await vscode.commands.executeCommand('waza.tryLastSkill');
          }
        });
      } catch (error) {
        showError(error);
      }
    });
  });

  const tryLast = vscode.commands.registerCommand('waza.tryLastSkill', async () => {
    await animateKey(tryKey, context.globalState.get<StoredSkill>(LAST_SKILL_KEY) ? tryKey.text : '$(play) TRY', '$(sync~spin) OPENING', async () => {
      try {
        const last = context.globalState.get<StoredSkill>(LAST_SKILL_KEY);
        if (!last) {
          await vscode.window.showInformationMessage('Compile a Waza skill first.');
          return;
        }
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query: `${last.samplePrompt}\n\nUse the ${last.skillName} skill. Begin with --dry-run and wait for confirmation before any file changes.`,
          isPartialQuery: true,
        });
      } catch (error) {
        showError(error);
      }
    });
  });

  context.subscriptions.push(compileKey, tryKey, compile, tryLast);
}

export function deactivate(): void {
  // VS Code disposes all registered resources through the extension context.
}
