# Carillon Observatory of the Shining Light · 站点

Carillon Observatory 的静态博客站点（Astro 7）。文章写在 `../posts`，站点只负责读取和排版。头像、世界地图、友链图标在 `src/assets/`，要换图替换那里的文件即可。

```bash
npm install
npm run dev      # 本地预览 http://localhost:4321
npm run build    # 构建到 dist/，用于发布前自查；线上发布由 GitHub Actions 完成（见下方「发布新内容」）
```

> 修改了 `src/lib/markdown.mjs` 等渲染插件后，开发服务器可能仍显示旧的渲染结果（Astro 按文章内容缓存渲染）。停掉服务器、删除 `.astro/data-store.json` 再启动即可。

文章始终在 `../posts` 里写。`dev` / `build` 启动时会把它同步进 `src/content/posts`（正文与图片）和 `public/files`（PDF）；`npm run dev` 运行期间还会一直监听 `../posts`，保存、增删文章或图片后浏览器会自动更新。这两个生成目录不要手改。

## 发布新内容

站点部署在 GitHub Pages：仓库 `FinZhang/FinZhang.github.io`，域名 finzhang.space。仓库根目录是 `NewBlog/`（包含 `posts/` 和 `site/`）。推送到 `main` 分支后，GitHub Actions 会自动构建并发布，本地不需要构建。

1. 在 `NewBlog/posts/` 里写好或修改文章，图片和 PDF 放在文章自己的文件夹里。

2. （可选）本地预览：在 `site/` 里运行 `npm run dev`，打开 http://localhost:4321 检查效果。

3. 回到 `NewBlog/` 目录，提交并推送：
   
   ```bash
   git add .
   git commit -m "新文章：xxx"
   git push
   ```

4. 打开 GitHub 仓库的 Actions 标签页，等「Deploy site」出现绿勾（约 2–3 分钟），刷新 finzhang.space 即可看到。

注意事项：

- git 命令在 `NewBlog/` 根目录（`.git` 所在处）执行，不是 `site/`。
- 推送前想确认不会构建失败，可以先在 `site/` 里运行 `npm run build`。
- 部署失败时，在 Actions 里点开失败的那次运行看日志。最常见的原因是 front matter 写错：分类不是四个之一、`url_suffix` 与其他文章重复、`<embed>` 引用的 PDF 不存在——报错会写明是哪篇文章。改好后重新提交推送即可。
- 撤回已发布的某次改动：`git revert <提交号>`，再 `git push`。
- 换一台电脑写作：`git clone https://github.com/FinZhang/FinZhang.github.io.git`，再在 `site/` 里运行一次 `npm install`（需要 Node 22.13 或更高版本）。
- 发布流程定义在 `.github/workflows/deploy.yml`；域名由 `site/public/CNAME` 和仓库 Settings → Pages 决定，DNS 在 Cloudflare。

## 页面

| 路由                                                        | 内容                        |
| --------------------------------------------------------- | ------------------------- |
| `/`                                                       | 首页：分类、最新 5 篇、搜索、作者、世界观、友链 |
| `/category/institute` · `library` · `player` · `archives` | 研究 · 杂学 · 玩家 · 生活         |
| `/archive/`                                               | 时间线，可按分类筛选                |
| `/post/<url_suffix>/`                                     | 文章；带 PDF 的文章使用 PDF 版式     |
| `/search.json`                                            | 搜索索引（标题 + 标签 + 正文）        |

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
- 图片格式随意（jpg / png / webp 等）：同步时宽于 2000px 的图片会等比缩小（上限见 `scripts/sync-posts.mjs` 的 `MAX_IMAGE_WIDTH`），构建时统一转成 WebP；`../posts` 里的原图保持不变。
- 点击正文图片可放大查看：滚轮或双指缩放，拖动平移，双击在适应窗口和放大之间切换，Esc 或点击图片外关闭。
- `$...$` / `$$...$$` 公式由 KaTeX 在构建时渲染，连续的公式合并为一个公式块。
- 写入 `<embed src="xxx.pdf">` 的文章自动成为 PDF 文章，页数和大小在同步时读取（也可在 front matter 里写 `kind: pdf`、`file`、`pages`、`sizeBytes`）。PDF 由站内阅读器（PDF.js）显示：翻页、缩放；页面保持原色，检索和复制文字请用“New window”打开浏览器自带阅读器。

### 跑团记录

用 `trpg` 代码块书写，不再需要手写 HTML 和颜色表：

```md
```trpg
@KP 21:45:32
=====分割线=====
这是一个普通夏日的午后……
每一行是一个段落。

@拉尔夫
（行首真的要写 @ 时，用 \@ 转义）
```

```
- `@名字` 开始一条发言，后面可跟时间（`21:45`、`21:45:32` 或 `2022-01-08 10:36`）。
- 被 `===` 包住的一行会排成带标签的分隔线。
- 身份自动判断：`KP` / `GM` 为主持（金色），`bot` / `骰娘` / `投骰姬` 为骰子（灰色、小字），其余为玩家——发言最多的五位依次使用五种墨色，其他人为旁观者。
- 判断不对时在 front matter 里指定：

```yaml
cast:
  "BB-8": guest       # keeper / dice / player / guest
```

四篇旧的 HTML 跑团记录已由 `scripts/convert-trpg-html.mjs` 一次性转换为上述格式。

## 其他素材

- 背景音乐：把音频放进 `public/music/`（mp3 / m4a / ogg / flac…），按文件名排序成为播放列表。播放器读取文件自带的标题、艺术家、专辑和封面（构建时缩成 192px 的 webp）；没有标签时按文件名显示，`01 - Aubade.mp3` 显示为 “Aubade”，`歌手 - 曲名.mp3` 拆成歌手和曲名。
- 头像、世界地图、友链图标：`src/assets/`；站点文字、分类名称、友链：`src/data/site.ts`。
- 设计令牌：`src/styles/classical.css`（设计系统原样拷贝）；页面样式在 `site.css`，正文样式在 `prose.css`。
