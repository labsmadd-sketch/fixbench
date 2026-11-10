import { describe, expect, it } from 'vitest';
import { dataUrlBytes, dominantColors } from './logoColors';

function pixels(...runs: [rgba: [number, number, number, number], count: number][]): number[] {
  return runs.flatMap(([px, n]) => Array.from({ length: n }, () => px).flat());
}

describe('dominantColors', () => {
  it('ranks by how much of the logo uses the colour', () => {
    const logo = pixels([[15, 118, 110, 255], 50], [[245, 158, 11, 255], 20]);
    expect(dominantColors(logo)).toEqual(['#0F766E', '#F59E0B']);
  });

  it('ignores transparent, white, black and grey pixels', () => {
    const logo = pixels(
      [[255, 255, 255, 255], 500],
      [[0, 0, 0, 255], 300],
      [[120, 120, 125, 255], 300],
      [[200, 20, 20, 0], 300],
      [[190, 18, 60, 255], 5],
    );
    expect(dominantColors(logo)).toEqual(['#BE123C']);
  });

  it('merges near-identical shades and stops at the count', () => {
    const logo = pixels(
      [[29, 78, 216, 255], 30],
      [[33, 82, 220, 255], 30],
      [[21, 128, 61, 255], 20],
      [[194, 65, 12, 255], 10],
      [[124, 58, 237, 255], 5],
    );
    const found = dominantColors(logo);
    expect(found).toHaveLength(3);
    expect(found[0]).toMatch(/^#(1D4ED8|2152DC)$/);
  });

  it('returns nothing for an all-grey logo', () => {
    expect(dominantColors(pixels([[40, 40, 40, 255], 100]))).toEqual([]);
  });
});

describe('dataUrlBytes', () => {
  it('estimates decoded size', () => {
    expect(dataUrlBytes('data:image/png;base64,' + 'A'.repeat(400))).toBe(300);
  });
});
