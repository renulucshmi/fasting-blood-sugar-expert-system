% ============================================================================
%  kb.pl  -  Glucose Result Release Advisor : knowledge base
%
%  CM 3321 Logic Programming and Artificial Cognitive Systems
%  Prakasan R.  -  224152U
%
%  WHAT IT DECIDES
%    Is this glucose result fit to release? If not, what does the laboratory
%    do about it - re-run the same sample, take fresh blood from the patient,
%    correct the entry, or call the senior?
%
%  THE IDEA THE WHOLE SYSTEM TURNS ON
%    Which FAMILY the fault belongs to decides whether the patient has to be
%    bled again. A machine fault leaves the blood innocent - re-run it. A
%    sample fault does not - recollect. Getting that distinction right saves
%    the patient a second needle.
%
%  SCOPE
%    Fasting blood sugar and HbA1c only. The system never interprets a result
%    clinically and never names a disease. It decides whether the number is
%    fit to leave the laboratory.
%
%  STATUS
%    DRAFT. Every threshold and every fault rule below is my own reading of
%    textbooks and papers. None of it is confirmed by the domain expert yet.
% ============================================================================


% ----------------------------------------------------------------------------
%  1.  CASE FACTS  -  what is true of this one run
%      Appended by the interface each time, cleared between reports.
% ----------------------------------------------------------------------------

:- dynamic(value/3).              % value(s, fbs, 61).
:- dynamic(previous_value/3).     % previous_value(s, fbs, 95).
:- dynamic(qc_status/3).          % qc_status(s, fbs, out_of_range).
:- dynamic(reagent_lot/3).        % reagent_lot(s, fbs, expired).
:- dynamic(calibration/3).        % calibration(s, fbs, overdue).
:- dynamic(analyser_flag/2).      % analyser_flag(s, probe_clot).
:- dynamic(instrument_clean/2).   % instrument_clean(s, no).
:- dynamic(sample_state/2).       % sample_state(s, haemolysed).
:- dynamic(tube/3).               % tube(s, fbs, plain).
:- dynamic(delay_hours/2).        % delay_hours(s, 4).
:- dynamic(fasting_hours/2).      % fasting_hours(s, 3).
:- dynamic(drip_arm/1).
:- dynamic(label_mismatch/1).
:- dynamic(transcription_doubt/1).
:- dynamic(hba1c_method/2).       % hba1c_method(s, boronate).


% ----------------------------------------------------------------------------
%  2.  DOMAIN FACTS  -  which family each fault belongs to
%      This table is the heart of the system. Everything downstream reads it.
% ----------------------------------------------------------------------------

fault_family(qc_out,             machine).
fault_family(reagent_expired,    machine).
fault_family(calibration_overdue, machine).
fault_family(probe_clot,         machine).
fault_family(carryover,          machine).
fault_family(not_cleaned,        machine).

fault_family(haemolysed,         sample).
fault_family(clotted,            sample).
fault_family(lipaemic,           sample).
fault_family(wrong_tube,         sample).
fault_family(delayed,            sample).

fault_family(not_fasting,        collection).
fault_family(drip_arm,           collection).

fault_family(label_mismatch,     identity).
fault_family(transcription_doubt, identity).


% ----------------------------------------------------------------------------
%  3.  DOMAIN FACTS  -  what each fault does to which test
%      fault_effect(Fault, Test, Direction, Explanation)
% ----------------------------------------------------------------------------

fault_effect(delayed, fbs, low,
    'the cells go on eating the glucose in the tube, about 5 to 7 per cent an hour').
fault_effect(wrong_tube, fbs, low,
    'without fluoride the cells consume the glucose faster still').
fault_effect(not_fasting, fbs, high,
    'the patient had eaten, so this is not a fasting value').
fault_effect(drip_arm, fbs, high,
    'a sample drawn near a running drip carries the drip fluid with it').
fault_effect(lipaemic, fbs, unclear,
    'turbidity interferes with the reading at 340 nm').
fault_effect(qc_out, fbs, unclear,
    'the run was not in control, so the direction of the error is unknown').
fault_effect(qc_out, hba1c, unclear,
    'the run was not in control, so the direction of the error is unknown').
fault_effect(reagent_expired, fbs, unclear,
    'an expired lot drifts, usually in one direction, but not predictably').
fault_effect(calibration_overdue, fbs, unclear,
    'an uncalibrated run cannot be trusted in either direction').
fault_effect(carryover, fbs, high,
    'a very high sample just before this one can carry into the probe').
fault_effect(not_cleaned, fbs, unclear,
    'residue in the path contaminates the reading').


