# Glucose Result Release Advisor

A laboratory-side expert system written in Prolog, running in the browser
through [Tau Prolog](http://tau-prolog.org/).

**CM 3321 — Logic Programming and Artificial Cognitive Systems**
Prakasan R. — 224152U, University of Moratuwa

---

> **University coursework. Not for clinical use.**
> The knowledge base is a draft. Every threshold and every fault rule in
> `kb.pl` is my own reading of textbooks and papers, and none of it has been
> confirmed by the domain expert yet.

---

## The question it answers

A fasting glucose or HbA1c result has come off the analyser and something about
it is doubtful. The laboratory has to decide what to do with it:

**Release it? Re-run the same tube? Or bleed the patient again?**

That last distinction is the whole system. A second needle costs the patient
something, so it should only happen when the blood in the tube is genuinely
unusable.

## The idea it turns on

Every fault belongs to a **family**, and the family decides whether the patient
is bled again:

| Family | Examples | What it means for the tube |
| --- | --- | --- |
| **machine** | QC out of range, expired reagent lot, calibration overdue, probe clot, carryover, analyser not cleaned | The blood is innocent — **re-run the same sample** |
| **sample** | haemolysed, clotted, lipaemic, wrong tube, sat too long | The specimen cannot give a sound result — **fresh blood** |
| **collection** | not fasting, drawn from the drip arm | **Fresh blood**, and the patient has to be told something |
| **identity** | label mismatch, transcription doubt | Depends — a label mismatch is urgent, a typing doubt needs no blood at all |

Two demonstrations of the same number, 61 mg/dL:

- **sat 4 hours in a plain tube** → *Take a fresh sample.* The cells ate the
  glucose. Re-running the tube would only repeat the error.
- **QC out of range** → *Re-run the same sample.* The analyser was at fault, so
  the patient does not need to be bled again.

## What it does not do

It does not interpret what a result means for a patient and it does not name a
disease. It decides whether a number is fit to leave the laboratory. Everything
past that point is the clinician's work — and the expert this knowledge came
from is a Medical Laboratory Technologist, not a doctor. `boundary/1` in the
knowledge base states this, and the page prints it.

---

## Running it

**The simple way.** Double-click `index.html`. It opens in your browser and
works immediately — no install, no internet, nothing sent anywhere.

**The better way, while you are editing the rules.** Double-click `run.bat`.
That serves the folder on `http://localhost:8000/` and opens it, which lets the
page load `kb.pl` live — so every change to the knowledge base shows up on
refresh.

Either way the reasoning is identical. The footer of the page tells you which
of the two it is using.

---

## Editing the knowledge base

`kb.pl` is the knowledge base. It is ordinary Prolog and it is the only file
you need to touch to change what the system knows.

If you are using `run.bat`, save `kb.pl` and refresh the page — that is all.

If you are opening `index.html` directly, the browser refuses to read `kb.pl`
off the disk for security reasons, so `index.html` carries a copy of it inside
a `<script type="text/prolog">` block. After editing `kb.pl`, double-click
`build.bat` to refresh that copy.

---

## Files

| File | What it is |
| --- | --- |
| `kb.pl` | **The knowledge base.** Facts, rules, and the whole of what the system knows. |
| `index.template.html` | The page, with a placeholder where the knowledge base goes. |
| `index.html` | Generated from the two files above by `build.py`. This is what you open. |
| `app.js` | Interface only. Collects the form, hands it to Tau Prolog, displays answers. Makes no decisions. |
| `style.css` | Appearance. No web fonts, so the page works offline. |
| `build.py` / `build.bat` | Copies `kb.pl` into `index.html`. |
| `run.bat` | Serves the folder and opens the page. |
| `verify_cases.js` | Runs the worked cases from the fact sheet straight through `kb.pl` under Node, so the documentation reports what the program does rather than what I hope it does. |
| `lib/tau-prolog.js` | Tau Prolog, core and lists modules, vendored so no internet is needed. BSD-3-Clause — licence in the same folder. |

---

## How the knowledge is organised

**Case facts** — what is true of one run. Built from the form each time you
press the button, so nothing carries over between reports.

```prolog
value(s, fbs, 61).
tube(s, fbs, plain).
delay_hours(s, 4).
qc_status(s, fbs, out_of_range).
```

**Domain facts** — what is true in general. The fault-to-family table, what
each fault does to which test, the plausibility limits, the priority order of
the actions.

```prolog
fault_family(qc_out,     machine).
fault_family(haemolysed, sample).
```

**Rules** — how the two are combined. The one worth reading is this pair:

```prolog
specimen_compromised(S) :- fault(S, sample, _).
specimen_compromised(S) :- fault(S, collection, _).
specimen_compromised(S) :- fault(S, identity, label_mismatch).

specimen_intact(S) :- \+ specimen_compromised(S).
```

Negation as failure, three lines, and it is the whole re-run-versus-recollect
decision. `rerun_same_sample` is only ever possible when `specimen_intact/1`
holds.

When more than one action is possible, `decision/3` takes the one with the
lowest `action_rank`, and proves it is the lowest rather than relying on clause
order:

```prolog
decision(S, Action, Why) :-
    possible_action(S, Action, Why),
    action_rank(Action, R),
    \+ ( possible_action(S, Other, _), action_rank(Other, R2), R2 < R ).
```

A machine fault alongside a compromised specimen does not disappear — it comes
back through `also_fix/2` as *"fix this before running the new sample"*.

### The consistency check

Finding a fault and *explaining the result* are two different questions, and
the direction table answers the second one:

```prolog
does_not_account_for(S, Test, Cause, Why) :-
    fault(S, _, Cause),
    abnormal(S, Test, Seen),
    fault_effect(Cause, Test, Pushes, _),
    opposite(Pushes, Seen),
    ...
```

A delay lowers glucose. If the sugar is **low**, the delay is a candidate. If
the sugar is **350**, the delay cannot have caused that — so the high is
probably the patient's own and should not be written off as a sample problem.
`unaccounted/3` says so explicitly.

There are three outcomes, not two, and the third one matters: when the only
fault has an *unclear* effect on that test — a failed QC, a haemolysed HbA1c —
`direction_unknown/4` fires instead, and the honest answer is that the number
cannot be judged either way.

**This never changes the action.** A delayed sample still needs fresh blood
whichever way the result went. The consistency check decides only what the
report says about the number, never what the laboratory does about the tube.

The system deliberately does **not** infer the fault from the value. A fasting
sugar of 240 could mean the patient did not fast, or it could mean diabetes —
and a system that guessed the first would explain away the finding the test
exists to detect.

---

## Still to do

- [ ] Get the fault-to-family table corrected by the expert — that table is the
      system, and everything downstream reads it
- [ ] Confirm the priority order when two faults coexist
- [ ] Add the faults the expert names that are not here yet
- [ ] Confirm the plausibility and delta limits against the lab's own
- [ ] Get the expert's dated written confirmation

## Licence

Tau Prolog is BSD-3-Clause; its licence is in `lib/`. Everything else here is
coursework.
