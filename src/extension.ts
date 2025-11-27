import * as vscode from 'vscode';
import { parse } from './parser/parse';
import { RpgDocument, RpgSymbol } from './parser/ast';

// icon: https://www.flaticon.com/fr/icones-gratuites/revision-du-code

const documentCache: {uri?: string; version?: number; doc?: RpgDocument} = {};

function getCachedDocument(document: vscode.TextDocument): RpgDocument {
  const uri = document.uri.toString();
  const version = document.version;
  
  if (documentCache.uri === uri && documentCache.version === version && documentCache.doc) {
    return documentCache.doc;
  }
  
  const doc = parse(document.getText());
  documentCache.uri = uri;
  documentCache.version = version;
  documentCache.doc = doc;
  
  return doc;
}

export function activate(ctx: vscode.ExtensionContext) {
  const provider = new RpgTreeProvider();

  for (const lang of ['rpg', 'rpgle', 'sqlrpgle']) {
    ctx.subscriptions.push(
      vscode.languages.registerHoverProvider(lang, {
        provideHover(document, position) {
          const wordRange = document.getWordRangeAtPosition(position);
          if (!wordRange) return;
          const word = document.getText(wordRange);
          
          const doc = getCachedDocument(document);
          
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

  
  void refreshContext();
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
      const current = getConfigs().sortOrder;
      const next: SortOrder = current === 'chronological' ? 'alphabetical' : 'chronological';
      const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
      const target = hasWorkspace ? 
        vscode.ConfigurationTarget.Workspace : 
        vscode.ConfigurationTarget.Global;
      await config.update('sortOrder', next, target);
      await refreshContext();
      vscode.window.showInformationMessage(`RPG Quick Navigator: Sort order set to ${next}.`);
      provider.refresh();
    }),
    vscode.commands.registerCommand('rpgQuickNavigator.toggleSortOrder.alphabetical', () => vscode.commands.executeCommand('rpgQuickNavigator.toggleSortOrder')),
    vscode.commands.registerCommand('rpgQuickNavigator.toggleSortOrder.chronological', () => vscode.commands.executeCommand('rpgQuickNavigator.toggleSortOrder')),
    vscode.commands.registerCommand('rpgQuickNavigator.toggleGroupByKind', async () => {
      const config = vscode.workspace.getConfiguration('rpgQuickNavigator');
      const current = getConfigs().isGrouped;
      const next = !current;
      const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
      const target = hasWorkspace ? 
        vscode.ConfigurationTarget.Workspace : 
        vscode.ConfigurationTarget.Global;
      await config.update('groupByKind', next, target);
      await refreshContext();
      vscode.window.showInformationMessage(`RPG Quick Navigator: Group by kind ${next ? 'enabled' : 'disabled'}.`);
      provider.refresh();
    }),
    vscode.commands.registerCommand('rpgQuickNavigator.toggleGroupByKind.group', () => vscode.commands.executeCommand('rpgQuickNavigator.toggleGroupByKind')),
    vscode.commands.registerCommand('rpgQuickNavigator.toggleGroupByKind.ungroup', () => vscode.commands.executeCommand('rpgQuickNavigator.toggleGroupByKind')),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('rpgQuickNavigator.sortOrder') || e.affectsConfiguration('rpgQuickNavigator.groupByKind')) {
        void refreshContext();
        provider.refresh();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      void refreshContext();
      provider.refresh();
    }),
    vscode.workspace.onDidChangeTextDocument(() => provider.refresh())
  );
  (async () => {
    const openedOnce = ctx.globalState.get<boolean>('rpgQuickNavigator.openedOnce');
    if (!openedOnce) {
      await vscode.commands.executeCommand('workbench.view.extension.rpgQuickNavigator');
      await ctx.globalState.update('rpgQuickNavigator.openedOnce', true);
    }
  })();
  async function refreshContext() {
    const configs = getConfigs();
    const hasRpgEditor = hasActiveRpgEditor();
    const commands: [string, unknown][] = [
      ['rpgQuickNavigator.sortOrder',          configs.sortOrder],
      ['rpgQuickNavigator.groupByKind',        configs.isGrouped],
      ['rpgQuickNavigator.hasActiveRpgEditor', hasRpgEditor]
    ]
    await Promise.all(
      commands.map(([key, value]) =>
        vscode.commands.executeCommand('setContext', key, value)
      )
    );
  }
}

