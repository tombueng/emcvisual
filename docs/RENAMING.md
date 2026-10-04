# Arbeitstitel und Umbenennung

Der aktuelle Name ist ein **Arbeitstitel (Codename)**. Er soll sich später mit wenig Aufwand
und ohne Datenverlust ersetzen lassen. Dieses Dokument beschreibt, wie das sichergestellt
wird und was bei der Umbenennung zu tun ist.

Aktueller Codename: `emcvisual`

## 1. Regeln, damit die Umbenennung billig bleibt

1. **Eine Quelle für den Namen:** `branding.config.json`
   ```json
   { "codename": "…", "displayName": "…", "tagline": "…", "repo": "owner/name",
     "siteUrl": "https://owner.github.io/name/", "storageNamespace": "pcbfield",
     "previousCodenames": [] }
   ```
   Code liest den Namen nur über `src/branding.ts`. Titel, Meta-Tags, JSON-LD und der
   statische Einführungstext in `index.html` werden beim Build per Vite-Plugin
   (`tools/vite/seo.ts`) eingesetzt (`%APP_NAME%`, `%SITE_URL%` …); `robots.txt`,
   `sitemap.xml` und `llms.txt` erzeugt dasselbe Plugin. Suchtexte ohne Namen stehen in
   `seo.config.json`.
2. **Der Name steht nur in diesen Dateien** (Erlaubnisliste in `scripts/check-codename.mjs`):
   `branding.config.json`, `package.json`, `package-lock.json`, `README.md` (Titel),
   `docs/RENAMING.md`. Die CI bricht ab, wenn er woanders auftaucht.
3. **Namensneutrale Dauerformate:**
   - `localStorage`-Schlüssel nutzen `storageNamespace` (`pcbfield`), **nicht** den Codenamen.
     Dieser Wert wird bei einer Umbenennung **nicht** geändert.
   - Szenario-Dateien: `"kind": "pcb-field-scenario"`, Endung `.scenario.json`.
   - Spätere Volumen-/Messdateien ebenso mit neutralem `kind`.
4. **Keine Namen in Bezeichnern:** keine Klassen, CSS-Präfixe, Ereignisnamen, Worker-Namen
   oder Pfade mit dem Codenamen.
5. **Basis-Pfad für GitHub Pages** kommt beim Build aus `GITHUB_REPOSITORY`, nicht aus einer
   festen Zeichenkette.

## 2. Ablauf der Umbenennung

### Schritt 1: im Repo (ein Commit)
```bash
node scripts/rename.mjs --codename neuername --display "Neuer Name" --tagline "…"
npm install            # aktualisiert package-lock.json
npm run check:codename # prüft: alter Name nur noch in RENAMING.md/previousCodenames
npm run check && npm test && npm run build
```
Das Skript ändert `branding.config.json` (alter Name wandert nach `previousCodenames`,
`siteUrl` folgt dem Repo-Namen),
`package.json` (`name`), den README-Titel und gibt die manuellen Schritte unten aus.

### Schritt 2: GitHub
```bash
gh repo rename neuername          # im Repo-Verzeichnis
git remote set-url origin https://github.com/<owner>/neuername.git
```
- GitHub leitet Repo-, Clone- und Release-URLs automatisch weiter.
- **GitHub Pages leitet NICHT weiter:** `<owner>.github.io/alter-name/` liefert danach 404.
  Gegenmittel, je nach Lage: rechtzeitig eine eigene Domain auf Pages legen (dann ist der
  Repo-Name egal), oder unter dem alten Pfad eine Weiterleitungsseite in einem kleinen
  Rest-Repo stehen lassen. (Erfahrung aus einer früheren Umbenennung.)
- Repo-Beschreibung, Topics, Homepage-Link, Social-Preview anpassen.

### Schritt 3: lokal
- Projektordner umbenennen (`~/alter-name` → `~/neuername`); Editor- und Sitzungsverweise
  auf den Ordner anpassen.

### Schritt 4: Außenflächen (zuletzt, gebündelt)
- Links in Beiträgen, Videos, Foren; Domain; Pakete (falls es npm-Pakete gibt).

## 3. Was bei Nutzern erhalten bleibt
- Gespeicherte Szenarien im Browser (Namensraum unverändert).
- Szenario-Dateien (neutrales Format).
- Lesezeichen auf die Pages-Seite **nur** mit eigener Domain oder Weiterleitungsseite (s. o.).

## 4. Checkliste
- [ ] Neuer Name entschieden (Verfügbarkeit: GitHub, Domain, Markenrecherche)
- [ ] `scripts/rename.mjs` ausgeführt, CI grün
- [ ] Pages-Strategie umgesetzt (Domain oder Weiterleitung)
- [ ] `gh repo rename`, Remote angepasst
- [ ] Ordner lokal umbenannt
- [ ] Außenflächen angepasst
