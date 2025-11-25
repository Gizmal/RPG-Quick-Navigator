import * as vscode from 'vscode';
import { parse } from './parser/parse';
import { RpgDocument, RpgSymbol } from './parser/ast';

// icon: https://www.flaticon.com/fr/icones-gratuites/revision-du-code

export function activate(ctx: vscode.ExtensionContext) {
  const provider = new RpgTreeProvider();

  for (const lang of ['rpg', 'rpgle', 'sqlrpgle']) {
    ctx.subscriptions.push(
      vscode.languages.registerHoverProvider(lang, {
        provideHover(document, position) {
          const wordRange = document.getWordRangeAtPosition(position);
          if (!wordRange) return;
          const word = document.getText(wordRange);
          const doc = parse(document.getText()); // ToDo : use _cache for doc
          const sym = doc.symbols.find(s => {
            if (s.kind === 'toDo') return s.text === word;
            return 'name' in s && s.name === word;
        });
          if (!sym) return; 
          const md = new vscode.Hover(buildSymbolTooltip(sym));
          return md;
        }
      })
    );
  }

  
  void refreshSortContext();
  ctx.subscriptions.push(
    vscode.window.registerTreeDataProvider('rpgQuickNavigatorView', provider),
    vscode.window.registerTreeDataProvider('rpgQuickNavigatorExplorer', provider),
    vscode.commands.registerCommand('rpgQuickNavigator.analyzeCurrent', analyzeCurrent),
    vscode.commands.registerCommand('rpgQuickNavigator.reveal', async (uri: vscode.Uri, line: number) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, {
        selection: new vscode.Range(line, 0, line, 0),
        preserveFocus: true,
        preview: true
      });
    }),
    vscode.commands.registerCommand('rpgQuickNavigator.toggleSortOrder', async () => {
      const config = vscode.workspace.getConfiguration('rpgQuickNavigator');
      const current = config.get<string>('sortOrder') ?? 'chronological';
      const next: SortOrder = current === 'chronological' ? 'alphabetical' : 'chronological';
      const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
      const target = hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
      await config.update('sortOrder', next, target);
      await refreshSortContext();
      vscode.window.showInformationMessage(`RPG Quick Navigator: Sort order set to ${next}.`);
      provider.refresh();
    }),
    
    vscode.commands.registerCommand('rpgQuickNavigator.toggleSortOrder.alphabetical', () => vscode.commands.executeCommand('rpgQuickNavigator.toggleSortOrder')),
    vscode.commands.registerCommand('rpgQuickNavigator.toggleSortOrder.chronological', () => vscode.commands.executeCommand('rpgQuickNavigator.toggleSortOrder')),
    vscode.window.onDidChangeActiveTextEditor(() => provider.refresh()),
    vscode.workspace.onDidChangeTextDocument(() => provider.refresh()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('rpgQuickNavigator.sortOrder')) {
        void refreshSortContext();
        provider.refresh();
      }
    })
  );
  (async () => {
    const openedOnce = ctx.globalState.get<boolean>('rpgQuickNavigator.openedOnce');
    if (!openedOnce) {
      await vscode.commands.executeCommand('workbench.view.extension.rpgQuickNavigator');
      await ctx.globalState.update('rpgQuickNavigator.openedOnce', true);
    }
  })();
  async function refreshSortContext() {
    const order = getSortOrder();
    await vscode.commands.executeCommand(
      'setContext', 
      'rpgQuickNavigator.sortOrder', 
      order
    );
  }
}

//const categories = ['procedure', 'subroutine', 'variable', 'dataStructure', 'toDo'] as const;
const categories = ['procedure', 'variable', 'declaredFile', 'toDo'] as const;
type Category = typeof categories[number];
type SortOrder = 'alphabetical' | 'chronological';

function getSortOrder(): SortOrder {
  const config = vscode.workspace.getConfiguration('rpgQuickNavigator');
  return (config.get<SortOrder>('sortOrder') ?? 'chronological');
}

class RpgTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  private _refreshTimer: NodeJS.Timeout | undefined;
  private _cache: {uri?: string; version?: number; doc?: RpgDocument} = {};
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh() {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this._onDidChangeTreeData.fire();
      this._refreshTimer = undefined;
    }, 300);
  }

  getTreeItem(el: vscode.TreeItem) { 
    return el; 
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (element instanceof SymbolItem) {
      const sym = element.symbol;
      if (sym.kind === 'dataStructure' || sym.kind === 'enum') {
        const documentUri = this._cache.uri ? vscode.Uri.parse(this._cache.uri) : undefined;
        const childTreeItems: vscode.TreeItem[] = (sym as any).values?.map((memberSymbol: any) => {
          const label = memberSymbol.name + (memberSymbol.dclType ? ` : ${memberSymbol.dclType}` : (memberSymbol.value ? ` = ${memberSymbol.value}` : ''));
          const childItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
          childItem.tooltip = buildSymbolTooltip(memberSymbol); 
          if (documentUri && memberSymbol.range) {
            childItem.command = {
              command: 'rpgQuickNavigator.reveal',
              title: 'Reveal symbol',
              arguments: [documentUri, memberSymbol.range.start.line]
            };
          }
          return childItem;
        }) ?? [];
        return childTreeItems;
      }
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) { 
      return [new vscode.TreeItem('Open a RPG file to analyze')];
    }
    
    const uri = editor.document.uri.toString();
    const version = editor.document.version;
    let doc: RpgDocument | undefined;

    if (this._cache.uri === uri && this._cache.version === version && this._cache.doc) {
      doc = this._cache.doc;
    } else {
    doc = parse(editor.document.getText());
    this._cache = { uri, version, doc };  
  }

    const groups: Record<Category, RpgSymbol[]> = {
      procedure: [],
    //  subroutine: [],
    //  constant: [],
      variable: [],
    //  dataStructure: [],
      declaredFile: [],
      toDo: []
    };
    
    function mapKindToCategory(kind: RpgSymbol['kind']): Category | undefined {
      switch (kind) {
        case 'procedure':
          return 'procedure';
        case 'subroutine':
          return 'procedure';
        case 'constant':
          return 'variable';
        case 'variable':
          return 'variable';  
        case 'dataStructure':
          return 'variable';
        case 'enum':
          return 'variable';
        case 'declaredFile':
          return 'declaredFile';
        case 'toDo':
          return 'toDo';
        default:
          return undefined;
      }
    }

    for (const s of doc.symbols) {
      const cat = mapKindToCategory(s.kind);
      if (cat) groups[cat].push(s);
    }
    
    if (!element || !element.id) {
      return categories.map((key) => {
        const item = new vscode.TreeItem(
          labelForCategory(key), 
          vscode.TreeItemCollapsibleState.Collapsed
        );
        
        item.id = key;
        const count = groups[key].length;
        const order = getSortOrder();
        item.description = `${count} - ${order === 'chronological' ? '1→n' : 'A→Z'}`;
        item.tooltip = new vscode.MarkdownString(
          `**${labelForCategory(key)}:**  \nNumber of items: ${count}  \nSort Order: ${order === 'chronological' ? 'Chronological (1→n)' : 'Alphabetical (A→Z)'}`
        );
        const catIcon: Record<Category, vscode.ThemeIcon> = {
          procedure: new vscode.ThemeIcon('symbol-method'),
        //  subroutine: new vscode.ThemeIcon('symbol-method'),
        //  constant: new vscode.ThemeIcon('symbol-constant'),
          variable: new vscode.ThemeIcon('symbol-variable'),
        //  dataStructure: new vscode.ThemeIcon('symbol-structure'),
        //  enum: new vscode.ThemeIcon('list-ordered'),
          declaredFile: new vscode.ThemeIcon('symbol-file'),
          toDo: new vscode.ThemeIcon('comment')
        };
        item.iconPath = catIcon[key];
        return item;
      });
    }

    const catId = element.id as Category;
    const list = groups[catId] ?? [];
    const order = getSortOrder();
      
    const sorted = [...list].sort((a, b) => {
      if (order === 'chronological') {
        // sort by line number
        const lineA = a.range.start.line;
        const lineB = b.range.start.line;
        return lineA - lineB;
    }
      else {
        // sort by alphabetical order
        return labelForSymbol(a).localeCompare(labelForSymbol(b), 'en', { sensitivity: 'base' })
      };
    });

    const items = sorted.map((sym) => {
      const label = labelForSymbol(sym);
      const collapsibleItemState = (sym.kind === 'dataStructure' || sym.kind === 'enum') ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
      const item = new SymbolItem(
          sym, 
          label, 
          collapsibleItemState
        );
      item.id = `${catId}-${(sym as any).name ?? (sym as any).text}-${sym.range.start.line}`;
      
      let symbolIcon: vscode.ThemeIcon;
      //if      (sym.kind === 'procedure')      symbolIcon = new vscode.ThemeIcon('symbol-method');
      if      (sym.kind === 'procedure')      symbolIcon = new vscode.ThemeIcon('gear');
      //else if (sym.kind === 'subroutine')     symbolIcon = new vscode.ThemeIcon('symbol-method');
      else if (sym.kind === 'subroutine')     symbolIcon = new vscode.ThemeIcon('note');
      else if (sym.kind === 'constant')       symbolIcon = new vscode.ThemeIcon('symbol-constant');
      else if (sym.kind === 'variable')       symbolIcon = new vscode.ThemeIcon('symbol-variable');
      else if (sym.kind === 'dataStructure')  symbolIcon = new vscode.ThemeIcon('symbol-structure');
      //else if (sym.kind === 'enum')           symbolIcon = new vscode.ThemeIcon('list-ordered');
      //else if (sym.kind === 'enum')           symbolIcon = new vscode.ThemeIcon('symbol-enum');
      else if (sym.kind === 'enum')           symbolIcon = new vscode.ThemeIcon('symbol-value');
      else if (sym.kind === 'declaredFile')   symbolIcon = new vscode.ThemeIcon('symbol-file');
      else                                        symbolIcon = new vscode.ThemeIcon('comment');

      item.iconPath = symbolIcon;
      item.command = {
        command: 'rpgQuickNavigator.reveal',
        title: 'Reveal symbol',
        arguments: [editor.document.uri, sym.range.start.line]
      };
      item.tooltip = buildSymbolTooltip(sym);
      if (sym.kind === 'variable') {
        item.description = sym.dclType;
      }
      return item;
    });

    return items;
  }
}

