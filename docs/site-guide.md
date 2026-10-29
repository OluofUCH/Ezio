# Ezio Nigeria — Site navigation & workflow guide

School management is the main workspace. CBT is the exam module inside it. This guide covers the cloud site and the separate offline hall workflow.

## 1. Sign in and find your way

**For:** Super Admin, School Admin, teachers and students.

### Sign in

1. Open the school's Ezio website and select the correct sign-in tab.
2. **Admin / Teacher:** enter your institutional email and password.
3. **Student:** enter your school code, registration number and PIN. Keep any leading zeros in the PIN.
4. Select **Sign in**. Staff arrive at the SMS School dashboard. Students arrive at their school-records dashboard.
5. Super Admin chooses a school before opening school-specific records. Other accounts already belong to their school.

### Use the navigation

- **School dashboard** takes you back to SMS from any regular portal page.
- **CBT** expands the exam submenu. Select a submenu item to open an exam tool. The same school navigation stays available.
- On a phone or narrow screen, select **Open navigation** in the top bar. Choose a destination or use **Close navigation**. Escape also closes the menu.
- The selected page is highlighted. The CBT submenu opens automatically on its pages.
- **My account** lets staff change their password. **Log out** is at the bottom of the navigation.

Signing in from an old CBT bookmark still opens SMS first. Open **CBT** to continue to exams. A running exam has its own focused screen, without the school sidebar.

### Two different kinds of results

**CBT exam results** describe individual exam attempts. **SMS report cards** combine a term's assessment components and subjects. A CBT result becomes a report-card component only after an authorized staff member imports it.

## 2. What each role can navigate

### Super Admin

Start at **School dashboard**, select a school, then manage its SMS and CBT work. **Schools** opens the school directory and onboarding form. The selected school carries into CBT; check the school name before working.

### School Admin

Start at **School dashboard**. Use **Academic calendar**, **Classes & subjects**, **Staff & assignments**, **Staff accounts**, **Students**, **Assessment setup**, **Attendance**, **Score entry**, **Report cards** and **Staff notices**.

Expand **CBT** for **Overview**, **Exams**, **Candidates**, **Hall servers** and **Import CBT scores**. Use **My account** for your own password.

### Teacher

Start at **School dashboard**. Open **Attendance** for your form classes, **Score entry** for your assigned class/subject/session combinations, **Report cards** for permitted classes, and **Staff notices** to read notices.

Expand **CBT** for **Overview**, **Exams**, **Candidates** and **Import CBT scores**. Importing marks requires the relevant SMS teaching assignment. Teachers do not manage school setup, staff accounts or hall servers.

### Student

Start at **School dashboard** to see your current class, attendance summary and published report cards. Expand **CBT** for **Overview**, **My exams** and **Exam results**.

Student records belong to the signed-in student. Staff notices, school setup and other students' records are not student pages.

### Your normal working flow

- **Administrator:** School dashboard → review attendance and teacher progress → correct setup or roster issues → approve and publish results.
- **Teacher:** School dashboard → Attendance → Score entry → submit completed marks → read Staff notices.
- **Student:** School dashboard → CBT → My exams → complete the paper → Exam results → return to School dashboard for published term reports.

## 3. Set up a school for the first time

**For:** Super Admin and School Admin.

### Create or choose the school

Super Admin opens **Schools → Onboard a school**, enters the name, permanent school code and optional address, and can create the first School Admin in the same form. Select **Work in this school** to enter its SMS dashboard. Existing schools can also be selected on **School dashboard** using **Find a school**, **School to manage**, then **Use this school**.

School Admin starts directly inside their own school. Share the school code with students; it is part of their cloud sign-in.

### Configure in this order

1. **Academic calendar:** create the academic session with its actual start and end dates. Add the terms and their order. Each term belongs inside its session; term dates must not overlap.
2. **Classes & subjects:** add the real arms for JSS1, JSS2, JSS3, SS1, SS2 and SS3. For example, add A, B and C only where those are the school's actual arms.
3. Set one **default arm** for each level. Level-only CBT imports use this fallback; existing students are not moved just because you change the default.
4. Add the school's subjects. Use consistent names rather than creating spelling variants.
5. **Students → Activate academic session:** activate the intended session. On first activation, existing level-only candidates receive matching default-arm placements. Finish any open cloud CBT sittings first.
6. Add or review students and their placements. Create teacher accounts, teaching assignments and form-teacher designations.
7. **Assessment setup:** agree the component maximums and grading bands before staff start entering marks.

For a school already using SMS, use the rollover process in section 5 when starting a new session. Review an existing session before creating a duplicate.

## 4. Manage staff and teaching assignments

**For:** Super Admin and School Admin.

