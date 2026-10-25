import { CATEGORIES, radarLabel, RADAR_DISTANCES } from '../game/catalog';
import { Section } from './components';
import { useGameCtx } from './context';

export function RulesView() {
  const { state } = useGameCtx();
  const s = state.settings;
  return (
    <>
      <Section title="Voraussetzungen">
        <ul className="rules">
          <li>
            Diese App für alle (ersetzt Life360): Seeker teilen ihren Standort automatisch, Hider nie. Google Maps für Distanzmessungen, Tipp:
            „smappen“ für Kreise um eine Location oder Google Earth – oder die Karte in dieser App.
          </li>
          <li>Kasse: Alle sammeln Kassenbons, schlussendlich durch {s.splitCount ?? 'alle Spieler'} teilen (siehe „Kasse“).</li>
          <li>Würfel kaufen (oder in der App würfeln).</li>
        </ul>
      </Section>
      <Section title="Regeln">
        <ul className="rules">
          <li>Das Ziel ist es, sich jeweils am längsten vor den Seekern zu verstecken. Wer am Ende des Games die längste Zeit hat, hat gewonnen.</li>
          <li>
            Das Game dauert {s.days} Tage (Start {s.dayStart} Luzern Bahnhof) und endet am letzten Tag um {s.dayEnd}.
          </li>
          <li>
            Jeden Tag beginnt die Ruhephase um {s.dayEnd} und endet am nächsten Morgen um {s.dayStart}. In der Ruhephase ist das Game vollständig gestoppt.
          </li>
          <li>Es darf nur in einen Zug eingestiegen werden, wenn der Zielbahnhof vor Beginn der Ruhephase erreicht werden kann.</li>
          <li>
            Die Hider haben zu Beginn {s.hidingMinutes / 60} Stunden Zeit, sich an einen Ort zu begeben. In jener Gemeinde, in der sie nach Ablauf dieser Zeit
            sind, müssen sie sich für den Rest der Spieldauer aufhalten, ausser das Spiel gibt explizit andere Anweisungen. Die Gemeinde muss jedoch per Zug
            und mind. stündlich befahrbar sein.
          </li>
          <li>
            Danach starten die Seeker und können durch die Fragen die Location der Hider pinpointen. Diese Fragen geben den Hidern Münzen, welche sie dann
            für Curse-Würfel einsetzen können. Jeder Würfel kostet {s.diceCost} Münzen.
          </li>
          <li>In der gleichen Kategorie darf nur alle {s.cooldownMinutes} Minuten eine Frage gestellt werden. Übergreifend ist dies aber egal.</li>
          <li>
            Die Hider müssen Foto-Fragen innerhalb von 15 Minuten beantwortet haben. Können sie dies nicht (z.B. kein McDonalds oder kein Gemeindehaus),
            muss man dies melden – die Coins gibt’s aber nicht zurück.
          </li>
          <li>
            <strong>Jede Curse muss dokumentiert und den Hidern gesendet werden.</strong>
          </li>
          <li>Falls ihr eine Curse nicht erledigen könnt, müsst ihr dies den Hidern erklären und stattdessen die nächsthöhere Curse machen.</li>
          <li>Als Kommunikationsweg wird der WhatsApp-Gruppenchat oder Anrufe benutzt, ausgeschlossen sind Notfälle.</li>
          <li>Das Verwenden von Google Street View o.ä. ist verboten.</li>
          <li>Die Benützung von KI (ausser wenn ausdrücklich erlaubt) ist verboten.</li>
          <li>
            <strong>
              Der Hiding Spot darf höchstens 1000 Meter Luftlinie vom nächstgelegenen Bahnhof entfernt sein. Er muss uneingeschränkt zugänglich sein (keine
              abgezäunten Gebiete etc.).
            </strong>
          </li>
          <li>Bezüglich der Einhaltung der Regeln gilt das Ehrenprinzip.</li>
        </ul>
      </Section>
      <Section title="Fragen-Übersicht">
        <ul className="rules">
          {CATEGORIES.map((c) => (
            <li key={c.key}>
              {c.emoji} <strong>{c.name}</strong>: {c.coins} Coins, innerhalb von {c.answerMinutes} Minuten zu erledigen
              {c.key === 'radar' && ` (${RADAR_DISTANCES.map(radarLabel).join(', ')} oder selbst gewählt)`}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="So hilft die App">
        <ul className="rules">
          <li>Fragen, Antworten, Coins, Curses und Rundenzeiten sind für alle live synchron.</li>
          <li>Uhren stoppen automatisch in der Ruhephase; Curse 20 stoppt die Hiding-Zeit für 30 Minuten.</li>
          <li>Beantwortete Radar- und Himmelsrichtungs-Fragen werden auf der Karte als Ausschlussgebiete eingezeichnet.</li>
          <li>Hider bekommen beim Antworten Vorschläge aus dem GPS (Richtung, Radar, Kanton, Flughafen) – bitte trotzdem kurz prüfen.</li>
          <li>Die Karte kann alle Bahnhöfe mit 1-km-Zone anzeigen (Hiding-Spot-Regel).</li>
          <li>Wichtig: Der Standort wird nur aktualisiert, solange die App offen ist. Fotos und Sprachnachrichten weiterhin per WhatsApp.</li>
        </ul>
      </Section>
    </>
  );
}