% ----------------------------------------------------------------------------
%  4.  DOMAIN FACTS  -  the actions, and what each one means
% ----------------------------------------------------------------------------

action_label(release,            'Release the result').
action_label(release_comment,    'Release, but add a comment').
action_label(rerun_same_sample,  'Re-run the same sample').
action_label(recollect,          'Take a fresh sample').
action_label(recollect_teach,    'Take a fresh sample, and tell the patient what to do').
action_label(recollect_urgent,   'Take a fresh sample NOW, and tell the senior').
action_label(correct_entry,      'Correct the entry - no new blood needed').
action_label(escalate,           'Call the senior').

% Priority. Lower number wins when more than one action is possible.
action_rank(recollect_urgent,  1).
action_rank(correct_entry,     2).
action_rank(recollect_teach,   3).
action_rank(recollect,         4).
action_rank(rerun_same_sample, 5).
action_rank(escalate,          6).
action_rank(release_comment,   7).
action_rank(release,           8).

% What the patient is told when the collection was at fault.
instruction(not_fasting,
    'fast for 8 to 10 hours, water only, before the next draw').
instruction(drip_arm,
    'draw from the opposite arm, away from any running drip').

% Plain-English names for the faults.
fault_label(qc_out,              'quality control out of range').
fault_label(reagent_expired,     'reagent lot past its expiry').
fault_label(calibration_overdue, 'calibration overdue').
fault_label(probe_clot,          'probe clot flagged by the analyser').
fault_label(carryover,           'carryover from the previous sample').
fault_label(not_cleaned,         'analyser not cleaned').
fault_label(haemolysed,          'sample haemolysed').
fault_label(clotted,             'sample clotted').
fault_label(lipaemic,            'sample lipaemic').
fault_label(wrong_tube,          'the wrong tube was used').
fault_label(delayed,             'sample sat too long before separation').
fault_label(not_fasting,         'patient was not fasting').
fault_label(drip_arm,            'drawn from the drip arm').
fault_label(label_mismatch,      'label does not match the request').
fault_label(transcription_doubt, 'entry may have been typed wrongly').

family_label(machine,    'Machine or reagent').
family_label(sample,     'The specimen').
family_label(collection, 'How it was collected').
family_label(identity,   'Identification or entry').


% ----------------------------------------------------------------------------
%  5.  DOMAIN FACTS  -  limits used for the plausibility check
% ----------------------------------------------------------------------------

max_delay_hours(fbs, 1).
min_fasting_hours(8).
proper_tube(fbs, fluoride).
proper_tube(hba1c, edta).

survivable_low(fbs, 20).        % below this, doubt the number before the patient
survivable_high(fbs, 800).
impossible_low(hba1c, 3.0).
impossible_high(hba1c, 20.0).

critical_low(fbs, 50).
critical_high(fbs, 400).

delta_limit(fbs, 100).          % mg/dL change from the last result before we doubt it
delta_limit(hba1c, 2.0).


% ----------------------------------------------------------------------------
%  6.  RULES  -  the evidence for each fault
%      fault_condition(Sample, Cause)
%
%      These say ONLY what has to be true for a fault to exist. They say
%      nothing about which family it belongs to - that is fault_family/2's
%      job in section 2, and its job alone.
%
%      Keeping the family out of here is what makes section 2 the single
%      source of truth. Change fault_family(probe_clot, sample) up there and
%      the system reclassifies it, with no other edit anywhere. If the family
%      were named in the heads below, the table and the reasoning could drift
%      apart without anything noticing.
%
%      These are conditions, not faults. The forward-chaining cycle in
%      section 7 reads them, looks the family up, and asserts fault/3.
% ----------------------------------------------------------------------------

% --- the analyser and its reagents ---
fault_condition(S, qc_out) :-
    qc_status(S, _, out_of_range).
fault_condition(S, reagent_expired) :-
    reagent_lot(S, _, expired).
fault_condition(S, calibration_overdue) :-
    calibration(S, _, overdue).
fault_condition(S, probe_clot) :-
    analyser_flag(S, probe_clot).
fault_condition(S, carryover) :-
    analyser_flag(S, carryover).
fault_condition(S, not_cleaned) :-
    instrument_clean(S, no).

% --- the specimen itself ---
fault_condition(S, haemolysed) :-
    sample_state(S, haemolysed).
fault_condition(S, clotted) :-
    sample_state(S, clotted).
fault_condition(S, lipaemic) :-
    sample_state(S, lipaemic).
fault_condition(S, wrong_tube) :-
    value(S, Test, _),
    tube(S, Test, Used),
    proper_tube(Test, Proper),
    Used \== Proper.
