import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const reducedMotion = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
const spinnerRule = reducedMotion.match(/\.animate-spin\s*\{([^}]*)\}/)?.[1] ?? '';

describe('reduced motion', () => {
  it('keeps loading spinners moving', () => {
    expect(spinnerRule).toMatch(/animation-duration:\s*1s\s*!important/);
    expect(spinnerRule).toMatch(/animation-iteration-count:\s*infinite\s*!important/);
  });
});
