# IndusWealth — App-Wide Theme Revamp

**Date:** 2026-07-27 · **Branch:** `dev` · **Status:** design approved, pending implementation

Bring every screen up to the visual standard of `AdvancedAnalyticsScreen`, which is
currently the only screen in the app built on elevated surfaces, a consistent type
scale, and restrained accent use.

---

## 1. Audit — what's actually wrong

Measured across the 32 files in `packages/mobile/src/{screens,components,navigation}`
(18,660 lines).

| Finding | Evidence |
|---|---|
| **Cards are outlines, not surfaces** | `SURFACE_ELEVATED` (`#111111`) is referenced in **exactly one file** — `AdvancedAnalyticsScreen`. Everywhere else: `CARD_BG` = `#000000` (identical to the page background) + a 1px gold border. 49 `CARD_BG` uses, 47 gold-border uses. |
| **447 hardcoded hex values** | Across 32 files. `theme.js` is advisory, not authoritative. |
| **Three golds** | `#C9A227` (theme), `#D4AF37` (36×), `#C5A028` (7×), plus stray `#EAB308`, `#FFD700`. |
| **Two unrelated design systems** | Login, Signup, ForgotPassword, ResetPassword, EmailVerification, ConnectBank are built in Tailwind **slate navy** (`#0F172A`/`#1E293B`/`#334155`/`#64748B`/`#94A3B8`) with `LinearGradient`. Those 6 files reference `COLORS` only 5–11 times each. |
| **Typography splits the app in half** | ~14 files style text with bare `fontWeight` and no `fontFamily`, so they render in the **system font**, not Space Grotesk. `HomeScreen` and `DebtAttackScreen` set both — on Android RN drops the custom font when `fontWeight` is also present. |
| **6 greens, 6 reds** for two meanings | `#4CAF50 #4ADE80 #22C55E #10B981 #16A34A #30D158` / `#EF4444 #FF6B6B #F44336 #FF4444 #F87171 #E53935`. |
| **No neutral text token exists** | `TEXT_SECONDARY` and `TEXT_MUTED` are *both* gold. Any screen needing gray body text hardcodes `#64748B`, `#94A3B8`, `#888`, or `#666`. |
| **Category colors collide** | 21 categories, 33 color entries, unvalidated. Groceries `#34C759`, ATM `#34C759`, Fitness `#30D158` are three near-identical greens. |
| **No tokens** for typography, elevation, or hairlines | Every screen reinvents them. |

### What makes `AdvancedAnalyticsScreen` work

1. Cards are `#111111` at radius 24 with **no border** — separation by value, not outline.
2. Space Grotesk on every text node (19 `fontFamily`, 0 `fontWeight`).
3. Hairlines are neutral white at 5–8% alpha, not gold.
4. Gold appears only as an *accent*: active chip, bar fill, rank number. Never as a border or body text.
5. Zero decorative gradients. (The rest of the app has 38 `LinearGradient` usages.)
6. A single coherent type scale: 34 hero / 18 header / 16 section / 14 row / 11–12 meta.

---

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Themes | **Two: Obsidian (dark) + Ledger (light)** | Chosen from a five-direction study. Same geometry, different colour and elevation technique, so switching modes never reflows a screen. |
| Default mode | **Follow the OS**, overridable to Dark or Light | A tester on a light-mode phone should actually see Ledger. One-line change in `ThemeProvider` if we'd rather default to dark. |
| Secondary/muted text | **Neutral grays; gold reserved for accent** | Stops gold leaking into body copy. Slightly changes AdvancedAnalytics' 11px labels — accepted. |
| Auth flow | **Full rebuild** onto the black/elevated language | It's the first surface every Play tester sees; re-tokening alone would leave it looking like a different app. |
| Migration structure | **Tokens + shared UI kit**, then rewrite screens against it | Screens shrink, and future features are consistent by default. |
| Gradients | **Removed** from the product surface | Retained nowhere; elevation carries the hierarchy. |
| Gold glow shadows | **Removed** (tab bar, buttons, auth cards) | Replaced by neutral elevation shadows. |

---

## 3. Token system — `src/constants/tokens.js`

### 3.0 Two themes, one geometry

`SPACING`, `RADIUS` and `TYPE` are shared; only colour and elevation differ. The
two modes separate surfaces by opposite means, and this is the part that is easy
to get wrong:

| | Obsidian (dark) | Ledger (light) |
|---|---|---|
| Page | `#000000` | `#EAE7DC` |
| Card | `#111111` | `#FFFFFF` |
| How a card separates | It is **lighter** than the page. No border, no shadow. | It is lighter *and* carries a `rgba(23,21,15,0.10)` hairline plus a tight contact shadow. |

On a light ground the dark-mode trick inverts — a card cannot be meaningfully
lighter than a near-white page — so Ledger pushes the page deeper (`#EAE7DC`,
not off-white) and adds a hairline. `CARD_BORDER_WIDTH` is `0` in Obsidian and
`1` in Ledger; components read it rather than branching on mode.

