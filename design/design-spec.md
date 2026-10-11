# Akzeptierter Entwurf

Der Nutzer bestätigte die gezeigte Gestaltung am 11. Oktober 2026 mit „ja bau es so“. Referenz: `discord-window-concept.png`.

## Unveränderliches Material

Das ausdrücklich ausgewählte Foto `image-edit-target-5130dd0e61ee1c0e.png` ist byte-identisch mit der zuerst hochgeladenen PNG-Datei. In der Anwendung liegt dieses Original ohne Bildbearbeitung unter `dist/assets/rog-anniversary-background.png`. Die im generierten Entwurf leicht veränderte Perspektive des Produkts wird nicht übernommen; die ausdrückliche Vorgabe, das Originalfoto zu verwenden, hat Vorrang.

## Gestaltung

Ein zusammenhängendes, dunkelgraues Discord-Fenster mit feiner goldener Außenkante. Das Hochformatfoto steht rechts und bleibt deutlich erkennbar. Ein schwarzer Verlauf blendet links in die Oberfläche, ohne die vorhandenen goldenen und blauen Reflexionen neu einzufärben. Inhalte liegen auf dunklen, teilweise durchscheinenden Flächen.

- Gold: `#e2bf79`, helle Schrift nahe Elfenbein; Untergrund Graphit.
- Systemtypografie mit Segoe UI/Inter-ähnlicher Sans Serif; ausdrücklich definierte Größen auch auf Steuerelementen.
- Fensterkopf: Discord-Zeichen, Crazy_Batto, Discord-Community beziehungsweise der echte gelieferte Servername; Anpassen und Vergrößern.
- Inhalt links: Willkommen in der Lounge. / Gemeinsam zocken. Zusammen abhängen. / Verbindungsstatus / Discord öffnen.
- Eine Listenfläche mit Sprachkanäle- und Mitglieder-Tab und Aktualisierungsknopf.
- Fußzeile: echter Verbindungszustand und Original-Widget.
- Dialoge im selben visuellen System für Einstellungen und das ursprüngliche iframe.

## Dynamische Texte und begründete Unterschiede zum Konzept

Die im Konzept gezeigten Kanalzeilen dienen der Gestaltung. In der Anwendung entstehen Listen ausschließlich aus echten Antworten von Discord. Während des Ladens und bei Fehlern werden klar bezeichnete Leerzustände verwendet. Onlinezahlen werden nicht vorgetäuscht. Ein grüner Status bedeutet erfolgreichen Abruf, nicht bloß laufenden Verbindungsaufbau.

Der genaue Servername, tatsächliche Kanalanzahl, Onlinezahl, Benutzername und eine vorhandene Einladung werden aus der API übernommen und sind absichtlich dynamisch. Auf kleinen Bildschirmen ordnen sich die Inhalte untereinander; keine feste 350-Pixel-Mindestbreite. Das zusätzliche Original-Widget behält die vorgegebenen 350 × 500 Pixel, begrenzt seine Breite aber auf den verfügbaren Platz.

## Prüfstatus

JavaScript-Syntax, Datennormalisierung und Zustandslogik werden geprüft. Der konfigurierte managed Sites-Workflow stellt in dieser Sitzung keinen `control-browser` bereit; er untersagt dafür einen improvisierten lokalen Browser-/Vorschauserver. Deshalb ist ein Vergleich eines tatsächlichen Browser-Screenshots mit diesem Konzept vor Bereitstellung hier nicht durchführbar. Keine Behauptung eines solchen Vergleichs oder pixelgenauer Browser-Fidelität.


## Transfer note

This design record was recovered from the source conversation. The stylesheet tail and the original PNG could not be fully exported in this transfer environment; see the repository README and ASSET_PROVENANCE.md.
