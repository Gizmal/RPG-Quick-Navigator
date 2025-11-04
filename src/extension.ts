import * as vscode from 'vscode';
import { parse } from './parser/parse';
import { RpgDocument, RpgSymbol } from './parser/ast';

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
      const key = s.kind as Category;
      groups[key].push(s);
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
          selection: new vscode.Range(
            sym.range.start.line, 
            0, 
            sym.range.start.line, 
            0
          )
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
  const text = ed.document.getText();
  const doc = parse(text);
  const fileName = ed.document.uri.fsPath.split(/[/\\]/).pop() ?? ed.document.fileName;
  const panel = vscode.window.createWebviewPanel(
    'rpgReport',
    `RPG Analysis. ${fileName}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true
    }
  );

  panel.webview.html = renderReport(doc);

  panel.webview.onDidReceiveMessage((msg) => {
    if (msg?.type === 'copy') {
      vscode.env.clipboard.writeText(JSON.stringify(doc, null, 2));
      vscode.window.showInformationMessage('Analysis JSON copied to clipboard.');
    }
  });
}

function escapeHtml(s: string) {
  return s.replace(/[<>&]/g, (c) => ({ 
    '<': '&lt;', 
    '>': '&gt;', 
    '&': '&amp;' 
  }[c]!));
}

function renderReport(doc: RpgDocument): string {
  const json = escapeHtml(JSON.stringify(doc, null, 2));
  const sections = groupByKind(doc.symbols);

  const counts = {
    procedure: sections.procedure.length,
    variable: sections.variable.length,
    dataStructure: sections.dataStructure.length,
    toDo: sections.toDo.length,
    controlBlocks: doc.metrics.controlBlocks,
    toDos: doc.metrics.toDos
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RPG Analysis</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 16px; }
      h1 { margin: 0 0 12px; font-size: 18px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
      .card { padding: 12px; border: 1px solid #dddddd; border-radius: 8px; box-shadow: 0 1px 3px #22222280; }
      .muted { color: #666666; font-size: 12px; }
      .btn { display: inline-block; border: 1px solid #888888; border-radius: 6px; padding: 6px 10px; cursor: pointer; user-select: none; background: #007acc; color: white; }
      pre { background: #222222; color: #dddddd; padding: 12px; border-radius: 8px; overflow: auto; }
      ul { margin: 8px 0 0 20px; }
      .section { margin-top: 10px; }
      .title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    </style>
  </head>
  <body>
    <div class="title">
      <h1>RPG Analysis</h1>
      <button class="btn" onclick="copyJson()">Copy JSON</button>
      </div>
      
      <div class="grid">
        <div class="card"><b>Procedures</b><div class="muted">${counts.procedure}</div></div>
        <div class="card"><b>Variables</b><div class="muted">${counts.variable}</div></div>
        <div class="card"><b>Data Structures</b><div class="muted">${counts.dataStructure}</div></div>
        <div class="card"><b>TODOs</b><div class="muted">${counts.toDos}</div></div>
        <div class="card"><b>Control Blocks</b><div class="muted">${counts.controlBlocks}</div></div>
      </div>
      
      ${renderSection('Procedures', sections.procedure, (s:any) => s.name)}
      ${renderSection('Variables', sections.variable, (s:any) => s.name + ' : ' + s.dclType)}
      ${renderSection('Data Structures', sections.dataStructure, (s:any) => s.name)}
      ${renderSection('To Do Items', sections.toDo, (s:any) => s.text)}

      <div class="section">
        <h2>Raw JSON</h2>
        <pre id="json">${json}</pre>
      </div>

    <script>
      function copyJson() {
        const pre = document.getElementById('json');
        const vs = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
        if (vs) {
          vs.postMessage({ type: 'copy' });
        } else {
          const r = document.createRange();
          r.selectNodeContents(pre);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
          try {
            document.execCommand('copy');
          } finally {
            sel.removeAllRanges();
          }
        }
      }
    </script>
  </body>
</html>`;
} 

function renderSection<T extends RpgSymbol>(
  title: string, 
  list: T[], 
  label: (sel: any) => string
): string {
  if (!list.length) return '';
  const items = list
    .map((sel) => `<li>${escapeHtml(label(sel))} <span class="muted">(line ${sel.range.start.line + 1})</span></li>`)
    .join('\n');
  return `<div class="section card">
    <h2>${escapeHtml(title)}</h2>
    <ul>${items}</ul>
  </div>`;
}

function groupByKind(symbols: RpgSymbol[]): Record<Category, RpgSymbol[]> {
  return {
    procedure: symbols.filter(s => s.kind === 'procedure'),
    variable: symbols.filter(s => s.kind === 'variable'),
    dataStructure: symbols.filter(s => s.kind === 'dataStructure'),
    toDo: symbols.filter(s => s.kind === 'toDo'),
  };
}

export function deactivate() {}
