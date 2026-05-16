import fs from "fs";
import fetch from "node-fetch";
import { sanitizeHtml } from "./sanitize.js";

const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));

const VALID_STYLES = new Set([
  "apa", "modern-language-association", "chicago-author-date",
  "chicago-note-bibliography", "ieee", "vancouver", "nature",
  "harvard1", "american-medical-association", "council-of-science-editors"
]);
const VALID_GROUPS = new Set(["type", "year", "author", "none"]);
const VALID_LIBS = new Set(["users", "groups"]);

const style = VALID_STYLES.has(config.citationStyle) ? config.citationStyle : "apa";
const libraryType = VALID_LIBS.has(config.libraryType) ? config.libraryType : "users";
const groupBy = VALID_GROUPS.has(config.groupBy) ? config.groupBy : "type";
const userId = String(config.zoteroUserId).replace(/[^0-9]/g, "");
const limit = Math.min(Math.max(parseInt(config.limit) || 200, 1), 500);
const collectionSegment = config.collectionKey && /^[A-Z0-9]+$/i.test(config.collectionKey)
  ? `/collections/${config.collectionKey}` : "";
const itemsSegment = config.publicationsEndpoint && libraryType === "users"
  ? "/publications/items" : `${collectionSegment}/items`;

const url = `https://api.zotero.org/${libraryType}/${userId}${itemsSegment}?format=json&include=bib,data&style=${style}&limit=${limit}`;

const indexPath = "./index.html";
const embedPath = "./embed.html";

const fetchWithRetry = async (u, { attempts = 3, delayMs = 1000 } = {}) => {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(u);
      const body = await r.text();
      if (r.ok) return body;
      if (r.status >= 500 && i < attempts) {
        await new Promise(res => setTimeout(res, delayMs * i));
        continue;
      }
      throw new Error(`Zotero API error (${r.status})`);
    } catch (e) {
      lastErr = e;
      if (i < attempts) {
        await new Promise(res => setTimeout(res, delayMs * i));
        continue;
      }
    }
  }
  throw new Error(`Zotero API failed: ${lastErr?.message || "unknown"}`);
};

const payload = await fetchWithRetry(url);
let items;
try { items = JSON.parse(payload); }
catch { throw new Error("Unexpected Zotero API response (JSON parse failed)."); }

const doiRegex = /(?<!doi\.org\/)\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/gi;
const urlRegex = /(?<!href=")(https?:\/\/[^\s<"']+)/gi;
const hrefRegex = /href="(https?:\/\/[^"]+)"/i;
const extractYear = s => (s?.match(/\b(19|20)\d{2}\b/) ? +s.match(/\b(19|20)\d{2}\b/)[0] : 0);

function normalizeBibDate(bib, rawDate) {
  const year = extractYear(rawDate) || extractYear(bib);
  if (!year) return bib;
  return bib.replace(/\([^()]*\b(?:19|20)\d{2}\b[^()]*\)/, `(${year})`);
}
function linkify(t) {
  return t
    .replace(doiRegex, (_, p1) => `<a href="https://doi.org/${p1}" target="_blank" rel="noopener noreferrer">${p1}</a>`)
    .replace(urlRegex, (_, p1) => `<a href="${p1}" target="_blank" rel="noopener noreferrer">${p1}</a>`);
}
function stripInlineUrls(bib) {
  return bib.replace(/\s*<a\b[^>]*>\s*https?:\/\/[^<]+<\/a>\s*/gi, " ").replace(/\s{2,}/g, " ").trim();
}
function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function typeLabel(t) {
  const webinarText = [t.data.title, t.data.event, t.data.genre, t.bib].filter(Boolean).join(" ");
  if (/\bwebinar\b/i.test(webinarText)) return "Webinars";
  const map = {
    journalArticle: "Journal Articles", presentation: "Presentations",
    conferencePaper: "Presentations", thesis: "Thesis", book: "Books",
    bookSection: "Book Chapters", preprint: "Preprints", report: "Reports",
    magazineArticle: "Magazine Articles", newspaperArticle: "News",
    blogPost: "Blog Posts", webpage: "Web", manuscript: "Manuscripts",
    patent: "Patents", dataset: "Datasets", computerProgram: "Software"
  };
  if (/referee report/i.test(t.data.title || "")) return "Peer Reviews";
  return map[t.data.itemType] || "Other";
}
function firstAuthor(it) {
  const c = (it.data.creators || []).find(x => x.lastName) || {};
  return c.lastName || "Unknown";
}

const entries = [];
for (const it of items) {
  if (it.data.itemType === "attachment" || it.data.itemType === "note") continue;
  const type = typeLabel(it);
  const normalizedBib = normalizeBibDate(it.bib, it.data.date);
  const linkedBib = linkify(normalizedBib);
  const safeBib = sanitizeHtml(linkedBib);
  entries.push({
    type,
    year: extractYear(it.data.date),
    author: firstAuthor(it),
    title: escapeHtml(it.data.title || ""),
    bib: type === "Presentations" ? stripInlineUrls(safeBib) : safeBib,
    abs: escapeHtml(it.data.abstractNote),
    link: safeBib.match(hrefRegex)?.[1] || "",
    isWebinar: type === "Webinars"
  });
}