const categories = ['procedure', 'variable', 'declaredFile', 'toDo'] as const;
type Category = typeof categories[number];
type SortOrder = 'alphabetical' | 'chronological';
interface Configs {
  sortOrder: SortOrder;
  isGrouped: boolean;
}

function getConfigs(): Configs {
  const config = vscode.workspace.getConfiguration('rpgQuickNavigator');
  const sortOrder = config.get<SortOrder>('sortOrder') ?? 'chronological';
  const isGrouped = config.get<boolean>('groupByKind') ?? true;
  return {sortOrder, isGrouped};
}

function isRpgLanguageId(languageId: string): boolean {
  return (
    languageId === 'rpg' ||
    languageId === 'rpgle' ||
    languageId === 'sqlrpgle'
  );
}

function hasActiveRpgEditor(): boolean {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return false;
  return isRpgLanguageId(editor.document.languageId);
}

class RpgTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  private _refreshTimer: NodeJS.Timeout | undefined;
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
        const documentUri = documentCache.uri ? 
          vscode.Uri.parse(documentCache.uri) : 
          undefined;
        const childTreeItems: vscode.TreeItem[] = (sym as any).values?.map((memberSymbol: any) => {
          const label = memberSymbol.name + 
            (memberSymbol.dclType ? 
              ` : ${memberSymbol.dclType}` : 
              (memberSymbol.value ? 
                ` = ${memberSymbol.value}` : 
                ''));
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
    let doc: RpgDocument | undefined;
    let revealUri: vscode.Uri | undefined;

    if (editor && isRpgLanguageId(editor.document.languageId)) {
      doc = getCachedDocument(editor.document);
      revealUri = editor.document.uri;
    } else if (documentCache.doc && documentCache.uri) {
      doc = documentCache.doc;
      revealUri = vscode.Uri.parse(documentCache.uri);
    } else {
      return [new vscode.TreeItem('Open a RPG file to analyze')];
    }
    

    const groups: Record<Category, RpgSymbol[]> = {
      procedure: [],
      variable: [],
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
        const order = getConfigs().sortOrder;
        item.description = `${count} - ${order === 'chronological' ? '1→n' : 'A→Z'}`;
        item.tooltip = new vscode.MarkdownString(
          `**${labelForCategory(key)}:**  \nNumber of items: ${count}  \nSort Order: ${order === 'chronological' ? 'Chronological (1→n)' : 'Alphabetical (A→Z)'}`
        );
        const catIcon: Record<Category, vscode.ThemeIcon> = {
          procedure:    new vscode.ThemeIcon('symbol-method'),
          variable:     new vscode.ThemeIcon('symbol-variable'),
          declaredFile: new vscode.ThemeIcon('symbol-file'),
          toDo:         new vscode.ThemeIcon('comment')
        };
        item.iconPath = catIcon[key];
        return item;
      });
    }

    const catId = element.id as Category;
    const list = groups[catId] ?? [];
    const order = getConfigs().sortOrder;
    function kindRank(sym: RpgSymbol): number {
      if (catId === 'procedure') {
        if (sym.kind === 'procedure')  return 0;
        if (sym.kind === 'subroutine') return 1;
        return 2;
      }
      if (catId === 'variable') {
        switch (sym.kind) {
          case 'constant':      return 0;
          case 'enum':          return 1;
          case 'itemEnum':      return 2;
          case 'variable':      return 3;
          case 'dataStructure': return 4;
          case 'itemDS':        return 5;
        default:                return 6;
        }
      }
      if (catId === 'declaredFile') {
        if (sym.kind !== 'declaredFile') return 3;
        switch (sym.fileType) {
          case 'Data file (PF/LF)':      return 0;
          case 'Display file (DSPF)':    return 1;
          case 'Printer file (PRTF)':    return 2;
          default:                       return 3;
        }
      }
      return 0;
    }  

    const sorted = [...list].sort((a, b) => {
      const isGrouped = getConfigs().isGrouped;
      if (isGrouped) {
        const rankA = kindRank(a);
        const rankB = kindRank(b);
        if (rankA !== rankB) return rankA - rankB;
      }

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
      const collapsibleItemState = (sym.kind === 'dataStructure' || sym.kind === 'enum') ? 
        vscode.TreeItemCollapsibleState.Collapsed : 
        vscode.TreeItemCollapsibleState.None;
      const item = new SymbolItem(
          sym, 
          label, 
          collapsibleItemState
        );
      item.id = `${catId}-${(sym as any).name ?? (sym as any).text}-${sym.range.start.line}`;
      
      let symbolIcon: vscode.ThemeIcon;
      if      (sym.kind === 'procedure')      symbolIcon = new vscode.ThemeIcon('gear');
      else if (sym.kind === 'subroutine')     symbolIcon = new vscode.ThemeIcon('note');
      else if (sym.kind === 'constant')       symbolIcon = new vscode.ThemeIcon('symbol-constant');
      else if (sym.kind === 'variable')       symbolIcon = new vscode.ThemeIcon('symbol-variable');
      else if (sym.kind === 'dataStructure')  symbolIcon = new vscode.ThemeIcon('symbol-structure');
      else if (sym.kind === 'enum')           symbolIcon = new vscode.ThemeIcon('symbol-value');
      else if (sym.kind === 'declaredFile')   symbolIcon = new vscode.ThemeIcon('symbol-file');
      else                                    symbolIcon = new vscode.ThemeIcon('comment');

      item.iconPath = symbolIcon;
      item.command = {
        command: 'rpgQuickNavigator.reveal',
        title: 'Reveal symbol',
        arguments: [revealUri, sym.range.start.line]
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
    case 'variable':
      return 'Variables';
    case 'declaredFile':
      return 'Files';
    case 'toDo':
      return 'To Do';
    default:
      return String(cat);
  }
}

function labelForSymbol(sym: RpgSymbol): string {
  return sym.kind === 'toDo' ? 
    sym.text : 
    (sym as any).name;
}

async function analyzeCurrent() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor.');
    return;
  }
  const doc = getCachedDocument(editor.document);
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

    if (msg?.type === 'refresh') {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('RPG Quick Navigator: No active editor to refresh from.');
        return;
      }
      const newDoc = getCachedDocument(editor.document);
      panel.webview.html = renderReport(newDoc);
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

