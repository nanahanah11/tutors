# Product Requirements Document (PRD)

## APU Tutorial Attendance Management System

**Version:** 1.2  
**Status:** Implementation Ready – MVP (Tutor code workflow and final roster rules incorporated)  
**Prepared for:** Asia Pacific University of Technology & Innovation (APU), Malaysia  
**Primary Product Owner:** Lecturer  
**Primary Modules:** SDM and ISWE  
**Target Users:** 1 Lecturer + 4 Tutors  
**Technology Stack:** Netlify, Claude Code, Supabase  
**Document Date:** 3 October 2026

---

## 1. Executive Summary

The APU Tutorial Attendance Management System is a lightweight internal web application for recording tutorial attendance for the SDM and ISWE modules.

The lecturer is assisted by four tutors who conduct tutorial classes. Currently, attendance needs to be captured during tutorial sessions and later reviewed by the lecturer before the lecturer manually enters the information into APU APSpace.

The proposed system will give each tutor a unique access code based on the tutor's own name followed by three random digits (for example, `MAY123`). A tutor enters the code, selects an assigned class/subject, selects the class date using a date picker, enters the class time, and marks each student Present or Absent. The roster is displayed alphabetically by student name with the TP number beside the name, and a search bar allows filtering by student name or TP number. When the tutor saves the attendance, the system records the tutor identity and audit metadata automatically. Tutors may edit their own saved attendance only on the same calendar day as the class; after that, corrections are lecturer-controlled.

The lecturer will have a centralized dashboard showing all saved tutorial sessions, including module, tutorial class, date, time, tutor, number of students present and absent, and whether the attendance has already been keyed into APSpace. The lecturer can open any session to view the detailed student attendance list and manually transfer the attendance into APSpace.

The MVP intentionally does **not** integrate directly with APSpace. APSpace entry remains a lecturer-controlled manual process.

---

## 2. Problem Statement

The lecturer teaches SDM and ISWE and has four tutors helping to conduct tutorial classes. The lecturer already has the students' names, student IDs and tutorial group assignments.

A consistent attendance process is required because:

- Different tutors conduct different tutorial classes.
- Attendance must be recorded against the correct tutorial grouping number.
- Tutors need a simple interface that can be used quickly during class.
- The lecturer needs to know exactly which tutor recorded each attendance session.
- The lecturer needs a single location to review completed attendance before manually entering it into APU APSpace.
- Attendance records should be traceable and protected from accidental duplication or unauthorized changes.

The current process can become fragmented if attendance is captured using paper, spreadsheets, messages or separate files maintained by individual tutors.

---

## 3. Product Vision

Create a simple, secure and auditable attendance system that allows tutors to record tutorial attendance in less than a few minutes and allows the lecturer to retrieve the exact attendance required for manual APSpace entry from one dashboard.

### 3.1 Product Principles

1. **Fast for tutors** – attendance marking should require minimal clicks.
2. **Single source of truth** – all SDM and ISWE tutorial attendance is stored in one database.
3. **Tutor accountability** – every attendance session is tied to the tutor whose valid access code was used to open the session.
4. **Group accuracy** – tutors only mark students from the selected tutorial group.
5. **Lecturer control** – the lecturer has full visibility and administrative control.
6. **No unnecessary complexity** – the MVP should remain suitable for five staff users and normal APU tutorial class sizes.
7. **Secure by default** – student names and IDs are only available to authorized users.

---

## 4. Goals and Success Criteria

### 4.1 Primary Goals

- Allow tutors to record attendance digitally for SDM and ISWE tutorials.
- Load student names and student IDs automatically based on tutorial group.
- Record the tutor responsible for each attendance session.
- Allow the lecturer to review attendance immediately after tutors save it.
- Make manual APSpace entry easier and less error-prone.
- Maintain a historical attendance record for future reference.

### 4.2 Success Metrics

The MVP will be considered successful when:

- 100% of SDM and ISWE tutorial groups can be represented in the system.
- 100% of enrolled students can be associated with the correct tutorial group.
- A tutor can enter their code, create and save a normal attendance session without lecturer assistance.
- The lecturer can identify the recording tutor for every saved session.
- No duplicate attendance record exists for the same student within the same attendance session.
- The lecturer can filter and retrieve a specific attendance session in under 30 seconds.
- The lecturer can clearly identify which sessions are still pending manual APSpace entry.

---

## 5. Non-Goals / Out of Scope for MVP

The following items are explicitly excluded from the first release:

- Direct API integration with APU APSpace.
- Automatic attendance submission into APSpace.
- Student self-check-in.
- QR-code attendance.
- Facial recognition or biometric attendance.
- GPS/location-based attendance.
- Parent or student portals.
- Email or SMS attendance notifications.
- Automated timetable synchronization with APU systems.
- Automatic student enrolment synchronization with APU systems.
- Payroll, tutor workload or tutor payment calculations.
- Complex attendance analytics or predictive analytics.
- Native Android or iOS applications.

These can be considered in later phases if required.

---

## 6. Assumptions

1. There is one primary lecturer who owns and administers the attendance data.
2. There are four tutors.
3. The lecturer has the official student list containing at minimum:
   - Student ID
   - Student name
   - Module
   - Tutorial group number
4. Students may belong to different tutorial groups for different modules; therefore, group enrolment must be module-specific.
5. Tutors have internet access through a laptop, tablet or mobile device during or shortly after tutorials.
6. The lecturer will manually enter the final attendance into APSpace.
7. Tutor access codes will be generated before the system is used and shared individually with the four tutors.
8. A tutor may occasionally cover another tutor's group. The system should support lecturer-managed tutor-to-group assignments rather than permanently hard-coding one tutor to one group.
9. The system will initially be used only by authorized APU staff involved in these modules.
10. Tutor access-code validation and attendance updates will use Malaysia time (`Asia/Kuala_Lumpur`) when enforcing the same-day editing rule.

---

## 6.1 Confirmed Initial Deployment Configuration

The following configuration is based on the tutor assignments and student roster files supplied for the initial deployment.

### 6.1.1 Module and Tutorial Class Codes

| Module | Module Code | Tutorial Class | Group No. | Students in Supplied Roster | Initial Tutor Assignment |
|---|---|---|---:|---:|---|
| SDM | `CT046-3-2-SDM` | `CT046-3-2-SDM-T-39` | 39 | 35 | May |
| SDM | `CT046-3-2-SDM` | `CT046-3-2-SDM-T-40` | 40 | 42 | May |
| SDM | `CT046-3-2-SDM` | `CT046-3-2-SDM-T-41` | 41 | 46 | Latifa |
| ISWE | `AAPP003-4-2-ISWE` | `AAPP003-4-2-ISWE-T-7` | 7 | 40 | Amir |
| ISWE | `AAPP003-4-2-ISWE` | `AAPP003-4-2-ISWE-T-9` | 9 | 39 | Arya |

The application shall use the full tutorial class code as the primary human-readable class identifier in tutor screens and lecturer reports, while retaining the numeric group number for filtering and roster matching.

### 6.1.2 Initial Tutor Access Codes

The initial tutor access-code format is based on the tutor's own first name in uppercase followed by exactly three randomly generated digits.

| Tutor | Access Code Format | Assigned Tutorial Classes |
|---|---|---|
| May | `MAY###` (for example `MAY123`) | `CT046-3-2-SDM-T-39`, `CT046-3-2-SDM-T-40` |
| Amir | `AMIR###` | `AAPP003-4-2-ISWE-T-7` |
| Arya | `ARYA###` | `AAPP003-4-2-ISWE-T-9` |
| Latifa | `LATIFA###` | `CT046-3-2-SDM-T-41` |

`###` represents three random numeric digits generated during deployment. The final production codes shall not be published inside the PRD or source repository. Ms Aida will receive the generated codes and share each code only with the relevant tutor.

The tutor enters this code as the first step of the attendance workflow. The server validates the code and determines the tutor identity and permitted tutorial classes. Tutors do not select another tutor's identity manually.

Because the tutor code functions as an access credential, the application shall not store it in plaintext in the database. A secure one-way hash shall be stored for validation. Attendance records shall store the resolved tutor profile ID and tutor name for audit reporting.

### 6.1.3 Roster Validation Summary

The supplied roster files contain the following row-level data. The SDM row without a tutorial group is **excluded from the attendance system** and is not part of the active imported roster.

| Source | Source Student Rows | Active Rows Imported | Tutorial Groups Imported | Data Quality Notes |
|---|---:|---:|---|---|
| `CT046_Student_List.xlsx` | 179 | 178 | 38 (44), 39 (35), 40 (42), 41 (46), 42 (11) | The single row without a tutorial group is excluded. No duplicate student IDs detected. Embedded GROUP/TOTAL helper cells are not used as the source of truth. |
| `AAPP003_ISWE_Student_List.xlsx` | 119 | 119 | 7 (40), 8 (40), 9 (39) | All student rows have a tutorial group; no duplicate student IDs detected. |

Three tutorial groups appear in the supplied rosters but were not assigned to the four tutors in the provided mapping:

- `CT046-3-2-SDM-T-38`
- `CT046-3-2-SDM-T-42`
- `AAPP003-4-2-ISWE-T-8`

For the initial build, these groups shall remain lecturer-controlled/unassigned unless Ms Aida explicitly assigns a tutor. The system shall not infer an owner.

