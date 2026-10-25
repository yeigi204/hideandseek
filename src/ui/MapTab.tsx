import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RADAR_DISTANCES, radarLabel } from '../game/catalog';
import { curseAutoEnd, questionLabel, roundQuestions } from '../game/reducer';
import type { MapMarker, Question } from '../game/types';
import { useNow } from '../hooks/useNow';
import { CH_BOUNDS, circleRing, distance, fetchStations, fmtDistance, type LatLng, type Station } from '../lib/geo';
import { uid } from '../lib/ids';
import { getPref, setPref } from '../lib/storage';
import { fmtAgo, fmtClock } from '../lib/time';
import { Countdown, Modal } from './components';
import { useGameCtx } from './context';

const BASE_LAYERS = {
  karte: {
    label: 'Karte',
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    attribution: '© <a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noreferrer">swisstopo</a>',
    maxNativeZoom: 18,
  },
  luftbild: {
    label: 'Luftbild',
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
    attribution: '© <a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noreferrer">swisstopo</a>',
    maxNativeZoom: 19,
  },
  osm: {
    label: 'OSM',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    maxNativeZoom: 19,
  },
} as const;
type BaseKey = keyof typeof BASE_LAYERS;

type Tool = 'none' | 'measure' | 'circle' | 'pin';
type GroupKey = 'hints' | 'stations' | 'markers' | 'players' | 'me' | 'measure';

const SHADE: L.PathOptions = { stroke: false, fillColor: '#e5484d', fillOpacity: 0.2, interactive: false };
const EDGE: L.PolylineOptions = { color: '#e5484d', weight: 2, dashArray: '6 6' };
const OUTER: L.LatLngTuple[] = [
  [CH_BOUNDS.south, CH_BOUNDS.west],
  [CH_BOUNDS.north, CH_BOUNDS.west],
  [CH_BOUNDS.north, CH_BOUNDS.east],
  [CH_BOUNDS.south, CH_BOUNDS.east],
];

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Ausschlussgebiet aus einer beantworteten Frage */
function drawQuestionHint(group: L.LayerGroup, q: Question) {
  if (!q.pos || q.answer == null || q.impossible) return;
  const pos: L.LatLngTuple = [q.pos.lat, q.pos.lng];
  const label = `${questionLabel(q)} → ${q.answer}`;
  if (q.key === 'radar' && q.param) {
    const yes = q.answer === 'Ja';
    if (yes) L.polygon([OUTER, circleRing(q.pos, q.param)], SHADE).addTo(group);
    else L.circle(pos, { ...SHADE, radius: q.param }).addTo(group);
    L.circle(pos, { radius: q.param, color: '#e5484d', weight: 2, fill: false, dashArray: '6 6' })
      .bindTooltip(escapeHtml(label))
      .addTo(group);
  } else if (q.key === 'rel-ns' && (q.answer === 'Nördlicher' || q.answer === 'Südlicher')) {
    const north = q.answer === 'Nördlicher';
    const excluded: L.LatLngBoundsExpression = north
      ? [
          [CH_BOUNDS.south, CH_BOUNDS.west],
          [q.pos.lat, CH_BOUNDS.east],
        ]
      : [
          [q.pos.lat, CH_BOUNDS.west],
          [CH_BOUNDS.north, CH_BOUNDS.east],
        ];
    L.rectangle(excluded, SHADE).addTo(group);
    L.polyline(
      [
        [q.pos.lat, CH_BOUNDS.west],
        [q.pos.lat, CH_BOUNDS.east],
      ],
      EDGE,
    )
      .bindTooltip(escapeHtml(label))
      .addTo(group);
  } else if (q.key === 'rel-ew' && (q.answer === 'Östlicher' || q.answer === 'Westlicher')) {
    const east = q.answer === 'Östlicher';
    const excluded: L.LatLngBoundsExpression = east
      ? [
          [CH_BOUNDS.south, CH_BOUNDS.west],
          [CH_BOUNDS.north, q.pos.lng],
        ]
      : [
          [CH_BOUNDS.south, q.pos.lng],
          [CH_BOUNDS.north, CH_BOUNDS.east],
        ];
    L.rectangle(excluded, SHADE).addTo(group);
    L.polyline(
      [
        [CH_BOUNDS.south, q.pos.lng],
        [CH_BOUNDS.north, q.pos.lng],
      ],
      EDGE,
    )
      .bindTooltip(escapeHtml(label))
      .addTo(group);
  }
  L.circleMarker(pos, { radius: 4, color: '#e5484d', fillOpacity: 1 }).bindTooltip(escapeHtml(label)).addTo(group);
}