### Staff & assignments

1. Select **Staff & assignments → Add teacher** to create a teacher login with a name, email and temporary password.
2. Use **Profile** to record a teacher's phone number and qualifications.
3. Under **Teaching assignments**, select **Add assignment**. Choose the teacher, subject, class arm and academic session, then save.
4. Repeat for each class/subject the teacher teaches. An assignment to one arm does not automatically authorize every arm in that level.
5. Under **Form teachers**, choose an active teacher for an arm and select **Save form teacher**. This designation allows the teacher to mark that arm's attendance.

Teacher accounts must be active before they can receive or use assignments. Deactivate assignments that should stop granting access; their history is retained.

### Staff accounts

Open **Staff accounts** to manage the school's login accounts. The page is headed **Staff**. It supports account creation, activation/deactivation and password resets, subject to your role permissions.

A reset password is shown once. Give it directly to the staff member and ask them to change it through **My account**. A profile, a teaching assignment and a login account serve different purposes; filling in a profile alone does not grant class access.

### My account

Every staff role can open **My account** and change their own password using the current password and a new one. Confirm the change before logging out.

## 5. Admit students and manage placement

**For:** Super Admin and School Admin.

### Add one student

Open **Students → Admit student**. Enter the admission/registration number, full name and class arm. Supply a PIN or leave it blank to generate one. An academic session must already be active.

The admission number is the same registration number used for CBT sign-in. SMS and CBT share the student record. Use the authorized **CBT → Candidates** roster to retrieve/reset login PINs and manage candidate credentials.

### Import a roster

1. Prepare CSV or Excel columns **regNumber**, **fullName**, **classLevel**, **pin** and optional **arm**. A missing PIN can be generated.
2. Use exact class levels JSS1–JSS3 or SS1–SS3 and the school's configured arm names. Store registration numbers and PINs as text in Excel to preserve leading zeros.
3. Open **Students → Import roster**, choose the file and select **Preview**.
4. Fix reported rows and preview again. Duplicate registration numbers in the school block the batch.
5. Select **Import** and review the resulting roster. A missing arm uses the default arm for that class level.

### Profiles and changes

Use **Profile** for bio-data, guardian contact details or a PIN change. Use **Photo** for a JPEG, PNG or WebP image; the upload is limited to 2 MB and is resized for storage.

Use **Placement** to choose the session, action, target arm and effective date. Promotion moves to the next class level. Repeat keeps the level. Transfer changes arms within the level, or uses **OUT** to transfer out of the school. Withdrawal ends active participation while retaining history. Finish open CBT attempts before changing current placement.

### Start the next academic session

Create the next session and terms. Stage and review every active student's **Placement**, then select **Activate**. Receiving schools create their own records for transfers.

## 6. Record and review attendance

**For:** Form teachers and administrators.

1. Open **Attendance**.
2. Select the **Class arm**, **Term** and **Date**. The date must fall within the term and cannot be in the future.
3. Review the daily roster and choose **Present**, **Absent** or **Late** for each student. Check the displayed defaults before saving.
4. Select **Save attendance**. Reopen the same date to review or correct the entries.

Teachers mark only arms where they are the form teacher. Administrators can review and correct any arm in the selected school.

The roster follows the student's placement on the attendance date. Moving a student later does not move old attendance records to the new arm.

### Understand the summary

Present and Late both count as attended when the attendance rate is calculated. A blank rate means there are no recorded marks for that view; it does not mean zero attendance.

Students see their own term attendance summary on **School dashboard**. Staff can review attendance progress from the school dashboard and the Attendance page.

## 7. Enter marks and publish report cards

**For:** Subject teachers and administrators.

### Configure the scheme first

Administrators use **Assessment setup** to define components, their maximum marks, and grade bands. Component maximums must total 100. Grade bands must cover 0 through 100 without gaps or overlaps. For example, CA 40 + Exam 60 is a valid total; the school decides the actual scheme.

The first score entry freezes the assessment policy for that term. Later configuration changes do not reinterpret that term's existing marks.

### Enter and submit

1. Open **Score entry** and select the class arm, subject and term.
2. Enter each student's component marks, or import an eligible CBT component as described in section 9.
3. Save and review the sheet. All students in the term's class roster need every required component before submission.
4. Select **Submit** when the marks are complete. Teachers can work only on their assigned class/subject/session combinations.

### Administrator approval and publication

1. Open **Report cards**, choose the arm and term, and review each subject submission.
2. Select **Approve** for completed submissions. Report cards become ready only when every required subject for the class has been approved.
3. Review totals, averages, grades and positions. Add teacher and principal remarks.
4. Select **Publish class results** to make the reports visible to students.
5. Use **Download PDF** to export an individual report card.

