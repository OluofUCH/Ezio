# Ezio Nigeria — Site navigation & workflow guide

School management is the main workspace. CBT is the exam module inside it. Parents can view their children's published results, exchange comments with the form teacher and read school notices. This guide covers school setup, daily work, fee records, automatic guardian onboarding and the separate offline hall workflow.

## 1. Sign in and find your way

**For:** Super Admin, School Admin, teachers, parents and students.

### Sign in

1. Open the school's Ezio website and select **Student**, **Admin / Teacher** or **Parent**.
2. **Admin / Teacher:** enter your institutional email and password.
3. **Student:** enter your school code, registration number and PIN. Keep any leading zeros in the PIN.
4. **Parent:** enter the school code, guardian phone number and parent PIN. New accounts start with **1234**; use the updated PIN after a reset. Local and +234 phone formats are accepted.
5. Select **Sign in**. Staff and students arrive at their **School dashboard**. Parents arrive at **Child results**.
6. Super Admin chooses a school before opening school-specific records. Other accounts already belong to their school.

### Use the navigation

- **School dashboard** takes staff and students back to their school overview.
- **CBT** expands the staff or student exam submenu. Select a submenu item to open an exam tool. The same school navigation stays available.
- Parents use **Child results**, **Teacher comments** and **School notices**. Select the child's name before reviewing a report or writing a comment.
- On a phone or narrow screen, select **Open navigation** in the top bar. Choose a destination or use **Close navigation**. Escape also closes the menu.
- The selected page is highlighted. The CBT submenu opens automatically on its pages.
- **My account** lets staff change their password. **Log out** is at the bottom of the navigation.

Staff and students signing in from an old CBT bookmark still open SMS first. Open **CBT** to continue to exams. A running exam has its own focused screen, without the school sidebar.

### Two different kinds of results

**CBT exam results** describe individual exam attempts. **SMS report cards** combine a term's assessment components and subjects. A CBT result becomes a report-card component only after an authorized staff member imports it.

## 2. What each role can navigate

### Super Admin

Start at **School dashboard**, select a school, then manage its SMS and CBT work. **Schools** opens the school directory and onboarding form. The selected school carries into CBT; check the school name before working.

### School Admin

Start at **School dashboard** to review **Total students**, **Total staff**, attendance and teacher progress. Use **Academic calendar**, **Classes & subjects**, **Staff & assignments**, **Staff accounts**, **Students**, **Parent accounts**, **Assessment setup**, **Attendance**, **Fees**, **Score entry**, **Report cards** and **School notices**.

Expand **CBT** for **Overview**, **Exams**, **Candidates**, **Hall servers** and **Import CBT scores**. Use **My account** for your own password.

### Teacher

Start at **School dashboard**. Open **Attendance** and **Fees** for your form classes. Use **Parent comments** to exchange comments with parents of children in those classes. Open **Score entry** for your assigned class/subject/session combinations, **Report cards** for permitted classes, and **Staff notices** to read notices.

Expand **CBT** for **Overview**, **Exams**, **Candidates** and **Import CBT scores**. Importing marks requires the relevant SMS teaching assignment. Teachers do not manage school setup, staff accounts or hall servers.

### Student

Start at **School dashboard** to see your current class, attendance summary and published report cards. Expand **CBT** for **Overview**, **My exams** and **Exam results**.

Student records belong to the signed-in student. Staff notices, school setup and other students' records are not student pages.

### Parent

Start at **Child results** to view or download a linked child's published reports. Use **Teacher comments** for conversations with the form teacher and **School notices** for school updates.

### Your normal working flow

- **Administrator:** School dashboard → review student/staff totals → complete student guardian profiles → review Fees and Parent accounts → publish results and School notices.
- **Form teacher:** School dashboard → Attendance → Fees → Parent comments → enter and submit marks for assigned subjects.
- **Subject teacher:** School dashboard → Score entry for assigned subjects → submit completed marks → read Staff notices.
- **Student:** School dashboard → CBT → My exams → complete the paper → Exam results → return to School dashboard for published term reports.
- **Parent:** Child results → choose a child → view or download a report → Teacher comments → send a comment or read a reply. See section 14 for the steps.

## 3. Set up a school for the first time

**For:** Super Admin and School Admin.

### Create or choose the school

Super Admin opens **Schools → Onboard a school**, enters the name, permanent school code and optional address, and can create the first School Admin in the same form. Select **Work in this school** to enter its SMS dashboard. Existing schools can also be selected on **School dashboard** using **Find a school**, **School to manage**, then **Use this school**.

