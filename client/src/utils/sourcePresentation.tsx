import type { Listing, FeedSource } from '../../../shared/src';

type SourceTone = 'guest' | 'optional' | 'required' | 'proxy';

interface SourceCapability {
  label: string;
  note: string;
  tone: SourceTone;
}

interface SourceStory {
  eyebrow: string;
  headline: string;
  detail: string;
  statLabel: string;
  statValue: string;
  visualLabel: string;
  posterTitle: string;
  posterMode: string;
  accentA: string;
  accentB: string;
  glow: string;
}

interface SourcePresentationConfig {
  label: string;
  monogram: string;
  cardClass: string;
  capability: SourceCapability;
  story: SourceStory;
}

const SOURCE_PRESENTATION: Record<FeedSource, SourcePresentationConfig> = {
  avito: {
    label: 'Avito',
    monogram: 'AV',
    cardClass: 'avito',
    capability: {
      label: 'Proxy + cookies',
      note: 'Best-effort browser mode exists, but stable extraction still needs a proxy and healthy cookies.',
      tone: 'proxy'
    },
    story: {
      eyebrow: 'Russia / Browser lane',
      headline: 'High-volume archive surface with heavier anti-bot pressure.',
      detail: 'Best when routed through proxy plus multiple healthy cookie packs. Use this lane when you want depth, not convenience.',
      statLabel: 'Access mode',
      statValue: 'Proxy lane',
      visualLabel: 'Proxy',
      posterTitle: 'Archive depth',
      posterMode: 'Proxy lane',
      accentA: '#ff7b84',
      accentB: '#d41436',
      glow: 'rgba(255, 77, 94, 0.45)'
    }
  },
  mercari_jp: {
    label: 'Mercari',
    monogram: 'ME',
    cardClass: 'mercari',
    capability: {
      label: 'Guest-ready',
      note: 'Works without cookies through browser render/API capture. Cookies are optional.',
      tone: 'guest'
    },
    story: {
      eyebrow: 'Japan / Guest-ready',
      headline: 'Fast public discovery for Japanese menswear, archive outerwear and boots.',
      detail: 'The cleanest starting point right now. Browser render plus API capture keeps it usable even without operator setup.',
      statLabel: 'Strength',
      statValue: 'Fast public',
      visualLabel: 'Public',
      posterTitle: 'Tokyo flow',
      posterMode: 'Public capture',
      accentA: '#ffd0bf',
      accentB: '#ff5d7a',
      glow: 'rgba(255, 109, 120, 0.4)'
    }
  },
  vinted: {
    label: 'Vinted',
    monogram: 'VI',
    cardClass: 'vinted',
    capability: {
      label: 'Guest-ready',
      note: 'Guest mode works now. Fresh cookies still improve resilience when Vinted tightens access.',
      tone: 'guest'
    },
    story: {
      eyebrow: 'EU / Age-aware',
      headline: 'Large flow with stronger freshness control and lower-value noise penalties.',
      detail: 'Works in guest mode, but fresh cookies still help when access gets tighter. Good for fast-only testing and volume.',
      statLabel: 'Strength',
      statValue: 'Wide surface',
      visualLabel: 'Volume',
      posterTitle: 'Fresh scan',
      posterMode: 'Guest lane',
      accentA: '#ffc9d4',
      accentB: '#d91c5c',
      glow: 'rgba(235, 63, 118, 0.4)'
    }
  },
  carousell: {
    label: 'Carousell',
    monogram: 'CA',
    cardClass: 'carousell',
    capability: {
      label: 'Cookies required',
      note: 'Needs valid auth cookies or a captured session. Cloudflare can still challenge weak sessions.',
      tone: 'required'
    },
    story: {
      eyebrow: 'SEA / Protected',
      headline: 'Useful archive pockets behind cookie-heavy protection and Cloudflare friction.',
      detail: 'Run this only with valid sessions. The parser can recover, but the source still behaves like a protected lane.',
      statLabel: 'Access mode',
      statValue: 'Protected',
      visualLabel: 'Session',
      posterTitle: 'Protected lane',
      posterMode: 'Session first',
      accentA: '#ffb9be',
      accentB: '#c10b30',
      glow: 'rgba(244, 54, 91, 0.42)'
    }
  },
  kufar: {
    label: 'Kufar',
    monogram: 'KU',
    cardClass: 'kufar',
    capability: {
      label: 'Guest-ready',
      note: 'Public API works without cookies in normal conditions.',
      tone: 'guest'
    },
    story: {
      eyebrow: 'Belarus / Public API',
      headline: 'Lean public source that works well for cheap, fast-only discovery.',
      detail: 'A reliable low-friction lane. It is not the flashiest source, but it is easy to keep alive and good for breadth.',
      statLabel: 'Strength',
      statValue: 'Lightweight',
      visualLabel: 'API',
      posterTitle: 'Low friction',
      posterMode: 'JSON lane',
      accentA: '#ffc4d2',
      accentB: '#d51457',
      glow: 'rgba(222, 44, 104, 0.4)'
    }
  },
  rakuma: {
    label: 'Rakuma',
    monogram: 'RA',
    cardClass: 'rakuma',
    capability: {
      label: 'Guest-ready',
      note: 'Public JSON search works well without cookies.',
      tone: 'guest'
    },
    story: {
      eyebrow: 'Japan / Public JSON',
      headline: 'Strong signal for Japanese resale with clean structured pages and good detail recovery.',
      detail: 'Reliable for public crawling and useful for cross-checking what Mercari is missing during fast manual runs.',
      statLabel: 'Strength',
      statValue: 'Structured',
      visualLabel: 'JSON',
      posterTitle: 'Structured flow',
      posterMode: 'Detail-rich',
      accentA: '#ffd9c1',
      accentB: '#ea4b58',
      glow: 'rgba(250, 94, 82, 0.38)'
    }
  }
};

