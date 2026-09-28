# Glucose Result Release Advisor

A laboratory-side expert system written in Prolog, running in the browser
through [Tau Prolog](http://tau-prolog.org/).

**CM 3321 — Logic Programming and Artificial Cognitive Systems**
Prakasan R. — 224152U, University of Moratuwa

---

> **University coursework. Not for clinical use.**
> Every threshold and every fault rule in `kb/` is a draft, taken from
> textbooks, papers and cited sources. None of it has been confirmed by the
> domain expert yet.

---

## The domain

**What the system specialises in.** The release of fasting blood glucose and
HbA1c results from a clinical laboratory. Not their clinical meaning — their
fitness to leave the bench.

**What problem it solves.** A result has come off the analyser and something
about it is doubtful. The technologist has to decide what to do with it, and
the most expensive part of that decision is whether the patient must be bled
again. A second needle costs the patient something, so it should only happen
when the blood already in the tube is genuinely unusable.

**What it decides.** One of eight actions, each with the reason that produced
it: release, release with a comment, re-run the same sample, take fresh blood,
take fresh blood and instruct the patient, take fresh blood urgently and tell
the senior, correct the entry, or call the senior.

## The idea it turns on

Every fault belongs to a **family**, and the family decides whether the patient
is bled again:

| Family | Examples | What it means for the tube |
| --- | --- | --- |
| **machine** | QC out of range, expired reagent lot, calibration overdue, probe clot, carryover, analyser not cleaned | The blood is innocent — **re-run the same sample** |
| **sample** | haemolysed, clotted, lipaemic, wrong tube, sat too long | The specimen cannot give a sound result — **fresh blood** |
| **collection** | not fasting, drawn from the drip arm | **Fresh blood**, and the patient has to be told something |
| **identity** | label mismatch, transcription doubt | Depends — a label mismatch is urgent, a typing doubt needs no blood at all |

Two consultations on the same number, 61 mg/dL:

- **sat 4 hours in a plain tube** → *Take a fresh sample.* The cells ate the
  glucose. Re-running the tube would only repeat the error.
- **QC out of range** → *Re-run the same sample.* The analyser was at fault, so
  the patient does not need to be bled again.

`fault_family/2` is the single source of that classification. Change one line
of it and the system reclassifies the fault, the specimen decision follows, and
the action changes — with no other edit anywhere. A test enforces that.

## How it reasons

**Forward chaining establishes the facts.** A recognise-act cycle looks for a
rule whose conditions hold and whose conclusion is not yet known, asserts it,
and repeats until a whole pass adds nothing. It chains two levels: a `fault/3`
derived at level one is the condition that fires `specimen_compromised/1` at
level two.

**Backward chaining proves the action.** Once the facts have settled,
`decision/3` is posed as a goal and Prolog works backwards through
`possible_action/3` to the derived faults.

That split is not arbitrary. The QC log, the reagent expiry and the calibration
date are already true before anyone looks at a result, so deriving them forward
is the honest model. *"What should I do with this?"* is a question someone asks,
so proving it backward is equally honest.

**The consultation asks one question at a time** and stops as soon as it can.
Each question carries the rank of the best action it could establish, so when a
fault is derived at rank R, everything still unasked could only produce a
worse-ranked action. A label mismatch settles the case after **one question out
of twelve**, and the system says so and why.

It will not stop on ignorance. An action whose rule rests on the *absence* of a
fault — `correct_entry` requires no sample, collection or machine fault — is
only trusted once every question that could establish one has been asked.
Negation as failure over an incomplete fact base is ignorance, not absence.

## What it does not do

It does not interpret what a result means for a patient and it does not name a
disease. That is the clinician's work, and the expert this knowledge came from
is a Medical Laboratory Technologist, not a doctor. `boundary/1` states this and
the page prints it on every result.

It also does not infer the fault from the value. A fasting glucose of 240 could
mean the patient did not fast, or it could mean diabetes — and a system that
guessed the first would explain away the finding the test exists to detect.

---

# User manual

## Required software and tools

A web browser. Nothing else. Chrome, Edge, Firefox and Safari have all been
used during development.

To run the test suite you also need **Node.js** (any version from 16 onward).
To rebuild `index.html` after editing the knowledge base you need **Python 3**,
or you can use `build.bat`.

## Installation and setup

None. Copy the folder anywhere and open it.

## Required dependencies

None to install. Tau Prolog 0.3.4 is vendored in `lib/` so the system runs with
no internet connection at all. Disconnect your network and it still works —
nothing is sent anywhere, no server, no storage.

## How to start the system

**The simple way.** Double-click `web/index.html`.

**The better way, while editing the rules.** Double-click `run.bat`. That serves
the folder on `http://localhost:8000/` and opens it, which lets the page load
`kb/*.pl` live, so every change to the knowledge base shows up on refresh.

Either way the reasoning is identical. The footer of the page tells you which
of the two it is using.

## How to interact with the interface

1. Enter a fasting blood sugar, an HbA1c, or both. *Add HbA1c or a previous
   result* opens the optional fields.
2. Press **Begin**.
3. Answer one question at a time. **Back** appears from the second question if
   you need to change an answer.
4. The system stops as soon as no remaining question could change the action.
   If some remaining questions still affect what must be *fixed*, it offers them
   rather than forcing them.
5. Open **Why** on the result for the full chain: the input, the facts derived,
   the rules applied, the reasoning, and the conclusion.

## Example input

| Field | Value |
| --- | --- |
| Fasting blood sugar | `310` |
| Does the label on the tube match the request form? | **No, it does not** |

## Example output

> **The laboratory should**
> ### Take a fresh sample NOW, and tell the senior
> the label does not match the request - this may be the wrong patient
>
> Fresh blood is needed. Re-running this tube would only repeat the error.
>
> **Why** →
> *Asked 1 of 12 questions. The other 11 were never put, because nothing still
> unasked could rank above "Take a fresh sample NOW, and tell the senior".*
>
> **Facts derived** — `fault(s, identity, label_mismatch)`, `specimen_compromised(s)`
> **Rules applied** — the two forward-chaining clauses, `decision/3`, and the
> `possible_action/3` clause that fired

## Any other configuration

None. If you edit anything in `kb/` and are opening `web/index.html` directly rather than
through `run.bat`, run `build.bat` afterwards — see below.

---

## Editing the knowledge base

The three files in `kb/` are ordinary Prolog and they are the only files you
need to touch to change what the system knows.

Using `run.bat`: save the file and refresh the page. That is all.

Opening `web/index.html` directly: the browser refuses to read the `.pl` files
off the disk for security reasons, so `index.html` carries a copy of them
inside a `<script type="text/prolog">` block. After editing anything in `kb/`,
double-click `build.bat` to refresh that copy.

## Files

```
Fasting blood sugar/
├── kb/                       the knowledge base
│   ├── facts.pl                what the system knows
│   ├── rules.pl                working out what is true of this run
│   └── decisions.pl            what to do, and how it was reached
├── web/                      the interface
│   ├── index.html              generated by build.py - this is what you open
│   ├── index.template.html     the page, with a placeholder for the knowledge base
│   ├── app.js                  collects answers, displays what Prolog returns
│   ├── style.css               appearance, no web fonts so it works offline
│   └── vendor/
│       └── tau-prolog.js       vendored, BSD-3-Clause, licence beside it
├── test/
│   └── cases.js              the test suite
├── build.py / build.bat      copies kb/*.pl into web/index.html
├── run.bat                   serves the project and opens the page
└── README.md
```

The knowledge base is consulted in one order, **`facts.pl` then `rules.pl`
then `decisions.pl`**, and nothing in an earlier file depends on a later one.
Three places load it — `build.py`, `web/app.js` and `test/cases.js` — and a
test checks that all three lists agree, because if they drifted the page and
the tests would be reasoning over different programs.

---

## How the knowledge is organised

**72 rules and 205 facts**, in sixteen numbered sections across three files.

**Case facts** — what is true of one run. Built from the answers each time, so
nothing carries over between consultations.

```prolog
value(s, fbs, 61).
tube(s, fbs, plain).
delay_hours(s, 4).
qc_status(s, fbs, out_of_range).
```

**Domain facts** — what is true in general. The fault-to-family table, what
each fault does to which test, the plausibility limits, the priority order of
the actions, the questions and their options.

```prolog
fault_family(qc_out,     machine).
fault_family(haemolysed, sample).
```

**Rules** — how the two are combined.

### The rules worth reading

**The forward-chaining cycle.** Conditions say only what must be true; the
family is looked up, never named in the condition.

```prolog
fires(fault(S, Fam, Cause)) :-
    fault_condition(S, Cause),
    fault_family(Cause, Fam),
    \+ fault(S, Fam, Cause).

fires(specimen_compromised(S)) :-
    fault(S, Fam, Cause),
    compromises_specimen(Fam, Cause),
    \+ specimen_compromised(S).

forward_chain :-
    fires(New),
    !,
    assertz(New),
    forward_chain.
forward_chain.                    % quiescence: nothing left to conclude
```

**The action is the lowest-ranked one possible**, and the rule proves it rather
than relying on clause order:

```prolog
decision(S, Action, Why) :-
    possible_action(S, Action, Why),
    action_rank(Action, R),
    \+ ( possible_action(S, Other, _), action_rank(Other, R2), R2 < R ).
```

**Stopping is only allowed on evidence, never on ignorance:**

```prolog
settled(S, LowestUnasked) :-
    decision(S, Action, _),
    action_rank(Action, R),
    R =< LowestUnasked,
    \+ ( requires_absence_of(Action, Family),
         \+ family_explored(Family, LowestUnasked) ).
```

**Finding a fault and explaining the result are different questions.** A delay
lowers glucose, so it cannot account for a *high* result — and the system says
so, rather than letting a real abnormality be written off as a sample problem.
There are four outcomes, not two:

| | When |
| --- | --- |
| **Consistent** | The fault pushes the result the way it actually went |
| **Does not fit** | The fault pushes the opposite way, so it is not the cause |
| **Cannot say** | The fault affects this test in an unpredictable direction |
| **Not recorded** | Nothing records what this fault does to this test — a gap, not a finding |

That last row matters. Silence in `fault_effect/4` is a gap in the knowledge
base, not evidence of no effect, and treating it as evidence produced false
reassurance about specimens that were being thrown away.

**A machine fault that loses is not forgotten.** If the specimen has to be
recollected anyway, `also_fix/2` brings the analyser problem back as a separate
line, so the fresh tube does not meet the same broken machine.

**And a re-run never repeats the fault that caused it.** A machine fault leaves
the blood in the tube innocent, so the action is a re-run rather than a fresh
draw. But re-running on the same expired lot, the same overdue calibration or
the same dirty probe reproduces the error exactly. `fix_before_rerun/3` is the
mirror of `also_fix/2` for that case: it reads `fix_first/2` and names what has
to be put right first. Every machine-family cause must have an entry there, and
a test fails if one is ever added without it.

---

## Testing

```
node test/cases.js
```

**66 tests in three layers.**

**38 knowledge-base cases.** Facts in, expected action out. Each one also
checks *which rule fired*, because a right answer from the wrong rule is a bug
waiting to surface.

**16 structural invariants.** These test properties of the knowledge base
rather than single cases:

- `fault_family/2` is the only thing that assigns a family, and editing one
  line of it reclassifies a fault all the way through to the decision
- every cause in the table has evidence that can derive it
- every declared limit is actually consulted by some rule
- no predicate defined in `kb/` is unreachable
- every question the knowledge base asks can be answered by the interface
- silence in `fault_effect/4` never becomes "probably real"
- a broken rule is reported, never answered as "release"
- every machine fault has a corrective action to perform before the re-run
- a re-run is never ordered without naming what to put right first
- the two corrective paths, `also_fix/2` and `fix_before_rerun/3`, never both
  fire and never both stay silent

**12 consultations.** These drive the whole thing end to end — the real
question order, the real stopping rule, and the real answer-to-fact mapping
lifted out of `web/app.js` rather than restated, because a copy would drift. Several
assert the exact list of questions asked, in order.

The suite exits non-zero if anything fails.

---

## Still to do

- [ ] Get the fault-to-family table corrected by the expert — that table is the
      system, and everything downstream reads it
- [ ] Fill `method_effect/5`: nothing is recorded yet for what in-vitro
      haemolysis does to an HbA1c on any method, and the system says so
- [ ] Confirm the priority order when two faults coexist
- [ ] Confirm the plausibility, critical and delta limits against the lab's own
- [ ] Add the faults the expert names that are not here yet
- [ ] Get the expert's dated written confirmation

## Sources

Assay interference and the method-dependence of HbA1c:
[NGSP — HbA1c Assay Interferences](https://ngsp.org/interf.asp) and
[NGSP — Factors that Interfere with HbA1c Test Results](https://ngsp.org/factors.asp).

## Licence

Tau Prolog is BSD-3-Clause; its licence is in `web/vendor/`. Everything else here is
coursework.
