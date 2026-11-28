# Uttalsanalys med ML (prototyp B)

## Utgångsläge (mätt 2026-11-28 med `node tools/ml/bench_dsp.js tonpar|aishell|stcmds 150`)
Nuvarande analys (`analysis.js`, ingen ML) på appens egna native-inspelningar:
- toner: 70 % på tonparsord, 30 % på AISHELL-3-meningar, 40 % på ST-CMDS (slump 25 %)
- s/sh/x 17–43 %, oaspirerade initialer 48–73 %
Huvudorsak: stavelsegränser i flytande tal hittas inte.

## Plan
1. Ladda kandidatmodeller från huggingface.co (kräver miljön "mandapp" med nätverk dit) och kontrollera vokabulär
   (tecken eller tonmärkt pinyin), storlek och avkodning på native-meningar.
2. Välj liten CTC-modell. Mål: tvångsjustering (forced alignment) av den kända meningen -> stavelsegränser.
   Helst tonmärkt pinyin som utdata (ger även ton per stavelse); teckenmodell räcker för gränser, men dess tonsignal
   påverkas av inbyggd språkmodell.
3. Mät: tonträff med nuvarande tonhöjdsklassning inom modellens gränser, samt modellens egen tonsignal. Mål > 90 % på native.
4. Exportera till ONNX int8, kontrollera storlek (helst < 100 MB, annars dela i bitar under 100 MB för GitHub Pages),
   kör med onnxruntime-web i webbläsaren, CTC-justering i JS.
5. Koppla in i `skugga.js`: gränser från modellen, tonkurvor från `analysis.js`.

## Resultat prototyp B (2026-11-28)
Modell: `snu-nia-12/wav2vec2-large-xlsr-53_nia12_phone-pinyin_chinese` (fairseq-checkpoint, konverterad till HF med
`prototyp/convert.py`; utdata = initialer + tonmärkta finaler). Mätt på appens native-inspelningar
(AISHELL-3 528, ST-CMDS 1 081, Tatoeba 83, tonpar 277). Testtalare hålls utanför all träning (20 % av talarna).

| Vad | Resultat |
|---|---|
| Ton, modellens egen tonsignal (24 lager), native | 87–91 % |
| Samma, när tonhöjden konstgjort ändrats till fel ton (WORLD-vokoder) | upptäcker bara 57–62 % av felen: modellen gissar ordets ton |
| Initial inom förväxlingsgrupp (s/sh/x, z/zh/j, aspiration …), native | 97–98 % (s 78 %, n 94 %) |
| Krympt modell: 8 av 24 lager + ny CTC-huvud (destillerad), int8 ONNX | 116 MB, initialer 97,1 %, gränser likvärdiga |
| Tonklassare: bara tonkurva inom modellens gränser | 72–76 % |
| Tonklassare på lager 8, tränad även på konstgjorda tonfel | native 83–90 %; konstgjorda fel upptäcks 89–95 %, rätt ton anges 83–88 % |
| Flagga fel ton bara när P(förväntad ton) < 0,05 | falsklarm 7,6 % av native-stavelser, upptäckt 89 % |
| Webbläsare (Chromium, onnxruntime-web 1.20.1, en tråd) | 3,4 s ljud analyseras på 1,6 s, laddning <1 s från lokal server |

Begränsningar: konstgjorda fel är inte riktiga inlärarfel; initialdomar är inte testade mot fel uttal alls.
Neutral ton, 3+3-kedjor och 一/不 bedöms inte. Etiketter från pypinyin kan ha fel.
Modellfilerna ligger inte i repot (för stora); skripten i `prototyp/` återskapar dem.
