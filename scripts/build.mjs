// Builds the website into ./dist from Notion (or from ./sample with --sample).
//   node scripts/build.mjs            -> uses NOTION_TOKEN + NOTION_DATABASE_ID (+ optional NOTION_ABOUT_PAGE_ID)
//   node scripts/build.mjs --sample   -> uses sample/artworks.json and the photos in sample/photos
//   add --preview to also write ./preview (single-page version for a quick online preview)
//
// NOTION_ABOUT_PAGE_ID may point to:
//   - an "Over mij" DATABASE: each row has the text in a property "Over mij-tekst" and optionally a photo in "Foto".
//     A row whose title contains "about", "english" or "(EN)" (or whose "Taal"/"Language" property is EN/Engels)
//     is the English text; any other row is the Dutch text. The photo is taken from the Dutch row (or any row).
//     In the text, every new line becomes a new paragraph.
//   - a single PAGE: its "Over mij-tekst" property is used, or otherwise the text and first image in the page body.
import fs from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIST = path.join(ROOT, "dist");
const CACHE = path.join(ROOT, ".cache", "images");
const args = new Set(process.argv.slice(2));
const SAMPLE = args.has("--sample");
const PREVIEW = args.has("--preview");

const NOTION_VERSION = "2022-06-28";
const env = (k) => (process.env[k] || "").trim();

// Column names Annet may use (Dutch first, English accepted too). Matching ignores case.
const COLS = {
  title: ["Titel", "Title", "Naam", "Name"],
  photo: ["Foto", "Foto's", "Fotos", "Photo", "Photos", "Image", "Afbeelding"],
  technique: ["Techniek", "Soort", "Medium", "Category", "Categorie"],
  size: ["Formaat", "Afmetingen", "Maat", "Dimensions", "Size"],
  year: ["Jaar", "Year"],
  price: ["Prijs", "Price"],
  status: ["Status"],
  story: ["Verhaal", "Beschrijving", "Story_NL", "Story", "Description"],
  title_en: ["Titel (EN)", "Title_EN", "Title (EN)"],
  story_en: ["Verhaal (EN)", "Story_EN", "Story (EN)"],
  hidden: ["Verbergen", "Verborgen", "Hidden", "Hide"],
  featured: ["Uitgelicht", "Featured"],
};

// Columns for the "Over mij" database or page.
const ABOUT_COLS = {
  text: ["Over mij-tekst", "Over mij tekst", "Over mij", "Tekst", "About text", "About", "Text"],
  lang: ["Taal", "Language"],
};

