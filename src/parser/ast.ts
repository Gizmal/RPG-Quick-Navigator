export type ScopeKind = 
  'global'        | 
  'procedure'     | 
  'dataStructure' | 
  'enum';

export interface ScopeInfo {
  scopeKind:   ScopeKind;
  ownerName?:  string;
}

export interface Position {
  line:        number;
  character:   number;
}

export interface Range {
  start:       Position;
  end:         Position;
}

export interface BaseNode {
  range:       Range;
  reach:       ScopeInfo;
}

export interface Procedure extends BaseNode {
  kind:        'procedure';
  name:        string;
  isExport:    boolean;
}

export interface Subroutine extends BaseNode {
  kind:        'subroutine';
  name:        string;
}

export interface Constant extends BaseNode {
  kind:        'constant';
  name:        string;
  value:       string;
}

export interface Variable extends BaseNode {
  kind:        'variable';
  name:        string;
  dclType:     string;
  isTab:       boolean;
  tabDim?:     string;
}

export interface DataStructure extends BaseNode {
  kind:        'dataStructure';
  name:        string;
  options?:    string;
  values:      ItemDS[];
  isTab:       boolean;
  tabDim?:     string;
}

export interface ItemDS extends BaseNode {
  kind:        'itemDS';
  name:        string;
  dclType:     string;
  isTab?:      boolean;
  tabDim?:     string;
}

export interface Enum extends BaseNode {
  kind:        'enum';
  name:        string;
  options?:    string;
  values:      ItemEnum[];
}

export interface ItemEnum extends BaseNode {
  kind:        'itemEnum';
  name:        string;
  value:       string;
}

export interface DeclaredFile extends BaseNode {
  kind:        'declaredFile';
  name:        string;
  fileType:    string;
  fileOptions: string;
}

export interface ToDo extends BaseNode {
  kind:        'toDo';
  text:        string;
}

export type RpgSymbol = 
  Procedure     | 
  Subroutine    | 
  Constant      | 
  Variable      | 
  DataStructure | 
  ItemDS        | 
  Enum          | 
  ItemEnum      | 
  DeclaredFile  | 
  ToDo;

export interface RpgDocument {
  symbols:     RpgSymbol[];
  metrics: {
    controlBlocks: number;
    toDos:         number;
  };
}
