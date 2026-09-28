%% ===========================================================================
%  DECISIONS  -  what the laboratory should do, and how it was reached
%%
%  Glucose Result Release Advisor  -  CM 3321
%  Prakasan R.  -  224152U
%%
%  Choosing the action, running the consultation, and explaining the result.
%%
%  The three files in kb/ are consulted together, in this order:
%      facts.pl  ->  rules.pl  ->  decisions.pl
%  Nothing in an earlier file depends on a later one.
%% ===========================================================================

% ----------------------------------------------------------------------------
%  1.  RULES  -  the decision
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
%  2.  RULES  -  the standing boundary
% ----------------------------------------------------------------------------

boundary('This system decides whether a result is fit to leave the laboratory. It does not interpret what the result means for the patient - that is the clinician''s work.').

% ----------------------------------------------------------------------------
%  3.  THE CONSULTATION  -  what the system may ask, and when it may stop
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
%  4.  THE EXPLANATION CHAIN
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
