import * as vscode from 'vscode';
import { parse } from './parser/parse';
import { RpgDocument, RpgSymbol, ScopeInfo } from './parser/ast';

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
        provideHover(document, position, _token) {
          const wordRange = document.getWordRangeAtPosition(position);
          if (!wordRange) return;

          const word = document.getText(wordRange);
          const doc = getCachedDocument(document);
          
        //   const sym = doc.symbols.find(s => {
        //     if (s.kind === 'toDo') return s.text === word;
        //     return 'name' in s && s.name === word;
        // });
        //   if (!sym) return; 
        //   const md = new vscode.Hover(buildSymbolTooltip(sym));
        //   return md;
          const toDoSym = doc.symbols.find(s =>
            s.kind === 'toDo' &&
            s.range.start.line === position.line &&
            s.text.toLowerCase().includes(word.toLowerCase())
          );
          if (toDoSym) {
            return new vscode.Hover(buildSymbolTooltip(toDoSym));
          }  

          const namedSym = doc.symbols.filter(s =>
            s.kind !== 'toDo' && 'name' in s && s.name === word
          );
          
          if (!namedSym.length) return;

          const currentProc = getCurrentProcedure(doc, position);

          let sym: RpgSymbol | undefined;

          if (currentProc) {
            sym = namedSym.find(s => 
              s.reach.scopeKind === 'procedure' &&
              s.reach.ownerName === currentProc.name
            );
          }

          if (!sym) {
            sym = namedSym.find(s => s.reach.scopeKind === 'global');
          }

          if (!sym) {
            sym = namedSym[0];
          }

          if (sym) {
            return new vscode.Hover(buildSymbolTooltip(sym));
          }

          return;
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
          case 'variable':      return 0;
          case 'dataStructure': return 1;
          case 'itemDS':        return 2;
          case 'constant':      return 3;
          case 'enum':          return 4;
          case 'itemEnum':      return 5;
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
    vscode.window.showInformationMessage('RPG Quick Navigator: No active editor.');
    return;
  }

  const sourceUri = editor.document.uri;
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

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg?.type === 'copy') {
      vscode.env.clipboard.writeText(JSON.stringify(doc, null, 2));
      vscode.window.showInformationMessage('Analysis JSON copied to clipboard.');
    }

    if (msg?.type === 'refresh') {
      if (!editor) {
        vscode.window.showInformationMessage('RPG Quick Navigator: No active editor to refresh from.');
        return;
      }
      const textDoc = await vscode.workspace.openTextDocument(sourceUri);
      const newDoc = getCachedDocument(textDoc);
      panel.webview.html = renderReport(newDoc);
    }

    if (msg?.type === 'revealLine') {
      const line = typeof msg.line === 'number' ?
        msg.line :
        0;
      const textDoc = await vscode.workspace.openTextDocument(sourceUri);
      await vscode.window.showTextDocument(textDoc, {
        selection: new vscode.Range(line, 0, line, 0),
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
      })
      /*void vscode.commands.executeCommand('revealLine', {
        lineNumber: line,
        at: 'center'
      });*/
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
        :root {
          --bg: #1e1e1e;
          --bg-card: #252525;
          --border: #3c3c3c;
          --text: #f3f3f3;
          --counts: #bbbbbb;
          --muted: #9e9e9e;
          --accent: #007acc;
          --accent-soft: #007acc40;
          --accent-border: #005a9e;
          --badge-bg: #3c3c3c;
          --pre-bg: #1a1a1a;
          --pre: #cccccc;
          --shadow: #00000060;
        }
        body { 
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; 
          margin: 0; 
          padding: 16px; 
          background: var(--bg);
          color: var(--text);
        }
        h1 { 
          margin: 0 0 12px; 
          font-size: 18px; 
        }
        h2 {
          margin: 0 0 6px; 
          font-size: 15px; 
        }
        .title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 12px;
        }
        .title-sub {
          font-size: 12px;
          color: var(--muted);
        }
        .btn {
          display: inline-block;
          border-radius: 3px;
          padding: 6px 10px;
          cursor: pointer;
          user-select: none;
          background: var(--accent);
          color: white;
          border: 1px solid var(--accent-border);
          font-size: 12px;
          margin-left: 6px;
        }
        .btn.secondary {
          background: transparent;
          color: var(--text);
          border-color: var(--border);
        }
        .icon-refresh {
          margin-right: 4px;
          font-size: 12px;
          vertical-align: middle;
        }
        .btn:hover {
          filter: brightness(1.1);
        }
        .layout {
          display: grid;
          grid-template-columns: minmax(260px, 1.1fr) minmax(260px, 1.3fr);
          gap: 16px;
        }
        @media (max-width: 1000px) {
          .layout {
            grid-template-columns: 1fr;
          }
        }
        .grid {
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); 
          gap: 10px;
        }
        .card {
          padding: 12px; 
          border: 1px solid var(--border); 
          border-radius: 6px; 
          background: var(--bg-card);
          box-shadow: 0 1px 3px var(--shadow);
        }
        .summary-card-title {
          display: flex;
          align-items: baseline;
          gap: 4px;
          margin-bottom: 4px;
        }
        .summary-card-title span:first-child {
          font-size: 14px;
          font-weight: 600;
        }
        .summary-count {
          color: var(--counts);
          font-weight: 700;
          font-size: 16px;
        }
        .summary-label {
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.04em;
        }
        .badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 999px;
          background: var(--badge-bg);
          font-size: 11px;
          color: var(--muted);
        }
        .section {
          margin-top: 10px;
        }
        details.section {
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--bg-card);
          margin-top: 8px;
        }
        details.section summary {
          list-style: none;
          cursor: pointer;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        details.section summary::before {
          content: "+"; <!-- "˃"; -->
          margin-right: 6px;
          font-size: 20px;
          opacity: 0.75;
        }
        details.section[open] summary::before {
          content: "-"; <!-- "˅"; -->
        }
        details.section summary::-webkit-details-marker {
          display: none;
        }
        .section-title {
          font-weight: 500;
        }
        .section-count {
          font-size: 11px;
          color: var(--muted);
        }
        .section-body {
          padding: 0 10px 8px 10px;
        }
        ul {
          margin: 6px 0 0 16px;
          padding: 0;
        }
        li {
          margin: 2px 0;
          font-size: 12px;
          font-family: Menlo, Consolas, monospace;
          white-space: pre;
        }
        li a {
          color: inherit;
          text-decoration: none;
          border-bottom: 1px dashed transparent;
          cursor: pointer;
        }
        li a:hover {
          color: var(--accent);
          border-bottom-color: var(--accent-soft);
        }
        .muted {
          color: var(--muted); 
          font-size: 11px;
        }
        pre {
          background: var(--pre-bg);
          color: var(--pre);
          padding: 10px; 
          border-radius: 4px; 
          overflow: auto; 
          font-size: 11px;
          max-height: 320px;
        }
        .json-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
        }
      </style>
    </head>
    <body>
      <div class="title">
        <div>
          <h1>RPG Analysis</h1>
          <div class="title-sub">
            Summary of procedures, variables, files and control structures for the current RPG source.
          </div>
        </div>
        <div>
          <button class="btn secondary" onclick="refreshReport()">
            <span class="icon-refresh" aria-hidden="true">⟳</span>
            <span>Refresh</span>
          </button>
          <button class="btn" onclick="copyJson()">Copy JSON</button>
        </div>
      </div>
        
      <div class="layout"> 
                <!-- LEFT: SUMMARY -->
        <div class="card">
          <h2>Summary</h2>
          <div class="grid">
            <div>
              <div class="summary-card-title">
                <span>Procedures</span>
                <span class="summary-count">${counts.procedure}</span>
              </div>
              <div class="summary-label">dcl-proc (…) end-proc</div>
            </div>

            <div>
              <div class="summary-card-title">
                <span>Subroutines</span>
                <span class="summary-count">${counts.subroutine}</span>
              </div>
              <div class="summary-label">begsr (…) endsr</div>
            </div>

            <div>
              <div class="summary-card-title">
                <span>Constants</span>
                <span class="summary-count">${counts.constant}</span>
              </div>
              <div class="summary-label">dcl-c</div>
            </div>

            <div>
              <div class="summary-card-title">
                <span>Variables</span>
                <span class="summary-count">${counts.variable}</span>
              </div>
              <div class="summary-label">dcl-s</div>
            </div>

            <div>
              <div class="summary-card-title">
                <span>Data structures</span>
                <span class="summary-count">${counts.dataStructure}</span>
              </div>
              <div class="summary-label">dcl-ds (…) end-ds</div>
            </div>

            <div>
              <div class="summary-card-title">
                <span>Enums</span>
                <span class="summary-count">${counts.enum}</span>
              </div>
              <div class="summary-label">dcl-enum (…) end-enum</div>
            </div>

            <div>
              <div class="summary-card-title">
                <span>Files</span>
                <span class="summary-count">${counts.declaredFile}</span>
              </div>
              <div class="summary-label">dcl-f (PF/LF/DSPF/PRTF)</div>
            </div>

            <div>
              <div class="summary-card-title">
                <span>TODOs</span>
                <span class="summary-count">${counts.toDos}</span>
              </div>
              <div class="summary-label">// TODO comments</div>
            </div>

            <div>
              <div class="summary-card-title">
                <span>Control blocks</span>
                <span class="summary-count">${counts.controlBlocks}</span>
              </div>
              <div class="summary-label">if / select / for / dow / dou / do … </div>
            </div>
          </div>
        </div>

                <!-- RIGHT: SYMBOL LISTS + JSON -->
        <div>
          ${renderSection(
            'Procedures',      
            sections.procedures,     
            (s:any) => {
              const scope:    string = s.reach.scopeKind === 'global' ? 'global' : s.reach.ownerName ?? '?';
              const name:     string = padRight(s.name ?? '', 30);
              const isExport: string = s.isExport ? ' and exported' : '';
              const flags:    string = padRight('[' + scope.trim() + isExport + ']', 43);
              return `${name} ${flags}`;
            }
          )}
          ${renderSection(
            'Subroutines',     
            sections.subroutines,    
            (s:any) => {
              const scope:    string = padRight(s.reach.scopeKind === 'global' ? 'global' : s.reach.ownerName ?? '?', 30);
              const name:     string = padRight(s.name ?? '', 30);
              const flags:    string = padRight('[' + scope.trim() + ']', 30);
              return `${name} ${flags}`;
            }
          )}
          ${renderSection(
            'Constants',       
            sections.constants,      
            (s:any) => {
              const scope:    string = padRight(s.reach.scopeKind === 'global' ? 'global' : s.reach.ownerName ?? '?', 30);
              const name:     string = padRight(s.name ?? '', 30);
              const value:    string = padRight(s.value ? `= ${s.value}` : '', 40);
              const flags:    string = padRight('[' + scope.trim() + ']', 20);
              return `${name} ${value} ${flags}`;
            }
          )}
          ${renderSection(
            'Variables',       
            sections.variables,      
            (s:any) => {
              const scope:    string = padRight(s.reach.scopeKind === 'global' ? 'global' : s.reach.ownerName ?? '?', 30);
              const name:     string = padRight(s.name ?? '', 30);
              let type:       string = s.dclType ?? '';
              if (s.isTab && s.tabDim) {
                type += ` dim(${s.tabDim})`;
              }
              type = padRight(type, 40);
              const flags:    string = padRight('[' + scope.trim() + ']', 20);
              return `${name} ${type} ${flags}`;
            }
          )}
          ${renderSection(
            'Data Structures', 
            sections.dataStructures, 
            (s:any) => {
              const scope:    string = padRight(s.reach.scopeKind === 'global' ? 'global' : s.reach.ownerName ?? '?', 30);
              const name:     string = padRight(s.name ?? '', 30);
              const opts:     string = padRight(s.options ?? '', 40);
              const flags:    string = padRight('[' + scope.trim() + ']', 20);
              return `${name} ${opts} ${flags}`;
            }
          )} 
          ${renderSection(
            'Enums',           
            sections.enums,          
            (s:any) => {
              const scope:    string = padRight(s.reach.scopeKind === 'global' ? 'global' : s.reach.ownerName ?? '?', 30);
              const name:     string = padRight(s.name ?? '', 30);
              const opts:     string = padRight(s.options ?? '', 40);
              const flags:    string = padRight('[' + scope.trim() + ']', 20);
              return `${name} ${opts} ${flags}`;
            }
          )} 
          ${renderSection(
            'Files',           
            sections.declaredFiles,  
            (s:any) => {
              const scope:    string = padRight(s.reach.scopeKind === 'global' ? 'global' : s.reach.ownerName ?? '?', 30);
              const name:     string = padRight(s.name ?? '', 30);
              const opts:     string = padRight(s.fileOptions ?? '', 40);
              const flags:    string = padRight('[' + scope.trim() + ']', 20);
              return `${name} ${opts} ${flags}`;
            }
          )}
          ${renderSection(
            'To Do Items',     
            sections.toDos,          
            (s:any) => {
              const scope:    string = padRight('[' + s.reach.scopeKind === 'global' ? 'global' : s.reach.ownerName ?? '?' + ']', 30);
              const flags:    string = padRight('[' + scope.trim() + ']', 20); 
              const text:     string = padRight(s.text, 120);
              return `${flags} ${text}`;
            }
          )}

          <div class="section card" style="margin-top: 10px;">
            <div class="json-title">
              <h2 style="margin: 0;">Raw JSON</h2>
              <span class="badge">Full parser output</span>
            </div>
            <pre id="json">${json}</pre>
          </div>
        </div>
      </div>

      <script>
        const vs = getVsApi();

        function getVsApi() {
          return (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
        }

        function refreshReport() {
          if (vs) vs.postMessage({ type: 'refresh' });
        }

        function copyJson() {
          const pre = document.getElementById('json');
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
        
        function revealLine(line) {
          if (!vs) return;
          vs.postMessage({type: 'revealLine', line});
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
    .map((sel) => {
      const labelText = label(sel);
      const line = sel.range.start.line + 1;
      return `
        <li>
          <a onclick="revealLine(${sel.range.start.line})">
            ${escapeHtml(labelText)}
          </a>
          <span class="muted">(line ${line})</span>
        </li>
      `;
    })
    .join('\n');

  return `
    <details class="section" open>
      <summary>
        <span class="section-title">${escapeHtml(title)}</span>
        <span class="section-count">${list.length} item(s)</span>
      </summary>
      <div class="section-body">
        <ul>${items}</ul>
      </div>
    </details>
  `;
}

function padRight(text: string, width: number): string {
  if (text.length > width - 2) {
    return text.substring(0, width - 2) + '… ';
  }
  return text + ' '.repeat(width - text.length);
}

function getCurrentProcedure(
  doc: RpgDocument, 
  position: vscode.Position
): 
Extract<RpgSymbol, {kind: 'procedure'}> | undefined {
  const procedures = doc.symbols.filter(
    (s): s is Extract<RpgSymbol, {kind: 'procedure'}> => s.kind === 'procedure' &&
    s.range.start.line <= position.line
  );

  if (!procedures.length) return undefined;

  procedures.sort((a, b) => a.range.start.line - b.range.start.line);
  return procedures[procedures.length - 1];
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
  md.appendMarkdown(`Scope: ${formatScope(sym.reach)}  \n`);
  md.appendMarkdown(`Defined at line ${sym.range.start.line + 1}  \n`);
  return md;

  function formatScope(reach: ScopeInfo): string {
    switch (reach.scopeKind) {
      case 'global':
        return 'global';
      case 'procedure':
        return `procedure _${reach.ownerName?? '?'}_`;
      case 'dataStructure':
        return `data structure _${reach.ownerName?? '?'}_`;
      case 'enum':
        return `enum _${reach.ownerName?? '?'}_`;
      default:
        return reach.ownerName?? 'unknown';
    }
  }
}

export function deactivate() {}
