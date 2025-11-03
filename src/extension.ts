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

const categories = ['procedure', 'variable', 'dataStructure', 'toDo'] as const;
type Category = typeof categories[number];

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
    if (!editor) { 
      return [new vscode.TreeItem('Open a .RPG file to analyze')];
    }
    
    const doc = parse(editor.document.getText());
    
    const groups: Record<Category, RpgSymbol[]> = {
      procedure: [],
      variable: [],
      dataStructure: [],
      toDo: []
    };

    for (const s of doc.symbols) {
      groups[s.kind as Category].push(s);
    }

    if (!element || !element.id) {
      return categories.map((k) => {
        const item = new vscode.TreeItem(
          labelForCategory(k), 
          vscode.TreeItemCollapsibleState.Collapsed
        );
        item.id = k;
        return item;
      });
    }

    const cat = element.id as Category;
    const list = groups[cat] ?? [];
    
    const items = list.map((sym) => {
      const label = labelForSymbol(sym);
      const item = new vscode.TreeItem(
        label,
        vscode.TreeItemCollapsibleState.None
      );
      item.command = {
        command: 'vscode.open',
        title: 'Go to symbol',
        arguments: [vscode.window.activeTextEditor?.document.uri, {
          selection: new vscode.Range(sym.range.start.line, 0, sym.range.start.line, 0)
        } as vscode.TextDocumentShowOptions
        ]
      };
      item.tooltip = sym.kind;
      if (sym.kind === 'variable') {
        item.description = sym.dclType;
      }
      return item;
    });

    return items;
  }
}

function labelForCategory(cat: Category): string {
  switch (cat) {
    case 'procedure':
      return 'Procedures';
    case 'variable':
      return 'Variables';
    case 'dataStructure':
      return 'Data Structures';
    case 'toDo':
      return 'To Do';
    default:
      return String(cat);
  }
}

function labelForSymbol(sym: RpgSymbol): string {
  switch (sym.kind) {
    case 'procedure':
    case 'variable':
    case 'dataStructure':
      return sym.name;
    case 'toDo':
      return sym.text;
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

export function deactivate() {}
