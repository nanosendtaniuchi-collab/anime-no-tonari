// アフィリエイトサイトの静的ビルド
// 使い方: node build.mjs          … articles/published の記事だけで dist/ を作る（本番用）
//         node build.mjs --drafts … 下書きも含めてプレビュー用に作る
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const ARTICLES = path.join(ROOT, "..", "articles");
const DIST = path.join(ROOT, "dist");
const withDrafts = process.argv.includes("--drafts");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));
const warnings = [];
// GitHub Pages のように https://ユーザー名.github.io/リポジトリ名/ で公開する場合に備え、サイト内リンクの先頭を合わせる
const BASE = new URL(config.siteUrl).pathname.replace(/\/$/, "");
const SITE_ORIGIN = new URL(config.siteUrl).origin;
const url = (p) => BASE + p;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return { data, body: src.slice(m[0].length) };
}

// ASPの広告リンクは URL でも、ASPが発行したHTMLタグ（<a ...>...</a><img ...>）でもよい
function resolveAffiliate(name) {
  const raw = (config.affiliateLinks[name] || "").trim();
  if (!raw) return null;
  if (!raw.startsWith("<")) return { href: raw, pixel: "" };
  const href = raw.match(/href="([^"]+)"/)?.[1];
  const pixel = raw.match(/<img[^>]*>/)?.[0] || "";
  return href ? { href, pixel } : null;
}

function renderAffiliates(body, slug) {
  const button = (name, label) => {
    const link = resolveAffiliate(name);
    if (!link) {
      warnings.push(`${slug}: 「${name}」の広告リンクが未設定のため、ボタンを表示していません`);
      return withDrafts ? `\n<p class="cta cta-missing">［広告リンク未設定：${esc(name)}］</p>\n` : "\n";
    }
    return `\n<p class="cta"><a class="btn" href="${esc(link.href)}" target="_blank" rel="sponsored noopener">${esc(label)}</a>${link.pixel}</p>\n`;
  };
  return body
    .replace(/^\*\*(.+?)\*\*\s*\n\s*\n\[\[AFF:(.+?)\]\]/gm, (_, label, name) => button(name, label))
    .replace(/\[\[AFF:(.+?)\]\]/g, (_, name) => button(name, `${name}の公式サイトを見る`));
}

function layout({ title, description, body, canonical, isArticle = false }) {
  const fullTitle = title === config.siteName ? title : `${title}｜${config.siteName}`;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || config.tagline)}">