fault_condition(S, delayed) :-
    value(S, fbs, _),
    delay_hours(S, D),
    max_delay_hours(fbs, M),
    D > M.

% --- how it was collected ---
fault_condition(S, not_fasting) :-
    value(S, fbs, _),
    fasting_hours(S, H),
    min_fasting_hours(Min),
    H < Min.
fault_condition(S, drip_arm) :-
    drip_arm(S).

% --- identification and entry ---
fault_condition(S, label_mismatch) :-
    label_mismatch(S).
fault_condition(S, transcription_doubt) :-
    transcription_doubt(S).


% ----------------------------------------------------------------------------
%  7.  FORWARD CHAINING  -  the recognise-act cycle
%
%  Everything above this point is a condition. Nothing is a fault until this
%  cycle says so.
%
%  The cycle looks for one rule whose conditions already hold and whose
%  conclusion is not yet in the fact base, asserts that conclusion, and starts
%  again. It stops when a whole pass adds nothing - quiescence. That is
%  forward chaining: data in, conclusions out, driven by the facts rather
%  than by a goal.
%
%  It chains two levels deep. A derived fault/3 is itself the condition that
%  fires specimen_compromised/1, so the second conclusion could not have been
%  reached without the first.
%
%  This is how a laboratory actually works. The QC log, the reagent expiry and
%  the calibration date are known before anyone looks at the result - so the
%  faults are established first, and only then does the system reason backward
%  from "what should we do?" through decision/3.
% ----------------------------------------------------------------------------

:- dynamic(fault/3).
:- dynamic(specimen_compromised/1).

% fires(Conclusion) - one rule that is ready to fire and has not fired yet.

% Level 1: a condition in section 6 holds, and this fault is not yet known.
% The family is LOOKED UP from fault_family/2 rather than read off the
% condition. That lookup is the only route from a cause to a family, which is
% what makes section 2 authoritative.
fires(fault(S, Fam, Cause)) :-
    fault_condition(S, Cause),
    fault_family(Cause, Fam),
    \+ fault(S, Fam, Cause).

% Level 2: a fault DERIVED at level 1 is the condition for this one.
fires(specimen_compromised(S)) :-
    fault(S, Fam, Cause),
    compromises_specimen(Fam, Cause),
    \+ specimen_compromised(S).

compromises_specimen(sample,     _).
compromises_specimen(collection, _).
compromises_specimen(identity,   label_mismatch).

% The cycle itself. Recurses while anything still fires; the second clause is
% quiescence - nothing left to conclude.
forward_chain :-
    fires(New),
    !,
    assertz(New),
    forward_chain.
forward_chain.

specimen_intact(S) :-
    \+ specimen_compromised(S).


% ----------------------------------------------------------------------------
%  8.  RULES  -  is the number itself believable?
% ----------------------------------------------------------------------------

% Outside what a living patient reaches - doubt the number, not the person.
implausible(S, Test, 'this value is outside what a patient survives - doubt the number first') :-
    value(S, Test, V),
    survivable_low(Test, L),
    V < L.
implausible(S, Test, 'this value is outside what a patient survives - doubt the number first') :-
    value(S, Test, V),
    survivable_high(Test, H),
    V > H.
% The assay's own reportable range, in both directions.
%
% Written over Test rather than hardcoded to hba1c, so a limit declared for a
% new test is checked the moment it is added. The old clause checked only the
% high end and named hba1c in its head, which left impossible_low/2 sitting in
% the knowledge base unread - an HbA1c of 1.5 was released as a real result.
implausible(S, Test, 'this value is below the range the assay can report') :-
    value(S, Test, V),
    impossible_low(Test, Min),
    V < Min.
implausible(S, Test, 'this value is above the range the assay can report') :-
    value(S, Test, V),
    impossible_high(Test, Max),
    V > Max.

% Delta check - too big a jump from the patient's own last result.
delta_fail(S, Test, Why) :-
    value(S, Test, V),
    previous_value(S, Test, P),
    delta_limit(Test, Limit),
    Diff is abs(V - P),
    Diff > Limit,
    Why = 'this is a very large change from the patient''s last result'.

plausible(S) :-
    \+ implausible(S, _, _),
    \+ delta_fail(S, _, _).

critical(S, Test, low) :-
    value(S, Test, V), critical_low(Test, T), V =< T.
critical(S, Test, high) :-
    value(S, Test, V), critical_high(Test, T), V >= T.


% ----------------------------------------------------------------------------
%  9.  RULES  -  the decision
%      Each carries its reason, which is what the explanation facility reports.
% ----------------------------------------------------------------------------

