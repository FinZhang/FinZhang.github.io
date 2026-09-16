import maliut from "../assets/fellows/maliut.png";
import buwaili from "../assets/fellows/buwaili.png";
import sisyphus from "../assets/fellows/nettingsisyphus.png";
import prodick from "../assets/fellows/prodick.jpg";

export const SITE = {
  title: "Carillon Observatory of the Shining Light",
  author: "Fin Zhang",
  role: "Keeper of the Observatory",
  est: "Est. MMXIV",
  email: "shininglight441@gmail.com",
  bio: "天体物理博士，已转行。什么都想学一点，但啥都不精；什么都会思考一点，但想法都不成熟。",
  worldbuilding: {
    title: "Eurymare",
    subtitle: "The Complete Writings",
    url: "https://finzhang.space/Nurania/",
  },
};

export type CategoryName = "研究" | "杂学" | "玩家" | "生活";

export interface Category {
  cn: CategoryName;
  en: string;
  /** First word of the house name, used in breadcrumbs. */
  short: string;
  slug: string;
  idx: string;
}

export const CATEGORIES: Category[] = [
  { cn: "研究", en: "Institute of the Modern Magic", short: "Institute", slug: "institute", idx: "I" },
  { cn: "杂学", en: "Library of the Lord El-Melloi II", short: "Library", slug: "library", idx: "II" },
  { cn: "玩家", en: "Player of the Ninth Art", short: "Player", slug: "player", idx: "III" },
  { cn: "生活", en: "Archives of the Examined Life", short: "Archives", slug: "archives", idx: "IV" },
];

export const categoryOf = (cn: string): Category => {
  const c = CATEGORIES.find((c) => c.cn === cn);
  if (!c) throw new Error(`Unknown category: ${cn}`);
  return c;
};

export const FELLOWS = [
  { name: "Mの综合研究", url: "https://maliut.space/", icon: maliut },
  { name: "BUWAILI", url: "https://doubilee.com/", icon: buwaili },
  { name: "Netting Sisyphus", url: "https://nettingsisyphus.tech/", icon: sisyphus },
  { name: "茶杯君的魔术工坊", url: "https://prodick.github.io/", icon: prodick },
];