The workflow is **DRAFT → SUBMITTED → APPROVED → PUBLISHED**. Approved/published scores are locked for teachers. An administrator's correction requires a reason, records an audit entry and recalculates the affected reports. Published reports stay published after correction.

Tied totals use positions such as **1, 2, 2, 4**. Students see only their own published reports on **School dashboard**.

## 8. Create, publish and invigilate CBT exams

**For:** Teachers and administrators.

### Prepare the paper

1. Expand **CBT**, open **Exams**, then select **Create exam**.
2. Enter the title, subject, target class level, duration, mode, availability window and attempt limit. Choose question/option shuffling as needed.
3. Select **Create and add questions**. The paper starts as a draft.
4. On **Questions**, select **Download .xlsx template**. Fill in questions, options, correct answers and marks using the template's format.
5. Upload the workbook and inspect the row-by-row preview. Correct rejected rows before importing. Select the appropriate append/replace option and confirm the import.
6. Review the **Current paper**, settings and total marks. Select **Publish** when ready. An empty paper cannot be published.

### Choose the right mode

- **ONLINE:** students take the exam on the cloud site.
- **OFFLINE_LAN:** students take a downloaded paper on a school hall server.
- **HYBRID:** the paper supports both paths.

Students see papers for their current class level. Published papers can still be unavailable because their window has not opened, has closed, or the attempt limit has been reached.

### Monitor and review

Open the exam's **Invigilate** tab to monitor sittings and review flags. Use **Results** for the result table and analytics, then **Export CSV** when needed. Offline sittings appear after the hall uploads them.

Use **Settings** for permitted configuration changes. Some changes are blocked once attempts exist to protect previously answered or graded papers.

**CBT → Overview** shows exam activity. **CBT → Candidates** opens the shared candidate roster. Student placement and identity remain part of the same school records.

## 9. Import CBT marks into SMS

**For:** Administrators and teachers with the relevant SMS assignments.

CBT results do not automatically fill a term report card. Import them into an assessment component after the exam is complete.

1. Finish the availability window and all open sittings. Upload any offline results to the cloud.
2. Open **CBT → Import CBT scores** and select the exam.
3. Under **Link exam**, choose the SMS subject and term, and an optional default assessment component. Save the link.
4. Under **Import attempts**, choose the target component and the attempt rule.
5. **Best attempt (BEST)** uses the highest-scoring eligible attempt. **Last attempt (LAST)** uses the latest finalized eligible attempt.
6. Select **Import CBT scores**. Review the resulting marks in **Score entry**, complete any remaining components, then follow the normal submission/approval/publication process.

### How the conversion works

An exam mark is scaled to the component maximum. For example, 32 out of 40 on a CBT paper becomes 48 out of 60 in a component worth 60 marks.

The import retains its exam/attempt origin and supports repeated imports without duplicate score cells. A manual correction records manual provenance and an audit entry.

### When a mark is not imported

Check the student's enrollment, the teacher's assignment, the linked term dates and whether the target submission is already approved/published. Students without an eligible completed attempt remain blank. An attempt whose historical maximum differs from the current paper total needs review. Once marks have been imported, the exam cannot be relinked to a different subject/term.

## 10. Run an offline hall exam

**For:** School administrators and the designated hall invigilator.

The hall app is a separate, CBT-only application on the school network. SMS records and report cards remain on the cloud site.

### Before exam day — internet required

1. On the cloud site, open **CBT → Hall servers**. The page is headed **Local Servers**. Select **Create hall** and name the hall.
2. Use **Download Windows installer** on the hall PC. Follow the setup wizard and enter the cloud address and one-time setup code shown in the cloud pairing dialog.
3. Set the hall's invigilator PIN. It is different from student PINs and cloud staff passwords.
4. Publish an OFFLINE_LAN or HYBRID exam in the cloud. Download the selected papers and their class rosters while the hall PC is online.
5. Check the hall PC's clock and test access from a student device on the same network. The admin console shows the student LAN address.

### During the exam — school LAN

Students open the LAN address supplied by the invigilator, not the cloud SMS site. They sign in with registration number and PIN; no school code is needed because the hall serves one school. They can start or resume downloaded papers under the same timing and attempt rules.

The hall PC must stay running and reachable on the local network. The invigilator opens `/admin` on the hall address to monitor the local service.

### After the exam — reconnect and upload

1. Reconnect the hall PC to the internet.
2. Sign in to the hall admin console and select **Upload results**.
3. Confirm the pending-upload count is zero. Review any rejected sitting and its stated reason.
4. On the cloud site, open **CBT → Exams → the paper → Results**. Then import marks into SMS if they belong in a term report.