% 1. Identification first. Nothing else matters if this is the wrong patient.
possible_action(S, recollect_urgent, Why) :-
    fault(S, identity, label_mismatch),
    action_reason(recollect_urgent, Why).

% 2. A typing doubt needs no new blood at all.
possible_action(S, correct_entry, Why) :-
    action_reason(correct_entry, Why),
    fault(S, identity, transcription_doubt),
    \+ fault(S, sample, _),
    \+ fault(S, collection, _),
    \+ fault(S, machine, _).

% 3. Collection fault - fresh blood AND the patient has to be told something.
possible_action(S, recollect_teach, Why) :-
    fault(S, collection, Cause),
    instruction(Cause, _),
    action_reason(recollect_teach, Why).

% 4. Sample fault - fresh blood, nothing to teach the patient.
possible_action(S, recollect, Why) :-
    fault(S, sample, _),
    action_reason(recollect, Why).

% 5. Machine fault with the specimen intact - re-run, do not re-bleed.
possible_action(S, rerun_same_sample, Why) :-
    fault(S, machine, _),
    specimen_intact(S),
    action_reason(rerun_same_sample, Why).

% 6. Nothing found, but the number cannot be right.
possible_action(S, escalate, Why) :-
    \+ fault(S, _, _),
    implausible(S, _, Why).

% 7. Nothing found, plausible, but worth a note on the report.
possible_action(S, release_comment, Why) :-
    \+ fault(S, _, _),
    delta_fail(S, _, _),
    action_reason(release_comment, Why).

% 8. Clean.
possible_action(S, release, Why) :-
    \+ fault(S, _, _),
    plausible(S),
    action_reason(release, Why).


% decision/3 - the single action the laboratory should take.
% The lowest-ranked possible action wins; the rest are reported as well.
decision(S, Action, Why) :-
    possible_action(S, Action, Why),
    action_rank(Action, R),
    \+ ( possible_action(S, Other, _),
         action_rank(Other, R2),
         R2 < R ).


% also_fix/2 - a machine fault alongside a recollection still has to be fixed.
% Hands back the fault itself. The interface says what to do with it.
also_fix(S, Cause) :-
    fault(S, machine, Cause),
    specimen_compromised(S).


% ----------------------------------------------------------------------------
%  10.  RULES  -  does the fault actually ACCOUNT for what we are seeing?
%
%  A fault is a fact about the world. Whether it explains the abnormality in
%  front of you is a separate question, and the direction table answers it.
%
%  A delay lowers glucose. If the result is low, the delay is a candidate for
%  having caused it. If the result is HIGH, the delay cannot be what caused
%  that - so the high is probably the patient's own, and someone should look
%  at it rather than write it off as a sample problem.
%
%  IMPORTANT: none of this changes the action. A delayed sample still needs
%  fresh blood either way. This decides only what the report SAYS about the
%  number, never what the laboratory DOES about the tube.
% ----------------------------------------------------------------------------

reference_range(fbs,   70,  99).
reference_range(hba1c, 4.0, 5.6).

abnormal(S, Test, high) :-
    value(S, Test, V),
    reference_range(Test, _, Hi),
    V > Hi.
abnormal(S, Test, low) :-
    value(S, Test, V),
    reference_range(Test, Lo, _),
    V < Lo.

opposite(low,  high).
opposite(high, low).

% The fault pushes the result the same way it actually went, so it is a
% candidate for having caused the abnormality.
accounts_for(S, Test, Cause, Why) :-
    fault(S, _, Cause),
    abnormal(S, Test, Seen),
    fault_effect(Cause, Test, Seen, _),
    consistency_reason(fits, Seen, Why).

% The fault pushes the OPPOSITE way to how the result actually went. Whatever
% else is true, this fault is not the explanation for this abnormality.
does_not_account_for(S, Test, Cause, Why) :-
    fault(S, _, Cause),
    abnormal(S, Test, Seen),
    fault_effect(Cause, Test, Pushes, _),
    opposite(Pushes, Seen),
    consistency_reason(clashes, Seen, Why).

% A fault that touches this test, but in a direction nobody can predict. This
% is NOT the same as no fault at all, and it must not be reported as though it
% were - the honest answer here is that the number cannot be judged.
direction_unknown(S, Test, Cause, Why) :-
    fault(S, _, Cause),
    abnormal(S, Test, _),
    fault_effect(Cause, Test, unclear, _),
    consistency_reason(unsure, any, Why).

