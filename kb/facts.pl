%% ===========================================================================
%  FACTS  -  what the system knows
%%
%  Glucose Result Release Advisor  -  CM 3321
%  Prakasan R.  -  224152U
%%
%  Everything here is a fact. No rule, no reasoning: the tables the rules
%  read, and the sentences they hand back.
%%
%  The three files in kb/ are consulted together, in this order:
%      facts.pl  ->  rules.pl  ->  decisions.pl
%  Nothing in an earlier file depends on a later one.
%% ===========================================================================

% ============================================================================
%  kb/facts.pl  -  Glucose Result Release Advisor : knowledge base
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
%    EVIDENCE AND PROVENANCE, below, records which claims have a published
%    source behind them and which are still my own drafting.
% ============================================================================

% ============================================================================
%  EVIDENCE AND PROVENANCE
%
%  Not a numbered section. It records where the knowledge below came from, so
%  a reader can tell a sourced fact from a drafted one without asking me.
%
%  SOURCES
%    [R1] Sacks DB et al. Guidelines and Recommendations for Laboratory
%         Analysis in the Diagnosis and Management of Diabetes Mellitus.
%         Clinical Chemistry. 2023;69(8):808-868.
%         doi:10.1093/clinchem/hvad080
%         The authoritative laboratory guideline for this domain. Cited as
%         the reference a claim must be CHECKED AGAINST, not as one I have
%         already verified line by line.
%
%    [R2] Gambino R. Sodium fluoride: an ineffective inhibitor of glycolysis.
%         Annals of Clinical Biochemistry. 2013.
%         doi:10.1258/acb.2012.012135
%
%    [R3] NGSP. HbA1c Assay Interferences.  https://ngsp.org/interf.asp
%         NGSP. Factors that Interfere with HbA1c Test Results.
%         https://ngsp.org/factors.asp
%
%  TAGS USED BELOW
%    [R2]            the fact or its comment rests on that source.
%    [check R1]      a drafted value to be checked against [R1] before it is
%                    defended as evidence-based.
%    [local policy]  a laboratory or coursework decision, not a universal
%                    fact. Needs this laboratory's own approved value.
%    [gap]           something the knowledge base does not know and does not
%                    pretend to know.
%
%  An untagged fact is my own drafting from textbooks, awaiting the domain
%  expert. That is still most of this file.
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

% The direction is the settled part: glucose falls in an unseparated tube
% because the blood cells go on metabolising it. The RATE is quoted from my
% reading and is the part still to verify.  [check R1]
fault_effect(delayed, fbs, low,
    'the cells go on eating the glucose in the tube, a reported average of about 5 to 7 per cent an hour').
fault_effect(wrong_tube, fbs, low,
    'without fluoride the cells consume the glucose faster still').
fault_effect(not_fasting, fbs, high,
    'the patient had eaten, so this is not a fasting value').
% This direction assumes the infusion carries glucose, which is the case the
% expert described. A fluid without glucose would dilute the sample and push
% the result the other way instead. The system never asks what is running, so
% it cannot tell the two apart and does not claim to.  [gap]
fault_effect(drip_arm, fbs, high,
    'a sample drawn near a running drip carries the drip fluid with it').
% Not tied to one wavelength: how much lipaemia matters depends on the assay
% design and the analyser's own interference limits.  [gap]
fault_effect(lipaemic, fbs, unclear,
    'turbidity interferes with the reading, by an amount that depends on the analyser and the method').
fault_effect(qc_out, fbs, unclear,
    'the run was not in control, so the direction of the error is unknown').
fault_effect(qc_out, hba1c, unclear,
    'the run was not in control, so the direction of the error is unknown').
fault_effect(reagent_expired, fbs, unclear,
    'an expired lot is outside the conditions it was validated for, so the result cannot be assumed reliable').
fault_effect(calibration_overdue, fbs, unclear,
    'an uncalibrated run cannot be trusted in either direction').
