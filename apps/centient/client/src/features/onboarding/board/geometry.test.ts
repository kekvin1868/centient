import { describe, expect, it } from 'vitest';
import { edge, fitCamera, linkPath, zoomAt } from './geometry';
import { addLink, emptyBoard, erase, place } from './state';

describe('geometry', () => {
  const box = { x: 0, y: 0, w: 100, h: 50 };
  it('meets the border toward the target, 7px out', () => {
    expect(edge(box, 500, 25)).toEqual([107, 25]);
    expect(edge(box, 50, -500)).toEqual([50, -7]);
  });
  it('bows two-way links apart', () => {
    const b = { x: 300, y: 0, w: 100, h: 50 };
    expect(linkPath(box, b, false)).not.toBe(linkPath(box, b, true));
  });
  it('zooms around the pointer', () => {
    const c = zoomAt({ x: 0, y: 0, z: 1 }, 2, 100, 100);
    expect(c).toEqual({ x: -100, y: -100, z: 2 }); // world (100,100) stays under the pointer
    expect(zoomAt(c, 99, 0, 0).z).toBe(2);
  });
  it('fits everything, never past 100%', () => {
    const c = fitCamera([box, { x: 0, y: 900, w: 100, h: 100 }], { w: 400, h: 600 }, { top: 0, bottom: 0, side: 0 })!;
    expect(c.z).toBeCloseTo(0.6);
    expect(fitCamera([box], { w: 4000, h: 4000 }, { top: 0, bottom: 0, side: 0 })!.z).toBe(1);
  });
});

describe('board state', () => {
  it('stacks new frames into the shorter column', () => {
    const b = place(emptyBoard(), [{ key: 'a', pockets: 6 }, { key: 'b', pockets: 1 }, { key: 'c', pockets: 1 }]);
    expect(b.pos.a.x).toBe(0);
    expect(b.pos.b.x).toBeGreaterThan(0);
    expect(b.pos.c).toEqual({ x: b.pos.b.x, y: expect.any(Number) }); // column two is still shorter
  });
  it('links once per direction and erases by id', () => {
    let b = addLink(emptyBoard(), 'a', 'b');
    b = addLink(addLink(addLink(b, 'a', 'b'), 'a', 'a'), 'b', 'a');
    expect(b.links).toHaveLength(2);
    expect(erase(b, new Set([b.links[0].id])).links).toHaveLength(1);
  });
});
