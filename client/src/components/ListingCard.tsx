import { useEffect, useState, type CSSProperties } from 'react';
import { Heart, ExternalLink } from 'lucide-react';
import type { Listing } from '../../../shared/src';
import { imageUrl } from '../utils/imageUrl';
import { sourceClassName, sourceLabel } from '../utils/sourcePresentation';
import { parseRelativeTime, timeAgo } from '../utils/timeAgo';

interface ListingCardProps {
  listing: Listing;
  onLike?: () => void;
  isLiked?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ListingCard({ listing, onLike, isLiked, className, style }: ListingCardProps) {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);

  const resolvedImageUrl = imageUrl(listing.imageUrl1 ?? listing.imageUrl2 ?? '');
  const reasons = listing.scoreBreakdown?.reasons ?? listing.recommendationReasons ?? [];
  const signals = listing.scoreBreakdown?.signals ?? [];
  const underpriced = (listing.scoreBreakdown?.priceOpportunityScore ?? 0) >= 15;
  const brandTier = listing.scoreBreakdown?.brandTier;
  const postedTime = listing.ageMinutesOptional !== null && listing.ageMinutesOptional !== undefined
    ? listing.ageMinutesOptional <= 1
      ? 'Fresh now'
      : `${listing.ageMinutesOptional}m old`
    : (timeAgo(listing.postedAt ?? listing.firstSeenAt) ?? parseRelativeTime(listing.publishedTextOptional ?? listing.rawJson) ?? 'Unknown age');
  const score = listing.recommendationScore ?? listing.scoreBreakdown?.total ?? null;

  useEffect(() => {
    setImgLoaded(false);
  }, [resolvedImageUrl]);

  useEffect(() => {
    if (!hovered) {
      setShowQuickOpen(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setShowQuickOpen(true), 600);
    return () => window.clearTimeout(timer);
  }, [hovered]);

  return (
    <article
      className={`card ${className ?? ''}`.trim()}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => window.open(listing.url, '_blank', 'noopener,noreferrer')}
    >
      <div className="card__image-wrap">
        {!imgLoaded ? <div className="card__skeleton" /> : null}
        {resolvedImageUrl ? (
          <img
            src={resolvedImageUrl}
            alt=""
            className="card__image"
            style={{ opacity: imgLoaded ? 1 : 0, transform: hovered ? 'scale(1.06)' : 'scale(1)' }}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
            loading="lazy"
          />
        ) : (
          <div className="card__empty">NO IMAGE</div>
        )}
        <div className="card__overlay" />
        <div className={`card__source card__source--${sourceClassName(listing.source)}`}>{sourceLabel(listing.source)}</div>
        <button
          className={`card__like ${isLiked ? 'card__like--active' : ''}`.trim()}
          onClick={(event) => {
            event.stopPropagation();
            onLike?.();
          }}
          style={{ opacity: hovered || isLiked ? 1 : 0 }}
          type="button"
          aria-label={isLiked ? 'Remove from liked' : 'Add to liked'}
        >
          <Heart size={13} fill={isLiked ? 'currentColor' : 'none'} />
        </button>
        {underpriced ? <div className="card__fire-tag">🔥 Underpriced</div> : null}
        {showQuickOpen ? (
          <button
            type="button"
            className="card__quick-open"
            onClick={(event) => {
              event.stopPropagation();
              window.open(listing.url, '_blank', 'noopener,noreferrer');
            }}
          >
            <ExternalLink size={12} />
            <span>Open</span>
          </button>
        ) : null}

        <div className="card__info">
          <div className="card__price">{listing.priceText ?? '—'}</div>
          {listing.priceUsd && listing.currencyOriginal && listing.currencyOriginal !== 'USD' ? (
            <div className="card__price-secondary">≈ ${Math.round(listing.priceUsd)}</div>
          ) : null}
          {listing.brandDetected ? (
            <div className="card__brand-row">
              <div className="card__brand">{listing.brandDetected}</div>
              {brandTier && ['S', 'A', 'B', 'C', 'D'].includes(brandTier) ? (
                <span className={`tier-badge tier-badge--${brandTier.toLowerCase()}`}>{brandTier}</span>
              ) : null}
            </div>
          ) : null}
          <div className="card__title">{listing.title}</div>
          <div className="card__meta-row">
            <span className="card__time">{postedTime}</span>
            {score !== null ? <span className="card__score">Score {Math.round(score)}</span> : null}
          </div>
        </div>
      </div>

      {signals.length > 0 || reasons.length > 0 ? (
        <div className="card__reasons">
          {signals.slice(0, 3).map((signal) => (
            <span key={signal} className="card__reason-tag card__reason-tag--signal">{signal}</span>
          ))}
          {reasons.slice(0, 3).map((reason) => (
            <span key={reason} className="card__reason-tag">{reason}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