interface ReportSections {
  procedures:     Extract<RpgSymbol, {kind: 'procedure'}>[];
  subroutines:    Extract<RpgSymbol, {kind: 'subroutine'}>[];
  constants:      Extract<RpgSymbol, {kind: 'constant'}>[];
  variables:      Extract<RpgSymbol, {kind: 'variable'}>[];
  dataStructures: Extract<RpgSymbol, {kind: 'dataStructure'}>[];
  enums:          Extract<RpgSymbol, {kind: 'enum'}>[];
  declaredFiles:  Extract<RpgSymbol, {kind: 'declaredFile'}>[];
  toDos:          Extract<RpgSymbol, {kind: 'toDo'}>[];
}

interface ReportCounts {
  procedure:     number;
  subroutine:    number;
  constant:      number;
  variable:      number;
  dataStructure: number;
  enum:          number;
  declaredFile:  number;
  toDo:          number;
  controlBlocks: number;
  toDos:         number;
}

function computeReportData(doc: RpgDocument): {
  sections: ReportSections;
  counts:   ReportCounts;
} {
  const symbols = doc.symbols;
  const sections: ReportSections = {
    procedures:     symbols.filter((s): s is Extract<RpgSymbol, {kind: 'procedure'}>     => s.kind === 'procedure'),
    subroutines:    symbols.filter((s): s is Extract<RpgSymbol, {kind: 'subroutine'}>    => s.kind === 'subroutine'),
    constants:      symbols.filter((s): s is Extract<RpgSymbol, {kind: 'constant'}>      => s.kind === 'constant'),
    variables:      symbols.filter((s): s is Extract<RpgSymbol, {kind: 'variable'}>      => s.kind === 'variable'),
    dataStructures: symbols.filter((s): s is Extract<RpgSymbol, {kind: 'dataStructure'}> => s.kind === 'dataStructure'),
    enums:          symbols.filter((s): s is Extract<RpgSymbol, {kind: 'enum'}>          => s.kind === 'enum'),
    declaredFiles:  symbols.filter((s): s is Extract<RpgSymbol, {kind: 'declaredFile'}>  => s.kind === 'declaredFile'),
    toDos:          symbols.filter((s): s is Extract<RpgSymbol, {kind: 'toDo'}>          => s.kind === 'toDo'),
  }
  const counts: ReportCounts = {
    procedure:     sections.procedures.length,
    subroutine:    sections.subroutines.length,
    constant:      sections.constants.length,
    variable:      sections.variables.length,
    dataStructure: sections.dataStructures.length,
    enum:          sections.enums.length,
    declaredFile:  sections.declaredFiles.length,
    toDo:          sections.toDos.length,
    controlBlocks: doc.metrics.controlBlocks,
    toDos:         doc.metrics.toDos,
  }
  return {sections, counts};
}

