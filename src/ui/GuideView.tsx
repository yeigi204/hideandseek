// Anleitung & Regeln: erklärt das Spiel für alle, auch vor dem Beitritt.
import { CATEGORIES, CURSES, radarLabel, RADAR_DISTANCES } from '../game/catalog';
import type { Settings } from '../game/types';
import { parseHM } from '../lib/time';

const TOC = [
  ['g-ueberblick', 'Überblick'],
  ['g-tag', 'Tagesablauf'],
  ['g-runde', 'Runde'],
  ['g-rollen', 'Rollen'],
  ['g-fragen', 'Fragen'],
  ['g-curses', 'Curses'],
  ['g-regeln', 'Regeln'],
  ['g-app', 'App'],
  ['g-offen', 'Offene Punkte'],
] as const;

function hours(min: number) {
  return min % 60 === 0 ? `${min / 60} h` : `${min} min`;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd}, ${d}.${m}.${y}`;
}

export function GuideView({ settings: s, inGame }: { settings: Settings; inGame: boolean }) {
  const dice =
    s.diceSides === 20
      ? 'Mit einem 20er-Würfel: die Zahl ist die Curse-Nummer.'
      : `Pro ${s.diceCost} Coins ein 6er-Würfel. Die Augensumme aller gekauften Würfel ist die Curse-Nummer (über ${CURSES.length} zählt als ${CURSES.length}). Mehr Würfel = heftigere Curses.`;

  const limit = s.maxHidingMinutes ? hours(s.maxHidingMinutes) : null;
  const scoring = s.scoring === 'best' ? 'die beste Runde jedes Teams' : 'die Summe aller Runden jedes Teams';

  return (
    <div className="guide">
      <header className="guide-hero card">
        <h2>So funktioniert Hide and Seek</h2>
        <p>
          Ein Team versteckt sich irgendwo in der Schweiz, alle anderen suchen es – mit dem Zug und mit Fragen, die die Hiders ehrlich beantworten müssen. Für
          jede Frage bekommen die Hiders Coins, mit denen sie die Seeker verfluchen können.{' '}
          <strong>Wer am Ende am längsten versteckt geblieben ist, gewinnt.</strong>
        </p>
      </header>

      <nav className="guide-toc" aria-label="Inhalt">
        {TOC.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            {label}
          </a>
        ))}
      </nav>

      <section id="g-ueberblick" className="card">
        <h3>Auf einen Blick</h3>
        <div className="facts">
          <Fact icon="🗓️" value={s.days === 1 ? '1 Tag' : `${s.days} Tage`} label={inGame ? `ab ${fmtDate(s.startDate)}` : `Start ${s.dayStart}, Luzern Bahnhof`} />
          <Fact icon="⏰" value={`${s.dayStart}–${s.dayEnd}`} label="Spielzeit, danach Ruhephase" />
          <Fact icon="🫣" value={hours(s.hidingMinutes)} label="Zeit zum Verstecken" />
          <Fact icon="🚉" value="≤ 1000 m" label="Hiding Spot bis zum nächsten Bahnhof" />
          <Fact icon="🪙" value={`${s.diceCost} Coins`} label="pro Curse-Würfel" />
          <Fact icon="⏳" value={`${s.cooldownMinutes} min`} label="Pause pro Fragen-Kategorie" />
          <Fact icon="🏆" value={s.scoring === 'best' ? 'Beste Runde' : 'Summe'} label="zählt für die Wertung" />
          <Fact icon="⏱️" value={limit ? `max. ${limit}` : 'kein Limit'} label="Hiding-Zeit pro Runde" />
        </div>
      </section>

      <section id="g-tag" className="card">
        <h3>Tagesablauf</h3>
        <DayBar dayStart={s.dayStart} dayEnd={s.dayEnd} />
        <p>
          Gespielt wird von <strong>{s.dayStart}</strong> bis <strong>{s.dayEnd}</strong>. In der <strong>Ruhephase</strong> ({s.dayEnd}–{s.dayStart}) ist
          das Spiel vollständig gestoppt: Es laufen keine Uhren, es gibt keine Fragen und keine Curses. Die App hält alle Uhren automatisch an und lässt sie
          am Morgen weiterlaufen.
        </p>
        <div className="banner warn">
          🚆 In einen Zug darf man nur einsteigen, wenn der Zielbahnhof <strong>vor {s.dayEnd}</strong> erreicht wird.
        </div>
      </section>

      <section id="g-runde" className="card">
        <h3>Ablauf einer Runde</h3>
        <ol className="steps">
          <li>
            <span className="step-icon">🫣</span>
            <div>
              <strong>Versteckphase · {hours(s.hidingMinutes)}</strong>
              <p>
                Die Hiders reisen los, die Seeker warten. In der Gemeinde, in der die Hiders nach Ablauf der Zeit sind, bleiben sie bis zum Ende der Runde.
              </p>
            </div>
          </li>
          <li>
            <span className="step-icon">🔎</span>
            <div>
              <strong>Suchphase</strong>
              <p>
                Die Seeker reisen los und stellen Fragen{s.oneQuestionAtATime ? ', immer eine nach der anderen' : ''}. Die Hiders antworten, sammeln Coins und
                würfeln Curses. Bis zum Endspiel dürfen sie sich in ihrer Gemeinde bewegen. Jetzt läuft die Hiding-Zeit
                {s.countHidingPhase ? ' (die Versteckphase zählt in diesem Spiel auch dazu)' : ''}.
              </p>
            </div>
          </li>
          <li>
            <span className="step-icon">🔒</span>
            <div>
              <strong>Endspiel</strong>
              <p>
                Sobald mindestens ein Seeker in der Gemeinde der Hiders ist und den ÖV verlassen hat, startet jemand in der App das Endspiel. Ab dann bewegen
                sich die Hiders nicht mehr: Ihr Ort in diesem Moment ist der Hiding Spot.
              </p>
            </div>
          </li>
          <li>
            <span className="step-icon">🎯</span>
            <div>
              <strong>Gefunden</strong>
              <p>
                Wer die Hiders findet, drückt in der App auf „Gefunden!“. Die Hiding-Zeit des Teams wird gespeichert.
                {limit && ` Nach ${limit} Hiding-Zeit endet die Runde automatisch mit der vollen Zeit (Rundenlimit).`}
              </p>
            </div>
          </li>
          <li>
            <span className="step-icon">🔁</span>
            <div>
              <strong>Nächste Runde</strong>
              <p>Das nächste Team versteckt sich – jedes Team gleich oft. Am Schluss zählt {scoring}.</p>
            </div>
          </li>
        </ol>
      </section>

      <section id="g-rollen" className="card">
        <h3>Wer macht was?</h3>
        <div className="roles">
          <div className="role-card hider">
            <h4>🫣 Hiders</h4>
            <ul>
              <li>Euer Standort wird in der App nicht geteilt (früher: Life360 ausschalten).</li>
              <li>In {hours(s.hidingMinutes)} in eine Gemeinde, die mindestens stündlich per Zug erreichbar ist.</li>
              <li>Bis zum Endspiel dürft ihr euch in der Gemeinde bewegen – aber nur an Orten, die als Hiding Spot gelten (siehe Regeln).</li>
              <li>Endspiel: ab sofort nicht mehr bewegen. Die App merkt sich euren Spot auf eurer Karte.</li>
              <li>Fragen ehrlich und rechtzeitig beantworten, Fotos per WhatsApp schicken. Zu spät = keine Coins und eure Zeit steht still.</li>
              <li>Coins sammeln und Curses würfeln.</li>
            </ul>
          </div>
          <div className="role-card seeker">
            <h4>🔎 Seeker</h4>
            <ul>
              <li>App offen lassen – euer Standort wird automatisch geteilt.</li>
              <li>
                Fragen stellen{s.oneQuestionAtATime ? ', eine nach der anderen' : ''} – pro Kategorie alle {s.cooldownMinutes} Minuten eine.
              </li>
              <li>In der Gemeinde der Hiders und ausgestiegen? Endspiel starten.</li>
              <li>Curses sofort erledigen, dokumentieren (Foto/Video) und den Hiders schicken.</li>
              <li>Nur in Züge steigen, die vor {s.dayEnd} ankommen.</li>
              <li>Hiders gefunden? „Gefunden!“ drücken.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="g-fragen" className="card">
        <h3>Fragen</h3>
        <p>
          Die Seeker stellen Fragen gratis – die <strong>Hiders bekommen Coins, wenn sie rechtzeitig antworten</strong>. Relativ- und Radar-Fragen beziehen
          sich auf den Standort der Seeker beim Fragen; die App schickt ihn automatisch mit.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Kategorie</th>
              <th>Coins</th>
              <th>Antwort in</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => (
              <tr key={c.key}>
                <td>
                  {c.emoji} {c.name}
                </td>
                <td>{c.coins}</td>
                <td>{c.answerMinutes} min</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="rules">
          <li>
            In der gleichen Kategorie darf nur alle {s.cooldownMinutes} Minuten eine Frage gestellt werden, über verschiedene Kategorien hinweg ist das egal
            {s.cooldownScope === 'team' ? ' (in diesem Spiel zählt das pro Seeker-Team)' : ''}.
          </li>
          {s.oneQuestionAtATime && <li>Es ist immer nur eine Frage offen: Die nächste geht erst, wenn die vorherige beantwortet ist.</li>}
          <li>Zu spät beantwortet: keine Coins, und die Hiding-Zeit steht still, bis die Antwort kommt.</li>
          <li>Radar: {RADAR_DISTANCES.map(radarLabel).join(', ')} oder ein selbst gewählter Radius.</li>
          <li>Geht eine Foto-Frage nicht (z.B. kein McDonalds, kein Gemeindehaus), melden die Hiders das – die Coins behalten sie trotzdem.</li>
        </ul>
        {CATEGORIES.map((c) => (
          <details key={c.key} className="guide-details">
            <summary>
              {c.emoji} Alle {c.name}-Fragen ({c.key === 'radar' ? RADAR_DISTANCES.length + 1 : c.questions.length})
            </summary>
            {c.intro && <p className="muted small">{c.intro}</p>}
            <ul>
              {c.key === 'radar'
                ? [...RADAR_DISTANCES.map(radarLabel), '???? (selbst entscheiden)'].map((d) => <li key={d}>{d}</li>)
                : c.questions.map((q) => <li key={q.key}>{q.text}</li>)}
            </ul>
          </details>
        ))}
      </section>

      <section id="g-curses" className="card">
        <h3>Coins & Curses</h3>
        <ul className="rules">
          <li>
            Die Hiders kaufen mit ihren Coins Würfel. {dice}
          </li>
          <li>Die Curse geht sofort an die Seeker. „Bevor ihr euch bewegt / etwas anderes tut“ heisst: zuerst die Curse, dann alles andere.</li>
          <li>
            Es darf immer nur <strong>eine</strong> Curse aktiv sein, die Fragen oder Reisen blockiert – das sind alle ausser Curse 16 „Analog“. Neue Würfel
            gibt es erst, wenn die Seeker die aktive Curse erledigt haben.
          </li>
          <li>
            <strong>Jede Curse muss dokumentiert und den Hiders gesendet werden.</strong>
          </li>
          <li>Ist eine Curse nicht machbar, erklären die Seeker das den Hiders und machen stattdessen die nächsthöhere.</li>
          <li>Curse 20 („Ich glaub’ es spukt“) stoppt die Hiding-Zeit für 30 Minuten; die Hiders dürfen sich neu positionieren.</li>
        </ul>
        <details className="guide-details">
          <summary>🎲 Alle {CURSES.length} Curses</summary>
          <ol className="curse-list">
            {CURSES.map((c) => (
              <li key={c.number}>
                <strong>{c.title}</strong>
                <p className="pre">{c.text}</p>
              </li>
            ))}
          </ol>
        </details>
      </section>

      <section id="g-regeln" className="card">
        <h3>Die Regeln</h3>
        <h4>Ziel</h4>
        <ul className="rules">
          <li>Das Ziel ist es, sich jeweils am längsten vor den Seekern zu verstecken. Wer am Ende des Games die längste Zeit hat, hat gewonnen.</li>
        </ul>
        <h4>Zeit & Reisen</h4>
        <ul className="rules">
          <li>
            Das Game dauert {s.days === 1 ? '1 Tag' : `${s.days} Tage`} (Start {s.dayStart} Luzern Bahnhof) und endet am letzten Tag um {s.dayEnd}.
          </li>
          <li>
            Jeden Tag beginnt die Ruhephase um {s.dayEnd} und endet am nächsten Morgen um {s.dayStart}. In der Ruhephase ist das Game vollständig gestoppt.
          </li>
          <li>Es darf nur in einen Zug eingestiegen werden, wenn der Zielbahnhof vor Beginn der Ruhephase erreicht werden kann.</li>
        </ul>
        <h4>Verstecken</h4>
        <ul className="rules">
          <li>
            Die Hiders haben zu Beginn {hours(s.hidingMinutes)} Zeit, sich an einen Ort zu begeben. In der Gemeinde, in der sie nach Ablauf dieser Zeit sind,
            müssen sie bleiben, ausser das Spiel gibt explizit andere Anweisungen (z.B. Curse 20). Die Gemeinde muss per Zug und mindestens stündlich
            erreichbar sein.
          </li>
          <li>
            <strong>
              Der Hiding Spot darf höchstens 1000 Meter Luftlinie vom nächstgelegenen Bahnhof entfernt sein. Er muss uneingeschränkt zugänglich sein (keine
              abgezäunten Gebiete etc.).
            </strong>
          </li>
          <li>
            <New /> Der Hiding Spot ist während der ganzen Spielzeit öffentlich zugänglich, liegt direkt an einer Strasse oder einem Weg, der auf der Karte
            eingezeichnet ist (höchstens ca. 3 m daneben), und ist nicht in einer Toilette, Wohnung oder einem Laden.
          </li>
          <li>
            <New /> <strong>Endspiel:</strong> Sobald mindestens ein Seeker in der Gemeinde der Hiders ist und kein ÖV mehr benutzt, beginnt das Endspiel (in
            der App starten). Der Ort der Hiders in diesem Moment ist der Hiding Spot – ab dann bewegen sie sich nicht mehr. Stehen sie gerade nicht an einem
            gültigen Spot, gehen sie auf direktem Weg zum nächsten gültigen Ort.
          </li>
        </ul>
        <h4>Fragen & Antworten</h4>
        <ul className="rules">
          <li>Danach starten die Seeker und können mit den Fragen die Location der Hiders eingrenzen. Jede rechtzeitig beantwortete Frage gibt den Hiders Coins.</li>
          <li>In der gleichen Kategorie darf nur alle {s.cooldownMinutes} Minuten eine Frage gestellt werden. Übergreifend ist dies egal.</li>
          {s.oneQuestionAtATime && (
            <li>
              <New /> Eine neue Frage darf erst gestellt werden, wenn die vorherige beantwortet ist.
            </li>
          )}
          <li>
            <New /> Kommt eine Antwort zu spät, steht die Hiding-Zeit still, bis sie da ist, und die Hiders bekommen für diese Frage keine Coins.
          </li>
          <li>
            Foto-Fragen müssen innerhalb von 15 Minuten beantwortet sein. Geht es nicht (z.B. kein McDonalds oder kein Gemeindehaus), muss man das melden –
            die Coins gibt es aber nicht zurück.
          </li>
        </ul>
        <h4>Curses</h4>
        <ul className="rules">
          <li>Jeder Würfel kostet {s.diceCost} Coins.</li>
          <li>
            <New /> {dice}
          </li>
          <li>
            <New /> Es darf höchstens eine Curse gleichzeitig aktiv sein, die Fragen oder Reisen blockiert (alle ausser Curse 16).
          </li>
          <li>
            <strong>Jede Curse muss dokumentiert und den Hiders gesendet werden.</strong>
          </li>
          <li>Falls ihr eine Curse nicht erledigen könnt, müsst ihr das den Hiders erklären und stattdessen die nächsthöhere Curse machen.</li>
        </ul>
        <h4>Wertung</h4>
        <ul className="rules">
          <li>
            <New /> Jedes Team versteckt sich gleich oft. Es zählt {scoring}. Abgebrochene Runden zählen nicht.
          </li>
          {limit && (
            <li>
              <New /> Rundenlimit: Nach {limit} Hiding-Zeit endet die Runde, und das Team bekommt die vollen {limit}. So kommen alle Teams dran.
            </li>
          )}
        </ul>
        <h4>Fairplay</h4>
        <ul className="rules">
          <li>Kommuniziert wird über den WhatsApp-Gruppenchat oder Anrufe, ausgenommen Notfälle.</li>
          <li>Google Street View o.ä. ist verboten.</li>
          <li>KI ist verboten, ausser wenn ausdrücklich erlaubt (z.B. Curse 12).</li>
          <li>Bezüglich der Einhaltung der Regeln gilt das Ehrenprinzip.</li>
        </ul>
        <h4>Kasse</h4>
        <ul className="rules">
          <li>
            Alle sammeln Kassenbons. Am Schluss wird durch {s.splitCount ?? 'die Anzahl Spieler'} geteilt – die App rechnet unter „Mehr → Kasse“ aus, wer wem
            wie viel zahlt.
          </li>
        </ul>
      </section>

      <section id="g-app" className="card">
        <h3>So hilft die App</h3>
        <dl className="app-tabs">
          <dt>⏱️ Status</dt>
          <dd>Spieluhr, Ruhephase, laufende Runde, Coins, Rangliste und Verlauf. Hier startet ihr Runden und drückt „Gefunden!“.</dd>
          <dt>❓ Fragen</dt>
          <dd>
            Seeker stellen Fragen, Hiders beantworten sie. Die App zeigt Antwortzeit und Sperrzeit pro Kategorie. Für einige Fragen rechnet sie den Hidern die
            Antwort aus dem GPS vor (Distanz, Richtung, Kanton) – reine Geometrie, keine KI.
          </dd>
          <dt>🗺️ Karte</dt>
          <dd>
            Live-Standort der Seeker (für alle sichtbar, Hiders nie). Beantwortete Radar- und Richtungsfragen werden rot als Ausschlussgebiet eingezeichnet.
            Werkzeuge: Distanz messen, Kreise, Markierungen, Bahnhöfe mit 1-km-Zone.
          </dd>
          <dt>🎲 Curses</dt>
          <dd>Hiders würfeln hier. Seeker sehen ihre Curses mit Timern und haken sie ab.</dd>
          <dt>☰ Mehr</dt>
          <dd>Teams, Runden, Kasse, diese Anleitung und die Einstellungen.</dd>
        </dl>
        <div className="banner">
          📱 Tipp: Die App im Browser über „Zum Startbildschirm hinzufügen“ installieren. Der Standort wird nur gesendet, solange die App offen ist – Seeker
          schalten am besten „Bildschirm wach halten“ ein.
        </div>
      </section>

      <section id="g-offen" className="card">
        <h3>Vor dem Start klären</h3>
        <p className="muted small">
          Diese Punkte stehen noch nicht in den Regeln. Sprecht sie ab, bevor es losgeht. Mit <New /> markierte Regeln sind neu dazugekommen (nach den
          Jet-Lag-Regeln auf lifack.ch).
        </p>
        <ul className="rules">
          <li>
            <strong>Was gilt als „gefunden“?</strong> Sehen, berühren, auf ein paar Meter herankommen?
          </li>
          <li>
            <strong>Welche Verkehrsmittel sind erlaubt?</strong> Die Regeln nennen nur den Zug – was ist mit Bus, Tram, Schiff, Velo, Taxi?
          </li>
          <li>
            <strong>Was gilt nachts?</strong> Wo übernachten Hiders und Seeker, und darf man sich in der Ruhephase bewegen?
          </li>
        </ul>
      </section>
    </div>
  );
}

function New() {
  return <span className="tag new">neu</span>;
}

function Fact({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="fact">
      <span className="fact-icon">{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

/** 24-Stunden-Balken mit Spielzeit und Ruhephase */
function DayBar({ dayStart, dayEnd }: { dayStart: string; dayEnd: string }) {
  const toPct = (hm: string) => {
    const [h, m] = parseHM(hm);
    return ((h * 60 + m) / (24 * 60)) * 100;
  };
  const a = toPct(dayStart);
  let b = toPct(dayEnd);
  if (b === 0) b = 100;
  const play = a < b ? [[a, b]] : [[a, 100], [0, b]];
  const inner = (p: number) => p > 0 && p < 100;
  return (
    <div className="daybar" role="img" aria-label={`Spielzeit ${dayStart} bis ${dayEnd}, sonst Ruhephase`}>
      <div className="daybar-track">
        {play.map(([from, to]) => (
          <div key={from} className="daybar-play" style={{ left: `${from}%`, width: `${to - from}%` }}>
            {to - from > 25 && 'Spielzeit'}
          </div>
        ))}
      </div>
      <div className="daybar-labels">
        <span className="first">00:00</span>
        {inner(a) && <span style={{ left: `${a}%` }}>{dayStart}</span>}
        {inner(b) && <span style={{ left: `${b}%` }}>{dayEnd}</span>}
        <span className="last">24:00</span>
      </div>
      <div className="daybar-legend">
        <span>
          <i className="sw play" /> Spielzeit
        </span>
        <span>
          <i className="sw rest" /> Ruhephase 😴
        </span>
      </div>
    </div>
  );
}
