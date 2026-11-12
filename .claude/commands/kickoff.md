---
description: Turn the problem statements and rubric into MUST_BUILDS.md and a scored track comparison
---

The user will paste the event's problem statements and rubric below.

$ARGUMENTS

Do this, in order:

1. **Read before deciding.** Read `idea.config.ts`, `MUST_BUILDS.md` and `README.md` so the
   recommendation fits what already exists.

2. **Score every track** in a table. One row per problem statement, columns:

   | Track | Rubric fit | Demo clarity | Crowdedness | Time risk | Partner-tool fit | Total |

   Score each 1-5 and say why in one line. Definitions, so the numbers mean something:
   - *Rubric fit* - how directly it hits the stated judging criteria
   - *Demo clarity* - can the value land in 30 seconds on video, with no setup
   - *Crowdedness* - how many teams will pick it (5 = few will)
   - *Time risk* - 5 means buildable in ten hours with the template as-is; 1 means it needs
     data collection, training, or an integration nobody has credentials for
   - *Partner-tool fit* - whether the partner tool is a natural part of the solution rather
     than bolted on

3. **Recommend one track** in two sentences, and name the runner-up with the single
   condition that would flip the choice.

4. **Fill `MUST_BUILDS.md`** for the recommended track: every must-build from the brief,
   mapped to the file that will satisfy it, status `todo`. Do not invent must-builds the
   brief does not state, and do not silently drop one that looks hard - mark it and say so.

5. **Mirror them into `idea.config.ts`** `mustBuilds`, so the UI can show progress.

6. **List what the template does not already cover** for this track: the 2-4 new tools, the
   seed data, and the one wow moment. Estimate each in minutes.

Stop there. Do not start building - the user picks the track.
