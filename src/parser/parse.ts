import {
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
const TODO_RE          = /\/\/\s*to\s*do\s*:?(.*)$/i;
const CONTROL_RE       = /^\s*(if|elseif|else|select|when|other|for|dow|do)\b/i;
// toDo: detection of read/write/chain/exfmt files for PF/PRTF/DSPF

export function parse(text: string): RpgDocument {
  const lines = text.split(/\r?\n/);
  const symbols: RpgSymbol[] = [];
  let controlBlocks = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] ?? '';

    const mProc = PROC_RE.exec(line);
    if (mProc) {
      const procName: string = mProc[1]!;
      const procOptions: boolean = ((mProc[2]?.trim() ?? '').toLowerCase() === 'export');
      symbols.push(makeProc(procName, procOptions, lineNum, line.length));
    }

    if (ENDPROC_RE.test(line)) {
      // later
    }

    const mSubr = BEGSR_RE.exec(line);
    if (mSubr) {
      const subrName: string = mSubr[1]!;
      symbols.push(makeSubr(subrName, lineNum, line.length));
    }

    if (ENDSR_RE.test(line)) {
      // later
    }

    const mConst = CONST_RE.exec(line);
    if (mConst) {
      const constName = mConst[1]!;
      const constValue = mConst[2]?.trim() ?? '';  
      symbols.push(makeConst(constName, constValue, lineNum, line.length));
    }

    const mVar = VAR_RE.exec(line);
    if (mVar) {
      const varName: string = mVar[1]!;
      const varType: string = mVar[2]!.trim();
      const varTab = extractTab(varType);
      const varIsTab: boolean = varTab.isTab;
      const varTabDim: string = varTab.tabDim;
      symbols.push(makeVar(varName, varType, varIsTab, varTabDim, lineNum, line.length));
    }

    const mDs = DS_RE.exec(line);
    if (mDs) {
      const dsName: string = mDs[1]!;
      const dsOptions: string = mDs[2]?.trim() ?? '';
      const dsContent: string[] = extractContent(lineNum, lines, ENDDS_RE);
      const dsItem: ItemDS[] = parseItemsForDS(DSENUMITEM_RE, dsContent, lineNum);
      const dsDim = extractTab(dsOptions);
      const dsIsTab: boolean = dsDim.isTab;
      const dsTabDim: string = dsDim.tabDim;
      symbols.push(makeDS(dsName, dsOptions, dsItem, dsIsTab, dsTabDim, lineNum, line.length));
      symbols.push(...dsItem);
    }

    if (ENDDS_RE.test(line)) {
      // later
    }

    const mEnum = ENUM_RE.exec(line);
    if (mEnum) {
      const enumName: string = mEnum[1]!;
      const enumOptions: string = mEnum[2]?.trim() ?? '';
      const enumContent: string[] = extractContent(lineNum, lines, ENDENUM_RE);
      const enumItem: ItemEnum[] = parseItemsForEnum(DSENUMITEM_RE, enumContent, lineNum);
      symbols.push(makeEnum(enumName, enumOptions, enumItem, lineNum, line.length));
      symbols.push(...enumItem);
    }

    if (ENDENUM_RE.test(line)) {
      // later
    }

    const mDeclaredFile = DECLAREDFILE_RE.exec(line);
    if (mDeclaredFile) {
      const fileName: string = mDeclaredFile[1]!;
      const fileOptions: string = mDeclaredFile[2]!;
      let fileType: string = fileOptions.toLowerCase().trim();
      if (fileType.includes('workstn')) {
        fileType = 'Display file (DSPF)';
      }
      else if (fileType.includes('printer')) {
        fileType = 'Printer file (PRTF)';
      }
      else {
        fileType = 'Data file (PF/LF)';
      }
      symbols.push(makeDeclaredFile(fileName, fileType, fileOptions, lineNum, line.length));
    }

    const mToDo = TODO_RE.exec(line);
    if (mToDo) {
      const toDoText: string = mToDo[1]!.trim();
      symbols.push(makeToDo(toDoText, lineNum, line.length));
    }

    if (CONTROL_RE.test(line)) {
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
}

function makeRange(line: number, length: number) {
  return {
    start: { line, character: 0 },
    end: { line, character: length }
  };
}

function makeProc(name: string, isExport: boolean, line: number, length: number): Procedure {
  return {
    kind: 'procedure',
    name,
    isExport,
    range: makeRange(line, length)
  };
}

function makeSubr(name: string, line: number, length: number): Subroutine {
  return {
    kind: 'subroutine',
    name,
    range: makeRange(line, length)
  };
}

function makeConst(name: string, value: string, line: number, length: number): Constant {
  return {
    kind: 'constant',
    name,
    value,
    range: makeRange(line, length)
  };
}

function makeVar(name: string, dclType: string, isTab: boolean, tabDim: string, line: number, length: number): Variable {
  return {
    kind: 'variable',
    name,
    dclType,
    isTab,
    tabDim,
    range: makeRange(line, length)
  };
}

function makeDS(name: string, options: string, values: ItemDS[], isTab: boolean, tabDim: string, line: number, length: number): DataStructure {
  return {
    kind: 'dataStructure',
    name,
    options,
    values,
    isTab,
    tabDim,
    range: makeRange(line, length)
  };
}

function makeEnum(name: string, options: string, values: ItemEnum[], line: number, length: number): Enum {
  return {
    kind: 'enum',
    name,
    options,
    values, 
    range: makeRange(line, length)
  };
}

function makeDeclaredFile(name: string, fileType: string, fileOptions: string, line: number, length: number): DeclaredFile {
  return {
    kind: 'declaredFile',
    name,
    fileType,
    fileOptions,
    range: makeRange(line, length)
  };
}

function makeToDo(text: string, line: number, length: number): ToDo {
  return {
    kind: 'toDo',
    text,
    range: makeRange(line, length)
  };
}

function extractContent(lineNum: number, lines: string[], endRegex: RegExp): string[] {
      let Content: string[] = [];
      let i = lineNum + 1;
      while (i < lines.length && !endRegex.test(lines[i] ?? '')) {
        Content.push(lines[i] ?? '');
        i++;
      }
      return Content.map(s => s.trim()).filter(s => s.length > 0);
}

function parseBlock(regex: RegExp, content: string[]) {
  const items: { name: string; value: string; offset: number; lineText: string }[] = [];
  for (let i = 0; i < content.length; i++) {
    const lineText = content[i] ?? '';
    const m = regex.exec(lineText);
    if (m) {
      items.push({ name: m[1]!.trim(), value: m[2]!.trim(), offset: i, lineText });
    }
  }
  return items;
}

function extractTab(def: string): { isTab: boolean; tabDim: string } {
  const mTab = TABDIM_RE.exec(def);
  if (mTab) return { isTab: true, tabDim: (mTab[1] ?? '').trim() };
  return { isTab: false, tabDim: '' };
}

function parseItemsForDS(regex: RegExp, content: string[], line: number): ItemDS[] {
  const items = parseBlock(regex, content);
  return items.map(i => ({
    kind: 'itemDS',
    name: i.name,
    dclType: i.value,
    isTab: extractTab(i.value).isTab,
    tabDim: extractTab(i.value).tabDim,
    range: makeRange(line + 1 + i.offset, i.lineText.length)
  }));
}

function parseItemsForEnum(regex: RegExp, content: string[], line: number): ItemEnum[] {
  const items = parseBlock(regex, content);
  return items.map(i => ({
    kind: 'itemEnum',
    name: i.name,
    value: i.value,
    range: makeRange(line + 1 + i.offset, i.lineText.length)
  }));
}
