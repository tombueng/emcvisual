# Mitarbeit

## Regeln
- **Doku im selben Commit.** Wer Verhalten, Formeln, Bedienung oder Dateiformate ändert,
  aktualisiert README, `docs/stufe-1/PHYSIK.md` bzw. `ARCHITEKTUR.md` und den Status in
  `docs/stufe-1/PLAN.md` im selben Commit.
- **Tests für jede Funktion.** Physik gegen analytische Lösungen, Parser gegen
  pcbnew-Referenzdaten (`tools/demo-board/export_reference.py`), Oberfläche per Smoke-Test.
- **Kein Projektname im Code.** Name nur über `src/branding.ts`; `npm run check:codename`
  läuft in der CI.
- **Entscheidungen** mit Datum und Begründung in `docs/ENTSCHEIDUNGEN.md`.
- Code und Bezeichner auf Englisch, Dokumentation auf Deutsch, Oberflächentexte nur über
  `src/i18n/`.

## Vor dem Commit
```bash
npm run check:codename && npm run check && npm test && npm run build
```