export function MapTab({ visible }: { visible: boolean }) {
  const { state, api, me, geo, round, role, myTeam, run, toast } = useGameCtx();
  const t = useNow(5000);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const groups = useRef<Record<GroupKey, L.LayerGroup> | null>(null);
  const baseLayer = useRef<L.TileLayer | null>(null);
  const centered = useRef(false);
  const [base, setBase] = useState<BaseKey>(() => getPref<BaseKey>('mapBase', 'karte'));
  const [tool, setTool] = useState<Tool>('none');
  const [measure, setMeasure] = useState<LatLng[]>([]);
  const [pending, setPending] = useState<{ pos: LatLng; kind: 'circle' | 'pin' } | null>(null);
  const [showHints, setShowHints] = useState(true);
  const [stations, setStations] = useState<Station[]>([]);
  const [showZones, setShowZones] = useState(true);
  const [loadingStations, setLoadingStations] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sharePref, setSharePref] = useState(() => getPref('shareLocation', true));

  useEffect(() => {
    const onPref = () => setSharePref(getPref('shareLocation', true));
    window.addEventListener('hs-pref', onPref);
    return () => window.removeEventListener('hs-pref', onPref);
  }, []);

  const onClick = useRef<(p: LatLng) => void>(() => {});
  onClick.current = (p: LatLng) => {
    if (tool === 'measure') setMeasure((m) => [...m, p]);
    else if (tool === 'circle' || tool === 'pin') setPending({ pos: p, kind: tool });
  };

  // Karte einmalig erstellen
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false }).setView([46.82, 8.23], 8);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(m);
    const g = {} as Record<GroupKey, L.LayerGroup>;
    for (const k of ['hints', 'stations', 'markers', 'players', 'measure', 'me'] as GroupKey[]) g[k] = L.layerGroup().addTo(m);
    groups.current = g;
    m.on('click', (e: L.LeafletMouseEvent) => onClick.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      groups.current = null;
      baseLayer.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    baseLayer.current?.remove();
    const b = BASE_LAYERS[base];
    baseLayer.current = L.tileLayer(b.url, { attribution: b.attribution, maxNativeZoom: b.maxNativeZoom, maxZoom: 20 }).addTo(m);
    baseLayer.current.bringToBack();
    setPref('mapBase', base);
  }, [base]);

  useEffect(() => {
    if (!visible || !map.current) return;
    const id = window.setTimeout(() => {
      map.current?.invalidateSize();
      if (!centered.current && geo.pos) {
        centered.current = true;
        map.current?.setView([geo.pos.lat, geo.pos.lng], 13);
      }
    }, 60);
    return () => window.clearTimeout(id);
  }, [visible, geo.pos]);

  // Hider: Ort beim Start des Endspiels merken – nur auf diesem Gerät, wird nicht geteilt
  const spotKey = round?.endgameAt != null && role === 'hider' ? `spot:${round.id}:${round.endgameAt}` : null;
  const [spot, setSpot] = useState<LatLng | null>(null);
  useEffect(() => {
    if (!spotKey) {
      setSpot(null);
      return;
    }
    const saved = getPref<LatLng | null>(spotKey, null);
    if (saved) setSpot(saved);
    else if (geo.pos) {
      const here = { lat: geo.pos.lat, lng: geo.pos.lng };
      setPref(spotKey, here);
      setSpot(here);
    }
  }, [spotKey, geo.pos]);

  // Eigener Standort
  useEffect(() => {
    const g = groups.current?.me;
    if (!g) return;
    g.clearLayers();
    if (spot) {
      const icon = L.divIcon({ className: '', html: '<div class="pin">⭐</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker([spot.lat, spot.lng], { icon }).bindTooltip('Euer Hiding Spot (Endspiel)', { direction: 'top' }).addTo(g);
    }
    if (!geo.pos) return;
    L.circle([geo.pos.lat, geo.pos.lng], { radius: geo.pos.accuracy, color: '#3e63dd', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(g);
    L.circleMarker([geo.pos.lat, geo.pos.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#3e63dd', fillOpacity: 1 })
      .bindTooltip('Du')
      .addTo(g);
  }, [geo.pos, spot]);

  // Andere Spieler (Hider werden nie angezeigt)
  const hiderTeam = round?.hiderTeamId;
  const visiblePlayers = Object.values(api.locations)
    .filter((l) => l.playerId !== me)
    .map((l) => ({ loc: l, player: state.players[l.playerId] }))
    .filter((x) => x.player && x.player.teamId !== hiderTeam);

  const playersKey = visiblePlayers.map(({ loc }) => `${loc.playerId}:${loc.lat}:${loc.lng}:${loc.updatedAt}`).join('|');
  const ageTick = Math.floor(t / 30000);
  useEffect(() => {
    const g = groups.current?.players;
    if (!g) return;
    g.clearLayers();
    for (const { loc, player } of visiblePlayers) {
      const team = state.teams.find((x) => x.id === player!.teamId);
      const stale = t - loc.updatedAt > 5 * 60000;
      const icon = L.divIcon({
        className: '',
        html: `<div class="pmark${stale ? ' stale' : ''}" style="--c:${team?.color ?? '#666'}">${escapeHtml(initials(player!.name))}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      L.marker([loc.lat, loc.lng], { icon })
        .bindTooltip(`${escapeHtml(player!.name)} · ${fmtAgo(loc.updatedAt, t)}`, { direction: 'top', offset: [0, -14] })
        .addTo(g);
    }
  }, [playersKey, ageTick, state.teams]);

  // Hinweise aus beantworteten Fragen
  const answered = roundQuestions(state, round?.id).filter((q) => q.answer != null);
  const hintKey = answered.map((q) => q.id).join(',');
  useEffect(() => {
    const g = groups.current?.hints;
    if (!g) return;
    g.clearLayers();
    if (!showHints) return;
    for (const q of answered) drawQuestionHint(g, q);
  }, [hintKey, showHints]);

  // Eigene Markierungen (nur fürs eigene Team sichtbar)
  const myMarkers = state.markers.filter((mk) => mk.teamId === (myTeam?.id ?? null));
  const removeMarker = useCallback(
    (mk: MapMarker) => {
      if (confirm(`Markierung „${mk.label || 'ohne Namen'}“ löschen?`)) void run(() => api.dispatch('marker_removed', { id: mk.id }));
    },
    [api, run],
  );
  useEffect(() => {
    const g = groups.current?.markers;
    if (!g) return;
    g.clearLayers();
    for (const mk of myMarkers) {
      const color = myTeam?.color ?? '#3e63dd';
      const popup = document.createElement('div');
      popup.className = 'popup';
      const title = document.createElement('strong');
      title.textContent = mk.label || (mk.kind === 'circle' ? `Kreis ${radarLabel(mk.radius ?? 0)}` : 'Markierung');
      const del = document.createElement('button');
      del.className = 'btn small danger';
      del.textContent = 'Löschen';
      del.onclick = () => removeMarker(mk);
      popup.append(title, document.createElement('br'), del);
      if (mk.kind === 'circle' && mk.radius) {
        if (mk.inside === true) L.polygon([OUTER, circleRing(mk, mk.radius)], { ...SHADE, fillColor: color }).addTo(g);
        if (mk.inside === false) L.circle([mk.lat, mk.lng], { ...SHADE, fillColor: color, radius: mk.radius }).addTo(g);
        L.circle([mk.lat, mk.lng], { radius: mk.radius, color, weight: 2, fillOpacity: mk.inside == null ? 0.08 : 0 })
          .bindPopup(popup)
          .addTo(g);
      } else {
        const icon = L.divIcon({ className: '', html: '<div class="pin">📍</div>', iconSize: [28, 28], iconAnchor: [14, 26] });
        L.marker([mk.lat, mk.lng], { icon })
          .bindTooltip(escapeHtml(mk.label), { permanent: !!mk.label, direction: 'top', offset: [0, -22] })
          .bindPopup(popup)
          .addTo(g);
      }
    }
  }, [myMarkers.map((m) => m.id).join(','), myTeam?.color, removeMarker]);

  // Bahnhöfe mit 1-km-Zone
  useEffect(() => {
    const g = groups.current?.stations;
    if (!g) return;
    g.clearLayers();
    for (const s of stations) {
      if (showZones) L.circle([s.pos.lat, s.pos.lng], { radius: 1000, color: '#0b7a75', weight: 1, fillOpacity: 0.06, interactive: false }).addTo(g);
      L.circleMarker([s.pos.lat, s.pos.lng], { radius: 5, color: '#0b7a75', weight: 2, fillColor: '#fff', fillOpacity: 1 })
        .bindTooltip(`🚉 ${escapeHtml(s.name)}`)
        .addTo(g);
    }
  }, [stations, showZones]);

  // Messen
  useEffect(() => {
    const g = groups.current?.measure;
    if (!g) return;
    g.clearLayers();
    if (!measure.length) return;
    L.polyline(
      measure.map((p) => [p.lat, p.lng] as L.LatLngTuple),
      { color: '#111', weight: 3, dashArray: '4 6' },
    ).addTo(g);
    for (const p of measure) L.circleMarker([p.lat, p.lng], { radius: 4, color: '#111', fillColor: '#fff', fillOpacity: 1 }).addTo(g);
  }, [measure]);

  const measured = measure.reduce((sum, p, i) => (i ? sum + distance(measure[i - 1], p) : 0), 0);

  const loadStations = async () => {
    const m = map.current;
    if (!m) return;
    if (m.getZoom() < 11) {
      toast('Bitte näher heranzoomen (Region/Stadt), dann Bahnhöfe laden.');
      return;
    }
    setLoadingStations(true);
    const b = m.getBounds();
    try {
      const found = await fetchStations({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
      setStations((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s]));
        for (const s of found) byId.set(s.id, s);
        return [...byId.values()];
      });
      toast(`${found.length} Bahnhöfe geladen`, 'ok');
    } catch (err) {
      toast(`${err instanceof Error ? err.message : 'Bahnhöfe konnten nicht geladen werden.'} Bitte gleich nochmals versuchen.`, 'error');
    } finally {
      setLoadingStations(false);
    }
  };

  const centerMe = () => {
    if (geo.pos) map.current?.setView([geo.pos.lat, geo.pos.lng], Math.max(map.current.getZoom(), 14));
    else toast(geo.error ?? 'Noch kein Standort');
  };

  const pickTool = (next: Tool) => {
    setTool((cur) => (cur === next ? 'none' : next));
    if (next !== 'measure') setMeasure([]);
    setToolsOpen(false);
  };

  // Curse 16 „Analog“: keine mobilen Karten-Hilfsmittel für die verfluchten Seeker
  const analogUntil =
    role === 'seeker' && round
      ? state.curses
          .filter((c) => c.roundId === round.id && c.number === 16 && c.status !== 'skipped')
          .filter((c) => c.targetTeamId == null || c.targetTeamId === myTeam?.id)
          .map((c) => curseAutoEnd(state, c) ?? 0)
          .find((end) => end > t)
      : undefined;

  let shareText: string;
  if (role === 'hider') shareText = '🫣 Ihr seid Hider – euer Standort wird nicht geteilt.';
  else if (!sharePref) shareText = '🔕 Standort-Teilen ist aus (Mehr → Einstellungen).';
  else if (geo.error) shareText = `⚠️ ${geo.error}`;
  else if (!geo.pos) shareText = '📡 Warte auf GPS …';
  else shareText = `📡 Dein Standort wird geteilt${api.locations[me] ? ` · ${fmtAgo(api.locations[me].updatedAt, t)}` : ''}`;

  return (
    <div className={`map-tab ${visible ? '' : 'hidden'}`}>
      <div ref={el} className={`map ${tool !== 'none' ? 'crosshair' : ''}`} />
      {analogUntil != null && (
        <div className="map-lock">
          <div className="map-lock-box">
            <div className="hero-icon">📵</div>
            <h2>Curse 16: Analog</h2>
            <p>Keine mobilen Hilfsmittel – auch nicht diese Karte.</p>
            <p>
              Wieder frei um {fmtClock(analogUntil)} (noch <Countdown to={analogUntil} />)
            </p>
          </div>
        </div>
      )}

      <div className="map-top">
        <div className="seg small">
          {(Object.keys(BASE_LAYERS) as BaseKey[]).map((k) => (
            <button key={k} className={base === k ? 'on' : ''} onClick={() => setBase(k)}>
              {BASE_LAYERS[k].label}
            </button>
          ))}
        </div>
        <div className="map-buttons">
          <button className="fab" onClick={centerMe} aria-label="Zu meinem Standort">
            🎯
          </button>
          <button className={`fab ${toolsOpen || tool !== 'none' ? 'on' : ''}`} onClick={() => setToolsOpen(!toolsOpen)} aria-label="Werkzeuge">
            🛠️
          </button>
        </div>
      </div>

      {toolsOpen && (
        <div className="map-menu">
          <button className={tool === 'measure' ? 'on' : ''} onClick={() => pickTool('measure')}>
            📏 Distanz messen
          </button>
          <button className={tool === 'circle' ? 'on' : ''} onClick={() => pickTool('circle')}>
            ⭕ Kreis zeichnen
          </button>
          <button className={tool === 'pin' ? 'on' : ''} onClick={() => pickTool('pin')}>
            📍 Markierung setzen
          </button>
          <button
            onClick={() => {
              setToolsOpen(false);
              void loadStations();
            }}
            disabled={loadingStations}
          >
            🚉 {loadingStations ? 'Lade Bahnhöfe …' : 'Bahnhöfe im Ausschnitt laden'}
          </button>
          {stations.length > 0 && (
            <>
              <button onClick={() => setShowZones(!showZones)}>{showZones ? '◯ 1-km-Zonen ausblenden' : '◯ 1-km-Zonen einblenden'}</button>
              <button onClick={() => setStations([])}>🚉 Bahnhöfe entfernen</button>
            </>
          )}
          <button onClick={() => setShowHints(!showHints)}>{showHints ? '🟥 Ausschlussgebiete ausblenden' : '🟥 Ausschlussgebiete einblenden'}</button>
        </div>
      )}

      <div className="map-bottom">
        {tool === 'measure' && (
          <div className="map-panel">
            <strong>📏 {measure.length < 2 ? 'Tippe Punkte auf der Karte an' : fmtDistance(measured)}</strong>
            <div className="row">
              {geo.pos && (
                <button className="btn small" onClick={() => setMeasure([{ lat: geo.pos!.lat, lng: geo.pos!.lng }])}>
                  Ab mir
                </button>
              )}
              <button className="btn small" onClick={() => setMeasure([])}>
                Zurücksetzen
              </button>
              <button className="btn small ghost" onClick={() => pickTool('measure')}>
                Fertig
              </button>
            </div>
          </div>
        )}
        {(tool === 'circle' || tool === 'pin') && (
          <div className="map-panel">
            <strong>{tool === 'circle' ? '⭕ Tippe auf den Mittelpunkt' : '📍 Tippe auf die Stelle'}</strong>
            <span className="muted small">Nur für dein Team sichtbar.</span>
            <button className="btn small ghost" onClick={() => setTool('none')}>
              Abbrechen
            </button>
          </div>
        )}
        <div className="map-status">
          <span>{shareText}</span>
          {visiblePlayers.length > 0 && (
            <div className="wrap">
              {visiblePlayers.map(({ loc, player }) => (
                <button key={loc.playerId} className="pill" onClick={() => map.current?.setView([loc.lat, loc.lng], Math.max(map.current.getZoom(), 14))}>
                  {player!.name} · {fmtAgo(loc.updatedAt, t)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {pending && (
        <MarkerDialog
          kind={pending.kind}
          onClose={() => setPending(null)}
          onSave={async (data) => {
            const ok = await run(() =>
              api.dispatch('marker_added', { id: uid(), kind: pending.kind, lat: pending.pos.lat, lng: pending.pos.lng, teamId: myTeam?.id ?? null, ...data }),
            );
            if (ok) {
              setPending(null);
              setTool('none');
            }
          }}
        />
      )}
    </div>
  );
}

function MarkerDialog({
  kind,
  onClose,
  onSave,
}: {
  kind: 'circle' | 'pin';
  onClose: () => void;
  onSave: (data: { label: string; radius?: number; inside?: boolean | null }) => void;
}) {
  const [label, setLabel] = useState('');
  const [radius, setRadius] = useState(1000);
  const [custom, setCustom] = useState('');
  const [inside, setInside] = useState<boolean | null>(null);
  const r = custom ? Math.round(Number(custom)) : radius;
  return (
    <Modal open onClose={onClose} title={kind === 'circle' ? 'Kreis zeichnen' : 'Markierung setzen'}>
      <label className="field">
        <span>Beschriftung</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === 'circle' ? 'z.B. Radar 5 km' : 'z.B. Kirche gesehen'} autoFocus />
      </label>
      {kind === 'circle' && (
        <>
          <div className="field">
            <span>Radius</span>
            <div className="wrap">
              {RADAR_DISTANCES.map((d) => (
                <button
                  key={d}
                  className={`pill ${!custom && radius === d ? 'on' : ''}`}
                  onClick={() => {
                    setRadius(d);
                    setCustom('');
                  }}
                >
                  {radarLabel(d)}
                </button>
              ))}
            </div>
            <input type="number" inputMode="numeric" placeholder="Eigener Radius in Metern" value={custom} onChange={(e) => setCustom(e.target.value)} />
          </div>
          <div className="field">
            <span>Bedeutung</span>
            <div className="seg">
              <button className={inside === null ? 'on' : ''} onClick={() => setInside(null)}>
                Nur Kreis
              </button>
              <button className={inside === true ? 'on' : ''} onClick={() => setInside(true)}>
                Hider drin
              </button>
              <button className={inside === false ? 'on' : ''} onClick={() => setInside(false)}>
                Hider nicht drin
              </button>
            </div>
          </div>
        </>
      )}
      <button
        className="btn primary block"
        disabled={kind === 'circle' && !(r > 0)}
        onClick={() => onSave(kind === 'circle' ? { label: label.trim(), radius: r, inside } : { label: label.trim() })}
      >
        Speichern
      </button>
    </Modal>
  );
}
