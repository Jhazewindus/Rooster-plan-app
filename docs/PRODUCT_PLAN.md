# RoosterPlan — productnotities

RoosterPlan is een offline Android-tabletapp voor personeelsplanning in een dierenopvang. De app bewaart medewerkers, afwezigheden, pauzeregels en roosters op de tablet. Er is geen account of server.

## Planning

Een rooster loopt van maandag tot en met zondag. De generator gebruikt de ingestelde werkdagen en tijden van actieve medewerkers. Je kunt een week of 1, 6 of 12 maanden vooruit plannen. Opnieuw genereren verwerkt de actuele teambezetting, afwezigheid en handmatige diensten.

Een stagiair staat alleen binnen de stageperiode op het rooster en alleen wanneer tijdens de hele dienst ook een gewone medewerker werkt. Een periodieke medewerker heeft eveneens een begin- en einddatum, maar mag zelfstandig werken. Afwezigheid maakt het overlappende deel van een dienst open. De planner kan een vervanger voor een hele of gedeeltelijke open dienst kiezen; overlappende diensten en afwezigheid worden uitgesloten.

Betrokken weken worden na een wijziging in afwezigheid opnieuw opgebouwd. Bij het verwijderen van een medewerker verdwijnen ook diens afwezigheden en worden betrokken weken concept. Handmatig toegevoegde diensten kun je per dag wijzigen of verwijderen.

Pauzeregels kunnen voor de dag of avond gelden. Alleen de minuten die daadwerkelijk binnen een dienst vallen, verminderen de getelde werkuren. Overlappende pauzes tellen niet dubbel.

Iedere dag vraagt dekking van 07:00 tot 19:30 met minstens vijf gelijktijdig ingeplande medewerkers, zonder stagiairs mee te tellen. De weekweergave en gedeelde afbeeldingen markeren de intervallen waar dit niet lukt.

## Delen en installeren

Een week en maand kunnen als PNG worden gedeeld. Een jaar gaat naar een Excel-werkmap met maandtotalen en een rij per ingeplande of open dienst. Dagen zonder gegenereerd rooster worden in de maandafbeelding aangeduid. Exports bevatten alleen roosters die al op de tablet staan.

De ondertekende APK staat op de `main`-branch; de downloadlink staat in de [README](../README.md). Houd voor nieuwe versies dezelfde privésleutel aan, zodat Android de app kan bijwerken zonder de lokale gegevens te wissen.
