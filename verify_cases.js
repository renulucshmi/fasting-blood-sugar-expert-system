// Runs the six worked cases in the fact sheet through the real knowledge base,
// so the sheet reports what the program does, not what I hope it does.
const fs = require('fs');
// Load the vendored library the way the browser does: no CommonJS `module`,
// so core.js publishes `pl` on the window object and lists.js registers itself.
const vm = require('vm');
const sandbox = { console, setTimeout, clearTimeout, Math, Date, JSON,
                  document: { getElementById: () => null } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('/home/claude/blood/lib/tau-prolog.js', 'utf8'), sandbox);
const pl = sandbox.pl;

const KB = fs.readFileSync('/home/claude/blood/kb.pl', 'utf8');

const CASES = [
  ['1. Sugar 61. Plain tube, sat 4 hours.',
   `value(s,fbs,61). tube(s,fbs,plain). delay_hours(s,4). fasting_hours(s,10).`],
  ['2. Sugar 61. Fluoride tube, 30 min, QC out of range.',
   `value(s,fbs,61). tube(s,fbs,fluoride). delay_hours(s,0). fasting_hours(s,10). qc_status(s,fbs,out_of_range).`],
  ['3. Sugar 94 and HbA1c 5.3. All clean.',
   `value(s,fbs,94). value(s,hba1c,5.3). tube(s,fbs,fluoride). tube(s,hba1c,edta). delay_hours(s,0). fasting_hours(s,10).`],
  ['4. Sugar 310. Label mismatch.',
   `value(s,fbs,310). tube(s,fbs,fluoride). delay_hours(s,0). fasting_hours(s,10). label_mismatch(s).`],
  ['5. Sugar 88, previous 240. Nothing wrong.',
   `value(s,fbs,88). previous_value(s,fbs,240). tube(s,fbs,fluoride). delay_hours(s,0). fasting_hours(s,10).`],
  ['6. Sugar 12. Nothing wrong.',
   `value(s,fbs,12). tube(s,fbs,fluoride). delay_hours(s,0). fasting_hours(s,10).`],
  ['7. QC out of range AND haemolysed (the two-fault question).',
   `value(s,fbs,61). tube(s,fbs,fluoride). delay_hours(s,0). fasting_hours(s,10). qc_status(s,fbs,out_of_range). sample_state(s,haemolysed).`],
];

function ask(session, goal, cb) {
  const out = [];
  session.query(goal);
  const next = () => session.answer({
    success: a => { out.push(pl.format_answer(a)); next(); },
    fail: () => cb(out), error: e => { out.push('ERR ' + pl.format_answer(e)); cb(out); },
    limit: () => cb(out),
  });
  next();
}

let i = 0;
(function run() {
  if (i >= CASES.length) return;
  const [name, facts] = CASES[i++];
  const s = pl.create(100000);
  s.consult(KB + '\n' + facts, {
    success: () => {
      ask(s, 'decision(s,A,W).', d => {
        ask(s, 'fault(s,F,C).', f => {
          ask(s, 'also_fix(s,X).', x => {
            console.log('\n' + name);
            console.log('  faults   : ' + (f.join(' | ') || 'none'));
            console.log('  DECISION : ' + (d.join(' | ') || 'NONE'));
            if (x.length) console.log('  also     : ' + x.join(' | '));
            run();
          });
        });
      });
    },
    error: e => { console.log(name + '  CONSULT ERROR ' + pl.format_answer(e)); run(); },
  });
})();
