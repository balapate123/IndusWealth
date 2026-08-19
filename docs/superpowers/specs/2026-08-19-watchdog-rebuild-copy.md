# Watchdog Rebuild — Copy as Specification

**Date**: 2026-08-19
**Status**: Draft for review — copy is written first, deliberately
**Branch**: dev
**Supersedes**: the UI copy in `2026-04-15-watchdog-subscription-tracking-design.md`
(that document's schema, caching and action-persistence design still stand)

---

## Why the copy comes first

Every string below is a claim, and every claim pins an engineering rule. If a
sentence cannot be written honestly, the rule behind it is wrong and it is
cheaper to discover that here than after the detector is rebuilt.

Section 12 maps each promise back to the rule it obligates.

## Voice rules

1. **Never claim the app did something it did not.** It cannot cancel. It cannot
   negotiate. It can find, explain, and verify.
2. **Never scold.** Same rule the insights prompt already enforces (rule 31, and
   `test_insight_identity.cjs` asserts our own copy holds the line). A person who
   has four streaming services made four decisions; our job is arithmetic, not
   disapproval.
3. **Never state a figure we cannot show the working for.** Confirmed savings are
   measured. Projected savings are labelled as projections, in smaller type.
4. **Prefer evidence to adjectives.** "Charged on the 14th, four months running"
   beats "high confidence" and needs no legend.
5. Canadian spelling — *cancelling*, *licence* (noun), *analyze*. Amounts as
   `$16.49`, no currency code.

---

## 1. Screen and section headers

Screen title stays **Watchdog**.

Three sections, each with a subhead that states its action model. These nine
words are the actual training:

| Section | Subhead |
|---|---|
| **Subscriptions** | You can cancel these. |
| **Bills** | You can often lower these. |
| **Fixed payments** | Here so you can plan around them. |

Sections with no rows are not rendered — no empty headers.

## 2. The savings header

Replaces the current "Potential monthly savings", which counts money the user
has not saved.

**Primary (hero):**
> **Confirmed savings**
> $16.49 a month
> Netflix stopped on Aug 14. We checked.

**When nothing is confirmed yet:**
> **Confirmed savings**
> $0 a month
> When you cancel or lower something, we'll confirm it here once the charge
> actually stops.

**Secondary line, always smaller, never the hero:**
> 3 flagged · up to $48 a month if you follow through

**Annual toggle** keeps the existing Monthly/Annual segmented control. Annual
reads: `$197.88 a year` with `Based on $16.49 a month, confirmed.`

## 3. The row

The evidence line replaces the unlabelled `●` / `○` confidence dots.

```
Netflix                                    $16.49
Charged on the 14th · 4 months running
```

Evidence line by frequency:

| Pattern | Line |
|---|---|
| Monthly, stable amount | `Charged on the 14th · 4 months running` |
| Bi-weekly | `Every 2 weeks · last 6 charges` |
| Quarterly | `Every 3 months · since January` |
| Annual | `Once a year, each March` |
| Bill with varying amount | `Monthly, around the 3rd · $88–$142` |

The range is shown **only** for Bills. A Subscription showing a range means the
amount gate leaked and the row should not be there.

## 4. The intro card

First visit only. A dismissible `Card` at the top of the scroll — not a modal,
not a carousel. Dismissal stored locally via `services/cache.js`.

> **What Watchdog does**
>
> We read your transaction history for payments that repeat — subscriptions,
> bills, and fixed payments like rent or a loan.
>
> We can't cancel or renegotiate anything for you. Only you can do that. What we
> can do is watch your account afterward and tell you whether it actually
> stopped.
>
> `[ How Watchdog works ]`  `[ Got it ]`

"How Watchdog works" opens a Wealth Academy article (section 11). "Got it"
dismisses.

## 5. Empty states

**No account connected:**
> **Connect an account to start**
> Watchdog reads your transaction history to find payments that repeat. There's
> nothing to read yet.
> `[ Connect an account ]`

**Connected, not enough history:**
> **Not enough history yet**
> We wait until we've seen a payment at least three times before calling it
> recurring. Twice could be a coincidence.
> Keep your account connected and check back next month.

**Nothing found, enough history:**
> **No repeating payments found**
> Nothing in your history repeats on a schedule yet. We'll keep looking.

**A filter chip matches nothing:**
> Nothing in this category.

## 6. Buttons

Actions come from the row's class. This is what removes the dead taps — a button
that has no path behind it is never rendered.

| Class | Buttons |
|---|---|
| **Subscription** | `Cancel…` · `Negotiate…` *(only where a script exists)* · `Keep` |
| **Bill** | `Lower this bill…` *(only where a script exists)* · `Keep` |
| **Fixed payment** | none |
| **Any, after action** | `Watching · next charge Aug 14` |

The ellipsis is load-bearing. It is the standard signal for "this opens
something, there are more steps", and it stops the label implying we do the
cancelling.

`Keep` confirms with:
> Kept. We'll stop flagging it.

...which obligates the detector to honour that (section 12).

## 7. The cancel sheet

Fits the existing `CancellationBottomSheet` slots. The new element is the header
block, above "How to cancel" — the most important copy in the feature, because
it arrives at the moment of intent and cannot be skipped.

> **You'll do this on Netflix's site — we can't cancel it for you.**
> About 2 minutes. When you're done, tell us and we'll check your next statement
> to confirm it stopped.

For an unknown merchant the first line becomes:
> **You'll need to cancel this with Petro-Canada directly — we can't do it for
> you.**

### Guide tiers — `guide` is never `null`

**Tier 1 — merchant guide** (the 12 in `cancellation_guides.json`). Existing
steps, direct URL, estimated time, pause note.

Every Tier 1 guide gains one universal tip:
> If you signed up through the App Store or Google Play, you have to cancel
> there — cancelling on the company's own site won't stop the billing.

**Tier 2 — category guide.** Keyed on class, so it covers every merchant we will
ever detect. Under "How to cancel":

- **Streaming / Music** — "Most services cancel from Account → Membership or
  Subscription on their website. Your access usually runs to the end of the
  period you've already paid for."
- **Software** — "Usually under Account → Plan or Billing. Annual plans can
  charge a fee for leaving early — check before you confirm."
- **Health & fitness** — "Gyms often need notice in writing, and Ontario has
  specific rules for fitness contracts — check your agreement. Ask for written
  confirmation and the date of your final payment." *(see legal note below)*
- **News** — "Usually under Account → Subscription. Many will offer you a
  discount when you try to leave, which is worth hearing out."
- **Insurance** — "Insurance usually can't be cancelled by phone alone; expect
  to sign something. Ask whether leaving mid-term costs a fee, and don't cancel
  coverage you're required to carry."
- **Telecom / Utilities** — cancelling is rarely the goal; route to the bill
  sheet instead.

**Tier 3 — no guide at all:**
> We don't have step-by-step instructions for this one. Search
> "<merchant> cancel subscription", or open your last email receipt from them —
> it usually has a link to manage or cancel.

All three tiers end identically:
> `[ I've cancelled this ]`
> We'll check your account around Aug 14 and tell you whether the charge stopped.

### Cut from this sheet

**The `alternatives` block.** It hardcodes competitor names and prices that are
already going stale in a JSON file, and it is the last place in the app that
recommends a named product off the user's own spending — the shape that caused
the Play rejection, even though streaming is not a financial product. Someone
cancelling Netflix does not need us to list Crave. Delete the block and the
`alternatives` field with it.

## 8. The negotiate sheet

Header block, above the script:

> **You'll need to call them — we can't negotiate for you.**
> Ask for "retention" or "cancellations". Those agents can approve discounts
> that front-line support cannot.
> Expect 15–20 minutes. Tell us how it went and we'll watch your next bill.

**`expectedDiscount` is reframed.** "Expected discount: 20%" is a promise we do
not control. It becomes a target:
> **What to aim for:** 20% off, or a credit for the difference.

Existing slots — script, retention number, best time to call, tips — keep their
current copy. Retention numbers need the `link_registry.js` treatment
(verifiable, checked) before they can be trusted; phone numbers rot exactly like
the AI insight URLs did.

"Competitor options" is cut for the same reason as section 7.

> `[ I've called them ]`
> We'll watch your next bill and tell you if the amount changed.

## 9. Watching, and the two outcomes

The state that makes the buttons worth pressing.

**While watching:**
> Watching · next charge expected Aug 14

**Confirmed stopped:**
> **Netflix stopped.**
> No charge on Aug 14. That's $16.49 a month back — $197.88 a year.

**Charged again** — note the benign explanation comes first, and there is no
version of this that implies the user failed:
> **Netflix charged you again.**
> You marked this cancelled on Jul 5, and a $16.49 charge landed on Aug 14.
> Cancellations sometimes take one more billing cycle. If you have a
> confirmation, it may be worth disputing this one.

**Negotiation worked:**
> **Rogers went down.**
> Your bill dropped from $95.00 to $83.00. That's $144 a year.

**Negotiation didn't:**
> **Rogers hasn't changed.**
> Still $95.00 on Aug 3. Retention offers sometimes land on the following cycle,
> so we'll keep watching one more.

## 10. Alerts

Rewrites of the four types already computed in `generateAlerts`.

**Price increase:**
> **Netflix went up $2.50**
> From $13.99 to $16.49 on Jul 14. That's $30 more a year.

**Several in one category** — the current string ends "Consider consolidating.",
which instructs. State the fact and stop:
> **4 streaming services**
> Netflix, Disney+, Crave and Prime Video — $48.46 a month together.

**New subscription:**
> **New: Adobe**
> First charge Jul 2, $27.11. If this followed a free trial, this is the first
> real bill.

**Annual option** — about a product they already pay for, not a new one:
> **Disney+ has an annual plan**
> Paying yearly instead of monthly would be $23.88 less over 12 months.

## 11. The long version

`educational_articles` and Wealth Academy already exist. **"How Watchdog works"**
is the home for what does not belong on the screen: why three charges, why a
mortgage has no buttons, what happens after you tap Cancel, why something you
expected is missing. Linked from the intro card; in-catalog, so it satisfies the
link-registry rules without a new destination.

---

## 12. What this copy obligates

The point of writing it first. Each promise is now a testable rule:

| Copy | Rule it pins |
|---|---|
| "at least three times… twice could be a coincidence" | Minimum 3 charges. Two points is one interval and cannot be validated. |
| "Charged on the 14th · 4 months running" | Day-of-month anchoring, not the `25–35 day` interval band. The `0–10 day → weekly` band is deleted. |
| Range (`$88–$142`) shown only under **Bills** | Amount stability is a hard gate for Subscriptions; variance allowed only for merchants on the known variable list (utilities, telecom). |
| "You can cancel these / lower these / plan around them" | Three classes exist as data; every action derives from class. |
| No `Negotiate…` button without a script | Button rendered from guide data, not hope. Currently 5 merchants qualify. |
| "we'll check your next statement" | The watch loop: `nextExpected` + a resolution pass, both outcomes handled. |
| "Confirmed savings" as the hero | Savings = verified stops and verified reductions only. The projection moves to a labelled secondary line. |
| "Kept. We'll stop flagging it." | `suggestAction` must respect a prior `keep`. It currently re-suggests `negotiate` for any telecom or utility with a guide on every analysis, so a kept row comes straight back. |
| "we can't cancel it for you" (×3 surfaces) | No copy anywhere may imply otherwise, including notifications and insight cards. |
| Every tier ends with `I've cancelled this` | `recordAction` never returns `guide: null`; the sheet always opens. |

## 13. Strings deleted

| String | Why |
|---|---|
| `●` / `○` confidence dots | No legend anywhere in the app. Replaced by the evidence line, which needs none. |
| "Based on your recurring expense analysis" | Says nothing the user can act on. |
| "Consider consolidating." | Instructional. Violates rule 2. |
| `alternatives` names + prices (both sheets) | Stale hardcoded pricing; product steering off user data. |
| "Expected discount: 20%" | A promise we do not control. Becomes "What to aim for". |
| "We need at least 2 months of transaction history" | Wrong rule after the rebuild — it is three charges, not two months. |

---

## Open items before build

1. **Legal check on the fitness-contract line.** Ontario's Consumer Protection
   Act does set rules for personal development services, but this copy should be
   verified against the current statute or softened to "check your agreement"
   before it ships. We are an Ontario-jurisdiction app with a published financial
   disclaimer; stating a consumer right loosely is not worth the risk.
2. **Retention phone numbers** need verification and a health check, or they
   should be cut and the script kept.
3. **Merchant-name display.** `watchdog.js:737` sends `name: row.merchant_name`
   straight to the row title, so `normalizeMerchantName`'s uppercase output is
   already on screen today — aliased merchants read as `Netflix`, everything else
   as `PETRO-CANADA`. Needs title-casing for unaliased names before the rewrite
   puts more of them in front of people.

---

# Addendum — two constraints raised in review (2026-08-19)

## 14. One category vocabulary, again

Watchdog carries its own category list in `merchant_categories.json` (Streaming,
Music, Telecom, Utilities, Software, Health, Insurance, News, Other). The rest of
the app uses `CANONICAL_CATEGORIES` in `services/category_map.js`. They disagree
on every row that matters:

| Merchant | Watchdog | Canonical |
|---|---|---|
| Netflix | Streaming | Subscriptions |
| GoodLife Fitness | Health | Fitness |
| Rogers | **Other** | Utilities |
| Pioneer, Petro-Canada, Esso | **Other** | Gas & Fuel |
| Intact Insurance | **Other** | Insurance |

This is the third vocabulary in the app, and the same defect commit `0d42375`
("one vocabulary, not two") fixed for transactions. A user reads one name for a
merchant on Analytics and a different one for the same merchant here.

It is also why so much reads as `Other`: `merchantToCategoryMap` only knows the
41 display names hardcoded in that file, so every merchant outside the list falls
through. The category filter chips on the screen are largely decorative as a
result.

**The rule.** One file is doing two jobs and they need separating:

- **The category a user sees comes from `category_map.js`, always.** Watchdog
  calls `canonicalizeCategory(tx.category)` like every other surface. Pioneer is
  `Gas & Fuel` on Analytics and `Gas & Fuel` here.
- **`merchant_categories.json` stops being a category list.** It becomes what it
  actually is — an internal lookup answering "do we hold a cancellation or
  negotiation guide for this merchant". Never displayed.
- The **class** (Subscription / Bill / Fixed payment) derives from the canonical
  category plus the Plaid path, not from the Watchdog list.
- Filter chips are rebuilt from canonical names, so they match the chips
  elsewhere in the app.

A parity test belongs here, matching `tests/category_map.test.mjs`: no
user-visible Watchdog category may be a string absent from
`CANONICAL_CATEGORIES`.

## 15. The guide key is not a display name

Found while checking the above, and it is the second independent cause of the
dead buttons:

```
normalized ROGERS   -> cancellationGuides['ROGERS']   undefined
normalized BELL     -> undefined
normalized TELUS    -> undefined
normalized ADOBE    -> undefined
normalized ENBRIDGE -> undefined
```

**Five of the twelve guides never resolve.** `cancellation_guides.json` is keyed
on the display name `Rogers`, while `normalizeMerchantName` yields `ROGERS` —
`merchant_aliases.json` holds `ROGERS WIRELESS` and `ROGERS CABLE` but no bare
`ROGERS`, which is exactly what `ROGERS *MOBILE` reduces to once the `*` suffix
is stripped.

Four of those five (Rogers, Bell, Telus, Adobe) are the only merchants carrying
negotiation scripts. **Negotiate therefore works for one merchant in the entire
app: GoodLife Fitness.** The twelve-merchant ceiling was never the real limit;
the effective ceiling is seven, and one for negotiation.

**The rule.** A merchant key is a slug, never a display name — the discipline
`insight_identity.js` already applies to model-authored strings. Guides get a
`merchant_key` (`rogers`, `goodlife_fitness`), lookup is case- and
punctuation-insensitive, and a test asserts every key in
`cancellation_guides.json` resolves from its own aliases. That test is what stops
this recurring the next time a merchant is added.

## 16. Notifications for the watch outcome

"Netflix charged you again" is the most valuable message this feature can send,
and it is time-sensitive — disputing a charge has a window. It earns a
notification. Four constraints shape it:

**Content freezes at schedule time.** Same rule as goal reminders. When the user
taps "I've cancelled this" we do not yet know what happens on the 14th, so the
body can never carry the outcome. It is evergreen and points inward:

> **Netflix — your next charge was due Aug 14**
> Tap to see whether it stopped.

The result is fetched on open and presented then. Identical split to
`POST /goals/milestones/check`.

**Fires on the expected date plus three days.** Charges post late. A notification
on the exact day would resolve "it stopped" before the charge had a chance to
land, and a false all-clear is worse than silence. Early is harmless for a
reminder; this is a measurement.

**Dated one-shot, not a repeating trigger.** Unlike goal and card reminders, a
watch is a single future event that expires — but it holds a slot until it fires.

**Budget.** iOS allows 64 pending. The current ceiling is 25 goals x2 + 10 cards
x2 + 1 check-in = 46. Watches cap at **8 concurrent**, taking it to 54 with
headroom left. Eight is generous; people do not cancel eight things at once.

Rules carried over from what already exists:

- Scheduling runs through `reminderSyncQueue` in `services/notifications.js`.
  Cancel-then-reschedule is not concurrency-safe, and two overlapping runs
  schedule everything twice.
- Android gets the **card-due-date treatment** — its own channel at HIGH
  importance. A charge you believed you had cancelled costs real money, and
  silencing savings nudges must not silence this.
- The server records what was actually presented, so two devices cannot both
  announce one outcome. The failure direction is a duplicate, never a loss.
- **Never scold.** The charged-again copy in section 9 leads with the benign
  explanation, and the notification inherits that.
- Nothing about the outcome is stored in the notification, only the schedule. A
  stored outcome goes stale between write and read.
