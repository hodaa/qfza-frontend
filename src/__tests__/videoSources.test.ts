import { describe, expect, it } from 'vitest';
import {
  buildDrivePreviewUrl,
  buildDriveStreamUrl,
  buildMomentHref,
  buildShareUrl,
  buildThumbnailUrl,
  buildWatchUrl,
  identifyVideoId,
  inspectVideoUrl,
  isGoogleDriveId,
  parseShareUrl,
} from '../utils/videoSources';
import type { VideoRef } from '../utils/videoSources';

const YOUTUBE: VideoRef = { source: 'youtube', id: 'abcdef12345' };
const DRIVE_ID = '1DOoJhC6NHpLSu2nAvaWy3HukVimEyyhE';
const DRIVE: VideoRef = { source: 'drive', id: DRIVE_ID };

describe('inspectVideoUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=abcdef12345',
    'https://youtu.be/abcdef12345?si=shared',
    'https://m.youtube.com/watch?v=abcdef12345&t=50',
  ])('identifies a YouTube watch/share link: %s', (url) => {
    expect(inspectVideoUrl(url)).toEqual({ video: YOUTUBE, issue: null });
  });

  it.each([
    `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`,
    `https://drive.google.com/file/d/${DRIVE_ID}`,
    `https://drive.google.com/open?id=${DRIVE_ID}`,
    `https://drive.google.com/uc?id=${DRIVE_ID}&export=download`,
  ])('identifies a Google Drive file link: %s', (url) => {
    expect(inspectVideoUrl(url)).toEqual({ video: DRIVE, issue: null });
  });

  it('rejects a Drive folder, which has no video in it', () => {
    expect(
      inspectVideoUrl('https://drive.google.com/drive/folders/1Folder1234567890123456789012'),
    ).toEqual({
      video: null,
      issue: 'invalid',
    });
  });

  it('rejects a Drive file link whose id is not a Drive id', () => {
    expect(inspectVideoUrl('https://drive.google.com/file/d/abc/view')).toEqual({
      video: null,
      issue: 'invalid',
    });
  });

  it('rejects a Drive link with no file id at all', () => {
    expect(inspectVideoUrl('https://drive.google.com/file/d/')).toEqual({
      video: null,
      issue: 'invalid',
    });
  });

  it('lets a claimed host own the issues, so a malformed YouTube link stays YouTube', () => {
    // The YouTube adapter claims the host, so this is "a YouTube link of a
    // format we do not take" — not "some unknown source".
    expect(inspectVideoUrl('https://www.youtube.com/channel/UC123')).toEqual({
      video: null,
      issue: 'unsupportedFormat',
    });
  });

  it.each(['https://vimeo.com/123', 'https://docs.google.com/document/d/abc1234567890/view'])(
    'reports a host no source claims: %s',
    (url) => {
      expect(inspectVideoUrl(url).issue).toBe('unsupportedSource');
    },
  );

  it.each([
    'ftp://www.youtube.com/watch?v=abcdef12345',
    'https://user:password@drive.google.com/file/d/' + DRIVE_ID,
    'not a url',
    'https://youtu.be/invalid',
    'https://www.youtube.com/watch?v=too-short',
  ])('rejects malformed or non-HTTP(S) links before any source claims them: %s', (url) => {
    expect(inspectVideoUrl(url)).toEqual({ video: null, issue: 'invalid' });
  });
});

describe('identifyVideoId', () => {
  it('reads a Drive-shaped id as a Drive video', () => {
    expect(identifyVideoId(DRIVE_ID)).toEqual(DRIVE);
    expect(isGoogleDriveId(DRIVE_ID)).toBe(true);
  });

  it('reads every other id as YouTube, exactly as the ids recorded before Drive were', () => {
    expect(identifyVideoId('abcdef12345')).toEqual(YOUTUBE);
    // Historical rows can hold ids of odd short shapes; they were all YouTube.
    expect(identifyVideoId('vid123')).toEqual({ source: 'youtube', id: 'vid123' });
  });
});

describe('buildThumbnailUrl', () => {
  it('uses YouTube’s own frame for YouTube videos', () => {
    expect(buildThumbnailUrl(YOUTUBE)).toBe('https://i.ytimg.com/vi/abcdef12345/hqdefault.jpg');
  });

  it('uses Drive’s thumbnail endpoint for Drive videos', () => {
    expect(buildThumbnailUrl(DRIVE)).toBe(`https://drive.google.com/thumbnail?id=${DRIVE_ID}`);
  });
});

describe('buildWatchUrl', () => {
  it('builds a timestamped YouTube watch link', () => {
    expect(buildWatchUrl(YOUTUBE, 62)).toBe('https://www.youtube.com/watch?v=abcdef12345&t=62');
  });

  it('builds the Drive file page, which cannot start at a second', () => {
    expect(buildWatchUrl(DRIVE, 62)).toBe(`https://drive.google.com/file/d/${DRIVE_ID}/view`);
  });
});

