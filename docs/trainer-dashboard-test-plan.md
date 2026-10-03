# Trainer Dashboard — Test Plan

Covers every coach ↔ trainee feature: invites, sharing scopes, the coach roster, trainee detail (overview, recovery, training, calendar), assigning plans, logging for a trainee, scheduling appointments, and every popup and notification on the trainee side.

Cases marked **[FIX]** cover a bug fixed in the 2026-10-02 audit. Re-test those first.

## Setup

Use three accounts and two browsers (or one normal window plus one private window), so the coach and trainee views can be watched side by side.

| Account | Role | Notes |
|---|---|---|
| **Coach A** | `is_trainer = true` | Main coach |
| **Trainee T** | athlete | Has some workouts, PRs, body-weight logs, runs. Set units to **kg** for one run of the tests. |
| **Outsider X** | any | Not linked to anyone. Used for the permission tests. |

Before testing, apply migration `supabase/migrations/20261002000000_harden_coaching_access.sql` and deploy the matching client build. The client and migration must ship together (see the Rollout section).

---

## 1. Invites

| ID | Steps | Expected |
|---|---|---|
| INV-1 | A → Invite → enter T's email → Send | Shows "Invite sent" and closes after about 1.3 s. A pending card for T's email appears on the roster. |
| INV-2 | A invites an email with no account | Shows "Not on Athlix yet" with a copy-link button. "Copy sign-up link" changes to "Link copied". The pending card still appears. |
| INV-3 | A invites the same email again while the first invite is pending | Error: "You already have a live invite for that email." |
| INV-4 | A invites their own email | Error: "That's your own email." |
| INV-5 | Enter `foo`, `a@b`, blank | Invalid formats are rejected. The Send button is disabled when blank. |
| INV-6 **[FIX]** | A has a pending invite out. A reloads the app. | A must **not** get a "<A's name> wants to coach you" popup. Before the fix, coaches saw their own outgoing invites as incoming. |
| INV-7 **[FIX]** | A taps ✕ on a pending card → confirm | "Invite cancelled". The card disappears. T no longer sees the invite. |
| INV-8 | T signs in (registered) | Popup: "<Coach A> wants to coach you" with Accept / Decline / Later. |
| INV-9 | T taps Later | Popup closes and comes back next session. The invite is still listed in Settings → Coaches. |
| INV-10 | T taps Decline | Popup closes. A's pending card disappears (status declined). A can invite again. |
| INV-11 | T taps Accept → picks scopes → "Accept & share" | Toast "Connected with <Coach A>". A's roster shows T as active with the correct scope count. |
| INV-12 **[FIX]** | Make accept fail (go offline, then Accept) | Error toast. The popup is **not** removed as if it succeeded. |
| INV-13 | Unregistered invitee from INV-2 signs up with that email | The invite popup appears on first login. |

## 2. Sharing scopes and disconnect (trainee side)

| ID | Steps | Expected |
|---|---|---|
| SCP-1 | Accept with only Workouts on | On A's view of T, only workout-based cards show data. Body weight, PRs, recovery and the rest show "Not shared". |
| SCP-2 | T → Settings → Coaches → Edit sharing → turn PRs on → Save | A refreshes and sees PRs. |
| SCP-3 | Turn Workouts off | The Log-session (+) button disappears for A. The Calendar tab shows "Not shared". Roster status falls back to "Sharing N categories". |
| SCP-4 **[FIX]** | T taps Disconnect | A confirm dialog appears first. After confirming, A's roster no longer lists T, and opening `/coach/trainee/<T id>` shows "Trainee not found". |
| SCP-5 **[FIX]** | After SCP-4, A invites T again and T accepts | Works. Before the fix this failed with a duplicate-key error, so a disconnected trainee could never reconnect. |
| SCP-6 | "Share all" / "Clear all" toggle | Toggles every switch. Confirm saves exactly what is shown. |

## 3. Coach roster (`/coach`)