% A fault with NO fault_effect/4 entry for this test is a gap in the knowledge
% base, not a finding that it has no effect. Silence is not evidence.
%
% This matters because "probably real" is a positive claim about the patient.
% Making it from a specimen that is being thrown away, on the strength of a
% fault whose effect on this test was never written down, is exactly the kind
% of false reassurance the system exists to prevent.
%
% It also subsumes the label-mismatch case: nothing records what a mismatched
% label does to a glucose, because the question is meaningless - we do not
% know whose blood it is.
effect_unrecorded(S, Test, Cause) :-
    fault(S, _, Cause),
    value(S, Test, _),
    \+ fault_effect(Cause, Test, _, _).

% Say so, rather than saying nothing. A gap the system reports is a gap the
% domain expert can fill; a gap it hides is a wrong answer waiting to happen.
unrecorded_effect(S, Test, Cause, Why) :-
    effect_unrecorded(S, Test, Cause),
    abnormal(S, Test, _),
    consistency_reason(gap, any, Why).

% Abnormal, nothing found pushes it that way, nothing found is unpredictable,
% and nothing found has an unrecorded effect. Only then does the abnormality
% belong to the patient until something proves otherwise.
unaccounted(S, Test, Why) :-
    abnormal(S, Test, Seen),
    \+ accounts_for(S, Test, _, _),
    \+ direction_unknown(S, Test, _, _),
    \+ effect_unrecorded(S, Test, _),
    consistency_reason(real, Seen, Why).


% ----------------------------------------------------------------------------
%  11.  RULES  -  the standing boundary
% ----------------------------------------------------------------------------

boundary('This system decides whether a result is fit to leave the laboratory. It does not interpret what the result means for the patient - that is the clinician''s work.').


% ----------------------------------------------------------------------------
%  12.  THE CONSULTATION  -  what the system may ask, and when it may stop
%
%  The system does not show a form. It asks one question at a time, and it
%  asks as few as it can.
%
%  Each question carries the RANK of the best action it could establish -
%  the same ranking decision/3 uses. Questions are asked in rank order, so
%  the moment a fault is derived at rank R, every question still unasked
%  could only produce an action ranked worse than R, and none of them can
%  change the answer. settled/2 below is that argument, written as a rule.
%
%  This is why the ranking exists. It orders the actions, and ordering the
%  actions orders the questions.
% ----------------------------------------------------------------------------

% askable(Id, Rank, Kind, Question).   Kind is yn, choice or number.
askable(label,   1, yn,     'Does the label on the tube match the request form?').
askable(typed,   2, yn,     'Any doubt about what was typed into the system?').
askable(fasting, 3, number, 'How many hours had the patient fasted?').
askable(drip,    3, yn,     'Was the blood drawn from the arm with the drip?').
askable(look,    4, choice, 'How does the sample look?').
askable(tube_fbs,   4, choice, 'Which tube was the glucose drawn into?').
askable(tube_hba1c, 4, choice, 'Which tube was the HbA1c drawn into?').
askable(method,     4, choice, 'Which method measures HbA1c here?').
askable(delay,   4, number, 'How many hours before the plasma was separated?').
askable(qc,      5, yn,     'Did the quality control for this run pass?').
askable(lot,     5, yn,     'Is the reagent lot within its expiry date?').
askable(cal,     5, yn,     'Is the calibration current?').
askable(flag,    5, choice, 'Did the analyser raise a flag on this sample?').
askable(clean,   5, yn,     'Was the analyser cleaned as scheduled?').

% option(QuestionId, Value, Shown).   Order here is the order on screen.
option(label, yes, 'Yes, it matches').
option(label, no,  'No, it does not').
option(typed, no,  'No doubt').
option(typed, yes, 'Yes, there is doubt').
option(drip,  no,  'No').
option(drip,  yes, 'Yes').
option(look,  normal,     'Normal').
option(look,  haemolysed, 'Haemolysed').
option(look,  clotted,    'Clotted').
option(look,  lipaemic,   'Lipaemic').
option(tube_fbs,  fluoride, 'Fluoride oxalate').
option(tube_fbs,  edta,     'EDTA').
option(tube_fbs,  plain,    'Plain').
option(tube_fbs,  heparin,  'Heparin').
option(tube_hba1c, edta,     'EDTA').
option(tube_hba1c, fluoride, 'Fluoride oxalate').
option(tube_hba1c, plain,    'Plain').
option(tube_hba1c, heparin,  'Heparin').
option(method, hplc,        'Ion-exchange HPLC').
option(method, immunoassay, 'Immunoassay').
option(method, boronate,    'Boronate affinity').
option(method, enzymatic,   'Enzymatic').
option(method, unknown,     'Not recorded').
option(flag,  none,       'None').
option(flag,  probe_clot, 'Probe clot').
option(flag,  carryover,  'Carryover').
option(qc,    yes, 'Passed').
option(qc,    no,  'Out of range').
option(lot,   yes, 'Within expiry').
option(lot,   no,  'Expired').
option(cal,   yes, 'Current').
option(cal,   no,  'Overdue').
option(clean, yes, 'Yes').
option(clean, no,  'No').