% The direction holds only if the preceding sample really was very high. The
% system is not told what ran before this one, so it takes the expert's
% common case rather than proving it.  [gap]
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
%
% This ordering is a knowledge-engineering decision, not a published standard.
% Identity first, machine faults on to a re-run, sample faults on to a fresh
% draw: that is the model I built from what the expert described. No guideline
% specifies these ranks and none is cited for them. What should happen when
% two faults coexist is the single thing most in need of her confirmation.
% [local policy]
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
    'fast for at least 8 hours before the next draw - no food and no sugary drinks; plain water is allowed').
instruction(drip_arm,
    'draw from the opposite arm, away from any running drip').

% What has to be put right before the analyser is trusted again.
%
% A machine fault leaves the blood in the tube innocent, so the action is a
% re-run and not a fresh draw. But re-running on the same expired lot, the
% same overdue calibration or the same dirty probe only reproduces the error.
% Every machine-family cause needs a line here, and a test enforces that: a
% new machine fault added to fault_family/2 without its corrective action
% fails the suite rather than quietly telling someone to repeat a broken run.
% [local policy]
fix_first(qc_out,              'investigate the control and repeat it').
fix_first(reagent_expired,     'replace the reagent lot').
fix_first(calibration_overdue, 'recalibrate the assay').
fix_first(probe_clot,          'clear the probe').
fix_first(carryover,           'run a wash cycle').
fix_first(not_cleaned,         'run the cleaning cycle').

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

% How long the sample may sit before the plasma is separated from the cells.
% One hour is this laboratory's working figure. Published handling advice is
% tighter - a rapidly acting glycolysis inhibitor, or separation within about
% half an hour - so this is an operating limit, not an evidence-based ceiling.
% [local policy] [check R1]
max_delay_hours(fbs, 1).

min_fasting_hours(8).

% The tube this knowledge base treats as correct. NOT a claim that fluoride
% oxalate is universally the right glucose tube: sodium fluoride alone does
% not stop the first hour of glycolysis [R2], which is why the delay limit
% above matters as much as the tube does. What a laboratory accepts is set by
% its own collection procedure.  [local policy]
proper_tube(fbs, fluoride).

% EDTA is the modelled default. The anticoagulant an HbA1c method actually
% requires is set by the assay manufacturer's instructions for use, so another
% tube is not automatically wrong - this knowledge base simply holds no
% manufacturer configuration to check it against.  [gap]
proper_tube(hba1c, edta).

% The point past which the NUMBER is doubted before the patient is. Drafted
% working limits, not analyser reportable ranges: the real floor and ceiling
% come from the analyser's instructions for use and are not configured here.
% [local policy] [gap]
survivable_low(fbs, 20).        % below this, doubt the number before the patient
survivable_high(fbs, 800).
impossible_low(hba1c, 3.0).
impossible_high(hba1c, 20.0).

% Provisional. Each laboratory sets its own approved critical-value list;
% these are figures in common use and must be confirmed against hers. A
% critical result is still an analytically valid one.  [local policy]
critical_low(fbs, 50).
critical_high(fbs, 400).

% Provisional. Delta-check limits are chosen and validated by the laboratory
% for each measurand; no guideline supplies a universal number.  [local policy]
delta_limit(fbs, 100).          % mg/dL change from the last result before we doubt it
delta_limit(hba1c, 2.0).

% ----------------------------------------------------------------------------
%  6.  THE WORDS
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
    'the analyser was at fault, so the blood in the tube is still good - but the analyser has to be put right before the sample is run again').
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

% And what it prefixes a fix_before_rerun/3 instruction with.
fix_first_prefix('Put this right before the re-run:').

% And what it prefixes a next_step/3 instruction with. Deliberately neutral:
% instruction/2 holds advice for whoever acts on it next, and that is not
% always the patient. "Fast for eight hours" is for the patient; "draw from
% the opposite arm" is for whoever takes the fresh sample.
next_step_prefix('For the fresh sample:').

% Said when a re-run is the right action but the tube has no handling time
% left to survive the correction that has to come first.
no_margin_text('This tube has already used all of its handling time, and the analyser has to be put right before it can be run again. If that correction is not immediate, take fresh blood rather than re-running this tube.').
