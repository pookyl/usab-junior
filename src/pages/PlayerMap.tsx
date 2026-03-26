import { useEffect, useState, useMemo } from 'react';
import { MapPin, RefreshCw, ExternalLink } from 'lucide-react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import type { TswTournament } from '../types/junior';
import { fetchPlayerTswStats, geocodeLocations, tswSearchUrl } from '../services/rankingsService';
import { usePlayers } from '../contexts/PlayersContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePlayerProfile } from '../components/player/PlayerProfileLayout';

interface GeocodedVenue {
  lat: number;
  lng: number;
  location: string;
  tournaments: {
    name: string;
    url: string;
    dates: string;
    wins: number;
    losses: number;
  }[];
}

function createPinIcon(count: number, delayMs: number): L.DivIcon {
  const badge = count > 1
    ? `<span style="position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;border-radius:9px;background:#7c3aed;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)">${count}</span>`
    : '';
  return L.divIcon({
    className: '',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -32],
    html: `<div class="marker-pin-drop" style="animation-delay:${delayMs}ms;position:relative;width:28px;height:36px">
      <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#7c3aed"/>
        <circle cx="14" cy="13" r="5.5" fill="#fff"/>
      </svg>
      ${badge}
    </div>`,
  });
}

function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const markers = cluster.getAllChildMarkers();
  const total = markers.reduce(
    (sum, m) => sum + ((m.options as { tournamentCount?: number }).tournamentCount ?? 1),
    0,
  );
  const size = total < 5 ? 36 : total < 15 ? 42 : 48;
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;
      background:rgba(124,58,237,0.85);
      border:3px solid rgba(255,255,255,0.9);
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:700;font-size:${total < 5 ? 13 : 14}px;
      box-shadow:0 2px 8px rgba(124,58,237,0.4);
    ">${total}</div>`,
    className: '',
    iconSize: L.point(size, size),
    iconAnchor: [size / 2, size / 2],
  });
}

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const US_CENTER: L.LatLngExpression = [39.5, -98.35];

function FitBoundsOnReady({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, animate: false });
    });
    return () => cancelAnimationFrame(raf);
  }, [map, bounds]);
  return null;
}

function ThemeTileLayer({ isDark }: { isDark: boolean }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    container.style.background = isDark ? '#1e293b' : '#f1f5f9';
    const tilePane = container.querySelector('.leaflet-tile-pane') as HTMLElement | null;
    if (tilePane) {
      tilePane.style.filter = isDark
        ? 'brightness(0.65) invert(1) contrast(1.2) hue-rotate(200deg) saturate(0.3) brightness(0.8)'
        : '';
    }
  }, [isDark, map]);

  return <TileLayer attribution={TILE_ATTR} url={TILE_URL} />;
}


interface GroupedResult {
  grouped: Map<string, { name: string; url: string; dates: string; wins: number; losses: number }[]>;
  tswIds: Record<string, string>;
}

function groupTournamentsByLocation(
  tournamentsByYear: Record<string, TswTournament[]>,
): GroupedResult {
  const grouped = new Map<string, { name: string; url: string; dates: string; wins: number; losses: number }[]>();
  const tswIds: Record<string, string> = {};
  for (const tournaments of Object.values(tournamentsByYear)) {
    for (const t of tournaments) {
      if (!t.location) continue;
      const key = t.location.trim();
      if (!grouped.has(key)) grouped.set(key, []);
      if (t.tswId && !tswIds[key]) tswIds[key] = t.tswId;
      const wins = t.events.reduce((s, e) => s + e.wins, 0);
      const losses = t.events.reduce((s, e) => s + e.losses, 0);
      const existing = grouped.get(key)!;
      if (!existing.some((e) => e.name === t.name && e.dates === t.dates)) {
        existing.push({ name: t.name, url: t.url, dates: t.dates, wins, losses });
      }
    }
  }
  return { grouped, tswIds };
}

