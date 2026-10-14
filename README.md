# RoosterPlan 🐾

Een rustige roosterapp voor een klein team in de dierenopvang. Gemaakt voor een Android-tablet, in liggende stand en volledig offline. Je hebt geen account of server nodig.

**[Download de nieuwste RoosterPlan.apk](https://github.com/Jhazewindus/Rooster-plan-app/raw/refs/heads/main/RoosterPlan.apk)** · [SHA-256-controlesom](https://github.com/Jhazewindus/Rooster-plan-app/raw/refs/heads/main/RoosterPlan.apk.sha256)

Open de APK op je Android-tablet om de app te installeren. Als Android erom vraagt, sta installatie vanuit je browser of bestandsbeheer toe. Android 7.0 of nieuwer is vereist. Updates kun je over de bestaande app installeren; je lokale gegevens blijven behouden zolang je dezelfde app op hetzelfde apparaat bijwerkt.

## Wat je kunt doen

- Medewerkers toevoegen, aanpassen en verwijderen, met vaste werkdagen en contracturen.
- Stagiairs binnen hun stageperiode plannen, alleen samen met een gewone medewerker. Periodieke medewerkers hebben ook een begin- en einddatum, maar mogen zelfstandig werken.
- Roosters per week maken of 1, 6 of 12 maanden vooruit genereren. Na een teamwijziging kun je ze opnieuw genereren.
- Afwezigheid en handmatige diensten toevoegen, aanpassen of verwijderen. Betrokken weken worden hersteld wanneer afwezigheid verandert.
- Dag- en avondpauzes instellen. Alleen overlappende pauzetijd wordt van de getelde werkuren afgetrokken.
- Per dag zien waar tussen 07:00 en 19:30 minder dan vijf medewerkers zonder stagiairs tegelijk staan ingepland.
- Een week of maand als afbeelding delen en het jaar als Excel-werkmap exporteren. De jaarwerkmap bevat een maandoverzicht en alle ingeplande en open diensten.

Alle planning staat lokaal op de tablet. De app synchroniseert niet tussen apparaten; bewaar belangrijke exports dus ook buiten de tablet.

## Zelf bouwen

De broncode bevat het Android Gradle-project. Installeer Node.js, Java 17 en Android SDK Platform/Build Tools 36. Maak een eigen privésleutel en zet `ROOSTERPLAN_KEYSTORE_PATH`, `ROOSTERPLAN_KEYSTORE_PASSWORD`, `ROOSTERPLAN_KEY_PASSWORD` en `ROOSTERPLAN_KEY_ALIAS` in je shell. Zet de sleutel nooit in Git.

```sh
npm ci
npm run typecheck
npm run test:core
npm run build:android:local
```

De ondertekende APK komt in `dist/RoosterPlan.apk`. Gebruik voor volgende releases dezelfde sleutel, zodat Android een update over een bestaande installatie kan plaatsen.
