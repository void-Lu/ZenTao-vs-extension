import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('zentao.openRequestLog', () => {
    vscode.window.showInformationMessage('ZenTao request log is not initialized yet.');
  });
  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
