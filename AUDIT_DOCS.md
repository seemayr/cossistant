# Cossistant Docs Audit

Date: 2026-03-06

## Scope

- Primary scope: `apps/web/content/docs/**/*.{mdx,json}`
- Fact-checking source: package source only where the public docs make product or API claims
- Perspective: an ICP trying to add customer support to a React or Next.js SaaS quickly
- Existing docs were not changed as part of this audit

## Verdict

The docs are promising, but not yet good enough for frictionless ICP onboarding.

The current set explains the widget API reasonably well once a developer is already committed, but it does not do enough to answer the first-order product and setup questions an ICP will have before they trust the install path. The biggest issues are not styling or polish. They are missing prerequisites, the wrong installation mental model, and a lack of operational guidance after the widget is embedded.

## What Is Working

- Quickstarts exist for both Next.js and React, which is the right place to start for the target audience. Evidence: `apps/web/content/docs/(root)/index.mdx:6-40`, `apps/web/content/docs/quickstart/index.mdx:10-159`, `apps/web/content/docs/quickstart/react.mdx:10-205`
- API key basics are documented clearly enough for a developer who already understands the product model. Evidence: `apps/web/content/docs/quickstart/api-keys.mdx:6-89`
- The overall product direction is understandable: open, code-first, customizable support rather than an iframe black box. Evidence: `apps/web/content/docs/(root)/what.mdx:6-18`
- The docs do have meaningful depth once a user gets past setup: customization, routing, text, hooks, events, and primitives all exist. Evidence: `apps/web/content/docs/support-component/meta.json:1-14`

## Findings

### P0 — Missing prerequisite model

Why it matters to the ICP:
An ICP does not start with component props. They start with "What is this operationally?" and "What do I need before I install it?" Right now the docs jump from product positioning to public key setup without clearly explaining whether Cossistant is hosted, self-hosted, dashboard-dependent, or hybrid.

Evidence:

- The docs homepage positions Cossistant as open source infrastructure, but does not explain the delivery model. `apps/web/content/docs/(root)/what.mdx:6-18`
- The API key guide immediately tells users to get a key from `Settings → Developers`, which implies a hosted dashboard, but never explains that prerequisite as part of the onboarding flow. `apps/web/content/docs/quickstart/api-keys.mdx:6-9`
- The provider supports `apiUrl`, `wsUrl`, `publicKey`, `autoConnect`, and websocket lifecycle hooks, which strongly suggests non-default deployment shapes, but those options are not explained in the public docs flow. `packages/react/src/provider.tsx:64-76`

What is missing:

- Hosted vs self-hosted explanation
- Whether a Cossistant account/dashboard is required for the standard path
- When a customer should use the default hosted setup vs custom `apiUrl` / `wsUrl`
- What must be configured in the dashboard before installation

Recommendation:

- Add a task-first page before quickstart: `Hosted vs Self-Hosted`
- Add a second prerequisite page: `Dashboard Setup`
- In both quickstarts, state the default assumption explicitly: hosted Cossistant, dashboard-created public key, default endpoints unless self-hosting

### P0 — Wrong installation mental model

Why it matters to the ICP:
Most SaaS teams expect support to be a persistent app-shell feature, not a component they sprinkle into random pages. The docs currently teach a local-page mount pattern, which creates uncertainty about duplication, persistence across routes, and where the widget should live in App Router apps.

Evidence:

- The Next.js quickstart correctly places `SupportProvider` in `app/layout.tsx`, then teaches rendering `<Support />` in `app/page.tsx`. `apps/web/content/docs/quickstart/index.mdx:24-44`, `apps/web/content/docs/quickstart/index.mdx:87-100`
- The same page later shows `SupportConfig` and another `<Support />` in `app/page.tsx`, reinforcing a page-local placement pattern. `apps/web/content/docs/quickstart/index.mdx:127-156`
- The basic usage page says "Drop `<Support />` anywhere in your app," which is technically true but operationally vague for the main SaaS use case. `apps/web/content/docs/support-component/index.mdx:28-45`

What this causes:

- Users will wonder whether the widget should mount once globally or once per route
- Users may accidentally mount multiple widgets
- Users do not get a clean pattern for combining global widget placement with route-level `SupportConfig`

Recommendation:

- Make the primary pattern explicit: mount `SupportProvider` in the root layout and mount `<Support />` once in the global shell
- Move per-route `SupportConfig` into a separate section named something like `Customize Per Route`
- For Next.js, show the canonical App Router shape: `app/layout.tsx` owns provider and widget, nested route layouts/pages own visitor identification and per-page config

### P0 — Missing operational workflow

