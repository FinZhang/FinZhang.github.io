import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseFile } from "music-metadata";

// Background music: every audio file in public/music, in file-name order.
// Title, artist, album and cover come from the file's own tags; without tags,
// "01 - Aubade.mp3" is listed as "Aubade" and "Artist - Title.mp3" is split in two.

export interface Track {
  title: string;
  artist: string;
  album: string;
  src: string;
  /** URL of the resized cover served by src/pages/music-covers, if the file has one. */
  cover: string;
}

export interface Cover {
  id: string;
  data: Uint8Array;
}

const musicDir = path.resolve("public/music");

let cache: { key: string; result: Promise<{ tracks: Track[]; covers: Cover[] }> } | undefined;

const listFiles = () =>
  fs.existsSync(musicDir)
    ? fs
        .readdirSync(musicDir)
        .filter((f) => /\.(mp3|m4a|aac|ogg|oga|opus|flac|wav)$/i.test(f))
        .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
    : [];

async function read(files: string[]) {
  const tracks: Track[] = [];
  const covers = new Map<string, Cover>();
  for (const f of files) {
    const name = f.replace(/\.[^.]+$/, "").replace(/^\d+\s*[-._、]\s*/, "");
    const [fileArtist, fileTitle] = name.includes(" - ") ? name.split(/ - (.*)/s, 2) : ["", name];
    const tags = await parseFile(path.join(musicDir, f), { duration: false, skipPostHeaders: true })
      .then((m) => m.common)
      .catch(() => undefined);

    // Prefer the front cover, but take whatever picture the file carries.
    const pic = tags?.picture?.find((p) => p.type === "Cover (front)") ?? tags?.picture?.[0];
    let cover = "";
    if (pic) {
      // Content-addressed, so replacing a file never shows a stale cached cover.
      const id = crypto.createHash("sha1").update(pic.data).digest("hex").slice(0, 12);
      covers.set(id, { id, data: pic.data });
      cover = `/music-covers/${id}.webp`;
    }

    tracks.push({
      title: tags?.title?.trim() || fileTitle,
      artist: tags?.artist?.trim() || tags?.albumartist?.trim() || fileArtist,
      album: tags?.album?.trim() ?? "",
      src: `/music/${encodeURIComponent(f)}`,
      cover,
    });
  }
  return { tracks, covers: [...covers.values()] };
}

// Parsing tags is slow, so reuse the result until a file is added, removed or replaced.
// (`astro dev` keeps this module loaded, so a plain one-time cache would go stale.)
export function getMusic() {
  const files = listFiles();
  const key = files
    .map((f) => {
      const stat = fs.statSync(path.join(musicDir, f));
      return `${f}:${stat.size}:${stat.mtimeMs}`;
    })
    .join("|");
  if (cache?.key !== key) cache = { key, result: read(files) };
  return cache.result;
}