**Student-list communication rule:** If a tutor notices any student missing from the list, appearing in the wrong class, duplicated, no longer enrolled, or otherwise requiring a roster change, the tutor must inform **Ms Aida as soon as possible (ASAP)**. Tutors shall not add, remove, or move students themselves.

---

## 7. User Roles and Permissions

### 7.1 Lecturer – Ms Aida

The lecturer is the system administrator and data owner.

**Lecturer permissions:**

- Log in securely using the lecturer/admin account.
- View all SDM and ISWE tutorial classes configured in the system.
- Create, edit, activate and archive modules/tutorial groups.
- Import and manage student rosters.
- Assign students to tutorial groups.
- Create/regenerate/deactivate tutor access codes.
- Assign tutors to one or more tutorial groups.
- View all attendance sessions regardless of tutor.
- View the complete student-level attendance for each session.
- Correct attendance data at any time when necessary.
- Mark an attendance session as **Keyed into APSpace**.
- Filter attendance by module, tutorial class, tutor and date.
- Export attendance records to CSV.
- View audit information showing who created or changed attendance.

### 7.2 Tutor

Each tutor uses an individual access code in the format `<NAME><3 random digits>`, for example `MAY123`.

**Tutor permissions:**

- Enter their own tutor access code to start a tutor session.
- View only tutorial classes assigned to their tutor profile.
- Select an assigned **Class / Subject** from a dropdown.
- Select the class date using a date picker.
- Enter the class time.
- Load the official student roster for the selected tutorial class.
- View students alphabetically by full name with TP number displayed next to each name.
- Search the roster by student name or TP number.
- Tick/choose **Present** or **Absent** for each student.
- Save the completed attendance.
- Re-open and edit their own saved attendance **only on the same calendar day as the class date**, using Malaysia time (`Asia/Kuala_Lumpur`).
- View their own saved attendance records.

**Tutor restrictions:**

- Cannot add, remove, rename, or move students between tutorial groups.
- Must inform Ms Aida ASAP about any student-list discrepancy or required roster change.
- Cannot use another tutor's access code or select another tutor's identity.
- Cannot create attendance for an unassigned tutorial class.
- Cannot edit their attendance after the class date has ended in Malaysia time.
- Cannot mark a session as **Keyed into APSpace**.
- Cannot permanently delete attendance records.

## 8. High-Level User Workflow

### 8.1 Tutor Workflow

1. Tutor opens the web application.
2. Tutor enters their individual tutor access code, for example `MAY123`.
3. System validates the code and identifies the tutor.
4. System shows only the classes/subjects assigned to that tutor.
5. Tutor selects **Class / Subject** (for example `SDM – CT046-3-2-SDM-T-40`).
6. Tutor selects the **Class Date** using a date picker. The date picker defaults to today and does not allow future dates.
7. Tutor enters the **Class Time**.
8. System loads the active roster for the selected tutorial class.
9. System displays students in **A–Z alphabetical order by full name**, with each student's **TP number shown beside the name**.
10. Tutor may use the search bar to find a student by partial/full name or TP number.
11. Tutor marks every student **Present** or **Absent** using mutually exclusive attendance controls.
12. System shows live totals for Total, Present, Absent and Unmarked.
13. Tutor selects **Save Attendance**.
14. System validates that all students have a status and saves the session.
15. Saved attendance becomes immediately visible to Ms Aida in the lecturer dashboard.
16. During the same class date, the tutor may reopen the session, change attendance, and save again.
17. After 11:59:59 PM Malaysia time on the class date, the tutor record becomes read-only. Any later correction must be handled by Ms Aida.

### 8.2 Lecturer Workflow

1. Lecturer logs in.
2. Lecturer opens the **Attendance Dashboard**.
3. Lecturer sees saved tutorial sessions sorted with newest first.
4. Lecturer filters by module, group, date or tutor when required.
5. Lecturer opens a specific session.
6. Lecturer sees:
   - Module
   - Tutorial group
   - Date
   - Start time
   - Tutor name
   - Tutor code
   - Student list
   - Present/Absent status
   - Remarks
7. Lecturer manually enters the attendance into APSpace.
8. Lecturer selects **Mark as Keyed into APSpace**.
9. System updates the session status to show that the manual APSpace process is complete.

---

## 9. Functional Requirements

Priority convention:

- **P0** – mandatory for MVP.
- **P1** – important for MVP if schedule permits.
- **P2** – future enhancement.

### 9.1 Authentication and Access Control

| ID | Priority | Requirement |
|---|---|---|
| FR-AUTH-001 | P0 | Student and attendance data shall not be accessible until a valid lecturer login or tutor access code has been validated. |
| FR-AUTH-002 | P0 | The lecturer shall use a secure Supabase Auth account. |
| FR-AUTH-003 | P0 | Each tutor shall have one active unique access code in the format `<UPPERCASE_FIRST_NAME><3 random digits>`. |
| FR-AUTH-004 | P0 | The tutor code shall be validated server-side; the browser shall not receive the tutor-code master list. |
| FR-AUTH-005 | P0 | A valid tutor code shall resolve to exactly one active tutor profile and its assigned tutorial classes. |
| FR-AUTH-006 | P0 | Tutor access codes shall be stored as one-way hashes, not plaintext credentials. |
| FR-AUTH-007 | P0 | Failed tutor-code attempts shall be rate-limited and temporarily blocked after repeated failures. |
| FR-AUTH-008 | P0 | A tutor session shall expire automatically after a reasonable period of inactivity or browser-session expiry. |
| FR-AUTH-009 | P0 | Invalid or inactive tutor codes shall not reveal student names, TP numbers, class rosters, or attendance data. |
| FR-AUTH-010 | P1 | Ms Aida shall be able to regenerate a tutor code if it is forgotten or compromised. |

### 9.2 Module Management

| ID | Priority | Requirement |
|---|---|---|
| FR-MOD-001 | P0 | The initial deployment shall configure SDM (`CT046-3-2-SDM`) and ISWE (`AAPP003-4-2-ISWE`) as modules. |
| FR-MOD-002 | P0 | Each module shall contain a module code, module name and active/inactive status. |
| FR-MOD-003 | P1 | The module may contain intake/semester information for future reuse. |
| FR-MOD-004 | P0 | Tutors shall only see active modules assigned to them. |

### 9.3 Tutorial Group Management

| ID | Priority | Requirement |
|---|---|---|
| FR-GRP-001 | P0 | The lecturer shall be able to create tutorial groups under each module. |
| FR-GRP-002 | P0 | Each tutorial group shall have a unique group number within a module and a full tutorial class code (for example `CT046-3-2-SDM-T-40`). |
| FR-GRP-003 | P0 | A tutorial group shall contain zero or more enrolled students. |
| FR-GRP-004 | P0 | The lecturer shall be able to assign one or more tutors to a group. |
| FR-GRP-005 | P1 | A group may be archived without deleting historical attendance. |
| FR-GRP-006 | P0 | Tutor and lecturer screens shall display the full tutorial class code to reduce ambiguity when matching APSpace classes. |

### 9.4 Student Roster Management

| ID | Priority | Requirement |
|---|---|---|
| FR-STU-001 | P0 | The system shall store a student's full name and TP/student ID. |
| FR-STU-002 | P0 | TP/student ID shall be unique within the system. |
| FR-STU-003 | P0 | Ms Aida shall be able to enrol a student into the appropriate tutorial group for a module. |
| FR-STU-004 | P0 | Tutors shall not be able to modify student master data or tutorial-group enrolment. |
| FR-STU-005 | P0 | The attendance screen shall display each student's full name with the TP number immediately beside it. |
| FR-STU-006 | P0 | The attendance roster shall be sorted alphabetically A–Z by student full name by default. |
| FR-STU-007 | P0 | The tutor attendance screen shall provide a search bar that filters by student name or TP number, including partial matches. |
| FR-STU-008 | P1 | Ms Aida shall be able to import student/group data from CSV or XLSX. |
| FR-STU-009 | P1 | Import validation shall identify duplicate student IDs, missing required fields, missing tutorial groups and invalid group/module values before committing the import. |
| FR-STU-010 | P0 | Rows without a tutorial group shall not be imported into an active attendance roster. The known ungrouped SDM row is excluded from the initial seed data. |
| FR-STU-011 | P0 | The tutor UI shall show the remark: **“Any changes related to the student list, please let Ms Aida know ASAP.”** |
| FR-STU-012 | P1 | Students may be marked inactive without deleting historical attendance. |

### 9.5 Tutor Assignment Management

| ID | Priority | Requirement |
|---|---|---|
| FR-TUT-001 | P0 | Each tutor shall have a unique access code whose prefix is the tutor's uppercase first name followed by exactly three random digits. |
| FR-TUT-002 | P0 | Ms Aida shall be able to assign tutors to tutorial groups. |
| FR-TUT-003 | P0 | A tutor shall only be able to create attendance for a class for which the resolved tutor profile has an active assignment. |
| FR-TUT-004 | P1 | Ms Aida shall be able to temporarily assign an additional tutor to cover another group. |
| FR-TUT-005 | P0 | Historical attendance shall retain the original tutor profile/name even if group assignments or access codes later change. |
| FR-TUT-006 | P0 | Initial assignments shall seed May to SDM groups 39/40, Latifa to SDM group 41, Amir to ISWE group 7 and Arya to ISWE group 9. |
| FR-TUT-007 | P0 | Final production tutor codes shall be generated during deployment and must not be committed to source control. |