function renderReport(doc: RpgDocument): string {
  const json = escapeHtml(JSON.stringify(doc, null, 2));
  const {sections, counts} = computeReportData(doc);

  return `
  <!DOCTYPE html>
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
        .card { padding: 12px; border: 1px solid #cccccc; border-radius: 4px; box-shadow: 0 1px 3px #22222280; }
        .muted { color: #666666; font-size: 12px; }
        .btn { display: inline-block; border: 1px solid #888888; border-radius: 3px; padding: 6px 10px; cursor: pointer; user-select: none; background: #007acc; color: white; }
        pre { background: #222222; color: #cccccc; padding: 12px; border-radius: 4px; overflow: auto; }
        ul { margin: 8px 0 0 20px; }
        .section { margin-top: 10px; }
        .title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      </style>
    </head>
    <body>
      <div class="title">
        <h1>RPG Analysis</h1>
        <div>
          <button class="btn" onclick="refreshReport()">Refresh</button>
          <button class="btn" onclick="copyJson()">Copy JSON</button>
        </div>
      </div>
        
      <div class="grid">
        <div class="card"><b>Procedures</b>     <div class="muted">${counts.procedure}</div></div>
        <div class="card"><b>Subroutines</b>    <div class="muted">${counts.subroutine}</div></div>
        <div class="card"><b>Constants</b>      <div class="muted">${counts.constant}</div></div>
        <div class="card"><b>Variables</b>      <div class="muted">${counts.variable}</div></div>
        <div class="card"><b>Data Structures</b><div class="muted">${counts.dataStructure}</div></div>
        <div class="card"><b>Enumerations</b>   <div class="muted">${counts.enum}</div></div>
        <div class="card"><b>Files</b>          <div class="muted">${counts.declaredFile}</div></div>
        <div class="card"><b>TODOs</b>          <div class="muted">${counts.toDos}</div></div>
        <div class="card"><b>Control Blocks</b> <div class="muted">${counts.controlBlocks}</div></div>
      </div>
        
      ${renderSection('Procedures',      sections.procedures,     (s:any) => s.name)}
      ${renderSection('Subroutines',     sections.subroutines,    (s:any) => s.name)}
      ${renderSection('Constants',       sections.constants,      (s:any) => s.name)}
      ${renderSection('Variables',       sections.variables,      (s:any) => s.name + ' : ' + s.dclType )}
      ${renderSection('Data Structures', sections.dataStructures, (s:any) => s.name)} 
      ${renderSection('Enums',           sections.enums,          (s:any) => s.name)} 
      ${renderSection('Files',           sections.declaredFiles,  (s:any) => s.name)}
      ${renderSection('To Do Items',     sections.toDos,          (s:any) => s.text)}

      <div class="section">
        <h2>Raw JSON</h2>
        <pre id="json">${json}</pre>
      </div>

      <script>
        function getVsApi() {
          return (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
        }

        function refreshReport() {
          const vs = getVsApi();
          if (vs) vs.postMessage({ type: 'refresh' });
        }

        function copyJson() {
          const pre = document.getElementById('json');
          const vs = getVsApi();
          if (vs) {
            vs.postMessage({ type: 'copy' });
          } else {
            const r = document.createRange();
            r.selectNodeContents(pre);
            const select = window.getSelection();
            select.removeAllRanges();
            select.addRange(r);
            try {
              document.execCommand('copy');
            } finally {
              select.removeAllRanges();
            }
          }
        }
      </script>
    </body>
  </html>
  `;
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
  return `
  <div class="section card">
    <h2>${escapeHtml(title)}</h2>
    <ul>${items}</ul>
  </div>
  `;
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
