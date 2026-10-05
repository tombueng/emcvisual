# Working title and renaming

The current name is a **working title (codename)**. It should be replaceable later with little effort
and without data loss. This document describes how that is ensured
and what has to be done when renaming.

Current codename: `emcvisual`

## 1. Rules that keep renaming cheap

1. **A single source for the name:** `branding.config.json`
   ```json
   { "codename": "…", "displayName": "…", "tagline": "…", "repo": "owner/name",
     "siteUrl": "https://owner.github.io/name/", "storageNamespace": "pcbfield",
     "previousCodenames": [] }
   ```
   Code reads the name only via `src/branding.ts`. The title, meta tags, JSON-LD and the
   static introductory text in `index.html` are filled in at build time by a Vite plugin
   (`tools/vite/seo.ts`) (`%APP_NAME%`, `%SITE_URL%` …); the same plugin generates `robots.txt`,
   `sitemap.xml` and `llms.txt`. Search texts without the name live in
   `seo.config.json`.
2. **The name appears only in these files** (allow list in `scripts/check-codename.mjs`):
   `branding.config.json`, `package.json`, `package-lock.json`, `README.md` (title),
   `docs/RENAMING.md`. CI fails if it shows up anywhere else.
3. **Name-neutral persistent formats:**
   - `localStorage` keys use `storageNamespace` (`pcbfield`), **not** the codename.
     This value is **not** changed when renaming.
   - Scenario files: `"kind": "pcb-field-scenario"`, extension `.scenario.json`.
   - Later volume/measurement files likewise get a neutral `kind`.
4. **No names in identifiers:** no classes, CSS prefixes, event names, worker names
   or paths containing the codename.
5. **The base path for GitHub Pages** comes from `GITHUB_REPOSITORY` at build time, not from a
   fixed string.

## 2. Renaming procedure

### Step 1: in the repo (one commit)
```bash
node scripts/rename.mjs --codename neuername --display "Neuer Name" --tagline "…"
npm install            # updates package-lock.json
npm run check:codename # checks: old name only left in RENAMING.md/previousCodenames
npm run check && npm test && npm run build
```
The script changes `branding.config.json` (the old name moves to `previousCodenames`,
`siteUrl` follows the repo name),
`package.json` (`name`) and the README title, and prints the manual steps below.
(In the examples, `neuername`/"Neuer Name" stand for the new name and `alter-name` for the old one.)

### Step 2: GitHub
```bash
gh repo rename neuername          # in the repo directory
git remote set-url origin https://github.com/<owner>/neuername.git
```
- GitHub redirects repo, clone and release URLs automatically.
- **GitHub Pages does NOT redirect:** `<owner>.github.io/alter-name/` returns 404 afterwards.
  Remedies, depending on the situation: put a custom domain on Pages in good time (then the
  repo name does not matter), or leave a redirect page under the old path in a small
  remnant repo. (Lesson from an earlier renaming.)
- Update the repo description, topics, homepage link and social preview.

### Step 3: locally
- Rename the project folder (`~/alter-name` → `~/neuername`); update editor and session references
  to the folder.

### Step 4: external surfaces (last, all at once)
- Links in posts, videos, forums; domain; packages (if there are npm packages).

## 3. What is preserved for users
- Scenarios saved in the browser (namespace unchanged).
- Scenario files (neutral format).
- Bookmarks of the Pages site **only** with a custom domain or a redirect page (see above).

## 4. Checklist
- [ ] New name decided (availability: GitHub, domain, trademark search)
- [ ] `scripts/rename.mjs` run, CI green
- [ ] Pages strategy implemented (domain or redirect)
- [ ] `gh repo rename` done, remote updated
- [ ] Folder renamed locally
- [ ] External surfaces updated
