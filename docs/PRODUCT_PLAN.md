# RoosterPlan product and technical plan

## MVP data model

- **Employee**: stable ID, first/last/display name, role, avatar or profile image, optional roster color, weekly contract minutes, active flag.
- **Default availability**: employee ID, ISO weekday, start/end local time. Keep one interval per weekday for the first version; the model can expand to breaks or multiple intervals.
- **Absence**: employee ID, kind, start/end instants, optional note. A full day is stored as the local day's start and the next local day's start; a partial absence stores its actual interval.
- **Schedule**: stable ID, Monday week start, draft/final/published status, timestamps, and shifts.
- **Shift**: optional assigned employee, original employee, start/end instants, default/replacement/manual source, optional note. An unassigned shift interval is an open service.
- **Calendar connection and mapping**: employee, provider, calendar ID; shift ID and external event ID. These are reserved for phase 2.

Keep scheduling decisions in a platform-independent domain layer. The first local repository can use on-device persistence behind a repository interface; a future API implementation can replace it without changing the planner rules. Store calendar dates as instants and calculate weekly boundaries in the team's local time zone to handle daylight-saving changes correctly.

## Business rules

1. A generated week starts Monday and creates one shift for each active employee's configured work window.
2. Applying an absence intersects it with assigned shifts. Preserve the unaffected before/after intervals and turn only the overlap into an open shift linked to the original employee.
3. A replacement is blocked when that employee has an overlapping shift or absence. Show the reason for blocked recommendations.
4. Rank eligible replacements by availability, normal workday, remaining contract hours, matching role, and fair distribution of extra hours. A normal day off is still eligible at a lower score; contract overrun is a warning, not an automatic block.
5. Show weekly hours before and after a proposed assignment. The planner explicitly confirms each replacement and schedule status change.
6. A replacement can cover only part of an open shift. Keep any uncovered interval open until the planner resolves it.
7. Scores support sorting only. The interface explains recommendations in plain language and never assigns a person automatically.
8. Schedule transitions are draft → final → published. Editing a final schedule requires an explicit return to draft.

## Main navigation

- **Dashboard**: today's staffing and absences, open-shift count, weekly hours, over-contract and under-contract alerts.
- **Week**: seven-day roster, previous/current/next week navigation, shift detail, open-shift recommendations, schedule status, and PNG export.
- **Team**: employee list, employee detail, role, contract hours, and per-day availability editor.
- **Absences**: absence list and a form for full-day or partial-day sickness, vacation, leave, or other unavailability.
- **Settings**: business name, export style, and later calendar connections.

Use both text/icons and color for status. Put all-day and timed availability in the employee editor; do not assume identical hours on every workday.

## MVP delivery sequence

1. Domain model, local persistence, sample team, and tests for week boundaries and time intervals.
2. Team list and employee editor for contract hours and distinct weekday windows.
3. Standard-week generation, week navigation, and hour totals.
4. Full/partial absence entry, open-interval detection, and conflict validation.
5. Ranked replacement suggestions, clear reasons, split coverage, and planner-confirmed assignment.
6. Draft/final states and a designed, high-resolution PNG export with share support.
7. Verify the complete flow with a representative team: create people → generate week → report partial sickness → review open interval → assign one or more replacements → finalize → export.

Google Calendar sync, employee accounts, leave requests, notifications, and publication are phase 2. Sync should use stored event mappings and idempotent upsert/delete operations after an employee explicitly connects an account.
