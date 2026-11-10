// Layout checks a browser can decide on its own (docs/features/responsive-layout.md): run in the
// page, they answer what is broken at the current viewport, with no screenshot to look at.
//
// - `pageScroll`: the page scrolls sideways (the document is wider than the viewport).
// - `outOfViewport`: an element sticks out of the viewport and no scroller of its own holds it
//   (an ancestor with `overflow-x: auto | scroll | hidden | clip` below <body> is such a scroller,
//   for example a table's wrapper). Only the outermost offender is listed.
// - `animatedOverflow`: the same, at any moment of a CSS animation (sampled through its keyframes).
// - `textOverflow`: text wider than its own box (a long word, a number that does not wrap) in an
//   element that lets it spill (`overflow-x: visible`).
// - `textOverlapsBelow` / `textClipped`: text taller than its box by more than half a line (a fixed
//   height it outgrew), running over what follows or cut off. Less is the glyphs' ink above and
//   below a tight line height, which every large heading has and nobody sees.
// - `smallTargets`: on a phone, a link, button or field smaller than 24 × 24 CSS px (WCAG 2.2
//   2.5.8). What the reader can tap counts: a control's own <label>, and a link stretched over
//   its card by an absolute `::after`. The criterion's exceptions apply: a link inside a sentence,
//   and an undersized target with room around it (a 24 px circle on its centre touches no other
//   target and no other undersized target's circle).
// - `textNotScaling` (`checkTextScales`): text that keeps its size when the root font size doubles.
//
// Only what is rendered counts: the content of a closed <details> (the header's menu, the price
// breakdown) is laid out but not shown (`checkVisibility()` is false), and a screen-reader-only
// 1 px box is placed off the page on purpose.
//
// The measurements that are design choices, not breakage (how much of a wide screen the content
// uses, how many columns a grid shows), come back in `metrics` for the spec to report.
import type { CDPSession, Page } from '@playwright/test';

export type LayoutProblem = { check: string; element: string; detail: string };
export type LayoutMetrics = {
  viewport: number;
  /** The widest element inside <main> that is not full-bleed: what the page's content uses. */
  contentWidth: number;
  /** The most columns any grid inside <main> shows. */
  gridColumns: number;
  /** The staff strip's and the header's heights: a nav that wraps shows here. */
  headerHeight: number;
};
export type LayoutReport = { problems: LayoutProblem[]; metrics: LayoutMetrics };