### 9.6 Attendance Session Creation

| ID | Priority | Requirement |
|---|---|---|
| FR-SES-001 | P0 | A tutor shall be able to create a new attendance session after entering a valid tutor code. |
| FR-SES-002 | P0 | The tutor shall select one assigned **Class / Subject** from a dropdown that shows the module name and full tutorial class code. |
| FR-SES-003 | P0 | The class selection shall be limited to the tutorial classes assigned to the resolved tutor profile. |
| FR-SES-004 | P0 | A session shall require class date selected through a date picker. |
| FR-SES-005 | P0 | The date picker shall default to the current Malaysia date and shall not allow a future date. |
| FR-SES-006 | P0 | A session shall require class time. |
| FR-SES-007 | P0 | Tutor identity shall be resolved from the validated tutor access code and shall not be manually selectable. |
| FR-SES-008 | P0 | The system shall store the tutor profile ID and tutor-name snapshot as part of the session audit trail. |
| FR-SES-009 | P0 | The system shall prevent accidental duplicate sessions using tutorial class, class date and class time as duplicate-detection criteria. |
| FR-SES-010 | P0 | On successful save, the session shall become immediately visible to Ms Aida. |

### 9.7 Attendance Marking

For the MVP, attendance status shall be deliberately simple:

- `present`
- `absent`

| ID | Priority | Requirement |
|---|---|---|
| FR-ATT-001 | P0 | After class selection, the system shall load all active students enrolled in that tutorial class. |
| FR-ATT-002 | P0 | Students shall appear in A–Z alphabetical order by full name. |
| FR-ATT-003 | P0 | Each row shall display the student's full name and TP number side by side. |
| FR-ATT-004 | P0 | Each student shall have mutually exclusive Present and Absent controls. |
| FR-ATT-005 | P0 | A tutor shall be able to change an individual student's attendance status before saving and during the same-day edit window. |
| FR-ATT-006 | P0 | A single search field shall filter the displayed roster by full/partial student name or full/partial TP number, case-insensitively. |
| FR-ATT-007 | P0 | Clearing the search field shall restore the full alphabetical roster without losing any attendance selections already made. |
| FR-ATT-008 | P0 | Every active student in the selected class shall have a status before attendance can be saved. |
| FR-ATT-009 | P0 | There shall be no more than one attendance record per student per attendance session. |
| FR-ATT-010 | P0 | Attendance shall persist in Supabase after a successful save. |
| FR-ATT-011 | P0 | The interface shall display live Total, Present, Absent and Unmarked counts. |
| FR-ATT-012 | P1 | The interface may include **Mark All Present** as a convenience action, but the tutor must still be able to change individual students to Absent before saving. |
| FR-ATT-013 | P0 | The attendance page shall display: **“Any changes related to the student list, please let Ms Aida know ASAP.”** |

### 9.8 Save and Same-Day Editing

| ID | Priority | Requirement |
|---|---|---|
| FR-SAVE-001 | P0 | Tutor shall complete the roster and select **Save Attendance**. |
| FR-SAVE-002 | P0 | Before save, the system shall validate class, date, time and attendance status for every active student. |
| FR-SAVE-003 | P0 | A successful save shall record `saved_at` and `updated_at` timestamps. |
| FR-SAVE-004 | P0 | Saved attendance shall be immediately visible on the lecturer dashboard. |
| FR-SAVE-005 | P0 | The tutor who created the attendance may reopen and edit it only while the current Malaysia calendar date equals the session's `class_date`. |
| FR-SAVE-006 | P0 | At 12:00 AM on the following Malaysia calendar day, tutor updates to that session shall be rejected by the backend even if the edit page is still open in the browser. |
| FR-SAVE-007 | P0 | After the same-day edit window closes, the tutor view shall be read-only and direct API attempts to modify the record shall be rejected. |
| FR-SAVE-008 | P0 | Ms Aida may correct a saved attendance record after the tutor edit window has closed. |
| FR-SAVE-009 | P0 | Same-day tutor edits and later lecturer corrections shall update the audit trail. |
| FR-SAVE-010 | P0 | The time-zone basis for the edit rule shall be `Asia/Kuala_Lumpur`. |

### 9.9 Lecturer Attendance Dashboard

| ID | Priority | Requirement |
|---|---|---|
| FR-DASH-001 | P0 | The lecturer shall have a dashboard listing all attendance sessions. |
| FR-DASH-002 | P0 | Newest sessions shall appear first by default. |
| FR-DASH-003 | P0 | Dashboard shall show module, full tutorial class, date, time, tutor name, total students, present count and absent count. |
| FR-DASH-004 | P0 | Dashboard shall show APSpace processing status. |
| FR-DASH-005 | P0 | Lecturer shall be able to filter by module. |
| FR-DASH-006 | P0 | Lecturer shall be able to filter by tutorial group. |
| FR-DASH-007 | P0 | Lecturer shall be able to filter by tutor. |
| FR-DASH-008 | P0 | Lecturer shall be able to filter by date/date range. |
| FR-DASH-009 | P0 | Lecturer shall be able to open a session to view student-level attendance. |
| FR-DASH-010 | P1 | Lecturer shall be able to search by student ID or student name when reviewing historical attendance. |

### 9.10 APSpace Processing Status

| ID | Priority | Requirement |
|---|---|---|
| FR-APS-001 | P0 | Every saved session shall have APSpace status `pending` by default. |
| FR-APS-002 | P0 | Only the lecturer shall be able to change APSpace status. |
| FR-APS-003 | P0 | Lecturer shall be able to mark a session `keyed_in`. |
| FR-APS-004 | P0 | The system shall record when APSpace status was changed to `keyed_in`. |
| FR-APS-005 | P0 | The system shall record which lecturer account performed the action. |
| FR-APS-006 | P1 | The dashboard shall provide a filter for `Pending APSpace Entry` and `Keyed into APSpace`. |

### 9.11 Attendance Detail View

| ID | Priority | Requirement |
|---|---|---|
| FR-DET-001 | P0 | Lecturer shall see all metadata for the selected session, including the recording tutor and save/update timestamps. |
| FR-DET-002 | P0 | Lecturer shall see the complete roster and attendance status. |
| FR-DET-003 | P0 | The detail page shall show totals for Present and Absent. |
| FR-DET-004 | P0 | The detail page shall clearly show the recording tutor name and tutor profile identifier. |
| FR-DET-005 | P1 | Lecturer shall be able to print the attendance detail using browser print functionality. |

### 9.12 Export

| ID | Priority | Requirement |
|---|---|---|
| FR-EXP-001 | P1 | Lecturer shall be able to export a single session to CSV. |
| FR-EXP-002 | P1 | Lecturer shall be able to export filtered session data to CSV. |
| FR-EXP-003 | P1 | Exported student attendance shall include module, tutorial class, date, time, tutor name, student ID/TP number, student name and attendance status. |

### 9.13 Audit Trail

| ID | Priority | Requirement |
|---|---|---|
| FR-AUD-001 | P0 | Attendance session shall store the resolved tutor profile ID that created the session. |
| FR-AUD-002 | P0 | Attendance session shall store the tutor-name snapshot at the time of recording; the access code itself shall not be stored in plaintext in attendance records. |
| FR-AUD-003 | P0 | Attendance records shall store created/updated timestamps. |
| FR-AUD-004 | P0 | Changes to saved attendance shall generate an audit event. |
| FR-AUD-005 | P1 | Lecturer shall be able to view relevant audit events for a session. |
| FR-AUD-006 | P0 | Audit events shall not be editable by tutors. |

---

## 10. Business Rules

| ID | Rule |
|---|---|
| BR-001 | Each active tutor access code must resolve to exactly one tutor profile. |
| BR-002 | Tutor identity is resolved from a valid server-validated tutor code and cannot be selected manually. |
| BR-003 | Each student ID must be unique. |
| BR-004 | Tutorial group number must be unique within a module. |
| BR-005 | A student may be enrolled in different tutorial groups across different modules. |
| BR-006 | Only students enrolled in the selected module/group may appear on its attendance sheet. |
| BR-007 | A tutor may only create attendance for an assigned group. |
| BR-008 | Every student on the active roster must be marked before attendance can be saved. |
| BR-009 | A student can have only one attendance status in one session. |
| BR-010 | Tutors may edit their own saved attendance only on the same Malaysia calendar day as the class date; after that it is read-only for tutors. |
| BR-011 | Ms Aida may correct attendance after the tutor edit window closes, and all changes must retain audit information. |
| BR-012 | Historical attendance shall never be deleted merely because a student, tutor, group or module is later deactivated. |
| BR-013 | APSpace status is workflow metadata only; it does not transmit data to APSpace. |
| BR-014 | Only the lecturer can mark a session as keyed into APSpace. |
| BR-015 | The original tutor who recorded attendance must remain visible even if the tutor is subsequently deactivated. |
| BR-016 | If a tutor is covering another tutorial group, the lecturer must assign access to that group before attendance can be created. |
| BR-017 | Permanent hard deletion of saved attendance should not be available through the normal UI. |
| BR-018 | Student rosters shall be displayed alphabetically by name with TP number next to the name. |
| BR-019 | A tutor shall notify Ms Aida ASAP about any required student-list change; tutors cannot modify the roster themselves. |
| BR-020 | The initial ungrouped SDM student row shall be excluded from active system data. |
| BR-021 | Tutor-code validation and same-day edit enforcement shall occur on the server, not only in the browser. |

