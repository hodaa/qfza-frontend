import { describe, expect, it } from 'vitest';
import { formatYouTubeTime, isYouTubeId, parseYouTubeTime } from '../utils/youtube';

describe('parseYouTubeTime', () => {
  it('reads a bare number as seconds', () => {
    expect(parseYouTubeTime('90')).toBe(90);
  });

  it('reads mm:ss', () => {
    expect(parseYouTubeTime('1:30')).toBe(90);
  });

  it('reads h:mm:ss', () => {
    expect(parseYouTubeTime('1:02:03')).toBe(3723);
  });

  it('treats an empty field as not filled in', () => {
    expect(parseYouTubeTime('')).toBeNull();
    expect(parseYouTubeTime('   ')).toBeNull();
  });

  it.each(['abc', '1:', ':30', '1:2:3:4', '-5', '1.5'])(
    'flags an unparseable time as NaN: %s',
    (bad) => {
      expect(Number.isNaN(parseYouTubeTime(bad))).toBe(true);
    },
  );

  it('round-trips every time the player formatter produces', () => {
    for (const seconds of [0, 5, 90, 599, 3599, 3600, 3723]) {
      expect(parseYouTubeTime(formatYouTubeTime(seconds))).toBe(seconds);
    }
  });
});

describe('isYouTubeId', () => {
  it('accepts the 11-character id shape', () => {
    expect(isYouTubeId('abcdef12345')).toBe(true);
    expect(isYouTubeId('dQw4w9WgXcQ')).toBe(true);
  });

  it('rejects anything of another length', () => {
    expect(isYouTubeId('abcdef1234')).toBe(false);
    expect(isYouTubeId('abcdef123456')).toBe(false);
    expect(isYouTubeId('1DOoJhC6NHpLSu2nAvaWy3HukVimEyyhE')).toBe(false);
  });
});
