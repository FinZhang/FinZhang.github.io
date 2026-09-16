# Carillon Observatory of the Shining Light · 站点

按 `../design_handoff_carillon_blog` 的设计实现的静态博客（Astro 7）。文章仍然写在 `../posts`，站点只负责读取和排版。

```bash
npm install
npm run dev      # 本地预览 http://localhost:4321
npm run build    # 输出到 dist/，可直接部署到 GitHub Pages（public/CNAME = finzhang.space）
```

> 修改了 `src/lib/markdown.mjs` 等渲染插件后，开发服务器可能仍显示旧的渲染结果（Astro 按文章内容缓存渲染）。停掉服务器、删除 `.astro/data-store.json` 再启动即可。

文章始终在 `../posts` 里写。`dev` / `build` 启动时会把它同步进 `src/content/posts`（正文与图片）和 `public/files`（PDF）；`npm run dev` 运行期间还会一直监听 `../posts`，保存、增删文章或图片后浏览器会自动更新。这两个生成目录不要手改。

## 页面

| 路由 | 内容 |
| --- | --- |
| `/` | 首页：分类、最新 5 篇、搜索、作者、世界观、友链 |
| `/category/institute` · `library` · `player` · `archives` | 研究 · 杂学 · 玩家 · 生活 |
| `/archive/` | 时间线，可按分类筛选 |
| `/post/<url_suffix>/` | 文章；带 PDF 的文章使用 PDF 版式 |
| `/search.json` | 搜索索引（标题 + 标签 + 正文） |

## 写文章

`../posts/<标题>.md`，或 `../posts/<标题>/index.md` 加同目录的图片 / PDF。

```yaml
---
title: "天体物理笔记 一"
date: 2018-07-25
categories: "研究"        # 研究 / 杂学 / 玩家 / 生活（也可写 category）
tags: ["笔记"]            # 第一个标签显示在标题旁，并决定“Also in”
url_suffix: "astro"       # 文章网址；缺省时为 post-YYYYMMDD
---
```

- 段落之间空一行（标准 Markdown），页面上段落之间也会留出一整行的间距。
- 标题约定：`###` 为大标题（排成 Chapter，带罗马数字和横线），`####` 为次级标题；两级都进入右侧目录，更深的层级只作普通小标题。
- 单独成段的图片排成图版；只有写了图注的图片（`![赤道天球坐标系](1.jpg)`）才显示 `Fig. n — 图注`，`![1](1.jpg)` 这类占位 alt 只显示图片。
- 插图尺寸：在正文里单独写一行 `<!-- image-width: 50% -->`，其后所有插图按正文栏宽的 50% 显示（也可写 `320px`），直到下一条同类指令；写在文章开头即全篇生效，写 `auto` 恢复默认。
- 点击正文图片可放大查看：滚轮或双指缩放，拖动平移，双击在适应窗口和放大之间切换，Esc 或点击图片外关闭。
- `$...$` / `$$...$$` 公式由 KaTeX 在构建时渲染，连续的公式合并为一个公式块。
- 写入 `<embed src="xxx.pdf">` 的文章自动成为 PDF 文章，页数和大小在同步时读取（也可在 front matter 里写 `kind: pdf`、`file`、`pages`、`sizeBytes`）。PDF 由站内阅读器（PDF.js）显示：翻页、缩放；页面保持原色，检索和复制文字请用“New window”打开浏览器自带阅读器。

### 跑团记录

用 `trpg` 代码块书写，不再需要手写 HTML 和颜色表：

````md
```trpg
@KP 21:45:32
=====分割线=====
这是一个普通夏日的午后……
每一行是一个段落。

@拉尔夫
（行首真的要写 @ 时，用 \@ 转义）
```
````

- `@名字` 开始一条发言，后面可跟时间（`21:45`、`21:45:32` 或 `2022-01-08 10:36`）。
- 被 `===` 包住的一行会排成带标签的分隔线。
- 身份自动判断：`KP` / `GM` 为主持（金色），`bot` / `骰娘` / `投骰姬` 为骰子（灰色、小字），其余为玩家——发言最多的五位依次使用五种墨色，其他人为旁观者。
- 判断不对时在 front matter 里指定：

```yaml
cast:
  "BB-8": guest       # keeper / dice / player / guest
```

四篇旧的 HTML 跑团记录已由 `scripts/convert-trpg-html.mjs` 转换，原文备份在 `../posts-html-backup`。

## 其他素材

- 背景音乐：把音频放进 `public/music/`（mp3 / m4a / ogg / flac…），按文件名排序成为播放列表，`01 - Aubade.mp3` 显示为 “Aubade”。
- 头像、世界地图、友链图标：`src/assets/`；站点文字、分类说明、友链：`src/data/site.ts`。
- 设计令牌：`src/styles/classical.css`（设计系统原样拷贝）；页面样式在 `site.css`，正文样式在 `prose.css`。