export function sourceLabel(source: FeedSource | Listing['source']): string {
  return SOURCE_PRESENTATION[source as FeedSource]?.label ?? String(source);
}

export function sourceMonogram(source: FeedSource | Listing['source']): string {
  return SOURCE_PRESENTATION[source as FeedSource]?.monogram ?? 'AF';
}

export function sourceClassName(source: FeedSource | Listing['source']): string {
  return SOURCE_PRESENTATION[source as FeedSource]?.cardClass ?? 'default';
}

export function sourceCapability(source: FeedSource): SourceCapability {
  return SOURCE_PRESENTATION[source].capability;
}

export function sourceStory(source: FeedSource): SourceStory {
  return SOURCE_PRESENTATION[source].story;
}

export function SourcePosterIllustration(props: { source: FeedSource }) {
  const config = SOURCE_PRESENTATION[props.source];
  const story = config.story;
  const id = `poster-${props.source}`;

  return (
    <svg
      className="source-poster-svg"
      viewBox="0 0 640 420"
      role="img"
      aria-label={`${config.label} source poster`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#170d11" />
          <stop offset="60%" stopColor="#0f0a0d" />
          <stop offset="100%" stopColor="#22090f" />
        </linearGradient>
        <radialGradient id={`${id}-orb`} cx="50%" cy="38%" r="42%">
          <stop offset="0%" stopColor={story.accentA} stopOpacity="0.95" />
          <stop offset="45%" stopColor={story.accentB} stopOpacity="0.72" />
          <stop offset="100%" stopColor={story.accentB} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-beam`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={story.accentA} stopOpacity="0.95" />
          <stop offset="100%" stopColor={story.accentB} stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="640" height="420" rx="34" fill={`url(#${id}-bg)`} />
      <circle cx="345" cy="154" r="118" fill={`url(#${id}-orb)`} />
      <circle cx="344" cy="154" r="154" fill={story.glow} opacity="0.22" />

      <rect x="66" y="270" width="6" height="108" rx="3" fill={`url(#${id}-beam)`} transform="rotate(-12 66 270)" />
      <rect x="156" y="244" width="6" height="142" rx="3" fill={`url(#${id}-beam)`} transform="rotate(6 156 244)" />
      <rect x="246" y="250" width="6" height="132" rx="3" fill={`url(#${id}-beam)`} transform="rotate(-22 246 250)" />
      <rect x="372" y="230" width="6" height="156" rx="3" fill={`url(#${id}-beam)`} transform="rotate(8 372 230)" />
      <rect x="462" y="246" width="6" height="124" rx="3" fill={`url(#${id}-beam)`} transform="rotate(-12 462 246)" />

      <rect x="28" y="28" width="106" height="106" rx="30" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" />
      <text x="81" y="91" textAnchor="middle" fill="#fff7f5" fontSize="34" fontWeight="800" letterSpacing="5">
        {config.monogram}
      </text>

      <g transform="translate(28 160)">
        <rect width="146" height="34" rx="17" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
        <text x="16" y="22" fill="rgba(255,237,237,0.85)" fontSize="12" fontWeight="700" letterSpacing="2.4">
          {story.visualLabel.toUpperCase()}
        </text>
      </g>

      <g transform="translate(28 228)">
        <text fill="#fff3f0" fontSize="42" fontWeight="700" letterSpacing="-1.8">
          {config.label}
        </text>
        <text y="44" fill="rgba(255,232,232,0.72)" fontSize="18" fontWeight="500">
          {story.posterTitle}
        </text>
      </g>

      <g transform="translate(468 34)">
        <rect width="144" height="82" rx="22" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" />
        <text x="18" y="30" fill="rgba(255,237,237,0.6)" fontSize="11" fontWeight="700" letterSpacing="2.2">
          MODE
        </text>
        <text x="18" y="58" fill="#fff4f2" fontSize="22" fontWeight="700">
          {story.posterMode}
        </text>
      </g>

      <g transform="translate(430 314)">
        <rect width="182" height="72" rx="24" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.09)" />
        <text x="18" y="29" fill="rgba(255,237,237,0.58)" fontSize="11" fontWeight="700" letterSpacing="2.1">
          ONLY-NEW
        </text>
        <text x="18" y="55" fill="#fff4f0" fontSize="20" fontWeight="700">
          Live discovery
        </text>
      </g>
    </svg>
  );
}
