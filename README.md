# Mandapp

Personlig app för att lära sig kinesiska (HSK 4–5).

- **Skuggningsstudion** (roten av repot) är en fristående PWA som körs på GitHub Pages: inspelning, tonkurva live, jämförelse mot förlaga, analys per stavelse (ton, aspiration, s/sh/x) och hörträning. All data ligger lokalt i webbläsaren (IndexedDB). Ingen AI, ingen server.
- **Huvudappen** (`artifact/`) körs som Claude-artifact med ordbank, FSRS-repetition, foto, exempelmeningar, läsläge och statistik. Källan här är en kopia; ordboken `cedict.txt` (CC-CEDICT, 9 MB) ligger bara i artifacten.
- `plan.html` är planen.

`analysis.js` delas mellan studion och huvudappen.