| ID | Steps | Expected |
|---|---|---|
| ROS-1 | A non-trainer opens `/coach` | Redirected to `/`. |
| ROS-2 | A trainer opens `/` | Redirected to `/coach` with no flash of the athlete Home. |
| ROS-3 | T trained today / yesterday / 9 days ago | Card reads "Trained today" / "Trained 1d ago" / "Trained 9d ago". At 7 or more days the text turns red and the red dot shows. |
| ROS-4 | T logged 3 workouts on 2 distinct days this week | "· 2 this week". Days are counted, not workouts. |
| ROS-5 | "My training" card | Opens the coach's own dashboard at `/me`. |
| ROS-6 | Header count | "N active · M pending" matches the cards. |

## 4. Trainee detail — Overview

| ID | Steps | Expected |
|---|---|---|
| OV-1 | Triage banner: no workouts ever | "No workouts logged yet". |
| OV-2 | Last workout 8 days ago | "No workout in 8 days". |
| OV-3 | 1 session this week | "Only 1 session this week". |
| OV-4 | A plan with no linked workout | "1 assigned plan not started". |
| OV-5 | Recovery shared and below 40% | "Low recovery (N%)". |
| OV-6 | Nothing flagged | Green "On track — no flags this week". |
| OV-7 **[FIX]** | T logs in **kg** (100 kg squat) | A sees **220.5 lb** everywhere: Recent sessions, Exercise history, PRs, the volume trend and the body-weight card. Before the fix it showed "100 lb", and kg and lb were summed together into volume. |
| OV-8 **[FIX]** | T has more than 120 body-weight logs | The Body weight card shows the **latest** weight and recent trend. Before the fix it showed the oldest 120 entries. |
| OV-9 | Weekly goal ring | Shows `sessions/5`. Over 5 caps at a full ring. |
| OV-10 | This week vs last | Session and volume arrows: green for up, red for down, "—" for no change. |
| OV-11 | Focus next | Names the least-trained region this week, or "No training logged this week yet". |
| OV-12 | Muscle map / radar | Map uses 4 weeks of data, radar uses 7 days. The front/back toggle works. The map uses the trainee's sex. |
| OV-13 | Drag cards between columns, reload | The layout persists. Resizing across 768 / 1280 px re-balances the columns without losing any card. |
| OV-14 **[FIX]** | Coach notes: type, tap outside | "Saved" flashes. Reload: the text is still there. |
| OV-15 **[FIX]** | Tap into notes and out without changing anything | No save request and no "Saved" flash. |
| OV-16 **[FIX]** | Notes save fails (offline) | Error toast. "Saved" does **not** flash. |
| OV-17 **[FIX]** | T inspects the network or queries `coach_links` | Coach notes are **not** present. They now live in the trainer-only `coach_private_notes` table. |

## 5. Assigned plans (coach side)

| ID | Steps | Expected |
|---|---|---|
| PLN-1 | Assign → name, add 3 exercises → Assign plan | The plan card shows "Not started · 3 exercises". T gets the popup (see section 8). |
| PLN-2 | Add an exercise T has done before | Weight and reps prefill from T's last top set, in lb (converted if T logs in kg). |
| PLN-3 | Picker "Recent" tab | Shows **T's** recent exercises, not the coach's. |
| PLN-4 | Adding the same exercise twice to one day | Ignored. The same exercise on a different day is allowed. |
| PLN-5 | Add day → Day 1 / Day 2 labels, duplicate a day, remove a day with exercises | Remove asks for confirmation. Duplicate copies every row. |
| PLN-6 **[FIX]** | Name two days "Push", or clear a day name → Assign | Error "Two days have the same name — rename one." or "Give every day a name." Before the fix the days silently merged for the trainee. |
| PLN-7 | Tap outside the sheet with unsaved content | "Discard this plan?" confirm. An empty sheet closes freely. |
| PLN-8 | Sets/Reps/Weight/Rest: −/+ and dial | Clamped to 1–20 sets, 1–100 reps, 0–2000 lb, 0–600 s. Rest shows as m:ss. |
| PLN-9 | Edit plan → change title and exercises → Save | The card updates. The exercise order matches the day order. |
| PLN-10 **[FIX]** | A plan with notes (set via DB) → Edit → Save | Notes are **kept**. Before the fix, editing wiped them. |
| PLN-11 **[FIX]** | Rename a plan attached to an appointment | The appointment card shows the new plan title. |
| PLN-12 **[FIX]** | Delete a plan attached to an appointment | The appointment no longer shows a plan chip. Before the fix the old title stayed with no plan behind it. |
| PLN-13 | Delete → confirm | "Plan deleted". T's linked workouts remain, with source cleared. |
| PLN-14 | Save as template | Toast. The template appears in the coach's picker under "My Plans". |
| PLN-15 **[FIX]** | Multi-day plan, T does **Day 1** only | Card: "3/3 exercises done · Day 1 — 100%". Day 2/3 exercises show **no** "Missed" badge. Before the fix this showed "3/9" with Day 2 and 3 marked Missed. |
| PLN-16 | Single-day plan, T skips one exercise | "2/3 exercises done", the skipped exercise shows "Missed", and actual sets are shown under each done exercise. |

