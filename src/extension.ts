import * as vscode from 'vscode';

export function activate(ctx: vscode.ExtensionContext) {
  const provider = new RpgTreeProvider();
  ctx.subscriptions.push(
    vscode.window.registerTreeDataProvider('rpgQuickNavigator', provider),
    vscode.commands.registerCommand('rpgQuickNavigator.analyzeCurrent', analyzeCurrent)
  );
}

class RpgTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(el: vscode.TreeItem) { return el; }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    // Temp: retourne un nœud placeholder pour valider la vue
    return [new vscode.TreeItem('RPG Quick Navigator ready ✔')];
  }
}

async function analyzeCurrent() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) {
    vscode.window.showInformationMessage('No active editor.');
    return;
  }
  const panel = vscode.window.createWebviewPanel(
    'rpgReport',
    'RPG Analysis',
    vscode.ViewColumn.Beside,
    {}
  );
  panel.webview.html = `<pre>Analyzer will go here.</pre>`;
}

export function deactivate() {}
