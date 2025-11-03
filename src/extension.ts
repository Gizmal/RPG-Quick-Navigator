import * as vscode from 'vscode';
import { parse } from './parser/parse';
import { RpgSymbol } from './parser/ast';

export function activate(ctx: vscode.ExtensionContext) {
  const provider = new RpgTreeProvider();
  ctx.subscriptions.push(
    vscode.window.registerTreeDataProvider('rpgQuickNavigator', provider),
    vscode.commands.registerCommand('rpgQuickNavigator.analyzeCurrent', analyzeCurrent),
    vscode.window.onDidChangeActiveTextEditor(() => provider.refresh()),
    vscode.workspace.onDidChangeTextDocument(() => provider.refresh())
  );
}

class RpgTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(el: vscode.TreeItem) { 
    return el; 
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return [new vscode.TreeItem('Open a .RPG file to analyze')];
    
    const doc = parse(editor.document.getText());
    const groups: Record<string, RpgSymbol[]> = {
      procedure: [],
      variable: [],
      dataStructure: [],
      toDo: []
    };

    for (const s of doc.symbols) {
      groups[s.kind].push(s);
    }

    if (!element) {
      return Object.keys(groups).map(k => {
        const item = new vscode.TreeItem(capitalize(k), vscode.TreeItemCollapsibleState.Collapsed);
        item.id = k;
        return item;
      });
    }

    const cat = element.id as keyof typeof groups;
    const items = groups[cat].map(sym => {
      const item = new vscode.TreeItem(
        sym.name ?? (sym.kind === 'toDo' ? sym.text : '?'),
        vscode.TreeItemCollapsibleState.None
      );
      item.command = {
        command: 'vscode.open',
        title: 'Go to symbol',
        arguments: [vscode.window.activeTextEditor?.document.uri, {
          selection: new vscode.Range(sym.range.start.line, 0, sym.range.start.line, 0)
        }]
      };
      item.tooltip = `${sym.kind}`;
      item.description = sym.kind === 'variable' ? (sym as any).dclType : undefined;
      return item;
    });

    return items;
  }
}

async function analyzeCurrent() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) {
    vscode.window.showInformationMessage('No active editor.');
    return;
  }
  const doc = parse(ed.document.getText());
  const panel = vscode.window.createWebviewPanel(
    'rpgReport',
    'RPG Analysis',
    vscode.ViewColumn.Beside,
    {}
  );
  panel.webview.html = `<pre>${escapeHtml(JSON.stringify(doc, null, 2))}</pre>`;
}

function escapeHtml(s: string) {
  return s.replace(/[<>&]/g, c => ({ 
    '<': '&lt;', 
    '>': '&gt;', 
    '&': '&amp;' 
  }[c]!));
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function deactivate() {}
