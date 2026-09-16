// Theme, text size and background music. The controls are persisted across
// client-side navigations (transition:persist), so this runs once per full load.

const KEY_THEME = "carillon:theme";
const KEY_FS = "carillon:fs";
const KEY_PLAYER = "carillon:player";
const SIZES = ["s", "m", "l"] as const;
const SIZE_NAMES: Record<string, string> = { s: "小", m: "中", l: "大" };

interface Track {
  title: string;
  src: string;
}
interface PlayerState {
  track: number;
  time: number;
  playing: boolean;
}

const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
  },
};

const fmtTime = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

export function setupFloatingControls() {
  const root = document.documentElement;

  // Newly fetched pages carry the default attributes; keep the reader's choices.
  document.addEventListener("astro:before-swap", (e) => {
    const next = (e as Event & { newDocument: Document }).newDocument.documentElement;
    next.dataset.theme = root.dataset.theme;
    next.dataset.fs = root.dataset.fs;
  });

  const el = document.querySelector<HTMLElement>(".floating");
  if (!el || el.dataset.ready) return;
  el.dataset.ready = "true";

  const q = <T extends Element>(sel: string) => el.querySelector<T>(sel)!;

  // ── Theme ──
  const themeBtn = q<HTMLButtonElement>("[data-theme-toggle]");
  const syncTheme = () => themeBtn.setAttribute("aria-pressed", String(root.dataset.theme === "dark"));
  themeBtn.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    store.set(KEY_THEME, next);
    syncTheme();
  });
  syncTheme();

  // ── Text size ──
  const fsBtn = q<HTMLButtonElement>("[data-fs-toggle]");
  const syncFs = () => fsBtn.setAttribute("aria-label", `正文字号：${SIZE_NAMES[root.dataset.fs ?? "s"]}`);
  fsBtn.addEventListener("click", () => {
    const i = SIZES.indexOf((root.dataset.fs ?? "s") as (typeof SIZES)[number]);
    const next = SIZES[(i + 1) % SIZES.length];
    root.dataset.fs = next;
    store.set(KEY_FS, next);
    syncFs();
  });
  syncFs();

  // ── Music ──
  const tracks: Track[] = JSON.parse(el.dataset.tracks ?? "[]");
  const panel = q<HTMLElement>(".player");
  const musicBtn = q<HTMLButtonElement>("[data-music]");
  const titleEl = q<HTMLElement>("[data-title]");
  const timeEl = q<HTMLElement>("[data-time]");
  const seek = q<HTMLInputElement>("[data-seek]");
  const toggleBtn = q<HTMLButtonElement>("[data-toggle]");

  // Panels share the space left of the dock, so only one is open at a time.
  const pairs: { button: HTMLElement; panel: HTMLElement }[] = [];
  const close = (p: { button: HTMLElement; panel: HTMLElement }) => {
    p.panel.classList.remove("is-open");
    p.panel.inert = true;
    p.button.setAttribute("aria-expanded", "false");
  };
  const setupPanel = (button: HTMLElement | null, panelEl: HTMLElement | null) => {
    if (!button || !panelEl) return;
    const pair = { button, panel: panelEl };
    pairs.push(pair);
    button.addEventListener("click", () => {
      const open = !panelEl.classList.contains("is-open");
      pairs.forEach((p) => close(p));
      panelEl.classList.toggle("is-open", open);
      panelEl.inert = !open;
      button.setAttribute("aria-expanded", String(open));
    });
  };
  
  setupPanel(musicBtn, panel);
  setupPanel(el.querySelector<HTMLElement>("[data-aside]"), el.querySelector<HTMLElement>("[data-aside-panel]"));
  pairs.forEach((p) => close(p));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") pairs.forEach((p) => close(p));
  });
  // A click anywhere outside an open panel (its own button aside, which toggles) closes it.
  document.addEventListener("pointerdown", (e) => {
    const target = e.target as Node;
    for (const p of pairs) {
      if (!p.panel.classList.contains("is-open")) continue;
      if (p.panel.contains(target) || p.button.contains(target)) continue;
      close(p);
    }
  });

  if (!tracks.length) return;

  const audio = new Audio();
  audio.preload = "metadata";
  let current = 0;
  let pendingTime = 0;
  let seeking = false;

  const saved: Partial<PlayerState> = JSON.parse(store.get(KEY_PLAYER) ?? "{}");
  const save = () =>
    store.set(KEY_PLAYER, JSON.stringify({ track: current, time: audio.currentTime || pendingTime, playing: !audio.paused }));

  const render = () => {
    const d = audio.duration;
    const t = audio.currentTime;
    const ratio = Number.isFinite(d) && d > 0 ? t / d : 0;
    if (!seeking) seek.value = String(Math.round(ratio * 1000));
    seek.style.setProperty("--progress", `${(Number(seek.value) / 10).toFixed(2)}%`);
    timeEl.textContent = Number.isFinite(d) ? `${fmtTime(t)} / ${fmtTime(d)}` : "";
  };

  const load = (i: number, time = 0) => {
    current = (i + tracks.length) % tracks.length;
    pendingTime = time;
    audio.src = tracks[current].src;
    titleEl.textContent = tracks[current].title;
    titleEl.title = tracks[current].title;
    seek.disabled = true;
    render();
  };

  const play = () => audio.play().catch(() => panel.classList.remove("is-playing"));

  audio.addEventListener("loadedmetadata", () => {
    if (pendingTime && pendingTime < audio.duration) audio.currentTime = pendingTime;
    pendingTime = 0;
    seek.disabled = false;
    render();
  });
  audio.addEventListener("play", () => {
    panel.classList.add("is-playing");
    save();
  });
  audio.addEventListener("pause", () => {
    panel.classList.remove("is-playing");
    save();
  });
  audio.addEventListener("ended", () => {
    load(current + 1);
    play();
  });
  let lastSave = 0;
  audio.addEventListener("timeupdate", () => {
    render();
    if (Date.now() - lastSave > 3000) {
      lastSave = Date.now();
      save();
    }
  });

  toggleBtn.addEventListener("click", () => (audio.paused ? play() : audio.pause()));
  q<HTMLButtonElement>("[data-prev]").addEventListener("click", () => {
    // Like most players: restart the track unless we're at its very beginning.
    if (audio.currentTime > 3) audio.currentTime = 0;
    else load(current - 1);
    play();
  });
  q<HTMLButtonElement>("[data-next]").addEventListener("click", () => {
    load(current + 1);
    play();
  });

  seek.addEventListener("input", () => {
    seeking = true;
    seek.style.setProperty("--progress", `${Number(seek.value) / 10}%`);
    if (Number.isFinite(audio.duration)) timeEl.textContent = `${fmtTime((Number(seek.value) / 1000) * audio.duration)} / ${fmtTime(audio.duration)}`;
  });
  seek.addEventListener("change", () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
    seeking = false;
    save();
  });

  window.addEventListener("pagehide", save);

  load(Math.min(Math.max(0, saved.track ?? 0), tracks.length - 1), saved.time ?? 0);
  // Resume where the reader left off; browsers may refuse until the page has had a click.
  if (saved.playing) play();
}