Runtime plumbing lives in `src/theme/ThemeProvider.js`: `useTheme()` for tokens,
`useThemeMode()` for the System/Dark/Light setting (persisted to AsyncStorage),
and `useThemedStyles(factory)` for themed `StyleSheet`s.

### 3.1 Surfaces

```js
BG:              '#000000'                   // page
SURFACE:         '#111111'                   // card — the AdvancedAnalytics look
SURFACE_HIGH:    '#1C1C1E'                   // nested card, input field, pressed state
SURFACE_SUNKEN:  'rgba(255,255,255,0.06)'    // bar tracks, progress rails
HAIRLINE:        'rgba(255,255,255,0.06)'    // row dividers
HAIRLINE_STRONG: 'rgba(255,255,255,0.12)'    // card border, only when a card sits on a card
SCRIM:           'rgba(0,0,0,0.75)'          // modal backdrop
```

**Rule:** a card is defined by its surface value. Borders are the exception, not the default.

### 3.2 Text

```js
TEXT_PRIMARY:   '#FFFFFF'   // values, titles
TEXT_SECONDARY: '#A1A1AA'   // body copy, descriptions
TEXT_MUTED:     '#71717A'   // labels, metadata, timestamps
TEXT_DISABLED:  '#52525B'
TEXT_ON_GOLD:   '#000000'
```

### 3.3 Accent — one gold

```js
GOLD:        '#C9A227'
GOLD_LIGHT:  '#E5C048'                    // hover/active highlight only
GOLD_DIM:    'rgba(201,162,39,0.15)'      // tinted icon backdrops
GOLD_BORDER: 'rgba(201,162,39,0.35)'      // only where gold outline is intentional
```

`#D4AF37` and `#C5A028` are deleted. Gold is **not** a categorical chart slot.

### 3.4 Semantic — one value per role

```js
SUCCESS: '#30D158'   SUCCESS_DIM: 'rgba(48,209,88,0.15)'
DANGER:  '#FF453A'   DANGER_DIM:  'rgba(255,69,58,0.15)'
WARNING: '#FF9F0A'   WARNING_DIM: 'rgba(255,159,10,0.15)'
INFO:    '#0A84FF'   INFO_DIM:    'rgba(10,132,255,0.15)'
```

Reserved. Never reused as a series color. Always shipped with a sign, arrow, or
label — never color alone.

### 3.5 Categorical palette — validated, fixed order

One ramp per mode, each validated by `dataviz/scripts/validate_palette.js`
against its *own* card surface. The dark ramp is illegible on white, so light
gets its own rather than reusing it.

```
Obsidian, vs #111111
#00A8AD  #CB8100  #4D90FF  #84A200  #9B76FF  #00B14F  #FF269D   + #8A8A8E
 teal     amber    blue     olive    purple   green    pink        other

Ledger, vs #FFFFFF
#0089A1  #A96B00  #096EFF  #6D8600  #8745FF  #009340  #DA0083   + #6E6A62
```

Both report:

```
[PASS] Lightness band   [PASS] Chroma floor   [PASS] CVD separation   [PASS] Contrast
```

The current palette **fails** the same test (5 of 8 colors outside the lightness
band). The light ramp needed a different teal from a straight darkening of the
dark one — the obvious step fell below the chroma floor and read as gray on white.

Applied as:
- The app's 21 categories map onto these 7 hues; a category's **icon** is the
  secondary encoding that disambiguates two categories sharing a hue.
- Charts plot only the **top 7 categories + "Other"**, so no more than 8 slots are
  ever on screen at once.
- Assignment is by category identity and fixed — a filter that changes which
  categories are visible must never repaint the survivors.

### 3.6 Typography — `TYPE` presets

Each preset bundles family + size + lineHeight + tracking. **`fontWeight` is banned**;
weight comes from the family.

| Preset | Family | Size / LH | Use |
|---|---|---|---|
| `HERO` | Bold | 34 / 40 | headline currency figure |
| `H1` | Bold | 24 / 30 | screen title in a hero card |
| `H2` | Bold | 18 / 24 | header bar title, card hero |
| `TITLE` | Bold | 16 / 22 | section card title |
| `BODY` | Regular | 14 / 20 | row text, descriptions |
| `BODY_MED` | Medium | 14 / 20 | row emphasis |
| `NUM` | Bold | 14 / 20 | amounts in rows |
| `LABEL` | Medium | 12 / 16 | chips, buttons, sub-labels |
| `META` | Regular | 11 / 15 | timestamps, counts, footnotes |
| `OVERLINE` | Medium | 11 / 14, +1 tracking, uppercase | section headings |

### 3.7 Elevation

```js
ELEVATION.NONE      // cards — surface value carries it
ELEVATION.FLOATING  // tab bar, FAB: black shadow, 0.4 opacity, radius 16, y+8
ELEVATION.SHEET     // bottom sheets, modals
```

No colored shadows.

### 3.8 Backward compatibility

