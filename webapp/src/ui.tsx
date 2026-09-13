import React from 'react';

/* =========================================================================
   Shared primitives — dipakai semua tab.
   Semua styling lewat class di index.css (design token), bukan inline.
   ========================================================================= */

export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 20, className = '' }) => (
  <span
    className={`spin ${className}`}
    role="status"
    aria-label="Memuat"
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      border: `${Math.max(2, Math.round(size / 9))}px solid color-mix(in srgb, currentColor 24%, transparent)`,
      borderTopColor: 'currentColor',
    }}
  />
);

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
  glow?: boolean;
  style?: React.CSSProperties;
}> = ({ children, className = '', pad = false, glow = false, style }) => (
  <div className={`card ${pad ? 'card-pad' : ''} ${glow ? 'card-glow' : ''} ${className}`} style={style}>
    {children}
  </div>
);

export const SectionLabel: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="section-label">
    <span className="grow">{children}</span>
    {right}
  </div>
);

export const Row: React.FC<{
  icon?: React.ReactNode;
  title: React.ReactNode;
  desc?: React.ReactNode;
  value?: React.ReactNode;
  right?: React.ReactNode;
  onClick?: () => void;
  accent?: string;
}> = ({ icon, title, desc, value, right, onClick, accent }) => {
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag className={`row ${onClick ? 'row-btn' : ''}`} onClick={onClick}>
      {icon && (
        <span className="row-icon" style={accent ? { background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent } : undefined}>
          {icon}
        </span>
      )}
      <span className="row-body">
        <span className="row-title" style={{ display: 'block' }}>{title}</span>
        {desc && <span className="row-desc" style={{ display: 'block' }}>{desc}</span>}
      </span>
      {value !== undefined && <span className="row-value">{value}</span>}
      {right}
    </Tag>
  );
};

export const Switch: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}> = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    data-on={checked}
    className="switch"
    onClick={() => !disabled && onChange(!checked)}
  >
    <span className="switch-knob" />
  </button>
);

export const Badge: React.FC<{ tone?: 'ok' | 'warn' | 'danger' | 'violet' | 'gold' | 'muted' | 'info'; children: React.ReactNode }> = ({
  tone = 'info',
  children,
}) => <span className={`badge ${tone}`}>{children}</span>;

export const Banner: React.FC<{
  tone?: 'ok' | 'warn' | 'danger' | 'info';
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ tone = 'info', icon, children }) => (
  <div className={`banner ${tone}`} role="alert">
    {icon && <span className="shrink-0" style={{ marginTop: 1 }}>{icon}</span>}
    <span className="grow fw-6">{children}</span>
  </div>
);

export const Toast: React.FC<{ tone: 'ok' | 'err'; children: React.ReactNode }> = ({ tone, children }) => (
  <div className="toast-wrap">
    <div className={`toast ${tone}`} role="status">{children}</div>
  </div>
);

export const Tile: React.FC<{
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  foot?: string;
  accent?: string;
}> = ({ icon, label, value, foot, accent }) => (
  <div className="tile">
    <div className="tile-head">
      {icon && <span style={{ color: accent || 'var(--info)', display: 'grid', placeItems: 'center' }}>{icon}</span>}
      <span className="truncate">{label}</span>
    </div>
    <div className="tile-value num" style={accent ? { color: accent } : undefined}>{value}</div>
    {foot && <div className="tile-foot truncate">{foot}</div>}
  </div>
);

export const Empty: React.FC<{ icon: string; title: string; desc?: string }> = ({ icon, title, desc }) => (
  <div className="empty">
    <div className="empty-icon">{icon}</div>
    <div className="empty-title">{title}</div>
    {desc && <div className="empty-desc">{desc}</div>}
  </div>
);

export const Skeleton: React.FC<{ height?: number; count?: number; gap?: number; className?: string }> = ({
  height = 68,
  count = 3,
  gap = 10,
  className = '',
}) => (
  <div className={`stack ${className}`} style={{ gap }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="sk" style={{ height }} />
    ))}
  </div>
);

export const Bar: React.FC<{ pct: number }> = ({ pct }) => (
  <div className="bar">
    <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </div>
);

/* ------------------------------ formatters ------------------------------ */

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d} hari ${h} jam`;
  if (h > 0) return `${h} jam ${m} mnt`;
  if (m > 0) return `${m} mnt ${s} dtk`;
  return `${s} dtk`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return 'Belum ditautkan';
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 5)}••••${phone.slice(-3)}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '—';
  const diff = target - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return diff > 0 ? 'sebentar lagi' : 'baru saja';
  if (mins < 60) return diff > 0 ? `${mins} menit lagi` : `${mins} menit lalu`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return diff > 0 ? `${hrs} jam lagi` : `${hrs} jam lalu`;
  const days = Math.round(hrs / 24);
  return diff > 0 ? `${days} hari lagi` : `${days} hari lalu`;
}