School Admin starts inside their own school. Share the school code with students and parents for sign-in. On a fresh installation, Super Admin onboards the first school.

A **class level** is a year group, such as Primary 2 or JSS 1. A **class arm** is a group within that level, such as A or B. Primary 2 A and Primary 2 B are separate arms.

### Configure in this order

1. **Academic calendar:** create the academic session with its actual start and end dates. Add the terms and their order. Each term belongs inside its session; term dates must not overlap.
2. **Classes & subjects:** choose the levels your school uses from **Nursery 1–2**, **Primary 1–6**, **JSS 1–3** and **SS 1–3**. Add A, B, C or other arm names where those groups exist.
3. Set one **default arm** for each level used by the school. Level-only CBT imports use this fallback; existing students are not moved just because you change the default.
4. Add the school's subjects. Use consistent names rather than creating spelling variants.
5. **Students → Activate academic session:** activate the intended session. On first activation, existing level-only candidates receive matching default-arm placements. Finish any open cloud CBT sittings first.
6. Add or review students and their placements. Create teacher accounts, teaching assignments and form-teacher designations.
7. **Assessment setup:** agree the component maximums and grading bands before staff start entering marks.
8. Fill each student's guardian name and phone to create parent access automatically, following section 6. Assign a form teacher to the arm for comments.
9. **Fees:** choose the term and review the initial Owing records. Form teachers can mark confirmed payments as Paid, following section 8.

For an existing school's session rollover, follow section 5.

## 4. Manage staff and teaching assignments

**For:** Super Admin and School Admin.

### Staff & assignments

1. Select **Staff & assignments → Add teacher** to create a teacher login with a name, email and temporary password.
2. Use **Profile** to record a teacher's phone number and qualifications.
3. Under **Teaching assignments**, select **Add assignment**. Choose the teacher, subject, class arm and academic session, then save.
4. Repeat for each class/subject the teacher teaches. An assignment to one arm does not automatically authorize every arm in that level.
5. Under **Form teachers**, choose an active teacher for an arm and select **Save form teacher**. This designation gives the teacher access to the arm's attendance, fee records and parent conversations.

Teacher accounts must be active before they can receive or use assignments. Deactivate assignments that should stop granting access; their history is retained.

A subject teaching assignment grants score-entry access for its class, subject and session. The form-teacher designation grants the class-wide attendance, fees and parent-comment workflows. Assign both where the same teacher performs both jobs.

### Staff accounts

Open **Staff accounts** to manage the school's login accounts. The page is headed **Staff**. It supports account creation, activation/deactivation and password resets, subject to your role permissions.

A reset password is shown once. Give it directly to the staff member and ask them to change it through **My account**. A profile, a teaching assignment and a login account serve different purposes; filling in a profile alone does not grant class access.

### My account

Every staff role can open **My account** and change their own password using the current password and a new one. Confirm the change before logging out.

## 5. Admit and place students

**For:** Super Admin and School Admin.

### Add one student

With an active session, open **Students → Admit student**. Enter the admission number, full name and arm. Supply a student PIN or leave it blank to generate one. You can add date of birth, gender, address and guardian details in this same form.

Fill **Guardian name** and **Guardian phone** for automatic parent access. **CBT → Candidates** lets administrators retrieve or reset student PINs.

### Import a roster

1. Select **Download sample roster** on Students, or **Download sample CSV** inside Import roster. Replace the examples with your students, keeping the **regNumber**, **fullName**, **classLevel**, **pin** and **arm** columns.
2. Use **NURSERY1–NURSERY2**, **PRIMARY1–PRIMARY6**, **JSS1–JSS3** or **SS1–SS3**. For example, Primary 3 A uses classLevel PRIMARY3 and arm A. Format registration numbers and PINs as text in Excel to keep leading zeros.
3. Open **Students → Import roster**, choose the file and select **Preview**.
4. Fix reported rows and preview again. Duplicate registration numbers in the school block the batch.
5. Select **Import** and review the resulting roster. A missing arm uses the default arm for that class level.

### Profiles and changes

Use **Profile** to update details or complete guardian information after a roster import. Saving a guardian name and phone creates or links the parent account. Use **Photo** for JPEG, PNG or WebP images up to 2 MB.

**Placement** sets the session, arm and effective date. **Promotion** moves up one level; **Repeat** keeps it. **Transfer** moves within a level, or **OUT** leaves the school. **Withdrawal** keeps history but ends active participation. Finish open CBT attempts first.