`CARD_BG`, `CARD_BORDER`, `SURFACE_ELEVATED`, `NAVY`, `GRAY_LIGHT`, `GRAY_DARK`,
`RED`, `GREEN`, `TEAL` are kept as deprecated aliases pointing at the new tokens, so
un-migrated screens keep compiling. They are deleted at the end of Phase 4.

---

## 4. Shared UI kit — `src/components/ui/`

Extracted from the patterns already proven in `AdvancedAnalyticsScreen`.

| Component | API | Replaces |
|---|---|---|
| `Screen` | `{ children, scroll, refreshing, onRefresh }` | per-screen container + StatusBar + SafeArea boilerplate |
| `ScreenHeader` | `{ title, onBack, right }` | 12 hand-rolled header rows |
| `Card` | `{ children, padded, tone, style }` | 49 `CARD_BG` blocks |
| `SectionTitle` | `{ title, subtitle, right }` | ~40 title/subtitle pairs |
| `Overline` | `{ children }` | uppercase section headings |
| `StatTile` / `StatGrid` | `{ label, value, sub, subColor }` | metric grids on Home, Analytics, Debt |
| `SegmentedControl` | `{ options, value, onChange }` | 4 duplicated period togglers |
| `Chip` / `ChipRow` | `{ icon, label, active, color, onPress }` | filter rows |
| `Button` | `{ variant: primary\|secondary\|ghost\|danger, size, loading, icon }` | ~30 ad-hoc buttons |
| `Input` | `{ label, error, icon, secureTextEntry }` | auth + feedback form fields |
| `ChangeBadge` | `{ percent, invert }` | delta pills |
| `ListRow` | `{ icon, iconColor, title, subtitle, value, valueColor, onPress }` | transaction / account / merchant rows |
| `BarTrack` | `{ value, max, color }` | leaderboard + histogram bars |
| `EmptyState` | `{ icon, title, message, action }` | ~15 empty blocks |
| `LoadingState` | `{ message }` | ~15 spinner blocks |

Every primitive consumes tokens only. No component accepts a raw hex.

---

## 5. Migration phases

Each phase is one commit on `dev`, deployed to staging, verified with an EAS
`preview` build before the next begins.

**Phase 0 — tokens.** Rewrite `theme.js` with aliases. No screen changes.
Ship `docs/DESIGN_SYSTEM.md`.

**Phase 1 — UI kit.** Build `src/components/ui/`. Refactor
`AdvancedAnalyticsScreen` onto it first — it's the reference, so it proves the kit
without any visual change. That's the regression test.

**Phase 2 — the five tabs + tab bar.** `HomeScreen`, `InsightsScreen`,
`DebtAttackScreen`, `WatchdogScreen`, `ProfileScreen`, `AppNavigator`. Biggest
payoff per file touched. Tab bar loses its gold glow and gold border.

**Phase 3 — secondary screens + shared components.** `AnalyticsScreen`,
`AllTransactionsScreen`, `AllAccountsScreen`, `AccountTransactionsScreen`,
`ETFListScreen`, `WealthAcademyScreen`, `FeedbackScreen`, `LegalDocScreen`,
`ArticleWebViewScreen`, plus `InsightCardV2`, `FinancialHealthScore`,
`InvestmentCorner`, `ArticleCard`, `CustomAlert`, `AlertBanner`, `ErrorMessage`,
`DataFreshnessIndicator`, both bottom sheets. Also re-maps
`utils/categorization.js` onto the validated palette.

**Phase 4 — auth flow rebuild.** `LoginScreen`, `SignupScreen`,
`ForgotPasswordScreen`, `ResetPasswordScreen`, `EmailVerificationScreen`,
`ConnectBankScreen`. Slate and gradients removed entirely. Deprecated theme
aliases deleted at the end of this phase.

**Phase 5 — guardrails.** ESLint rule rejecting raw hex and `fontWeight` inside
`StyleSheet.create`, so the drift can't come back with the next feature.

### Ordering note

Phase 4 could be promoted ahead of Phase 2 — the auth flow is the first thing a
new Play tester sees and it's the most off-brand surface in the app. Kept at 4 for
now because the kit needs to prove itself on screens with real data first.

---

## 6. Success criteria

- Zero raw hex values in `screens/` and `components/` (excluding `constants/` and
  the categorical map), enforced by lint.
- Zero `fontWeight` in `StyleSheet.create`; every text node resolves to Space Grotesk.
- One gold, one green, one red, one amber, one blue in the entire app.
- The categorical palette passes `validate_palette.js` on `#111111`.
- Every screen's cards read as elevated surfaces, not outlined boxes.
- No visual regression on `AdvancedAnalyticsScreen` after its Phase 1 refactor.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Large diff across 32 files → hard to review, easy to break a screen | One phase per commit; deprecated aliases keep un-migrated screens compiling at every step. |
| No test suite; regressions are visual only | Staging deploy + EAS `preview` build checked on-device after each phase. |
| Android font/weight quirk | `fontWeight` banned outright; lint rule in Phase 5 makes it permanent. |
| Play review in flight | All work lands on `dev` → staging. Nothing reaches the production branch until the current review resolves and the revamp is verified end-to-end. |
