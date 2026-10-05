# Contributing

## Rules
- **Documentation in the same commit.** Whoever changes behaviour, formulas, operation or file
  formats updates the README, `docs/stage-1/PHYSICS.md` or `ARCHITECTURE.md`, the user guide
  (`docs/USER-GUIDE.md`), the rule list (`docs/RULES.md`) and the status in
  `docs/stage-1/PLAN.md` in the same commit.
- **Tests for every function.** Physics against analytic solutions, the KiCad parser against
  pcbnew reference data (`tools/demo-board/export_reference.py`), the importers of other CAD
  formats against KiCad's own exports (`tests/import.test.ts`), every layout rule on a generated
  board with the mistake and its fixed twin (`tools/emc-cases`), the interface with smoke tests.
- **No project name in the code.** The name only through `src/branding.ts`;
  `npm run check:codename` runs in CI.
- **Decisions** with date and reason in `docs/DECISIONS.md`.
- Code, identifiers and documentation in English; interface texts only through `src/i18n/`
  (German and English).

## Before committing
```bash
npm run check:codename && npm run check && npm test && npm run build
```
