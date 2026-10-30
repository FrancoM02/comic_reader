import { describe, expect, it } from 'vitest';
import { parseFilename } from '../src/lib/filename';

describe('parseFilename', () => {
  it.each([
    ['Chainsaw Man v03.cbz', 'Chainsaw Man', 3, 'v03', 'volume'],
    ['Batman (2016) #045.cbr', 'Batman (2016)', 45, '#045', 'issue'],
    ['One Piece Vol. 12.pdf', 'One Piece', 12, 'v12', 'volume'],
    ['Berserk Tomo 7.cbz', 'Berserk', 7, 'v07', 'volume'],
    ['Dandadan T03.cbz', 'Dandadan', 3, 'v03', 'volume'],
    ['[GrupoX] Frieren v01.cbz', 'Frieren', 1, 'v01', 'volume'],
    ['Saga_054.cbr', 'Saga', 54, '#054', 'issue'],
    ['Kaiju.No.8.c045.cbz', 'Kaiju No 8', 45, '#045', 'issue'],
    ['Akira.cbz', 'Akira', null, '', null],
    ['Blame! v02.5.cbz', 'Blame!', 2.5, 'v02.5', 'volume'],
    ['One Piece - Vol 05.cbz', 'One Piece', 5, 'v05', 'volume'],
    ['Berserk - 07.cbz', 'Berserk', 7, '#007', 'issue'],
    ['Vinland Saga v10 (2014) (Digital).cbz', 'Vinland Saga', 10, 'v10', 'volume'],
    ['Spider-Man 2099 #01.cbr', 'Spider-Man 2099', 1, '#001', 'issue'],
    ['One Piece Vol 05.cbz', 'One Piece', 5, 'v05', 'volume'],
    ['Batman (2016).cbr', 'Batman (2016)', null, '', null],
  ])('%s', (input, series, number, label, kind) => {
    expect(parseFilename(input)).toEqual({ series, number, label, kind });
  });
});
