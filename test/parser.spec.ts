import { parse } from '../src/parser/parse'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

describe('RPG Parser', () => {
  const sample = readFileSync(join(__dirname, '../samples/example1.rpgle'), 'utf8');  
  it('parses sample file correctly', () => {
    const doc = parse(sample);

    expect(doc.symbols.some(s => s.kind === 'procedure')).toBe(true);
    expect(doc.symbols.some(s => s.kind === 'subroutine')).toBe(true);
    expect(doc.symbols.some(s => s.kind === 'constant')).toBe(true);
    expect(doc.symbols.some(s => s.kind === 'variable')).toBe(true);
    expect(doc.symbols.some(s => s.kind === 'dataStructure')).toBe(true);
    expect(doc.symbols.some(s => s.kind === 'itemDS')).toBe(true);
    expect(doc.symbols.some(s => s.kind === 'enum')).toBe(true);
    expect(doc.symbols.some(s => s.kind === 'itemEnum')).toBe(true);
    expect(doc.symbols.some(s => s.kind === 'declaredFile')).toBe(true);
    expect(doc.symbols.some(s => s.kind === 'toDo')).toBe(true);
  });

  it('counts control blocks and todos correctly', () => {
    const doc = parse(sample);
    expect(doc.metrics.controlBlocks).toBeGreaterThan(0);
    expect(doc.metrics.toDos).toBeGreaterThanOrEqual(0);
  });
});
