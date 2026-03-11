const NEEDS_PROXY = ['mercdn.net', 'vinted-assets', 'vinted.com', 'fril.jp', 'rms.kufar.by', 'yams.kufar.by', 'carousell.com', 'carousell-static', 'karousell.com', 'sg-ex-listed', 'avito.st', 'img.avito.st', 'static.avito.st', 'i.avito.ru', 'avatars.mds.yandex.net'] as const;

export function imageUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  if (NEEDS_PROXY.some((domain) => raw.includes(domain))) {
    return `/api/image-proxy?url=${encodeURIComponent(raw)}`;
  }
  return raw;
}
