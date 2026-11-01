# SMS-first navigation and PDF guide

Verified on 29 October 2026 against a local production build and an isolated
PostgreSQL 16.14 database. Browser fixtures covered Super Admin, School Admin,
Teacher and Student, including two different schools.

## Order by importance

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `app/login/LoginForm.tsx:76`, `src/modules/shared/navigation.ts:8` | Sign-in opened CBT or a legacy return path. | Every role opens its SMS dashboard. | The school workspace is the primary entry point. |
| MEDIUM | `app/staff/layout.tsx:13`, `app/student/layout.tsx:7`, `components/staff/ScopeProvider.tsx` | CBT had separate navigation and a separate Super Admin school preference. | Both areas share SMS navigation and the authenticated school selection. | Moving between modules retains the same school and navigation context. |

## Make progressive disclosure visible

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `components/shell/AppShell.tsx:261`, `src/modules/shared/navigation.ts:17` | CBT appeared as another dashboard destination. | A labelled, expandable CBT submenu contains the exam tools and opens on its active routes. | The module hierarchy is visible without displaying every exam link at once. |

## Keep flow vocabulary consistent

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `app/login/LoginForm.tsx:108`, `docs/site-guide.md` | Student sign-in described access to an exam dashboard. | Sign-in describes the school portal; the PDF uses the same navigation and action labels. | Readers can follow the guide without translating different names for the same action. |

## Verification

- Production build and TypeScript checks passed.
- All 31 existing unit tests passed.
- Lint passed with zero errors and 12 existing warnings.
- Fourteen browser checks passed:
  - SMS landing after sign-in for all four roles, including old CBT return paths.
  - External return paths cannot change the sign-in destination.
  - Collapsed/expanded CBT navigation, one active page, and return to SMS.
  - Teacher/student role-specific links and teacher redirects from admin SMS pages.
  - Super Admin ignores the old CBT localStorage school preference.
  - SMS school selection carries into CBT; switching schools invalidates cached layouts.
  - Opening a school from the school directory enters that school's SMS dashboard.
  - Reflow at widths 320, 640, 768, 1280 and 1920 pixels.
  - Keyboard disclosure, mobile focus containment, Escape focus restoration and drawer closure after navigation.
  - RTL mirror of the navigation, with logical submenu indentation.
  - Zero automated WCAG A/AA violations on inspected desktop/mobile navigation states.
- Desktop/mobile screenshots were inspected.
- The 29 October edition of `docs/Ezio-Site-Guide.pdf` contained 16 A4 pages and 14 linked contents entries.
  Cover rendering and extracted text were reviewed; the generator checks text bounds,
  reloads the PDF, and verifies its page count. Fonts are embedded for standalone use.
- Rebuild the standalone guide with `pnpm guide:pdf`; edit its source in
  `docs/site-guide.md`.

Native 200% browser zoom, manual screen-reader testing and the hosted deployment
were **Not verified** in this run. Approval applies to the inspected navigation,
role flows and PDF output.

**Approve**

## Guide refresh — 1 November 2026

### Keep instructions consistent with the interface

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `docs/site-guide.md:9`, `docs/site-guide.md:149`, `docs/site-guide.md:360`, `scripts/generate-site-guide.mjs:138` | The guide and cover covered staff and student access but omitted the parent portal. | Parent phone/PIN sign-in, account/child linking, published reports and two-way form-teacher comments use the current screen labels. | Parents and staff can follow the documented steps in their own portal. |
| MEDIUM | `docs/site-guide.md:69`, `docs/site-guide.md:121`, `docs/site-guide.md:195`, `docs/site-guide.md:398` | Setup listed only secondary levels and did not explain fee records or the new dashboard totals. | The guide covers Nursery 1–2, Primary 1–6, Paid/Owing fee switches and filters, and student/staff count definitions. | School administrators and form teachers can complete setup and interpret the displayed records correctly. |

### Verification

- Regenerated `docs/Ezio-Site-Guide.pdf`: **23 A4 pages**, **17 linked contents entries**, approximately **206 KB**, including the automatic guardian-onboarding and school-notice update.
- Reviewed the cover, contents, extracted page text, section numbering and internal chapter references.
- Matched the new instructions to the parent-account, parent-results, comments, fees and navigation source code.
- Adjusted heading pagination and shortened repeated text to avoid nearly empty continuation pages.
- `pnpm run guide:pdf` passed its printable-area, page-count and contents-link-count assertions.
- `pnpm exec eslint scripts/generate-site-guide.mjs` and `git diff --check` passed.

Approval applies to the updated guide and generated PDF.

**Approve**
