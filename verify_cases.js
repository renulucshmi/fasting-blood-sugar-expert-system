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
vm.runInContext(fs.readFileSync(__dirname + '/lib/tau-prolog.js', 'utf8'), sandbox);
const pl = sandbox.pl;

const KB = fs.readFileSync(__dirname + '/kb.pl', 'utf8');

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

  { name: 'Consistency: a label mismatch blocks "probably real"',
    facts: `value(s,fbs,310). ${CLEAN} label_mismatch(s).`,
    action: 'recollect_urgent',
    rule:   'label_mismatch',
    faults: ['identity/label_mismatch'],
    consistency: 'none' },

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

// ------------------------------------------------------------------ runner

function query(session, goal, vars) {
  return new Promise(resolve => {
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
      error: () => resolve(rows),
      limit: () => resolve(rows)
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

  if (c.noteMentions) {
    const notes = await query(session, 'fault_note(s, _, N).', ['N']);
    const text = notes.map(r => r.N).join(' | ');
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
    const checks = ['accounts_for', 'does_not_account_for', 'direction_unknown', 'unaccounted'];
    const fired = [];
    for (const k of checks) {
      const arity = k === 'unaccounted' ? 's, T, W' : 's, T, C, W';
      const rows = await query(session, `${k}(${arity}).`);
      if (rows.length) fired.push(k);
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
  const total = CASES.length + INVARIANTS.length;
  console.log(`${total - failed} of ${total} passed` +
              (failed ? `, ${failed} FAILED` : ''));
  process.exit(failed ? 1 : 0);
})();
