# Mandapp

Personlig app för att lära sig kinesiska (HSK 4–5).

- **`index.html`** är huvudappen: ordbank, FSRS-repetition, foto, exempelmeningar, Idag, läsläge och statistik. Data ligger lokalt i webbläsaren (IndexedDB). Claude-funktionerna anropar Anthropic API direkt från webbläsaren med en egen API-nyckel som läggs in under Inställningar och bara sparas i webbläsaren (localStorage). Utan nyckel fungerar allt utom Claude-funktionerna.
- **`skugga.html`** är skuggningsstudion: inspelning mot native-ljud, tonkurvor, kontinuerligt läge, tonpar, meningsbank och hörträning. Gamla länkar som `#ova?q=…` på roten leds vidare hit.
- `artifact/` är den äldre versionen som körs som Claude-artifact (lämnas orörd; exportera ord därifrån och importera i `index.html`).
- `plan.html` är planen.

`analysis.js` delas mellan studion och huvudappen.
