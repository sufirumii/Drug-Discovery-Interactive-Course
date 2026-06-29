# Drug Discovery Interactive Course

A production-ready, single-file e-learning platform built for the Excelra Life Sciences Learning Repository. The course teaches drug discovery to learners with no prior domain knowledge, covering all 12 mandatory modules defined in the Excelra Fresher Edition specification.

---

## Overview

This is a self-contained HTML application with no build step, no server requirement, and no external dependencies beyond Google Fonts and the browser's built-in Web Speech API. The entire course — content, logic, games, quizzes, certificate generation, and gamification — ships in a single `index.html` file deployable to any static host.

**Target audience:** New joiners and fresher-batch employees at life sciences data and AI companies with little or no prior knowledge of pharmaceutical drug discovery.

**Estimated duration:** 40–45 minutes of guided narration across all modules.

---

## Modules

| No. | Title |
|-----|-------|
| 1 | Introduction |
| 2 | Business Overview |
| 3 | End-to-End Process |
| 4 | Key Terminologies |
| 5 | Stakeholders |
| 6 | Data Landscape |
| 7 | Industry Standards |
| 8 | Technology Ecosystem |
| 9 | Current Industry Challenges |
| 10 | Role of Data Engineering and AI |
| 11 | Summary |
| 12 | References |

---

## Features

### Learning

- AI-narrated video player using the Web Speech API with automatic voice selection (prefers Google UK English Male, Microsoft Natural voices, and macOS system voices in priority order)
- PPT-style slide presentation that advances in sync with narration — each slide group displays 3–4 sentences with the active sentence highlighted and spoken words revealed word-by-word
- Animated SVG avatar with interval-based lip sync that mirrors speech timing
- Lessons are marked complete only when narration finishes naturally from start to end — navigating away does not award credit

### Gamification

- 12 distinct interactive games, one per module, across 8 different game mechanics: click-order sequencing, true/false rapid fire, categorisation, flashcards, role-reveal cards, pair matching, scenario challenge, and a 60-second knowledge sprint
- Module quizzes with A/B/C/D option badges, streak detection, speed bonuses, and animated correct/incorrect feedback
- XP system, level progression, badge tracking, and confetti/toast notifications
- Completion certificate generated client-side, printable to PDF, gated behind 80% course completion

### Technical

- Zero dependencies: pure HTML, CSS, and vanilla JavaScript
- All progress persisted to `localStorage` keyed by username — a new login clears the previous user's data
- Chrome speech synthesis keep-alive: a 10-second interval detects and recovers from Chrome's known silent-pause bug
- Draggable progress bar with mouse and touch support and a visible thumb indicator
- Fully responsive layout

---

## Usage

Open `index.html` directly in any modern browser, or deploy to any static file host (GitHub Pages, Netlify, Render, etc.).

No installation, no npm, no build process required.

```
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

For GitHub Pages deployment, push to a repository, go to Settings > Pages, and set the source branch to `main`. The course will be live at `https://<username>.github.io/<repo>`.

---

## Browser Compatibility

| Browser | Narration | Games | Certificate |
|---------|-----------|-------|-------------|
| Chrome / Edge (latest) | Full | Full | Full |
| Firefox (latest) | Full | Full | Full |
| Safari (macOS 14+) | Full | Full | Full |
| Mobile Chrome / Safari | Full | Full | Full |

The Web Speech API is required for narration. All modern browsers support it. The course is fully usable without audio — all slide text is visible on screen at all times.

---

## Content Scope

The course teaches drug discovery as a scientific and business domain. Excelra products (GOSTAR, GOBIOM) are referenced as contextual examples in two modules; the remaining content is domain-general and applicable to any life sciences organisation.

Key topics covered include target identification and validation, high-throughput screening, ADMET, lead optimisation, preclinical studies, IND filing, GLP and GxP standards, CDISC, MedDRA, 21 CFR Part 11, FAIR data principles, ELN/LIMS/CTMS technology ecosystems, AI in drug discovery (AlphaFold, generative molecular design, agentic AI), and cloud data engineering for pharma.

---

## Academic References

The course content is grounded in the following sources:

- DiMasi, J.A. et al. (2016). Innovation in the pharmaceutical industry: New estimates of R&D costs. *Journal of Health Economics*, 47, 20–33.
- Swinney, D.C. & Anthony, J. (2011). How were new medicines discovered? *Nature Reviews Drug Discovery*, 10, 507–519.
- Jumper, J. et al. (2021). Highly accurate protein structure prediction with AlphaFold. *Nature*, 596, 583–589.
- FDA 21 CFR Part 11 — Electronic Records and Signatures. ecfr.gov
- ICH Guidelines. ich.org
- FAIR Data Principles. go-fair.org
- ChEMBL Database. ebi.ac.uk/chembl

---

## Author

Rumi Sufi  
Graduate Trainee, COO Office — Excelra Knowledge Solutions  
[github.com/sufirumii](https://github.com/sufirumii) · [huggingface.co/Rumiii](https://huggingface.co/Rumiii)

---

## Licence

This project was created as part of the Excelra Life Sciences Learning Repository — Fresher Edition (2026) and is intended for internal organisational use.
