/**
 * Tracks which in-page link's target was scrolled past last and reports it.
 * Hidden targets are skipped. Stops itself on client-side navigation.
 */
export function scrollSpy(links: HTMLAnchorElement[], onActive: (link: HTMLAnchorElement | undefined) => void, offset = 120) {
  const pairs = links
    .map((a) => [a, document.getElementById(decodeURIComponent(a.hash.slice(1)))] as const)
    .filter((p): p is readonly [HTMLAnchorElement, HTMLElement] => p[1] !== null);

  let frame = 0;
  const update = () => {
    frame = 0;
    const visible = pairs.filter(([, target]) => target.offsetParent !== null);
    let active = visible[0]?.[0];
    for (const [link, target] of visible) {
      if (target.getBoundingClientRect().top <= offset) active = link;
      else break;
    }
    onActive(active);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  const stop = () => {
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    cancelAnimationFrame(frame);
  };
  document.addEventListener("astro:before-swap", stop, { once: true });
  update();
  return { update, stop };
}
