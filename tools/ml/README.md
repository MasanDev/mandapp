# Uttalsanalys med ML (prototyp B)

## Utgångsläge (mätt 2026-11-28 med `node tools/ml/bench_dsp.js tonpar|aishell|stcmds 150`)
Nuvarande analys (`analysis.js`, ingen ML) på appens egna native-inspelningar:
- toner: 70 % på tonparsord, 30 % på AISHELL-3-meningar, 40 % på ST-CMDS (slump 25 %)
- s/sh/x 17–43 %, oaspirerade initialer 48–73 %
Huvudorsak: stavelsegränser i flytande tal hittas inte.

## Plan
1. Kör `python tools/ml/discover.py <modell-id ...>` (kräver nätverk till huggingface.co) för att se kandidaternas vokabulär
   (tecken eller tonmärkt pinyin), storlek och avkodning på native-meningar.
2. Välj liten CTC-modell. Mål: tvångsjustering (forced alignment) av den kända meningen -> stavelsegränser.
   Helst tonmärkt pinyin som utdata (ger även ton per stavelse); teckenmodell räcker för gränser, men dess tonsignal
   påverkas av inbyggd språkmodell.
3. Mät: tonträff med nuvarande tonhöjdsklassning inom modellens gränser, samt modellens egen tonsignal. Mål > 90 % på native.
4. Exportera till ONNX int8, kontrollera storlek (helst < 100 MB, annars dela i bitar under 100 MB för GitHub Pages),
   kör med onnxruntime-web i webbläsaren, CTC-justering i JS.
5. Koppla in i `skugga.js`: gränser från modellen, tonkurvor från `analysis.js`.