Upload pending results before replacing the hall PC, rotating its key or downloading replacement papers. A retry does not create duplicate cloud sittings. If the setup code expires, use **Pair hall** to issue a new one.

## 11. Student workflow

**For:** Students.

### School records

After sign-in, **School dashboard** shows **My school records**. Review your current class, attendance summary and published report cards. Select **Download report card** beside a published report to save its PDF.

### Take an online exam

1. Expand **CBT → My exams**. Read the paper's subject, duration, availability and attempt status.
2. Open an available exam. If you already have an unfinished sitting, use its resume action instead of starting again.
3. Answer the questions and check the save/connection status. The running-exam screen has its own timer and navigation.
4. Review unanswered questions before selecting the submission action. Confirm submission and wait for the completion state.
5. Use **CBT → Exam results** for your completed attempts. Return to **School dashboard** for published term report cards.

If you are asked to sign in again, you return to SMS first. Open **CBT → My exams** and resume the active sitting if time remains. Signing in again does not restart the exam timer.

### Take a hall exam

Use the school-network address given by the invigilator. Enter your registration number and PIN. The hall may work without internet, but it must remain connected to the local network. Cloud results appear only after the hall uploads them.

### Get help

Ask your school administrator to reset a forgotten PIN or correct your registration/class details. Report a missing exam or report card to your teacher. Log out when finished, especially on a shared computer.

## 12. Dashboards, notices and daily routines

### School dashboard

The staff dashboard shows attendance rate, assignments, form classes, score-entry status and teacher submission progress. Teachers see their own work. Administrators use the overview to follow up on missing attendance or incomplete submissions.

The student dashboard shows the student's current class, attendance summary and published reports. A blank metric usually means there are no records for that view yet.

### Staff notices

Staff open **Staff notices** to read announcements. Administrators select **Post announcement**, enter a title and message, and choose an audience:

- **All staff** in the selected school.
- **A staff role**, such as teachers or school administrators.
- **Staff assigned to a class arm**, using the relevant form-teacher/teaching assignments.

Teachers can read notices addressed to them. Students do not use this feature.

### A practical daily routine

1. Confirm your name and school after signing in.
2. Review the School dashboard and Staff notices.
3. Record attendance for the day's form class where authorized.
4. Use Score entry for assessment work; use CBT for papers and sitting results.
5. Save and review changes before moving to a different class, subject, term or school.
6. Administrators approve complete subject submissions and publish class reports when ready.
7. Log out on shared devices. Staff can change passwords from My account.

## 13. Troubleshooting

### Common problems

- **The wrong sign-in fields appear:** select Student or Admin / Teacher before entering credentials.
- **Choose a school first:** Super Admin should return to School dashboard and use the school selector.
- **The school selection changed:** reload the affected tab, confirm the school name, then repeat the intended action.
- **No student placement appears:** an administrator should check the active session and the student's enrollment.
- **A class/subject is missing for a teacher:** check the active account, academic-session assignment and form-teacher designation.
- **Attendance will not save:** check form-teacher access and a date inside the selected term, no later than today.
- **An exam cannot be started:** check publication, class level, mode, availability window and attempts remaining.
- **A report is missing:** check that all required subjects were approved and the class results were published.
- **A CBT import leaves a blank:** check that the attempt is finalized, in the linked term, synced if offline, and eligible for the selected component.
- **A hall result is missing in the cloud:** reconnect the hall, upload pending results and inspect any rejection reason.

## 14. Page paths

### Staff page paths

- School dashboard: `/sms/staff`
- Academic calendar: `/sms/staff/calendar`
- Classes & subjects: `/sms/staff/classes-subjects`
- Staff & assignments: `/sms/staff/teachers`
- Students: `/sms/staff/students`
- Assessment setup: `/sms/staff/assessment`
- Attendance / Score entry / Report cards: `/sms/staff/attendance`, `/sms/staff/scores`, `/sms/staff/reports`
- Staff notices: `/sms/staff/announcements`
- CBT Overview / Exams / Candidates: `/staff`, `/staff/exams`, `/staff/students`
- CBT Hall servers / Import CBT scores: `/staff/local-servers`, `/sms/staff/bridge`
- Schools / Staff accounts / My account: `/staff/schools`, `/staff/teachers`, `/staff/account`

### Student page paths

- School dashboard: `/sms/student`
- CBT Overview / My exams / Exam results: `/student`, `/student/exams`, `/student/results`
- Running exam: `/exam/<examId>` — opened from an available paper.

Paths are relative to your school's Ezio website. Use the navigation for normal work; access depends on your signed-in role. Existing CBT paths remain available inside the SMS workspace.
