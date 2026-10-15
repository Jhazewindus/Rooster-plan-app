# RoosterPlan — productnotities

RoosterPlan is een offline Android-tabletapp voor personeelsplanning in een dierenopvang. De app bewaart medewerkers, afwezigheden, pauzeregels en roosters op de tablet. Er is geen account of server.

## Planning

Een rooster loopt van maandag tot en met zondag. De generator gebruikt de ingestelde werkdagen en tijden van actieve medewerkers. Je kunt een week of 1, 6 of 12 maanden vooruit plannen. Opnieuw genereren verwerkt de actuele teambezetting, afwezigheid en handmatige diensten, maar laat alle dagen vóór vandaag ongemoeid. Oude weken kun je alleen bewust handmatig corrigeren.

Een stagiair staat alleen binnen de stageperiode op het rooster en normaal alleen wanneer tijdens de hele dienst ook een gewone medewerker werkt. Een handmatig ingevoerde betaalde dienst is de uitzondering: die telt mee voor de bezetting, mag zelfstandig worden gewerkt en blijft als betaalde dienst herkenbaar in het rooster en Excel-bestand. Een periodieke medewerker heeft eveneens een begin- en einddatum, maar mag zelfstandig werken. Afwezigheid maakt het overlappende deel van een dienst open. De planner kan een vervanger voor een hele of gedeeltelijke open dienst kiezen; overlappende diensten en afwezigheid worden uitgesloten.

Een bewuste wijziging in afwezigheid bouwt de betrokken weken opnieuw op, ook als het om een correctie in het verleden gaat. Het verwijderen van een medewerker archiveert diegene voor oude roosters en haalt de persoon uit toekomstige planning; toekomstige afwezigheden verdwijnen. Handmatig toegevoegde diensten kun je per dag wijzigen of verwijderen.

Pauzeregels kunnen voor de dag of avond gelden. Alleen de minuten die daadwerkelijk binnen een dienst vallen, verminderen de getelde werkuren. Overlappende pauzes tellen niet dubbel.

Iedere dag vraagt dekking van 07:00 tot 19:30 met minstens vijf gelijktijdig ingeplande medewerkers. Gewone stage telt niet mee; betaalde stage-diensten wel. De weekweergave en gedeelde afbeeldingen markeren de intervallen waar dit niet lukt.

Een tik op een tijdvak met te weinig dekking toont medewerkers zonder roosterconflict of afwezigheid. De planner stelt ook een vrij deel van het tijdvak voor als niemand de hele periode kan werken. De medewerker en tijden worden in een handmatige dienst vooringevuld; de planner bevestigt die nog zelf. Bij een overlappende open dienst begint de bestaande vervangerstroom. Het startscherm en weekrooster tonen daarnaast netto geplande uren per medewerker, betaalde stage-uren en het verschil met het weekcontract.

## Later: samenwerken met Google

Gewenste richting: een klein aantal planners meldt zich aan met een Google-account en werkt met dezelfde gegevens. Een gedeelde Google-spreadsheet als gegevensbron is mogelijk, maar vraagt OAuth-inrichting, expliciete toegang voor de accounts, offline synchronisatie en bescherming tegen gelijktijdig overschrijven. Voor betrouwbare samenwerking moet eerst het opslag- en conflictmodel worden gekozen; een spreadsheet kan ook dienen als leesbare export terwijl een gesynchroniseerde gegevensdienst de app voedt. Deze versie werkt nog lokaal en heeft geen Google-inlog.

## Delen en installeren

Een week en maand kunnen als PNG worden gedeeld. Een jaar gaat naar een Excel-werkmap met maandtotalen en een rij per ingeplande of open dienst. Dagen zonder gegenereerd rooster worden in de maandafbeelding aangeduid. Exports bevatten alleen roosters die al op de tablet staan.

De ondertekende APK staat op de `main`-branch; de downloadlink staat in de [README](../README.md). Houd voor nieuwe versies dezelfde privésleutel aan, zodat Android de app kan bijwerken zonder de lokale gegevens te wissen.