## 6. Log a session for a trainee

The coach's **+ Log** button opens the same full-screen logger the athlete uses, at `/coach/trainee/<id>/log`.

| ID | Steps | Expected |
|---|---|---|
| LOG-1 | The **+ Log** button (lime outline, next to Assign) | Visible only when the trainee shares Workouts. |
| LOG-2 | Tap + Log | Start chooser: Repeat last session (title · date · N exercises), one card per assigned plan day, Start blank. No app header or nav. |
| LOG-3 | Repeat last session | The logger opens with every set of the trainee's last session filled in. The title bar reads "Logging for <name>". |
| LOG-4 | Start blank → pick an exercise | The picker's Recent tab shows the **trainee's** exercises. Sets prefill from the trainee's last time, not the coach's. |
| LOG-5 | Fill sets without ticking any → Review & save | The review lists every set with a value. Save → toast "Saved to <name>'s log", and it appears in the coach's Recent sessions and the trainee's Calendar in **lb**. |
| LOG-6 | Tick only some sets → Review & save | Only ticked sets are listed and saved. |
| LOG-7 | Change the date in the logger to a past day | Saved on that day. A future date → "Can't log a session in the future." |
| LOG-8 | Leave mid-entry, then tap + Log again | "Resume unsaved session" appears first; the trash icon discards it after a confirm. |
| LOG-9 | Rename an exercise inside the coach logger | Renames it in this session only; the coach's own history is untouched. |
| LOG-10 | Start from a plan day → save | The session is linked to the plan and day: the coach's plan card and the trainee's Home card both count that day as done. |
| LOG-11 | The trainee turns Workouts off, then the coach opens the log URL | "<name> isn't sharing workouts with you". |
| LOG-12 | A coach-logged heavier set beats the trainee's PR | The trainee's PR updates. |

## 7. Appointments (coach side, Calendar)

| ID | Steps | Expected |
|---|---|---|
| APT-1 | Calendar → Appointment → pick T, title, date, time, duration → Schedule | "Appointment scheduled". The card appears on A's calendar ("Session with T") and T's calendar ("Appointment with A"). |
| APT-2 **[FIX]** | Open the sheet at 8 PM local time | Defaults to **today** 8:30 PM. Before the fix the date defaulted to tomorrow (UTC). |
| APT-3 **[FIX]** | Open the sheet at 11:40 PM | Defaults to **tomorrow** 12:00 AM. Before the fix it was today 12:00 AM, already in the past. |
| APT-4 **[FIX]** | Pick a time already passed → Schedule | Error "That time has already passed." |
| APT-5 **[FIX]** | Schedule 10:00–11:00 with T, then 10:30 with another trainee | Confirm: "This overlaps … Schedule anyway?". Cancel aborts, OK saves. |
| APT-6 | Attach a plan, or None | Chip shows on the card. Tapping it opens the plan preview: trainer sees no Start button, trainee does. |
| APT-7 | Edit an appointment and change only the notes (its time is in the past) | Saves without the "already passed" error. |
| APT-8 **[FIX]** | Edit an appointment whose plan was archived | The plan title is kept, not blanked. |
| APT-9 | Mark completed (past appointments only) → Add notes → Save | "Completed" badge plus the review notes. Only the trainer can edit them. |
| APT-10 | Cancel → confirm | "Cancelled" badge. The trainee is notified (see APT-T4). |
| APT-11 | No accepted trainees | The sheet reads "No accepted trainees yet." |
| APT-12 | Appointment on the last day of the visible month or week | Still shows. |