const sortKey = (config.sortBy || "-year").trim();
const desc = sortKey.startsWith("-");
const field = sortKey.replace(/^-/, "") || "year";
function cmp(a, b) {
  const va = a[field] ?? "", vb = b[field] ?? "";
  if (typeof va === "number" && typeof vb === "number") return desc ? vb - va : va - vb;
  return desc ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
}

let groupedHtml;
if (groupBy === "none") {
  entries.sort(cmp);
  groupedHtml = renderEntries(entries);
} else {
  const groups = {};
  for (const e of entries) {
    const key = groupBy === "type" ? e.type
              : groupBy === "year" ? (e.year || "Undated")
              : groupBy === "author" ? e.author : "All";
    (groups[key] ??= []).push(e);
  }
  let keys = Object.keys(groups);
  if (groupBy === "type" && Array.isArray(config.typeOrder)) {
    const order = config.typeOrder;
    keys.sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
    });
  } else if (groupBy === "year") {
    keys.sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));
  } else {
    keys.sort();
  }
  groupedHtml = keys.map(k =>
    `<h2 class="type-heading">${escapeHtml(String(k))}</h2>` +
    renderEntries(groups[k].sort(cmp))
  ).join("");
}

function renderEntries(list) {
  return list.map(e => {
    const linkBtnText = e.isWebinar ? "Watch Now" : "View Online";
    const linkBtnLabel = e.isWebinar ? "Watch webinar" : "View Online";
    const linkBtnClass = e.isWebinar ? "entry-link-btn webinar-link-btn" : "entry-link-btn";
    const linkBtn = e.link ? `<a class="${linkBtnClass}" href="${e.link}" target="_blank" rel="noopener noreferrer" aria-label="${linkBtnLabel}: ${e.title}">${linkBtnText}</a>` : "";
    const copyBtn = config.showCopyButton ? `<button class="copy-btn" title="Copy citation" aria-live="polite"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy</button>` : "";
    const details = (config.showAbstracts && e.abs) ? `<details><summary>Summary</summary><p>${e.abs}</p></details>` : "";
    const actions = `<div class="entry-actions">${linkBtn}${copyBtn}${details}</div>`;
    return `<div class="entry">${e.bib}${actions}</div>`;
  }).join("");
}

let pubs = groupedHtml;
if (config.ownerLastName) {
  const safe = String(config.ownerLastName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${safe}(?:,\\s*[A-Z]\\.?(?:\\s*[A-Z]\\.?)*)?`, "g");
  pubs = pubs.replace(re, m => `<strong>${m}</strong>`);
}

if (fs.existsSync(indexPath)) {
  let indexFile = fs.readFileSync(indexPath, "utf8");
  if (indexFile.includes("<!-- START PUBS -->") && indexFile.includes("<!-- END PUBS -->")) {
    indexFile = indexFile.replace(
      /<!-- START PUBS -->[\s\S]*<!-- END PUBS -->/,
      () => `<!-- START PUBS -->\n${pubs}\n<!-- END PUBS -->`
    );
    fs.writeFileSync(indexPath, indexFile);
    console.log("✅ Updated index.html");
  }
}

writeEmbed(pubs);

function writeEmbed(body) {
  const theme = /^[a-z0-9-]+$/i.test(config.theme || "default") ? config.theme : "default";
  const title = escapeHtml(config.displayName || "Publications");
  const search = config.showSearch ? `<input id="pub-search" type="search" placeholder="Search publications..." aria-label="Search publications" />` : "";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; upgrade-insecure-requests;">
<link rel="stylesheet" href="themes/${theme}.css">
</head>
<body class="pub-embed">
<main class="publications">
${search}
<!-- START PUBS -->
${body}
<!-- END PUBS -->
</main>
<script>
(() => {
  const q = document.getElementById('pub-search');
  if (q) q.addEventListener('input', () => {
    const v = q.value.toLowerCase();
    document.querySelectorAll('.entry').forEach(el => {
      el.style.display = el.textContent.toLowerCase().includes(v) ? '' : 'none';
    });
  });
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = btn.closest('.entry');
      const text = entry ? entry.firstChild.textContent.trim() : '';
      navigator.clipboard && navigator.clipboard.writeText(text);
      const orig = btn.innerHTML; btn.textContent = 'Copied'; setTimeout(() => btn.innerHTML = orig, 1200);
    });
  });
})();
</script>
</body>
</html>`;
  fs.writeFileSync(embedPath, html);
  console.log("✅ Wrote embed.html");
}
