# Verborgen voorbereiding voor gedeelde roosters

De app blijft in versie 1.0.5 volledig lokaal werken. `src/cloud/` wordt nergens vanuit de app gestart en er is geen inlogscherm of automatische upload. De bestaande gegevens in AsyncStorage blijven dus op het apparaat. Een werkende gedeelde database vereist eerst een Firebase-project en een expliciete toekomstige aansluiting van deze module op de app.

De voorbereidende module gebruikt Google-aanmelding via de Android Google Sign-In SDK en Firebase Authentication. Firestore bewaart medewerkers, afwezigheden, instellingen en iedere roosterweek in een afzonderlijk document. Een synchronisatieronde vergelijkt lokale gegevens met een opgeslagen basisversie en de actuele serverversie. Wijzigingen aan verschillende weken kunnen samengaan; gelijktijdige wijzigingen aan hetzelfde document geven een conflict dat later in de UI opgelost moet worden. Firestore-transacties controleren het revisienummer bij upload. Een verwijderde week wordt als `null` met een nieuw revisienummer bewaard.

## Nodig voor activering

1. Maak een Firebase-project en een Firestore-database aan; zet Google als provider aan in Firebase Authentication. Controleer het actuele gratis Spark-quotum en stel desgewenst budgetmeldingen in vóór ingebruikname.
2. Registreer de Android-app `nl.roosterplan.app` bij Firebase/Google. Gebruik voor de huidige release APK de SHA-1 `C7:65:11:85:45:5E:30:86:6E:5D:FA:88:DB:CF:65:C7:DA:24:70:A6`; ook de debug-sleutel moet apart geregistreerd worden als die builds gebruikt worden. Maak een OAuth **web client ID** voor het Google ID-token.
3. Zet de Firestore-regels uit [`firebase/firestore.rules`](../firebase/firestore.rules) via de Firebase-console of CLI live. Maak via de Firebase-console of Admin SDK een document `teams/{teamId}` met `memberUids: ["firebase-uid-1", ...]` voor maximaal drie accounts. De app mag teamleden niet zelf beheren.
4. Geef `createCloudClient` de publieke Firebase-config (`apiKey`, `appId`, `projectId`), de OAuth web client ID en de gekozen `teamId`. Voeg vervolgens pas een inlog- en conflictinterface en veilige opslag van `SyncBaseline` toe. Gebruik `syncOnce` om een nieuw lokaal snapshot en een nieuwe basisversie te krijgen; sla beide samen op, zodat een onderbroken synchronisatie geen wijzigingen kwijtraakt.
5. Test op twee fysieke Android-apparaten: eerste upload/download, gelijktijdige bewerkingen, offline wijzigingen en herstel na onderbreking. Deploy pas daarna een APK met de functie aan.

Firebase-configwaarden identificeren het project en zijn geen privé-sleutels. Toegang wordt door Google-aanmelding, de drie toegestane UIDs en Firestore-regels beschermd. Er zijn nog geen projectwaarden of privé-sleutels in deze repository. De voorbereidende code verstuurt pas data als zij later expliciet vanuit de app wordt aangeroepen.
