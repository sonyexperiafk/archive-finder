export function timeAgo(dateInput: string | null | undefined): string | null {
  if (!dateInput) return null;

  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

export function parseRelativeTime(text: string): string | null {
  if (!text) return null;

  const jaMatch = text.match(/(\d+)分前/) ?? text.match(/(\d+)時間前/) ?? text.match(/(\d+)日前/);
  if (jaMatch) {
    const value = Number.parseInt(jaMatch[1] ?? '', 10);
    if (!Number.isFinite(value)) return null;
    if (text.includes('分前')) return `${value}m ago`;
    if (text.includes('時間前')) return `${value}h ago`;
    if (text.includes('日前')) return `${value}d ago`;
  }

  return null;
}
