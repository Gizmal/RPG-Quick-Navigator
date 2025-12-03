import {
  Range,
  ScopeKind,
  ScopeInfo,
  RpgDocument,
  RpgSymbol,
  Procedure,
  Subroutine,
  Constant,
  Variable,
  DataStructure,
  ItemDS,
  Enum,
  ItemEnum,
  DeclaredFile,
  ToDo
} from './ast';

const PROC_RE          = /^\s*dcl-proc\s+([a-z][a-z0-9_]*)\b/i;
const ENDPROC_RE       = /^\s*end-proc\b/i;
const BEGSR_RE         = /^\s*begsr\s+([a-z][a-z0-9_]*)\b/i;
const ENDSR_RE         = /^\s*endsr\b/i;
const CONST_RE         = /^\s*dcl-c\s+([a-z][a-z0-9_]*)(?:\s+([^;]+))?;/i;
const VAR_RE           = /^\s*dcl-s\s+([a-z][a-z0-9_]*)\s+([^;]+);/i;
const DS_RE            = /^\s*dcl-ds\s+([a-z][a-z0-9_]*)(?:\s+([^;]+))?;/i;
const ENDDS_RE         = /^\s*end-ds\b/i;
const ENUM_RE          = /^\s*dcl-enum\s+([a-z][a-z0-9_]*)(?:\s+([^;]+))?;/i;
const ENDENUM_RE       = /^\s*end-enum\b/i;
const DSENUMITEM_RE    = /^\s*([a-z][a-z0-9_]*)\s+([^;]+);/i;
const TABDIM_RE        = /dim\s*\(\s*([^\)]+)\s*\)/i;
const DECLAREDFILE_RE  = /^\s*dcl-f\s+([a-z][a-z0-9_]*)(?:\s+([^;]+))?;/i;
const TODO_RE          = /^\s*to\s*do\s*:?(.*)$/i;
const CONTROL_RE       = /^\s*(if|elseif|else|select|when|other|for|dow|do)\b/i;
// toDo: detection of read/write/chain/exfmt files for PF/PRTF/DSPF

