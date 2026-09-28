/* ---------------------------------------------------------------------------
   app.js  -  Glucose Result Release Advisor : the interface

   This file makes no decisions. It collects the case, hands it to Tau Prolog,
   and shows what comes back. Every verdict, every question and every reason on
   the screen was produced by a rule in kb.pl.

   The consultation asks one question at a time, in the order kb.pl gives, and
   stops as soon as settled/2 proves that nothing still unasked could change
   the action.

   Prakasan R.  -  224152U
   --------------------------------------------------------------------------- */

(function () {
  'use strict';

  var KB = null;                 // the knowledge base text
  var S = {};                    // the whole state of one consultation

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ------------------------------------------------------------------ Prolog

  // One session per evaluation. The knowledge base asserts as it forward
  // chains, so each run starts from a clean fact base rather than inheriting
  // conclusions from the previous question.
  function run(facts, goals) {
    return new Promise(function (resolve, reject) {
      var session = pl.create(400000);
      session.consult(KB + '\n' + facts, {
        success: function () {
          // Forward chaining first: derive every fault the case supports.
          ask(session, 'forward_chain.')
            .then(function () {
              var out = [], i = 0;
              return (function next() {
                if (i >= goals.length) return Promise.resolve(out);
                var g = goals[i++];
                return ask(session, g.q, g.vars).then(function (rows) {
                  out.push(rows);
                  return next();
                });
              })();
            })
            .then(resolve, reject);
        },
        error: function (e) {
          reject('The knowledge base would not load.\n\n' + pl.format_answer(e));
        }
      });
    });
  }

  // A Prolog error and "no solutions" are different things, and treating them
  // the same is how a broken rule ends up showing "Release the result": the
  // reasoner throws, the interface sees an empty list, and the page reports
  // that no fault was found. Only `fail` means the goal was proved false.
  function ask(session, goal, vars) {
    return new Promise(function (resolve, reject) {
      var rows = [];
      session.query(goal);
      (function next() {
        session.answer({
          success: function (answer) {
            if (vars) {
              var row = {};
              vars.forEach(function (v) {
                var t = answer.links[v];
                row[v] = t === undefined ? null : clean(t.toString());
              });
              rows.push(row);
            } else {
              rows.push(true);
            }
            next();
          },
          fail: function () { resolve(rows); },
          error: function (err) {
            reject('Proving this goal raised an error, so no answer can be\n' +
                   'trusted. Nothing has been released.\n\n' +
                   '  goal:  ' + goal + '\n' +
                   '  error: ' + pl.format_answer(err));
          },
          limit: function () {
            reject('The reasoner ran out of inferences proving this goal.\n' +
                   'The knowledge base may contain a loop.\n\n' +
                   '  goal: ' + goal);
          }
        });
      })();
    });
  }

  function clean(s) {
    if (s.length > 1 && s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") {
      s = s.substring(1, s.length - 1);
    }
    return s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }

  // ------------------------------------------------------- facts for this case

  // How each answer becomes a Prolog fact. The question text, the options and
  // the ordering all live in kb.pl; only this translation lives here.
  var ASSERTS = {
    label:   function (v) { return v === 'no'  ? 'label_mismatch(s).' : ''; },
    typed:   function (v) { return v === 'yes' ? 'transcription_doubt(s).' : ''; },
    drip:    function (v) { return v === 'yes' ? 'drip_arm(s).' : ''; },
    qc:      function (v) { return v === 'no'  ? 'qc_status(s, fbs, out_of_range).' : ''; },
    lot:     function (v) { return v === 'no'  ? 'reagent_lot(s, fbs, expired).' : ''; },
    cal:     function (v) { return v === 'no'  ? 'calibration(s, fbs, overdue).' : ''; },
    clean:   function (v) { return v === 'no'  ? 'instrument_clean(s, no).' : ''; },
    look:    function (v) { return v === 'normal' ? '' : 'sample_state(s, ' + v + ').'; },
    flag:    function (v) { return v === 'none' ? '' : 'analyser_flag(s, ' + v + ').'; },
    // Glucose and HbA1c are always two tubes. One answer must never be
    // applied to both, or whichever test was not asked about is recorded
    // wrong and the panel can never be released.
    tube_fbs:   function (v) { return 'tube(s, fbs, ' + v + ').'; },
    tube_hba1c: function (v) { return 'tube(s, hba1c, ' + v + ').'; },
    method:     function (v) {
                  return v === 'unknown' ? '' : 'hba1c_method(s, ' + v + ').';
                },
    fasting: function (v) { return 'fasting_hours(s, ' + v + ').'; },
    delay:   function (v) { return 'delay_hours(s, ' + v + ').'; }
  };

  function facts() {
    var f = [];
    if (S.vals.fbs !== null)        f.push('value(s, fbs, ' + S.vals.fbs + ').');
    if (S.vals.hba1c !== null)      f.push('value(s, hba1c, ' + S.vals.hba1c + ').');
    if (S.vals.prev_fbs !== null)   f.push('previous_value(s, fbs, ' + S.vals.prev_fbs + ').');
    if (S.vals.prev_hba1c !== null) f.push('previous_value(s, hba1c, ' + S.vals.prev_hba1c + ').');
    Object.keys(S.answers).forEach(function (id) {
      var fact = ASSERTS[id] ? ASSERTS[id](S.answers[id]) : '';
      if (fact) f.push(fact);
    });
    return f.join('\n');
  }

  // ---------------------------------------------------------------- the flow

  function begin() {
    var fbs = num('v_fbs'), hba1c = num('v_hba1c');
    if (fbs === null && hba1c === null) {
      el('startErr').textContent = 'Enter a fasting sugar or an HbA1c to begin.';
      return;
    }
    el('startErr').textContent = '';
    S = {
      vals: { fbs: fbs, hba1c: hba1c,
              prev_fbs: num('v_prev_fbs'), prev_hba1c: num('v_prev_hba1c') },
      answers: {}, order: [], at: 0, extra: false, trace: []
    };
    run(facts(), [{ q: 'askable(I, R, K, Q).', vars: ['I', 'R', 'K', 'Q'] },
                  { q: 'option(I, V, L).',     vars: ['I', 'V', 'L'] },
                  { q: 'unit(I, U).',          vars: ['I', 'U'] },
                  { q: 'relevant(I).',         vars: ['I'] }])
      .then(function (r) {
        S.questions = {};
        r[0].forEach(function (a) {
          S.questions[a.I] = { id: a.I, rank: +a.R, kind: a.K, text: a.Q, opts: [], unit: '' };
        });
        r[1].forEach(function (o) {
          if (S.questions[o.I]) S.questions[o.I].opts.push({ v: o.V, label: o.L });
        });
        r[2].forEach(function (u) {
          if (S.questions[u.I]) S.questions[u.I].unit = u.U;
        });
        // relevant/1 decides what is worth asking for the tests actually
        // requested. An HbA1c alone needs no fasting window and no
        // separation time, so those questions never appear.
        var ok = {};
        r[3].forEach(function (x) { ok[x.I] = true; });
        S.order = Object.keys(S.questions)
          .filter(function (id) { return ok[id]; })
          .sort(function (a, b) {
            return S.questions[a].rank - S.questions[b].rank;
          });
        step();
      })
      .catch(fail);
  }

  function num(id) {
    var v = el(id) && el(id).value.trim();
    if (!v) return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // The heart of the consultation. Before each question, ask Prolog whether
  // the decision is already settled - that is, whether anything still unasked
  // could rank above what we have.
  function step() {
    if (S.at >= S.order.length) return finish();
    var nextRank = S.questions[S.order[S.at]].rank;
    run(facts(), [{ q: 'settled(s, ' + nextRank + ').', vars: null },
                  { q: 'still_useful(Q).',              vars: ['Q'] }])
      .then(function (r) {
        var isSettled = r[0].length > 0;

        // Which of the remaining questions still matter even though the
        // decision is settled? still_useful/1 answers that, not this file.
        var useful = {};
        r[1].forEach(function (x) { useful[x.Q] = true; });
        var usefulLeft = S.order.slice(S.at).filter(function (id) {
          return useful[id];
        });

        if (isSettled && !S.extra) {
          if (usefulLeft.length) return offerExtra();
          return finish();
        }
        if (isSettled && S.extra) {
          if (!usefulLeft.length) return finish();
          while (S.at < S.order.length && !useful[S.order[S.at]]) S.at++;
          if (S.at >= S.order.length) return finish();
        }
        showQuestion(S.questions[S.order[S.at]]);
      })
      .catch(fail);
  }

  function answer(id, value) {
    S.answers[id] = value;
    S.trace.push({ id: id, q: S.questions[id].text, a: shown(id, value) });
    S.at++;
    step();
  }

  function shown(id, value) {
    var q = S.questions[id];
    for (var i = 0; i < q.opts.length; i++) {
      if (q.opts[i].v === value) return q.opts[i].label;
    }
    return value + (q.unit ? ' ' + q.unit : '');
  }

  function back() {
    if (!S.trace.length) return;
    var last = S.trace.pop();
    delete S.answers[last.id];
    S.at = S.order.indexOf(last.id);
    step();
  }

  // -------------------------------------------------------------- the screens

  function screen(html) { el('stage').innerHTML = html; }

  function showQuestion(q) {
    var n = S.trace.length + 1;
    var h = '<div class="step">' +
              '<p class="count">Question ' + n + '</p>' +
              '<h2 class="q">' + esc(q.text) + '</h2>';
    if (q.kind === 'number') {
      h += '<div class="numrow">' +
             '<input type="number" step="0.5" id="numIn" autocomplete="off">' +
             '<span class="unit">' + esc(q.unit) + '</span>' +
             '<button type="button" class="go" id="numGo">Continue</button>' +
           '</div>';
    } else {
      h += '<div class="opts">';
      q.opts.forEach(function (o) {
        h += '<button type="button" class="opt" data-v="' + esc(o.v) + '">' +
               esc(o.label) + '</button>';
      });
      h += '</div>';
    }
    if (S.trace.length) h += '<button type="button" class="back" id="backBtn">Back</button>';
    h += '</div>';
    screen(h);

    if (q.kind === 'number') {
      var input = el('numIn');
      input.focus();
      var send = function () {
        var v = input.value.trim();
        if (v === '' || isNaN(parseFloat(v))) { input.focus(); return; }
        answer(q.id, parseFloat(v));
      };
      el('numGo').onclick = send;
      input.onkeydown = function (e) { if (e.key === 'Enter') send(); };
    } else {
      Array.prototype.forEach.call(document.querySelectorAll('.opt'), function (b) {
        b.onclick = function () { answer(q.id, b.getAttribute('data-v')); };
      });
    }
    if (el('backBtn')) el('backBtn').onclick = back;
  }

  function offerExtra() {
    run(facts(), [{ q: 'decision(s, A, _), action_label(A, L).', vars: ['L'] }])
      .then(function (r) {
        var label = r[0][0] ? r[0][0].L : 'the decision';
        screen(
          '<div class="step">' +
            '<p class="count">Settled</p>' +
            '<h2 class="q">' + esc(label) + '</h2>' +
            '<p class="lede">Nothing still unasked can change that. The questions ' +
              'left cannot alter the decision, but they decide what has to be put ' +
              'right before the fresh sample is run, and what the report can say ' +
              'about this one.</p>' +
            '<div class="opts">' +
              '<button type="button" class="opt" id="goOn">Check the analyser too</button>' +
              '<button type="button" class="opt quiet" id="stopNow">Show the result</button>' +
            '</div>' +
          '</div>');
        el('goOn').onclick = function () { S.extra = true; step(); };
        el('stopNow').onclick = finish;
      })
      .catch(fail);
  }

  var TONE = {
    release: 'ok', release_comment: 'ok', rerun_same_sample: 'rerun',
    recollect: 'fresh', recollect_teach: 'fresh', recollect_urgent: 'urgent',
    correct_entry: 'rerun', escalate: 'urgent'
  };

  function finish() {
    run(facts(), [
      { q: 'decision(s, A, W), action_label(A, L).',                    vars: ['A', 'W', 'L'] },
      { q: 'fault(s, F, C), fault_label(C, CL), family_label(F, FL).',  vars: ['F', 'C', 'CL', 'FL'] },
      { q: 'specimen_intact(s).',                                       vars: null },
      { q: 'also_fix(s, C), fault_label(C, L), also_fix_prefix(P).',    vars: ['C', 'L', 'P'] },
      { q: 'critical(s, T, D), value(s, T, V).',                        vars: ['T', 'D', 'V'] },
      { q: 'accounts_for(s, T, C, W), fault_label(C, CL).',             vars: ['C', 'CL', 'W'] },
      { q: 'does_not_account_for(s, T, C, W), fault_label(C, CL).',     vars: ['C', 'CL', 'W'] },
      { q: 'direction_unknown(s, T, C, W), fault_label(C, CL).',        vars: ['C', 'CL', 'W'] },
      { q: 'unaccounted(s, T, W).',                                     vars: ['W'] },
      { q: 'possible_action(s, A, W), action_label(A, L).',             vars: ['A', 'W', 'L'] },
      { q: 'producing_rule(A, R), decision(s, A, _).',                  vars: ['R'] },
      { q: 'derivation_rule(K, R).',                                    vars: ['K', 'R'] },
      { q: 'boundary(B).',                                              vars: ['B'] },
      { q: 'fault_note(s, C, T, U, P), test_label(T, TL),\n             tube_label(U, UL), tube_label(P, PL).', vars: ['C', 'TL', 'UL', 'PL'] },
      { q: 'unrecorded_effect(s, T, C, W), fault_label(C, CL).',        vars: ['C', 'CL', 'W'] },
      { q: 'stopped_early(W).',                                         vars: ['W'] },
      { q: 'method_in_use(s, N).',                                      vars: ['N'] },
      { q: 'method_not_recorded(s, W).',                                vars: ['W'] }
    ]).then(render).catch(fail);
  }

  function cap(s) {
    s = String(s);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function uniq(rows, key) {
    var seen = {}, out = [];
    rows.forEach(function (r) {
      var k = key(r);
      if (!seen[k]) { seen[k] = 1; out.push(r); }
    });
    return out;
  }

  function render(r) {
    var d = r[0][0];
    var faults = uniq(r[1], function (x) { return x.C; });
    var intact = r[2].length > 0;
    var alsoFix = uniq(r[3], function (x) { return x.C; });
    var crit = uniq(r[4], function (x) { return x.T + x.D; });
    var fits = uniq(r[5], function (x) { return x.C; });
    var clash = uniq(r[6], function (x) { return x.C; });
    var unsure = uniq(r[7], function (x) { return x.C; });
    var real = uniq(r[8], function (x) { return x.W; });
    var others = uniq(r[9], function (x) { return x.A; });
    var rule = r[10][0] ? r[10][0].R : '';
    var derivations = r[11];
    var boundary = r[12][0] ? r[12][0].B : '';
    var notes = {};
    uniq(r[13], function (x) { return x.C + x.TL; }).forEach(function (x) {
      (notes[x.C] = notes[x.C] || [])
        .push(x.TL + ' was drawn into ' + x.UL + ', but it needs ' + x.PL);
    });

    var h = '<div class="verdict ' + (d ? (TONE[d.A] || 'ok') : 'ok') + '">' +
              '<p class="count">The laboratory should</p>' +
              '<h2>' + esc(d ? d.L : 'No decision reached') + '</h2>' +
              '<p class="because">' + esc(d ? cap(d.W) : '') + '</p>' +
            '</div>';

    if (faults.length) {
      h += '<p class="needle">' + (intact
        ? 'The blood in the tube is still good, so the patient does not need to be bled again.'
        : 'Fresh blood is needed. Re-running this tube would only repeat the error.') +
        '</p>';
    }

    if (crit.length) {
      h += '<p class="crit">';
      crit.forEach(function (x) {
        h += (x.T === 'fbs' ? 'Fasting sugar' : 'HbA1c') + ' ' + esc(x.V) +
             ' is critically ' + esc(x.D) + '. Telephone the clinician once the ' +
             'result is confirmed sound. ';
      });
      h += '</p>';
    }

    if (alsoFix.length) {
      h += '<p class="crit">';
      alsoFix.forEach(function (x) { h += esc(x.P + ' ' + x.L) + '. '; });
      h += '</p>';
    }

    // --- the explanation chain, folded away until asked for ---
    h += '<details class="why"><summary>Why</summary><div class="whybody">';

    h += '<h3>User input</h3><ul>';
    if (S.vals.fbs !== null)   h += '<li>Fasting blood sugar <b>' + esc(S.vals.fbs) + '</b> mg/dL</li>';
    if (S.vals.hba1c !== null) h += '<li>HbA1c <b>' + esc(S.vals.hba1c) + '</b> %</li>';
    if (S.vals.prev_fbs !== null)   h += '<li>Last fasting sugar ' + esc(S.vals.prev_fbs) + ' mg/dL</li>';
    if (S.vals.prev_hba1c !== null) h += '<li>Last HbA1c ' + esc(S.vals.prev_hba1c) + ' %</li>';
    S.trace.forEach(function (t) {
      h += '<li>' + esc(t.q) + ' <b>' + esc(t.a) + '</b></li>';
    });
    h += '</ul>';

    var skipped = S.order.length - S.trace.length;
    if (skipped > 0) {
      // The counting is this file's business; the reason is the knowledge
      // base's, and comes back from stopped_early/1.
      var why = r[15][0] ? r[15][0].W : 'the decision was already settled';
      h += '<p class="aside">Asked ' + S.trace.length + ' of ' + S.order.length +
           ' questions. The other ' + skipped + ' were never put, because ' +
           esc(why) + '.</p>';
    }

    h += '<h3>Facts derived</h3>';
    if (faults.length) {
      h += '<ul>';
      faults.forEach(function (x) {
        h += '<li><code>fault(s, ' + esc(x.F) + ', ' + esc(x.C) + ')</code>: ' +
             esc(x.CL);
        (notes[x.C] || []).forEach(function (n) {
          h += '<br><span class="note">' + esc(cap(n)) + '</span>';
        });
        h += '</li>';
      });
      if (!intact) h += '<li><code>specimen_compromised(s)</code></li>';
      h += '</ul>';
    } else {
      h += '<p class="aside">No fault derived. The forward-chaining cycle reached ' +
           'quiescence with nothing to conclude.</p>';
    }

    h += '<h3>Rules applied</h3><ul>';
    derivations.forEach(function (x) { h += '<li><code>' + esc(x.R) + '</code></li>'; });
    if (rule) h += '<li><code>' + esc(rule) + '</code></li>';
    h += '</ul>';

    h += '<h3>Reasoning</h3>';
    var lines = [];
    // The reason is a fact in kb.pl and does not name the fault, so the two
    // are put together here. Joining strings for display is formatting.
    var say = function (x) { return cap(x.CL) + '. ' + cap(x.W); };
    fits.forEach(function (x)   { lines.push(['fits', 'Consistent', say(x)]); });
    clash.forEach(function (x)  { lines.push(['clash', 'Does not fit', say(x)]); });
    unsure.forEach(function (x) { lines.push(['unsure', 'Cannot say', say(x)]); });
    uniq(r[14], function (x) { return x.C; })
      .forEach(function (x) { lines.push(['gap', 'Not recorded', say(x)]); });
    // Whether a fault affects an HbA1c depends on the method, so the method
    // belongs in the reasoning - named when it is known, asked for when not.
    if (r[16][0]) lines.push(['fits', 'Method',
      'The HbA1c was measured by ' + r[16][0].N]);
    if (r[17][0]) lines.push(['gap', 'Method not recorded', r[17][0].W]);
    real.forEach(function (x)   { lines.push(['real', 'Probably real', x.W]); });
    if (lines.length) {
      h += '<ul class="check">';
      lines.forEach(function (l) {
        h += '<li class="' + l[0] + '"><b>' + l[1] + '.</b> ' + esc(cap(l[2])) + '.</li>';
      });
      h += '</ul>';
    }
    if (others.length > 1) {
      h += '<p class="aside">Other actions the rules allowed, all ranked below this one:</p><ul>';
      others.forEach(function (x) {
        if (d && x.A === d.A) return;
        h += '<li>' + esc(x.L) + '. ' + esc(cap(x.W)) + '</li>';
      });
      h += '</ul>';
    }

    h += '<h3>Conclusion</h3><p>' + esc(d ? d.L + '. ' + cap(d.W) : '') + '.</p>';
    h += '<p class="aside">' + esc(boundary) + '</p>';
    h += '</div></details>';

    h += '<button type="button" class="restart" id="again">Start another</button>';

    screen(h);
    el('again').onclick = reset;
  }

  function fail(e) {
    screen('<div class="step"><h2 class="q">The reasoner reported a problem</h2>' +
           '<pre class="err">' + esc(e) + '</pre>' +
           '<button type="button" class="opt" onclick="location.reload()">Start again</button></div>');
  }

  // ------------------------------------------------------------------- start

  function reset() {
    screen(
      '<div class="step">' +
        '<h2 class="q">Enter the result</h2>' +
        '<div class="field"><label for="v_fbs">Fasting blood sugar</label>' +
          '<div class="numrow"><input type="number" step="1" id="v_fbs" autocomplete="off">' +
          '<span class="unit">mg/dL</span></div></div>' +
        '<details class="more"><summary>Add HbA1c or a previous result</summary>' +
          '<div class="field"><label for="v_hba1c">HbA1c</label>' +
            '<div class="numrow"><input type="number" step="0.1" id="v_hba1c">' +
            '<span class="unit">%</span></div></div>' +
          '<div class="field"><label for="v_prev_fbs">Last fasting sugar</label>' +
            '<div class="numrow"><input type="number" step="1" id="v_prev_fbs">' +
            '<span class="unit">mg/dL</span></div></div>' +
          '<div class="field"><label for="v_prev_hba1c">Last HbA1c</label>' +
            '<div class="numrow"><input type="number" step="0.1" id="v_prev_hba1c">' +
            '<span class="unit">%</span></div></div>' +
        '</details>' +
        '<p class="err" id="startErr"></p>' +
        '<button type="button" class="go wide" id="beginBtn">Begin</button>' +
        '<p class="examples">Try &nbsp;' +
          '<a href="#" data-ex="61">61</a> &middot; ' +
          '<a href="#" data-ex="94">94</a> &middot; ' +
          '<a href="#" data-ex="350">350</a> &middot; ' +
          '<a href="#" data-ex="12">12</a>' +
        '</p>' +
      '</div>');
    el('beginBtn').onclick = begin;
    el('v_fbs').focus();
    el('v_fbs').onkeydown = function (e) { if (e.key === 'Enter') begin(); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-ex]'), function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        el('v_fbs').value = a.getAttribute('data-ex');
        begin();
      };
    });
  }

  // The knowledge base, in the order it must be consulted. Nothing in an
  // earlier file depends on a later one. build.py and test/cases.js load the
  // same three files in the same order, and a test checks the lists agree.
  var KB_FILES = ['facts.pl', 'rules.pl', 'decisions.pl'];

  function loadKnowledgeBase() {
    return Promise.all(KB_FILES.map(function (name) {
      return fetch('../kb/' + name).then(function (r) {
        if (!r.ok) throw new Error(name);
        return r.text();
      });
    }))
      .then(function (parts) {
        el('kbsource').textContent = 'kb/*.pl, loaded live';
        return parts.join('\n');
      })
      .catch(function () {
        // Opened straight from the disk: the browser will not read the files,
        // so fall back to the copy build.py embedded in this page.
        el('kbsource').textContent = 'the copy embedded in this page';
        return el('kb').textContent;
      });
  }

  loadKnowledgeBase().then(function (text) { KB = text; reset(); });

})();