/** Runs every check on the page as it is laid out now. `phone` adds the tap-target check. */
export async function checkLayout(page: Page, options: { phone: boolean }): Promise<LayoutReport> {
  return page.evaluate(({ phone }) => {
    const root = document.documentElement;
    const viewport = root.clientWidth;
    const problems: { check: string; element: string; detail: string }[] = [];

    const describe = (element: Element) => {
      const classes =
        typeof element.className === 'string'
          ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 3)
          : [];
      const text = ((element as HTMLElement).innerText ?? element.textContent ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40);
      return `${element.tagName.toLowerCase()}${classes.length ? `.${classes.join('.')}` : ''}${text ? ` "${text}"` : ''}`;
    };
    const visible = (element: Element) => {
      // `checkVisibility` is false for `display: none` (an ancestor's too), `visibility: hidden`
      // and a skipped subtree: the content of a closed <details> still has boxes, squeezed or
      // off the page, that nobody sees.
      if (!element.checkVisibility({ visibilityProperty: true })) return false;
      const box = element.getBoundingClientRect();
      // A screen-reader-only element (`sr-only`) is a 1 × 1 px box placed just off the page on
      // purpose; nobody sees it, so it is not part of the layout.
      return box.width > 1 && box.height > 1;
    };
    const fixedOrInSvg = (element: Element) =>
      element.closest('svg') !== null ||
      ['fixed', 'sticky'].includes(getComputedStyle(element).position);
    /** An ancestor below <body> that clips or scrolls sideways. */
    const heldByScroller = (element: Element) => {
      for (
        let parent = element.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX)) {
          return true;
        }
      }
      return false;
    };

    if (root.scrollWidth > viewport) {
      problems.push({
        check: 'pageScroll',
        element: 'html',
        detail: `the page is ${root.scrollWidth} px wide in a ${viewport} px viewport`,
      });
    }

    // An animation can push its element out of the viewport for a moment and settle inside it,
    // so the settled page looks fine while a phone wobbles sideways on every load. Each CSS
    // animation is paused and sampled through its keyframes, then put back where it was.
    const SAMPLES = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];
    for (const animation of document.getAnimations()) {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      const duration = Number(animation.effect?.getComputedTiming().duration ?? 0);
      if (!target || !(duration > 0) || !visible(target) || fixedOrInSvg(target)) continue;
      if (heldByScroller(target)) continue;
      const wasAt = animation.currentTime;
      const wasState = animation.playState;
      let worst: { at: number; left: number; right: number } | null = null;
      for (const at of SAMPLES) {
        animation.pause();
        animation.currentTime = at * duration;
        const box = target.getBoundingClientRect();
        const outBy = Math.max(box.right - viewport, -box.left);
        if (outBy > 0.5 && (!worst || outBy > Math.max(worst.right - viewport, -worst.left))) {
          worst = { at, left: box.left, right: box.right };
        }
      }
      animation.currentTime = wasAt;
      if (wasState === 'running') animation.play();
      if (worst) {
        problems.push({
          check: 'animatedOverflow',
          element: describe(target),
          detail: `at ${Math.round(worst.at * 100)} % of "${(animation as CSSAnimation).animationName ?? 'its animation'}" it spans ${Math.round(worst.left)} to ${Math.round(worst.right)} in a ${viewport} px viewport`,
        });
      }
    }

    const elements = [...document.body.querySelectorAll('*')].filter(
      (element) => visible(element) && !fixedOrInSvg(element)
    );
    const outside = new Set<Element>();
    for (const element of elements) {
      const box = element.getBoundingClientRect();
      if (box.right <= viewport + 0.5 && box.left >= -0.5) continue;
      if (heldByScroller(element)) continue;
      outside.add(element);
      let parent = element.parentElement;
      while (parent && !outside.has(parent)) parent = parent.parentElement;
      if (parent) continue; // an ancestor is already listed
      problems.push({
        check: 'outOfViewport',
        element: describe(element),
        detail: `spans ${Math.round(box.left)} to ${Math.round(box.right)} in a ${viewport} px viewport`,
      });
    }

    for (const element of elements) {
      const html = element as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA', 'svg'].includes(element.tagName)) continue;
      // A screen-reader-only label is a 1 px box that clips on purpose.
      if (html.clientWidth <= 1 || html.clientHeight <= 1) continue;
      const ownText = [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== ''
      );
      if (!ownText) continue;
      const style = getComputedStyle(element);
      if (style.overflowX === 'visible' && html.scrollWidth > html.clientWidth + 1) {
        problems.push({
          check: 'textOverflow',
          element: describe(element),
          detail: `text is ${html.scrollWidth} px in a ${html.clientWidth} px box`,
        });
      }
      // Taller than its box by more than half a line: a fixed height that the text outgrew,
      // clipped or running over whatever comes next. A few pixels more are the glyphs' ink
      // above and below a tight line height (`leading-none` headings), not a hidden line.
      const lineHeight =
        style.lineHeight === 'normal'
          ? 1.2 * parseFloat(style.fontSize)
          : parseFloat(style.lineHeight);
      if (html.scrollHeight - html.clientHeight > Math.max(2, lineHeight / 2)) {
        problems.push({
          check: style.overflowY === 'visible' ? 'textOverlapsBelow' : 'textClipped',
          element: describe(element),
          detail: `text is ${html.scrollHeight} px tall in a ${html.clientHeight} px box`,
        });
      }
    }

    if (phone) {
      const targets = elements.filter((element) =>
        element.matches(
          'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"]'
        )
      );
      /** The area a tap reaches: the control's own <label>s, a link's stretched `::after`. */
      const tapArea = (target: Element): DOMRect => {
        let area = target.getBoundingClientRect();
        const grow = (other: DOMRect) => {
          if (other.width * other.height > area.width * area.height) area = other;
        };
        for (const label of (target as HTMLInputElement).labels ?? []) {
          grow(label.getBoundingClientRect());
        }
        for (const pseudo of ['::before', '::after']) {
          const style = getComputedStyle(target, pseudo);
          if (style.content === 'none' || !['absolute', 'fixed'].includes(style.position)) {
            continue;
          }
          let block = target as Element | null;
          while (
            block &&
            block !== document.body &&
            getComputedStyle(block).position === 'static'
          ) {
            block = block.parentElement;
          }
          if (block && block !== target) grow(block.getBoundingClientRect());
        }
        return area;
      };
      const areas = targets.map(tapArea);
      const small = areas.map((area) => area.width < 24 || area.height < 24);
      const centre = (area: DOMRect) => [area.left + area.width / 2, area.top + area.height / 2];
      const distanceTo = ([x, y]: number[], area: DOMRect) =>
        Math.hypot(
          Math.max(area.left - x!, 0, x! - area.right),
          Math.max(area.top - y!, 0, y! - area.bottom)
        );
      /** WCAG's spacing exception: a 24 px circle on the centre touches no other target. */
      const spaced = (index: number) => {
        const here = centre(areas[index]!);
        return areas.every((other, j) => {
          if (j === index) return true;
          if (distanceTo(here, other) < 12) return false;
          const [x, y] = centre(other);
          return !small[j] || Math.hypot(here[0]! - x!, here[1]! - y!) >= 24;
        });
      };
      for (const [index, target] of targets.entries()) {
        const box = areas[index]!;
        if (!small[index] || spaced(index)) continue;
        const inSentence =
          getComputedStyle(target).display === 'inline' &&
          [...(target.parentElement?.childNodes ?? [])].some(
            (node) =>
              node !== target &&
              node.nodeType === Node.TEXT_NODE &&
              (node.textContent ?? '').trim() !== ''
          );
        if (inSentence) continue;
        problems.push({
          check: 'smallTargets',
          element: describe(target),
          detail: `${Math.round(box.width)} × ${Math.round(box.height)} px`,
        });
      }
    }

    const main = document.querySelector('main');
    const inMain = main ? [...main.querySelectorAll('*')].filter(visible) : [];
    const contentWidth = Math.round(
      Math.max(
        0,
        ...inMain
          .map((element) => element.getBoundingClientRect().width)
          .filter((width) => width < viewport - 1)
      )
    );
    const gridColumns = Math.max(
      0,
      ...inMain
        .filter((element) => getComputedStyle(element).display === 'grid')
        .map(
          (element) =>
            getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length
        )
    );
    const headerHeight = Math.round(
      [...document.querySelectorAll('body > .staff-zone, body > header, .staff-zone, header')]
        .slice(0, 2)
        .reduce((sum, element) => sum + element.getBoundingClientRect().height, 0)
    );
    return { problems, metrics: { viewport, contentWidth, gridColumns, headerHeight } };
  }, options);
}