Why it matters to the ICP:
Embedding the widget is only half the job. The ICP also needs to know who answers the messages, how support gets staffed, and how AI vs human support is configured. The docs mention those concepts, but they do not provide an operational path.

Evidence:

- The conversations docs talk about human agents, AI agents, mixed mode, internal notes, and dashboard tracking. `apps/web/content/docs/concepts/conversations.mdx:85-122`
- The quickstart API key page assumes a dashboard and developer settings. `apps/web/content/docs/quickstart/api-keys.mdx:6-9`
- The public docs navigation has `Get Started`, `Quickstart`, `Support`, `Concepts`, and `Others`, but no section for operating the system after install. `apps/web/content/docs/meta.json:1-4`

What is missing:

- How messages are answered
- How to invite teammates
- How to configure AI vs human support
- How to train the AI or attach knowledge sources
- What the inbox workflow looks like after install

Recommendation:

- Add an `Operate` section to the docs
- Start with four task pages: `How Messages Get Answered`, `Invite Teammates`, `Configure AI and Human Support`, `Train AI / Add Knowledge Sources`
- Link to those pages directly from quickstart completion states

### P1 — Factual error in concepts

Why it matters to the ICP:
When core concepts disagree with the actual SDK types, trust drops fast. This is especially damaging in API docs, because developers stop believing the rest of the reference.

Evidence:

- The conversations docs say conversation priority values are `low`, `medium`, `high`, and `urgent`, and describe `medium` as the default. `apps/web/content/docs/concepts/conversations.mdx:14-19`, `apps/web/content/docs/concepts/conversations.mdx:42-49`
- The actual enum is `LOW`, `NORMAL`, `HIGH`, `URGENT`. `packages/types/src/enums.ts:18-23`

Recommendation:

- Fix `medium` to `normal`
- Audit the rest of the concept pages against exported enums and literal values, not just narrative descriptions

### P1 — Navigation defect

Why it matters to the ICP:
A broken nav entry makes the docs feel incomplete and increases the chance that users assume the product surface is unfinished.

Evidence:

- The `<Support />` section nav includes an `about` page. `apps/web/content/docs/support-component/meta.json:2-11`
- There is no `apps/web/content/docs/support-component/about.mdx` in the docs tree

Recommendation:

- Remove the `about` entry from `support-component/meta.json` or create the missing page
- Add a docs-tree integrity check in CI for `meta.json` entries

### P1 — Reference-heavy structure

Why it matters to the ICP:
The docs move from quickstart into deep reference too quickly. That works for committed users, but it is not the right shape for first-time adoption. The ICP needs task-based docs before they need a 1,450-line hook reference.

Evidence:

- Both quickstarts end by sending users to the general `Support component guide`, not to a next-step task flow. `apps/web/content/docs/quickstart/index.mdx:159`, `apps/web/content/docs/quickstart/react.mdx:205`
- The `Support` section is dominated by large reference-style pages rather than task pages. `apps/web/content/docs/support-component/meta.json:1-14`
- Local measurement in this repo snapshot: `apps/web/content/docs/support-component/hooks.mdx` is about 1,450 lines, `apps/web/content/docs/support-component/index.mdx` is about 412 lines

Recommendation:

- Keep the reference pages, but stop using them as the primary next step for new users
- Add task pages between quickstart and reference: `Install Globally`, `Identify Users`, `Customize Copy`, `Theme It`, `Go Live`
- Split `hooks.mdx` into smaller pages or at least add a strong task-oriented table of contents near the top

### P1 — Audience mismatch in nav

Why it matters to the ICP:
The public docs nav mixes adoption docs with contributor onboarding, credits, vendor disclosures, and `llms.txt`. That makes the docs feel less focused and makes it harder for a buyer-builder to stay on the install path.

Evidence:

- The top-level docs nav includes `others`. `apps/web/content/docs/meta.json:1-4`
- The `Others` section includes `contributors`, `mentions`, `third-party-services`, and a direct `llms.txt` link. `apps/web/content/docs/others/meta.json:1-9`
- The contributors guide is a full local-dev setup document for the repo itself, not a customer integration guide. `apps/web/content/docs/others/contributors.mdx:1-340`

Recommendation:

- Remove `Others` from the main customer docs path
- Move contributor docs to a footer link or a separate `/contributing` area
- Move `Mentions` and `Third-Party Services` under company/legal/footer navigation, not product docs navigation

### P2 — Trust-reducing copy issues

Why it matters to the ICP:
Developer docs do not need marketing polish, but they do need precision. Grammar mistakes and loose phrasing make the product feel less mature than it is.

