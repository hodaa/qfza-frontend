// Renders the Open Graph / Twitter card images and the 512px PWA icon.
//
// Why a script instead of committed binaries only: the cards are derived from
// brand assets, so a colour change in the SVGs has to be able to propagate
// without a designer round-trip. Run `npm run gen:og` after any brand edit.
//
// Canvas is 1200x630 (1.91:1) because that is Facebook's preferred OG ratio and
// sits within Twitter's 2:1 `summary_large_image` target. The old card reused
// the 1238x480 wordmark (2.58:1), which both platforms letterboxed.
//
// The wordmark is composited from logo-en.png (raster, with alpha) rather than
// re-rendered from SVG: magick's SVG delegate shells out to rsvg-convert, which
// is not installed here, and its internal MSVG fallback mangles gradients.
// The card background is white rather than brand navy because the wordmark is
// itself navy — on navy it would be invisible.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const W = 1200;
const H = 630;

const NAVY = '#02275a';
const ORANGE = '#ea580c';
const MUTED = '#5b6b85';
const FONT = '/System/Library/Fonts/HelveticaNeue.ttc';

const magick = (args) => execFileSync('magick', args, { stdio: 'pipe' });

if (!existsSync(join(PUBLIC, 'logo-en.png'))) {
  console.error('[gen-og] public/logo-en.png missing — cannot build cards.');
  process.exit(1);
}

/**
 * Build one 1200x630 card: wordmark centred above a tagline, with the brand
 * orange as a short rule between them.
 */
function card({ out, logo, tagline, subline }) {
  const args = [
    '-size', `${W}x${H}`,
    'xc:white',
    // Thin orange rule above the wordmark.
    '-fill', ORANGE,
    '-draw', `rectangle ${(W / 2 - 34).toFixed(0)},118 ${(W / 2 + 34).toFixed(0)},124`,
    // Wordmark: 618x240 source, scaled to 60% to leave room for the copy.
    '(',
    join(PUBLIC, logo),
    '-resize', '560x',
    ')',
    '-gravity', 'north',
    '-geometry', '+0+168',
    '-composite',
    // Tagline.
    '-font', FONT,
    '-pointsize', '44',
    '-fill', NAVY,
    '-gravity', 'north',
    '-annotate', '+0+404', tagline,
  ];

  if (subline) {
    args.push(
      '-pointsize', '27',
      '-fill', MUTED,
      '-annotate', '+0+470', subline,
    );
  }

  args.push('-strip', join(PUBLIC, out));
  magick(args);
  console.log(`[gen-og] wrote public/${out} (${W}x${H})`);
}

card({
  out: 'og-en.png',
  logo: 'logo-en.png',
  tagline: 'Search inside videos',
  subline: 'Find any word or phrase — and the exact timestamp it appears.',
});

card({
  out: 'og-ar.png',
  logo: 'logo-en.png',
  tagline: 'ابحث داخل الفيديوهات',
  subline: 'اعثر على أي كلمة أو عبارة في Timestamp بالضبط.',
});

// Blog posts have no bespoke artwork, so they share a neutral site card.
card({
  out: 'og-blog.png',
  logo: 'logo-en.png',
  tagline: 'Qfza Blog',
  subline: 'Practical notes on searching inside YouTube videos.',
});

// 512px / 192px icons for the web app manifest and Android home screen.
for (const size of [512, 192]) {
  magick([
    join(PUBLIC, 'logo-mark.svg'),
    '-resize', `${size}x${size}`,
    '-background', 'none',
    '-gravity', 'center',
    '-extent', `${size}x${size}`,
    '-strip',
    join(PUBLIC, `icon-${size}.png`),
  ]);
  console.log(`[gen-og] wrote public/icon-${size}.png (${size}x${size})`);
}

// Maskable icon: Android crops to whatever shape the launcher picks, keeping only
// the central 80% safe zone. The mark is scaled to 62% of the canvas and centred
// on brand navy so it survives a circle, squircle, or full-bleed crop. Declaring
// "maskable" on the full-bleed icon above would be wrong and renders clipped.
magick([
  '-size', '512x512',
  `xc:${NAVY}`,
  '(',
  join(PUBLIC, 'logo-mark.svg'),
  '-resize', '318x318',
  ')',
  '-gravity', 'center',
  '-composite',
  '-strip',
  join(PUBLIC, 'icon-maskable-512.png'),
]);
console.log('[gen-og] wrote public/icon-maskable-512.png (512x512, maskable safe zone)');