% unit(QuestionId, Unit) - for the number questions.
unit(fasting, hours).
unit(delay,   hours).

% Which questions still matter once the decision is settled.
%
% A machine fault cannot change a recollection - the patient is bled again
% either way - but the analyser still has to be put right before the fresh
% sample is run. See also_fix/2.
%
% Derived from establishes/2 and fault_family/2 rather than from a hardcoded
% rank, so it follows the tables if the questions are ever reordered.
still_useful(Q) :-
    specimen_compromised(s),
    establishes(Q, Cause),
    fault_family(Cause, machine).

% The HbA1c method cannot change the action either. But without it no
% interference on an HbA1c can be judged at all, so it is worth asking rather
% than reporting it as missing after choosing not to ask.
still_useful(method) :-
    value(s, hba1c, _),
    fault(s, _, _).

% Which question can establish which fault. The consultation needs this to
% tell the difference between "I asked and found nothing" and "I never asked".
establishes(label,       label_mismatch).
establishes(typed,       transcription_doubt).
establishes(fasting,     not_fasting).
establishes(drip,        drip_arm).
establishes(look,        haemolysed).
establishes(look,        clotted).
establishes(look,        lipaemic).
establishes(tube_fbs,    wrong_tube).
establishes(tube_hba1c,  wrong_tube).
establishes(delay,       delayed).
establishes(qc,          qc_out).
establishes(lot,         reagent_expired).
establishes(cal,         calibration_overdue).
establishes(flag,        probe_clot).
establishes(flag,        carryover).
establishes(clean,       not_cleaned).

family(machine).
family(sample).
family(collection).
family(identity).

% A family is fully explored once every question that could establish a fault
% in it has been asked. The interface passes the rank of the next question it
% has NOT asked, so anything ranked below that has been answered.
family_explored(Family, LowestUnasked) :-
    family(Family),
    \+ ( fault_family(Cause, Family),
         establishes(Q, Cause),
         askable(Q, R, _, _),
         R >= LowestUnasked ).

% Which families an action's rule requires to be ABSENT. An action resting on
% one of these cannot be trusted while that family is still unexplored -
% negation as failure over an incomplete fact base is ignorance, not absence.
requires_absence_of(correct_entry,     sample).
requires_absence_of(correct_entry,     collection).
requires_absence_of(correct_entry,     machine).
requires_absence_of(rerun_same_sample, sample).
requires_absence_of(rerun_same_sample, collection).
requires_absence_of(escalate,        F) :- family(F).
requires_absence_of(release_comment, F) :- family(F).
requires_absence_of(release,         F) :- family(F).

% settled(S, LowestUnaskedRank) - it is safe to stop asking.
%
% Two conditions, and the second is the one that matters.
%
%   1. Nothing still unasked could outrank the action already established.
%   2. If that action rests on the ABSENCE of a fault, every family it needs
%      to be absent has actually been looked at.
%
% Without the second condition the system stops after two questions on a
% typing doubt and reports "correct the entry, no new blood needed" without
% ever looking at the specimen.
settled(S, LowestUnasked) :-
    decision(S, Action, _),
    action_rank(Action, R),
    R =< LowestUnasked,
    \+ ( requires_absence_of(Action, Family),
         \+ family_explored(Family, LowestUnasked) ).

% Why the consultation stopped where it did. The counting is the interface's
% business; the reason is the knowledge base's.
stopped_early(Why) :-
    decision(s, _, _),
    Why = 'nothing still unasked could rank above the action already established'.


% ----------------------------------------------------------------------------
%  13.  THE EXPLANATION CHAIN
%
%  User Input -> Facts -> Rules Applied -> Reasoning -> Final Conclusion.
%  The first four are already in the system; this section names the rule that
%  produced each action, so the chain can be shown complete rather than
%  jumping from facts straight to a conclusion.
% ----------------------------------------------------------------------------

producing_rule(recollect_urgent,
  'possible_action(S, recollect_urgent, _) :- fault(S, identity, label_mismatch).').
