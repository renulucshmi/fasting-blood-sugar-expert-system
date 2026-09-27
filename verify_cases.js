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
  console.log(`${CASES.length - failed} of ${CASES.length} passed` +
              (failed ? `, ${failed} FAILED` : ''));
  process.exit(failed ? 1 : 0);
})();
