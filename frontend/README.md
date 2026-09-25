# Accounting Grade 12 Quiz

Practice quiz for the South African DBE Grade 12 Accounting Paper 1 (CAPS).

170 multiple-choice questions adapted from the November 2022–2025 P1 papers and marking guidelines, bundled directly in the frontend — no backend needed. Fully offline after first load.

## Pages

- **Quiz** — topic + count selector, randomized questions, no feedback until all answered
- **Study** — browse all questions with answers visible
- **Review** — mistakes saved automatically after each quiz
- **Bookmarks** — save questions with the star button
- **Flagged** — flag questionable answers during review
- **Search** — keyword search across questions and explanations
- **Analysis** — per-question accuracy, score trends over time, topic breakdown
- **History** — all past quiz results

## Develop

```bash
npm install
npm run dev
```

## Test

```bash
npm test        # vitest, single run
npm run test:watch
```

## Build for static deploy

```bash
npm run build
```

Output is in `out/` — pure HTML/CSS/JS, serve with any static server.

## Deploy

Push to GitHub, import into Vercel — Vercel auto-detects Next.js. The `output: "export"` config generates a fully static site.
# sc900
