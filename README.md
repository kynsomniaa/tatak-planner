# CpE Pathfinder

Android-first curriculum planning MVP for FEU Institute of Technology BS Computer Engineering students. It imports the **Program Curriculum.html** page saved from SOLAR and turns the official sequence into a personal, persistent trimester board.

## What is implemented

- Strict FEU Tech SOLAR HTML validation and CpE-only curriculum parsing
- Official curriculum import with course code, title, units, prerequisite, and lecture/lab links
- Read-only **Program Curriculum** board with Plan-launched multi-selection by year, term, or individual course
- Personal Trello-style planner that starts with completed/current courses and blank future terms
- Separate retake attempts that preserve every original term, status, and grade
- Two-dimensional empty-space click-and-drag panning, free X/Y term placement from a dedicated header grip, zoom/fit controls, snap/overlap/lock settings, adjustable column and canvas spacing, chronological auto-arrange/reset controls, collapsible terms, hidden columns, and completed-year filtering
- Consistent per-term card order: CPE majors first, COE subjects second, and GED/other courses last
- Selected-chain-only connector lines rendered above the cards with a theme-colored river-flow animation
- Responsive prerequisite-chain drawer with summarized titles, year-of-entry descriptions, priority Internship and Design/Thesis pathways, and no AI/category-generated chains
- Known FEU CpE corequisite handling for COE0001 + COE0003, including joint copying, movement, validation, and chain grouping
- Combined lecture/laboratory cards with visible lab badges and shared movement/status
- User-selectable course-code or course-title card labels
- Hard blocking for prerequisite and corequisite/lab violations
- Automatic lecture/lab bundle moves
- Advisory warnings below 12 units, above 22 units, and for delayed prerequisite chains
- Manual progress states: passed, active, pending, and retake
- Compact post-import progress setup grouped by collapsible years and terms, with All/GED/COE/CPE filters and whole-group controls
- Three-way prerequisite warning: mark requirements passed, continue with a persistent warning, or cancel
- Discoverable Progress gradebook with optional per-attempt grades and unit-weighted GWA for every trimester
- Responsive right-side course details on desktop and bottom sheet on Android
- All/GED/COE/CPE filtered Progress and Ratings views, side-by-side desktop rating comments/form, Android rating bottom sheet, and one editable 300-character review per account/course
- Report, delete, and administrator-moderation controls
- FEU Green, Dark, Black–Maroon, Black–Orange, Pastel Pink, and device-following color palettes
- Strictly valid, single-goal hints for earliest graduation, lighter workload, and program-aware thesis readiness
- Custom goal entry plus a server-side AI optimizer connector
- Opt-in automatic changes; hints never modify the plan by default
- Cloud-ready anonymous username/password accounts and private plan sync through Supabase
- Local fallback mode while Supabase is not connected

Course offerings are deliberately not checked. This app is an unofficial planning aid and never performs registration.

## Run on Android

This project uses Expo SDK 54 so it can be previewed in the compatible Expo Go Android app during the current SDK transition.

```powershell
npm install
npm run android
```

If no Android emulator is installed, run `npm start`, scan the QR code with Expo Go, and keep the phone and development machine on the same network.

## Run as a website

The same project also targets modern desktop and mobile browsers.

```powershell
npm install
npm run web
```

The browser importer reads the locally selected HTML file directly. It does not upload or execute the saved SOLAR page.

## Accounts and Supabase

Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) to enable shared anonymous-username accounts, private cloud plans, ratings, reporting, and the `Kynsomnic` administrator role. Username-only accounts intentionally have no email recovery. Without environment values the app remains usable in local preview mode.

## Optional AI optimizer

Set `EXPO_PUBLIC_AI_OPTIMIZER_URL` to a server endpoint that accepts the JSON payload sent by `src/services/aiOptimizer.ts` and returns:

```json
{
  "suggestions": [
    {
      "id": "unique-id",
      "title": "Short recommendation",
      "detail": "Reason for the recommendation",
      "impact": "Expected planning impact",
      "moves": [{ "courseCode": "CPE0001", "targetTermId": "y2t1" }]
    }
  ]
}
```

Keep model/API secrets on that server. The mobile app validates returned course and term IDs, then runs every proposed move through the local prerequisite/corequisite engine before displaying or applying it.

## Verify

```powershell
npm run typecheck
npm test
npm run analyze -- "C:\path\to\Program Curriculum.html"
```

## Version 1 assumptions

- SOLAR's **LABORATORY** column links a lecture to a lab course and is treated as a same-trimester corequisite.
- The export does not contain course descriptions or a separate corequisite column. Missing descriptions are stated as unavailable; inferred lecture/lab corequisites are symmetric.
- Underload and overload are allowed because planning hypotheticals is a stated requirement. The app warns outside 12–22 units instead of blocking.
- Passed and active courses are locked on the board. Change their status before rescheduling.
- Invalid drops snap back and explain the exact prerequisite/corequisite rule that rejected the move.
- Future pending courses are copied from the official blueprint instead of being prefilled in the personal plan.
- A course can be duplicated only through the explicit retake-attempt action.
- Grades accept a consistent numeric scale from 0–100, remain optional, and never change progress status automatically.
- AI is optional and never bypasses deterministic academic rules.
