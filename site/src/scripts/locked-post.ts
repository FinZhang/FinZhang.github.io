// Encrypted posts: asks for the password, decrypts the article and puts it in place.
// The cipher is made by scripts/lock-posts.mjs (PBKDF2-SHA256 → AES-256-GCM); keep the two in step.
// A password that worked is remembered for the rest of the browser session.

import { toRoman } from "../lib/roman";

interface Cipher {
  v: number;
  iter: number;
  salt: string;
  iv: string;
  data: string;
}
interface Heading {
  depth: number;
  slug: string;
  text: string;
}

const storageKey = (slug: string) => `carillon:unlock:${slug}`;
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function decrypt(cipher: Cipher, password: string) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: bytes(cipher.salt), iterations: cipher.iter },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(cipher.iv) }, key, bytes(cipher.data));
    return JSON.parse(new TextDecoder().decode(plain)) as { html: string; headings: Heading[] };
  } catch {
    return null;
  }
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The contents block, as src/pages/post/[slug].astro renders it for other posts. */
function tocBlock(headings: Heading[]) {
  const depths = [...new Set(headings.map((h) => h.depth))].sort((a, b) => a - b);
  const chapterDepth = depths.includes(3) ? 3 : depths[0];
  const sectionDepth = depths.includes(4) ? 4 : depths.find((d) => d > chapterDepth);
  let chapterNo = 0;
  const items = headings
    .filter((h) => h.depth === chapterDepth || h.depth === sectionDepth)
    .map((h) =>
      h.depth === chapterDepth
        ? `<a class="toc-item toc-chapter" href="#${escape(h.slug)}"><span class="toc-num">${toRoman(++chapterNo)}</span><span class="toc-chapter-label">${escape(h.text)}</span></a>`
        : `<a class="toc-item toc-section" href="#${escape(h.slug)}"><span></span><span class="toc-section-label">${escape(h.text)}</span></a>`,
    );
  if (!items.length) return null;
  const block = document.createElement("div");
  block.className = "side-block";
  block.innerHTML = `<h3 class="side-title">Contents 目录</h3><nav class="toc" aria-label="目录">${items.join("")}<span class="toc-end"></span></nav>`;
  return block;
}

/** Wires up the password form; `onUnlock` runs once the article is in the page. */
export function mountLock(lock: HTMLElement, onUnlock: () => void) {
  const content = document.querySelector<HTMLElement>("[data-lock-content]");
  const form = lock.querySelector<HTMLFormElement>("[data-lock-form]");
  const input = form?.querySelector<HTMLInputElement>("input");
  const button = form?.querySelector<HTMLButtonElement>("button");
  const error = lock.querySelector<HTMLElement>("[data-lock-error]");
  const raw = lock.querySelector("[data-lock-cipher]")?.textContent;
  if (!content || !form || !input || !button || !error || !raw) return;
  const cipher = JSON.parse(raw) as Cipher;
  const slug = lock.dataset.slug ?? location.pathname;

  const tryOpen = async (password: string) => {
    const post = await decrypt(cipher, password);
    if (!post || !lock.isConnected) return false;
    content.innerHTML = post.html;
    content.hidden = false;
    lock.remove();
    const toc = tocBlock(post.headings);
    if (toc) document.querySelector("[data-aside-source]")?.prepend(toc);
    try {
      sessionStorage.setItem(storageKey(slug), password);
    } catch {
      /* private mode: just ask again next time */
    }
    onUnlock();
    return true;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!input.value) return;
    button.disabled = true;
    error.textContent = "";
    const opened = await tryOpen(input.value);
    if (opened) return;
    button.disabled = false;
    error.textContent = "密码不正确 · Incorrect password";
    input.select();
  });

  // Enter submits, except while it is confirming an input-method candidate (Chinese passwords).
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    form.requestSubmit();
  });

  let remembered: string | null = null;
  try {
    remembered = sessionStorage.getItem(storageKey(slug));
  } catch {
    /* storage unavailable */
  }
  if (remembered) void tryOpen(remembered);
}
