// Theme, text size and background music. The controls are persisted across
// client-side navigations (transition:persist), so this runs once per full load.

const KEY_THEME = "carillon:theme";
const KEY_FS = "carillon:fs";
const KEY_PLAYER = "carillon:player";
const SIZES = ["s", "m", "l"] as const;
const SIZE_NAMES: Record<string, string> = { s: "小", m: "中", l: "大" };
// The volume slider at 100% plays at this fraction of the browser's full volume.
const MAX_VOLUME = 0.7;

interface Track {
  title: string;
  artist: string;
  album: string;
  src: string;
  cover: string;
}
interface PlayerState {
  track: number;
  time: number;
  playing: boolean;
  volume: number;
  muted: boolean;
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
  const artistEl = q<HTMLElement>("[data-artist]");
  const albumEl = q<HTMLElement>("[data-album]");
  const coverEl = q<HTMLImageElement>("[data-cover]");
  const countEl = q<HTMLElement>("[data-count]");
  const elapsedEl = q<HTMLElement>("[data-elapsed]");
  const durationEl = q<HTMLElement>("[data-duration]");
  const seek = q<HTMLInputElement>("[data-seek]");
  const toggleBtn = q<HTMLButtonElement>("[data-toggle]");
  const volumeBox = q<HTMLElement>(".player-volume");
  const muteBtn = q<HTMLButtonElement>("[data-mute]");
  const volume = q<HTMLInputElement>("[data-volume]");

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

  const savedRaw = store.get(KEY_PLAYER);
  const saved: Partial<PlayerState> = JSON.parse(savedRaw ?? "{}");
  const save = () =>
    store.set(
      KEY_PLAYER,
      JSON.stringify({
        track: current,
        time: audio.currentTime || pendingTime,
        playing: !audio.paused,
        volume: audio.volume / MAX_VOLUME,
        muted: audio.muted,
      } satisfies PlayerState),
    );

  const render = () => {
    const d = audio.duration;
    const t = audio.currentTime;
    const ratio = Number.isFinite(d) && d > 0 ? t / d : 0;
    if (!seeking) seek.value = String(Math.round(ratio * 1000));
    seek.style.setProperty("--progress", `${(Number(seek.value) / 10).toFixed(2)}%`);
    if (!seeking) elapsedEl.textContent = fmtTime(t);
    durationEl.textContent = Number.isFinite(d) ? fmtTime(d) : "0:00";
  };

  const setText = (node: HTMLElement, text: string) => {
    node.textContent = text;
    node.title = text;
    node.hidden = !text;
  };

  const load = (i: number, time = 0) => {
    current = (i + tracks.length) % tracks.length;
    pendingTime = time;
    const track = tracks[current];
    audio.src = track.src;
    setText(titleEl, track.title);
    setText(artistEl, track.artist);
    setText(albumEl, track.album && track.album !== track.title ? track.album : "");
    if (track.cover) coverEl.src = track.cover;
    coverEl.hidden = !track.cover;
    countEl.textContent = `${current + 1} / ${tracks.length}`;
    seek.disabled = true;
    render();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.cover ? [{ src: new URL(track.cover, location.href).href, sizes: "192x192", type: "image/webp" }] : [],
      });
    }
  };

  // ── Volume ──
  const renderVolume = () => {
    const level = audio.muted ? 0 : audio.volume / MAX_VOLUME;
    volume.value = String(Math.round(level * 100));
    volume.style.setProperty("--progress", `${level * 100}%`);
    volumeBox.dataset.volumeLevel = level === 0 ? "off" : level < 0.5 ? "low" : "high";
    muteBtn.setAttribute("aria-pressed", String(audio.muted));
    muteBtn.setAttribute("aria-label", audio.muted ? "取消静音" : "静音");
  };
  // Volumes are saved as the slider position (0–1), not the level sent to the browser.
  audio.volume = Math.min(1, Math.max(0, saved.volume ?? 0.25)) * MAX_VOLUME;
  audio.muted = saved.muted ?? false;
  // iOS keeps volume under the hardware buttons (audio.volume is read-only), so only muting is offered there.
  const probe = new Audio();
  probe.volume = 0.5;
  if (probe.volume !== 0.5) volumeBox.classList.add("is-fixed");
  audio.addEventListener("volumechange", () => {
    renderVolume();
    save();
  });
  muteBtn.addEventListener("click", () => {
    // Unmuting from a zero volume would still be silent; bring it back to a sensible level.
    if (audio.muted || audio.volume === 0) {
      if (audio.volume === 0) audio.volume = 0.5 * MAX_VOLUME;
      audio.muted = false;
    } else audio.muted = true;
  });
  volume.addEventListener("input", () => {
    audio.volume = (Number(volume.value) / 100) * MAX_VOLUME;
    audio.muted = audio.volume === 0;
  });
  renderVolume();

  // The player shows pause instead of play; the dock's music button sends out rings.
  const setPlaying = (on: boolean) => {
    panel.classList.toggle("is-playing", on);
    musicBtn.classList.toggle("is-playing", on);
  };
  const play = () => audio.play().catch(() => setPlaying(false));
  const prev = () => {
    // Like most players: restart the track unless we're at its very beginning.
    if (audio.currentTime > 3) audio.currentTime = 0;
    else load(current - 1);
    play();
  };
  const next = () => {
    load(current + 1);
    play();
  };

  audio.addEventListener("loadedmetadata", () => {
    if (pendingTime && pendingTime < audio.duration) audio.currentTime = pendingTime;
    pendingTime = 0;
    seek.disabled = false;
    render();
  });
  audio.addEventListener("play", () => {
    setPlaying(true);
    save();
  });
  audio.addEventListener("pause", () => {
    setPlaying(false);
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
  q<HTMLButtonElement>("[data-prev]").addEventListener("click", prev);
  q<HTMLButtonElement>("[data-next]").addEventListener("click", next);
  // Headphone buttons, media keys and the lock screen.
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", play);
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    if (tracks.length > 1) {
      navigator.mediaSession.setActionHandler("previoustrack", prev);
      navigator.mediaSession.setActionHandler("nexttrack", next);
    }
  }

  seek.addEventListener("input", () => {
    seeking = true;
    seek.style.setProperty("--progress", `${Number(seek.value) / 10}%`);
    if (Number.isFinite(audio.duration)) elapsedEl.textContent = fmtTime((Number(seek.value) / 1000) * audio.duration);
  });
  seek.addEventListener("change", () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
    seeking = false;
    save();
  });

  window.addEventListener("pagehide", save);

  load(Math.min(Math.max(0, saved.track ?? 0), tracks.length - 1), saved.time ?? 0);
  // Autoplay on a first visit (nothing saved yet), and resume where the reader left off after that.
  // Browsers usually refuse sound before the reader has interacted with the page, so if the
  // attempt is blocked, start on their first click, tap or key press instead.
  if (savedRaw === null || saved.playing) {
    audio.play().catch(() => {
      setPlaying(false);
      const events = ["pointerup", "touchend", "keydown"] as const;
      const start = (e: Event) => {
        events.forEach((type) => document.removeEventListener(type, start, true));
        // The player's own buttons (and the Escape key) decide for themselves.
        if (panel.contains(e.target as Node) || (e as KeyboardEvent).key === "Escape") return;
        if (audio.paused) play();
      };
      events.forEach((type) => document.addEventListener(type, start, true));
    });
  }
}
