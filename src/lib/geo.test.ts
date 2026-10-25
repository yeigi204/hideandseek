import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (url: string) => { status: number; body?: unknown };

function mockFetch(handler: Handler) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(new URL(url).host);
      const { status, body } = handler(url);
      return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
    }),
  );
  return calls;
}

const zuerich = { lat: 47.3779, lng: 8.5403 };
const osmStation = { elements: [{ id: 1, lat: 47.3782, lon: 8.5402, tags: { name: 'Zürich HB' } }] };

describe('Bahnhof-Suche', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('weicht bei 502 auf den nächsten Overpass-Server aus und merkt sich ihn', async () => {
    const geo = await import('./geo');
    const calls = mockFetch((url) => (url.includes('overpass-api.de') ? { status: 502 } : { status: 200, body: osmStation }));
    const first = await geo.nearestStation(zuerich);
    expect(first).toMatchObject({ name: 'Zürich HB', source: 'osm' });
    expect(calls).toEqual(['overpass-api.de', 'overpass.private.coffee']);
    await geo.fetchStations({ south: 46, west: 7, north: 46.1, east: 7.1 });
    expect(calls[2]).toBe('overpass.private.coffee');
  });

  it('wertet eine Overpass-Fehlermeldung mit leerer Liste als Fehler', async () => {
    const geo = await import('./geo');
    const calls = mockFetch((url) =>
      url.includes('overpass-api.de') ? { status: 200, body: { elements: [], remark: 'runtime error: Query timed out' } } : { status: 200, body: osmStation },
    );
    expect(await geo.nearestStation(zuerich)).toMatchObject({ name: 'Zürich HB' });
    expect(calls.length).toBe(2);
  });

  it('nimmt den SBB-Fahrplan als Ersatz, wenn alle Overpass-Server ausfallen', async () => {
    const geo = await import('./geo');
    mockFetch((url) =>
      url.includes('transport.opendata.ch')
        ? {
            status: 200,
            body: {
              stations: [
                { name: 'Zürich, Bahnhofquai/HB', icon: 'tram', coordinate: { x: 47.3776, y: 8.5409 } },
                { name: 'Zürich HB', icon: 'train', coordinate: { x: 47.378177, y: 8.540192 } },
              ],
            },
          }
        : { status: 504 },
    );
    const res = await geo.nearestStation(zuerich);
    expect(res).toMatchObject({ name: 'Zürich HB', source: 'timetable' });
    expect(res!.dist).toBeLessThan(100);
  });

  it('meldet einen verständlichen Fehler, wenn nichts erreichbar ist', async () => {
    const geo = await import('./geo');
    mockFetch(() => ({ status: 502 }));
    const err = await geo.nearestStation(zuerich).catch((e) => e);
    expect(err).toBeInstanceOf(geo.StationLookupError);
    expect(err.message).toMatch(/überlastet/);
    expect(err.failures).toHaveLength(geo.OVERPASS_ENDPOINTS.length + 1);
  });
});
