# zotero-pubs

A **BibBase alternative** built on GitHub Pages. Fork the repo, point it at your
public Zotero library, push — and you get a free, fast, ad-free bibliography
page you can embed in any website via `<iframe>` or link to directly.

No servers. No JavaScript fetched at runtime. No external dependencies on
page load. A GitHub Action regenerates `embed.html` on a schedule and on
demand.

---

## Quick start

1. **Fork** this repo (or click **Use this template**).
2. Rename your fork to `zotero-pubs` (recommended) or anything else.
3. **Make your Zotero library public** (see below).
4. Edit **`config.json`** with your Zotero user ID and preferences.
5. Enable **GitHub Pages** in repo Settings → Pages → Deploy from branch
   `main` / root.
6. (Optional) Run the workflow once manually: **Actions → Update Zotero
   Publications → Run workflow**.
7. Visit `https://<your-username>.github.io/<repo>/embed.html` and embed it.

---

## Making your Zotero library public

You need either a **publications page** (recommended, no API key needed) or a
**public group library**:

### Option A — My Publications (per-user, easiest)

1. In Zotero desktop, drag the items you want public into the **My
   Publications** collection (Zotero auto-creates it).
2. Zotero will ask you to confirm sharing terms — accept.
3. Visit `https://www.zotero.org/<your-username>/publications` to confirm.
4. Find your numeric **user ID** at
   <https://www.zotero.org/settings/security> → *Applications* → "Your userID
   for use in API calls is: `1234567`".
5. Put that number in `config.json` → `zoteroUserId`.

### Option B — Public group library

1. Create a public group at <https://www.zotero.org/groups/new>.
2. Set **Library Reading: Anyone**.
3. Get the group **ID** from the group settings URL.
4. In `config.json` set `"libraryType": "groups"`, `zoteroUserId` to the
   group ID, and `"publicationsEndpoint": false`.

### Option C — A specific collection in a public library

Set `"collectionKey"` in `config.json` to the collection's short key (8-char
alphanumeric, visible in the Zotero web URL).

---

## Embedding

### Iframe (any site — easiest)

```html
<iframe
  src="https://<your-username>.github.io/zotero-pubs/embed.html"
  style="width:100%;height:800px;border:0;"
  loading="lazy"
  title="Publications"></iframe>
```

### Direct link

Link to `embed.html` (clean, minimal) or `index.html` (your full personal
site, if you customize it).

### Server-side include (Apache SSI)

```html
<!--#include virtual="https://<your-username>.github.io/zotero-pubs/embed.html" -->
```

### PHP include

```php
<?php echo file_get_contents("https://<your-username>.github.io/zotero-pubs/embed.html"); ?>
```

---

## `config.json` options

| Key | Values | Description |
|-----|--------|-------------|
| `zoteroUserId` | string of digits | Your numeric Zotero user ID, or group ID. |
| `libraryType` | `"users"` \| `"groups"` | Which API endpoint to use. |
| `publicationsEndpoint` | `true` \| `false` | If `true` (and `users`), uses `/publications/items` (My Publications). |
| `collectionKey` | `""` or 8-char key | Limit to a specific collection. |
| `citationStyle` | see below | CSL style used to format every entry. |
| `groupBy` | `"type"` \| `"year"` \| `"author"` \| `"none"` | How to group entries on the page. |
| `sortBy` | `"-year"`, `"year"`, `"title"`, `"author"` | Sort order within each group. Prefix `-` for descending. |
| `theme` | one of the files in `themes/` (without `.css`) | Stylesheet applied to `embed.html`. |
| `displayName` | string | `<title>` of the embed page. |
| `ownerLastName` | string | Author surname to bold in every entry. |
| `fullnames` | `true` \| `false` | Reserved; CSL controls name formatting. |
| `limit` | 1 – 500 | Max items pulled from Zotero. |
| `typeOrder` | array of strings | Order of section headings when `groupBy: "type"`. |
| `showSearch` | bool | Adds a live filter box. |
| `showAbstracts` | bool | Renders abstracts inside a `<details>` block. |
| `showCopyButton` | bool | Shows the per-entry citation copy button. |

### Supported citation styles

Any CSL style name accepted by the Zotero API. Common choices:

- `apa` — APA 7th
- `modern-language-association` — MLA 9th
- `chicago-author-date` — Chicago (author-date)
- `chicago-note-bibliography` — Chicago (notes & bibliography)
- `ieee`
- `vancouver`
- `nature`
- `harvard1`
- `american-medical-association`
- `council-of-science-editors`

The script allowlists these by default; add more in `scripts/update-pubs.js`
(`VALID_STYLES`) if you need a niche style.

---

## Themes

Drop-in stylesheets in `themes/`:

| File | Vibe |
|------|------|
| `default.css` | Plain, paper-like default |
| `academic.css` | Serif, classic academic |
| `modern.css` | Sans, accent color, cards |
| `minimal.css` | Whitespace + DM Sans |
| `nature.css` | Earth tones |
| `dark.css` | Dark background |

Switch by setting `"theme"` in `config.json`. Add your own by dropping a new
`.css` file into `themes/` and naming it in `config.json`.

---

## How it works

```
Zotero library  ─►  GitHub Action (cron + manual)  ─►  embed.html  ─►  GitHub Pages  ─►  <iframe>
```

1. `scripts/update-pubs.js` reads `config.json`.
2. It fetches your library from the Zotero Web API with the chosen CSL style.
3. Output is sanitized (`scripts/sanitize.js` — XSS-safe), grouped, sorted,
   linkified, and written into `embed.html` (and `index.html` if you keep it).
4. A scheduled workflow (`.github/workflows/update.yml`) commits the change.

---

## Manual run

```sh
npm install
node scripts/update-pubs.js
```

Open `embed.html` in a browser.

---

## License

MIT
