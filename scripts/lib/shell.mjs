/**
 * The static, crawlable shell injected into dist/index.html before hydration.
 *
 * Kept in its own module so it can be imported by tests without executing
 * prerender.mjs, whose top-level code reads and rewrites the build output.
 *
 * Content rules this shell has to honour:
 *  - Visible markup, not <noscript>: crawlers and SEO tooling ignore noscript.
 *  - It is wiped by React on mount, so it is for crawlers and first paint only.
 *  - It must contain real <a href> paths to every other page on the site, or
 *    those pages are reachable only through sitemap.xml. The React header nav
 *    uses in-page fragments and the footer is client-rendered, so neither
 *    appears here — this nav is the only crawlable path out of the homepage.
 *    That makes it load-bearing: a page missing from this list is one hop from
 *    the sitemap but no hops from the homepage, which is the difference between
 *    internally linked and orphaned. Auth routes are deliberately absent — they
 *    are noindex, and a crawler cannot sign in.
 */
export const SHELL = `
  <div lang="en" dir="ltr">
    <h1>Search Inside Videos &amp; Find Any Moment</h1>
    <p>Qfza lets you search inside a video by word or phrase. Paste a public video URL, type what you are looking for, and Qfza scans the full transcript to find any moment and jump straight to the exact timestamp where your phrase is spoken.</p>
    <p>Instead of scrubbing through the player or skimming a plain transcript, you get precise results. Every match shows the sentence around your phrase, the video that contains it, and a direct link to the exact second of playback. Qfza supports words and full sentences in many languages, so you can search everything from a single keyword to an exact quote you half-remember.</p>
    <p>Qfza (قفزة) means &ldquo;leap&rdquo; or &ldquo;jump&rdquo; in Arabic — a quick motion straight to the moment you want. The app searches a public video&rsquo;s transcript word by word and returns the exact timestamps where your phrase is spoken. Open any result to watch that moment, or refine your search with a different word.</p>
    <h2>How it works</h2>
    <ol>
      <li><strong>Paste a video URL</strong> — a public video, not a channel or a playlist.</li>
      <li><strong>Enter a word or phrase</strong> — a single word or a full sentence.</li>
      <li><strong>Jump to the moment</strong> — open an exact timestamp as soon as your search is ready.</li>
    </ol>
    <h2>Why Qfza</h2>
    <ul>
      <li><strong>Exact phrase matching:</strong> the whole transcript is searched word by word, so you only see timestamps where the exact phrase appears.</li>
      <li><strong>Faster repeat searches:</strong> a new video may take a few minutes to process, but repeat searches reuse a cached transcript and come back instantly.</li>
      <li><strong>Watch at the right second:</strong> every result links straight to the exact moment, so you watch the scene instead of scrubbing.</li>
    </ul>
    <p><a href="#main-content">Start searching on Qfza</a></p>
      <nav aria-label="Site pages">
        <a href="/blog/" hreflang="en" lang="en">Blog</a>
        <a href="/search-inside-videos/" hreflang="en" lang="en">Search inside videos</a>
        <a href="/faq/" hreflang="en" lang="en">FAQ</a>
        <a href="/about/" hreflang="en" lang="en">About</a>
        <a href="/contact/" hreflang="en" lang="en">Contact</a>
        <a href="/terms/" hreflang="en" lang="en">Terms</a>
        <a href="/privacy/" hreflang="en" lang="en">Privacy</a>
      </nav>
  </div>
  <div lang="ar" dir="rtl">
    <h2>قفزة — ابحث داخل الفيديوهات وانتقل إلى اللحظة</h2>
    <p>الصق رابط الفيديو، وابحث عن أي كلمة أو عبارة؛ تجد «قفزة» مكان ظهورها، ويمكنك الانتقال مباشرةً إلى تلك اللحظة.</p>
    <p>يبحث تطبيق قفزة (وتُكتب أحيانًا «قفزه») في النص التفريغ لكامل الفيديو العام كلمةً كلمة، ويعيد التوقيتات المحددة التي تُنطق فيها العبارة. افتح أي نتيجة لمشاهدة اللحظة دون التقليب يدويًا.</p>
    <h3>كيف يعمل</h3>
    <ol>
      <li><strong>الصق رابط فيديو</strong> — فيديو عامًا وليس قناة أو قائمة تشغيل.</li>
      <li><strong>أدخل كلمة أو عبارة</strong> — كلمة واحدة أو جملة كاملة.</li>
      <li><strong>انتقل إلى اللحظة</strong> — انتقل إلى التوقيت المطلوب بعد اكتمال البحث.</li>
    </ol>
    <h3>لماذا قفزة؟</h3>
    <ul>
      <li><strong>مطابقة تامة للعبارة:</strong> نبحث في النص التفريغ الكامل كلمةً كلمة، فتحصل فقط على التوقيتات التي تظهر فيها العبارة نفسها تمامًا.</li>
      <li><strong>بحث أسرع عند التكرار:</strong> قد تستغرق معالجة فيديو جديد بضع دقائق، وتستفيد عمليات البحث المتكررة من النص المخزّن مؤقتًا.</li>
      <li><strong>شاهد في الثانية الصحيحة:</strong> كل نتيجة ترتبط مباشرةً باللحظة المحددة، لتشاهد المشهد بدلًا من التقليب يدويًا.</li>
    </ul>
    <p><a href="#main-content">ابدأ البحث على قفزة</a></p>
      <nav aria-label="صفحات الموقع">
        <a href="/ar/blog/" hreflang="ar" lang="ar">المدونة</a>
        <a href="/ar/search-inside-videos/" hreflang="ar" lang="ar">البحث داخل الفيديوهات</a>
        <a href="/ar/faq/" hreflang="ar" lang="ar">الأسئلة الشائعة</a>
        <a href="/ar/about/" hreflang="ar" lang="ar">عن قفزة</a>
        <a href="/ar/contact/" hreflang="ar" lang="ar">تواصل معنا</a>
        <a href="/ar/terms/" hreflang="ar" lang="ar">شروط الخدمة</a>
        <a href="/ar/privacy/" hreflang="ar" lang="ar">الخصوصية</a>
      </nav>
  </div>
`.trim();
