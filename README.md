# Refugee Finder: a research companion for displacement data

A calm, static website for researchers who bring a question about displaced people, such as "Sri Lankan refugees in India", "Rohingya in Bangladesh" or "people displaced by floods in Pakistan". For each situation the site:

1. **explains the situation first:** what happened, why people moved, when and how;
2. **shows a few key numbers,** each with a plain-language "what does this number mean?";
3. **traces every number** to its dataset, release, definition, footnote and original row;
4. **compares sources** when they disagree, and explains why;
5. **is open about limitations:** what the data can't tell you;
6. **lets you collect numbers and references,** then export them as Word, Excel or CSV with APA, Chicago or Harvard citations.

It was built for an Information and Data Visualization course project, based on interviews with Dr. Divya Balan and Prof. Harsh Vasani.

## How it works
- **No backend and no build step.** Plain HTML, CSS and vanilla JavaScript (ES modules). Libraries load from jsDelivr with pinned versions; fonts come from Google Fonts.
- **Numbers only come from the datasets.** Missing values show as "no data", never as zero.
- **Search understands meaning.** The browser compares your question with each situation using a small language model (Transformers.js, `all-MiniLM-L6-v2`). Keyword search (MiniSearch) answers instantly while the model loads.
- **Situation briefs are labelled** on each page with how they were written and whether they have been checked.
- **Your collection stays in your browser** (localStorage).

## Run it locally
ES modules need a web server (opening the files directly won't work):
```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Host it on Vercel
1. In Vercel, choose **Add New → Project** and import this GitHub repository.
2. Framework preset: **Other**. Leave the build command and output directory empty (the site is served from the repository root as it is).
3. Deploy. Every push to `main` redeploys the site.

## Data sources and licences
Full details are in `data/web/sources.json` and on the site's Datasets page.

| # | Dataset | Publisher | Years | Licence | Clean file |
|---|---|---|---|---|---|
| 1 | Refugee Data Finder: population by origin, host and year | UNHCR | 1951–2025 | CC BY 4.0 | `unhcr_population.csv.gz` |
| 2 | Demographics (sex and age) | UNHCR | 2001–2025 | CC BY 4.0 | `unhcr_demographics.csv.gz` |
| 3 | Solutions (returns, resettlement, naturalisation) | UNHCR | 1959–2025 | CC BY 4.0 | `unhcr_solutions.csv` |
| 4 | Asylum applications | UNHCR | 2000–2025 | CC BY 4.0 | `unhcr_asylum_applications.csv` |
| 5 | Asylum decisions | UNHCR | 2000–2025 | CC BY 4.0 | `unhcr_asylum_decisions.csv.gz` |
| 6 | GIDD: internal displacement, conflict and violence | IDMC (via HDX) | 2009–2025 | CC BY 3.0 IGO | `idmc_conflict.csv` |
| 7 | GIDD: internal displacement, disasters, by event and hazard | IDMC (via HDX) | 2008–2025 | CC BY 3.0 IGO | `idmc_disaster.csv` |
| 8 | UCDP/PRIO Armed Conflict Dataset v26.1 | UCDP / PRIO | 1946–2025 | CC BY 4.0 | `ucdp_acd.csv`, `ucdp_acd_conflicts.csv` |
| 9 | UCDP Country-Year Organized Violence v26.1 | UCDP | 1989–2025 | CC BY 4.0 | `ucdp_organized_violence.csv` |
| 10 | Population, total (SP.POP.TOTL) | World Bank | 1960–2025 | CC BY 4.0 | `worldbank_population.csv` |
| 11 | Government figures (typed, with references) | Govt. of India (MEA) | 2016 | official record, cited | `gov_figures.csv` |
| 12 | Countries and regions (ISO3, names, UN M49) | UNHCR, UN Statistics Division, World Bank | – | cited | `countries.csv` |

Footnotes from UNHCR are in `unhcr_footnotes.csv`, and the clean rows point to them by id. Files over 25 MB are gzipped (`.csv.gz`). Every row has a `raw_ref` that points to its original row.

**Citing UCDP:** UCDP asks users to cite Davies, Pettersson & Öberg (2026) and Gleditsch et al. (2002).

**Using IDMC data:** follow IDMC's terms of use:
- credit IDMC as the source (a link back is appreciated);
- say clearly if anything was changed;
- use no IDMC logo and imply no endorsement.

**Not included:** EM-DAT data is deliberately left out, because its terms don't allow redistribution.

## Repository layout
```
*.html           pages (home, situation, country, collection, learn, datasets, request)
css/ js/         styles and ES modules
data/clean/      cleaned CSVs (downloadable)
data/web/        JSON the site loads
data/briefs/     situation briefs
content/         team-written events, readings, definitions, government figures
vercel.json      hosting settings for Vercel
```
