/* ---------------------------------------------------------------------------
   verify_cases.js  -  the test suite

   Runs every case straight through kb.pl and checks three things:

     1. the ACTION the system reached, against the expected action
     2. the RULE that produced it, against the expected rule
     3. that the forward-chaining cycle derived the expected faults

   Point 2 is the one that matters. A system can reach the right answer by the
   wrong rule, and that is a bug waiting to surface on the next case.

   Run it with:   node verify_cases.js
   Exit code 0 if every case passes, 1 if any fails.

   Prakasan R.  -  224152U
   --------------------------------------------------------------------------- */

const fs = require('fs');
const vm = require('vm');

// Load the vendored library the way the browser does: no CommonJS `module`,
// so core.js publishes `pl` on the window object and lists.js registers itself.
const sandbox = { console, setTimeout, clearTimeout, Math, Date, JSON,
                  document: { getElementById: () => null } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../web/vendor/tau-prolog.js', 'utf8'), sandbox);
const pl = sandbox.pl;

const ROOT = __dirname + '/..';

// The knowledge base, in the order it must be consulted. build.py and
// web/app.js load the same three files in the same order, and an invariant
// below checks that all three lists agree.
const KB_FILES = ['facts.pl', 'rules.pl', 'decisions.pl'];
const KB = KB_FILES
  .map(n => fs.readFileSync(ROOT + '/kb/' + n, 'utf8'))
  .join('\n');

// Read for the reachability check below: a predicate counts as used if any
// rule calls it or if either JavaScript file queries it.
const APP_JS    = fs.readFileSync(ROOT + '/web/app.js', 'utf8');
const BUILD_PY  = fs.readFileSync(ROOT + '/build.py', 'utf8');
const THIS_FILE = fs.readFileSync(__filename, 'utf8');

// A clean run: the right tube, separated at once, a proper fast.
const CLEAN = 'tube(s,fbs,fluoride). delay_hours(s,0). fasting_hours(s,10).';

// --------------------------------------------------------------- the cases

const CASES = [
  { name: 'Clean run, normal result',
    facts: `value(s,fbs,94). ${CLEAN}`,
    action: 'release',
    rule:   'plausible',
    faults: [] },

  { name: 'Clean run, HbA1c as well',
    facts: `value(s,fbs,94). value(s,hba1c,5.3). tube(s,hba1c,edta). ${CLEAN}`,
    action: 'release',
    rule:   'plausible',
    faults: [] },

  { name: 'Machine at fault - QC out of range',
    facts: `value(s,fbs,61). ${CLEAN} qc_status(s,fbs,out_of_range).`,
    action: 'rerun_same_sample',
    rule:   'specimen_intact',
    faults: ['machine/qc_out'] },

  { name: 'Machine at fault - reagent lot expired',
    facts: `value(s,fbs,210). ${CLEAN} reagent_lot(s,fbs,expired).`,
    action: 'rerun_same_sample',
    rule:   'specimen_intact',
    faults: ['machine/reagent_expired'] },

  { name: 'Specimen at fault - wrong tube and a 4 hour delay',
    facts: 'value(s,fbs,61). tube(s,fbs,plain). delay_hours(s,4). fasting_hours(s,10).',
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['sample/wrong_tube', 'sample/delayed'] },

  { name: 'Specimen at fault - haemolysed',
    facts: `value(s,fbs,150). ${CLEAN} sample_state(s,haemolysed).`,
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['sample/haemolysed'] },

  { name: 'A full panel in the correct tubes releases',
    // Regression guard. The interface used to ask one tube question and
    // apply the answer to both tests, so one of them was always recorded
    // wrong and a combined panel could never be released.
    facts: 'value(s,fbs,94). value(s,hba1c,5.3). tube(s,fbs,fluoride). ' +
           'tube(s,hba1c,edta). delay_hours(s,0). fasting_hours(s,10).',
    action: 'release',
    rule:   'plausible',
    faults: [] },

  { name: 'Glucose in the HbA1c tube is caught, HbA1c is not blamed',
    facts: 'value(s,fbs,94). value(s,hba1c,5.3). tube(s,fbs,edta). ' +
           'tube(s,hba1c,edta). delay_hours(s,0). fasting_hours(s,10).',
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['sample/wrong_tube'],
    noteMentions: 'glucose' },

  { name: 'HbA1c in the glucose tube is caught, glucose is not blamed',
    facts: 'value(s,fbs,94). value(s,hba1c,5.3). tube(s,fbs,fluoride). ' +
           'tube(s,hba1c,fluoride). delay_hours(s,0). fasting_hours(s,10).',
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['sample/wrong_tube'],
    noteMentions: 'HbA1c' },

  { name: 'A haemolysed HbA1c no longer produces invented doubt',
    // Regression guard. fault_effect(haemolysed, hba1c, unclear, 'interferes
    // with some HbA1c methods') fired for every haemolysed HbA1c whatever
    // method the laboratory runs, so the system reported "cannot be judged
    // either way" about results the method may not be affected by at all.
    facts: 'value(s,hba1c,9.1). tube(s,hba1c,edta). delay_hours(s,0). ' +
           'fasting_hours(s,10). sample_state(s,haemolysed).',
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['sample/haemolysed'],
    consistency: 'unrecorded_effect' },

  { name: 'A known method is named in the reasoning',
    facts: 'value(s,hba1c,9.1). tube(s,hba1c,edta). delay_hours(s,0). ' +
           'fasting_hours(s,10). sample_state(s,haemolysed). hba1c_method(s,boronate).',
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['sample/haemolysed'],
    mentionsMethod: 'boronate affinity' },

  { name: 'Wrong tube is checked against the TEST, not against glucose',
    facts: 'value(s,hba1c,5.9). tube(s,hba1c,plain). delay_hours(s,0). fasting_hours(s,10).',
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['sample/wrong_tube'] },

  { name: 'Collection at fault - patient had not fasted',
    facts: 'value(s,fbs,140). tube(s,fbs,fluoride). delay_hours(s,0). fasting_hours(s,3).',
    action: 'recollect_teach',
    rule:   'instruction(Cause, _)',
    faults: ['collection/not_fasting'] },

  { name: 'Collection at fault - drip arm',
    facts: `value(s,fbs,188). ${CLEAN} drip_arm(s).`,
    action: 'recollect_teach',
    rule:   'instruction(Cause, _)',
    faults: ['collection/drip_arm'] },

  { name: 'Identity - label mismatch outranks everything',
    facts: `value(s,fbs,310). ${CLEAN} label_mismatch(s).`,
    action: 'recollect_urgent',
    rule:   'label_mismatch',
    faults: ['identity/label_mismatch'] },

  { name: 'Identity - a typing doubt alone needs no new blood',
    facts: `value(s,fbs,102). ${CLEAN} transcription_doubt(s).`,
    action: 'correct_entry',
    rule:   'transcription_doubt',
    faults: ['identity/transcription_doubt'] },

  { name: 'Two faults - the specimen beats the machine',
    facts: `value(s,fbs,61). ${CLEAN} qc_status(s,fbs,out_of_range). sample_state(s,haemolysed).`,
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['machine/qc_out', 'sample/haemolysed'],
    alsoFix: true },

  { name: 'An HbA1c below the assay range is not released',
    // Regression guard. impossible_low/2 was declared in the knowledge base
    // and read by no rule, so an HbA1c of 1.5 was released as a real result.
    facts: 'value(s,hba1c,1.5). tube(s,hba1c,edta). delay_hours(s,0). fasting_hours(s,10).',
    action: 'escalate',
    rule:   'implausible',
    faults: [] },

  { name: 'An HbA1c just below the assay floor is not released',
    facts: 'value(s,hba1c,2.9). tube(s,hba1c,edta). delay_hours(s,0). fasting_hours(s,10).',
    action: 'escalate',
    rule:   'implausible',
    faults: [] },

  { name: 'A low but reportable HbA1c is still released',
    // The other side of the boundary: 3.5 is unusual but the assay can
    // report it, so the system must not reject it.
    facts: 'value(s,hba1c,3.5). tube(s,hba1c,edta). delay_hours(s,0). fasting_hours(s,10).',
    action: 'release',
    rule:   'plausible',
    faults: [] },

  { name: 'No fault, but an impossible number',
    facts: `value(s,fbs,12). ${CLEAN}`,
    action: 'escalate',
    rule:   'implausible',
    faults: [] },

  { name: 'No fault, but a large change from the last result',
    facts: `value(s,fbs,88). previous_value(s,fbs,240). ${CLEAN}`,
    action: 'release_comment',
    rule:   'delta_fail',
    faults: [] },

  { name: 'Critical high is flagged but still released',
    facts: `value(s,fbs,430). ${CLEAN}`,
    action: 'release',
    rule:   'plausible',
    faults: [],
    critical: 'high' },

  // --- the consistency check -------------------------------------------
  { name: 'Consistency: a delay explains a LOW result',
    facts: 'value(s,fbs,61). tube(s,fbs,fluoride). delay_hours(s,4). fasting_hours(s,10).',
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['sample/delayed'],
    consistency: 'accounts_for' },

  { name: 'Consistency: a delay does NOT explain a HIGH result',
    facts: 'value(s,fbs,350). tube(s,fbs,fluoride). delay_hours(s,4). fasting_hours(s,10).',
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['sample/delayed'],
    consistency: 'does_not_account_for' },

  { name: 'Consistency: an unclear interference cannot be judged',
    facts: `value(s,fbs,268). ${CLEAN} qc_status(s,fbs,out_of_range).`,
    action: 'rerun_same_sample',
    rule:   'specimen_intact',
    faults: ['machine/qc_out'],
    consistency: 'direction_unknown' },

  { name: 'A haemolysed tube is never called probably real',
    // Regression guard. Nothing records what haemolysis does to a glucose,
    // and the old rule read that silence as "no effect", so it reported
    // "treat the high value as the patient's own" about a specimen that
    // was being thrown away.
    facts: 'value(s,fbs,350). tube(s,fbs,fluoride). delay_hours(s,0). ' +
           'fasting_hours(s,10). sample_state(s,haemolysed).',
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['sample/haemolysed'],
    consistency: 'unrecorded_effect' },

  { name: 'A clotted tube is never called probably real',
    facts: 'value(s,fbs,350). tube(s,fbs,fluoride). delay_hours(s,0). ' +
           'fasting_hours(s,10). sample_state(s,clotted).',
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['sample/clotted'],
    consistency: 'unrecorded_effect' },

  { name: 'A known direction still supports probably real',
    // The claim that must NOT be lost. A delay pushes glucose down; this
    // result is up; so the delay cannot have caused it and the high is
    // real, if anything understated.
    facts: 'value(s,fbs,350). tube(s,fbs,fluoride). delay_hours(s,4). ' +
           'fasting_hours(s,10).',
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['sample/delayed'],
    consistency: 'unaccounted' },

  { name: 'A label mismatch blocks "probably real" and says why',
    // This used to expect silence. Saying nothing was never right: the
    // reason no judgement is possible is that nothing records what a
    // mismatched label does to a glucose, because the question is
    // meaningless when nobody knows whose blood it is.
    facts: `value(s,fbs,310). ${CLEAN} label_mismatch(s).`,
    action: 'recollect_urgent',
    rule:   'label_mismatch',
    faults: ['identity/label_mismatch'],
    consistency: 'unrecorded_effect' },

  // --- stopping only on evidence, never on ignorance --------------------
  { name: 'A typing doubt does not settle before the specimen is looked at',
    // Regression guard. correct_entry is rank 2 and its rule is guarded by
    // \\+ fault(S, sample, _). After two questions nothing has been ASKED,
    // so that guard reported absence when the truth was ignorance, and the
    // system stopped and said "no new blood needed".
    facts: 'value(s,fbs,94). transcription_doubt(s).',
    action: 'correct_entry',
    rule:   'transcription_doubt',
    faults: ['identity/transcription_doubt'],
    notSettledAt: 3 },

  { name: 'The same typing doubt settles once everything has been asked',
    facts: 'value(s,fbs,94). transcription_doubt(s). tube(s,fbs,fluoride). ' +
           'delay_hours(s,0). fasting_hours(s,10).',
    action: 'correct_entry',
    rule:   'transcription_doubt',
    faults: ['identity/transcription_doubt'],
    settledAt: 6 },

  { name: 'A typing doubt beside a haemolysed tube is not a typing fix',
    // The case the early stop would have got wrong: it reported
    // correct_entry without ever looking at the specimen.
    facts: 'value(s,fbs,94). transcription_doubt(s). sample_state(s,haemolysed). ' +
           'tube(s,fbs,fluoride). delay_hours(s,0). fasting_hours(s,10).',
    action: 'recollect',
    rule:   'fault(S, sample, Cause)',
    faults: ['identity/transcription_doubt', 'sample/haemolysed'] },

  // --- the consultation -------------------------------------------------
  { name: 'Stopping rule: a rank 1 fault settles it against every question',
    facts: `value(s,fbs,310). ${CLEAN} label_mismatch(s).`,
    action: 'recollect_urgent',
    rule:   'label_mismatch',
    faults: ['identity/label_mismatch'],
    settledAt: 2 },

  { name: 'Stopping rule: a rank 5 fault does NOT settle it against rank 4',
    facts: `value(s,fbs,61). ${CLEAN} qc_status(s,fbs,out_of_range).`,
    action: 'rerun_same_sample',
    rule:   'specimen_intact',
    faults: ['machine/qc_out'],
    notSettledAt: 4 }
];

// ------------------------------------------------- structural invariants
//
// These do not run a case. They check properties of the knowledge base
// itself, which is where a defect can hide without any single case failing.

const INVARIANTS = [
  {
    name: 'every cause derives with the family fault_family/2 states',
    // Trigger each of the 15 causes in turn and check the derived family
    // against the table. Proves the table governs all of them, not just the
    // ones a case happens to exercise.
    run: async () => {
      const problems = [];
      const base = 'value(s,fbs,94). tube(s,fbs,fluoride). delay_hours(s,0). fasting_hours(s,10).';
      const triggers = {
        qc_out:              base + ' qc_status(s,fbs,out_of_range).',
        reagent_expired:     base + ' reagent_lot(s,fbs,expired).',
        calibration_overdue: base + ' calibration(s,fbs,overdue).',
        probe_clot:          base + ' analyser_flag(s,probe_clot).',
        carryover:           base + ' analyser_flag(s,carryover).',
        not_cleaned:         base + ' instrument_clean(s,no).',
        haemolysed:          base + ' sample_state(s,haemolysed).',
        clotted:             base + ' sample_state(s,clotted).',
        lipaemic:            base + ' sample_state(s,lipaemic).',
        wrong_tube:          'value(s,fbs,94). tube(s,fbs,plain). delay_hours(s,0). fasting_hours(s,10).',
        delayed:             'value(s,fbs,94). tube(s,fbs,fluoride). delay_hours(s,4). fasting_hours(s,10).',
        not_fasting:         'value(s,fbs,94). tube(s,fbs,fluoride). delay_hours(s,0). fasting_hours(s,2).',
        drip_arm:            base + ' drip_arm(s).',
        label_mismatch:      base + ' label_mismatch(s).',
        transcription_doubt: base + ' transcription_doubt(s).'
      };

      const table = await load('');
      const entries = await query(table, 'fault_family(C, F).', ['C', 'F']);
      if (entries.length !== 15) {
        problems.push(`fault_family/2 has ${entries.length} entries, expected 15`);
      }

      for (const { C, F } of entries) {
        if (!triggers[C]) {
          problems.push(`${C} is in the table but this test has no way to trigger it`);
          continue;
        }
        const s = await load(triggers[C]);
        await query(s, 'forward_chain.');
        const got = await query(s, `fault(s, Fam, ${C}).`, ['Fam']);
        if (!got.length) {
          problems.push(`${C} is in the table but nothing derived it`);
        } else if (got[0].Fam !== F) {
          problems.push(`${C}: table says ${F}, system derived ${got[0].Fam}`);
        }
      }
      return problems;
    }
  },
  {
    name: 'editing fault_family/2 alone reclassifies a fault',
    // Regression guard for the defect where the family was ALSO written into
    // the head of each condition rule, so the two could disagree and the
    // table would be silently ignored.
    //
    // This edits the shipped knowledge base text, changing one line and
    // nothing else, then checks the change carried all the way through to
    // the specimen decision.
    run: async () => {
      const problems = [];
      const line = KB.split('\n').find(l => /^fault_family\(probe_clot/.test(l));
      if (!line) return ['could not find the probe_clot entry in fault_family/2'];

      const altered = KB.replace(line, 'fault_family(probe_clot, sample).');
      const facts = 'value(s,fbs,94). tube(s,fbs,fluoride). delay_hours(s,0). ' +
                    'fasting_hours(s,10). analyser_flag(s,probe_clot).';

      const session = await new Promise((resolve, reject) => {
        const sess = pl.create(400000);
        sess.consult(altered + '\n' + facts, {
          success: () => resolve(sess),
          error: e => reject(pl.format_answer(e))
        });
      });
      await query(session, 'forward_chain.');

      const got = await query(session, 'fault(s, F, probe_clot).', ['F']);
      if (!got.length || got[0].F !== 'sample') {
        problems.push(
          `changing one line of fault_family/2 did not reclassify probe_clot ` +
          `(derived ${got.length ? got[0].F : 'nothing'}) - the family is coming ` +
          `from somewhere other than the table`);
      }

      // And it must carry through: a sample fault compromises the specimen,
      // a machine fault does not. If only the label changed, this stays intact.
      const intact = await query(session, 'specimen_intact(s).');
      if (intact.length) {
        problems.push('probe_clot reclassified as a sample fault left the specimen ' +
                      'intact - the downstream rules are not reading the derived family');
      }

      // The decision must follow too: recollect, not rerun.
      const dec = await query(session, 'decision(s, A, _).', ['A']);
      if (!dec.length || dec[0].A !== 'recollect') {
        problems.push(`expected the decision to become recollect, got ` +
                      `${dec.length ? dec[0].A : 'nothing'}`);
      }
      return problems;
    }
  }
  ,{
    name: 'no HbA1c direction is claimed without a method to justify it',
    // Structural guard. Every fault_effect on hba1c must either be a plain
    // fact the source supports, or come through the method lookup. A blanket
    // "some methods interfere" claim is what this test exists to prevent.
    run: async () => {
      const problems = [];

      // With no method recorded, an HbA1c fault must produce a gap report
      // and must NOT produce a direction.
      const noMethod = await load(
        'value(s,hba1c,9.1). tube(s,hba1c,edta). delay_hours(s,0). ' +
        'fasting_hours(s,10). sample_state(s,haemolysed).');
      await query(noMethod, 'forward_chain.');

      const dir = await query(noMethod, 'direction_unknown(s, hba1c, _, _).');
      if (dir.length) {
        problems.push('an HbA1c interference was claimed with no method recorded: ' +
                      'the blanket "some methods" claim is back');
      }
      const gap = await query(noMethod, 'unrecorded_effect(s, hba1c, _, _).');
      if (!gap.length) {
        problems.push('no method recorded and no gap reported: the system is silent ' +
                      'where it should say what it is missing');
      }
      const asks = await query(noMethod, 'method_not_recorded(s, _).');
      if (!asks.length) {
        problems.push('the system did not say that the HbA1c method is missing');
      }

      // And with a method recorded, it must say which.
      const withMethod = await load(
        'value(s,hba1c,9.1). tube(s,hba1c,edta). delay_hours(s,0). ' +
        'fasting_hours(s,10). sample_state(s,haemolysed). hba1c_method(s,hplc).');
      await query(withMethod, 'forward_chain.');
      const named = await query(withMethod, 'method_in_use(s, W).', ['W']);
      if (!named.length) problems.push('a recorded method was not named in the reasoning');
      const stillAsking = await query(withMethod, 'method_not_recorded(s, _).');
      if (stillAsking.length) {
        problems.push('the method was recorded but the system still says it is missing');
      }

      // The method question must only be asked when an HbA1c was requested.
      const fbsOnly = await load('value(s,fbs,94).');
      const qs = (await query(fbsOnly, 'relevant(Q).', ['Q'])).map(r => r.Q);
      if (qs.includes('method')) {
        problems.push('the HbA1c method was asked about on a glucose-only request');
      }
      const withA1c = await load('value(s,hba1c,5.3).');
      const qs2 = (await query(withA1c, 'relevant(Q).', ['Q'])).map(r => r.Q);
      if (!qs2.includes('method')) {
        problems.push('the HbA1c method was not asked about on an HbA1c request');
      }
      return problems;
    }
  }
  ,{
    name: 'build.py, app.js and this file load the same knowledge base',
    // The knowledge base lives in three files now, and three different
    // places have to load them in the same order. If those lists drift, the
    // page and the tests would be reasoning over different programs, and
    // every test here would still pass.
    run: () => {
      const problems = [];
      const listOf = (src, label) => {
        const m = src.match(/KB_FILES\s*=\s*\[([^\]]*)\]/);
        if (!m) { problems.push(`${label} has no KB_FILES list`); return null; }
        return m[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, ''))
                   .filter(Boolean);
      };
      const mine  = KB_FILES;
      const app   = listOf(APP_JS,   'web/app.js');
      const build = listOf(BUILD_PY, 'build.py');
      for (const [other, label] of [[app, 'web/app.js'], [build, 'build.py']]) {
        if (!other) continue;
        if (other.join(',') !== mine.join(',')) {
          problems.push(`${label} loads [${other}] but this file loads [${mine}]`);
        }
      }
      // And every listed file must exist.
      for (const n of mine) {
        if (!fs.existsSync(ROOT + '/kb/' + n)) problems.push(`kb/${n} does not exist`);
      }
      // Nothing should be left behind in kb/ that no one loads.
      for (const f of fs.readdirSync(ROOT + '/kb')) {
        if (f.endsWith('.pl') && !mine.includes(f)) {
          problems.push(`kb/${f} exists but nothing loads it`);
        }
      }
      return problems;
    }
  }
  ,{
    name: 'the README describes the system that actually exists',
    // The README went stale twice during this project: it still described
    // fault_holds/3 after the forward-chaining rewrite, and it claimed a
    // section count that was wrong because a removed section left a hole in
    // the numbering. Documentation that lies is worse than none.
    run: async () => {
      const problems = [];
      const README = fs.readFileSync(ROOT + '/README.md', 'utf8');

      // 1. Every Prolog line the README quotes must exist in kb.pl.
      const SKIP = /^(%|value\(|tube\(|delay_hours|qc_status|fault_family\()/;
      for (const m of README.matchAll(/```prolog\n([\s\S]*?)```/g)) {
        for (const raw of m[1].split('\n')) {
          const line = raw.trim();
          if (!line || SKIP.test(line)) continue;
          if (!KB.includes(line.replace(/\s+%.*$/, '').trim())) {
            problems.push(`README quotes a rule that is not in kb.pl: ${line}`);
          }
        }
      }

      // 2. Predicates the README names must still exist.
      for (const name of ['fault_condition', 'fault_family', 'forward_chain',
                          'specimen_compromised', 'decision', 'settled',
                          'also_fix', 'boundary', 'method_effect']) {
        if (!new RegExp('\\b' + name + '\\b').test(KB)) {
          problems.push(`README names ${name}, which no longer exists in kb.pl`);
        }
      }

      // 3. Predicates the README must NOT name, because they were removed.
      for (const gone of ['fault_holds', 'blood_still_usable', 'reset_derived',
                          'repeat_done']) {
        if (README.includes(gone)) {
          problems.push(`README still mentions ${gone}, which was removed`);
        }
      }

      // 4. The counts it states must be the real ones.
      const strip = KB.split('\n').filter(l => !l.trim().startsWith('%')).join('\n')
                      .replace(/:-\s*dynamic\([^)]*\)\./g, '');
      const clauses = strip.split(/\.\s*\n/).map(c => c.trim()).filter(Boolean);
      const rules = clauses.filter(c => c.includes(':-')).length;
      const facts = clauses.length - rules;
      const stated = README.match(/\*\*(\d+) rules and (\d+) facts\*\*/);
      if (!stated) {
        problems.push('README no longer states the rule and fact counts');
      } else {
        if (+stated[1] !== rules) problems.push(`README says ${stated[1]} rules, there are ${rules}`);
        if (+stated[2] !== facts) problems.push(`README says ${stated[2]} facts, there are ${facts}`);
      }

      // 5. Each knowledge-base file numbers its own sections from 1, with no
      //    gaps. A gap means a section was removed and the rest never
      //    renumbered, which is how the old single file drifted.
      let totalSections = 0;
      for (const name of KB_FILES) {
        const text = fs.readFileSync(ROOT + '/kb/' + name, 'utf8');
        const nums = [...text.matchAll(/^%  (\d+)\.  /gm)].map(m => +m[1]);
        totalSections += nums.length;
        for (let i = 0; i < nums.length; i++) {
          if (nums[i] !== i + 1) {
            problems.push(`kb/${name} section numbering jumps: ${nums.join(', ')}`);
            break;
          }
        }
      }
      const WORDS = { 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
                      'sixteen': 16, 'seventeen': 17, 'eighteen': 18 };
      const sec = README.match(/in (\w+) numbered sections/);
      if (sec && WORDS[sec[1]] !== totalSections) {
        problems.push(`README says ${sec[1]} sections, kb/ has ${totalSections}`);
      }

      // 6. The test count it states must be the real one.
      const claimed = README.match(/\*\*(\d+) tests in three layers\.\*\*/);
      const real = CASES.length + INVARIANTS.length + JOURNEYS.length;
      if (claimed && +claimed[1] !== real) {
        problems.push(`README says ${claimed[1]} tests, the suite has ${real}`);
      }
      return problems;
    }
  }
  ,{
    name: 'every question the knowledge base asks can be answered',
    // Regression guard. askable/4 declared a question the interface had no
    // way to turn into a fact, so the user answered it and nothing was
    // recorded - the system then reported the information as missing.
    run: async () => {
      const problems = [];
      const s = await load('value(s,fbs,94). value(s,hba1c,5.3).');
      const ids = (await query(s, 'askable(I, _, _, _).', ['I'])).map(r => r.I);

      // The ASSERTS table in app.js is what turns an answer into a fact.
      const block = APP_JS.slice(APP_JS.indexOf('var ASSERTS'),
                                 APP_JS.indexOf('function facts()'));
      for (const id of ids) {
        if (!new RegExp('\\b' + id + '\\s*:').test(block)) {
          problems.push(`askable "${id}" has no entry in the ASSERTS table: the ` +
                        `question is asked but the answer is thrown away`);
        }
        const opts = await query(s, `option(${id}, _, _).`);
        const num  = await query(s, `askable(${id}, _, number, _).`);
        if (!opts.length && !num.length) {
          problems.push(`askable "${id}" offers no options and is not a number question`);
        }
      }
      return problems;
    }
  }
  ,{
    name: 'no predicate in the knowledge base is unreachable',
    // Structural guard against dead knowledge. Every predicate kb.pl defines
    // must either be called by another rule in kb.pl, or queried by app.js or
    // by this file. Anything else is a rule that looks like knowledge and
    // does nothing - which overstates what the system knows.
    run: () => {
      const problems = [];
      const strip = KB.split('\n')
        .filter(l => !l.trim().startsWith('%'))
        .join('\n')
        .replace(/:-\s*dynamic\([^)]*\)\./g, '');

      const clauses = strip.split(/\.\s*\n/).map(c => c.trim()).filter(Boolean);

      const heads = new Set();
      const bodyGoals = new Set();
      for (const c of clauses) {
        const i = c.indexOf(':-');
        const head = (i === -1 ? c : c.slice(0, i)).trim();
        const body = i === -1 ? '' : c.slice(i + 2);
        const hm = head.match(/^([a-z_]\w*)/);
        if (hm) heads.add(hm[1]);
        let m;
        const re = /\b([a-z_]\w*)\s*\(/g;
        while ((m = re.exec(body)) !== null) bodyGoals.add(m[1]);
        // bare goals with no arguments, e.g. forward_chain
        for (const g of body.split(/[,;]/)) {
          const bm = g.trim().match(/^([a-z_]\w*)$/);
          if (bm) bodyGoals.add(bm[1]);
        }
      }

      const BUILTIN = new Set(['atom_concat', 'assertz', 'retract', 'retractall',
        'findall', 'member', 'catch', 'clause', 'is', 'forall', 'between',
        'format', 'msort', 'abs', 'true', 'fail']);

      const js = APP_JS + '\n' + THIS_FILE;

      for (const name of [...heads].sort()) {
        if (BUILTIN.has(name)) continue;
        const calledInKb = bodyGoals.has(name);
        const queried = new RegExp('\\b' + name + '\\s*[(.]').test(js);
        if (!calledInKb && !queried) {
          problems.push(`${name} is defined in kb.pl but nothing calls or queries it`);
        }
      }
      return problems;
    }
  }
  ,{
    name: 'a broken rule is reported, never answered as "release"',
    // Regression guard for the worst failure mode this system has. The
    // interface treated a Prolog error exactly like "no solutions", so one
    // broken rule made the page derive no faults at all and print
    // "Release the result" on a haemolysed sample, with nothing shown.
    run: async () => {
      const problems = [];

      // A knowledge base with one condition rule calling a predicate that
      // does not exist. Everything else is untouched.
      const broken = KB.replace(
        'fault_condition(S, haemolysed) :-\n    sample_state(S, haemolysed).',
        'fault_condition(S, haemolysed) :-\n    sample_state(S, haemolysed),\n' +
        '    a_predicate_that_does_not_exist(S).');
      if (broken === KB) return ['could not break the knowledge base for this test'];

      const facts = 'value(s,fbs,94). tube(s,fbs,fluoride). delay_hours(s,0). ' +
                    'fasting_hours(s,10). sample_state(s,haemolysed).';

      const session = await new Promise((resolve, reject) => {
        const sess = pl.create(400000);
        sess.consult(broken + '\n' + facts, {
          success: () => resolve(sess),
          error: e => reject(pl.format_answer(e))
        });
      });

      let raised = false;
      try {
        await query(session, 'forward_chain.');
      } catch (e) {
        raised = true;
      }
      if (!raised) {
        problems.push('forward_chain over a broken rule did not raise: the ' +
                      'error is still being swallowed');
        // and show how bad that is
        const dec = await query(session, 'decision(s, A, _).', ['A']).catch(() => []);
        if (dec.length && dec[0].A === 'release') {
          problems.push('...and the system answered "release" on a haemolysed sample');
        }
      }
      return problems;
    }
  }
  ,{
    name: 'every declared limit is actually consulted by a rule',
    // Structural guard against dead knowledge. impossible_low/2 sat in the
    // knowledge base unread for the whole of the project's life. This sweeps
    // every limit fact, builds a value just past it, and insists the rule
    // that is supposed to notice actually fires.
    run: async () => {
      const problems = [];
      const probe = await load('');

      const base = {
        fbs:   'tube(s,fbs,fluoride). delay_hours(s,0). fasting_hours(s,10).',
        hba1c: 'tube(s,hba1c,edta). delay_hours(s,0). fasting_hours(s,10).'
      };

      // limit predicate -> how to trip it, and which rule must then fire
      const spec = [
        ['survivable_low',  v => v - 1,   'implausible(s, _, _).'],
        ['survivable_high', v => v + 1,   'implausible(s, _, _).'],
        ['impossible_low',  v => v - 0.1, 'implausible(s, _, _).'],
        ['impossible_high', v => v + 0.1, 'implausible(s, _, _).'],
        ['critical_low',    v => v,       'critical(s, _, _).'],
        ['critical_high',   v => v,       'critical(s, _, _).']
      ];

      let checked = 0;
      for (const [pred, trip, goal] of spec) {
        const rows = await query(probe, `${pred}(T, V).`, ['T', 'V']);
        if (!rows.length) {
          problems.push(`${pred}/2 declares no limits at all`);
          continue;
        }
        for (const { T, V } of rows) {
          if (!base[T]) { problems.push(`no base facts for test ${T}`); continue; }
          const v = trip(parseFloat(V));
          const s = await load(`value(s,${T},${v}). ${base[T]}`);
          await query(s, 'forward_chain.');
          const fired = await query(s, goal);
          checked++;
          if (!fired.length) {
            problems.push(`${pred}(${T}, ${V}) is declared but nothing reacts ` +
                          `to a value of ${v}: the limit is dead knowledge`);
          }
        }
      }
      if (checked < 6) problems.push(`only ${checked} limits were exercised, expected at least 6`);
      return problems;
    }
  }
  ,{
    name: 'silence in fault_effect never becomes probably real',
    // Structural guard. For every fault that has no recorded effect on a
    // test, an abnormal result on that test must produce unrecorded_effect
    // and must NOT produce unaccounted.
    run: async () => {
      const problems = [];
      const probe = await load('value(s,fbs,94).');
      const causes = (await query(probe, 'fault_family(C, _).', ['C'])).map(r => r.C);

      const trigger = {
        qc_out:              'qc_status(s,fbs,out_of_range).',
        reagent_expired:     'reagent_lot(s,fbs,expired).',
        calibration_overdue: 'calibration(s,fbs,overdue).',
        probe_clot:          'analyser_flag(s,probe_clot).',
        carryover:           'analyser_flag(s,carryover).',
        not_cleaned:         'instrument_clean(s,no).',
        haemolysed:          'sample_state(s,haemolysed).',
        clotted:             'sample_state(s,clotted).',
        lipaemic:            'sample_state(s,lipaemic).',
        drip_arm:            'drip_arm(s).',
        label_mismatch:      'label_mismatch(s).',
        transcription_doubt: 'transcription_doubt(s).'
      };

      for (const c of causes) {
        if (!trigger[c]) continue;   // wrong_tube / delayed / not_fasting need
                                     // altered base facts; covered by cases
        const s = await load('value(s,fbs,350). tube(s,fbs,fluoride). ' +
                             'delay_hours(s,0). fasting_hours(s,10). ' + trigger[c]);
        await query(s, 'forward_chain.');
        const recorded = await query(s, `fault_effect(${c}, fbs, _, _).`);
        const real = await query(s, 'unaccounted(s, _, _).');
        const gap  = await query(s, 'unrecorded_effect(s, _, _, _).');

        if (!recorded.length) {
          if (real.length) {
            problems.push(`${c} has no recorded effect on glucose, yet the ` +
                          `system called the result probably real`);
          }
          if (!gap.length) {
            problems.push(`${c} has no recorded effect on glucose, and the ` +
                          `system did not say so`);
          }
        }
      }
      return problems;
    }
  }
  ,{
    name: 'no action resting on absent evidence settles while unexplored',
    // Structural guard. For every action whose rule requires a family to be
    // absent, settled/2 must refuse while any question that could establish
    // a fault in that family is still unasked.
    run: async () => {
      const problems = [];
      const s = await load('value(s,fbs,94).');

      const pairs = await query(s, 'requires_absence_of(A, F).', ['A', 'F']);
      if (!pairs.length) {
        return ['requires_absence_of/2 is empty: nothing is protected from ' +
                'stopping on absent evidence'];
      }

      // Every action whose rule contains a negated fault/3 must appear.
      for (const a of ['correct_entry', 'rerun_same_sample', 'escalate',
                       'release_comment', 'release']) {
        if (!pairs.some(p => p.A === a)) {
          problems.push(`${a} has a negated guard but no requires_absence_of/2 entry`);
        }
      }

      // Every cause in the table must be reachable by some question, or
      // family_explored/2 would call a family explored that never can be.
      const causes = (await query(s, 'fault_family(C, _).', ['C'])).map(r => r.C);
      for (const c of causes) {
        const est = await query(s, `establishes(_, ${c}).`);
        if (!est.length) {
          problems.push(`${c} is in the table but no question establishes it`);
        }
      }

      // And the behaviour itself: a typing doubt must not settle at rank 3.
      const early = await load('value(s,fbs,94). transcription_doubt(s).');
      await query(early, 'forward_chain.');
      const dec = await query(early, 'decision(s, A, _).', ['A']);
      if (dec.length && dec[0].A === 'correct_entry') {
        const stops = await query(early, 'settled(s, 3).');
        if (stops.length) {
          problems.push('correct_entry settled at rank 3 with the sample family ' +
                        'unexplored: the system would stop without looking at the tube');
        }
      } else {
        problems.push(`expected correct_entry, got ${dec.length ? dec[0].A : 'nothing'}`);
      }
      return problems;
    }
  }
  ,{
    name: 'only questions relevant to the tests requested are asked',
    // Regression guard. Glucose and HbA1c need different tubes, so there
    // must be a tube question per test, and neither may be asked about a
    // test that was not requested. The fasting window and the separation
    // time are glucose facts and must not be asked for an HbA1c alone.
    run: async () => {
      const problems = [];
      const ask = async facts => {
        const s = await load(facts);
        return (await query(s, 'relevant(Q).', ['Q'])).map(r => r.Q);
      };

      const hba1cOnly = await ask('value(s,hba1c,5.3).');
      const fbsOnly   = await ask('value(s,fbs,94).');
      const both      = await ask('value(s,fbs,94). value(s,hba1c,5.3).');

      const want = (list, q, present, label) => {
        const has = list.includes(q);
        if (present && !has) problems.push(`${label}: ${q} should be asked`);
        if (!present && has) problems.push(`${label}: ${q} should NOT be asked`);
      };

      want(hba1cOnly, 'tube_hba1c', true,  'HbA1c only');
      want(hba1cOnly, 'tube_fbs',   false, 'HbA1c only');
      want(hba1cOnly, 'fasting',    false, 'HbA1c only');
      want(hba1cOnly, 'delay',      false, 'HbA1c only');

      want(fbsOnly,   'tube_fbs',   true,  'FBS only');
      want(fbsOnly,   'tube_hba1c', false, 'FBS only');
      want(fbsOnly,   'fasting',    true,  'FBS only');
      want(fbsOnly,   'delay',      true,  'FBS only');

      want(both,      'tube_fbs',   true,  'both');
      want(both,      'tube_hba1c', true,  'both');

      // And there must be no single tube question left that could be
      // applied to both tests at once.
      const s = await load('value(s,fbs,94).');
      const generic = await query(s, "askable(tube, _, _, _).");
      if (generic.length) {
        problems.push('a single askable(tube, ...) still exists: one answer ' +
                      'could be applied to both tests again');
      }
      return problems;
    }
  }
];

// ------------------------------------------------- integration: consultations
//
// Everything above loads facts straight into Prolog. That is the right way to
// test a rule, but it skips the whole consultation: which questions get asked,
// in what order, when it stops, and whether an answer becomes a fact at all.
//
// A question whose answer was thrown away passed the entire unit suite,
// because the unit suite never answers a question. These drive the real
// thing - the real kb.pl, the real question order, and the real ASSERTS table
// lifted out of app.js - with no browser and no dependencies.

// Lift the answer-to-fact table out of app.js rather than restating it here.
// A copy would drift, and drift is the bug this section exists to catch.
const ASSERTS = (() => {
  const start = APP_JS.indexOf('var ASSERTS = {');
  const end   = APP_JS.indexOf('};', start) + 2;
  if (start < 0) throw new Error('could not find the ASSERTS table in app.js');
  // eslint-disable-next-line no-new-func
  return new Function(APP_JS.slice(start, end) + ' return ASSERTS;')();
})();

// What a technologist answers when nothing is wrong. Scenarios override only
// what they are about, so each one reads as its own story.
const CLEAN_ANSWERS = {
  label: 'yes', typed: 'no', drip: 'no', look: 'normal', flag: 'none',
  qc: 'yes', lot: 'yes', cal: 'yes', clean: 'yes',
  tube_fbs: 'fluoride', tube_hba1c: 'edta', method: 'boronate',
  fasting: 10, delay: 0
};

async function consult(values, answers, continueAfterSettled) {
  const given = Object.assign({}, CLEAN_ANSWERS, answers);
  const asked = [];
  const facts = [];
  let offered = false;

  for (const [test, v] of Object.entries(values)) {
    facts.push(`value(s, ${test}, ${v}).`);
  }
  const factText = () => facts.join('\n');

  // The question list, exactly as the interface builds it.
  const setup = await load(factText());
  const askables = await query(setup, 'askable(I, R, K, Q).', ['I', 'R', 'K', 'Q']);
  const relevant = new Set((await query(setup, 'relevant(I).', ['I'])).map(r => r.I));
  const rank = {};
  askables.forEach(a => { rank[a.I] = +a.R; });
  const order = askables
    .map(a => a.I)
    .filter(id => relevant.has(id))
    .sort((a, b) => rank[a] - rank[b]);

  let at = 0, extra = false;
  for (let guard = 0; guard < 40; guard++) {
    if (at >= order.length) break;

    const s = await load(factText());
    await query(s, 'forward_chain.');
    const settled = (await query(s, `settled(s, ${rank[order[at]]}).`)).length > 0;
    const useful = new Set((await query(s, 'still_useful(Q).', ['Q'])).map(r => r.Q));
    const usefulLeft = order.slice(at).filter(id => useful.has(id));

    if (settled && !extra) {
      if (usefulLeft.length) {
        offered = true;
        if (!continueAfterSettled) break;
        extra = true;
        continue;
      }
      break;
    }
    if (settled && extra) {
      if (!usefulLeft.length) break;
      while (at < order.length && !useful.has(order[at])) at++;
      if (at >= order.length) break;
    }

    const id = order[at];
    if (!(id in given)) throw new Error(`scenario has no answer for "${id}"`);
    asked.push(id);
    const fact = ASSERTS[id] ? ASSERTS[id](given[id]) : '';
    if (fact) facts.push(fact);
    at++;
  }

  const fin = await load(factText());
  await query(fin, 'forward_chain.');
  const dec = await query(fin, 'decision(s, A, _).', ['A']);
  const faults = [...new Set((await query(fin, 'fault(s, F, C).', ['F', 'C']))
    .map(r => r.F + '/' + r.C))].sort();

  return { asked, offered, total: order.length,
           action: dec.length ? dec[0].A : '(none)', faults };
}

const JOURNEYS = [
  { name: 'A label mismatch is settled by one question',
    values: { fbs: 310 },
    answers: { label: 'no' },
    expectAsked: ['label'],
    expectAction: 'recollect_urgent' },

  { name: 'A clean glucose is asked everything and released',
    values: { fbs: 94 },
    expectAsked: ['label', 'typed', 'fasting', 'drip', 'look', 'tube_fbs',
                  'delay', 'qc', 'lot', 'cal', 'flag', 'clean'],
    expectAction: 'release' },

  { name: 'An HbA1c alone is never asked about fasting or separation',
    values: { hba1c: 5.3 },
    expectNotAsked: ['fasting', 'delay', 'tube_fbs'],
    expectAsked: ['label', 'typed', 'drip', 'look', 'tube_hba1c', 'method',
                  'qc', 'lot', 'cal', 'flag', 'clean'],
    expectAction: 'release' },

  { name: 'A full panel is asked about both tubes and released',
    values: { fbs: 94, hba1c: 5.3 },
    expectAskedIncludes: ['tube_fbs', 'tube_hba1c', 'method'],
    expectAction: 'release' },

  { name: 'A wrong tube settles before the analyser questions',
    values: { fbs: 61 },
    answers: { tube_fbs: 'plain' },
    expectAsked: ['label', 'typed', 'fasting', 'drip', 'look', 'tube_fbs'],
    expectOffered: true,
    expectAction: 'recollect' },

  { name: 'Accepting the offer asks the analyser questions too',
    values: { fbs: 61 },
    answers: { tube_fbs: 'plain', clean: 'no' },
    continueAfterSettled: true,
    expectAskedIncludes: ['qc', 'lot', 'cal', 'flag', 'clean'],
    expectAction: 'recollect' },

  { name: 'A typing doubt alone is asked everything before it is believed',
    values: { fbs: 94 },
    answers: { typed: 'yes' },
    expectAskedCount: 12,
    expectAction: 'correct_entry' },

  { name: 'A typing doubt beside a haemolysed tube is not a typing fix',
    values: { fbs: 94 },
    answers: { typed: 'yes', look: 'haemolysed' },
    expectAction: 'recollect' },

  { name: 'A failed control re-runs without bleeding the patient again',
    values: { fbs: 61 },
    answers: { qc: 'no' },
    expectAskedIncludes: ['qc'],
    expectOffered: false,
    expectAction: 'rerun_same_sample' },

  { name: 'An impossible glucose reaches the senior',
    values: { fbs: 12 },
    expectAction: 'escalate' },

  { name: 'An HbA1c below the assay floor reaches the senior',
    values: { hba1c: 1.5 },
    expectAction: 'escalate' },

  { name: 'A patient who had not fasted is re-bled and told why',
    values: { fbs: 140 },
    answers: { fasting: 3 },
    expectAction: 'recollect_teach' }
];

async function runJourney(j) {
  const problems = [];
  const r = await consult(j.values, j.answers || {}, j.continueAfterSettled || false);

  if (j.expectAction && r.action !== j.expectAction) {
    problems.push(`action: expected ${j.expectAction} got ${r.action}`);
  }
  if (j.expectAsked) {
    const got = r.asked.join(' > ');
    const want = j.expectAsked.join(' > ');
    if (got !== want) problems.push(`questions asked:\n        expected ${want}\n        got      ${got}`);
  }
  if (j.expectAskedIncludes) {
    for (const q of j.expectAskedIncludes) {
      if (!r.asked.includes(q)) problems.push(`"${q}" should have been asked, was not`);
    }
  }
  if (j.expectNotAsked) {
    for (const q of j.expectNotAsked) {
      if (r.asked.includes(q)) problems.push(`"${q}" should NOT have been asked`);
    }
  }
  if (j.expectAskedCount !== undefined && r.asked.length !== j.expectAskedCount) {
    problems.push(`asked ${r.asked.length} questions, expected ${j.expectAskedCount}`);
  }
  if (j.expectOffered !== undefined && r.offered !== j.expectOffered) {
    problems.push(`offer screen: expected ${j.expectOffered}, got ${r.offered}`);
  }
  return { problems, asked: r.asked.length, total: r.total, action: r.action };
}

// ------------------------------------------------------------------ runner

function query(session, goal, vars) {
  return new Promise((resolve, reject) => {
    const rows = [];
    session.query(goal);
    const next = () => session.answer({
      success: a => {
        if (vars) {
          const row = {};
          vars.forEach(v => {
            const t = a.links[v];
            row[v] = t === undefined ? null : String(t).replace(/^'|'$/g, '');
          });
          rows.push(row);
        } else rows.push(true);
        next();
      },
      fail:  () => resolve(rows),
      // An error is not an empty result set. Resolving here would let a
      // broken rule pass the whole suite by quietly producing no faults.
      error: e => reject(new Error(
        `goal "${goal}" raised ${pl.format_answer(e)}`)),
      limit: () => reject(new Error(
        `goal "${goal}" hit the inference limit - possible loop`))
    });
    next();
  });
}

function load(facts) {
  return new Promise((resolve, reject) => {
    const session = pl.create(400000);
    session.consult(KB + '\n' + facts, {
      success: () => resolve(session),
      error: e => reject(pl.format_answer(e))
    });
  });
}

async function runCase(c) {
  const problems = [];
  const session = await load(c.facts);

  // Forward chaining first - nothing is a fault until the cycle says so.
  await query(session, 'forward_chain.');

  const derived = (await query(session, 'fault(s, F, C).', ['F', 'C']))
    .map(r => r.F + '/' + r.C);
  const uniqueDerived = [...new Set(derived)].sort();
  const expectedFaults = [...(c.faults || [])].sort();
  if (uniqueDerived.join(',') !== expectedFaults.join(',')) {
    problems.push(`faults: expected [${expectedFaults}] got [${uniqueDerived}]`);
  }

  const dec = await query(session, 'decision(s, A, W).', ['A', 'W']);
  const action = dec.length ? dec[0].A : '(none)';
  if (action !== c.action) {
    problems.push(`action: expected ${c.action} got ${action}`);
  }

  // Which rule produced it? A right answer from the wrong rule is still a bug.
  const pr = await query(session, `producing_rule(${action}, R).`, ['R']);
  const rule = pr.length ? pr[0].R : '(no rule recorded)';
  if (c.rule && rule.indexOf(c.rule) === -1) {
    problems.push(`rule: expected one containing "${c.rule}" got "${rule}"`);
  }

  if (c.mentionsMethod) {
    const m = await query(session, 'method_in_use(s, W).', ['W']);
    const text = m.map(r => r.W).join(' | ');
    if (text.indexOf(c.mentionsMethod) === -1) {
      problems.push(`method: expected the reasoning to name "${c.mentionsMethod}", got "${text}"`);
    }
  }

  if (c.noteMentions) {
    const notes = await query(session,
      'fault_note(s, _, T, _, _), test_label(T, TL).', ['TL']);
    const text = notes.map(r => r.TL).join(' | ');
    if (text.toLowerCase().indexOf(c.noteMentions.toLowerCase()) === -1) {
      problems.push(`note: expected it to name "${c.noteMentions}", got "${text}"`);
    }
  }

  if (c.alsoFix) {
    const af = await query(session, 'also_fix(s, W).', ['W']);
    if (!af.length) problems.push('also_fix: expected the machine fault to be carried forward');
  }

  if (c.critical) {
    const cr = await query(session, 'critical(s, T, D).', ['T', 'D']);
    if (!cr.some(r => r.D === c.critical)) {
      problems.push(`critical: expected ${c.critical}`);
    }
  }

  if (c.consistency) {
    const checks = ['accounts_for', 'does_not_account_for', 'direction_unknown',
                    'unrecorded_effect', 'unaccounted'];
    const fired = [];
    for (const k of checks) {
      const arity = k === 'unaccounted' ? 's, T, W' : 's, T, C, W';
      const rows = await query(session, `${k}(${arity}).`);
      if (rows.length) fired.push(k);
    }
    // "probably real" is a positive claim about the patient. It must never
    // coexist with a fault whose effect on this test was never recorded.
    if (fired.includes('unaccounted') && fired.includes('unrecorded_effect')) {
      problems.push('unaccounted fired alongside an unrecorded effect: the ' +
                    'system is treating a gap in the knowledge base as evidence');
    }
    if (c.consistency === 'none') {
      if (fired.length) problems.push(`consistency: expected none, ${fired.join(' and ')} fired`);
    } else if (!fired.includes(c.consistency)) {
      problems.push(`consistency: expected ${c.consistency}, got [${fired}]`);
    }
  }

  if (c.settledAt !== undefined) {
    const s = await query(session, `settled(s, ${c.settledAt}).`);
    if (!s.length) problems.push(`settled/2 should hold against rank ${c.settledAt}`);
  }

  if (c.notSettledAt !== undefined) {
    const s = await query(session, `settled(s, ${c.notSettledAt}).`);
    if (s.length) problems.push(`settled/2 should NOT hold against rank ${c.notSettledAt}`);
  }

  return { name: c.name, expected: c.action, actual: action, rule, problems };
}

(async () => {
  console.log('\nGlucose Result Release Advisor - test suite');
  console.log('='.repeat(78));

  let failed = 0;

  for (const inv of INVARIANTS) {
    let problems;
    try {
      problems = await inv.run();
    } catch (e) {
      problems = [`could not run: ${e}`];
    }
    const ok = problems.length === 0;
    if (!ok) failed++;
    console.log(`\n${ok ? 'pass' : 'FAIL'}  [invariant] ${inv.name}`);
    problems.forEach(p => console.log(`      >>> ${p}`));
  }

  for (const j of JOURNEYS) {
    let r;
    try {
      r = await runJourney(j);
    } catch (e) {
      console.log(`\nFAIL  [consultation] ${j.name}\n      ${e.message}`);
      failed++;
      continue;
    }
    const ok = r.problems.length === 0;
    if (!ok) failed++;
    console.log(`\n${ok ? 'pass' : 'FAIL'}  [consultation] ${j.name}`);
    console.log(`      asked ${r.asked} of ${r.total} questions -> ${r.action}`);
    r.problems.forEach(p => console.log(`      >>> ${p}`));
  }

  for (const c of CASES) {
    let r;
    try {
      r = await runCase(c);
    } catch (e) {
      console.log(`\nFAIL  ${c.name}\n      could not load: ${e}`);
      failed++;
      continue;
    }
    const ok = r.problems.length === 0;
    if (!ok) failed++;
    console.log(`\n${ok ? 'pass' : 'FAIL'}  ${r.name}`);
    console.log(`      expected : ${r.expected}`);
    console.log(`      actual   : ${r.actual}`);
    console.log(`      rule     : ${r.rule.split(' :- ')[0]}`);
    r.problems.forEach(p => console.log(`      >>> ${p}`));
  }

  console.log('\n' + '='.repeat(78));
  const total = CASES.length + INVARIANTS.length + JOURNEYS.length;
  console.log(`${total - failed} of ${total} passed` +
              (failed ? `, ${failed} FAILED` : ''));
  process.exit(failed ? 1 : 0);
})();
