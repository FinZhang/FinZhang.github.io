import type { APIRoute, GetStaticPaths } from "astro";
import sharp from "sharp";
import { getMusic, type Cover } from "../../lib/music";

// Cover art pulled out of the tracks in public/music, scaled down for the mini player.

export const getStaticPaths: GetStaticPaths = async () => {
  const { covers } = await getMusic();
  return covers.map((cover) => ({ params: { id: cover.id }, props: { cover } }));
};

export const GET: APIRoute = async ({ props }) => {
  const { cover } = props as { cover: Cover };
  const body = await sharp(cover.data).resize(192, 192, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
  return new Response(new Uint8Array(body), { headers: { "Content-Type": "image/webp" } });
};