class SymbolItem extends vscode.TreeItem {
  constructor(
    public symbol: RpgSymbol, 
    label: string, 
    state: vscode.TreeItemCollapsibleState
  ) {
    super(label, state);
  }
}

function labelForCategory(cat: Category): string {
  switch (cat) {
    case 'procedure':
      return 'Procedures';
  //  case 'subroutine':
  //    return 'Subroutines';
  //  case 'constant':
  //    return 'Constants';
    case 'variable':
      return 'Variables';
  //  case 'dataStructure':
  //    return 'Data Structures';
  //  case 'enum':
  //    return 'Enums';
    case 'declaredFile':
      return 'Files';
    case 'toDo':
      return 'To Do';
    default:
      return String(cat);
  }
}

function labelForSymbol(sym: RpgSymbol): string {
 /* switch (sym.kind) {
    case 'procedure':
      return sym.name;
    case 'subroutine':
      return sym.name;
    case 'constant':
      return sym.name;
    case 'variable':
      return sym.name;
    case 'dataStructure':
      return sym.name;
    case 'enum':
      return sym.name;
    case 'declaredFile':
      return sym.name;
    case 'toDo':
      return sym.text;
  } */
 /* switch (sym.kind) {
    case 'toDo':
      return sym.text;
    default:
      return sym.name;    
  } */
  return sym.kind === 'toDo' ? sym.text : (sym as any).name;
}