<link rel="canonical" href="${esc(SITE_ORIGIN + url(canonical))}">
<meta property="og:type" content="${isArticle ? "article" : "website"}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || config.tagline)}">
<meta property="og:site_name" content="${esc(config.siteName)}">
${withDrafts ? '<meta name="robots" content="noindex">' : ""}
<link rel="stylesheet" href="${url("/assets/style.css")}">
</head>
<body>
<header class="site-header"><div class="wrap">
<a class="logo" href="${url("/")}">${esc(config.siteName)}</a>
<p class="tagline">${esc(config.tagline)}</p>
</div></header>
<main class="wrap">
${body}
</main>
<footer class="site-footer"><div class="wrap">
<nav><a href="${url("/about/")}">運営者情報</a><a href="${url("/privacy/")}">プライバシーポリシー・免責事項</a><a href="${url("/contact/")}">お問い合わせ</a></nav>
<p>&copy; ${new Date().getFullYear()} ${esc(config.siteName)}</p>
</div></footer>
</body>
</html>`;
}

function write(rel, html) {
  const file = path.join(DIST, rel, "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.cpSync(path.join(ROOT, "assets"), path.join(DIST, "assets"), { recursive: true });

// 記事
const dirs = ["published", ...(withDrafts ? ["drafts"] : [])];
const posts = [];
for (const dir of dirs) {
  const full = path.join(ARTICLES, dir);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full).filter((f) => f.endsWith(".md"))) {
    const slug = f.replace(/\.md$/, "");
    const { data, body: raw } = parseFrontmatter(fs.readFileSync(path.join(full, f), "utf8"));
    let body = raw.replace(/<!--[\s\S]*?-->/g, ""); // 運営者向けメモは公開しない
    for (const tag of ["【要確認】", "【要追記"]) {
      const n = body.split(tag).length - 1;
      if (n) warnings.push(`${slug}: ${tag}${tag.endsWith("】") ? "" : "…】"} が ${n} か所残っています`);
    }
    body = renderAffiliates(body, slug);
    let html = marked.parse(body);
    // 列が多い表だけ横スクロールにする
    html = html.replace(/<table>([\s\S]*?)<\/table>/g, (t, inner) => {
      const cols = (inner.match(/<tr>([\s\S]*?)<\/tr>/)?.[1].match(/<th/g) || []).length;
      return `<div class="table-wrap${cols >= 4 ? " wide" : ""}"><table>${inner}</table></div>`;
    });
    html = html.replace(/<p>※本記事はアフィリエイト広告を利用しています。<\/p>/, '<p class="ad-notice">※本記事はアフィリエイト広告を利用しています。</p>');
    const updated = data.updated || "";
    const meta = `<p class="post-meta">${dir === "drafts" ? '<span class="draft">下書き</span>' : ""}更新日：<time datetime="${esc(updated)}">${esc(updated)}</time></p>`;
    html = html.replace(/(<\/h1>)/, `$1\n${meta}`);
    posts.push({ slug, title: data.title || slug, description: data.description || "", updated, draft: dir === "drafts" });
    write(slug, layout({ title: data.title || slug, description: data.description, body: `<article class="post">${html}</article>`, canonical: `/${slug}/`, isArticle: true }));
  }
}
posts.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));

// トップページ
const list = posts.length
  ? posts.map((p) => `<li class="card"><a href="${url(`/${p.slug}/`)}"><h2>${p.draft ? '<span class="draft">下書き</span>' : ""}${esc(p.title)}</h2><p>${esc(p.description)}</p><time>${esc(p.updated)}</time></a></li>`).join("\n")
  : "<p>記事を準備中です。</p>";
write("", layout({ title: config.siteName, description: config.tagline, canonical: "/", body: `<section class="intro"><h1>${esc(config.siteName)}</h1><p>${esc(config.tagline)}。料金・作品数・無料期間を比べて、あなたに合うサービスを探すお手伝いをします。</p></section><h2 class="section-title">新着記事</h2><ul class="cards">${list}</ul>` }));

// 固定ページ（pages/*.md。{{siteName}} などは設定値に置き換え）
for (const f of fs.readdirSync(path.join(ROOT, "pages")).filter((f) => f.endsWith(".md"))) {
  const slug = f.replace(/\.md$/, "");
  const { data, body } = parseFrontmatter(fs.readFileSync(path.join(ROOT, "pages", f), "utf8"));
  const contact = config.contactFormUrl
    ? `[お問い合わせフォーム](${config.contactFormUrl})`
    : config.contactEmail ? `メール：${config.contactEmail}` : "（お問い合わせ先を準備中です）";
  if (!config.contactFormUrl && !config.contactEmail) warnings.push("site.config.json: お問い合わせ先（contactEmail か contactFormUrl）が未設定です");
  const filled = body.replaceAll("{{siteName}}", config.siteName).replaceAll("{{operatorName}}", config.operatorName).replaceAll("{{siteUrl}}", config.siteUrl).replaceAll("{{contact}}", contact);
  write(slug, layout({ title: data.title, description: data.description, canonical: `/${slug}/`, body: `<article class="post page">${marked.parse(filled)}</article>` }));
}

// sitemap / robots
if (!withDrafts) {
  const urls = ["/", ...posts.map((p) => `/${p.slug}/`), "/about/", "/privacy/", "/contact/"];
  fs.writeFileSync(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE_ORIGIN}${url(u)}</loc></url>`).join("\n")}\n</urlset>\n`);
  fs.writeFileSync(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}${url("/sitemap.xml")}\n`);
}
fs.writeFileSync(path.join(DIST, "404.html"), layout({ title: "ページが見つかりません", canonical: "/404", body: '<article class="post"><h1>ページが見つかりません</h1><p><a href="${url("/")}">トップページへ戻る</a></p></article>' }));

console.log(`${posts.length} 記事をビルドしました（${withDrafts ? "下書き込みプレビュー" : "本番"}）→ dist/`);
if (warnings.length) console.log("\n公開前に確認:\n" + [...new Set(warnings)].map((w) => "  - " + w).join("\n"));
