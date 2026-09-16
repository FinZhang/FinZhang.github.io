import { scrollSpy } from "./scroll-spy";
import { bindLightbox } from "./lightbox";
import { mountLock } from "./locked-post";

function initPost() {
  setUpPanel();
  // An encrypted post has no article yet: the rest waits until it is unlocked.
  const lock = document.querySelector<HTMLElement>("[data-lock]");
  if (lock) mountLock(lock, () => (setUpPanel(), setUpArticle()));
  else setUpArticle();
}

function setUpPanel() {
  // The contents / related / file blocks live in the floating panel, which outlives the page.
  const panel = document.querySelector<HTMLElement>("[data-aside-panel]");
  const asideButton = document.querySelector<HTMLElement>("[data-aside]");
  if (panel && asideButton) {
    const source = document.querySelector<HTMLElement>("[data-aside-source]");
    panel.classList.remove("is-open");
    panel.inert = true;
    asideButton.setAttribute("aria-expanded", "false");
    panel.replaceChildren(...(source ? [...(source.cloneNode(true) as HTMLElement).children] : []));
    asideButton.hidden = !source;
    // Jumping to a section should reveal it, not the panel. The panel is persisted across
    // navigations, so bind this once.
    if (!panel.dataset.ready) panel.dataset.ready = "true", panel.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a")) {
        panel.classList.remove("is-open");
        panel.inert = true;
        asideButton.setAttribute("aria-expanded", "false");
      }
    });
  }
}

function setUpArticle() {
  const panel = document.querySelector<HTMLElement>("[data-aside-panel]");
  // The contents exist twice: in the sidebar and in the pop-out. Highlight matches in both.
  const tocs = [...document.querySelectorAll<HTMLElement>(".toc")];
  const links = tocs.flatMap((t) => [...t.querySelectorAll<HTMLAnchorElement>("a")]);
  if (links.length) {
    scrollSpy(links, (active) => {
      links.forEach((l) => l.classList.toggle("is-active", !!active && l.hash === active.hash));
      for (const box of [...tocs, panel]) {
        if (!box || box.scrollHeight <= box.clientHeight) continue;
        const link = [...box.querySelectorAll<HTMLAnchorElement>("a")].find((l) => l.classList.contains("is-active"));
        if (!link) continue;
        const top = link.offsetTop;
        if (top < box.scrollTop || top + link.offsetHeight > box.scrollTop + box.clientHeight) {
          box.scrollTop = top - box.clientHeight / 3;
        }
      }
    });
  }

  bindLightbox(document.querySelector<HTMLElement>(".prose"));

  // PDF.js is large; load it only on PDF posts.
  const viewers = document.querySelectorAll<HTMLElement>("[data-pdf]");
  if (viewers.length) void import("./pdf-viewer").then(({ mountPdfViewer }) => viewers.forEach(mountPdfViewer));
}

document.addEventListener("astro:page-load", initPost);
