import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, resolveVideo, submitSearch } from './api/client';
import { Features } from './components/Features';
import { Hero } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { KeywordSearchForm } from './components/KeywordSearchForm';
import type { KeywordSearchFormHandle } from './components/KeywordSearchForm';
import { ResultsPanel } from './components/ResultsPanel';
import type { Phase } from './components/ResultsPanel';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';
import { VideoStage } from './components/VideoStage';
import { VideoUrlForm } from './components/VideoUrlForm';
import { ContactPage } from './components/ContactPage';
import { NotFoundPage } from './components/NotFoundPage';
import { HistoryPage } from './components/auth/HistoryPage';
import { ProfilePage } from './components/auth/ProfilePage';
import { LoginPage } from './components/auth/LoginPage';
import { RegisterPage } from './components/auth/RegisterPage';
import { ResetPasswordPage } from './components/auth/ResetPasswordPage';
import { VerifyEmailPage } from './components/auth/VerifyEmailPage';
import { navigate, useRoute } from './hooks/useRoute';
import { useDocumentMeta } from './hooks/useDocumentMeta';
import { useJobPolling } from './hooks/useJobPolling';
import type { VideoPlayerHandle } from './hooks/useYouTubePlayer';
import type { HistoryEntry, ResolvedVideo, SearchMatch, StatusResponse } from './types';
import { savedResultsOf } from './utils/savedResults';
import { isReadingHelp } from './utils/focus';
import {
  buildMomentHref,
  buildWatchUrl,
  identifyVideoId,
  inspectVideoUrl,
  parseShareUrl,
} from './utils/videoSources';
import type { DeepLink, VideoRef } from './utils/videoSources';
import { clearResultsCache, getCachedResults, setCachedResults } from './utils/resultsCache';
import { ensureTranscript as ensureVideoTranscript } from './utils/transcript';
import { useAuth } from './auth/useAuth';
import { trackEvent } from './utils/analytics';

const PROGRESS_DONE_DELAY_MS = 350;
const MATCH_LIMIT = 50;
const PROGRESS_INITIAL = 10; // shown the moment the user clicks Jump, before submit resolves
const PROGRESS_TICK_STEP = 10;
const PROGRESS_FALLBACK_TICK_MS = 3000; // no estimate → one step every 3s
const PROGRESS_MIN_TICK_MS = 1000; // floor so a tiny estimate doesn't spin wildly
const PROGRESS_TOTAL_STEPS = 10; // the estimate is divided into 10 equal segments
const PROGRESS_MAX = 90; // cap below 100% so we never look done before results arrive

interface ActiveJob {
  signal: AbortSignal;
  jobId: string;
  videoId: string;
}

interface Query {
  url: string;
  keyword: string;
}

/** Read a shared-moment deep link (?v=<id>&t=<seconds>[&empty=1]) once, on first render. */
function readSharedLink(): DeepLink | null {
  try {
    return parseShareUrl(window.location.search);
  } catch {
    return null;
  }
}

