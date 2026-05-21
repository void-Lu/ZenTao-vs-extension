import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const reconnect = vscode.commands.registerCommand('zentao.reconnect', () => {
    vscode.window.showInformationMessage('ZenTao reconnect is not implemented yet.');
  });
  const refresh = vscode.commands.registerCommand('zentao.refresh', () => {
    vscode.window.showInformationMessage('ZenTao refresh is not implemented yet.');
  });
  const openRequestLog = vscode.commands.registerCommand('zentao.openRequestLog', () => {
    vscode.window.showInformationMessage('ZenTao request log is not initialized yet.');
  });
  const openDetail = vscode.commands.registerCommand('zentao.openDetail', () => {
    vscode.window.showInformationMessage('ZenTao detail view is not implemented yet.');
  });
  const copyId = vscode.commands.registerCommand('zentao.copyId', () => {
    vscode.window.showInformationMessage('ZenTao copy ID is not implemented yet.');
  });
  const openExternal = vscode.commands.registerCommand('zentao.openExternal', () => {
    vscode.window.showInformationMessage('ZenTao external link is not implemented yet.');
  });

  context.subscriptions.push(reconnect, refresh, openRequestLog, openDetail, copyId, openExternal);
}

export function deactivate(): void {}