---

## 11. User Interface Requirements

The interface should be responsive and optimized for laptop/tablet use, while remaining usable on mobile devices.

### 11.1 Login Page

The landing page shall provide separate entry paths for the lecturer and tutors.

**Tutor entry:**

- APU Tutorial Attendance System title.
- **Tutor Code** field with placeholder such as `MAY123`.
- **Continue** button.
- Friendly invalid/inactive code message.
- No student names, TP numbers, or roster information shown until the code is validated.

**Lecturer entry:**

- **Lecturer Login** link/button.
- Supabase Auth email/password login for Ms Aida.

### 11.2 Tutor Home Dashboard

After a valid tutor code is entered, display:

- Welcome message with tutor name.
- Assigned classes/subjects only.
- **New Attendance** primary button.
- Today's/recent attendance records created by that tutor.
- Edit action only when the attendance is still within the same-day edit window.
- Read-only indicator when the edit window has closed.

### 11.3 New Attendance – Session Setup

The tutor session setup shall use a short form in this order:

1. **Class / Subject** – dropdown limited to assigned classes. Display format: `SDM – CT046-3-2-SDM-T-40`.
2. **Class Date** – date picker; default today; future dates disabled.
3. **Class Time** – time input.
4. **Continue to Attendance** button.

The tutor identity is already known from the validated tutor code and is not selected in this form.

### 11.4 Attendance Marking Screen

Header:

- Tutor name
- Class / Subject
- Class date
- Class time

Important roster notice displayed prominently:

> **Any changes related to the student list, please let Ms Aida know ASAP.**

Search:

- One search bar labelled **Search student name or TP number**.
- Search filters as the tutor types.
- Matching is case-insensitive and supports partial names/TP numbers.
- Attendance choices already made must remain selected when the roster is filtered or the search is cleared.

Roster layout:

| Student Name | TP Number | Present | Absent |
|---|---|---|---|

Usability requirements:

- Student names are always ordered alphabetically A–Z by full name.
- TP number appears immediately next to the student name in the adjacent column.
- Present/Absent options are mutually exclusive and large enough for tablet/mobile use.
- Live summary displays Total, Present, Absent and Unmarked.
- **Save Attendance** is disabled while any student remains unmarked.
- Optional **Mark All Present** may be provided as a convenience action.

Primary action:

- **Save Attendance**

### 11.5 Save Confirmation

After the tutor clicks **Save Attendance**, show a short confirmation summary:

- Class / Subject.
- Date/time.
- Tutor.
- Total students.
- Present count.
- Absent count.
- Absent-student list for quick verification.

Buttons:

- **Back to Edit** – available only while still on the same class date.
- **Confirm Save**.

After confirmation, show **Attendance saved successfully** and explain that the tutor may edit it only until the end of the class date.

### 11.6 Lecturer Dashboard

Recommended columns:

| Date | Module | Tutorial Class | Time | Tutor | Present | Absent | APSpace | Action |
|---|---|---|---|---|---:|---:|---|---|

Filters:

- Module
- Group
- Tutor
- From date
- To date
- APSpace status

Actions:

- View
- Export CSV
- Mark Keyed into APSpace

### 11.7 Lecturer Session Detail

Top section:

- Module
- Tutorial group
- Date
- Start time
- Tutor name
- Saved timestamp
- Last updated timestamp
- APSpace status

Summary cards:

- Total students
- Present
- Absent

Student table:

| Student ID | Student Name | Status | Remark |
|---|---|---|---|

Lecturer actions:

- Edit/Correct
- Export CSV
- Mark Keyed into APSpace

### 11.8 Administration Screens

Lecturer-only pages:

- Modules
- Tutorial Groups
- Students
- Tutor Profiles
- Tutor Assignments
- Student CSV/XLSX Import
- Tutor Access Codes

---

## 12. Data Model

Supabase PostgreSQL will be the system of record.

### 12.1 Entity Relationship Overview

```text
auth.users (lecturer only)
    |
    | optional 1:1 for lecturer profile
    v
profiles (1 lecturer + 4 tutor profiles)
    |
    +-----------------------------+
                                  |
modules 1----* tutorial_groups    |
                  |               |
                  +----* tutor_group_assignments *----1 profiles
                  |
                  +----* group_enrolments *----1 students
                  |
                  +----* attendance_sessions ----1 profiles (recording tutor)
                               |
                               +----* attendance_records *----1 students
                               |
                               +----* audit_logs

Tutor code validation occurs server-side and resolves to a tutor profile.
```

### 12.2 `profiles`

Purpose: stores the lecturer application profile and the four tutor profiles.

| Column | Type | Constraints / Notes |
|---|---|---|
| id | uuid | PK |
| auth_user_id | uuid | nullable; references `auth.users.id`; populated for lecturer account |
| full_name | text | required |
| role | text/enum | `lecturer`, `tutor` |
| tutor_code_prefix | text | nullable for lecturer; e.g. `MAY`, `AMIR` |
| tutor_code_hash | text | nullable for lecturer; secure one-way hash of full tutor access code |
| is_active | boolean | default true |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Recommended constraints:

- `auth_user_id` is unique when present.
- If `role = 'tutor'`, `tutor_code_prefix` and `tutor_code_hash` must not be null.
- Full plaintext tutor codes shall not be stored in this table.

### 12.3 `modules`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | uuid | PK |
| module_code | text | required; e.g. SDM / ISWE or official module code |
| module_name | text | required |
| intake_semester | text | optional |
| is_active | boolean | default true |
| created_by | uuid | lecturer profile |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

### 12.4 `tutorial_groups`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | uuid | PK |
| module_id | uuid | FK `modules.id` |
| group_number | text | required; numeric group value from source roster |
| tutorial_code | text | required; full class code such as `CT046-3-2-SDM-T-40`; unique |
| display_name | text | optional |
| is_active | boolean | default true |
| created_at | timestamptz | default now() |

Unique constraint:

```text
(module_id, group_number)
```

Additional unique constraint:

```text
(tutorial_code)
```

### 12.5 `students`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | uuid | PK |
| student_id | text | unique; required |
| full_name | text | required |
| is_active | boolean | default true |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

### 12.6 `group_enrolments`

Purpose: joins students to module-specific tutorial groups.

| Column | Type | Constraints / Notes |
|---|---|---|
| id | uuid | PK |
| tutorial_group_id | uuid | FK |
| student_id | uuid | FK `students.id` |
| is_active | boolean | default true |
| enrolled_at | timestamptz | default now() |

Unique constraint:

```text
(tutorial_group_id, student_id)
```

### 12.7 `tutor_group_assignments`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | uuid | PK |
| tutor_profile_id | uuid | FK `profiles.id` |
| tutorial_group_id | uuid | FK |
| is_active | boolean | default true |
| assigned_by | uuid | lecturer profile |
| assigned_at | timestamptz | default now() |

Unique active assignment should be logically enforced for the tutor/group combination.

### 12.8 `attendance_sessions`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | uuid | PK |
| module_id | uuid | FK |
| tutorial_group_id | uuid | FK |
| tutor_profile_id | uuid | recording tutor profile |
| tutor_name_snapshot | text | recording tutor name copied at first save |
| class_date | date | required |
| class_time | time | required |
| saved_at | timestamptz | required after first save |
| last_tutor_edit_at | timestamptz | nullable |
| apspace_status | text/enum | `pending`, `keyed_in` |
| apspace_keyed_at | timestamptz | nullable |
| apspace_keyed_by | uuid | nullable; lecturer profile |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Recommended duplicate guard:

```text
(tutorial_group_id, class_date, class_time)
```

Tutor editability is determined by comparing `class_date` with the current `Asia/Kuala_Lumpur` calendar date on the server.

### 12.9 `attendance_records`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | uuid | PK |
| attendance_session_id | uuid | FK |
| student_id | uuid | FK |
| status | text/enum | `present`, `absent` |
| remark | text | optional |
| marked_by_profile_id | uuid | tutor or lecturer profile responsible for latest mark/update |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Unique constraint:

```text
(attendance_session_id, student_id)
```

### 12.10 `audit_logs`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | uuid | PK |
| actor_profile_id | uuid | user performing action |
| entity_type | text | e.g. `attendance_session`, `attendance_record` |
| entity_id | uuid | affected record |
| action | text | save, tutor_edit, lecturer_correct, apspace_keyed, roster_change, tutor_assignment_change |
| old_values | jsonb | optional |
| new_values | jsonb | optional |
| created_at | timestamptz | default now() |

### 12.11 Optional `import_batches`

Useful if CSV import is implemented.

Fields may include:

- id
- filename
- uploaded_by
- uploaded_at
- total_rows
- successful_rows
- failed_rows
- error_summary

---

## 13. Data Integrity Requirements

