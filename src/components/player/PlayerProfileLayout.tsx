import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, NavLink, Outlet, useOutletContext } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Trophy,
  Medal,
  Calendar,
  QrCode,
  X,
  Share2,
  Link2,
  Check,
  LayoutDashboard,
  MapPin,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import type { AgeGroup, PlayerEntry } from '../../types/junior';
import { AGE_GROUPS, EVENT_TYPES } from '../../types/junior';
import { fetchPlayerDetail } from '../../services/rankingsService';
import { usePlayers } from '../../contexts/PlayersContext';
import { AGE_GRADIENT, AGE_PILL_HEX } from '../../utils/playerStyles';

export interface PlayerProfileContext {
  usabId: string;
  displayName: string;
  isRanked: boolean;
  entries: PlayerEntry[];
  sortedEntries: PlayerEntry[];
  ageGroupSet: AgeGroup[];
  gender: string | null;
  rankingsDate: string;
  scrollToTabs: () => void;
}

export function usePlayerProfile(): PlayerProfileContext {
  return useOutletContext<PlayerProfileContext>();
}

const CARD_THEMES = [
  { name: 'Galaxy', gradient: 'from-violet-600 via-indigo-600 to-blue-600', avatar: 'from-violet-400 to-blue-500', qrColor: '#4338ca', stops: ['#7c3aed', '#4f46e5', '#2563eb'], avatarHex: ['#a78bfa', '#3b82f6'] },
  { name: 'Sunset', gradient: 'from-orange-500 via-rose-500 to-pink-600', avatar: 'from-orange-400 to-pink-500', qrColor: '#be123c', stops: ['#f97316', '#f43f5e', '#db2777'], avatarHex: ['#fb923c', '#ec4899'] },
  { name: 'Ocean', gradient: 'from-cyan-500 via-blue-500 to-indigo-600', avatar: 'from-cyan-400 to-indigo-500', qrColor: '#1d4ed8', stops: ['#06b6d4', '#3b82f6', '#4f46e5'], avatarHex: ['#22d3ee', '#6366f1'] },
  { name: 'Forest', gradient: 'from-emerald-500 via-green-600 to-teal-700', avatar: 'from-emerald-400 to-teal-500', qrColor: '#047857', stops: ['#10b981', '#16a34a', '#0f766e'], avatarHex: ['#34d399', '#14b8a6'] },
  { name: 'Flame', gradient: 'from-red-500 via-orange-500 to-amber-500', avatar: 'from-red-400 to-amber-400', qrColor: '#c2410c', stops: ['#ef4444', '#f97316', '#f59e0b'], avatarHex: ['#f87171', '#fbbf24'] },
  { name: 'Storm', gradient: 'from-slate-600 via-slate-700 to-slate-900', avatar: 'from-slate-400 to-slate-600', qrColor: '#1e293b', stops: ['#475569', '#334155', '#0f172a'], avatarHex: ['#94a3b8', '#475569'] },
];

function canvasRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawShareCard(
  opts: { name: string; usabId: string; ageGroups: AgeGroup[]; isRanked: boolean; theme: typeof CARD_THEMES[number]; qrCanvas: HTMLCanvasElement | null },
): HTMLCanvasElement {
  const { name, usabId, ageGroups, isRanked, theme, qrCanvas } = opts;
  const DPR = Math.max(window.devicePixelRatio, 3);
  const W = 320;
  const PAD = 32;
  const AVATAR = 64;
  const QR = 160;
  const QR_PAD = 16;
  const QR_BOX = QR + QR_PAD * 2;
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const MONO = '"SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

  let H = PAD + AVATAR + 12 + 24 + 10 + 20 + 20 + QR_BOX + 16 + 16 + 4 + 14 + PAD;
  if (!isRanked || ageGroups.length === 0) H += 0;

  const c = document.createElement('canvas');
  c.width = W * DPR;
  c.height = H * DPR;
  const ctx = c.getContext('2d')!;
  ctx.scale(DPR, DPR);

  ctx.save();
  canvasRoundRect(ctx, 0, 0, W, H, 24);
  ctx.clip();

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, theme.stops[0]);
  bg.addColorStop(0.5, theme.stops[1]);
  bg.addColorStop(1, theme.stops[2]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const g1 = ctx.createRadialGradient(W * 0.85, H * 0.05, 0, W * 0.85, H * 0.05, 140);
  g1.addColorStop(0, 'rgba(255,255,255,0.12)');
  g1.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(W * 0.15, H * 0.95, 0, W * 0.15, H * 0.95, 100);
  g2.addColorStop(0, 'rgba(255,255,255,0.06)');
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  let y = PAD;
  ctx.textAlign = 'center';

  const ax = (W - AVATAR) / 2;
  const av = ctx.createLinearGradient(ax, y, ax + AVATAR, y + AVATAR);
  av.addColorStop(0, theme.avatarHex[0]);
  av.addColorStop(1, theme.avatarHex[1]);
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  canvasRoundRect(ctx, ax, y, AVATAR, AVATAR, 16);
  ctx.fillStyle = av;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  ctx.fillStyle = '#fff';
  ctx.font = `900 22px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, W / 2, y + AVATAR / 2);
  y += AVATAR + 12;

  ctx.fillStyle = '#fff';
  ctx.font = `700 20px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(name, W / 2, y, W - PAD * 2);
  y += 24 + 10;

  ctx.font = `700 10px ${FONT}`;
  ctx.textBaseline = 'middle';
  if (isRanked && ageGroups.length > 0) {
    const pillH = 18;
    const gap = 6;
    const widths = ageGroups.map((ag) => ctx.measureText(ag).width + 20);
    const total = widths.reduce((a, b) => a + b, 0) + (ageGroups.length - 1) * gap;
    let px = (W - total) / 2;
    for (let i = 0; i < ageGroups.length; i++) {
      canvasRoundRect(ctx, px, y, widths[i], pillH, 9);
      ctx.fillStyle = AGE_PILL_HEX[ageGroups[i]];
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 10px ${FONT}`;
      ctx.fillText(ageGroups[i], px + widths[i] / 2, y + pillH / 2);
      px += widths[i] + gap;
    }
  } else {
    const pillH = 18;
    const pw = ctx.measureText('Player').width + 20;
    canvasRoundRect(ctx, (W - pw) / 2, y, pw, pillH, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Player', W / 2, y + pillH / 2);
  }
  y += 20 + 20;

  const qx = (W - QR_BOX) / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  canvasRoundRect(ctx, qx, y, QR_BOX, QR_BOX, 16);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (qrCanvas) {
    ctx.drawImage(qrCanvas, qx + QR_PAD, y + QR_PAD, QR, QR);
  }
  y += QR_BOX + 16;

  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `400 12px ${FONT}`;
  ctx.fillText('Scan to view profile', W / 2, y);
  y += 16 + 4;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `400 10px ${MONO}`;
  ctx.fillText(`USAB #${usabId}`, W / 2, y);

  ctx.restore();
  return c;
}

function QrCardModal({
  name,
  usabId,
  ageGroups,
  isRanked,
  onClose,
}: {
  name: string;
  usabId: string;
  ageGroups: AgeGroup[];
  isRanked: boolean;
  onClose: () => void;
}) {
  const [themeIdx, setThemeIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const theme = CARD_THEMES[themeIdx];
  const profileUrl = `${window.location.origin}/directory/${usabId}`;
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const canShare = typeof navigator.share === 'function';

  const handleShare = useCallback(async () => {
    const qrCanvas = qrRef.current?.querySelector('canvas') ?? null;
    const card = drawShareCard({ name, usabId, ageGroups, isRanked, theme, qrCanvas });
    try {
      const blob = await new Promise<Blob | null>((res) => card.toBlob(res, 'image/png'));
      if (!blob) return;
      const file = new File([blob], `${name.replace(/\s+/g, '-')}-qr.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${name} – Player Profile`, url: profileUrl });
      } else {
        await navigator.share({ title: `${name} – Player Profile`, url: profileUrl });
      }
    } catch { /* user cancelled or unsupported */ }
  }, [name, usabId, ageGroups, isRanked, theme, profileUrl]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [profileUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative flex flex-col items-center gap-4 animate-scale-in motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <div
            className={`w-72 md:w-80 rounded-3xl bg-gradient-to-br ${theme.gradient} p-6 md:p-8 flex flex-col items-center text-center overflow-hidden relative`}
          >
            <div
              className="absolute top-0 right-0 w-64 h-64 -translate-y-1/3 translate-x-1/4 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)' }}
            />
            <div
              className="absolute bottom-0 left-0 w-48 h-48 translate-y-1/4 -translate-x-1/4 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }}
            />

            <div className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${theme.avatar} flex items-center justify-center text-xl font-black text-white shadow-lg mb-3`}>
              {initials}
            </div>

            <h3 className="relative text-lg md:text-xl font-bold text-white mb-2">{name}</h3>

            <div className="relative flex flex-wrap justify-center gap-1.5 mb-5">
              {isRanked && ageGroups.length > 0 ? ageGroups.map((ag) => (
                <span key={ag} className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r ${AGE_GRADIENT[ag]} text-white shadow-sm`}>
                  {ag}
                </span>
              )) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white/80">
                  Player
                </span>
              )}
            </div>

            <div ref={qrRef} className="relative bg-white rounded-2xl p-4 shadow-lg mb-4">
              <QRCodeCanvas value={profileUrl} size={160} level="M" fgColor={theme.qrColor} />
            </div>

            <p className="relative text-xs text-white/70 mb-1">Scan to view profile</p>
            <p className="relative text-[10px] font-mono text-white/50">USAB #{usabId}</p>
          </div>

          <button
            onClick={onClose}
            className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80 hover:text-white transition-colors backdrop-blur-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {CARD_THEMES.map((t, i) => (
            <button
              key={t.name}
              onClick={() => setThemeIdx(i)}
              title={t.name}
              className={`w-7 h-7 rounded-full bg-gradient-to-br ${t.gradient} transition-all ${
                i === themeIdx ? 'ring-2 ring-white ring-offset-2 ring-offset-black/50 scale-110' : 'opacity-70 hover:opacity-100'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {canShare && (
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors backdrop-blur-sm"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors backdrop-blur-sm"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
}

const TAB_ITEMS = [
  { label: 'Overview', icon: LayoutDashboard, to: '' },
  { label: 'Rankings', icon: Trophy, to: 'rankings', requiresRank: true },
  { label: 'Tournaments', icon: Calendar, to: 'tournaments' },
  { label: 'Medals', icon: Medal, to: 'medals' },
  { label: 'Map', icon: MapPin, to: 'map' },
];

export default function PlayerProfileLayout() {
  const { id: usabId } = useParams<{ id: string }>();
  const {
    players: allPlayers,
    directoryPlayers,
    directoryLoading,
    loading: loadingAllPlayers,
    rankingsDate,
    ensurePlayers,
    ensureDirectoryPlayers,
  } = usePlayers();

  const rankedPlayer = allPlayers.find((p) => p.usabId === usabId) ?? null;
  const dirPlayer = directoryPlayers.find((p) => p.usabId === usabId) ?? null;
  const isRanked = rankedPlayer !== null && rankedPlayer.entries.length > 0;
  const playerName = rankedPlayer?.name ?? dirPlayer?.name ?? '';
  const playerFound = rankedPlayer !== null || dirPlayer !== null;

  const [gender, setGender] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const tabRowRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => rankedPlayer?.entries ?? [], [rankedPlayer]);
  const bestEntry = entries.length > 0 ? entries.reduce((b, e) => (e.rank < b.rank ? e : b)) : null;
  const sortedEntries = useMemo(() =>
    [...entries].sort((a, b) => {
      const agOrder = AGE_GROUPS.indexOf(a.ageGroup) - AGE_GROUPS.indexOf(b.ageGroup);
      if (agOrder !== 0) return agOrder;
      return EVENT_TYPES.indexOf(a.eventType) - EVENT_TYPES.indexOf(b.eventType);
    }),
  [entries]);

  const ageGroupSet = useMemo(() =>
    [...new Set(entries.map((e) => e.ageGroup))].sort(
      (a, b) => AGE_GROUPS.indexOf(a) - AGE_GROUPS.indexOf(b),
    ),
  [entries]);

  useEffect(() => {
    void ensureDirectoryPlayers();
  }, [ensureDirectoryPlayers]);

  useEffect(() => {
    void ensurePlayers();
  }, [ensurePlayers]);

  useEffect(() => {
    if (!usabId || !playerName) return;
    if (!rankedPlayer || rankedPlayer.entries.length === 0) return;
    let cancelled = false;
    const best = rankedPlayer.entries.reduce((b, e) => (e.rank < b.rank ? e : b));
    setDetailError(null);
    fetchPlayerDetail(usabId, best.ageGroup, best.eventType)
      .then((d) => { if (!cancelled) setGender(d?.gender ?? null); })
      .catch((err) => {
        if (cancelled) return;
        setDetailError(err instanceof Error ? err.message : 'Could not load player details');
      });
    return () => { cancelled = true; };
  }, [usabId, playerName, rankedPlayer]);

  const displayName = playerName;
  const basePath = `/directory/${usabId}`;

  const scrollToTabs = useCallback(() => {
    requestAnimationFrame(() => {
      const el = tabRowRef.current;
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: y, behavior: 'instant' });
      }
    });
  }, []);

  const outletContext = useMemo<PlayerProfileContext>(() => ({
    usabId: usabId ?? '',
    displayName,
    isRanked,
    entries,
    sortedEntries,
    ageGroupSet,
    gender,
    rankingsDate,
    scrollToTabs,
  }), [usabId, displayName, isRanked, entries, sortedEntries, ageGroupSet, gender, rankingsDate, scrollToTabs]);

  if (!usabId) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-400 dark:text-slate-500 text-lg">Player not found.</p>
        <button type="button" onClick={() => window.history.back()} className="text-violet-600 hover:underline mt-2 inline-block">
          Back
        </button>
      </div>
    );
  }

  if ((loadingAllPlayers || directoryLoading) && !playerFound) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <RefreshCw className="w-8 h-8 text-slate-300 dark:text-slate-600 animate-spin mx-auto mb-3" />
        <p className="text-slate-400 dark:text-slate-500 text-sm">Loading player profile…</p>
      </div>
    );
  }

  if (!playerFound) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="py-16 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-lg">Player USAB #{usabId} not found.</p>
          <a
            href={`https://usabjrrankings.org/${usabId}/details`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-600 hover:underline mt-2 inline-flex items-center gap-1"
          >
            Search on USAB Rankings <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  const visibleTabs = TAB_ITEMS.filter((t) => !t.requiresRank || isRanked);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8 space-y-4 md:space-y-6">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Hero card */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 md:p-6 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 md:gap-6">
          <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br flex items-center justify-center text-xl md:text-2xl font-black text-white shrink-0 ${isRanked ? 'from-violet-500 to-blue-600' : 'from-slate-400 to-slate-500'}`}>
            {displayName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
          </div>

          <div className="flex-1 min-w-0">
            <div className="mb-1.5 md:mb-2 inline-flex max-w-full items-center gap-1.5">
              <h1 className="min-w-0 text-xl md:text-2xl font-bold">{displayName}</h1>
              <button
                onClick={() => setShowQr(true)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-slate-950/20 text-white/85 transition-all hover:bg-white/10 hover:text-white"
                aria-label="Show QR code"
                title="Show QR code"
              >
                <QrCode className="h-4 w-4 shrink-0" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 md:gap-2 mb-1.5 md:mb-2">
              {isRanked ? ageGroupSet.map((ag) => (
                <span
                  key={ag}
                  className={`px-2.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold bg-gradient-to-r ${AGE_GRADIENT[ag]} text-white`}
                >
                  {ag}
                </span>
              )) : (
                <span className="px-2.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold bg-slate-600 text-slate-300">
                  Currently Unranked
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 md:gap-3 text-white/60 text-xs md:text-sm">
              <span>USAB: <span className="font-mono text-white font-semibold">{usabId}</span></span>
              {gender && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span>{gender === 'M' ? 'Boy' : gender === 'F' ? 'Girl' : gender}</span>
                </>
              )}
              {isRanked && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span>{entries.length} ranked {entries.length === 1 ? 'event' : 'events'}</span>
                </>
              )}
            </div>
            {detailError && (
              <p className="mt-1 text-[11px] text-amber-300">
                Some profile details are unavailable. {detailError}
              </p>
            )}
          </div>

          {bestEntry && (
            <div className="flex gap-5 md:gap-6 text-center shrink-0">
              <div>
                <p className="text-2xl md:text-3xl font-black text-violet-400">#{bestEntry.rank}</p>
                <p className="text-[10px] md:text-xs text-white/50 mt-0.5">Best Rank</p>
                <p className="text-[10px] md:text-xs text-white/40">{bestEntry.ageGroup} {bestEntry.eventType}</p>
              </div>
              <div>
                <p className="text-2xl md:text-3xl font-black">{bestEntry.rankingPoints.toLocaleString()}</p>
                <p className="text-[10px] md:text-xs text-white/50 mt-0.5">Points</p>
              </div>
            </div>
          )}
        </div>

        <div ref={tabRowRef} className="mt-5 md:mt-6 border-t border-white/10 pt-4 md:pt-5">
          <div className="grid grid-cols-2 gap-2 md:gap-3 sm:flex sm:flex-wrap">
            {visibleTabs.map((tab, index) => (
              <NavLink
                key={tab.to}
                to={tab.to ? `${basePath}/${tab.to}` : basePath}
                end={tab.to === ''}
                replace
                state={{ keepScroll: true }}
                className={({ isActive }) =>
                  `flex w-full sm:w-auto min-w-0 items-center justify-center gap-2 px-3 md:px-4 py-2.5 rounded-xl border text-xs md:text-sm font-medium transition-all ${
                    visibleTabs.length % 2 === 1 && index === visibleTabs.length - 1 ? 'col-span-2 sm:col-span-1' : ''
                  } ${
                    isActive
                      ? 'bg-white text-slate-900 border-white shadow-lg shadow-slate-950/20'
                      : 'bg-white/8 text-white/75 border-white/10 hover:bg-white/14 hover:text-white'
                  }`
                }
              >
                <tab.icon className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      {showQr && (
        <QrCardModal
          name={displayName}
          usabId={usabId}
          ageGroups={ageGroupSet}
          isRanked={isRanked}
          onClose={() => setShowQr(false)}
        />
      )}

      <Outlet context={outletContext} />
    </div>
  );
}
