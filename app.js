/* ===========================================================================
   app.js  -  Glucose Result Release Advisor
   Interface layer only. Every decision is made by Prolog in kb.pl; this file
   collects the form, hands it to Tau Prolog, and renders the answer.
   =========================================================================== */

(function () {
  'use strict';

  var el = function (id) { return document.getElementById(id); };
  var KB = '';

  // ------------------------------------------------------------------ form

  var FORM = [
    { group: 'The result', cls: 'res', fields: [
      { id: 'fbs',      label: 'Fasting blood sugar', kind: 'num', unit: 'mg/dL', step: '1' },
      { id: 'prev_fbs', label: 'Patient’s last fasting sugar', kind: 'num', unit: 'mg/dL', step: '1',
        hint: 'optional — used for the delta check' },
      { id: 'hba1c',      label: 'HbA1c', kind: 'num', unit: '%', step: '0.1' },
      { id: 'prev_hba1c', label: 'Patient’s last HbA1c', kind: 'num', unit: '%', step: '0.1',
        hint: 'optional' }
    ]},
    { group: 'The run — machine and reagent', cls: 'mach', fields: [
      { id: 'qc', label: 'Quality control for this run', kind: 'sel',
        opts: [['in_range', 'In range'], ['out_of_range', 'Out of range'], ['not_checked', 'Not checked']] },
      { id: 'lot', label: 'Reagent lot', kind: 'sel',
        opts: [['current', 'Current'], ['expired', 'Past its expiry'], ['unknown', 'Not sure']] },
      { id: 'cal', label: 'Calibration', kind: 'sel',
        opts: [['current', 'Current'], ['overdue', 'Overdue, or not redone after maintenance']] },
      { id: 'flag', label: 'Analyser flag', kind: 'sel',
        opts: [['none', 'None'], ['probe_clot', 'Probe clot'], ['carryover', 'Carryover']] },
      { id: 'clean', label: 'Analyser cleaned as scheduled', kind: 'yn', yes: 'Yes', no: 'No' }
    ]},
    { group: 'The specimen', cls: 'samp', fields: [
      { id: 'appearance', label: 'How the sample looks', kind: 'sel',
        opts: [['ok', 'Normal'], ['haemolysed', 'Haemolysed'], ['clotted', 'Clotted'], ['lipaemic', 'Lipaemic']] },
      { id: 'tube', label: 'Tube used for the glucose', kind: 'sel',
        opts: [['fluoride', 'Fluoride oxalate'], ['plain', 'Plain'], ['edta', 'EDTA']] },
      { id: 'delay', label: 'Hours before the plasma was separated', kind: 'num', unit: 'hours', step: '0.5' }
    ]},
    { group: 'How it was collected', cls: 'coll', fields: [
      { id: 'fasting', label: 'Hours the patient fasted', kind: 'num', unit: 'hours', step: '1' },
      { id: 'drip', label: 'Drawn from the drip arm', kind: 'yn', yes: 'Yes', no: 'No', invert: true }
    ]},
    { group: 'Identification and entry', cls: 'ident', fields: [
      { id: 'label', label: 'Label matches the request form', kind: 'yn', yes: 'Yes', no: 'No' },
      { id: 'typed', label: 'Any doubt about what was typed in', kind: 'yn', yes: 'Yes', no: 'No', invert: true }
    ]},
    { group: 'Has it been repeated?', cls: 'rep', fields: [
      { id: 'repeated', label: 'Already repeated', kind: 'yn', yes: 'Yes', no: 'No', invert: true },
      { id: 'agrees', label: 'The repeat gave the same answer', kind: 'yn', yes: 'Yes', no: 'No', invert: true }
    ]}
  ];

  var DEFAULTS = {
    qc: 'in_range', lot: 'current', cal: 'current', flag: 'none', clean: 'yes',
    appearance: 'ok', tube: 'fluoride', delay: '0.5', fasting: '9',
    drip: 'no', label: 'yes', typed: 'no', repeated: 'no', agrees: 'no'
  };

  var EXAMPLES = {
    ex1: { name: 'sat 4 hours', vals: { fbs: '61', delay: '4', tube: 'plain' } },
    ex2: { name: 'QC out', vals: { fbs: '61', qc: 'out_of_range' } },
    ex3: { name: 'clean', vals: { fbs: '94', hba1c: '5.3' } }
  };

  function buildForm() {
    var html = '';
    FORM.forEach(function (g) {
      html += '<fieldset class="panel ' + g.cls + '"><legend>' + g.group + '</legend><div class="grid">';
      g.fields.forEach(function (f) {
        html += '<div class="cell"><label for="f_' + f.id + '">' + f.label + '</label>';
        if (f.kind === 'num') {
          html += '<div class="inputrow">' +
                    '<input type="number" step="' + f.step + '" id="f_' + f.id + '">' +
                    '<span class="unit">' + f.unit + '</span></div>';
        } else if (f.kind === 'sel') {
          html += '<select id="f_' + f.id + '">';
          f.opts.forEach(function (o) {
            html += '<option value="' + o[0] + '">' + o[1] + '</option>';
          });
          html += '</select>';
        } else {
          html += '<div class="radios">' +
            '<label class="check"><input type="radio" name="f_' + f.id + '" value="yes"> ' + f.yes + '</label>' +
            '<label class="check"><input type="radio" name="f_' + f.id + '" value="no"> ' + f.no + '</label>' +
            '</div>';
        }
        if (f.hint) html += '<p class="hint">' + f.hint + '</p>';
        html += '</div>';
      });
      html += '</div></fieldset>';
    });
    el('formArea').innerHTML = html;
  }

  function setField(id, v) {
    var node = el('f_' + id);
    if (node) { node.value = v; return; }
    var radio = document.querySelector('input[name="f_' + id + '"][value="' + v + '"]');
    if (radio) radio.checked = true;
  }

  function getField(id) {
    var node = el('f_' + id);
    if (node) return node.value.trim();
    var checked = document.querySelector('input[name="f_' + id + '"]:checked');
    return checked ? checked.value : '';
  }

  function resetForm() {
    FORM.forEach(function (g) {
      g.fields.forEach(function (f) {
        setField(f.id, DEFAULTS[f.id] === undefined ? '' : DEFAULTS[f.id]);
      });
    });
  }

  function loadExample(key) {
    resetForm();
    var ex = EXAMPLES[key];
    Object.keys(ex.vals).forEach(function (k) { setField(k, ex.vals[k]); });
  }

  // ------------------------------------------------------------ case facts

  function num(id) {
    var raw = getField(id);
    if (raw === '') return null;
    var n = parseFloat(raw);
    return isNaN(n) ? null : n;
  }

  function fmt(n) { return (n % 1 === 0) ? n.toFixed(1) : String(n); }

  function collectFacts() {
    var L = [];
    var fbs = num('fbs'), hba1c = num('hba1c');

    if (fbs !== null) L.push('value(s, fbs, ' + fmt(fbs) + ').');
    if (hba1c !== null) L.push('value(s, hba1c, ' + fmt(hba1c) + ').');
    if (num('prev_fbs') !== null) L.push('previous_value(s, fbs, ' + fmt(num('prev_fbs')) + ').');
    if (num('prev_hba1c') !== null) L.push('previous_value(s, hba1c, ' + fmt(num('prev_hba1c')) + ').');

    var tests = [];
    if (fbs !== null) tests.push('fbs');
    if (hba1c !== null) tests.push('hba1c');

    tests.forEach(function (t) {
      L.push('qc_status(s, ' + t + ', ' + getField('qc') + ').');
      L.push('reagent_lot(s, ' + t + ', ' + getField('lot') + ').');
      L.push('calibration(s, ' + t + ', ' + getField('cal') + ').');
    });

    if (getField('flag') !== 'none') L.push('analyser_flag(s, ' + getField('flag') + ').');
    if (getField('clean') === 'no') L.push('instrument_clean(s, no).');

    if (getField('appearance') !== 'ok') L.push('sample_state(s, ' + getField('appearance') + ').');
    if (fbs !== null) L.push('tube(s, fbs, ' + getField('tube') + ').');
    if (hba1c !== null) L.push('tube(s, hba1c, edta).');
    if (num('delay') !== null) L.push('delay_hours(s, ' + fmt(num('delay')) + ').');
    if (num('fasting') !== null) L.push('fasting_hours(s, ' + fmt(num('fasting')) + ').');

    if (getField('drip') === 'yes') L.push('drip_arm(s).');
    if (getField('label') === 'no') L.push('label_mismatch(s).');
    if (getField('typed') === 'yes') L.push('transcription_doubt(s).');

    if (getField('repeated') === 'yes' && tests.length) {
      L.push('repeat_done(s, ' + tests[0] + ').');
      if (getField('agrees') === 'yes') L.push('repeat_agrees(s, ' + tests[0] + ').');
    }

    return { text: L.join('\n'), count: tests.length };
  }

  // --------------------------------------------------------------- Prolog

  function solve(facts, goal, vars) {
    return new Promise(function (resolve, reject) {
      var session = pl.create(200000);
      session.consult(KB + '\n' + facts + '\n', {
        success: function () {
          session.query(goal, {
            success: function () {
              var rows = [];
              session.answers(function (a) {
                if (a === false || a === null) { resolve(rows); return; }
                if (pl.type.is_error(a)) { reject(a.toString()); return; }
                var row = {};
                vars.forEach(function (v) {
                  var t = a.lookup(v);
                  row[v] = (t === null) ? null : unq(t.toString());
                });
                rows.push(row);
              }, 400);
            },
            error: function (e) { reject('query: ' + e.toString()); }
          });
        },
        error: function (e) { reject('consult: ' + e.toString()); }
      });
    });
  }

  function unq(s) {
    if (s.length > 1 && s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") {
      return s.slice(1, -1).replace(/\\'/g, "'");
    }
    return s;
  }

  function dedupe(rows, key) {
    var seen = {}, out = [];
    rows.forEach(function (r) { var k = key(r); if (!seen[k]) { seen[k] = true; out.push(r); } });
    return out;
  }

  // ------------------------------------------------------------- running

  function run() {
    var f = collectFacts();
    if (f.count === 0) {
      el('result').innerHTML = '<div class="panel empty"><h2>Nothing entered yet</h2>' +
        '<p>Enter a fasting sugar or an HbA1c, or load one of the examples above.</p></div>';
      return;
    }
    el('result').innerHTML = '<div class="panel"><p class="thinking">Reasoning…</p></div>';
    var F = f.text;

    Promise.all([
      solve(F, "decision(s, A, Why), action_label(A, Label).", ['A', 'Why', 'Label']),
      solve(F, "fault(s, Fam, C), fault_label(C, CL), family_label(Fam, FL).", ['Fam', 'C', 'CL', 'FL']),
      solve(F, "direction(s, T, C, D, Why), fault_label(C, CL).", ['T', 'C', 'D', 'Why', 'CL']),
      solve(F, "also_fix(s, Why).", ['Why']),
      solve(F, "critical(s, T, D), value(s, T, V).", ['T', 'D', 'V']),
      solve(F, "specimen_intact(s).", []),
      solve(F, "boundary(B).", ['B']),
      solve(F, "possible_action(s, A, Why), action_label(A, Label).", ['A', 'Why', 'Label'])
    ]).then(function (r) {
      render({
        decision:  r[0][0] || null,
        faults:    dedupe(r[1], function (x) { return x.C; }),
        directions: dedupe(r[2], function (x) { return x.C + x.T; }),
        alsoFix:   dedupe(r[3], function (x) { return x.Why; }),
        criticals: dedupe(r[4], function (x) { return x.T + x.D; }),
        intact:    r[5].length > 0,
        boundary:  r[6][0] ? r[6][0].B : '',
        others:    dedupe(r[7], function (x) { return x.A; })
      });
    }).catch(function (e) {
      el('result').innerHTML = '<div class="panel bad"><h2>The reasoner reported a problem</h2>' +
        '<pre>' + String(e) + '</pre></div>';
    });
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var TONE = {
    release: 'good', release_comment: 'good',
    rerun_same_sample: 'rerun',
    recollect: 'recollect', recollect_teach: 'recollect',
    recollect_urgent: 'urgent', correct_entry: 'rerun', escalate: 'urgent'
  };

  function render(r) {
    var h = '';

    if (r.decision) {
      var tone = TONE[r.decision.A] || 'good';
      h += '<section class="verdict ' + tone + '">' +
             '<p class="verdict-kicker">The laboratory should</p>' +
             '<h2>' + esc(r.decision.Label) + '</h2>' +
             '<p class="verdict-why">' + esc(r.decision.Why) + '</p>' +
           '</section>';
    }

    // the sentence the whole system exists to produce
    if (r.faults.length) {
      h += '<section class="panel needle ' + (r.intact ? 'keep' : 'fresh') + '">' +
             '<p>' + (r.intact
               ? '<b>The blood in the tube is still good.</b> The fault is with the analyser, so the patient does not need to be bled again.'
               : '<b>Fresh blood is needed.</b> The specimen or the way it was collected is at fault, so re-running this tube would only repeat the error.') +
             '</p></section>';
    }

    if (r.criticals.length) {
      h += '<section class="panel critical"><h3>Telephone the clinician</h3><ul>';
      r.criticals.forEach(function (x) {
        h += '<li><b>' + esc(x.T === 'fbs' ? 'Fasting sugar' : 'HbA1c') + ' ' + esc(x.V) + '</b> — critically ' + esc(x.D) +
             '. Once the result is confirmed sound.</li>';
      });
      h += '</ul></section>';
    }

    if (r.faults.length) {
      var byFam = {};
      r.faults.forEach(function (x) { (byFam[x.FL] = byFam[x.FL] || []).push(x); });
      h += '<section class="panel faults"><h3>What was found</h3>';
      Object.keys(byFam).forEach(function (fam) {
        h += '<p class="famline"><span class="fampill">' + esc(fam) + '</span></p><ul>';
        byFam[fam].forEach(function (x) { h += '<li>' + esc(x.CL) + '</li>'; });
        h += '</ul>';
      });
      h += '</section>';
    } else {
      h += '<section class="panel faults"><h3>What was found</h3>' +
           '<p class="ok">No fault found in the run, the specimen, the collection or the entry.</p></section>';
    }

    if (r.directions.length) {
      h += '<section class="panel push"><h3>Which way the result was pushed</h3><ul>';
      r.directions.forEach(function (x) {
        var word = x.D === 'unclear' ? 'in an unknown direction' : ('too ' + (x.D === 'high' ? 'high' : 'low'));
        h += '<li><b>' + esc(x.CL) + '</b> pushes the ' +
             esc(x.T === 'fbs' ? 'sugar' : 'HbA1c') + ' <b>' + word + '</b> — ' + esc(x.Why) + '.</li>';
      });
      h += '</ul></section>';
    }

    if (r.alsoFix.length) {
      h += '<section class="panel alsofix"><h3>Do not forget</h3><ul>';
      r.alsoFix.forEach(function (x) { h += '<li>' + esc(x.Why) + '.</li>'; });
      h += '</ul></section>';
    }

    if (r.others.length > 1) {
      h += '<section class="panel others"><h3>Other actions the rules allowed</h3>' +
           '<p class="muted-note">Ranked below the one chosen. Shown so the decision can be checked.</p><ul>';
      r.others.forEach(function (x) {
        if (r.decision && x.A === r.decision.A) return;
        h += '<li><b>' + esc(x.Label) + '</b> — ' + esc(x.Why) + '</li>';
      });
      h += '</ul></section>';
    }

    h += '<section class="panel referral"><p>' + esc(r.boundary) + '</p></section>';

    el('result').innerHTML = h;
    el('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------- start

  function loadKnowledgeBase() {
    return fetch('kb.pl')
      .then(function (r) { if (!r.ok) throw new Error('status'); return r.text(); })
      .then(function (t) { el('kbsource').textContent = 'kb.pl, loaded live'; return t; })
      .catch(function () { el('kbsource').textContent = 'embedded copy of kb.pl'; return el('kb').textContent; });
  }

  function init() {
    buildForm();
    resetForm();
    loadExample('ex1');

    el('runBtn').addEventListener('click', run);
    el('clearBtn').addEventListener('click', function () { resetForm(); });
    el('ex1').addEventListener('click', function () { loadExample('ex1'); run(); });
    el('ex2').addEventListener('click', function () { loadExample('ex2'); run(); });
    el('ex3').addEventListener('click', function () { loadExample('ex3'); run(); });

    loadKnowledgeBase().then(function (t) { KB = t; run(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