Levels progress through Nursery 1–2, Primary 1–6, JSS 1–3 and SS 1–3. Promoting Nursery 2 leads to Primary 1; Primary 6 leads to JSS 1.

**Start the next academic session:** create the session and terms, stage and review each active student's **Placement**, then select **Activate**.

## 6. Automatic parent accounts

**For:** Super Admin and School Admin.

### Save the student's guardian details

1. Open **Students → Admit student**, or open an existing student's **Profile**.
2. Enter **Guardian name** and **Guardian phone**. You can also record the guardian's relationship and email.
3. Save the form. The student, profile and guardian link are saved together. A new parent account starts with PIN **1234**.
4. Give the parent the school code, their guardian phone number and their PIN. They select **Parent** on the sign-in page.

### How siblings share an account

Use the same guardian phone number on each sibling's student profile. Local and +234 versions of the same number match. Within one school, those students link to one parent account automatically. Matching a name alone does not link accounts.

If the parent account already exists, its current PIN stays unchanged. If either guardian name or phone is missing, the student can still be saved; complete the profile later to create parent access.

### Review accounts and access

Open **Parent accounts** to search by parent or student name and review the linked children.

- **Edit details / reset PIN:** update contact details or set a new PIN. Leave the PIN field blank to keep it, then select **Save parent details**.
- **Deactivate** stops access for the parent account. **Reactivate** lets the parent sign in again with its current PIN.
- To change a child's guardian, edit that student's **Guardian name** and **Guardian phone**. The generated link changes for that child; siblings keep their own links.

Changing a parent account's phone or PIN ends existing sessions. Share the updated details. Changing its phone also updates the matching automatically linked student profiles.

## 7. Record and review attendance

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

## 8. Record and review fees

**For:** Form teachers, School Admin and Super Admin.

Use **Fees** to record whether a student's fees have been paid through the school's usual payment arrangements. The page tracks **Paid** or **Owing**; it does not collect online payments.

### Mark a student's fees

1. Open **Fees** and check the selected **Term**, including its academic session.
2. Choose a **Class level** and **Class arm**, or leave the relevant All option selected. Form teachers see their assigned form classes; administrators can review the whole school.
3. Use **Find a student** to search by name or admission number. Check the student's class and the selected term.
4. After the school confirms payment, turn on the student's **Fees paid** switch. The status changes from **Owing** to **Paid**.
5. Wait for **Saving…** to finish. Changes save automatically. **Last updated** shows the person and date of the latest saved change.
6. To correct an incorrect Paid mark, turn the switch off and confirm that it shows **Owing**.

### Review paid and owing students

Administrators can choose any supported class level, including Nursery 1–2, Primary 1–6, JSS 1–3 and SS 1–3. Choose **All arms** to review the full level, or select one arm.

Use **Fee status → Paid** or **Owing** to narrow the table. **All students** restores both groups. The **Students in selected classes**, **Paid** and **Owing** cards summarize the selected term and classes; the name search and Fee status filter narrow the table below them.

### Understand term records

Each student starts as **Owing** in a new term until a payment is recorded. **Not yet recorded** in Last updated means no fee status has been saved for that student and term.

Changing terms opens a separate fee record. Moving a student between class arms keeps that student's fee status for the same term. Past terms use the class roster at the end of the term; an ongoing term uses today's placement, and a future term uses its starting placement.

If a change shows an error, check the message beside the switch and retry after correcting the cause. Reload the page to confirm the saved status. A teacher who needs access to a form class should ask the school administrator to check the form-teacher designation.

## 9. Enter marks and publish report cards

**For:** Subject teachers and administrators.

### Configure the scheme first

Administrators use **Assessment setup** to define components, their maximum marks, and grade bands. Component maximums must total 100. Grade bands must cover 0 through 100 without gaps or overlaps. For example, CA 40 + Exam 60 is a valid total; the school decides the actual scheme.

Grade bands have visible **Min**, **Max**, **Grade** and **Remark** labels. A new setup preselects the **A–F standard** preset:

- **A:** 70–100, Excellent; **B:** 60–69.99, Very good.
- **C:** 50–59.99, Good; **D:** 45–49.99, Fair.
- **E:** 40–44.99, Pass; **F:** 0–39.99, Fail.

Edit Min and Max as needed. Grade and Remark are dropdowns; choose **Custom…** to enter another value. Saved settings load as they are. Select **Save assessment setup** after reviewing the scheme.

The first score entry freezes the assessment policy for that term. Later configuration changes do not reinterpret that term's existing marks.

