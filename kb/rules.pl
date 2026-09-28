%% ===========================================================================
%  RULES  -  working out what is true of this run
%%
%  Glucose Result Release Advisor  -  CM 3321
%  Prakasan R.  -  224152U
%%
%  Deriving the faults, chaining them forward, judging whether the number is
%  believable, and asking whether a fault actually explains what we see.
%%
%  The three files in kb/ are consulted together, in this order:
%      facts.pl  ->  rules.pl  ->  decisions.pl
%  Nothing in an earlier file depends on a later one.
%% ===========================================================================

% ----------------------------------------------------------------------------
%  1.  RULES  -  the evidence for each fault
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
%  2.  FORWARD CHAINING  -  the recognise-act cycle
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
%  3.  RULES  -  is the number itself believable?
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
%  4.  RULES  -  does the fault actually ACCOUNT for what we are seeing?
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
%  5.  FBS AND HbA1c ARE NOT THE SAME SPECIMEN
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
%  6.  HbA1c INTERFERENCE DEPENDS ON THE METHOD
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
