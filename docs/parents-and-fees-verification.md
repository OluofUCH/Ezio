# Parent portal, fees and PDF verification

Verified on 31 October 2026 using an isolated PostgreSQL 16 database and a local production build.

## Keyboard access

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `src/modules/parents/ui/ParentScreens.tsx:56` | The horizontally scrollable results table had no keyboard focus target. | The named results region is focusable and retains the browser’s focus indicator. | Keyboard users can reach and scroll every result column on narrow screens. |
| MEDIUM | `src/modules/parents/ui/Comments.tsx:65` | An empty comment disabled submission before validation. | Submission stays available until sending, with native required-field validation and focused feedback for whitespace-only comments. | Users can discover and correct input errors without an unexplained disabled control. |

## Dynamic announcements

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `src/modules/parents/ui/Comments.tsx:64`, `src/modules/parents/ui/ParentAccountsScreen.tsx:29` | Success messages inserted a new live region together with its text. | Stable status regions exist before their text changes. | Assistive technology can detect repeated successful actions reliably. |

## Verified coverage

- 43 unit tests passed, including the reproduced JPEG byte-offset regression.
- Parent and fee database integration tests passed: linked-child access, publication/PDF checks, two-way comments, revoked links/sessions, form-teacher restrictions, cross-school rejection, term-specific fees, arm transfers and dashboard counts.
- Existing SMS foundation and combined-module integration tests passed after applying the migrations.
- Cloud production build, cloud TypeScript and local-server TypeScript checks passed. Lint reported zero errors and the existing warnings.
- Sixteen browser checks passed, covering account creation, phone/PIN login, report downloads, parent/teacher comments, fee toggles and filters, linked siblings, unlinking and PIN reset.
- Parent login tab order, keyboard fee toggling and horizontal results-table scrolling were exercised. The scroll region’s native focus indicator was verified.
- Automated WCAG A/AA checks reported no violations on the inspected parent-account, parent-results, comments and fee screens, including the tested 320px layouts.
- All six production-mode PDF requests returned valid PDFs: staff, student and parent exports, each with and without a student photo. The server was launched from outside the project directory.
- Source-level PDF tests also passed from a different working directory. The production build verifies that all three export functions trace the required font assets.

The specific hosted report request, manual screen-reader testing and native 200% browser zoom were **Not verified**. Approval applies to the implemented features and the inspected local production workflows; redeployment is required to apply the PDF fixes to the hosted site.

**Approve**