### Enter and submit

1. Open **Score entry** and select the class arm, subject and term.
2. Enter each student's component marks, or import an eligible CBT component as described in section 11.
3. Save and review the sheet. All students in the term's class roster need every required component before submission.
4. Select **Submit** when the marks are complete. Teachers can work only on their assigned class/subject/session combinations.

### Administrator approval and publication

1. Open **Report cards**, choose the arm and term, and review each subject submission.
2. Select **Approve** for completed submissions. Report cards become ready only when every required subject for the class has been approved.
3. Review totals, averages, grades and positions. Add teacher and principal remarks.
4. Select **Publish class results** to make the reports visible to students and their linked parents.
5. Use **Download PDF** to export an individual report card. The filename includes the student's name, session and term.

The workflow is **DRAFT → SUBMITTED → APPROVED → PUBLISHED**. Approved/published scores are locked for teachers. An administrator's correction requires a reason, records an audit entry and recalculates the affected reports. Published reports stay published after correction.

Tied totals use positions such as **1, 2, 2, 4**. Published reports appear on students' **School dashboard** and linked parents' **Child results** pages.

## 10. Create, publish and invigilate CBT exams

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

## 11. Import CBT marks into SMS

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

## 12. Run an offline hall exam

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

## 13. Student workflow

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

## 14. Parent results, comments and notices

**For:** Parents and their children's form teachers.

### Parents: sign in and choose a child

1. Open the school's Ezio website, or use `/login?as=parent`.
2. Select **Parent** and enter the school code, your guardian phone number and parent PIN. A newly created account starts with **1234**; an existing account keeps its current PIN.
3. Select **Sign in** to open **Child results**.
4. Choose the student's name from **Child**. Their name is shown above the results, alongside their class and current form teacher.

### Parents: view a report card

Published reports show the student's name, session and term, subject scores, grades, remarks, total, average and class position. **Download report card** saves a PDF named for the student and term.

If several children are linked, use **Child** to switch between their names. If a child is missing, ask the school administrator to check the guardian phone on that student's profile. If the child has no published reports, ask the school office when results will be published.

### Parents: send or read comments

1. Open **Teacher comments**, or select **Comment to form teacher** from the child's results page.
2. Confirm the selected child and form teacher.
3. Enter your message in **Your comment**, up to 2,000 characters, and select **Send comment**.
4. Wait for **Comment sent.** Select **Refresh comments** when you want to check for a reply. Use **Older comments** or **Newer comments** when those controls appear.

You can start a conversation before report cards are published. The child needs a current active placement and an assigned form teacher. If the page shows **Not yet assigned**, ask the school office to complete that setup.

### Parents: read school notices

Open **School notices** for general parent updates and notices for your children's current class arms. Notices appear in the portal. The school administrator chooses their audience when posting.

### Form teachers: start or reply to a conversation

1. Sign in with **Admin / Teacher** using your teacher account and open **Parent comments**.
2. Choose a **Form class**, or leave the field blank for all your form classes. Use **Find a child** to search by name or admission number.
3. Check the child and parent names, then select **Open comments**.
4. Write in **Your comment** and select **Send comment**. You can start the conversation or reply to a parent's message.
5. Select **Refresh comments** to check for updates. Confirm the parent name before writing when a child has more than one linked parent.

Conversations follow the child's current form-teacher assignment. When the form teacher changes, the current teacher can read the existing conversation and respond. Subject teaching assignments alone do not grant this access.

For a forgotten parent PIN or incorrect child link, contact the school administrator. Use **Log out** when finished on a shared device.

## 15. Dashboards, notices and daily routines

### School dashboard

On **School dashboard**, **Total students** counts registered student records. **Total staff** counts School Admin and teacher accounts, including deactivated accounts. Parent accounts are not staff.

The staff dashboard also shows attendance, assignments, form classes, score-entry status and teacher progress. Teachers see their own work. Administrators use **Fees** to review Paid/Owing records by class.

### Send a school notice

Administrators open **School notices → Post notice**, enter a title and message, and choose the **Audience**:

- **All staff** in the selected school.
- **A staff role**, such as teachers or school administrators.
- **Staff assigned to a class arm**, using the relevant form-teacher/teaching assignments.
- **All parents** with access to the selected school.
- **Parents of a class arm**, using active guardian links and current student placements.

For a class audience, select **Class arm**; for a staff-role audience, select **Staff role**. Select **Post notice** and wait for confirmation. Teachers read their updates under **Staff notices**. Parents read theirs under **School notices**; staff-only notices stay within staff accounts.

