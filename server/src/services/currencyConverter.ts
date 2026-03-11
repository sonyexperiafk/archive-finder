const RATES_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  JPY: 1 / 150,
  GBP: 1.27,
  BYN: 1 / 3.1,
  RUB: 0.011,
  CNY: 1 / 7.2,
  SGD: 0.74,
  MYR: 0.22,
  AUD: 0.65,
  CAD: 0.74,
  KRW: 1 / 1330,
  HKD: 1 / 7.8,
  TWD: 0.031
};

export function toUSD(amount: number, currency: string): number {
  const rate = RATES_TO_USD[currency.toUpperCase()] ?? 1;
  return Math.round(amount * rate * 100) / 100;
}

export function formatUSD(usdAmount: number): string {
  if (usdAmount < 1) return '<$1';
  if (usdAmount >= 1000) return `$${Math.round(usdAmount / 100) * 100}`;
  return `$${Math.round(usdAmount)}`;
}

export async function refreshRates(): Promise<void> {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return;
    const data = await response.json() as { rates?: Record<string, number> };
    if (!data.rates) return;
    for (const [currency, rate] of Object.entries(data.rates)) {
      if (typeof rate === 'number' && rate > 0) {
        RATES_TO_USD[currency] = 1 / rate;
      }
    }
  } catch {
    // Keep static fallback rates.
  }
}
