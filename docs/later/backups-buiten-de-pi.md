# Voor later: back-ups buiten de Pi (Backblaze B2)

Nog niet ingesteld: we vertrouwen voorlopig op de SD-kaart (zie `deploy/README.md` > Back-ups).
Gaat de kaart of de Pi kapot, dan zijn de back-ups ook weg. Wil je ze ooit buiten de Pi bewaren,
dan kan PocketBase de nachtelijke back-up zelf naar Backblaze B2 sturen (gratis tot 10 GB, geen
betaalkaart nodig; regio *EU Central* staat in Amsterdam). Europese bedrijven werken op dezelfde
manier (S3), bv. Scaleway (betalen per GB, centen per maand) of Hetzner (€ 4,99 per maand).
Dit is eenmalig, ± 10 minuten:

1. **Account:** maak een gratis account op https://www.backblaze.com/sign-up/cloud-storage
   (kies regio *EU Central*).
2. **Bucket:** B2 Cloud Storage > Buckets > *Create a Bucket*.
   - Bucket Unique Name: bv. `bosboom-backups-<iets-willekeurigs>`
   - Files in Bucket are: **Private**
   - Default Encryption: **Enable**
   - Daarna bij de bucket > *Lifecycle Settings* > **Keep only the last version of the file**
     (anders blijven door PocketBase weggegooide back-ups verborgen bestaan en tellen ze mee).
   - Noteer het **Endpoint** dat bij de bucket staat, bv. `s3.eu-central-003.backblazeb2.com`.
3. **Sleutel:** Application Keys > *Add a New Application Key*.
   - Name: `bosboom-pi`, Allow access to Bucket(s): **alleen je nieuwe bucket**, Type of Access: **Read and Write**.
   - Je ziet de **keyID** en **applicationKey** maar één keer: plak ze meteen in stap 4.
4. **PocketBase:** beheerscherm (`http://<pi-ip>:8090/_/`) > Settings > Backups > tandwiel
   (Backups options) > zet **Store backups in S3 storage** aan:
   - Endpoint: `https://s3.eu-central-003.backblazeb2.com` (jouw endpoint, met `https://`)
   - Bucket: de bucketnaam uit stap 2
   - Region: het middelste stuk van het endpoint, bv. `eu-central-003`
   - Access key: de keyID, Secret: de applicationKey
   - Force path-style addressing: uit
   - *Test connection*, dan *Save changes*.
5. **Controleren:** Settings > Backups > *Initialize new backup*. Na een paar seconden staat hij
   in de lijst én in je bucket op backblaze.com.

Vanaf dan gaan de nachtelijke back-ups alleen nog naar B2, niet meer naar de SD-kaart.
Terugzetten: Settings > Backups, bij een back-up *Restore*. Is de Pi of de kaart helemaal
weg: zet de Pi opnieuw op (zie boven), vul stap 4 opnieuw in en kies *Restore*.
De sleutel staat alleen in PocketBase, nooit in deze repo.
