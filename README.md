# Hide and Seek – Schweiz-Edition

Web-App für unser Hide-and-Seek-Spiel quer durch die Schweiz: Fragen, Coins, Curses, Rundenzeiten, Kasse – und der Live-Standort der Seeker, damit es **kein Life360** mehr braucht.

Läuft im Browser auf jedem Handy. Am besten über „Zum Startbildschirm hinzufügen“ wie eine normale App starten.

## Was die App kann

- **Spiel & Teams:** Spiel erstellen, Code teilen, mitspielen. Alle Daten sind live auf allen Handys synchron.
- **Spielzeit:** 1–5 Tage wählbar, 07:00–19:00. In der Ruhephase (19:00–07:00) stehen alle Uhren automatisch still, auch Antwortzeiten und Sperrzeiten. Ein Countdown zeigt an, bis wann man noch in einen Zug steigen darf.
- **Runden:**
  - Das Hider-Team hat 2 h Versteckzeit.
  - Danach läuft die Hiding-Zeit, bis „Gefunden!“ gedrückt wird oder das Rundenlimit (Standard 5 h) erreicht ist.
  - **Endspiel:** Sind die Seeker in der Gemeinde der Hiders und aus dem ÖV ausgestiegen, wird das Endspiel gestartet. Ab dann bewegen sich die Hiders nicht mehr; die App merkt sich ihren Spot (nur auf ihrem Handy). Hiders sehen laufend, wie weit der nächste Seeker weg ist.
  - Jedes Team versteckt sich gleich oft, gewertet wird die beste Runde. Abgebrochene Runden zählen nicht.
  - Eine Pause ist möglich, z.B. bei einem Notfall.
- **Fragen:**
  - Alle Kategorien aus dem Regeldokument: Relativ, Radar, Foto, Kunterbunt und Präzision.
  - Immer nur eine offene Frage; dazu der 30-min-Cooldown pro Kategorie.
  - Die Hiders bekommen die Coins, wenn sie rechtzeitig antworten (5 bzw. 15 min). Zu spät: keine Coins, und ihre Hiding-Zeit steht still, bis die Antwort kommt.
- **Hilfe für Hiders:**
  - Beim Antworten macht die App Vorschläge aus dem GPS: Nord/Süd, Ost/West, Radar-Distanz, nächster Flughafen, Kanton/Gemeinde, Grossregion und nächster Bahnhof.
  - Die Vorschläge bitte trotzdem kurz prüfen.
- **Curses:**
  - Würfel kaufen (50 Coins pro Würfel, Summe = Curse-Nummer) oder echte Würfel verwenden und das Ergebnis eintippen.
  - Nur eine Curse gleichzeitig darf Fragen oder Reisen blockieren (alle ausser Curse 16). Solange sie aktiv ist, gibt es keine neuen Würfel.
  - Die Seeker werden sofort benachrichtigt.
  - Seeker haken eine Curse als „Erledigt“ ab. Ist sie nicht machbar, gilt die nächsthöhere.
  - Timer für Wartezeiten sind eingebaut.
  - Curse 20 stoppt die Hiding-Zeit für 30 min.
- **Karte (swisstopo):**
  - Seeker teilen ihren Standort automatisch. Hider sehen die Seeker, Seeker sehen die Hider nie.
  - Beantwortete Radar- und Himmelsrichtungs-Fragen werden als rote Ausschlussgebiete eingezeichnet.
  - Werkzeuge: Distanz messen, Kreise ziehen (wie „smappen“) und Markierungen setzen. Kreise und Markierungen sieht nur das eigene Team.
  - Alle Bahnhöfe im Ausschnitt lassen sich mit ihrer 1-km-Zone anzeigen (Hiding-Spot-Regel).
  - Während Curse 16 „Analog“ ist die Karte für die betroffenen Seeker gesperrt.
- **Kasse:** Kassenbons erfassen. Die App teilt durch die Anzahl Personen und zeigt, wer wem wie viel zahlt.
- **Anleitung & Regeln:** Erklärseite für alle Mitspielenden: Tagesablauf, Ablauf einer Runde, Rollen, Fragen, Curses, das ganze Regelwerk und die Punkte, die man vor dem Start absprechen sollte. Erreichbar auf der Startseite (auch ohne Spiel), unter *Mehr → Regeln* und im Status.
- **Testmodus:** Ein Spiel nur auf einem Gerät, ohne Server. Mehrere Browser-Tabs sind dann mehrere Spieler.

## Wichtig zu wissen

- **Standort nur bei offener App:** Eine Web-App kann den Standort nicht im Hintergrund senden wie Life360. Die Seeker sollten die App also offen lassen. Unter *Mehr → Einstellungen → Bildschirm wach halten* bleibt das Display an.
- **Benachrichtigungen** (neue Frage, Curse) kommen nur, solange die App offen oder kürzlich offen war. Kommunikation, Fotos und Sprachnachrichten laufen laut Regeln weiterhin über WhatsApp.
- **Kein Login:** Wer den Spielcode kennt, kann mitspielen und mitlesen. Gebt ihn also nur in eurer Gruppe weiter.
- **Kostenloses Supabase-Projekt:** Es pausiert nach einer Woche ohne Nutzung. Vor dem Spiel einmal öffnen oder im Supabase-Dashboard wieder aktivieren.

## Technik

- React + TypeScript + Vite, Karte mit Leaflet und swisstopo-Kacheln. Bahnhöfe und Ortsnamen kommen von OpenStreetMap (Overpass/Nominatim).
- **Backend:** Supabase (Postgres) im Projekt `hideandseek` in Zürich (`eu-central-2`). Das Schema steht in `supabase/migrations/0001_hideandseek.sql`.
  - Das Spiel ist ein Event-Log: Jede Aktion ist ein Event, und alle Geräte berechnen daraus den gleichen Zustand (`src/game/reducer.ts`).
  - Die Tabellen sind per Row-Level-Security gesperrt. Zugriff gibt es nur über Funktionen, die den Spielcode verlangen.
  - Live-Updates laufen über Supabase Realtime (Broadcast), zusätzlich gleicht die App alle 6 s ab.
- **Konfiguration:** `src/config.ts`. Mit `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` lässt sie sich überschreiben.

```bash
npm install
npm run dev      # Entwicklungsserver
npm test         # Unit-Tests (Zeitrechnung, Spiellogik, Kasse)
npm run build    # Produktions-Build nach dist/
```

## Veröffentlichen (GitHub Pages)

Der Workflow `.github/workflows/deploy.yml` baut und testet bei jedem Push. Den Default-Branch veröffentlicht er auf GitHub Pages.

Einmalig nötig: Im Repository unter **Settings → Pages → Build and deployment → Source** „GitHub Actions“ wählen. Danach den Workflow erneut laufen lassen.

Die App ist dann unter `https://<user>.github.io/hideandseek/` erreichbar.