Evidence:

- `what.mdx` has visible grammar issues: "every components," "to defined your agents," and an awkward sentence about ad blockers. `apps/web/content/docs/(root)/what.mdx:8`, `apps/web/content/docs/(root)/what.mdx:15-16`
- `mentions.mdx` uses inconsistent capitalization and casual phrasing like "license ofc." `apps/web/content/docs/others/mentions.mdx:12-20`

Recommendation:

- Run a focused copy-edit pass on the overview, credits, and legal-adjacent pages
- Tighten language toward developer precision rather than brand flourish

### P2 — License inconsistency

Why it matters to the ICP:
License ambiguity is a trust and procurement problem. If two public docs pages disagree, teams will hesitate to adopt or escalate the issue internally.

Evidence:

- The contributors guide says Cossistant is licensed under `AGPL-3.0` for non-commercial use. `apps/web/content/docs/others/contributors.mdx:338-340`
- The mentions page says Cossistant is open source under `GPL-3.0`. `apps/web/content/docs/others/mentions.mdx:18-20`

Recommendation:

- Choose one canonical public license statement
- Put that statement on a dedicated legal/license page
- Replace all other ad hoc references with a link to the canonical source

### P2 — Thin rollout and troubleshooting coverage

Why it matters to the ICP:
The install path gets users to "hello world," but not to a safe production launch. The current troubleshooting coverage is too narrow for the problems real SaaS teams hit.

Evidence:

- The API key guide covers only env naming, active keys, restart after env changes, and domain allowlisting. `apps/web/content/docs/quickstart/api-keys.mdx:74-89`
- The quickstarts stop after render, identify, and `SupportConfig`; there is no production checklist, staging guidance, or deployment troubleshooting section. `apps/web/content/docs/quickstart/index.mdx:102-159`, `apps/web/content/docs/quickstart/react.mdx:148-205`

What is missing:

- Staging and preview environment guidance
- Live vs test key rollout strategy
- Domain allowlisting behavior across preview deployments
- Websocket/connectivity troubleshooting
- "Widget does not show" decision tree beyond key naming

Recommendation:

- Add `Production & Troubleshooting`
- Include widget-not-showing, invalid key, blocked domain, websocket failure, staging preview, and env mismatch scenarios

## Questions The ICP Will Ask That The Docs Do Not Answer Clearly

- Do I need a hosted Cossistant account to use this?
- Can I self-host it, and if so, which docs apply to me?
- What do I need to set up in the dashboard before I install the SDK?
- Where should I mount `SupportProvider` and `<Support />` in a Next.js App Router SaaS?
- How should I identify logged-in users correctly across layouts, route groups, and auth boundaries?
- Who answers messages after install: humans, AI, or both?
- How do I invite teammates to handle support?
- How do I train the AI or add FAQ/web knowledge sources?
- What changes between local, staging, preview, and production?
- How do I troubleshoot widget-not-showing, invalid key, blocked domain, or websocket failures?

## Simplification Recommendations

### Recommended information architecture

Use four buckets instead of the current mix:

1. `Get Started`
   - What is Cossistant?
   - Hosted vs Self-Hosted
   - Dashboard Setup
   - Quickstart: Next.js
   - Quickstart: React
2. `Configure`
   - API Keys and Allowed Domains
   - Identify Users
   - Theme and Copy
   - Custom Pages and Routing
3. `Operate`
   - How Messages Are Answered
   - Invite Teammates
   - Configure Human and AI Support
   - Train AI / Add Knowledge Sources
   - Production and Troubleshooting
4. `Reference`
   - Support component API
   - Hooks
   - Primitives
   - Concepts

### Specific simplifications

- Move `contributors`, `mentions`, `third-party-services`, and `llms.txt` out of the main customer docs nav
- Add task-oriented pages before sending users into large reference pages
- Make the global widget install pattern the default story, and per-route config the secondary story
- Split oversized reference pages where possible, especially `hooks.mdx`

## Recommended Fix Order

1. Add `Hosted vs Self-Hosted` and `Dashboard Setup`
2. Rewrite the primary quickstart to teach the global app-shell installation pattern
3. Add an `Operate` section with team, agent, inbox, and AI-training guidance
4. Fix factual and navigation defects (`medium` vs `normal`, missing `about`)
5. Remove non-adoption pages from the main docs nav
6. Add a production and troubleshooting guide
7. Run a copy and consistency pass on overview/legal-adjacent pages

## Final Note

This audit is based on the MDX docs under `apps/web/content/docs` and the associated docs navigation metadata. Package source was used only to fact-check public docs claims. No existing docs files were modified during this audit.