producing_rule(correct_entry,
  'possible_action(S, correct_entry, _) :- fault(S, identity, transcription_doubt), \\+ fault(S, sample, _), \\+ fault(S, collection, _), \\+ fault(S, machine, _).').
producing_rule(recollect_teach,
  'possible_action(S, recollect_teach, _) :- fault(S, collection, Cause), instruction(Cause, _).').
producing_rule(recollect,
  'possible_action(S, recollect, _) :- fault(S, sample, Cause).').
producing_rule(rerun_same_sample,
  'possible_action(S, rerun_same_sample, _) :- fault(S, machine, Cause), specimen_intact(S).').
producing_rule(escalate,
  'possible_action(S, escalate, _) :- \\+ fault(S, _, _), implausible(S, _, _).').
producing_rule(release_comment,
  'possible_action(S, release_comment, _) :- \\+ fault(S, _, _), delta_fail(S, _, _).').
producing_rule(release,
  'possible_action(S, release, _) :- \\+ fault(S, _, _), plausible(S).').

% The rule that fired to derive each fault, and the one that selected the action.
derivation_rule(fault,
  'fires(fault(S, Fam, Cause)) :- fault_condition(S, Cause), fault_family(Cause, Fam), \\+ fault(S, Fam, Cause).   [forward chaining]').
derivation_rule(specimen,
  'fires(specimen_compromised(S)) :- fault(S, Fam, Cause), compromises_specimen(Fam, Cause).   [forward chaining, level 2]').
derivation_rule(selection,
  'decision(S, Action, Why) :- possible_action(S, Action, Why), action_rank(Action, R), \\+ ( possible_action(S, Other, _), action_rank(Other, R2), R2 < R ).   [backward chaining]').


% ----------------------------------------------------------------------------
%  14.  FBS AND HbA1c ARE NOT THE SAME SPECIMEN
%
%  Glucose is drawn into fluoride oxalate; HbA1c into EDTA. They are always
%  two tubes, so they are two questions. Asking once and applying the answer
%  to both guarantees that one of them is recorded wrong.
%
%  The same separation governs which questions are worth asking at all. The
%  fasting window and the time to separation are glucose facts. If only an
%  HbA1c was requested, neither question has anything to bear on, so the
%  consultation does not ask them.
% ----------------------------------------------------------------------------

% A question that only matters when a particular test was requested.
test_specific(tube_fbs,   fbs).
test_specific(tube_hba1c, hba1c).
test_specific(method,     hba1c).
test_specific(fasting,    fbs).     % HbA1c needs no fast
test_specific(delay,      fbs).     % HbA1c is stable to a delay; glucose is not

% relevant(Question) - worth asking, given what was actually requested.
%
% No cut here. The interface calls relevant/1 with Q unbound to enumerate the
% whole list, and a cut would commit to the first question that happened to be
% test-specific and discard every question after it.
relevant(Q) :-
    askable(Q, _, _, _),
    \+ test_specific(Q, _).
relevant(Q) :-
    askable(Q, _, _, _),
    test_specific(Q, Test),
    value(s, Test, _).

% Plain names, so a reason can say which test and which tube.
test_label(fbs,   'the glucose').
test_label(hba1c, 'the HbA1c').

tube_label(fluoride, 'a fluoride oxalate tube').
tube_label(edta,     'an EDTA tube').
tube_label(plain,    'a plain tube').
tube_label(heparin,  'a heparin tube').

% Which test's tube was wrong, what was used, and what it needed.
wrong_tube_detail(S, Test, Used, Proper) :-
    value(S, Test, _),
    tube(S, Test, Used),
    proper_tube(Test, Proper),
    Used \== Proper.

% fault_note/3 - detail a plain fault_label cannot carry. The interface shows
% it beside the fault it belongs to.
fault_note(S, wrong_tube, Test, Used, Proper) :-
    wrong_tube_detail(S, Test, Used, Proper).


% ----------------------------------------------------------------------------
%  15.  HbA1c INTERFERENCE DEPENDS ON THE METHOD
%
%  This section replaces a single fact that used to read:
%
%      fault_effect(haemolysed, hba1c, unclear,
%                   'haemolysis interferes with some HbA1c methods').
%
%  Three things were wrong with it.
%
%  "Some methods" is not something a system can act on. It fired for every
%  haemolysed HbA1c whatever method the laboratory runs, so it manufactured
%  doubt about results the method in use may not be affected by at all.
%
%  It conflated two different findings. sample_state(s, haemolysed) is what
%  the technologist sees in the tube - in vitro. The interference literature
%  is largely about the patient haemolysing - in vivo, a shortened red cell
%  lifespan. NGSP states the second lowers HbA1c "regardless of the assay
%  method used", which is the opposite of method-dependent.
%
%  And the system never asked which method was used, so it could not have
%  done better than "unclear" even in principle.
%
%  Now the method is asked for and effects are looked up per method. Where
%  nothing is recorded for that method, effect_unrecorded/3 reports the gap
%  instead of inventing a direction. That is the honest answer, and it is a
%  question the domain expert can answer.
%
%  Source for the entries below: NGSP, ngsp.org/interf.asp and
%  ngsp.org/factors.asp. Nothing is entered here that a source does not
%  state, and nothing is entered for in-vitro haemolysis on any method,
%  because no source consulted gives a direction for it.
% ----------------------------------------------------------------------------