/** قفزة app: URL-first video workspace with search beside the player. */
export default function App() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [sharedSeconds, setSharedSeconds] = useState<number | null>(
    () => readSharedLink()?.seconds ?? null,
  );
  // The keyword a saved moment belongs to. Null for a bare ?v=&t= link, which
  // carries no keyword and so has nothing to name.
  const [sharedKeyword, setSharedKeyword] = useState<string | null>(null);
  // Every result a saved search found, so reopening it lists the same matches
  // the search produced. Null for a bare ?v=&t= link, which knows of one moment
  // and nothing else.
  const [sharedMatches, setSharedMatches] = useState<SearchMatch[] | null>(null);
  // False when the search matched nothing. Kept apart from an empty
  // `sharedMatches` because "found nothing" must read as an empty result, not as
  // a moment whose results have not arrived yet. Seeded from the link so that
  // reloading a fruitless search, or opening it in another tab, lands on the same
  // empty result as clicking it — the URL is all that survives a reload.
  const [sharedMatched, setSharedMatched] = useState(() => readSharedLink()?.foundNothing !== true);
  const [phase, setPhase] = useState<Phase>(() => (readSharedLink() ? 'done' : 'idle'));
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [noSpeech, setNoSpeech] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [estimatedWait, setEstimatedWait] = useState<number | null>(null);
  const [errorText, setErrorText] = useState('');
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [query, setQuery] = useState<Query>(() => {
    const link = readSharedLink();
    return link ? { url: buildWatchUrl(link.video, 0), keyword: '' } : { url: '', keyword: '' };
  });
  const [resolved, setResolved] = useState<ResolvedVideo | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(() => readSharedLink() !== null);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [transcriptReady, setTranscriptReady] = useState(false);
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const videoColumnRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<number | null>(null);
  const estimatedWaitRef = useRef<number | null>(null);
  const keywordFormRef = useRef<KeywordSearchFormHandle>(null);
  const searchControllerRef = useRef<AbortController | null>(null);
  const [currentPlayingTimestamp, setCurrentPlayingTimestamp] = useState<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      searchControllerRef.current?.abort();
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (phase === 'idle' || isReadingHelp()) return;
    const mobile =
      typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 1023px)') : null;
    if (mobile?.matches) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      resultsRef.current?.scrollIntoView?.({
        behavior: reducedMotion ? 'instant' : 'smooth',
        block: 'start',
      });
    }
  }, [phase]);

  useEffect(() => {
    estimatedWaitRef.current = estimatedWait;
  }, [estimatedWait]);

  const clearPendingTransition = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  // Clicking a result plays from that moment. Clicking inside a replayed moment
  // does not: that view exists to sit on a frame, so re-selecting it parks the
  // player again rather than starting playback.
  const handleSeek = useCallback(
    (seconds: number) => {
      playerRef.current?.seekTo(seconds, sharedSeconds === null ? undefined : { autoplay: false });
      // On narrow screens the player sits above the results, so a tapped moment
      // would otherwise play off-screen. Desktop keeps the player in view.
      const narrow =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 1023px)').matches;
      if (!narrow) return;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      videoColumnRef.current?.scrollIntoView?.({
        behavior: reducedMotion ? 'instant' : 'smooth',
        block: 'start',
      });
    },
    [sharedSeconds],
  );

  // Declared up here rather than beside the other route helpers below: the seek
  // effect depends on it, and a dependency array is read while rendering.
  const route = useRoute();

  // Each client view names and canonicals itself. Without this every route
  // inherited the homepage's title, description and canonical — a duplicate
  // -content signal that pointed every page at https://qfza.app/.
  useDocumentMeta(route);

  // A shared-moment link (?v=&t=) opens straight into the done phase with the
  // player mounted. Queue the seek once the player ref is attached; the player
  // holds it until YouTube is ready, then seeks and plays.
  //
  // The route is a dependency because the player lives inside the home view, and
  // replaying from history sets the phase and the moment before the hash change
  // that mounts it has landed. Without it the seek ran against a ref that was
  // still null, and the video loaded at 00:00 — the one thing the moment link
  // exists to prevent.
  useEffect(() => {
    if (route !== 'home') return;
    if (phase !== 'done' || sharedSeconds === null) return;
    // autoplay: false — the request is "show me this moment", not "play from
    // here". Autoplaying would run the viewer straight past the frame that the
    // link exists to show.
    playerRef.current?.seekTo(sharedSeconds, { autoplay: false });
  }, [route, phase, sharedSeconds]);

  // One video object per URL: the player and the result list memoize on its
  // identity, and a fresh object on every render would defeat that — and would
  // read as a different video to the list's expanded state, collapsing it.
  const video = useMemo(() => inspectVideoUrl(query.url).video, [query.url]);

  // Resolving a link creates the video row without transcribing it, so the
  // player and MP4 download are usable immediately. Transcript-dependent
  // actions queue the job lazily through prepare/ensureTranscript.
  useEffect(() => {
    if (!video) {
      return undefined;
    }
    const controller = new AbortController();
    void resolveVideo(query.url, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setResolved(value);
        setTranscriptReady(value.transcribed);
        setLoadingVideo(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof ApiError ? error.messageKey : 'workspace.loadFailed');
        setLoadingVideo(false);
      });
    return () => controller.abort();
  }, [query.url, video, loadAttempt]);

  // Put the search view back to how it looks before anyone typed anything.
  //
  // Signing out ends the session, but it does not un-type: the video URL, the
  // keyword and the results all sit in this component and would otherwise still
  // be on screen for whoever picks up the device next. It also drops the
  // deep-link parameters from the address bar, since a reload would otherwise
  // restore the moment the previous visitor was watching.
  const resetSearchView = useCallback(() => {
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
    clearPendingTransition();
    setJob(null);
    setMatches([]);
    setNoSpeech(false);
    setProgress(null);
    setEstimatedWait(null);
    setErrorText('');
    setCurrentPlayingTimestamp(null);
    setSharedSeconds(null);
    setSharedKeyword(null);
    setSharedMatches(null);
    setSharedMatched(true);
    setQuery({ url: '', keyword: '' });
    keywordFormRef.current?.setKeyword('');
    setResolved(null);
    setLoadingVideo(false);
    setLoadError('');
    setTranscriptReady(false);
    setPhase('idle');
    clearResultsCache();
    if (window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    }
  }, [clearPendingTransition]);

  const handleLogoClick = useCallback(() => {
    resetSearchView();
    if (typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [resetSearchView]);

  // Watch the session rather than the button: both logout controls (the account
  // menu and the profile page) already navigate home, and a session that lapses
  // elsewhere should reset the view for the same reason. Keyed on the transition,
  // so a plain anonymous visit — or an anonymous deep link — is left alone.
  const wasSignedIn = useRef(user !== null);
  useEffect(() => {
    const signedIn = user !== null;
    if (wasSignedIn.current && !signedIn) resetSearchView();
    wasSignedIn.current = signedIn;
  }, [user, resetSearchView]);

  // Land on the home view showing a search that has already happened: the video
  // loaded, the player on the moment it resumes at, and whatever it found.
  //
  // Shared for both replay paths - a bare ?v=&t= link and a saved history entry -
  // because both answer the same question, "show me this search again", and both
  // set the state the first render reads out of the query string rather than
  // inventing a second path to the same screen. The moment and the phase flip
  // together, so the effect above performs the seek.
  const showSavedSearch = useCallback(
    ({
      video: savedVideo,
      seconds,
      keyword,
      matches: savedMatches,
      matched,
    }: {
      video: VideoRef;
      seconds: number;
      keyword?: string;
      matches: SearchMatch[] | null;
      matched: boolean;
    }) => {
      const trimmedKeyword = keyword?.trim() ? keyword.trim() : '';
      searchControllerRef.current?.abort();
      searchControllerRef.current = null;
      setJob(null);
      setMatches([]);
      setNoSpeech(false);
      setProgress(null);
      setEstimatedWait(null);
      setErrorText('');
      setCurrentPlayingTimestamp(null);
      setResolved(null);
      setTranscriptReady(false);
      setLoadingVideo(true);
      setLoadError('');
      setLoadAttempt((attempt) => attempt + 1);
      // Carry the phrase into the field: the visitor came here *from* a search for
      // it, so the input should show what they searched rather than fall back to
      // the placeholder and read as if nothing was searched for.
      setQuery({ url: buildWatchUrl(savedVideo, 0), keyword: trimmedKeyword });
      keywordFormRef.current?.setKeyword(trimmedKeyword);

      // Go home first, then write the moment into the URL: the route has already
      // changed by the time replaceState lands, and the address stays a deep link
      // a reload can replay. The search view only lives on the home route, so
      // without this the player would be mounted under /history and never appear.
      navigate('home');
      window.history.replaceState(null, '', buildMomentHref(savedVideo, seconds));

      setSharedSeconds(Math.max(0, Math.floor(seconds)));
      setSharedKeyword(trimmedKeyword || null);
      setSharedMatches(savedMatches);
      setSharedMatched(matched);
      setPhase('done');
    },
    [],
  );

  // Reopen a saved search from the history page.
  //
  // The entry carries what that search found, so reopening it reproduces the
  // search rather than pointing the player at one second: every match is listed
  // again and the first one is the moment it resumes at.
  //
  // An entry that matched nothing reopens as an empty result — the same view a
  // live search returns when it finds nothing. Showing a single fabricated row
  // at 00:00 instead would tell the visitor their phrase was found when it
  // never was.
  const replayHistoryEntry = useCallback(
    (entry: HistoryEntry) => {
      const saved = savedResultsOf(entry);
      showSavedSearch({
        video: identifyVideoId(entry.video_id),
        seconds: entry.progress_seconds ?? saved.matches?.[0]?.progress_seconds ?? 0,
        keyword: entry.keyword,
        matches: saved.matches,
        matched: saved.matched,
      });
    },
    [showSavedSearch],
  );

  // Open a video from its history title. The video as a whole is not one
  // search, so it carries no keyword and no results and starts at the top.
  const openHistoryVideo = useCallback(
    (videoId: string) => {
      showSavedSearch({
        video: identifyVideoId(videoId),
        seconds: 0,
        keyword: '',
        matches: null,
        matched: true,
      });
    },
    [showSavedSearch],
  );

  const handleLoad = useCallback(
    (url: string) => {
      const info = inspectVideoUrl(url);
      if (!info.video) {
        setLoadError(`error.${info.issue}`);
        return;
      }
      searchControllerRef.current?.abort();
      searchControllerRef.current = null;
      clearPendingTransition();
      setJob(null);
      setMatches([]);
      setNoSpeech(false);
      setProgress(null);
      setEstimatedWait(null);
      setErrorText('');
      setCurrentPlayingTimestamp(null);
      setSharedSeconds(null);
      setSharedKeyword(null);
      setSharedMatches(null);
      setSharedMatched(true);
      setPhase('idle');
      setQuery({ url, keyword: '' });
      keywordFormRef.current?.setKeyword('');
      setResolved(null);
      setTranscriptReady(false);
      setLoadError('');
      setLoadingVideo(true);
      setLoadAttempt((attempt) => attempt + 1);
      clearResultsCache();
      if (window.location.search) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
      }
    },
    [clearPendingTransition],
  );

  const handleSearch = useCallback(
    async (keyword: string) => {
      if (!video || !resolved) {
        return;
      }
      // A signal identifies the whole search, including its polling lifecycle.
      // Even a transport that resolves after abort cannot publish stale results.
      searchControllerRef.current?.abort();
      const controller = new AbortController();
      searchControllerRef.current = controller;
      // A real search supersedes any shared-moment view.
      setSharedSeconds(null);
      setSharedKeyword(null);
      setSharedMatches(null);
      setSharedMatched(true);
      const cached = getCachedResults(video, keyword);
      if (cached !== undefined) {
        // Same video + keyword was already searched this session: show the
        // cached results immediately instead of re-submitting and re-polling.
        trackEvent('search_submit', { source: 'cache' });
        startedAtRef.current = Date.now();
        setQuery({ url: query.url, keyword });
        setErrorText('');
        setJob(null);
        setMatches(cached.matches);
        setNoSpeech(cached.noSpeech);
        setCurrentPlayingTimestamp(null);
        clearPendingTransition();
        setProgress(100);
        setTranscriptReady(true);
        setPhase('done');
        return;
      }
      startedAtRef.current = Date.now();
      setQuery({ url: query.url, keyword });
      setErrorText('');
      setJob(null);
      setMatches([]);
      setNoSpeech(false);
      setCurrentPlayingTimestamp(null);
      clearPendingTransition();
      // Start the progress count the moment the button is clicked, before the
      // search request resolves, so the user sees counting immediately.
      setEstimatedWait(null);
      setProgress(PROGRESS_INITIAL);
      setPhase('processing');
      try {
        const response = await submitSearch(query.url, keyword, controller.signal);
        if (controller.signal.aborted) return;
        trackEvent('search_submit', { source: 'network' });
        if (response.status === 'found' || response.status === 'not_found') {
          setCachedResults(video, keyword, response.results, response.no_speech ?? false);
          setMatches(response.results);
          setNoSpeech(response.no_speech ?? false);
          setProgress(100);
          setTranscriptReady(true);
          setPhase('done');
          return;
        }
        setJob({
          signal: controller.signal,
          jobId: response.job_id,
          videoId: response.video_id,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const messageKey = error instanceof ApiError ? error.messageKey : t('error.server');
        trackEvent('search_error', { reason: messageKey });
        setErrorText(messageKey);
        setPhase('error');
      }
    },
    [t, clearPendingTransition, query.url, resolved, video],
  );

  const handlePollProgress = useCallback((status: StatusResponse) => {
    const serverValue = typeof status.progress === 'number' ? status.progress : null;
    const serverEta =
      typeof status.estimatedTimeSeconds === 'number' ? status.estimatedTimeSeconds : null;
    // Prefer the server-provided estimate; otherwise derive one from how
    // long the job has been running versus its reported progress.
    if (serverEta !== null) {
      setEstimatedWait(serverEta);
    } else if (serverValue !== null && serverValue > 0 && startedAtRef.current !== null) {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      setEstimatedWait(Math.max(1, Math.round((elapsed * (100 - serverValue)) / serverValue)));
    } else {
      setEstimatedWait(null);
    }
    if (serverValue !== null) {
      // Snap the server value down to the nearest multiple of PROGRESS_TICK_STEP
      // (10, 20, … 90) AND allow it to move the counter forward by at most one
      // step per poll, so the bar always climbs strictly 10 → 20 → … → 90 and
      // never jumps (e.g. 40 → 60) even when the backend reports coarse stages.
      const serverStep =
        Math.floor(Math.min(serverValue, PROGRESS_MAX) / PROGRESS_TICK_STEP) * PROGRESS_TICK_STEP;
      setProgress((current) => {
        const base = current ?? PROGRESS_INITIAL;
        return Math.max(base, Math.min(serverStep, base + PROGRESS_TICK_STEP));
      });
    }
  }, []);

  const handlePollSuccess = useCallback(
    (value: SearchMatch[], noSpeech: boolean) => {
      if (video) setCachedResults(video, query.keyword, value, noSpeech);
      setNoSpeech(noSpeech);
      setProgress(100);
      setTranscriptReady(true);
      clearPendingTransition();
      const signal = searchControllerRef.current?.signal;
      transitionTimerRef.current = window.setTimeout(() => {
        if (signal?.aborted) return;
        setMatches(value);
        setPhase('done');
      }, PROGRESS_DONE_DELAY_MS);
    },
    [query.keyword, video, clearPendingTransition],
  );
  const handlePollError = useCallback(
    (message: string) => {
      clearPendingTransition();
      setErrorText(message);
      setPhase('error');
    },
    [clearPendingTransition],
  );

  useJobPolling({
    signal: job?.signal,
    jobId: job?.jobId ?? '',
    videoId: job?.videoId ?? '',
    keyword: query.keyword,
    onProgress: handlePollProgress,
    onSuccess: handlePollSuccess,
    onError: handlePollError,
  });

  useEffect(() => {
    if (phase !== 'processing') return undefined;
    let timer: number | null = null;
    const scheduleNext = (current: number) => {
      if (current >= PROGRESS_MAX) return;
      const remaining = estimatedWaitRef.current;
      let delay = PROGRESS_FALLBACK_TICK_MS;
      if (remaining !== null && remaining > 1) {
        // Divide the estimated wait into 10 equal segments, one per 10% step:
        // a 60s estimate advances the bar by 10 every 6 seconds.
        delay = Math.max(PROGRESS_MIN_TICK_MS, (remaining * 1000) / PROGRESS_TOTAL_STEPS);
      }
      timer = window.setTimeout(() => {
        // Schedule the next tick here (outside the setState updater): React
        // double-invokes updaters in dev/StrictMode, and a timer scheduled from
        // inside one would fork the chain into two +10 ticks → visible 40→60
        // jumps. Threading `current` keeps the chain strictly one 10-step at a time.
        const next = Math.min(current + PROGRESS_TICK_STEP, PROGRESS_MAX);
        setProgress(next);
        scheduleNext(next);
      }, delay);
    };
    scheduleNext(PROGRESS_INITIAL);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [phase]);

  const resetSearch = useCallback(() => {
    searchControllerRef.current?.abort();
    clearPendingTransition();
    setSharedSeconds(null);
    setSharedKeyword(null);
    setSharedMatches(null);
    setSharedMatched(true);
    setPhase('idle');
    setMatches([]);
    setProgress(null);
    setEstimatedWait(null);
    setErrorText('');
    setJob(null);
    setCurrentPlayingTimestamp(null);
  }, [clearPendingTransition]);

  const handleClearKeyword = useCallback(() => {
    resetSearch();
    setQuery((current) => ({ ...current, keyword: '' }));
    keywordFormRef.current?.setKeyword('');
    keywordFormRef.current?.focus();
  }, [resetSearch]);

  const handleCancelSearch = useCallback(() => {
    trackEvent('search_cancel');
    resetSearch();
    keywordFormRef.current?.focus();
  }, [resetSearch]);

  const handleRetry = useCallback(() => {
    // Retry what is on screen, not what was submitted: the visitor may have
    // corrected the phrase after the failure. An empty field goes back through
    // the form's own validation so it focuses the input and explains the error.
    const currentKeyword = keywordFormRef.current?.getKeyword().trim() ?? query.keyword;
    if (!currentKeyword) {
      keywordFormRef.current?.submit();
      return;
    }
    if (video) {
      void handleSearch(currentKeyword);
      return;
    }
    keywordFormRef.current?.submit();
  }, [handleSearch, query.keyword, video]);

  const ensureTranscript = useCallback(
    async (signal: AbortSignal) => {
      if (!video) {
        throw new Error('No video loaded');
      }
      if (transcriptReady) {
        return;
      }
      await ensureVideoTranscript(video.id, signal);
      setTranscriptReady(true);
    },
    [transcriptReady, video],
  );

  const searching = phase === 'processing';
  const loadErrorText = loadError ? t(loadError) : undefined;

  // On the home view, honour a fragment anchor (the header's "How it works" /
  // "Why Qfza" links) once the sections are mounted.
  //
  // A fragment is a same-document anchor, not a route, so it survives the move to
  // clean paths untouched — `/#how-it-works` is still the right way to reach that
  // section from any page, and it is also what the static header emits. A legacy
  // route fragment has already been rewritten away by the time this runs, and a
  // fragment with no matching element is simply ignored below.
  useEffect(() => {
    if (route !== 'home') return;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const target = document.getElementById(hash);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [route]);

  // Every route is a full page shell: header, one panel, footer. The auth and
  // history pages have no search form, so mounting them here keeps the search
  // tree (and its polling) completely unmounted rather than hidden — an
  // in-flight job cannot keep ticking behind a login form.
  //
  // An unknown path is one of these views, not the homepage: see the fallback
  // in `useRoute` and scripts/lib/notfound.mjs for the document production
  // serves at the same URLs.
  if (route === 'not-found') {
    return (
      <PageShell onLogoClick={handleLogoClick}>
        <NotFoundPage />
      </PageShell>
    );
  }

  if (route === 'contact') {
    return (
      <PageShell onLogoClick={handleLogoClick}>
        <ContactPage />
      </PageShell>
    );
  }

  if (route === 'login') {
    return (
      <PageShell onLogoClick={handleLogoClick}>
        <LoginPage />
      </PageShell>
    );
  }

  if (route === 'register') {
    return (
      <PageShell onLogoClick={handleLogoClick}>
        <RegisterPage />
      </PageShell>
    );
  }

  if (route === 'reset-password') {
    return (
      <PageShell onLogoClick={handleLogoClick}>
        <ResetPasswordPage />
      </PageShell>
    );
  }

  if (route === 'verify-email') {
    return (
      <PageShell onLogoClick={handleLogoClick}>
        <VerifyEmailPage />
      </PageShell>
    );
  }

  if (route === 'history') {
    return (
      <PageShell onLogoClick={handleLogoClick}>
        <HistoryPage onReplay={replayHistoryEntry} onOpenVideo={openHistoryVideo} />
      </PageShell>
    );
  }

  if (route === 'profile') {
    return (
      <PageShell onLogoClick={handleLogoClick}>
        <ProfilePage />
      </PageShell>
    );
  }

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">
        {t('actions.skipToContent')}
      </a>
      <SiteHeader onLogoClick={handleLogoClick} />
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        {video ? (
          <>
            <div className="mb-4">
              <Hero compact />
            </div>
            <div className="mb-3">
              <VideoUrlForm
                key={query.url}
                compact
                onSubmit={handleLoad}
                disabled={loadingVideo}
                initialUrl={query.url}
              />
            </div>
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-x-8 lg:gap-y-0">
              <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:mb-8">
                <KeywordSearchForm
                  ref={keywordFormRef}
                  onSubmit={(keyword) => void handleSearch(keyword)}
                  disabled={searching || loadingVideo || !resolved}
                  disabledHint={
                    searching ? undefined : t('workspace.searchAvailableAfterLoad')
                  }
                  initialKeyword={query.keyword}
                />
              </div>
              <VideoStage
                video={video}
                resolved={resolved}
                loading={loadingVideo}
                loadError={loadErrorText}
                allowNotes={!noSpeech}
                transcriptReady={transcriptReady}
                ensureTranscript={ensureTranscript}
                playerRef={playerRef}
                sectionRef={videoColumnRef}
                onPlaybackChange={setCurrentPlayingTimestamp}
              />
              <div
                ref={resultsRef}
                className={`min-w-0 scroll-mt-6 lg:col-start-2 lg:row-start-2 ${
                  phase === 'idle' ? 'lg:self-stretch' : ''
                }`}
              >
                <ResultsPanel
                  phase={phase}
                  progress={progress}
                  matches={matches}
                  noSpeech={noSpeech}
                  errorText={errorText}
                  keyword={query.keyword}
                  video={video}
                  matchLimit={MATCH_LIMIT}
                  showPlayer={false}
                  showToolbar={false}
                  showMockup
                  playerRef={playerRef}
                  onSeek={handleSeek}
                  onPlaybackChange={setCurrentPlayingTimestamp}
                  onClear={handleClearKeyword}
                  onRetry={handleRetry}
                  onCancel={searching ? handleCancelSearch : undefined}
                  currentPlayingTimestamp={currentPlayingTimestamp}
                  sharedSeconds={sharedSeconds}
                  sharedKeyword={sharedKeyword}
                  sharedMatches={sharedMatches}
                  sharedMatched={sharedMatched}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-8 lg:mb-10">
              <Hero />
            </div>
            <div className="mx-auto w-full max-w-4xl">
              <VideoUrlForm
                key={query.url}
                onSubmit={handleLoad}
                disabled={loadingVideo}
                initialUrl={query.url}
              />
            </div>
          </>
        )}
        <HowItWorks />
        <Features />
      </main>
      <SiteFooter />
    </div>
  );
}

/** Header + one panel + footer, shared by every non-search route. */
function PageShell({
  children,
  onLogoClick,
}: {
  children: React.ReactNode;
  onLogoClick?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="app">
      <a href="#main-content" className="skip-link">
        {t('actions.skipToContent')}
      </a>
      <SiteHeader onLogoClick={onLogoClick} />
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
