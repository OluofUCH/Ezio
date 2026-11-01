# Guardian onboarding and school notices verification

Verified on 1 November 2026 using an isolated PostgreSQL 16 database and a local production build.

## Implemented workflows

- Assessment setup shows Min, Max, Grade and Remark labels. New grade settings use the selected A–F preset; custom saved grades and remarks remain editable.
- Student admission saves profile details in the same transaction. A guardian name and normalized phone create or reuse the parent account, with initial PIN `1234` only for a new account.
- Siblings share the parent account within their school. Linking another child preserves existing credentials. Changing a child's guardian changes only that generated link.
- Parent administration provides account review, contact updates, PIN resets and activation controls. Manual parent creation and child-link API actions are retired.
- Admin notices support all parents or parents of one class arm. Parent reads enforce school, account and active child-link scope; staff-only notices remain private to staff.
- Student names appear in parent selectors, headings, report data, PDF titles and download filenames. A stale snapshot label does not replace the student's current name.

## Accessible labels

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `src/modules/results/ui/AssessmentScreen.tsx:73` | The grade row relied on unlabeled visible input positions. | Visible column labels and individually named controls identify each field; dropdowns preselect the saved or standard values. | Users can identify the field and its current value on desktop and mobile. |
| MEDIUM | `src/modules/parents/ui/ParentAccountsScreen.tsx:43`, `src/modules/parents/ui/TeacherCommentsScreen.tsx:28` | Accessible button names differed from their visible action labels. | Accessible names include the visible action followed by the relevant parent and student names. | Voice and assistive-technology users can target the same actions they see. |

## Verification

- 48 unit tests passed.
- 24 affected database integration tests passed, including existing score/report workflows, automatic guardian onboarding, parent isolation, notices and name-based report output.
- 12 production-browser checks passed, including grade preset/custom-value persistence, one-step admission, sibling matching, default-PIN login, removal of manual controls, parent names and PDF downloads, and notice audiences.
- Automated accessibility checks passed on the inspected assessment, student admission, parent-account, parent-results and notice screens, including the tested 320px layouts.
- Production build, TypeScript and lint checks passed; lint retained the 12 existing warnings.
- PDF deployment tracing checks passed. The regenerated guide has 23 A4 pages and 17 linked sections; its text and pagination were reviewed.

Manual screen-reader testing and the final hosted deployment were **Not verified** in this run. Approval applies to the inspected source, local production workflows and generated guide.

**Approve**