describe('buildDriveStreamUrl', () => {
  it('builds the Range-capable Drive API URL the player needs', () => {
    expect(buildDriveStreamUrl(DRIVE_ID, '')).toBe(
      `https://www.googleapis.com/drive/v3/files/${DRIVE_ID}?alt=media`,
    );
  });

  it('appends the referrer-restricted API key when configured', () => {
    expect(buildDriveStreamUrl(DRIVE_ID, 'test-key')).toBe(
      `https://www.googleapis.com/drive/v3/files/${DRIVE_ID}?alt=media&key=test-key`,
    );
  });
});

describe('buildDrivePreviewUrl', () => {
  it('builds the embeddable preview URL used as the playback fallback', () => {
    expect(buildDrivePreviewUrl(DRIVE_ID)).toBe(
      `https://drive.google.com/file/d/${DRIVE_ID}/preview`,
    );
  });
});

describe('deep links', () => {
  it('names YouTube-only links the way links always were named', () => {
    const href = buildMomentHref(YOUTUBE, 754);
    expect(href).toBe('/?v=abcdef12345&t=754');
    expect(parseShareUrl(new URL(href, 'https://qfza.app').search)).toEqual({
      video: YOUTUBE,
      seconds: 754,
      foundNothing: false,
    });
  });

  it('names the source on a Drive link so it survives without re-inspection', () => {
    const href = buildMomentHref(DRIVE, 0, { foundNothing: true });
    const params = new URL(href, 'https://qfza.app').searchParams;
    expect(params.get('v')).toBe(DRIVE_ID);
    expect(params.get('s')).toBe('drive');
    expect(params.get('empty')).toBe('1');
    expect(parseShareUrl(new URL(href, 'https://qfza.app').search)).toEqual({
      video: DRIVE,
      seconds: 0,
      foundNothing: true,
    });
  });

  it('carries the source through share URLs too', () => {
    const url = new URL(buildShareUrl(DRIVE, 62.9));
    expect(url.searchParams.get('v')).toBe(DRIVE_ID);
    expect(url.searchParams.get('s')).toBe('drive');
    expect(url.searchParams.get('t')).toBe('62');
    expect(parseShareUrl(url.search)).toEqual({
      video: DRIVE,
      seconds: 62,
      foundNothing: false,
    });
  });

  it('floors fractional seconds and clamps negatives to zero', () => {
    expect(new URL(buildShareUrl(YOUTUBE, 62.9)).searchParams.get('t')).toBe('62');
    expect(new URL(buildShareUrl(YOUTUBE, -5)).searchParams.get('t')).toBe('0');
  });

  it('defaults a missing or invalid t to zero', () => {
    expect(parseShareUrl('?v=abcdef12345')).toEqual({
      video: YOUTUBE,
      seconds: 0,
      foundNothing: false,
    });
    expect(parseShareUrl(`?v=${DRIVE_ID}&s=drive&t=abc`)).toEqual({
      video: DRIVE,
      seconds: 0,
      foundNothing: false,
    });
  });

  it('returns null without a valid video id so a normal visit is unaffected', () => {
    expect(parseShareUrl('')).toBeNull();
    expect(parseShareUrl('?t=62')).toBeNull();
    expect(parseShareUrl('?v=too-short&t=62')).toBeNull();
    expect(parseShareUrl('?v=example.com&t=62')).toBeNull();
  });

  it('rejects an id that does not match the source it claims', () => {
    // A Drive id is not a YouTube id, and vice versa, so a mismatched pair is
    // not a link this app ever produced.
    expect(parseShareUrl(`?v=${DRIVE_ID}`)).toBeNull();
    expect(parseShareUrl('?v=abcdef12345&s=drive')).toBeNull();
  });

  it('rejects a source token it does not recognise rather than guessing', () => {
    expect(parseShareUrl(`?v=${DRIVE_ID}&s=vimeo`)).toBeNull();
  });

  it('ignores an empty marker it does not recognise', () => {
    // A hand-edited or truncated URL degrades to the ordinary moment view rather
    // than to an empty result nobody asked for.
    for (const search of [
      '?v=abcdef12345&empty=0',
      '?v=abcdef12345&empty=yes',
      '?v=abcdef12345&empty',
    ]) {
      expect(parseShareUrl(search)?.foundNothing).toBe(false);
    }
  });

  it('treats a t=0 moment as a real moment, not an empty one', () => {
    // Both open at the start of the video. Only one has nothing to show, and
    // that is the whole difference between the two links.
    expect(parseShareUrl('?v=abcdef12345&t=0')?.foundNothing).toBe(false);
  });
});
