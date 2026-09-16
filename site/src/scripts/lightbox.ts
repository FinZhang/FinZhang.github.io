// Click an article image to inspect it: wheel or pinch to zoom, drag to pan, double-click to
// toggle between fitting the window and a closer look. Esc or a click beside the image closes.

const STEP = 1.4;
const MAX_ZOOM = 8;

const icon = (paths: string) =>
  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export function bindLightbox(root: HTMLElement | null) {
  if (!root || root.dataset.lightbox) return;
  root.dataset.lightbox = "true";

  for (const img of root.querySelectorAll<HTMLImageElement>("img")) {
    img.tabIndex = 0;
    img.setAttribute("role", "button");
    const alt = img.alt && !/^(\d+|img|image)$/i.test(img.alt) ? `：${img.alt}` : "图片";
    img.setAttribute("aria-label", `放大查看${alt}`);
  }
  root.addEventListener("click", (e) => {
    const img = (e.target as HTMLElement).closest("img");
    if (img && root.contains(img)) openViewer(img);
  });
  root.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openViewer(target as HTMLImageElement);
    }
  });
}

function openViewer(source: HTMLImageElement) {
  if (document.querySelector(".lightbox")) return;

  const overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "查看图片");

  const img = new Image();
  img.className = "lightbox-img";
  img.alt = source.alt;
  img.draggable = false;
  img.src = source.currentSrc || source.src;

  const bar = document.createElement("div");
  bar.className = "lightbox-bar";
  bar.innerHTML = [
    `<button class="lightbox-btn" type="button" data-act="out" aria-label="缩小">${icon('<path d="M5 12h14"/>')}</button>`,
    `<span class="lightbox-zoom" data-zoom>100%</span>`,
    `<button class="lightbox-btn" type="button" data-act="in" aria-label="放大">${icon('<path d="M5 12h14"/><path d="M12 5v14"/>')}</button>`,
    `<span class="lightbox-sep"></span>`,
    `<button class="lightbox-btn" type="button" data-act="fit" aria-label="适应窗口">${icon('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>')}</button>`,
    `<button class="lightbox-btn" type="button" data-act="close" aria-label="关闭">${icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>')}</button>`,
  ].join("");
  const zoomLabel = bar.querySelector<HTMLElement>("[data-zoom]")!;

  overlay.append(img, bar);
  document.body.append(overlay);
  const previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";

  // ── Geometry: the picture is laid out at its natural size and moved with one transform ──
  let naturalW = 1;
  let naturalH = 1;
  let fit = 1;
  let scale = 1;
  let x = 0;
  let y = 0;
  const W = () => overlay.clientWidth;
  const H = () => overlay.clientHeight;

  const render = () => {
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  };
  // Smaller than the window: keep it centred. Larger: it may pan, but never leave the screen.
  const keepInView = () => {
    const w = naturalW * scale;
    const h = naturalH * scale;
    const margin = 48;
    x = w <= W() ? (W() - w) / 2 : Math.min(margin, Math.max(W() - w - margin, x));
    y = h <= H() ? (H() - h) / 2 : Math.min(margin, Math.max(H() - h - margin, y));
  };
  const zoomAt = (next: number, px: number, py: number) => {
    const clamped = Math.min(Math.max(fit, 1) * MAX_ZOOM, Math.max(Math.min(fit, 1), next));
    x = px - (px - x) * (clamped / scale);
    y = py - (py - y) * (clamped / scale);
    scale = clamped;
    keepInView();
    render();
  };
  const measureFit = () => Math.min((W() * 0.92) / naturalW, (H() * 0.84) / naturalH, 1);
  const fitToWindow = () => {
    fit = measureFit();
    scale = fit;
    keepInView();
    render();
  };

  const ready = () => {
    naturalW = img.naturalWidth || 1;
    naturalH = img.naturalHeight || 1;
    img.style.width = `${naturalW}px`;
    img.style.height = `${naturalH}px`;
    fitToWindow();
    void overlay.offsetWidth; // start the fade from the laid-out state
    overlay.classList.add("is-open");
  };
  if (img.complete && img.naturalWidth) ready();
  else img.addEventListener("load", ready, { once: true });

  // ── Pointer: one finger or the mouse pans, two fingers pinch ──
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = false;
  let pinchDistance = 0;
  let pinchCentre = { x: 0, y: 0 };
  const pinch = () => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  overlay.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest(".lightbox-bar")) return;
    // Capture keeps the drag alive outside the window; it can fail for synthetic pointers.
    try {
      overlay.setPointerCapture(e.pointerId);
    } catch {
      /* keep going without capture */
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) moved = false;
    if (pointers.size === 2) {
      const p = pinch();
      pinchDistance = p.distance;
      pinchCentre = p.centre;
    }
    overlay.classList.add("is-dragging");
  });
  overlay.addEventListener("pointermove", (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, now);
    if (pointers.size === 1) {
      if (Math.abs(now.x - last.x) + Math.abs(now.y - last.y) > 1) moved = true;
      x += now.x - last.x;
      y += now.y - last.y;
      keepInView();
      render();
    } else if (pointers.size === 2) {
      moved = true;
      const p = pinch();
      x += p.centre.x - pinchCentre.x;
      y += p.centre.y - pinchCentre.y;
      if (pinchDistance) zoomAt(scale * (p.distance / pinchDistance), p.centre.x, p.centre.y);
      pinchDistance = p.distance;
      pinchCentre = p.centre;
    }
  });
  const release = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size < 2) pinchDistance = 0;
    if (pointers.size) return;
    overlay.classList.remove("is-dragging");
    if (e.type !== "pointerup" || moved) return;
    const r = img.getBoundingClientRect();
    const onPicture = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!onPicture) close();
  };
  overlay.addEventListener("pointerup", release);
  overlay.addEventListener("pointercancel", release);

  overlay.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoomAt(scale * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    },
    { passive: false },
  );
  overlay.addEventListener("dblclick", (e) => {
    if (scale > fit * 1.05) fitToWindow();
    else zoomAt(Math.max(fit * 2.5, 1), e.clientX, e.clientY);
  });

  bar.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
    if (act === "in") zoomAt(scale * STEP, W() / 2, H() / 2);
    else if (act === "out") zoomAt(scale / STEP, W() / 2, H() / 2);
    else if (act === "fit") fitToWindow();
    else if (act === "close") close();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "+" || e.key === "=") zoomAt(scale * STEP, W() / 2, H() / 2);
    else if (e.key === "-") zoomAt(scale / STEP, W() / 2, H() / 2);
    else if (e.key === "0") fitToWindow();
  };
  const onResize = () => {
    const atFit = Math.abs(scale - fit) < 0.001;
    fit = measureFit();
    if (atFit) fitToWindow();
    else {
      keepInView();
      render();
    }
  };
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);

  function close() {
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("astro:before-swap", close);
    document.documentElement.style.overflow = previousOverflow;
    overlay.remove();
    source.focus({ preventScroll: true });
  }
  document.addEventListener("astro:before-swap", close, { once: true });
  bar.querySelector<HTMLButtonElement>('[data-act="close"]')!.focus();
}