## 8. Trainee-side popups and notifications

| ID | Steps | Expected |
|---|---|---|
| POP-1 | A assigns a plan while T has the app open | The "New plan from your coach" popup appears within a few seconds (realtime), or within 30 s or on refocus as a fallback. |
| POP-2 | Single-day plan → Start workout | The logger opens with the plan title, the exercises, and each set's rest. |
| POP-3 **[FIX]** | Plan prescribes 135 lb × 8 sets; T's unit is kg | Logger shows **8 sets** (previously capped at 6) with a planned weight of **61.2 kg** (previously dropped). Same from My Coach and from the appointment plan chip. |
| POP-4 | Multi-day plan → View plan | Goes to My Coach. Each day has its own Start button, and the title is "Plan — Day". |
| POP-5 | Later / ✕ | The popup does not return on this device. The plan stays in My Coach. |
| POP-6 | Workout finished from a plan | The coach's plan card shows "Done 1× · last today". |
| APT-T1 | A schedules an appointment for later today | T gets "New appointment from A" with the date, time range, notes and plan chip. View in calendar opens `/calendar`. |
| APT-T2 **[FIX]** | A creates an appointment whose time is already past (via edit or DB) | **No** "new appointment" popup for the past session. |
| APT-T3 **[FIX]** | T dismissed APT-T1, then A moves it to tomorrow | T gets "Updated by A" with the new time. |
| APT-T4 **[FIX]** | A cancels an appointment T had seen | T gets "Cancelled by A" with a red, struck-through title. |
| APT-T5 | A cancels an appointment T never saw | No popup. The Notifications card shows "Cancelled by A". |
| BAN-1 | Next appointment 3 days out | Home banner: "Wed, Oct 7 · 10:00 AM" plus the title and "with A". |
| BAN-2 | Within the reminder lead time (default 10 min) | "Meet A in N min". It counts down and disappears about 1 min after the start time. |
| BAN-3 | ✎ → choose 30 min before | Saved per device. The banner turns urgent 30 min before the start. |
| NOT-1 | Notifications card | Up to 6 items from the last 30 days, newest first, with the correct icon and color. The unread count matches the dots. Tapping marks an item read and navigates. |

## 9. Permissions (run against the deployed database)

Use the browser console on a signed-in session. `supabase` is the app client, or create one with the anon key and the user's session. Each case must fail or have no effect.

| ID | As | Attempt | Expected |
|---|---|---|---|
| SEC-1 **[FIX]** | Outsider X | `insert coach_links {trainer_id: X, trainee_id: <T id>, status:'accepted', shared_scopes:{workouts:true,food:true}}` | Row is forced to `pending`, with `trainee_id` null and empty scopes. X still cannot read T's workouts. **This was the critical hole.** |
| SEC-2 **[FIX]** | Outsider X | `update` X's own pending link to `status:'accepted', trainee_id:<T id>` | Error "Only the trainee can change this". |
| SEC-3 **[FIX]** | Coach A | `update coach_links set shared_scopes = {all true}` on T's link | Error "Only the trainee can change what is shared". |
| SEC-4 **[FIX]** | Coach A | Accept own outgoing invite (`status:'accepted', trainee_id: A`) | Blocked (trigger plus `coach_links_not_self` check). |
| SEC-5 **[FIX]** | Outsider X | `insert assigned_plans {trainer_id: X, trainee_id: <T id>}` | RLS violation. No popup spam for T. |
| SEC-6 **[FIX]** | Outsider X | `insert trainer_appointments` for T | RLS violation. |
| SEC-7 **[FIX]** | Coach A | Attach Coach B's plan id to an appointment | RLS violation. |
| SEC-8 **[FIX]** | Trainee T | `select * from coach_links` / `coach_private_notes` | The link row has no `coach_notes` column, and the notes table returns 0 rows. |
| SEC-9 **[FIX]** | Coach A, T not sharing body weight | `select body_weight from profiles where id = <T id>` | 0 rows. Only `coach_trainee_identity()` returns name and sex. |
| SEC-10 | Trainee T | `update coach_links set trainer_name = 'x'` | Error "Only the coach can change this". |
| SEC-11 | Coach A after T disconnects | Read T's workouts, assign a plan, log a session | All denied or empty. |