/** A viewport the spec checks a page at; `textZoom` is the reader's text size (1 = default). */
export type Viewport = { name: string; width: number; height: number; textZoom?: number };

/** Phones (portrait and landscape), a tablet, laptops, and wide desktop screens. */
const SCREENS: readonly Viewport[] = [
  { name: 'phone-320', width: 320, height: 640 },
  { name: 'phone-360', width: 360, height: 780 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'full-hd', width: 1920, height: 1080 },
  { name: 'qhd', width: 2560, height: 1440 },
];

/**
 * The reader's larger text sizes (browser font-size setting, WCAG 1.4.4 asks for 200 %), on a
 * phone, a tablet and a laptop: the screens where bigger text runs out of room first.
 */
export const TEXT_ZOOMS = [1.5, 2] as const;
const ZOOMED_ON = ['phone-390', 'tablet', 'laptop'];

/** Every screen, then every zoomed text size on the screens it matters on. */
export const VIEWPORTS: readonly Viewport[] = [
  ...SCREENS,
  ...TEXT_ZOOMS.flatMap((zoom) =>
    SCREENS.filter((screen) => ZOOMED_ON.includes(screen.name)).map((screen) => ({
      ...screen,
      name: `${screen.name} text ${zoom * 100}%`,
      textZoom: zoom,
    }))
  ),
];

/**
 * Every language the app ships, at every viewport (Finnish and Estonian words are long), and the
 * two pseudo-languages (D95): text about twice as long, and about half as long, as English.
 */
export const LOCALES = ['en', 'fi', 'sv', 'et', 'qps-long', 'qps-short'] as const;

/**
 * Text that does not grow with the reader's text size: the root font size is doubled in place
 * and every element with its own text is compared; one that grew less than 1.5 times is set in
 * a fixed unit (px) that ignores the reader's setting. The page is restored afterwards.
 */
export async function checkTextScales(page: Page): Promise<LayoutProblem[]> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    const withText = [...document.body.querySelectorAll('*')].filter(
      (element) =>
        element.closest('svg') === null &&
        [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== ''
        ) &&
        (element as HTMLElement).offsetParent !== null
    );
    const sizes = (zoom: string) => {
      root.style.fontSize = zoom;
      return withText.map((element) => parseFloat(getComputedStyle(element).fontSize));
    };
    const before = sizes('');
    const after = sizes('200%');
    root.style.fontSize = previous;
    const problems: { check: string; element: string; detail: string }[] = [];
    withText.forEach((element, index) => {
      const ratio = after[index]! / before[index]!;
      if (ratio >= 1.5) return;
      const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      problems.push({
        check: 'textNotScaling',
        element: `${element.tagName.toLowerCase()} "${text}"`,
        detail: `${before[index]} px stays ${after[index]} px when the reader doubles the text size`,
      });
    });
    return problems;
  });
}

/** Chromium's default font sizes (chrome://settings/fonts): standard 16 px, fixed-width 13 px. */
const DEFAULT_FONT = { standard: 16, fixed: 13 };
const sessions = new WeakMap<Page, CDPSession>();

/**
 * Sets the viewport and the reader's text size, and waits until the page has laid itself out.
 * The text size is the browser's own setting (`Page.setFontSizes`, what chrome://settings/fonts
 * changes), not a font size on <html>: the app's breakpoints are in rem (`sm` 40rem, `md` 48rem),
 * and a media query's rem is the browser's default size, which an <html> style does not move. With
 * the real setting at 200 % a 768 px tablet gets the phone layout, as the reader would.
 */
export async function useViewport(page: Page, viewport: Viewport): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  let session = sessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  const zoom = viewport.textZoom ?? 1;
  // Whole pixels: the protocol refuses a fraction (13 × 1.5).
  await session.send('Page.setFontSizes', {
    fontSizes: {
      standard: Math.round(DEFAULT_FONT.standard * zoom),
      fixed: Math.round(DEFAULT_FONT.fixed * zoom),
    },
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}
