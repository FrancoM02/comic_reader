import { describe, it, expect } from 'vitest';
import { spreadAt, step, tapZone } from '../src/lib/spread';

describe('spreadAt', () => {
  it('doble página: portada sola, después pares, última sola', () => {
    expect(spreadAt(0, 10, true)).toEqual([0]);
    expect(spreadAt(1, 10, true)).toEqual([1, 2]);
    expect(spreadAt(2, 10, true)).toEqual([1, 2]);
    expect(spreadAt(9, 10, true)).toEqual([9]);
  });
  it('simple: una sola página', () => {
    expect(spreadAt(4, 10, false)).toEqual([4]);
  });
});

describe('step', () => {
  it('avanza al pliego siguiente sin salirse del rango', () => {
    expect(step(1, 10, true, 1)).toBe(3);
    expect(step(0, 10, true, 1)).toBe(1);
    expect(step(9, 10, true, 1)).toBe(9);
    expect(step(3, 10, true, -1)).toBe(1);
    expect(step(1, 10, true, -1)).toBe(0);
    expect(step(0, 10, false, -1)).toBe(0);
    expect(step(4, 10, false, 1)).toBe(5);
  });
});

describe('tapZone', () => {
  it('30 % a cada lado pasan de página, el centro abre el menú', () => {
    expect(tapZone(10, 100, 'rtl')).toBe('next');
    expect(tapZone(10, 100, 'ltr')).toBe('prev');
    expect(tapZone(90, 100, 'ltr')).toBe('next');
    expect(tapZone(90, 100, 'rtl')).toBe('prev');
    expect(tapZone(50, 100, 'ltr')).toBe('menu');
  });
});