1. Foreign keys shall be used for all entity relationships.
2. Student ID shall be unique.
3. Active tutor code hashes shall be unique, and tutor code prefixes shall match the tutor-name format.
4. A module/group combination shall uniquely identify a tutorial group.
5. Duplicate student attendance in a session shall be prevented at database level.
6. A saved session must contain one attendance record for every active student in the selected class roster.
7. Historical records should use soft-delete/inactive flags rather than destructive deletion.
8. Attendance records should preserve historical names/IDs through relational data and/or snapshots where future institutional requirements demand immutable reporting.
9. The initial student row with no tutorial group shall not be seeded into the active attendance roster.
10. Tutor updates must pass the server-side same-day rule using `Asia/Kuala_Lumpur`.

---

## 14. Authentication Design

### 14.1 Lecturer Authentication

Ms Aida shall use **Supabase Auth** with an individual lecturer/admin account. Email/password authentication is suitable for the initial release.

### 14.2 Tutor Code Access

Tutors shall use a lightweight code-entry flow rather than email/password accounts.

Code format:

```text
May    -> MAY###
Amir   -> AMIR###
Arya   -> ARYA###
Latifa -> LATIFA###
```

`###` means exactly three randomly generated digits. Example only: `MAY123`.

Security requirements:

1. Tutor codes are generated during deployment or regenerated by Ms Aida.
2. Full tutor codes are shared privately and are not committed to source control or embedded in frontend JavaScript.
3. The backend stores only a secure one-way hash of each full tutor code.
4. Code validation occurs in a trusted server-side Netlify Function (or equivalent Supabase server-side function), not by downloading the code list to the browser.
5. A successful validation resolves the tutor profile and creates a short-lived tutor session token/cookie.
6. Failed attempts are rate-limited to reduce guessing of the three-digit suffix.
7. Student roster data is returned only after successful tutor validation.
8. Attendance records store the tutor profile ID/name, not the plaintext access code.

### 14.3 Same-Day Edit Authorization

Every tutor attendance update request shall be checked server-side:

```text
current date in Asia/Kuala_Lumpur == attendance_sessions.class_date
```

If the condition is false, the tutor update is rejected. Ms Aida retains administrative correction rights.

## 15. Authorization and Supabase Row Level Security (RLS)

Supabase RLS shall protect lecturer-facing direct database access. Tutor data access shall pass through a trusted server-side function after tutor-code validation.

### 15.1 Authorization Matrix

| Resource | Lecturer – Ms Aida | Tutor |
|---|---|---|
| Profiles | Read/manage application metadata | No direct database access; resolved server-side from code |
| Modules | CRUD | Read assigned class metadata through tutor API |
| Tutorial groups | CRUD | Read assigned classes only through tutor API |
| Students | CRUD | Read students in selected assigned class only through tutor API |
| Group enrolments | CRUD | Read assigned-class enrolments only through tutor API |
| Tutor assignments | CRUD | Read own effective assignments through tutor API |
| Attendance sessions | Read/update all | Create/read own assigned sessions; update only on same class date |
| Attendance records | Read/update all | Create/read/update own session records only during same-day window |
| APSpace status | Update | No update |
| Audit logs | Read | No direct update/delete |

### 15.2 Tutor Server-Side Authorization Rules

For every tutor request, the backend shall:

- Verify the short-lived tutor session token/cookie created after valid code entry.
- Resolve the tutor profile ID.
- Verify the requested tutorial class is actively assigned to that tutor.
- Return only students in the selected assigned class.
- For updates, verify the current Malaysia date equals the attendance `class_date`.
- Reject attempts to change APSpace status or student master data.
- Write audit metadata using the resolved tutor profile.

### 15.3 Lecturer RLS Rules

For Ms Aida's Supabase-authenticated session:

- Permit lecturer-authorized read/admin access to application tables.
- Permit student roster maintenance, tutor assignments, attendance corrections and APSpace-status updates.
- Keep audit logs non-editable through normal application screens.

### 15.4 Security Principle

Authorization and same-day edit restrictions must be enforced on the server/database boundary, not only by hiding or disabling frontend buttons.

## 16. System Architecture

### 16.1 Logical Architecture

```text
+------------------------------------------------------+
|                    End Users                         |
| Ms Aida (Lecturer)               Tutors x 4         |
+---------------------------+--------------------------+
                            |
                            | HTTPS
                            v
+------------------------------------------------------+
|                Netlify Web Application               |
| React + TypeScript + Vite                            |
+----------------------+-------------------------------+
                       |                         |
           Lecturer JWT|                         |Tutor code/session
                       v                         v
+-----------------------------+      +-----------------------------+
| Supabase Client + RLS       |      | Netlify Functions           |
| Lecturer authenticated UI  |      | Validate tutor code         |
+-----------------------------+      | Enforce assignments/date    |
              |                      +--------------+--------------+
              |                                     |
              +--------------------+----------------+
                                   v
+------------------------------------------------------+
|                     Supabase                         |
| PostgreSQL | Supabase Auth (lecturer) | Audit data  |
+------------------------------------------------------+

Claude Code = development/build assistant, not a production runtime service.
```

### 16.2 Frontend

Recommended technologies:

- React
- TypeScript
- Vite
- Supabase JavaScript client
- Lightweight component library or custom accessible components
- React Router for route protection/navigation if needed

Suggested routes:

```text
/
/tutor
/tutor/attendance/new
/tutor/attendance/:sessionId
/lecturer
/lecturer/attendance/:sessionId
/lecturer/students
/lecturer/groups
/lecturer/tutors
/lecturer/import
```

### 16.3 Hosting – Netlify

Netlify will host the frontend application.

Requirements:

- Production deployment from Git repository.
- HTTPS enabled.
- SPA redirects configured where necessary.
- Production environment variables configured through Netlify.
- Preview deploys may be used during development/testing.
- Netlify Functions shall provide the trusted tutor-code validation and tutor attendance API boundary.

### 16.4 Backend – Supabase

Supabase will provide:

- PostgreSQL database.
- Supabase Auth for the lecturer account.
- Row Level Security for lecturer-facing data access.
- Database constraints and indexes.
- Optional database functions/triggers.
- Optional Edge Functions if future privileged server-side logic is required.

### 16.5 Claude Code

Claude Code will be used as a development tool for:

- Creating project structure.
- Implementing frontend components.
- Writing Supabase migrations.
- Writing RLS policies.
- Generating tests.
- Refactoring and code review.
- Preparing deployment configuration.

Claude Code shall not be considered part of the runtime architecture.

---

## 17. Environment Configuration

Recommended frontend environment variables:

```text
VITE_SUPABASE_URL=<Supabase project URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable/anon key>
SUPABASE_SERVICE_ROLE_KEY=<server-side Netlify Functions only>
TUTOR_SESSION_SECRET=<server-side signing secret>
```

Rules:

1. Production variables are configured in Netlify environment settings.
2. `.env` files containing project values should not be committed to source control.
3. `SUPABASE_SERVICE_ROLE_KEY` and `TUTOR_SESSION_SECRET` must be scoped to trusted Netlify Functions and must never be exposed to browser code.
4. Tutor-code validation and tutor database writes shall execute in trusted server-side functions with explicit authorization checks.

---

## 18. Student Roster Import Specification (CSV/XLSX)

The initial production data will come from the two supplied Excel workbooks.

### 18.1 Supported Initial Source Format

The supplied workbooks use the following relevant columns:

| Source Workbook | Worksheet | Name Column | Student ID Column | Tutorial Group Column | Other Column |
|---|---|---|---|---|---|
| `CT046_Student_List.xlsx` | `Students` | `Name` | `Student ID` | `Tutorial Group` | `Assignment Group` |
| `AAPP003_ISWE_Student_List.xlsx` | `Roster` | `Name` | `Student ID` | `Tutorial Group` | `Assignment Group` |

For attendance purposes, the required source fields are:

- `Name`
- `Student ID`
- `Tutorial Group`

`Assignment Group` is not required for the attendance MVP and should be ignored unless a later feature explicitly needs it.

The lecturer shall select the target module during import, or the initial deployment migration script shall use an explicit workbook-to-module mapping:

```text
CT046_Student_List.xlsx      -> CT046-3-2-SDM
AAPP003_ISWE_Student_List.xlsx -> AAPP003-4-2-ISWE
```

The system shall map source columns to normalized database fields:

```text
Name           -> student_name
Student ID     -> student_id
Tutorial Group -> group_number
Selected module -> module_code
```

The full tutorial class code shall be resolved from the configured tutorial group. For the initial deployment:

```text
CT046-3-2-SDM + group 40  -> CT046-3-2-SDM-T-40
AAPP003-4-2-ISWE + group 7 -> AAPP003-4-2-ISWE-T-7
```

### 18.2 Optional Normalized CSV Format

For future imports, the system may also accept a normalized CSV format:

```csv
module_code,group_number,student_id,student_name
CT046-3-2-SDM,40,TP012345,Ahmad Bin Ali
CT046-3-2-SDM,40,TP012346,Siti Nur Aisyah
AAPP003-4-2-ISWE,7,TP012347,Example Student
```

If `module_code` is not present in the uploaded file, the lecturer must select the target module before preview/commit.

### 18.3 Import Behaviour

The import process shall:

