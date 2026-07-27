# IndusWealth design system

Two themes, one geometry, one component kit. If you are writing a screen, you
should almost never need anything outside `src/components/ui`.

## The three rules

1. **No raw colours in a screen.** No hex, no `rgba()`. Colour comes from
   `useTheme()` or from a `<Text tone="...">`. The only exception is colour that
   is *data* — a category's identity hue — which is passed through an explicit
   `color` prop.
2. **No `fontWeight`, ever.** Weight comes from the font family via `<Text variant>`.
   React Native on Android silently drops a custom family when `fontWeight` is set
   alongside it, which is how roughly half the app ended up in the system typeface.
3. **No `StyleSheet.create` at module scope if it touches colour.** Use
   `useThemedStyles(makeStyles)` with the factory defined at module scope.

## Themes

| | Obsidian (dark) | Ledger (light) |
|---|---|---|
| Page | `#000000` | `#EAE7DC` |
| Card | `#111111` | `#FFFFFF` |
| Nested / controls | `#1C1C1E` | `#F1EEE4` |
| Text primary / secondary / muted | `#FFFFFF` · `#A1A1AA` · `#71717A` | `#17150F` · `#5F5B51` · `#8B867A` |
| Accent (fill) | `#C9A227` | `#C9A227` |
| Accent (as text) | `#C9A227` | `#8A6D0B` — gold fails contrast on white |
| Card separation | lighter surface, no border | hairline + contact shadow |

`SPACING`, `RADIUS` and `TYPE` are shared, so switching modes never reflows a
screen. Only colour and elevation differ.

**Gold is for interactive things only** — primary button, active chip, active
tab, links, and the sparkline. It is not a border, not body text, and not a glow.

## Using the theme

```js
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

const makeStyles = (t) => StyleSheet.create({   // module scope — stable identity
    rail: { backgroundColor: t.SURFACE_SUNKEN },
});

const MyScreen = () => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);
    ...
};
```

`useThemeMode()` gives `{ mode, resolved, setMode }` for the System/Dark/Light
setting. `mode` is what the user picked; `resolved` is what it means right now.

## Type scale

`<Text variant>` — `hero` 34 · `h1` 24 · `h2` 18 · `title` 16 · `body` 14 ·
`bodyMed` 14 · `num` 14 · `label` 12 · `meta` 11 · `overline` 11 uppercase.

`<Text tone>` — `primary` `secondary` `muted` `disabled` `accent` `link`
`success` `danger` `warning` `info` `onAccent`.

## The kit

| Component | Notes |
|---|---|
| `Screen` | Background, status bar, top inset. `scroll` and `onRefresh` optional. |
| `ScreenHeader` | Back button, centred title, right slot. |
| `Card` | `padded` and `inset` default true. `tone="high"` for a card inside a card. `onPress` makes it tappable. |
| `SectionTitle` | Title + subtitle for inside a card. |
| `Overline` | Uppercase heading that labels a run of cards on the page. |
| `StatTile` / `StatGrid` | Two-up metric tiles. |
| `SegmentedControl` | Period toggles. `options` is `[{ label, value }]`. |
| `Chip` / `ChipRow` | Filters. Pass `color` and the active state tints with that identity hue instead of the accent. |
| `Button` | `primary` \| `secondary` \| `ghost` \| `danger`; `md` \| `sm`; `loading`, `icon`, `block`. **At most one primary per view.** |
| `Input` | Label, error, leading icon, built-in show/hide for passwords. |
| `ChangeBadge` | Pass `goodWhenUp={false}` on anything measuring spending — otherwise an overspend paints green. |
| `ListRow` | Transaction / account / setting rows. Pass `divider` on every row after the first. |
| `BarTrack` | Magnitude bar; keeps a 2% sliver so "small" never reads as "none". |
| `EmptyState` / `LoadingState` | With optional action button and message. |

## Category colours

Each mode has its own seven-hue ramp plus a neutral "Other", validated with
`dataviz/scripts/validate_palette.js` against that mode's card surface — OKLCH
lightness band, chroma floor, adjacent-pair colour-blind separation, and WCAG
contrast. The dark ramp is illegible on white, which is why light has its own.

Assignment is by category identity and is **fixed**: a filter that changes which
categories are visible must not repaint the survivors. Never show more than the
seven plus Other at once — beyond that, fold into Other. Every use pairs the
colour with the category's icon, which is what keeps two same-hue categories
apart for colour-blind users.

Semantic colours (`SUCCESS`, `DANGER`, `WARNING`, `INFO`) are reserved. They are
never reused as a series colour, and always ship with a sign, arrow, or label so
meaning never rests on colour alone.

## Migration status

`src/constants/theme.js` is the frozen pre-revamp palette. It still compiles and
still looks exactly as it did, but it is a static import so **anything using it
ignores the theme switch**. A screen becomes theme-aware when it moves onto the
kit. That file is deleted at the end of Phase 4.

Plan and phase order: `docs/superpowers/specs/2026-07-27-app-theme-revamp-design.md`.
