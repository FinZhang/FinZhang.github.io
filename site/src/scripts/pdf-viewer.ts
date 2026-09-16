// A PDF reader drawn with PDF.js in the site's own chrome, replacing the browser's built-in viewer.
// Pages are rendered to canvas only while they are near the viewport and released when far away.

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Copied from node_modules/pdfjs-dist by scripts/sync-posts.mjs.
const ASSETS = "/pdfjs/";
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

interface Slot {
  index: number;
  el: HTMLElement;
  ratio: number;
  page?: PDFPageProxy;
  canvas?: HTMLCanvasElement;
  renderedWidth: number;
  task?: RenderTask;
}

export function mountPdfViewer(root: HTMLElement) {
  if (root.dataset.ready) return;
  root.dataset.ready = "true";

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const scroller = $<HTMLElement>("[data-pdf-pages]");
  const status = $<HTMLElement>("[data-pdf-status]");
  const pageInput = $<HTMLInputElement>("[data-pdf-page]");
  const countEl = $<HTMLElement>("[data-pdf-count]");
  const prevBtn = $<HTMLButtonElement>("[data-pdf-prev]");
  const nextBtn = $<HTMLButtonElement>("[data-pdf-next]");
  const zoomOutBtn = $<HTMLButtonElement>("[data-pdf-zoom-out]");
  const zoomInBtn = $<HTMLButtonElement>("[data-pdf-zoom-in]");
  const zoomLabel = $<HTMLElement>("[data-pdf-zoom]");

  let pdf: PDFDocumentProxy | null = null;
  let slots: Slot[] = [];
  let zoom = 1;
  let current = 1;
  let destroyed = false;

  // ── Layout ──
  const innerWidth = () => {
    const cs = getComputedStyle(scroller);
    return Math.max(160, scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  };
  const layout = () => {
    const w = Math.round(innerWidth() * zoom);
    for (const s of slots) {
      s.el.style.width = `${w}px`;
      s.el.style.height = `${Math.round(w * s.ratio)}px`;
    }
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    zoomOutBtn.disabled = zoom <= ZOOMS[0];
    zoomInBtn.disabled = zoom >= ZOOMS[ZOOMS.length - 1];
  };

  // ── Rendering ──
  const release = (s: Slot) => {
    s.task?.cancel();
    s.task = undefined;
    if (s.canvas) {
      s.canvas.width = 0;
      s.canvas.height = 0;
      s.canvas.remove();
      s.canvas = undefined;
    }
    s.renderedWidth = 0;
  };

  const render = async (s: Slot) => {
    if (!pdf || destroyed) return;
    const cssWidth = s.el.clientWidth;
    if (s.canvas && Math.abs(s.renderedWidth - cssWidth) < 1) return;
    s.task?.cancel();

    const page = (s.page ??= await pdf.getPage(s.index));
    const base = page.getViewport({ scale: 1 });
    const ratio = base.height / base.width;
    if (Math.abs(ratio - s.ratio) > 0.001) {
      s.ratio = ratio;
      s.el.style.height = `${Math.round(cssWidth * ratio)}px`;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const task = page.render({ canvas, viewport });
    s.task = task;
    try {
      await task.promise;
    } catch (err) {
      // Cancellation is normal (a newer render, a release, or navigation); anything else is a bug.
      if (!/cancel/i.test(String((err as Error)?.name) + String((err as Error)?.message))) console.error("[pdf] render failed", s.index, err);
      return;
    }
    if (s.task !== task || destroyed) return;
    s.canvas?.remove();
    s.el.append(canvas);
    s.canvas = canvas;
    s.renderedWidth = cssWidth;
    s.task = undefined;
  };

  const slotOf = (el: Element) => slots[Number((el as HTMLElement).dataset.page) - 1];
  // Scrolling is tracked by the observer; after a zoom or resize the pages near the viewport
  // are found from the current geometry so they are redrawn at their new width.
  const renderNearby = () => {
    // clientHeight can be 0 while the tab is not being painted; keep a usable window anyway.
    const view = Math.max(scroller.clientHeight, 600);
    const top = scroller.scrollTop - view * 1.5;
    const bottom = scroller.scrollTop + view * 2.5;
    for (const s of slots) {
      if (s.el.offsetTop + s.el.offsetHeight >= top && s.el.offsetTop <= bottom) void render(s);
    }
  };
  const near = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) void render(slotOf(e.target));
    },
    { root: scroller, rootMargin: "150% 0px" },
  );
  const far = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (!e.isIntersecting) release(slotOf(e.target));
    },
    { root: scroller, rootMargin: "600% 0px" },
  );

  // ── Navigation ──
  const setCurrent = (n: number) => {
    current = n;
    if (document.activeElement !== pageInput) pageInput.value = String(n);
    prevBtn.disabled = n <= 1;
    nextBtn.disabled = n >= slots.length;
  };
  const goTo = (n: number) => {
    const s = slots[Math.min(Math.max(1, n), slots.length) - 1];
    if (!s) return;
    scroller.scrollTo({ top: s.el.offsetTop - parseFloat(getComputedStyle(scroller).paddingTop), behavior: "smooth" });
    setCurrent(s.index);
  };

  let frame = 0;
  scroller.addEventListener(
    "scroll",
    () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const probe = scroller.scrollTop + scroller.clientHeight * 0.35;
        let n = 1;
        for (const s of slots) {
          if (s.el.offsetTop <= probe) n = s.index;
          else break;
        }
        if (n !== current) setCurrent(n);
      });
    },
    { passive: true },
  );

  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));
  pageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      goTo(parseInt(pageInput.value, 10) || current);
      pageInput.blur();
    }
  });
  pageInput.addEventListener("blur", () => (pageInput.value = String(current)));

  const setZoom = (next: number) => {
    const s = slots[current - 1];
    const offset = s ? (scroller.scrollTop - s.el.offsetTop) / Math.max(1, s.el.offsetHeight) : 0;
    zoom = next;
    layout();
    if (s) scroller.scrollTop = s.el.offsetTop + offset * s.el.offsetHeight;
    scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
    renderNearby();
  };
  zoomInBtn.addEventListener("click", () => setZoom(ZOOMS.find((z) => z > zoom + 0.001) ?? zoom));
  zoomOutBtn.addEventListener("click", () => setZoom([...ZOOMS].reverse().find((z) => z < zoom - 0.001) ?? zoom));

  let resizeTimer: number | undefined;
  const resize = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      layout();
      renderNearby();
    }, 150);
  });

  // ── Load ──
  const loading = pdfjs.getDocument({
    url: root.dataset.src!,
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
    disableAutoFetch: true,
  });
  loading.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
    if (total) status.textContent = `Loading · 载入中 ${Math.min(100, Math.round((loaded / total) * 100))}%`;
  };

  loading.promise
    .then(async (doc) => {
      if (destroyed) return;
      pdf = doc;
      const first = await doc.getPage(1);
      const v = first.getViewport({ scale: 1 });
      countEl.textContent = String(doc.numPages);
      status.remove();
      slots = Array.from({ length: doc.numPages }, (_, i) => {
        const el = document.createElement("div");
        el.className = "pdf-page";
        el.dataset.page = String(i + 1);
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", `第 ${i + 1} 页`);
        scroller.append(el);
        return { index: i + 1, el, ratio: v.height / v.width, renderedWidth: 0 };
      });
      slots[0].page = first;
      layout();
      setCurrent(1);
      for (const s of slots) {
        near.observe(s.el);
        far.observe(s.el);
      }
      resize.observe(scroller);
      root.classList.add("is-loaded");
    })
    .catch((err) => {
      if (destroyed) return;
      console.error(err);
      status.textContent = "无法在页面中显示此 PDF · 请在新窗口中打开或下载";
    });

  document.addEventListener(
    "astro:before-swap",
    () => {
      destroyed = true;
      near.disconnect();
      far.disconnect();
      resize.disconnect();
      slots.forEach(release);
      void loading.destroy();
    },
    { once: true },
  );
}