1. Validate the expected worksheet and/or headers.
2. Trim leading/trailing whitespace.
3. Normalize the source columns into `student_name`, `student_id` and `group_number`.
4. Resolve the selected/configured module.
5. Match the configured tutorial group using module + group number.
6. Upsert the student based on `student_id`.
7. Create the group enrolment if it does not already exist.
8. Exclude rows with a missing tutorial group from the active import and report them in the import summary; never silently assign a group.
9. Reject or flag malformed rows and duplicate student IDs within the import.
10. Ignore spreadsheet summary/helper columns that are not part of the row-level roster.
11. Show a preview before committing.
12. Show an import summary:
   - Rows processed
   - Students created
   - Students updated
   - Enrolments created
   - Rows excluded because tutorial group is missing
   - Rows requiring correction
   - Errors

For the initial SDM workbook, the row-level roster is the source of truth because the workbook's embedded `GROUP` / `TOTAL` helper summary does not fully reflect the current student rows. The one row with no tutorial group shall be excluded from the initial seed/import, resulting in 178 active SDM student rows.

For the safest MVP, module and tutorial groups shall already exist before committing the student roster import.

---

## 19. APSpace Manual-Entry Workflow

The application is not an APSpace replacement.

The lecturer dashboard should specifically support the manual process.

### 19.1 Session State

Example:

```text
Tutor saves attendance
        |
        v
Attendance Session: SAVED
APSpace Status: PENDING
        |
        v
Lecturer opens session
        |
        v
Lecturer keys attendance into APSpace manually
        |
        v
Lecturer clicks "Mark as Keyed into APSpace"
        |
        v
APSpace Status: KEYED_IN
```

### 19.2 Visual Status Labels

Recommended labels:

- **Pending APSpace Entry**
- **Keyed into APSpace**

The dashboard should make pending sessions visually easy to identify.

---

## 20. Error Handling and Validation

### 20.1 Access Errors

User-friendly messages should be displayed for:

- Invalid tutor code or lecturer credentials.
- Inactive tutor profile/account.
- Too many failed tutor-code attempts; temporary retry delay.
- Network failure.

Avoid exposing internal authentication details.

### 20.2 Session Validation

Prevent save when:

- Module is missing.
- Tutorial group is missing.
- Date is missing.
- Start time is missing.
- Student roster is not loaded.
- One or more students are unmarked.
- Tutor attempts to save changes after the same-day edit window has closed.

### 20.3 Duplicate Session Warning

If a tutor attempts to create attendance matching an existing session's tutorial class, date and class time, the application should:

- Block the duplicate by default.
- Show the existing session.
- Allow the tutor to return to that session if authorized.
- Require lecturer intervention for a legitimate duplicate scenario.

### 20.4 Connectivity Failure

If save fails:

- Do not display a success message.
- Keep the user's current screen data where possible.
- Show a retry action.
- Prevent duplicate saves caused by repeated clicks.

---

## 21. Non-Functional Requirements

### 21.1 Performance

| ID | Requirement |
|---|---|
| NFR-PERF-001 | Initial authenticated dashboard should normally render within approximately 2 seconds under normal network conditions. |
| NFR-PERF-002 | Loading a normal tutorial roster should normally complete within approximately 2 seconds. |
| NFR-PERF-003 | Attendance save/update should provide user feedback promptly and normally complete within approximately 2 seconds. |
| NFR-PERF-004 | Database indexes shall support filtering by module, group, tutor, class date and APSpace status. |

The target workload is small (5 staff users) but database design should comfortably support multiple intakes and historical semesters.

### 21.2 Availability

- The application should be available whenever Netlify and Supabase production services are available.
- The product should degrade safely on network failure and never falsely report a successful attendance save.

### 21.3 Security

- HTTPS only in production.
- Supabase authentication required for Ms Aida.
- Server-side tutor-code validation required for tutors.
- RLS on lecturer-facing exposed application tables.
- Least-privilege authorization.
- No service-role key or tutor-code list in frontend code.
- Tutor codes stored as secure one-way hashes.
- Rate limiting for invalid tutor-code attempts.
- Sensitive operations should be auditable.

### 21.4 Privacy

Student name and student ID are personal data and should be handled accordingly.

Requirements:

- Collect only data required for the attendance workflow.
- Do not expose student data publicly.
- Restrict access to authorized APU staff.
- Avoid copying attendance/student information into client-side analytics services unless institutionally approved.
- Confirm final deployment and retention practices against applicable APU policies and Malaysian personal-data requirements.

### 21.5 Usability

- Tutor attendance marking should be practical on a tablet.
- Primary actions should be visible without complex navigation.
- Use consistent status wording.
- Do not require the tutor to type student IDs or names during normal attendance.
- Sort the roster alphabetically by student name and place TP number next to each name.
- Provide fast search by student name or TP number.
- Make bulk "Mark All Present" available as an optional convenience.

### 21.6 Accessibility

Recommended target: WCAG 2.1 AA principles for core flows.

At minimum:

- Sufficient text contrast.
- Keyboard-navigable form controls.
- Labels associated with inputs.
- Attendance status must not rely only on color.
- Clear focus states.

### 21.7 Browser Support

Target current desktop/mobile versions of:

- Google Chrome
- Microsoft Edge
- Safari

---

## 22. Database Index Recommendations

Recommended indexes:

```text
profiles(tutor_code_prefix)
students(student_id)
tutorial_groups(module_id, group_number)
group_enrolments(tutorial_group_id, is_active)
tutor_group_assignments(tutor_profile_id, is_active)
tutor_group_assignments(tutorial_group_id, is_active)
attendance_sessions(class_date)
attendance_sessions(module_id, class_date)
attendance_sessions(tutorial_group_id, class_date)
attendance_sessions(tutor_profile_id, class_date)
attendance_sessions(apspace_status, class_date)
attendance_records(attendance_session_id)
attendance_records(student_id)
```

---

## 23. Audit Requirements

Auditability is important because attendance may be corrected after a class.

Minimum audit events:

- Attendance session first saved.
- Same-day tutor attendance edited.
- Lecturer attendance corrected after the tutor edit window.
- APSpace status changed to keyed in.
- Student group enrolment changed.
- Tutor group assignment changed.

For material attendance corrections, the audit trail should retain:

- Actor.
- Timestamp.
- Affected entity.
- Previous value.
- New value.

---

## 24. Reporting Requirements

### 24.1 MVP Operational Report

The primary report is the lecturer attendance dashboard.

Required filters:

- Module.
- Group.
- Tutor.
- Date range.
- APSpace status.

### 24.2 Session Summary

Each session should display:

```text
Module: SDM
Tutorial Class: CT046-3-2-SDM-T-40
Group: 40
Date: 03/10/2026
Start Time: 10:45 AM
Tutor: May
Total Students: 42
Present: 39
Absent: 3
APSpace: Pending APSpace Entry
```

### 24.3 Future Reports

Potential later additions:

- Student attendance percentage by module.
- Repeated absence list.
- Attendance trend by tutorial group.
- Tutor session count.
- Monthly/semester summary.

These should not delay the MVP.

---

## 25. Acceptance Criteria

### AC-001 – Tutor Code Identification

**Given** May enters her valid tutor code  
**When** the code is validated  
**Then** the system must identify May  
**And** show only May's assigned tutorial classes  
**And** must not expose another tutor's classes.

### AC-002 – Class Selection

**Given** May is validated  
**When** she opens New Attendance  
**Then** the Class / Subject dropdown must include `CT046-3-2-SDM-T-39` and `CT046-3-2-SDM-T-40`  
**And** must not include classes not assigned to May.

### AC-003 – Group Roster

**Given** `CT046-3-2-SDM-T-40` has 42 active students  
**When** May selects that class  
**Then** exactly those 42 students must load for attendance  
**And** the previously identified SDM row without a tutorial group must not appear.

### AC-004 – Alphabetical Roster and TP Number

**Given** a tutorial roster is loaded  
**When** the attendance page is displayed  
**Then** students must be ordered alphabetically A–Z by full name  
**And** each student's TP number must appear next to the name.

### AC-005 – Student Search

**Given** a roster is loaded  
**When** the tutor types part of a student name or TP number in the search bar  
**Then** only matching students must be shown  
**And** clearing the search must restore the complete alphabetical roster  
**And** attendance choices already made must be retained.

### AC-006 – Complete Attendance Required

**Given** a roster contains 42 students  
**And** one student remains unmarked  
**When** the tutor attempts to save attendance  
**Then** the save must be blocked  
**And** the system must indicate that one student is still unmarked.

### AC-007 – Save Visibility

**Given** a tutor completes all attendance statuses  
**When** the tutor confirms **Save Attendance**  
**Then** the record must be stored  
**And** it must immediately appear in Ms Aida's dashboard with tutor, class, date, time, present count and absent count.

### AC-008 – Same-Day Tutor Edit

**Given** May saved attendance for a class dated 3 October 2026  
**And** the current Malaysia date is still 3 October 2026  
**When** May reopens the record  
**Then** she must be able to change an attendance status and save it again  
**And** the change must be auditable.

### AC-009 – Tutor Edit Lock After Class Date

**Given** May saved attendance for a class dated 3 October 2026  
**And** the current Malaysia date is 4 October 2026 or later  
**When** May attempts to edit through the UI or a direct API request  
**Then** the system must reject the update  
**And** the record must be read-only to May.

### AC-010 – Lecturer Correction