export default function PlayerMap() {
  const { usabId, displayName } = usePlayerProfile();
  const { loading: loadingAllPlayers, directoryLoading } = usePlayers();
  const { resolved: theme } = useTheme();
  const isDark = theme === 'dark';

  const [venues, setVenues] = useState<GeocodedVenue[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!usabId || !displayName) {
      if (!loadingAllPlayers && !directoryLoading) setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);

    fetchPlayerTswStats(usabId, displayName)
      .then((stats) => {
        if (cancelled) return;
        const { grouped, tswIds } = groupTournamentsByLocation(stats.tournamentsByYear ?? {});
        if (grouped.size === 0) {
          setVenues([]);
          setBusy(false);
          return;
        }
        return geocodeLocations([...grouped.keys()], tswIds).then((coords) => {
          if (cancelled) return;
          const result: GeocodedVenue[] = [];
          for (const [loc, tournaments] of grouped) {
            const c = coords[loc];
            if (c) result.push({ lat: c.lat, lng: c.lng, location: loc, tournaments });
          }
          setVenues(result);
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load map data');
      })
      .finally(() => { if (!cancelled) setBusy(false); });

    return () => { cancelled = true; };
  }, [usabId, displayName, loadingAllPlayers, directoryLoading]);

  const totalTournaments = venues.reduce((s, v) => s + v.tournaments.length, 0);

  const initialBounds = useMemo(() => {
    if (venues.length === 0) return undefined;
    return L.latLngBounds(venues.map((v) => [v.lat, v.lng]));
  }, [venues]);

  if (busy) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
        <div className="py-8 md:py-10 text-center">
          <RefreshCw className="w-7 h-7 text-slate-300 dark:text-slate-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-400 dark:text-slate-500 text-sm">Loading tournament map…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
        <div className="py-6 md:py-8 text-center space-y-3">
          <MapPin className="w-8 md:w-10 h-8 md:h-10 text-slate-200 dark:text-slate-600 mx-auto" />
          <p className="text-slate-400 dark:text-slate-500 text-sm">{error}</p>
          <a
            href={tswSearchUrl(displayName)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm hover:bg-orange-600 transition-colors"
          >
            Search on TournamentSoftware <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  if (venues.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
        <div className="py-6 md:py-8 text-center space-y-3">
          <MapPin className="w-8 md:w-10 h-8 md:h-10 text-slate-200 dark:text-slate-600 mx-auto" />
          <p className="text-slate-400 dark:text-slate-500 text-sm">
            No tournament locations available to display on the map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 md:w-5 md:h-5 text-violet-500" />
            <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100">Tournament Map</h2>
          </div>
          <span className="text-xs md:text-sm text-slate-400 dark:text-slate-500">
            {totalTournaments} {totalTournaments === 1 ? 'tournament' : 'tournaments'} at {venues.length} {venues.length === 1 ? 'venue' : 'venues'}
          </span>
        </div>

        <div className="h-[400px] md:h-[520px] relative rounded-b-2xl overflow-hidden">
          <MapContainer
            center={US_CENTER}
            zoom={4}
            className="h-full w-full z-0"
            scrollWheelZoom
            style={{ background: isDark ? '#1e293b' : '#f1f5f9' }}
          >
            {initialBounds && <FitBoundsOnReady bounds={initialBounds} />}
            <ThemeTileLayer isDark={isDark} />
            <MarkerClusterGroup
              iconCreateFunction={createClusterIcon}
              maxClusterRadius={50}
              spiderfyOnMaxZoom
              showCoverageOnHover={false}
              zoomToBoundsOnClick
              animate={false}
              animateAddingMarkers={false}
            >
              {venues.map((venue, i) => (
                <Marker
                  key={`${venue.lat}-${venue.lng}-${i}`}
                  position={[venue.lat, venue.lng]}
                  icon={createPinIcon(venue.tournaments.length, i * 150)}
                  {...{ tournamentCount: venue.tournaments.length } as unknown as L.MarkerOptions}
                >
                  <Popup
                    maxWidth={280}
                    minWidth={200}
                    maxHeight={220}
                    autoPanPadding={[50, 50] as L.PointExpression}
                    keepInView
                    closeButton
                  >
                    <div className="text-sm">
                      <p className="font-semibold text-slate-700 mb-1 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                        {venue.location}
                      </p>
                      <div className="space-y-2 mt-2">
                        {venue.tournaments.map((t, ti) => (
                          <div key={ti} className="border-t border-slate-100 pt-1.5 first:border-0 first:pt-0">
                            {t.url ? (
                              <a
                                href={t.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-violet-600 hover:text-violet-800 hover:underline"
                              >
                                {t.name}
                              </a>
                            ) : (
                              <p className="text-xs font-medium text-slate-700">{t.name}</p>
                            )}
                            <p className="text-[11px] text-slate-400 mt-0.5">{t.dates}</p>
                            <p className="text-[11px] mt-0.5">
                              <span className="font-semibold text-emerald-600">{t.wins}W</span>
                              <span className="text-slate-300 mx-0.5">-</span>
                              <span className="font-semibold text-rose-500">{t.losses}L</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
