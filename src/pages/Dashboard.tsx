import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy, Users, Swords, Calendar, Clock, ChevronDown,
  MapPin, CheckCircle2, Loader2, Medal, FileText, ExternalLink, CalendarClock,
  QrCode, Share2, X, Link2, Check,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { fetchSpotlight } from '../services/rankingsService';
import ScheduleInline from '../components/ScheduleInline';
import type { ScheduledTournament } from '../types/junior';

declare const __VERCEL_GIT_COMMIT_SHA__: string | null;
declare const __BUILD_DATE__: string | null;

interface Feature {
  title: string;
  description: string;
  icon: typeof Trophy;
  to: string;
  iconBg: string;
  iconColor: string;
  comingSoon?: boolean;
}

const features: Feature[] = [
  {
    title: 'Rankings',
    description: 'Explore junior rankings by age group and event type',
    icon: Trophy,
    to: '/players',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    title: 'Player Directory',
    description: 'Browse and search all junior players past and present',
    icon: Users,
    to: '/directory',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    title: 'Head to Head',
    description: 'Compare two players side by side across rankings and matches',
    icon: Swords,
    to: '/head-to-head',
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    title: 'Tournaments',
    description: 'Browse tournament schedules, details, and results',
    icon: Calendar,
    to: '/tournaments',
    iconBg: 'bg-sky-100 dark:bg-sky-900/30',
    iconColor: 'text-sky-600 dark:text-sky-400',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return 'TBA';
  const s = new Date(start + 'T00:00:00');
  const e = end ? new Date(end + 'T00:00:00') : s;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const startStr = s.toLocaleDateString('en-US', opts);
  if (start === end) return startStr;
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', opts)}`;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; label: string; bg: string; text: string }> = {
  completed:     { icon: CheckCircle2, label: 'Completed',   bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  'in-progress': { icon: Loader2,      label: 'In Progress', bg: 'bg-amber-100 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300' },
  upcoming:      { icon: Clock,        label: 'Upcoming',    bg: 'bg-blue-100 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300' },
};

function canvasRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSiteCard(qrCanvas: HTMLCanvasElement | null): HTMLCanvasElement {
  const DPR = Math.max(window.devicePixelRatio, 3);
  const W = 320;
  const PAD = 32;
  const QR = 160;
  const QR_PAD = 16;
  const QR_BOX = QR + QR_PAD * 2;
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  const H = PAD + 28 + 8 + 16 + 20 + QR_BOX + 16 + 16 + PAD;

  const c = document.createElement('canvas');
  c.width = W * DPR;
  c.height = H * DPR;
  const ctx = c.getContext('2d')!;
  ctx.scale(DPR, DPR);

  ctx.save();
  canvasRoundRect(ctx, 0, 0, W, H, 24);
  ctx.clip();

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#7c3aed');
  bg.addColorStop(0.5, '#4f46e5');
  bg.addColorStop(1, '#2563eb');
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
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#fff';
  ctx.font = `800 24px ${FONT}`;
  ctx.fillText('USAB Junior Hub', W / 2, y);
  y += 28 + 8;

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `400 13px ${FONT}`;
  ctx.fillText('Players · Rankings · Tournaments', W / 2, y, W - PAD * 2);
  y += 16 + 20;

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

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `400 12px ${FONT}`;
  ctx.fillText('Scan to visit', W / 2, y);

  ctx.restore();
  return c;
}

function SiteQrModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const siteUrl = window.location.origin;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const canShare = typeof navigator.share === 'function';

  const handleShare = useCallback(async () => {
    const qrCanvas = qrRef.current?.querySelector('canvas') ?? null;
    const card = drawSiteCard(qrCanvas);
    try {
      const blob = await new Promise<Blob | null>((res) => card.toBlob(res, 'image/png'));
      if (!blob) return;
      const file = new File([blob], 'usab-junior-hub-qr.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'USAB Junior Hub', url: siteUrl });
      } else {
        await navigator.share({ title: 'USAB Junior Hub', url: siteUrl });
      }
    } catch { /* user cancelled or unsupported */ }
  }, [siteUrl]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(siteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [siteUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative flex flex-col items-center gap-4 animate-scale-in motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <div className="w-72 md:w-80 rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-6 md:p-8 flex flex-col items-center text-center overflow-hidden relative">
            <div
              className="absolute top-0 right-0 w-64 h-64 -translate-y-1/3 translate-x-1/4 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)' }}
            />
            <div
              className="absolute bottom-0 left-0 w-48 h-48 translate-y-1/4 -translate-x-1/4 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }}
            />

            <h3 className="relative text-xl md:text-2xl font-extrabold text-white mb-1">
              USAB Junior <span className="text-violet-200">Hub</span>
            </h3>
            <p className="relative text-xs text-white/70 mb-5">Players · Rankings · Tournaments</p>

            <div ref={qrRef} className="relative bg-white rounded-2xl p-4 shadow-lg mb-4">
              <QRCodeCanvas value={siteUrl} size={160} level="M" fgColor="#4338ca" />
            </div>

            <p className="relative text-xs text-white/70">Scan to visit</p>
          </div>

          <button
            onClick={onClose}
            className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80 hover:text-white transition-colors backdrop-blur-sm"
          >
            <X className="w-4 h-4" />
          </button>
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

export default function Home() {
  const [spotlights, setSpotlights] = useState<ScheduledTournament[]>([]);
  const [spotlightLoading, setSpotlightLoading] = useState(true);
  const [spotlightError, setSpotlightError] = useState<string | null>(null);
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSpotlight()
      .then(data => {
        if (cancelled) return;
        setSpotlights(data.spotlight ?? []);
        setSpotlightError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setSpotlightError(err instanceof Error ? err.message : 'Could not load spotlight tournament');
        setSpotlights([]);
      })
      .finally(() => { if (!cancelled) setSpotlightLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-10 md:space-y-14">
      {/* Hero */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
          USAB Junior
          <span className="text-violet-600 dark:text-violet-400"> Hub</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          Track rankings, discover players, compare matchups, and explore tournaments — all in one place
        </p>
        <button
          onClick={() => setShowQr(true)}
          className="inline-flex items-center gap-1.5 mx-auto px-4 py-1.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
        >
          <QrCode className="w-3.5 h-3.5" />
          Share This Site
        </button>
      </div>

      {showQr && <SiteQrModal onClose={() => setShowQr(false)} />}

      {/* Spotlight Tournaments */}
      {!spotlightLoading && spotlights.length > 0 && (
        <div className={`grid gap-4 ${spotlights.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {spotlights.map((sl) => {
            const config = STATUS_CONFIG[sl.status] || STATUS_CONFIG.upcoming;
            const StatusIcon = config.icon;
            const days = sl.status === 'upcoming' ? daysUntil(sl.startDate) : null;
            return (
              <div key={sl.tswId ?? sl.name} className="relative overflow-hidden rounded-2xl border border-violet-200 dark:border-violet-800/60 bg-gradient-to-br from-violet-50 via-white to-sky-50 dark:from-violet-950/40 dark:via-slate-900 dark:to-sky-950/30 shadow-sm">
                <div className="px-5 pt-4 pb-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-violet-500 dark:text-violet-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-violet-500 dark:text-violet-400">
                    {sl.status === 'in-progress' ? 'Happening Now' : sl.status === 'upcoming' ? 'Up Next' : 'Latest Tournament'}
                  </span>
                </div>
                <div className="px-5 pb-5 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
                          <StatusIcon className={`w-3 h-3 ${sl.status === 'in-progress' ? 'animate-spin' : ''}`} />
                          {config.label}
                        </span>
                        {days !== null && days > 0 && (
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {days === 1 ? 'Tomorrow' : `in ${days} days`}
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 leading-snug">
                        {sl.tswId ? (
                          <Link
                            to={`/tournaments/${sl.tswId}`}
                            state={{ name: sl.name, hostClub: sl.hostClub, startDate: sl.startDate, endDate: sl.endDate }}
                            className="text-violet-600 dark:text-violet-400 hover:underline transition-colors"
                          >
                            {sl.name}
                          </Link>
                        ) : (
                          sl.name
                        )}
                      </h3>

                      <div className="flex flex-col gap-1 text-sm text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>{formatDateRange(sl.startDate, sl.endDate)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{sl.hostClub}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        {sl.tswId && (sl.status === 'upcoming' || sl.status === 'in-progress') && (
                          <button
                            onClick={() => setExpandedSchedule(expandedSchedule === sl.tswId ? null : sl.tswId)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                              expandedSchedule === sl.tswId
                                ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                                : 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40'
                            }`}
                          >
                            <CalendarClock className="w-3 h-3" />
                            Schedule
                            <ChevronDown className={`w-3 h-3 transition-transform ${expandedSchedule === sl.tswId ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                        {sl.tswId && sl.status === 'completed' && (
                          <Link
                            to={`/tournaments/${sl.tswId}/medals`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                          >
                            <Medal className="w-3 h-3" />
                            Medals
                          </Link>
                        )}
                        {sl.prospectusUrl && (
                          <a
                            href={sl.prospectusUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            <FileText className="w-3 h-3" />
                            Prospectus
                          </a>
                        )}
                        {sl.usabUrl && (
                          <a
                            href={sl.usabUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            USAB
                          </a>
                        )}
                      </div>

                      {expandedSchedule === sl.tswId && sl.tswId && (
                        <div className="mt-3 pt-3 border-t border-violet-200/50 dark:border-violet-800/30">
                          <ScheduleInline tswId={sl.tswId} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!spotlightLoading && spotlights.length === 0 && spotlightError && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Spotlight tournament is currently unavailable. {spotlightError}
        </div>
      )}

      {/* Feature Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        {features.map((feature) => {
          const Icon = feature.icon;
          const card = (
            <div
              className={`relative group bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 md:p-8 transition-all flex flex-col items-center text-center ${
                feature.comingSoon ? 'opacity-60' : 'hover:shadow-lg hover:-translate-y-0.5'
              }`}
            >
              <div className={`w-28 h-28 md:w-36 md:h-36 ${feature.iconBg} rounded-3xl flex items-center justify-center mb-5`}>
                <Icon className={`w-14 h-14 md:w-20 md:h-20 ${feature.iconColor}`} />
              </div>
              <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100 mb-1.5 flex items-center gap-2">
                {feature.title}
                {feature.comingSoon && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Coming Soon
                  </span>
                )}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{feature.description}</p>
            </div>
          );

          if (feature.comingSoon) {
            return <div key={feature.title}>{card}</div>;
          }
          return (
            <Link key={feature.title} to={feature.to} className="block">
              {card}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <footer className="pt-6 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400 dark:text-slate-500 space-y-1">
        <p>
          USAB Junior Badminton Hub &middot;{' '}
          {__VERCEL_GIT_COMMIT_SHA__ ? __VERCEL_GIT_COMMIT_SHA__.slice(0, 7) : 'dev'}
          {__BUILD_DATE__ && (
            <> &middot; Built {new Date(__BUILD_DATE__).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
          )}
        </p>
        <p>
          A hobby project &mdash; not affiliated with USA Badminton. Data sourced from{' '}
          <a
            href="https://usabjrrankings.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-600 dark:hover:text-slate-300"
          >
            usabjrrankings.org
          </a>{' '}
          and{' '}
          <a
            href="https://www.tournamentsoftware.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-600 dark:hover:text-slate-300"
          >
            tournamentsoftware.com
          </a>
          .
        </p>
        <p>&copy; {new Date().getFullYear()} All rights reserved.</p>
      </footer>
    </div>
  );
}