export function parse(text: string): RpgDocument {
  interface SplittedLine {
      code:    string;
      comment: string;
    }
  
  const symbols: RpgSymbol[] = [];
  let currentScope: ScopeInfo = { 
    scopeKind: 'global', 
    ownerName: undefined 
  };

  const lines = text.split(/\r?\n/);
  let controlBlocks = 0;
  let execRegex: RegExpExecArray | null;
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const currentLine: SplittedLine = splitRpgLine(lines[lineNum] ?? '');

    // ----- PROC / END-PROC -------------------------
    execRegex = PROC_RE.exec(currentLine.code);
    if (execRegex) {
      const procName:     string  = execRegex[1]!;
      const procIsExport: boolean = ((execRegex[2]?.trim() ?? '').toLowerCase().includes('export'));
      symbols.push(makeProc(
        procName, 
        procIsExport, 
        lineNum, 
        currentLine.code.length
      ));
      // local scope
      currentScope = { 
        scopeKind: 'procedure', 
        ownerName: procName 
      };
      continue;
    }

    if (ENDPROC_RE.test(currentLine.code)) {
      // back to global scope
      currentScope = { 
        scopeKind: 'global', 
        ownerName: undefined 
      };
      continue;
    }

    // ----- BEGSR / ENDSR -------------------------
    execRegex = BEGSR_RE.exec(currentLine.code);
    if (execRegex) {
      const subrName: string = execRegex[1]!;
      symbols.push(makeSubr(
        subrName, 
        lineNum, 
        currentLine.code.length, 
        currentScope
      ));
      // no scope change
    }

    if (ENDSR_RE.test(currentLine.code)) {
      // no scope change
    }

    // ----- DCL-C -------------------------
    execRegex = CONST_RE.exec(currentLine.code);
    if (execRegex) {
      const constName  = execRegex[1]!;
      const constValue = execRegex[2]?.trim() ?? '';  
      symbols.push(makeConst(
        constName, 
        constValue, 
        lineNum, 
        currentLine.code.length, 
        currentScope
      ));
    }

    // ----- DCL-S -------------------------
    execRegex = VAR_RE.exec(currentLine.code);
    if (execRegex) {
      const varName: string = execRegex[1]!;
      const varType: string = execRegex[2]!.trim().toLowerCase();
      const varTab = extractTab(varType);
      symbols.push(makeVar(
        varName, 
        varType, 
        varTab.isTab, 
        varTab.tabDim, 
        lineNum, 
        currentLine.code.length, 
        currentScope
      ));
    }

    // ----- DCL-DS / END-DS -------------------------
    execRegex = DS_RE.exec(currentLine.code);
    if (execRegex) {
      const dsName:    string = execRegex[1]!;
      const dsOptions: string = (execRegex[2]?.trim() ?? '').toLowerCase();
      const dsContent: string[] = extractContent(
        lineNum, 
        lines, 
        ENDDS_RE
      );
      const dsItem: ItemDS[] = parseItemsForDS(
        DSENUMITEM_RE, 
        dsContent, 
        lineNum, 
        dsName
      );
      const dsDim = extractTab(dsOptions);
      symbols.push(makeDS(
        dsName, 
        dsOptions, 
        dsItem, 
        dsDim.isTab, 
        dsDim.tabDim, 
        lineNum, 
        currentLine.code.length, 
        currentScope
      ));
      symbols.push(...dsItem);
    }

    if (ENDDS_RE.test(currentLine.code)) {
      // ø
    }

    // ----- DCL-ENUM / END-ENUM -------------------------
    execRegex = ENUM_RE.exec(currentLine.code);
    if (execRegex) {
      const enumName:    string = execRegex[1]!;
      const enumOptions: string = (execRegex[2]?.trim() ?? '').toLowerCase();
      const enumContent: string[] = extractContent(
        lineNum, 
        lines, 
        ENDENUM_RE
      );
      const enumItem: ItemEnum[] = parseItemsForEnum(
        DSENUMITEM_RE, 
        enumContent, 
        lineNum,
        enumName
      );
      symbols.push(makeEnum(
        enumName, 
        enumOptions, 
        enumItem, 
        lineNum, 
        currentLine.code.length, 
        currentScope
      ));
      symbols.push(...enumItem);
    }

    if (ENDENUM_RE.test(currentLine.code)) {
      // ø
    }

    // ----- DCL-F -------------------------
    execRegex = DECLAREDFILE_RE.exec(currentLine.code);
    if (execRegex) {
      const fileName:    string = execRegex[1]!;
      const fileOptions: string = (execRegex[2]!.trim() ?? '');
      let   fileType:    string;
      if (fileOptions.toLowerCase().includes('workstn')) {
        fileType = 'Display file (DSPF)';
      }
      else if (fileOptions.toLowerCase().includes('printer')) {
        fileType = 'Printer file (PRTF)';
      }
      else {
        fileType = 'Data file (PF/LF)';
      }
      symbols.push(makeDeclaredFile(
        fileName, 
        fileType, 
        fileOptions, 
        lineNum, 
        currentLine.code.length, 
        currentScope
      ));
    }

    // ----- // TO DO : -------------------------
    execRegex = TODO_RE.exec(currentLine.comment);
    if (execRegex) {
      const toDoText: string = execRegex[1]!.trim();
      symbols.push(makeToDo(
        toDoText, 
        lineNum, 
        currentLine.comment.length, 
        currentScope
      ));
    }

    // // ----- Controls -------------------------
    if (CONTROL_RE.test(currentLine.code)) {
      controlBlocks++;
    }
  }

  return {
    symbols,
    metrics: {
      controlBlocks,
      toDos: symbols.filter(s => s.kind === 'toDo').length
    }
  };
  
  function splitRpgLine(line: string): SplittedLine {
    let inSingleQuote: boolean = false;
    let inDoubleQuote: boolean = false;

    for (let i = 0; i < line.length - 1; i++) {
      const character = line[i];
      const next = line[i + 1];

      if (character === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
      } else if (character === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
      } else if (!inSingleQuote && !inDoubleQuote && character === '/' && next === '/') {
        return {
          code: line.slice(0, i),
          comment: line.slice(i + 2),
        };
      }
    }
    return {
      code: line,
      comment: '',
    }
  }
}

function makeRange(
  line:   number, 
  length: number
): Range {
  return {
    start: { line, character: 0 },
    end:   { line, character: length }
  };
}

function makeProc(
  name:     string, 
  isExport: boolean, 
  line:     number, 
  length:   number
): Procedure {
  return {
    kind: 'procedure',
    name,
    isExport,
    range: makeRange(line, length),
    reach: {
      scopeKind: 'global',
      ownerName: undefined,
    }
  };
}