### A practical staff routine

1. Confirm your name and school, then review School dashboard and the notices for your role.
2. Form teachers record attendance, update confirmed fee payments and check Parent comments.
3. Administrators review Fees, student guardian profiles and parent-account access.
4. Use Score entry for marks and CBT for exams. Save and review before changing class, term or school.
5. Administrators approve and publish completed reports. Log out when finished on a shared device.

## 16. Troubleshooting

### Sign-in and school setup

- **The wrong sign-in fields appear:** select Student, Admin / Teacher or Parent before entering credentials.
- **A parent cannot sign in:** confirm the school code and guardian phone. New accounts use PIN 1234; an existing account may have a different PIN. Ask the administrator to check account status or reset it.
- **Choose a school first:** Super Admin should return to School dashboard and use the school selector.
- **The school selection changed:** reload the affected tab, confirm the school name, then repeat the intended action.
- **No student placement appears:** an administrator should check the active session and the student's enrollment.
- **A class/subject is missing for a teacher:** check the active account, academic-session assignment and form-teacher designation.

### Attendance, fees and parent comments

- **Attendance will not save:** check form-teacher access and a date inside the selected term, no later than today.
- **A teacher has no form class on Fees:** an administrator should choose an active teacher under Staff & assignments → Form teachers and select Save form teacher.
- **No students appear on Fees:** check the term, class level, arm, Fee status and name search. Ask the school administrator to review placements for that term if the roster is still empty.
- **Fees show Owing after changing terms:** each term has its own record and starts as Owing. Return to the original term to review its payment status.
- **A parent's child is missing:** check Guardian name and Guardian phone on the student's Profile, save it, and confirm that the phone matches the parent's account. Siblings should use the same guardian phone.
- **The form teacher is Not yet assigned:** check the child's active placement in the current session and the arm's form-teacher designation.
- **A teacher sees no parent conversation:** check the form class and search filters, then ask the school administrator to verify that the parent account is active and linked to that child.
- **A new comment is not visible:** check that the sender received the **Comment sent.** confirmation. Confirm the selected child and parent, then select **Refresh comments**.
- **A parent notice is missing:** check the notice's audience and, for a class notice, the child's current class arm and active guardian link.

### Results and exams

- **An exam cannot be started:** check publication, class level, mode, availability window and attempts remaining.
- **A report is missing:** check that all required subjects were approved and the class results were published. For a parent, also verify the child link and the child selected on Child results.
- **A PDF download shows an error:** reopen the report and try the download again. If it still fails, give the school administrator the student's admission number, report term and time of the attempt so support can identify the export request.
- **A CBT import leaves a blank:** check that the attempt is finalized, in the linked term, synced if offline, and eligible for the selected component.
- **A hall result is missing in the cloud:** reconnect the hall, upload pending results and inspect any rejection reason.

## 17. Page paths

### Staff page paths

- School dashboard: `/sms/staff`
- Academic calendar: `/sms/staff/calendar`
- Classes & subjects: `/sms/staff/classes-subjects`
- Staff & assignments: `/sms/staff/teachers`
- Students: `/sms/staff/students`
- Parent accounts: `/sms/staff/parents`
- Assessment setup: `/sms/staff/assessment`
- Attendance / Score entry / Report cards: `/sms/staff/attendance`, `/sms/staff/scores`, `/sms/staff/reports`
- Fees: `/sms/staff/fees`
- Parent comments (form teachers): `/sms/staff/parent-comments`
- School notices (administrators) / Staff notices (teachers): `/sms/staff/announcements`
- CBT Overview / Exams / Candidates: `/staff`, `/staff/exams`, `/staff/students`
- CBT Hall servers / Import CBT scores: `/staff/local-servers`, `/sms/staff/bridge`
- Schools / Staff accounts / My account: `/staff/schools`, `/staff/teachers`, `/staff/account`

### Student page paths

- School dashboard: `/sms/student`
- CBT Overview / My exams / Exam results: `/student`, `/student/exams`, `/student/results`
- Running exam: `/exam/<examId>` — opened from an available paper.

### Parent page paths

- Parent sign-in: `/login?as=parent`
- Child results: `/sms/parent`
- Teacher comments: `/sms/parent/comments`
- School notices: `/sms/parent/notices`

Paths are relative to your school's Ezio website. Use the navigation for normal work; access depends on your signed-in role. Existing CBT paths remain available inside the SMS workspace.