## 10. Coach plan "Today" card and easy Assign

| ID | Steps | Expected |
|---|---|---|
| TDY-1 | Trainee with no active plan opens Home | No "From your coach" card. |
| TDY-2 | Coach assigns a Push/Pull/Legs plan → trainee opens Home | Card at the top: "From <coach> · Push / Pull / Legs", pills Push ● / Pull / Legs, "Today: Push", first 4 exercises with "3 × 10 @ … lb", Start Push. |
| TDY-3 | Trainee taps Start Push, logs, finishes | Home card: "Push done today ✓ · Next: Pull"; Push pill ticked; button reads "Train again". |
| TDY-4 | Next day, Start | Starts Pull (rotation). After Legs, it wraps to Push. |
| TDY-5 | Other day → pick Legs | Logger opens with the Legs exercises; afterwards the next day is Push. |
| TDY-6 | Two active plans | "Switch" shows both; picking one shows it on the card; starting it keeps it current on the next visit. |
| TDY-7 | Single-day plan | No pills; "Done N× this week" after sessions. |
| TDY-8 | Coach views the trainee after TDY-3 | The plan card says "3/3 exercises done · Push", with Pull/Legs not marked Missed. |
| TDY-9 | Coach logs a session for the trainee from the Pull day | The trainee's card counts Pull as done. |
| ASG-1 | Coach taps Assign | The starting-point screen shows: Based on their recent training / Full body · Upper/Lower · Push/Pull/Legs / From my templates / Blank. |
| ASG-2 | Tap Push / Pull / Legs → Preview & send → Send | Sent with no typing; the trainee gets the popup and the card. Weights prefill from the trainee's history where known. |
| ASG-3 | Trainee with no sessions in 14 days | "Based on their recent training" is disabled with "No sessions in the last 2 weeks". |
| ASG-4 | Day chips: tap 4×12 on Push | Every Push exercise becomes 4 × 12; the chip highlights. |
| ASG-5 | Tap a row | It expands to Sets/Reps/Weight/Rest tiles; "+ Add note" reveals the note field; move/remove work within the day. |
| ASG-6 | ⋯ → Save as template, then a new Assign → From my templates | The template appears and loads. |
| ASG-7 | Preview shows a message; Send | The trainee's card and popup show the message. |
| ASG-8 | Edit an existing plan | Opens straight into the builder (no starting points); the message is prefilled; Save changes works and keeps the message. |
| ASG-9 | Rename two days to the same name → Preview & send | Error: "Two days have the same name — rename one." |
| ASG-10 | Close with exercises added | Confirm "Discard this plan?". On the starting screen it closes freely. |
| DB-1 | Run `supabase/tests/plan_day_check.sql` | 3 lines, no BAD. |

## 11. Today's session card (trainee Home)

