# Mandapp

Personlig app för att lära sig kinesiska (HSK 4–5).

- **`index.html`** är appen, med fyra flikar: **Skugga** (startsida: dagens pass, skuggspelaren, Lyssna först (hörförståelse på längre native-meningar: lyssna utan text, välj hur mycket du uppfattade, läs sedan), tonpar, hörträning, bibliotek, uttal), **Ämne** (Idag ska jag och Läs en text i ett flöde, där varje ord, fras och replik kan genereras om med ↻), **Repetera** (ordkort med FSRS) och **Ord** (ordbank, lägg till med text eller foto, utveckling). Data ligger lokalt i webbläsaren (IndexedDB). Claude-funktionerna anropar Anthropic API direkt från webbläsaren med en egen API-nyckel som läggs in under Inställningar och bara sparas i webbläsaren (localStorage). Utan nyckel fungerar allt utom Claude-funktionerna.
- **`skugga.js`** är skuggningsdelen (inspelning mot native-ljud, tonkurvor (ingen automatisk bedömning av uttalet), loop-läge, dagens pass med meningsrepetition, tonpar, meningsbank och hörträning). Den laddas av `index.html`. `skugga.html` leder bara vidare gamla länkar till `index.html`.
- `artifact/` är den äldre versionen som körs som Claude-artifact (lämnas orörd; exportera ord därifrån och importera i `index.html`).
- `plan.html` är planen.

`analysis.js` delas mellan studion och huvudappen.
