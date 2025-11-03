export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface BaseNode {
  range: Range;
}

export interface Procedure extends BaseNode {
  kind: 'procedure';
  name: string;
}

export interface Variable extends BaseNode {
  kind: 'variable';
  name: string;
  dclType: string;
}

export interface DataStructure extends BaseNode {
  kind: 'dataStructure';
  name: string;
}

export interface ToDo extends BaseNode {
  kind: 'toDo';
  text: string;
}

export type RpgSymbol = Procedure | Variable | DataStructure | ToDo;

export interface RpgDocument {
  symbols: RpgSymbol[];
  metrics: {
    controlBlocks: number;
    todos: number;
  };
}
