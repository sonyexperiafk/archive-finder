import type { Vertical } from './types';

export interface VerticalConfig {
  key: Vertical;
  label: string;
  threshold: number;
}

export const VERTICALS: VerticalConfig[] = [
  { key: 'fashion', label: 'Fashion', threshold: 35 }
];