| ID | Steps | Expected |
|---|---|---|
| TS-1 | Trainee with a coach plan taps Start on the "From your coach" card | Stays on Home; the coach card is replaced by "Today's session" with the day's exercises, "0 of N done", the first row marked Up next. |
| TS-2 | Tap ✓ on the first exercise | Every set ticked at the prescribed numbers; the row dims and strikes through; progress bar and "1 of N done" update; Up next moves down. |
| TS-3 | Tap ✓ again | Undone; numbers kept. |
| TS-4 | Tap a row → change set 2 to 140 lb × 8, tick it | Summary shows the differing sets ("135×10 · 140×8 · 135×10"), "1/3 sets". |
| TS-5 | + Set / × on a set | Adds a copy of the last set / removes it (can't remove the last one). |
| TS-6 | Add exercise → pick two | Both appear at the bottom, prefilled from the trainee's last session where they have one. |
| TS-7 | ⋯ → Open full logger | The logger shows the same exercises and ticks. Tick another set there, go back to Home → the card shows it. |
| TS-8 | Finish session (after ticking some) | The logger opens straight onto the finish screen; saving shows the celebration; back on Home the card is gone, and the coach card shows that day done and the next day suggested. |
| TS-9 | Finish with nothing ticked | Button disabled. |
| TS-10 | ⋯ → Discard session → confirm | Card disappears; nothing saved; the coach card is back. |
| TS-11 | Start a day while a session with ticked sets exists | Confirm "Replace your in-progress workout?"; Cancel keeps the old one. |
| TS-12 | Start a session, fully close the app, reopen | The card is still there with its ticks (localStorage). |
| TS-13 | My Coach → Start a day | Goes to Home with that day as Today's session. |
| TS-14 | Start a normal workout in /log, add an exercise, go to Home | The card shows it (Resume via Open full logger). |

## 12. Coach session card (trainee Overview)

| ID | Steps | Expected |
|---|---|---|
| CS-1 | Coach opens a sharing trainee with an active plan | Top of Overview: "Next for <name>", day strip ticked from their logged sessions, next day's exercises, Start <day>. |
| CS-2 | Tap Start <day> | Card becomes "Session with <name>" with that day's exercises, 0 of N done, Up next. |
| CS-3 | ✓ an exercise / tap a row and change a set / + Set | Same behaviour as the trainee card (TS-2…TS-5). |
| CS-4 | + Add exercise → pick two | Added, prefilled from the **trainee's** last session; the picker's Recent tab lists the trainee's exercises. |
| CS-5 | Leave the page and come back | The session is still running with its ticks. |
| CS-6 | ⋯ → Open full logger | Full-screen coach logger shows the same session; Back returns to the card with any changes. |
| CS-7 | Finish → Save session | Toast "Saved to <name>'s log"; the card returns to "Next for <name>" with that day ticked and the next day suggested; Recent sessions shows it. |
| CS-8 | Trainee with no plan | Card reads "Train with <name>" + Start session → start popup; picking starts in the card (not the full logger). |
| CS-9 | "Repeat last session, another plan, or start blank" | Popup; Start blank → empty card with "No exercises yet"; Add exercise works. |
| CS-10 | ⋯ → Discard → confirm | Card returns to idle; nothing saved. |
| CS-11 | Trainee stops sharing Workouts | No card. |

## Known gaps (not fixed, worth deciding on)

- **Email enumeration.** `email_is_registered()` lets any signed-in user check whether an email has an account. It returns a boolean only, but it is still enumeration. One option is to rate-limit it or restrict it to trainers.
- **Coach PR overwrite.** The `coach_update_prs` policy lets a sharing coach overwrite a trainee's PR rows directly through the API, not only through the logging RPC.
- **Unchecked plan link.** `save_workout_with_sets` accepts any `p_source_plan_id`, so a workout can be linked to a plan the user doesn't own. The impact is low, because only that plan's trainer could see it, and only if the trainee shares workouts.
- **Past coach-logged sessions.** Sessions logged by a coach before this fix are stored as kg even though the coach entered lb. They can't be told apart from real kg entries automatically, so review them by hand if a trainee reports wrong weights.
- **Popup "seen" state is per device** (localStorage). A plan dismissed on a phone pops up again on desktop.
- **No automated tests.** `npm test` is a stub. The pure helpers `groupByDay`, the adherence day-matcher and `pendingAppointmentPopups` are good first candidates for unit tests.

## Rollout

1. Apply the migration. It drops `coach_links.coach_notes` (after copying it to `coach_private_notes`) and the `coach_view_profile` policy.
2. Deploy the client in the same window. A client still running the old code can't save coach notes (the column is gone), and shows trainee sex as the default until it updates.
3. Run sections 9 (SEC) and 1–2 first, then the rest.