method_name(hplc,        'ion-exchange HPLC').
method_name(immunoassay, 'immunoassay').
method_name(boronate,    'boronate affinity').
method_name(enzymatic,   'enzymatic').

% method_effect(Method, Cause, Test, Direction, Why).
% Declared dynamic so an empty table fails quietly rather than raising.
:- dynamic(method_effect/5).

% An HbA1c direction is claimed only when the method is known AND an effect
% is recorded for that method. This is a rule clause of fault_effect/4,
% sitting alongside the plain facts above.
fault_effect(Cause, hba1c, Direction, Why) :-
    hba1c_method(s, Method),
    Method \== unknown,
    method_effect(Method, Cause, hba1c, Direction, Why).

% Which method was used, for the record. Part of the explanation: a reader
% checking the reasoning later needs to know what the result was measured on.
method_in_use(S, Name) :-
    value(S, hba1c, _),
    hba1c_method(S, M),
    M \== unknown,
    method_name(M, Name).

% When an HbA1c is in doubt and the method was never recorded, say what is
% missing rather than guessing. A gap the system names is a gap the expert
% can close.
method_not_recorded(S, Why) :-
    value(S, hba1c, _),
    fault(S, _, _),
    \+ ( hba1c_method(S, M), M \== unknown ),
    Why = 'the HbA1c method was not recorded, and whether a fault affects an HbA1c depends on it'.


% ----------------------------------------------------------------------------
%  16.  THE WORDS
%
%  Every sentence the system can say is a fact here. The rules above decide
%  WHICH sentence applies; this section holds the sentence itself.
%
%  These used to be assembled at run time out of fragments with atom_concat.
%  That put the wording inside the reasoning, where it was hard to read and
%  harder to check. As facts, every sentence the system is capable of saying
%  can be read straight off the page - which is also what the domain expert
%  has to confirm.
%
%  Where a sentence needs to name a particular fault or tube, the rule hands
%  the fault back as well and the interface puts the two together. Joining
%  two strings for display is formatting, not reasoning.
% ----------------------------------------------------------------------------

% action_reason(Action, Why) - why each action follows.
action_reason(recollect_urgent,
    'the label does not match the request, so this may be the wrong patient').
action_reason(correct_entry,
    'the result itself is sound, so check what was typed against the analyser').
action_reason(recollect_teach,
    'the sample was not collected correctly, and the patient has to be told what to do differently').
action_reason(recollect,
    'this specimen cannot give a sound result').
action_reason(rerun_same_sample,
    'the analyser was at fault, so the blood in the tube is still good').
action_reason(release_comment,
    'no fault found, but the change from the last result is large').
action_reason(release,
    'no fault found and the result is plausible').

% consistency_reason(Kind, Direction, Why) - does the fault explain the result?
% Direction is low, high, or any where the sentence does not depend on it.
consistency_reason(fits, low,
    'this fault pushes the result down, and this result is low, so it could well be the cause').
consistency_reason(fits, high,
    'this fault pushes the result up, and this result is high, so it could well be the cause').
consistency_reason(clashes, low,
    'this fault pushes the result up, but this result is low, so it is not what caused that').
consistency_reason(clashes, high,
    'this fault pushes the result down, but this result is high, so it is not what caused that').
consistency_reason(unsure, any,
    'this fault affects the test, but not in a predictable direction, so this result cannot be judged either way').
consistency_reason(gap, any,
    'the knowledge base does not record what this fault does to this test, so this result cannot be judged against it').
consistency_reason(real, low,
    'this result is low and nothing found in the run pushes it that way, so treat the low value as the patient''s own until proved otherwise').
consistency_reason(real, high,
    'this result is high and nothing found in the run pushes it that way, so treat the high value as the patient''s own until proved otherwise').

% What the interface prefixes an also_fix/2 cause with.
also_fix_prefix('Fix this before running the new sample:').