async function analyzeCurrent() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor.');
    return;
  }
  const text = editor.document.getText();
  const doc = parse(text);
  const fileName = editor.document.uri.fsPath.split(/[/\\]/).pop() ?? editor.document.fileName;
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
  //  subroutine: sections.subroutine.length,
  //  constant: sections.constant.length,
    variable: sections.variable.length,
  //  dataStructure: sections.dataStructure.length,
  //  enum: sections.enum.length,
    declaredFile: sections.declaredFile.length,
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
      .card { padding: 12px; border: 1px solid #cccccc; border-radius: 8px; box-shadow: 0 1px 3px #22222280; }
      .muted { color: #666666; font-size: 12px; }
      .btn { display: inline-block; border: 1px solid #888888; border-radius: 6px; padding: 6px 10px; cursor: pointer; user-select: none; background: #007acc; color: white; }
      pre { background: #222222; color: #cccccc; padding: 12px; border-radius: 8px; overflow: auto; }
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
        <div class="card"><b>Subroutines</b><div class="muted">${'' /* counts.subroutine */}</div></div>
        <div class="card"><b>Constants</b><div class="muted">${'' /* counts.constant */}</div></div>
        <div class="card"><b>Variables</b><div class="muted">${counts.variable}</div></div>
        <div class="card"><b>Data Structures</b><div class="muted">${'' /* counts.dataStructure */}</div></div>
        <div class="card"><b>Data Structures</b><div class="muted">${'' /* counts.enum */}</div></div>
        <div class="card"><b>Files</b><div class="muted">${counts.declaredFile}</div></div>
        <div class="card"><b>TODOs</b><div class="muted">${counts.toDos}</div></div>
        <div class="card"><b>Control Blocks</b><div class="muted">${counts.controlBlocks}</div></div>
      </div>
      
      ${renderSection('Procedures', sections.procedure, (s:any) => s.name)}
      ${'' /* renderSection('Subroutines', sections.subroutine, (s:any) => s.name) */}
      ${'' /* renderSection('Constants', sections.constant, (s:any) => s.name) */}
      ${renderSection('Variables', sections.variable, (s:any) => s.name /* + ' : ' + s.dclType */)}
      ${'' /* renderSection('Data Structures', sections.dataStructure, (s:any) => s.name) */} 
      ${'' /* renderSection('Enums', sections.enum, (s:any) => s.name) */} 
      ${renderSection('Files', sections.declaredFile, (s:any) => s.name)}
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
  //  subroutine: symbols.filter(s => s.kind === 'subroutine'),
  //  constant: symbols.filter(s => s.kind === 'constant'),
    variable: symbols.filter(s => s.kind === 'variable'),
  //  dataStructure: symbols.filter(s => s.kind === 'dataStructure'),
  //  enum: symbols.filter(s => s.kind === 'enum'),
    declaredFile: symbols.filter(s => s.kind === 'declaredFile'),
    toDo: symbols.filter(s => s.kind === 'toDo'),
  };
}

function buildSymbolTooltip(sym: RpgSymbol): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = false;

  switch (sym.kind) {
    case 'procedure':
      md.appendMarkdown(`**Procedure _${sym.name}_**  \n`); // export?
      if (sym.isExport) md.appendMarkdown(`*(exported)*  \n`);
      break;
    case 'subroutine':
      md.appendMarkdown(`**Subroutine _${sym.name}_**  \n`); // global or in which procedure?
      break;
    case 'constant':
      md.appendMarkdown(`**Constant _${sym.name}_**:  \n`);
      md.appendMarkdown(`Value: ${sym.value}  \n`);
      break;
    case 'variable':
      md.appendMarkdown(`**Variable _${sym.name}_**:  \n`);
      md.appendMarkdown(`Type: ${sym.dclType}  \n`);
      if (sym.isTab) md.appendMarkdown(`Array dim: ${sym.tabDim}  \n`);
      break;
    case 'dataStructure':
      md.appendMarkdown(`**Data Structure _${sym.name}_**  \n`); // content of the DS? type and name of variables inside of DS
      break;
    case 'itemDS':
      md.appendMarkdown(`**DS item _${sym.name}_**  \n`); 
      md.appendMarkdown(`Type: ${sym.dclType}  \n`);
      if (sym.isTab) md.appendMarkdown(`Array dim: ${sym.tabDim}  \n`);
      break;
    case 'enum':
      md.appendMarkdown(`**Enum _${sym.name}_**  \n`); // content of the enum? values of constants inside of enum
      break;
    case 'itemEnum':
      md.appendMarkdown(`**Enum item _${sym.name}_**:  \n`);
      md.appendMarkdown(`Value: ${sym.value}  \n`);
      break;
    case 'declaredFile':
      md.appendMarkdown(`**File _${sym.name}_**:  \n`);
      md.appendMarkdown(`Type: ${sym.fileType}  \n`); 
      break;
    case 'toDo':
      md.appendMarkdown(`**To Do**: ${sym.text}  \n`);
      break;
    default:
      md.appendMarkdown(`**Undefined**  \n`);
      break;
  }
  md.appendMarkdown(`Defined at line ${sym.range.start.line + 1}  \n`);
  return md;
}

export function deactivate() {}