**Given** a tutor's same-day edit window has closed  
**When** Ms Aida identifies an attendance correction  
**Then** Ms Aida must be able to correct the record  
**And** the correction must be written to the audit trail.

### AC-011 – Student-List Change Notice

**Given** a tutor opens any attendance roster  
**Then** the page must display the notice: **“Any changes related to the student list, please let Ms Aida know ASAP.”**  
**And** the tutor must not have controls to add, delete, or move students.

### AC-012 – Duplicate Prevention

**Given** attendance already exists for a tutorial class on a specific date and class time  
**When** the tutor attempts to create the same session again  
**Then** the application must direct the tutor to the existing record instead of creating an accidental duplicate.

### AC-013 – APSpace Status

**Given** a saved attendance session is pending APSpace entry  
**When** Ms Aida manually keys it into APSpace and marks it as keyed in  
**Then** the session must display **Keyed into APSpace**  
**And** the system must record the timestamp and lecturer identity.

### AC-014 – Tutor Cannot Change APSpace Status

**Given** a tutor session is valid  
**When** the tutor attempts to change APSpace status  
**Then** the operation must be rejected.

### AC-015 – Invalid Tutor Code

**Given** an invalid or inactive tutor code is entered  
**When** the tutor tries to continue  
**Then** no class roster or student data may be displayed  
**And** repeated invalid attempts must be rate-limited.

### AC-016 – Data Persistence

**Given** attendance has been saved successfully  
**When** the tutor or lecturer refreshes the application  
**Then** the saved attendance data must remain available according to their permissions.

## 26. Testing Strategy

### 26.1 Unit Tests

Test:

- Tutor-code format validation.
- Student alphabetical sorting.
- Name/TP-number search filtering.
- Attendance counters.
- Required-field validation.
- Same-day edit-window calculation using `Asia/Kuala_Lumpur`.
- CSV/XLSX parsing and exclusion of rows with no tutorial group.
- Status transformations for APSpace processing.

### 26.2 Integration Tests

Test:

- Tutor code validation to tutor-profile resolution.
- Tutor assignment to class visibility.
- Class selection to roster retrieval.
- Roster retrieval to alphabetical ordering.
- Search filtering without losing attendance selections.
- First save to attendance-record creation.
- Same-day tutor edit to attendance update/audit entry.
- Saved attendance to lecturer dashboard visibility.
- APSpace status update by lecturer.

### 26.3 Authorization Tests

Mandatory scenarios:

- Unvalidated visitor cannot read student data.
- Invalid tutor code cannot retrieve roster data.
- Repeated invalid tutor-code attempts are rate-limited.
- Tutor cannot read an unassigned class roster.
- Tutor cannot create attendance for an unassigned class.
- Tutor cannot update another tutor's attendance session.
- Tutor can update own session on the same Malaysia calendar day.
- Tutor cannot update own session after the class date has ended.
- Tutor cannot change APSpace status.
- Ms Aida can read all attendance records and make administrative corrections.

### 26.4 End-to-End Tests

Critical flows:

1. Tutor enters code -> selects assigned class -> selects date/time -> marks attendance -> saves.
2. Tutor searches by name and TP number -> marks a filtered student -> clears search -> selection remains.
3. Tutor reopens today's saved attendance -> edits -> saves again.
4. Tutor tries to edit yesterday's attendance -> system rejects the update.
5. Ms Aida logs in -> finds saved session -> reviews -> marks APSpace complete.
6. Ms Aida imports an updated roster -> tutor sees the correct updated class list.

### 26.5 User Acceptance Testing

UAT participants:

- Ms Aida.
- At least two of the four tutors initially.

UAT should use representative SDM/ISWE rosters and verify the actual tutor-to-class assignments.

---

## 27. Deployment Environments

Recommended environments:

### 27.1 Local Development

- Local frontend.
- Supabase local development or dedicated dev project.
- Test/dummy student records only where practical.

### 27.2 Staging / Preview

- Netlify preview/staging deployment.
- Supabase development/staging project.
- Used for UAT before production release.

### 27.3 Production

- Production Netlify site.
- Production Supabase project.
- Real SDM/ISWE student data.
- Restricted access to authorized users only.

For a very small MVP, staging may initially be implemented through Netlify deploy previews plus a separate Supabase development project.

---

## 28. Suggested Repository Structure

```text
apu-tutorial-attendance/
├── src/
│   ├── components/
│   │   ├── attendance/
│   │   ├── access/
│   │   ├── dashboard/
│   │   └── ui/
│   ├── pages/
│   │   ├── AccessPage.tsx
│   │   ├── TutorDashboard.tsx
│   │   ├── NewAttendancePage.tsx
│   │   ├── LecturerDashboard.tsx
│   │   ├── AttendanceDetailPage.tsx
│   │   └── AdminStudentsPage.tsx
│   ├── hooks/
│   ├── lib/
│   │   └── supabase.ts
│   ├── services/
├── netlify/
│   └── functions/
│       ├── validate-tutor-code.ts
│       └── tutor-attendance.ts
│   ├── types/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── tests/
├── public/
├── .env.example
├── netlify.toml
├── package.json
├── README.md
└── PRD.md
```

---

## 29. Recommended Implementation Phases

### Phase 0 – Project Setup

Deliverables:

- Git repository.
- React/TypeScript/Vite project.
- Netlify project and Functions scaffold.
- Supabase project.
- Environment configuration.
- Base application routing.

### Phase 1 – Lecturer Authentication and Tutor Code Access

Deliverables:

- Ms Aida lecturer account using Supabase Auth.
- Four tutor profiles.
- Tutor code generation/hash storage.
- Server-side tutor-code validation function.
- Short-lived tutor session token/cookie.
- Failed-attempt rate limiting.
- Lecturer RLS policies.

### Phase 2 – Master Data

Deliverables:

- Modules.
- Tutorial groups.
- Students.
- Group enrolments.
- Tutor/group assignments.
- Initial SDM/ISWE roster import with the ungrouped SDM row excluded.
- Lecturer administration UI.

### Phase 3 – Tutor Attendance Flow

Deliverables:

- Tutor code entry.
- Assigned Class / Subject selection.
- Date picker and class-time input.
- Alphabetical roster with TP number next to name.
- Search by student name or TP number.
- Present/Absent marking.
- Optional Mark All Present.
- Save validation.
- Same-day edit enforcement in `Asia/Kuala_Lumpur`.
- Student-list notice directing changes to Ms Aida.

### Phase 4 – Lecturer Dashboard

Deliverables:

- Saved attendance list.
- Filters.
- Attendance detail.
- Tutor/audit information.
- Administrative attendance correction.
- Pending/Keyed into APSpace state.

### Phase 5 – Import, Export and Audit

Deliverables:

- CSV/XLSX roster import.
- CSV attendance export.
- Audit events.
- Roster-change and tutor-assignment audit entries.

### Phase 6 – Testing and Production Release

Deliverables:

- Authorization tests.
- Same-day edit tests.
- UAT.
- Bug fixes.
- Production deployment.
- Basic operating guide.

---

## 30. MVP Backlog

### Must Have

- Secure lecturer login for Ms Aida.
- Unique tutor access code in `<NAME><3 digits>` format.
- Server-side tutor-code validation and rate limiting.
- SDM and ISWE modules/tutorial classes.
- Student roster/grouping data.
- Tutor/group assignment.
- Exclusion of the ungrouped SDM student row from active roster data.
- Assigned Class / Subject dropdown.
- Date picker and class-time input.
- Alphabetical student roster with TP number next to each name.
- Search by student name or TP number.
- Present/Absent marking.
- Save Attendance.
- Same-day tutor editing only.
- Student-list notice: **Any changes related to the student list, please let Ms Aida know ASAP.**
- Lecturer dashboard.
- View tutor responsible for each record.
- Attendance detail page.
- Pending/Keyed into APSpace workflow.
- Server/database authorization controls.
- Audit timestamps/events.

### Should Have

- CSV/XLSX student import.
- CSV attendance export.
- Mark All Present convenience action.
- Lecturer roster administration.
- Audit log UI.

### Could Have

- Advanced attendance analytics.
- Repeated absence indicator.
- Timetable templates.
- Auto-generated session schedule.
- PWA/offline capability.
- Lecturer bulk **Mark APSpace Complete** action.

### Won't Have in MVP

- APSpace automatic integration.
- Student self check-in.
- QR attendance.
- Biometric attendance.
- Native mobile app.

---

## 31. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Tutor records attendance for wrong class | Incorrect data | Show only assigned Class / Subject options and display the selected full class code prominently. |
| Duplicate session is created | Conflicting attendance | Duplicate detection on tutorial class + class date + class time; return the existing record. |
| Student roster is outdated | Missing/incorrect students | Ms Aida owns roster changes; show the student-list notice on every tutor roster; tutors report discrepancies ASAP. |
| Tutor code is guessed or shared | Unauthorized roster/attendance access | Hash codes server-side, rate-limit failed attempts, short-lived tutor sessions, allow Ms Aida to regenerate compromised codes. |
| Tutor edits attendance after the permitted date | Data-integrity issue | Enforce same-day edit rule server-side using `Asia/Kuala_Lumpur`; later changes are lecturer-only. |
| Browser loses connection during marking | Attendance may not save | Explicit save states, retry behaviour, preserve current form state where possible, prevent duplicate saves. |
| Unauthorized student-data exposure | Privacy/security issue | No roster before validation; lecturer Auth/RLS; tutor server API scoped to assigned class only. |
| Frontend exposes privileged Supabase secret | Critical security issue | Publishable key only in browser; service-role and tutor-session secrets restricted to Netlify Functions. |
| Lecturer forgets which attendance was entered into APSpace | Duplicate/manual work | Dedicated Pending/Keyed into APSpace status and dashboard filter. |
| Student changes tutorial group during semester | Historical inconsistency | Ms Aida updates enrolment; keep enrolment history/soft status and preserve historical attendance. |

