import {
  RpgDocument,
  RpgSymbol,
  Procedure,
  Variable,
  DataStructure,
  ToDo
} from './ast';

const PROC_RE = /^\s*dcl-proc\s+([A-Za-z0-9_]+)\b/i;
const ENDPROC_RE = /^\s*end-proc\b/i;
const VAR_RE = /^\s*dcl-s\s+([A-Za-z0-9_]+)\s+([^;]+);/i;
const DS_RE = /^\s*dcl-ds\s+([A-Za-z0-9_]+)\b/i;
const TODO_RE = /\/\/\s*TO\s*DO\s*:?(.*)$/i;
const CONTROL_RE = /^\s*(if|elseif|else|select|when|other|for|dow|do)\b/i;

export function parse(text: string): RpgDocument {
  const lines = text.split(/\r?\n/);
  const symbols: RpgSymbol[] = [];
  let controlBlocks = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] ?? '';

    const mProc = PROC_RE.exec(line);
    if (mProc) {
      symbols.push(makeProc(mProc[1]!, lineNum, line.length));
    }

    if (ENDPROC_RE.test(line)) {
      // later
    }

    const mVar = VAR_RE.exec(line);
    if (mVar) {
      symbols.push(makeVar(mVar[1]!, mVar[2]!.trim(), lineNum, line.length));
    }

    const mDs = DS_RE.exec(line);
    if (mDs) {
      symbols.push(makeDS(mDs[1]!, lineNum, line.length));
    }

    const mToDo = TODO_RE.exec(line);
    if (mToDo) {
      symbols.push(makeToDo(mToDo[1]!.trim(), lineNum, line.length));
    }

    if (CONTROL_RE.test(line)) {
      controlBlocks++;
    }
  }

  return {
    symbols,
    metrics: {
      controlBlocks,
      todos: symbols.filter(s => s.kind === 'toDo').length
    }
  };
}

function makeRange(line: number, length: number) {
  return {
    start: { line, character: 0 },
    end: { line, character: length }
  };
}

function makeProc(name: string, line: number, length: number): Procedure {
  return {
    kind: 'procedure',
    name,
    range: makeRange(line, length)
  };
}

function makeVar(name: string, dclType: string, line: number, length: number): Variable {
  return {
    kind: 'variable',
    name,
    dclType,
    range: makeRange(line, length)
  };
}

function makeDS(name: string, line: number, length: number): DataStructure {
  return {
    kind: 'dataStructure',
    name,
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