function makeSubr(
  name:   string, 
  line:   number, 
  length: number, 
  scope:  ScopeInfo
): Subroutine {
  return {
    kind: 'subroutine',
    name,
    range: makeRange(line, length),
    reach: { ...scope }
  };
}

function makeConst(
  name:   string, 
  value:  string, 
  line:   number, 
  length: number, 
  scope:  ScopeInfo
): Constant {
  return {
    kind: 'constant',
    name,
    value,
    range: makeRange(line, length),
    reach: { ...scope }
  };
}

function makeVar(
  name:    string, 
  dclType: string, 
  isTab:   boolean, 
  tabDim:  string, 
  line:    number, 
  length:  number, 
  scope:   ScopeInfo
): Variable {
  return {
    kind: 'variable',
    name,
    dclType,
    isTab,
    tabDim,
    range: makeRange(line, length),
    reach: { ...scope }
  };
}

function makeDS(
  name:    string, 
  options: string, 
  values:  ItemDS[], 
  isTab:   boolean, 
  tabDim:  string, 
  line:    number, 
  length:  number, 
  scope:   ScopeInfo
): DataStructure {
  return {
    kind: 'dataStructure',
    name,
    options,
    values,
    isTab,
    tabDim,
    range: makeRange(line, length),
    reach: { ...scope }
  };
}

function makeEnum(
  name:    string, 
  options: string, 
  values:  ItemEnum[], 
  line:    number, 
  length:  number, 
  scope:   ScopeInfo
): Enum {
  return {
    kind: 'enum',
    name,
    options,
    values, 
    range: makeRange(line, length),
    reach: { ...scope }
  };
}

function makeDeclaredFile(
  name:        string, 
  fileType:    string, 
  fileOptions: string, 
  line:        number, 
  length:      number, 
  scope:       ScopeInfo
): DeclaredFile {
  return {
    kind: 'declaredFile',
    name,
    fileType,
    fileOptions,
    range: makeRange(line, length),
    reach: { ...scope }
  };
}

function makeToDo(
  text:   string, 
  line:   number, 
  length: number, 
  scope:  ScopeInfo
): ToDo {
  return {
    kind: 'toDo',
    text,
    range: makeRange(line, length),
    reach: { ...scope }
  };
}

function extractContent(
  lineNum:  number, 
  lines:    string[], 
  endRegex: RegExp
): string[] {
      let Content: string[] = [];
      let i = lineNum + 1;
      while (i < lines.length && !endRegex.test(lines[i] ?? '')) {
        Content.push(lines[i] ?? '');
        i++;
      }
      return Content.map(s => s.trim()).filter(s => s.length > 0);
}

function parseBlock(
  regex:   RegExp, 
  content: string[]
) {
  const items: { 
    name:     string; 
    value:    string; 
    offset:   number; 
    lineText: string 
  }[] = [];
  for (let i = 0; i < content.length; i++) {
    const lineText = content[i] ?? '';
    const execRegex = regex.exec(lineText);
    if (execRegex) {
      items.push({ 
        name:   execRegex[1]!.trim(), 
        value:  execRegex[2]!.trim(), 
        offset: i, 
        lineText 
      });
    }
  }
  return items;
}

function extractTab(def: string): { 
  isTab:  boolean; 
  tabDim: string 
} {
  const execRegex = TABDIM_RE.exec(def);
  if (execRegex) return { 
    isTab: true, 
    tabDim: (execRegex[1] ?? '').trim() 
  };
  return { 
    isTab: false, 
    tabDim: '' 
  };
}

function parseItemsForDS(
  regex:     RegExp, 
  content:   string[], 
  line:      number,
  ownerName: string
): ItemDS[] {
  const items = parseBlock(regex, content);
  return items.map(item => ({
    kind: 'itemDS',
    name: item.name,
    dclType: item.value,
    isTab: extractTab(item.value).isTab,
    tabDim: extractTab(item.value).tabDim,
    range: makeRange(line + 1 + item.offset, item.lineText.length),
    reach: {
      scopeKind: 'dataStructure',
      ownerName
    }
  }));
}

function parseItemsForEnum(
  regex:     RegExp, 
  content:   string[], 
  line:      number,
  ownerName: string
): ItemEnum[] {
  const items = parseBlock(regex, content);
  return items.map(item => ({
    kind: 'itemEnum',
    name: item.name,
    value: item.value,
    range: makeRange(line + 1 + item.offset, item.lineText.length),
    reach: {
      scopeKind: 'enum',
      ownerName: ownerName
    }
  }))
}
