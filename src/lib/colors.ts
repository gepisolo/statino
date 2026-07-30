// Per-project badge colors. A project can carry a `bgColor`/`textColor`
// pair ('#rrggbb'); when either is missing the badge keeps the theme
// classes it always had — which is also the only variant that follows
// light/dark, since a custom pair is fixed.

import type { Project } from '@/types/models';

export interface BadgeColors {
  bg: string;
  text: string;
}

// Shared by every project badge, colored or not.
export const BADGE_CLASS = 'rounded px-1.5 py-0.5 text-xs';
export const BADGE_FALLBACK_CLASS = 'bg-accent text-accent-foreground';

// Where the pickers start when a project has no colors yet: the light
// theme's grey badge.
export const DEFAULT_BADGE: BadgeColors = { bg: '#e5e7eb', text: '#111827' };

// Suggested pairs, all at 5:1 contrast or better (WCAG AA for small
// text, verified pair by pair): twelve tinted backgrounds with a dark
// text of the same hue, then six solid ones for the projects that
// should jump out.
export const BADGE_PRESETS: (BadgeColors & { name: string })[] = [
  { name: 'Grigio', bg: '#e5e7eb', text: '#111827' },
  { name: 'Ardesia', bg: '#e2e8f0', text: '#1e293b' },
  { name: 'Blu', bg: '#dbeafe', text: '#1e3a8a' },
  { name: 'Aqua', bg: '#cffafe', text: '#155e75' },
  { name: 'Verde', bg: '#dcfce7', text: '#14532d' },
  { name: 'Lime', bg: '#ecfccb', text: '#3f6212' },
  { name: 'Ambra', bg: '#fef3c7', text: '#78350f' },
  { name: 'Arancio', bg: '#ffedd5', text: '#7c2d12' },
  { name: 'Rosso', bg: '#fee2e2', text: '#7f1d1d' },
  { name: 'Rosa', bg: '#fce7f3', text: '#831843' },
  { name: 'Viola', bg: '#ede9fe', text: '#4c1d95' },
  { name: 'Indaco', bg: '#e0e7ff', text: '#312e81' },
  { name: 'Blu pieno', bg: '#1d4ed8', text: '#ffffff' },
  { name: 'Verde pieno', bg: '#15803d', text: '#ffffff' },
  { name: 'Viola pieno', bg: '#6d28d9', text: '#ffffff' },
  { name: 'Rosso pieno', bg: '#b91c1c', text: '#ffffff' },
  { name: 'Teal pieno', bg: '#0f766e', text: '#ffffff' },
  { name: 'Grafite', bg: '#334155', text: '#ffffff' },
];

export function badgeColorsOf(p: Project | null | undefined): BadgeColors | null {
  return p?.bgColor && p?.textColor ? { bg: p.bgColor, text: p.textColor } : null;
}

// Inline style for a colored badge, `undefined` for the default one (so
// the fallback classes stay in charge).
export function badgeStyle(
  p: Project | null | undefined,
): { backgroundColor: string; color: string } | undefined {
  const c = badgeColorsOf(p);
  return c ? { backgroundColor: c.bg, color: c.text } : undefined;
}

export function badgeClass(p: Project | null | undefined): string {
  return badgeColorsOf(p) ? BADGE_CLASS : `${BADGE_CLASS} ${BADGE_FALLBACK_CLASS}`;
}

// WCAG 2.1 relative luminance / contrast ratio, used to warn about a
// hand-picked pair that would be hard to read.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(bg: string, text: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(bg) || !/^#[0-9a-f]{6}$/i.test(text)) return 0;
  const [light, dark] = [luminance(bg), luminance(text)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
