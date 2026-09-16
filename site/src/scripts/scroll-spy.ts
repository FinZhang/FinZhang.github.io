/**
 * Tracks which in-page link's target was scrolled past last and reports it.
 * Hidden targets are skipped. Stops itself on client-side navigation.
 *
 * A target counts as passed once its top crosses a line `offset` px below the top of the window.
 * Targets near the end of the page may never reach that line; those are given evenly spaced turns
 * over the last half-screen of scrolling instead, the last one ending at the bottom of the page.
 *
 * A clicked link stays active until the reader scrolls by hand. A jump to one of the last targets
 * cannot bring it up to the line, and the highlight should still show what was clicked.
 */
export function scrollSpy(links: HTMLAnchorElement[], onActive: (link: HTMLAnchorElement | undefined) => void, offset = 120) {
  const pairs = links
    .map((a) => [a, document.getElementById(decodeURIComponent(a.hash.slice(1)))] as const)
    .filter((p): p is readonly [HTMLAnchorElement, HTMLElement] => p[1] !== null);
  const targetOf = new Map(pairs);

  let locked: HTMLAnchorElement | undefined;
  let frame = 0;

  const update = () => {
    frame = 0;
    if (locked && targetOf.get(locked)!.offsetParent !== null) return onActive(locked);
    locked = undefined;

    // A target can have several links (an article's contents appear twice); order by target.
    const seen = new Set<HTMLElement>();
    const visible = pairs.filter(([, target]) => target.offsetParent !== null && !seen.has(target) && seen.add(target));
    if (!visible.length) return onActive(undefined);

    const scrollY = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    // The scroll position at which each target crosses the line.
    const at = visible.map(([, target]) => target.getBoundingClientRect().top + scrollY - offset);
    if (maxScroll > 0 && at.at(-1)! > maxScroll) {
      // The last targets can't reach the line. Share the last half-screen of scrolling out evenly
      // among the targets due in it, so each gets a turn and the last one is active at the bottom.
      const start = Math.max(0, maxScroll - window.innerHeight / 2);
      const first = at.findIndex((a) => a > start);
      const count = at.length - first;
      for (let i = 0; i < count; i++) at[first + i] = start + ((maxScroll - start) * (i + 0.5)) / count;
    }

    let active = visible[0][0];
    visible.forEach(([link], i) => {
      if (at[i] <= scrollY) active = link;
    });
    onActive(active);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const onClick = (e: MouseEvent) => {
    locked = e.currentTarget as HTMLAnchorElement;
    onActive(locked);
  };
  // Scrolling caused by the jump itself keeps the lock; only the reader's own scrolling lifts it.
  const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
  const unlock = (e: Event) => {
    if (!locked) return;
    if (e instanceof KeyboardEvent && !SCROLL_KEYS.has(e.key)) return;
    // Pressing on the page's own scrollbar.
    if (e.type === "pointerdown" && e.target !== document.documentElement) return;
    locked = undefined;
    schedule();
  };
  const UNLOCK_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"];
  // Following a link fires popstate too, and must keep its lock. Back and forward restore an
  // earlier scroll position instead, which the position check handles.
  const onPopState = () => {
    if (locked?.hash !== location.hash) locked = undefined;
    schedule();
  };

  pairs.forEach(([a]) => a.addEventListener("click", onClick));
  UNLOCK_EVENTS.forEach((type) => window.addEventListener(type, unlock, { passive: true }));
  window.addEventListener("popstate", onPopState);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  const stop = () => {
    pairs.forEach(([a]) => a.removeEventListener("click", onClick));
    UNLOCK_EVENTS.forEach((type) => window.removeEventListener(type, unlock));
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    cancelAnimationFrame(frame);
  };
  document.addEventListener("astro:before-swap", stop, { once: true });
  update();
  return { update, stop };
}