---

## 32. Operational Considerations

### 32.1 Initial Setup Checklist

Before go-live:

1. Create production Supabase project.
2. Apply database migrations.
3. Enable/test lecturer RLS policies and tutor server authorization.
4. Create Ms Aida's lecturer Supabase Auth account.
5. Create four tutor profiles.
6. Generate each tutor code using the tutor-name + three-random-digit format; store only secure hashes.
7. Configure SDM and ISWE tutorial classes.
8. Assign May, Amir, Arya and Latifa to the confirmed classes.
9. Import the supplied XLSX rosters, excluding the one SDM row without a tutorial group.
10. Validate active roster counts and alphabetical display.
11. Deploy frontend and Netlify Functions.
12. Configure browser-safe and server-only environment variables correctly.
13. Test tutor code rate limiting and same-day edit lock.
14. Conduct tutor UAT.
15. Confirm lecturer dashboard and APSpace workflow.

### 32.2 Backup and Recovery

The production deployment should use the backup/recovery facilities available for the selected Supabase plan. The team should also define an institutional operating procedure for accidental roster or attendance changes.

At application level:

- Avoid hard deletion of saved attendance.
- Maintain audit logs for material changes.
- Use source-controlled database migrations.

### 32.3 Semester Rollover

At the start of a new intake/semester:

- Create/activate the appropriate module instance/intake metadata.
- Create new tutorial groups if group identifiers change.
- Import the new roster.
- Deactivate old enrolments/groups rather than deleting historical data.
- Assign tutors for the new semester.

---

## 33. Future Enhancements

Possible Phase 2+ enhancements:

1. **APSpace Integration** – only if APU provides an approved API/integration mechanism.
2. **Attendance Analytics** – attendance rate by student and group.
3. **Repeated Absence Alerts** – identify students exceeding lecturer-defined absence thresholds.
4. **Timetable Templates** – pre-create expected tutorial sessions.
5. **Offline/PWA Mode** – allow attendance capture when classroom connectivity is unstable, with secure synchronization later.
6. **Additional Attendance States** – Late, Excused/Approved Absence, Medical Leave where institutionally required.
7. **Multi-Lecturer Support** – support additional module leaders/lecturers with scoped access.
8. **Multi-School Deployment** – tenant/module-level data boundaries if adopted by other APU modules.
9. **Student Search History** – retrieve a student's attendance across sessions.
10. **Dashboard Analytics** – weekly/semester attendance trends.

---

## 34. Open Configuration Decisions Before Build

The key tutor workflow is now confirmed. Remaining operational decisions do not block the MVP architecture:

1. Generate the final private tutor codes during deployment using `MAY###`, `AMIR###`, `ARYA###`, and `LATIFA###`. The actual three digits should not be written into the PRD/source repository.
2. Confirm who should own or conduct the currently unmapped classes: `CT046-3-2-SDM-T-38`, `CT046-3-2-SDM-T-42` and `AAPP003-4-2-ISWE-T-8`. Until confirmed, they remain lecturer-controlled/unassigned.
3. Decide how long a validated tutor browser session should remain active. Recommended MVP: expire after 4 hours or browser close, whichever occurs first.
4. Confirm whether tutors should see only their own historical sessions or all historical sessions for classes currently assigned to them. Recommended MVP: own records only.
5. Confirm whether **Mark All Present** is desired. It can speed up attendance while still allowing individual students to be changed to Absent.

The ungrouped SDM student is no longer an open item for this system build: that row is excluded from the active roster until Ms Aida supplies a valid tutorial group in a future roster update.

---

## 35. Definition of Done – MVP

The MVP is complete when all of the following are true:

- [ ] Ms Aida can authenticate securely as lecturer/admin.
- [ ] Each of the four tutors has a unique private access code based on their own name plus three random digits.
- [ ] Tutor code validation occurs server-side and repeated failed attempts are rate-limited.
- [ ] SDM (`CT046-3-2-SDM`) and ISWE (`AAPP003-4-2-ISWE`) are configured.
- [ ] May, Amir, Arya and Latifa are assigned to the confirmed tutorial classes.
- [ ] The initial active roster excludes the SDM row without a tutorial group.
- [ ] Tutor can enter code and see only assigned Class / Subject choices.
- [ ] Tutor can select class date using a date picker and enter class time.
- [ ] Tutor sees the correct class roster sorted alphabetically A–Z.
- [ ] Every student row shows the TP number next to the student name.
- [ ] Tutor can search by student name or TP number without losing attendance selections.
- [ ] Tutor can mark every student Present or Absent.
- [ ] Tutor cannot save while any student remains unmarked.
- [ ] The roster shows: **Any changes related to the student list, please let Ms Aida know ASAP.**
- [ ] Saved attendance becomes immediately visible to Ms Aida.
- [ ] Tutor can edit own attendance on the same class date.
- [ ] Tutor cannot edit the attendance after the class date ends in Malaysia time.
- [ ] Ms Aida can correct attendance after the tutor edit window closes.
- [ ] Ms Aida can identify which tutor recorded every session.
- [ ] Ms Aida can see complete student-level attendance and filter sessions by module/class, tutor and date.
- [ ] Ms Aida can distinguish attendance pending APSpace entry and mark it as keyed into APSpace.
- [ ] Important attendance and roster changes are auditable.
- [ ] Server/database controls prevent unauthorized access.
- [ ] Service-role/tutor-session secrets are not exposed in browser code.
- [ ] Production frontend and tutor API functions are deployed on Netlify.
- [ ] Core workflows pass UAT.

---

## 36. Implementation Notes for Claude Code

When using Claude Code to implement this PRD, the development sequence should prioritize database security and data integrity before visual polish.

Recommended build order:

```text
1. Scaffold React + TypeScript + Vite project
2. Configure Supabase client and Netlify Functions
3. Create SQL migrations/schema
4. Create database constraints/indexes
5. Implement Ms Aida Supabase Auth + lecturer profile
6. Implement tutor profiles + secure code hashing/generation
7. Implement server-side tutor-code validation + short-lived tutor session
8. Implement lecturer RLS + tutor API authorization tests
9. Implement modules/groups/students/enrolments
10. Import initial rosters and exclude the ungrouped SDM row
11. Implement tutor assignments
12. Implement Class / Subject + date picker + time flow
13. Implement alphabetical roster + TP display + name/TP search
14. Implement Present/Absent marking + Save Attendance
15. Enforce same-day tutor edit window using Asia/Kuala_Lumpur
16. Implement lecturer dashboard + administrative corrections
17. Implement APSpace processing state
18. Implement CSV/XLSX import/export
19. Implement audit logging
20. Add automated tests and UAT
21. Deploy frontend + Netlify Functions to production
```

Claude Code should be instructed not to weaken RLS or bypass server authorization simply to resolve frontend permission errors. Tutor-code validation, class scoping and same-day edit rules must remain enforced at the trusted server/database boundary.

---

## 37. Technical Reference Notes

The architecture uses Supabase Auth for the lecturer, PostgreSQL for the system of record, and Netlify Functions as the trusted tutor-code/API boundary. Lecturer-facing exposed tables should use RLS with explicit grants and policies. Server-only Netlify environment variables must hold privileged keys and signing secrets rather than committing them to source control.

Official implementation references:

- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase password authentication: https://supabase.com/docs/guides/auth/passwords
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase data security: https://supabase.com/docs/guides/database/secure-data
- Netlify environment variables: https://docs.netlify.com/build/environment-variables/overview/

---

## 38. Final MVP Scope Statement

The first production release will be a secure internal web application hosted on Netlify and backed by Supabase. It will support Ms Aida as the lecturer/admin and four tutors using individual name-based access codes in the format `<NAME><3 random digits>`.

A tutor enters their code, selects an assigned Class / Subject, selects the class date using a date picker, enters the class time, and receives the correct active roster. Students are shown alphabetically by full name with TP number next to the name. A search bar supports lookup by student name or TP number. The tutor marks every student Present or Absent and saves the attendance. The tutor can edit that saved record only on the same Malaysia calendar day as the class; later corrections are controlled by Ms Aida.

The initial roster will exclude the SDM row that has no tutorial group. Every tutor attendance screen will display the instruction: **“Any changes related to the student list, please let Ms Aida know ASAP.”** Tutors cannot modify the student master list themselves.

Ms Aida will use a centralized dashboard to review all saved attendance, identify the tutor responsible for each class, manually key the attendance into APSpace, and mark the session as keyed in. The MVP does not integrate directly with APSpace.

This scope addresses the immediate operational attendance workflow while retaining a secure foundation for future reporting, timetable automation, and approved institutional integrations.