function normStatus(s) {
  const v = String(s || "").toLowerCase().trim();
  if (/verkocht|sold/.test(v)) return "sold";
  if (/gereserveerd|reserved|optie/.test(v)) return "reserved";
  if (/niet te koop|not for sale|priv|eigen collectie|nfs/.test(v)) return "nfs";
  return "available";
}
function normPrice(p) {
  if (p == null || p === "") return null;
  if (typeof p === "number") return p > 0 ? p : null;
  const n = parseFloat(String(p).replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function slugify(s) {
  return String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "werk";
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);

/* ---------------- Notion ---------------- */
async function notion(pathname, body) {
  const token = env("NOTION_TOKEN");
  for (let attempt = 1; ; attempt++) {
    const r = await fetch("https://api.notion.com/v1/" + pathname, {
      method: body ? "POST" : "GET",
      headers: { Authorization: "Bearer " + token, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.ok) return r.json();
    const text = await r.text();
    if ((r.status === 429 || r.status >= 500) && attempt < 5) { await new Promise((res) => setTimeout(res, attempt * 2000)); continue; }
    let hint = "";
    if (r.status === 401) hint = " (the NOTION_TOKEN secret is wrong or was revoked)";
    if (r.status === 404) hint = " (wrong ID, or the database/page is not shared with the integration: in Notion open it, ••• > Connections > add your integration)";
    throw new Error(`Notion ${r.status} on ${pathname}${hint}: ${text.slice(0, 300)}`);
  }
}
function prop(props, names) {
  const keys = Object.keys(props);
  for (const n of names) {
    const k = keys.find((x) => x.trim().toLowerCase() === n.toLowerCase());
    if (k) return props[k];
  }
  return null;
}
function propValue(p) {
  if (!p) return null;
  switch (p.type) {
    case "title": return p.title.map((t) => t.plain_text).join("").trim();
    case "rich_text": return p.rich_text.map((t) => t.plain_text).join("").trim();
    case "select": return p.select?.name ?? null;
    case "status": return p.status?.name ?? null;
    case "multi_select": return p.multi_select.map((x) => x.name).join(", ");
    case "number": return p.number;
    case "checkbox": return p.checkbox;
    case "url": return p.url;
    case "date": return p.date?.start?.slice(0, 4) ?? null;
    case "formula": return p.formula?.[p.formula?.type] ?? null;
    case "files": return p.files.map((f) => (f.type === "file" ? f.file.url : f.external?.url)).filter(Boolean);
    default: return null;
  }
}
async function fromNotion() {
  const db = env("NOTION_DATABASE_ID").replace(/-/g, "").match(/[0-9a-f]{32}/i)?.[0];
  if (!db) throw new Error("NOTION_DATABASE_ID is missing or not a valid ID.");
  const pages = [];
  let cursor;
  do {
    const res = await notion(`databases/${db}/query`, { page_size: 100, start_cursor: cursor, sorts: [{ timestamp: "created_time", direction: "descending" }] });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages.map((pg) => {
    const P = pg.properties, v = (k) => propValue(prop(P, COLS[k]));
    return {
      id: pg.id, title: v("title"), technique: v("technique"), size: v("size"), year: v("year"), price: v("price"),
      status: v("status"), story: v("story"), title_en: v("title_en"), story_en: v("story_en"),
      hidden: v("hidden") === true, featured: v("featured") === true, photos: v("photo") || [],
    };
  });
}

/* ---------------- Over mij ---------------- */
const toParagraphs = (s) => String(s || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
const titleOf = (P) => propValue(Object.values(P).find((p) => p.type === "title")) || "";
function aboutText(P) {
  const keys = Object.keys(P);
  for (const n of ABOUT_COLS.text) {
    const k = keys.find((x) => x.trim().toLowerCase() === n.toLowerCase() && P[x].type === "rich_text");
    if (k) return propValue(P[k]);
  }
  return "";
}
function isEnglish(title, lang) {
  if (lang) return /^(en|eng|engels|english)$/i.test(String(lang).trim());
  return /\b(about|english|engels)\b|\(en\)/i.test(title);
}
async function pageBody(id) {
  const paragraphs = []; let photo = null; let cursor;
  do {
    const res = await notion(`blocks/${id}/children?page_size=100${cursor ? "&start_cursor=" + cursor : ""}`);
    for (const b of res.results) {
      const rt = b[b.type]?.rich_text;
      if (rt && /^(paragraph|heading_\d|quote|callout|bulleted_list_item|numbered_list_item)$/.test(b.type)) {
        const s = rt.map((t) => t.plain_text).join("").trim();
        if (s) paragraphs.push(s);
      }
      if (b.type === "image" && !photo) photo = b.image.type === "file" ? b.image.file.url : b.image.external.url;
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return { paragraphs, photo };
}
async function aboutFromNotion() {
  const id = env("NOTION_ABOUT_PAGE_ID").replace(/-/g, "").match(/[0-9a-f]{32}/i)?.[0];
  if (!id) return null;
  const out = { paragraphs: [], paragraphs_en: [], photo: null };

  // First try it as a database; if that fails, it is a single page.
  let rows = null;
  try {
    rows = (await notion(`databases/${id}/query`, { page_size: 100, sorts: [{ timestamp: "created_time", direction: "ascending" }] })).results;
  } catch (e) {
    if (/Notion 401/.test(e.message)) throw e;
  }

  if (rows) {
    let anyPhoto = null;
    for (const pg of rows) {
      const P = pg.properties;
      const en = isEnglish(titleOf(P), propValue(prop(P, ABOUT_COLS.lang)));
      const text = toParagraphs(aboutText(P));
      const target = en ? out.paragraphs_en : out.paragraphs;
      if (text.length && !target.length) target.push(...text);
      const photos = propValue(prop(P, COLS.photo)) || [];
      if (photos.length) {
        if (!en && !out.photo) out.photo = photos[0];
        if (!anyPhoto) anyPhoto = photos[0];
      }
    }
    if (!out.photo) out.photo = anyPhoto;
  } else {
    const pg = await notion(`pages/${id}`);
    const P = pg.properties || {};
    out.paragraphs = toParagraphs(aboutText(P));
    out.photo = (propValue(prop(P, COLS.photo)) || [])[0] || null;
    if (!out.paragraphs.length || !out.photo) {
      const body = await pageBody(id);
      if (!out.paragraphs.length) out.paragraphs = body.paragraphs;
      if (!out.photo) out.photo = body.photo;
    }
  }
  return out;
}

/* ---------------- Sample ---------------- */
async function fromSample() {
  const rows = JSON.parse(await fs.readFile(path.join(ROOT, "sample", "artworks.json"), "utf8"));
  return rows.map((r) => ({
    id: r.id, title: r.Titel, technique: r.Techniek, size: r.Formaat, year: r.Jaar, price: r.Prijs, status: r.Status,
    story: r.Verhaal, title_en: r["Titel (EN)"], story_en: r["Verhaal (EN)"], hidden: !!r.Verbergen, featured: !!r.Uitgelicht,
    photos: (r.Foto || []).map((p) => path.join(ROOT, p)),
  }));
}

/* ---------------- Images ---------------- */
async function fetchSource(src) {
  // Returns a local file path. Notion file links expire after an hour, so we download them at build time
  // and cache them by their stable part (the URL without the signed query string).
  if (!/^https?:/.test(src)) return src;
  await fs.mkdir(CACHE, { recursive: true });
  const file = path.join(CACHE, sha(src.split("?")[0]) + ".src");
  if (existsSync(file)) return file;
  const r = await fetch(src);
  if (!r.ok) throw new Error(`Could not download image (${r.status}): ${src.split("?")[0]}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(file + ".part"));
  await fs.rename(file + ".part", file);
  return file;
}
async function makeImage(src, base, outDir) {
  const local = await fetchSource(src);
  const img = sharp(local, { failOn: "none" }).rotate();
  const large = await img.clone().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const small = await img.clone().resize({ width: 760, height: 1400, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
  const { dominant } = await sharp(small.data).stats();
  await fs.writeFile(path.join(outDir, base + "-l.webp"), large.data);
  await fs.writeFile(path.join(outDir, base + "-s.webp"), small.data);
  return {
    l: "img/" + base + "-l.webp", s: "img/" + base + "-s.webp",
    w: large.info.width, h: large.info.height, sw: small.info.width,
    color: `rgb(${dominant.r},${dominant.g},${dominant.b})`,
  };
}

/* ---------------- Build ---------------- */
async function main() {
  const config = JSON.parse(await fs.readFile(path.join(ROOT, "site.config.json"), "utf8"));
  delete config._uitleg;
  const useNotion = !SAMPLE;
  if (useNotion && (!env("NOTION_TOKEN") || !env("NOTION_DATABASE_ID"))) {
    throw new Error("NOTION_TOKEN and NOTION_DATABASE_ID are not set. Use --sample to build with example data.");
  }

  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(path.join(DIST, "img"), { recursive: true });

  const rows = useNotion ? await fromNotion() : await fromSample();
  const used = new Set();
  const artworks = [];
  for (const r of rows) {
    if (r.hidden) continue;
    const title = (r.title || "").trim() || "Zonder titel";
    if (!r.photos.length) { console.warn(`! Skipped "${title}": no photo yet.`); continue; }
    let slug = slugify(title); let n = 2; while (used.has(slug)) slug = slugify(title) + "-" + n++; used.add(slug);
    const images = [];
    for (let i = 0; i < r.photos.length && i < 6; i++) {
      try { images.push(await makeImage(r.photos[i], `${slug}-${i + 1}`, path.join(DIST, "img"))); }
      catch (e) { console.warn(`! Photo ${i + 1} of "${title}" could not be read: ${e.message}`); }
    }
    if (!images.length) continue;
    artworks.push({
      slug, title, title_en: r.title_en || "", technique: r.technique || "", size: r.size || "", year: r.year ? String(r.year) : "",
      price: normPrice(r.price), status: normStatus(r.status), story: r.story || "", story_en: r.story_en || "",
      featured: r.featured, images,
    });
    console.log(`✓ ${title}`);
  }

  // About text and photo: Notion if available, otherwise site.config.json.
  let about = { paragraphs: config.about_nl || [], paragraphs_en: config.about_en || [], photo: null };
  let aboutSrc = config.aboutPhoto ? path.join(ROOT, config.aboutPhoto) : null;
  if (useNotion) {
    const a = await aboutFromNotion();
    if (a) {
      if (a.paragraphs.length) about.paragraphs = a.paragraphs;
      // English from Notion; if there is none but the Dutch text came from Notion, show that rather than an outdated English text.
      if (a.paragraphs_en.length) about.paragraphs_en = a.paragraphs_en;
      else if (a.paragraphs.length) about.paragraphs_en = a.paragraphs;
      if (a.photo) aboutSrc = a.photo;
      console.log(`✓ Over mij from Notion (NL: ${a.paragraphs.length} paragraphs, EN: ${a.paragraphs_en.length}, photo: ${a.photo ? "yes" : "no"})`);
    }
  }
  if (aboutSrc && (/^https?:/.test(aboutSrc) || existsSync(aboutSrc))) {
    try {
      const im = await makeImage(aboutSrc, "atelier", path.join(DIST, "img"));
      about.photo = { src: im.l, w: im.w, h: im.h };
    } catch (e) {
      console.warn(`! The Over mij photo could not be read (use a JPG): ${e.message}`);
      const fallback = config.aboutPhoto ? path.join(ROOT, config.aboutPhoto) : null;
      if (fallback && fallback !== aboutSrc && existsSync(fallback)) {
        const im = await makeImage(fallback, "atelier", path.join(DIST, "img"));
        about.photo = { src: im.l, w: im.w, h: im.h };
      }
    }
  }

  const site = {
    artistName: config.artistName, tagline_nl: config.tagline_nl, tagline_en: config.tagline_en,
    intro_nl: config.intro_nl, intro_en: config.intro_en, email: config.email, phone: config.phone,
    location: config.location, instagram: config.instagram, web3formsKey: config.web3formsKey, siteUrl: (config.siteUrl || "").replace(/\/$/, ""),
  };
  const data = { site, about, artworks, built: new Date().toISOString() };

  // Fonts (self-hosted: no visitor data goes to Google)
  await fs.mkdir(path.join(DIST, "fonts"), { recursive: true });
  const F = [
    ["@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2", "fraunces.woff2"],
    ["@fontsource-variable/fraunces/files/fraunces-latin-opsz-italic.woff2", "fraunces-italic.woff2"],
    ["@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2", "atkinson-400.woff2"],
    ["@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2", "atkinson-700.woff2"],
  ];
  for (const [from, to] of F) await fs.copyFile(path.join(ROOT, "node_modules", from), path.join(DIST, "fonts", to));
  await fs.writeFile(path.join(DIST, "fonts", "fonts.css"), `
@font-face{font-family:"Fraunces Variable";font-style:normal;font-display:swap;font-weight:100 900;src:url(fraunces.woff2) format("woff2")}
@font-face{font-family:"Fraunces Variable";font-style:italic;font-display:swap;font-weight:100 900;src:url(fraunces-italic.woff2) format("woff2")}
@font-face{font-family:"Atkinson Hyperlegible";font-style:normal;font-display:swap;font-weight:400;src:url(atkinson-400.woff2) format("woff2")}
@font-face{font-family:"Atkinson Hyperlegible";font-style:normal;font-display:swap;font-weight:700;src:url(atkinson-700.woff2) format("woff2")}
`.trim());
  await fs.copyFile(path.join(ROOT, "src", "style.css"), path.join(DIST, "style.css"));
  await fs.copyFile(path.join(ROOT, "src", "app.js"), path.join(DIST, "app.js"));

  const tpl = await fs.readFile(path.join(ROOT, "src", "index.html"), "utf8");
  const jsonData = (d) => JSON.stringify(d).replace(/</g, "\\u003c");
  const abs = (p) => (site.siteUrl ? site.siteUrl + "/" + p : "");
  const page = ({ title, description, image, url, openSlug, base }) => {
    const head = [
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(description)}">`,
      image ? `<meta property="og:image" content="${esc(image)}">` : "",
      url ? `<link rel="canonical" href="${esc(url)}"><meta property="og:url" content="${esc(url)}">` : "",
      `<meta name="theme-color" content="#ECEDEA">`,
    ].filter(Boolean).join("\n");
    return tpl
      .replace("<!--BASE-->", base ? `<base href="${base}">` : "")
      .replace("{{TITLE}}", esc(title))
      .replace("{{DESCRIPTION}}", esc(description))
      .replace("<!--HEAD-->", head)
      .replace("<!--FONTS-->", `<link rel="preload" href="fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin>\n<link rel="stylesheet" href="fonts/fonts.css">`)
      .replace("/*DATA*/", jsonData(data))
      .replace("<!--OPEN-->", openSlug ? `<script>window.OPEN_SLUG=${JSON.stringify(openSlug)};</script>` : "");
  };
  const first = artworks.find((a) => a.featured) || artworks.find((a) => a.status === "available") || artworks[0];
  await fs.writeFile(path.join(DIST, "index.html"), page({
    title: config.siteTitle || config.artistName, description: config.intro_nl,
    image: first ? abs(first.images[0].l) : "", url: site.siteUrl ? site.siteUrl + "/" : "",
  }));
  // One page per work, so a shared link shows that painting in WhatsApp/Facebook previews.
  for (const a of artworks) {
    const dir = path.join(DIST, "werk", a.slug); await fs.mkdir(dir, { recursive: true });
    const desc = [a.technique, a.size, a.year].filter(Boolean).join(" · ") || config.tagline_nl;
    await fs.writeFile(path.join(dir, "index.html"), page({
      title: `${a.title} — ${config.artistName}`, description: desc, image: abs(a.images[0].l),
      url: abs(`werk/${a.slug}/`), openSlug: a.slug, base: "../../",
    }));
  }
  if (site.siteUrl) {
    const urls = [site.siteUrl + "/", ...artworks.map((a) => abs(`werk/${a.slug}/`))];
    await fs.writeFile(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>\n`);
    await fs.writeFile(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${site.siteUrl}/sitemap.xml\n`);
  }
  await fs.writeFile(path.join(DIST, ".nojekyll"), "");

  if (PREVIEW) await writePreview(tpl, data, config);
  console.log(`\nBuilt ${artworks.length} artworks into dist/`);
}

// Single-file variant for an online preview: inline CSS/JS, Google Fonts, form in demo mode.
async function writePreview(tpl, data, config) {
  const out = path.join(ROOT, "preview");
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
  await fs.cp(path.join(DIST, "img"), path.join(out, "img"), { recursive: true });
  const css = await fs.readFile(path.join(ROOT, "src", "style.css"), "utf8");
  const js = await fs.readFile(path.join(ROOT, "src", "app.js"), "utf8");
  const body = tpl.split("<body>")[1].split("</body>")[0]
    .replace("/*DATA*/", JSON.stringify({ ...data, preview: true }).replace(/</g, "\\u003c"))
    .replace("<!--OPEN-->", "")
    .replace('<script src="app.js"></script>', "<script>\n" + js + "\n</script>");
  const html = `<title>${esc(config.artistName)} Kunstgalerie</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&display=swap">
<style>
${css.replace(/"Fraunces Variable", /g, "")}
</style>
${body}`;
  await fs.writeFile(path.join(out, "index.html"), html);
}

main().catch((e) => { console.error("\nBUILD FAILED: " + e.message); process.exit(1); });
