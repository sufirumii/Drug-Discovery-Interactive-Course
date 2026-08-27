/* ===================================================================
 * voice-engine.js  —  Narration engine for the Excelra
 *                     Drug Discovery Interactive Course
 *
 * ENGINE VERSION 5  ("soft-female-consistent")
 *
 * Loaded by index.html (the onboarding guide) and by all eleven
 * Module N.html presentations. It is the SINGLE place that decides
 * who narrates, how she sounds, and how domain terminology is
 * pronounced — so one edit here changes the whole course.
 *
 * WHAT VERSION 5 FIXES
 * --------------------
 * 1. OUTDATED / ROBOTIC VOICE.
 *    v2 ranked "Google UK English Female" first. That voice is a
 *    2012-era concatenative engine: intelligible, but flat, clipped
 *    and noticeably dated — exactly the "old robotic narrator"
 *    complaint. v5 ranks by VOICE GENERATION first: modern neural
 *    voices (Microsoft "Online (Natural)" = Azure neural; Apple
 *    Premium/Enhanced; Google's newer local neural voices) outrank
 *    every legacy voice, on every platform.
 *
 * 2. STALE CACHE PINNING THE OLD VOICE.
 *    The v2 lock lived in localStorage under a key that did not
 *    include the engine version, so a returning learner kept the
 *    voice v2 chose forever — a logic fix alone changed nothing on a
 *    real machine. v5 namespaces every stored key with the engine
 *    version (`...:v5`) and, on first run, actively deletes all known
 *    legacy keys. A new engine version can never inherit an old
 *    decision. Nothing to clear by hand.
 *
 * 3. INCONSISTENCY ACROSS BROWSERS.
 *    Selection is a deterministic SCORE, not a race against whichever
 *    voice finished loading first. The same browser therefore always
 *    reaches the same answer, and different browsers converge on the
 *    closest available equivalent (a warm, neural, female en-US/en-GB
 *    voice) instead of drifting to whatever the OS default happened to
 *    be. Cross-device identity is capped by the Web Speech API itself
 *    — a page cannot install voices — so the goal is "the best soft
 *    female voice this device has, chosen the same way everywhere",
 *    which is achievable, rather than "one identical audio file",
 *    which is not.
 *
 * 4. NARRATION CUTTING OUT MID-SENTENCE.
 *    Chromium silently truncates a single utterance at roughly 15
 *    seconds when using a network voice. Long narration lines were
 *    being clipped. v5 splits every line into sentence-sized chunks
 *    (<= ~180 chars) and speaks them in sequence, so length is
 *    unbounded and each chunk stays well inside the safe window.
 *
 * 5. THE FIXED 30s SAFETY NET RESOLVING EARLY.
 *    A line longer than 30s of audio resolved its promise while still
 *    audible, so the slide advanced and two lines overlapped. The net
 *    is now derived from the text's estimated duration.
 *
 * 6. cancel() -> speak() RACE.
 *    Calling speak() immediately after cancel() drops the utterance in
 *    Chromium. A short settle delay is now inserted.
 *
 * 7. A THROW HERE KILLED EVERY MODULE.
 *    Modules do `const synth = window.presentationVoice.synth`, so if
 *    anything in this file threw (e.g. no speechSynthesis at all), the
 *    export never happened and the whole presentation broke. v5 wraps
 *    initialisation and ALWAYS exports a working API, degrading to
 *    silent-but-correctly-timed playback if speech is unavailable.
 *
 * 8. TERMINOLOGY MISPRONOUNCED.
 *    v2 spaced acronyms letter-by-letter ("F D A"), which several
 *    engines read as words ("fuh-duh-ah") or rushed together. v5 uses
 *    an explicit phonetic respelling lexicon (see LEXICON) covering
 *    the course's acronyms, gene/protein names, and Latin/Greek terms.
 * =================================================================== */
(function () {
  'use strict';

  var ENGINE_VERSION = '5';
  var NS = 'excelraNarrator:v' + ENGINE_VERSION;
  var LOCK_KEY   = NS + ':voiceName';
  var FAILED_KEY = NS + ':brokenVoices';

  /* ── Cache eviction ────────────────────────────────────────────────
   * Every key below was written by an earlier engine. They are removed
   * once, on the first load of this version, so no decision made by an
   * older ranking can survive into this one. Because the live keys are
   * version-namespaced, this also means bumping ENGINE_VERSION is all
   * that is ever needed to force a clean re-pick in future.            */
  var LEGACY_KEYS = [
    'courseNarratorVoiceName',
    'ttsBrokenVoices',
    'courseNarratorVoiceEngineVersion',
    'excelraNarrator:v3:voiceName',
    'excelraNarrator:v3:brokenVoices',
    'excelraNarrator:v4:voiceName',
    'excelraNarrator:v4:brokenVoices',
    'narratorVoice',
    'presentationVoiceName',
    'selectedVoice'
  ];
  var EVICTED_FLAG = NS + ':evicted';

  function ls(op, key, val) {           // storage is optional, never fatal
    try {
      if (op === 'get') return localStorage.getItem(key);
      if (op === 'set') { localStorage.setItem(key, val); return val; }
      if (op === 'del') { localStorage.removeItem(key); }
    } catch (e) {}
    return null;
  }

  (function evictLegacyCache() {
    if (ls('get', EVICTED_FLAG) === '1') return;
    for (var i = 0; i < LEGACY_KEYS.length; i++) ls('del', LEGACY_KEYS[i]);
    // Also sweep any key from a *different* version of this engine.
    try {
      var doomed = [];
      for (var k = 0; k < localStorage.length; k++) {
        var key = localStorage.key(k);
        if (key && key.indexOf('excelraNarrator:v') === 0 && key.indexOf(NS) !== 0) doomed.push(key);
      }
      for (var d = 0; d < doomed.length; d++) ls('del', doomed[d]);
    } catch (e) {}
    ls('set', EVICTED_FLAG, '1');
  })();

  var synth = (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis : null;
  var SUPPORTED = !!(synth && typeof window.SpeechSynthesisUtterance === 'function');

  /* ================================================================
   * 1. VOICE SELECTION
   * ================================================================
   * Scored, not first-match. Highest total score wins; ties break on
   * the platform order the browser reported, which is stable per
   * browser — so the outcome is fully deterministic.
   */

  /* Tier A — modern NEURAL female voices. These are the soft, natural,
   * unhurried voices the course is tuned for. Listed per platform so
   * whichever one a device actually has, it still lands in Tier A.   */
  var NEURAL_FEMALE = [
    // Microsoft Azure neural, exposed by Edge on every desktop OS.
    'aria', 'jenny', 'emma', 'ava', 'michelle', 'sonia', 'libby',
    'natasha', 'clara', 'neerja', 'yan', 'nanami', 'seraphina',
    // Apple's newer high-quality voices (Safari, macOS 13+/iOS 16+).
    'samantha (enhanced)', 'ava (premium)', 'ava (enhanced)',
    'allison (enhanced)', 'susan (enhanced)', 'zoe (premium)',
    'siri female', 'nicky (enhanced)',
    // Google's newer on-device neural voices (Chrome/Android).
    'google us english', 'en-us-x-tpf-local', 'en-us-x-iob-local',
    'en-gb-x-rjs-local'
  ];

  /* Tier B — good, clearly female, but older generation. Used only if
   * nothing in Tier A exists on the device.                          */
  var LEGACY_FEMALE = [
    'samantha', 'allison', 'susan', 'zoe', 'karen', 'moira', 'tessa',
    'fiona', 'serena', 'nicky', 'kate', 'catherine',
    'google uk english female',
    'zira', 'hazel', 'eva', 'heera', 'linda', 'caroline'
  ];

  /* Hard exclusions. Male voices, and Apple's novelty voices, must
   * never narrate — not even as a last resort, unless the device has
   * literally nothing else.                                          */
  var MALE_RE = /\b(alex|daniel|david|fred|george|guy|james|jamie|jorge|juan|mark|oliver|ryan|thomas|tom|rishi|ravi|prabhat|hemant|aaron|arthur|christopher|eddy|gordon|grandpa|liam|male|man|men|reed|rocko|brian|andrew|steffan|roger)\b/i;
  var NOVELTY_RE = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|princess|junior|bruce|agnes|kathy|ralph|shelley|sandy|flo|eddy|grandma|rocko)\b/i;
  var FEMALE_HINT_RE = /\b(female|woman|femme|weiblich)\b/i;
  var NEURAL_HINT_RE = /(natural|neural|premium|enhanced|online)/i;

  function norm(s) { return String(s || '').toLowerCase(); }

  function listMatch(list, name) {
    for (var i = 0; i < list.length; i++) {
      if (name.indexOf(list[i]) !== -1) return list.length - i; // earlier = better
    }
    return 0;
  }

  function scoreVoice(v) {
    var name = norm(v.name);
    var lang = norm(v.lang).replace('_', '-');

    // Disqualifiers -------------------------------------------------
    if (MALE_RE.test(name) && !FEMALE_HINT_RE.test(name)) return -1;
    if (NOVELTY_RE.test(name)) return -1;
    if (lang.indexOf('en') !== 0) return -1;   // narration script is English

    var score = 0;

    // Generation: this is the dominant term, because it is what makes
    // the difference between "soft and natural" and "old and robotic".
    var neural = listMatch(NEURAL_FEMALE, name);
    if (neural) score += 4000 + neural * 10;
    else if (NEURAL_HINT_RE.test(name)) score += 2500;   // unknown but self-described neural
    else {
      var legacy = listMatch(LEGACY_FEMALE, name);
      if (legacy) score += 1200 + legacy * 10;
      else if (FEMALE_HINT_RE.test(name)) score += 700;
      else score += 100;                                 // unknown, un-gendered
    }

    // Explicitly female naming is worth a nudge on top of the tier.
    if (FEMALE_HINT_RE.test(name)) score += 150;

    // Locale: prefer en-US, then en-GB, then any other English, so the
    // pronunciation of the course's terminology stays consistent.
    if (lang === 'en-us') score += 300;
    else if (lang === 'en-gb') score += 240;
    else if (lang.indexOf('en-') === 0) score += 120;
    else score += 60;

    // A remote (server-rendered) voice sounds identical on every OS,
    // which helps cross-device consistency — but only as a tie-break,
    // never enough to outrank a better generation of voice.
    if (v.localService === false) score += 90;

    // Default-flagged voices are the ones the platform vendor considers
    // canonical; a small nudge keeps picks stable.
    if (v.default) score += 25;

    return score;
  }

  function brokenVoices() {
    try { return JSON.parse(ls('get', FAILED_KEY)) || []; } catch (e) { return []; }
  }
  function markBroken(name) {
    if (!name) return;
    var list = brokenVoices();
    if (list.indexOf(name) === -1) {
      list.push(name);
      ls('set', FAILED_KEY, JSON.stringify(list));
    }
    if (ls('get', LOCK_KEY) === name) { ls('del', LOCK_KEY); lockedVoice = null; }
  }

  function pickBest(voices) {
    if (!voices || !voices.length) return null;
    var broken = brokenVoices();
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < voices.length; i++) {
      var v = voices[i];
      if (broken.indexOf(v.name) !== -1) continue;
      var s = scoreVoice(v);
      if (s < 0) continue;
      if (s > bestScore) { bestScore = s; best = v; }
    }
    if (!best) {
      // Absolutely nothing scored — take the first non-broken English
      // voice, then the first non-broken voice, rather than going mute.
      for (var j = 0; j < voices.length; j++) {
        if (broken.indexOf(voices[j].name) !== -1) continue;
        if (norm(voices[j].lang).indexOf('en') === 0) { best = voices[j]; break; }
      }
      if (!best) for (var k = 0; k < voices.length; k++) {
        if (broken.indexOf(voices[k].name) === -1) { best = voices[k]; break; }
      }
    }
    try {
      if (best) console.info('[voice-engine v' + ENGINE_VERSION + '] narrator: "' +
        best.name + '" (' + best.lang + ', score ' + bestScore + ') from ' +
        voices.length + ' voices');
    } catch (e) {}
    return best;
  }

  /* getVoices() is asynchronous in every Chromium browser: the local
   * voices arrive first and the neural/network ones a beat later. We
   * therefore wait for the list to STOP GROWING (two identical reads,
   * 250ms apart) before deciding, up to a ceiling — which is what stops
   * the engine from locking onto a lesser local voice prematurely.   */
  function settledVoiceList(maxWaitMs) {
    return new Promise(function (resolve) {
      if (!SUPPORTED) { resolve([]); return; }
      var deadline = Date.now() + (maxWaitMs || 2500);
      var lastLen = -1, stableReads = 0, done = false;

      function finish() {
        if (done) return;
        done = true;
        try { synth.removeEventListener('voiceschanged', poke); } catch (e) {}
        resolve(synth.getVoices() || []);
      }
      function poke() { /* just wakes the next tick */ }
      try { synth.addEventListener('voiceschanged', poke); } catch (e) {}

      (function tick() {
        if (done) return;
        var list = synth.getVoices() || [];
        if (list.length && list.length === lastLen) {
          if (++stableReads >= 2) return finish();
        } else {
          stableReads = 0;
          lastLen = list.length;
        }
        if (Date.now() >= deadline) return finish();
        setTimeout(tick, 250);
      })();
    });
  }

  var lockedVoice = null;
  var resolving = null;

  function resolveVoice() {
    if (lockedVoice) return Promise.resolve(lockedVoice);
    if (resolving) return resolving;

    resolving = settledVoiceList(2500).then(function (voices) {
      var stored = ls('get', LOCK_KEY);
      var broken = brokenVoices();

      // Reuse the previously locked voice only if it is still present,
      // still not blacklisted, and still passes today's rules (so a
      // voice that a *newer* engine version would reject can never be
      // resurrected from storage).
      if (stored && broken.indexOf(stored) === -1) {
        for (var i = 0; i < voices.length; i++) {
          if (voices[i].name === stored && scoreVoice(voices[i]) >= 0) {
            lockedVoice = voices[i];
            resolving = null;
            return lockedVoice;
          }
        }
      }

      lockedVoice = pickBest(voices);
      if (lockedVoice) ls('set', LOCK_KEY, lockedVoice.name);
      resolving = null;
      return lockedVoice;
    });

    return resolving;
  }

  if (SUPPORTED) {
    try {
      synth.addEventListener('voiceschanged', function () {
        if (!lockedVoice) resolveVoice();
      });
    } catch (e) {}
    resolveVoice();   // warm up so the first line never waits
  }

  /* ================================================================
   * 2. DELIVERY
   * ================================================================
   * Soft, warm, unhurried. Neural voices need far less pitch lift than
   * the old concatenative ones did — v2 used pitch 1.12 to brighten a
   * dull voice, which on a neural voice tips into a thin, artificial
   * timbre. 1.04 keeps the natural warmth and reads as gentle rather
   * than sing-song.
   */
  var DELIVERY = { rate: 0.92, pitch: 1.04, volume: 1 };

  /* ================================================================
   * 3. PRONUNCIATION LEXICON
   * ================================================================
   * SpeechSynthesisUtterance has no SSML and no lexicon hook, so the
   * only lever is respelling the text before it is spoken.
   *
   * Two techniques are used:
   *   • INITIALISMS spelled letter by letter, written as separate
   *     lowercase syllables ("F D A" -> "eff dee ay"). Spacing capital
   *     letters is unreliable: some engines read "F D A" as a word.
   *     Explicit syllables are read correctly by every engine tested.
   *   • ACRONYMS said as words, respelled so stress lands correctly
   *     ("ADMET" -> "ad-met", "CDISC" -> "see-disk").
   *
   * Replacement is case-sensitive and word-bounded, so ordinary prose
   * is untouched ("led" is never confused with "LED").
   */
  var LEXICON = [
    // ── Regulatory & quality ──
    // NOTE ON THE LETTER "A": the obvious respelling "ay" is a real
    // English dictionary word (a variant of "aye") that speech engines
    // pronounce /aɪ/ — which is exactly why "AI" used to come out as
    // "II" and "FDA" as "eff dee eye". A single capital "A" token is
    // read as the letter name /eɪ/ by every engine instead, so all
    // A-containing initialisms below use it.
    ['FDA',      'eff dee A'],
    ['EMA',      'ee em A'],
    ['IND',      'eye en dee'],
    ['NDA',      'en dee A'],
    ['BLA',      'bee ell A'],
    ['CTA',      'see tee A'],
    ['PMDA',     'pee em dee A'],
    ['NMPA',     'en em pee A'],
    ['CFR',      'see eff arr'],
    ['GLP',      'gee ell pee'],
    ['GMP',      'gee em pee'],
    ['GCP',      'gee see pee'],
    ['GxP',      'gee ex pee'],
    ['QA',       'kew A'],
    ['SOP',      'ess oh pee'],
    ['ALCOA',    'AL-koh-ah'],
    ['SEND',     'send'],
    ['IRB',      'eye arr bee'],
    ['ICH',      'eye see aitch'],
    ['CMC',      'see em see'],
    // ── Data standards ──
    ['CDISC',    'see-disk'],
    ['SDTM',     'ess dee tee em'],
    ['ADaM',     'Adam'],        // how practitioners actually say the CDISC analysis model
    ['CDASH',    'see-dash'],
    ['MedDRA',   'MED-druh'],
    ['SOC',      'ess oh see'],
    ['PT',       'pee tee'],
    ['LLT',      'ell ell tee'],
    ['HLGT',     'aitch ell gee tee'],
    ['WHODrug',  'W H O drug'],
    ['HL7',      'aitch ell seven'],
    ['FHIR',     'fire'],
    ['FAIR',     'fair'],
    ['OMOP',     'OH-mop'],
    ['LOINC',    'loink'],
    ['SNOMED',   'SNOH-med'],
    ['ISO',      'eye ess oh'],
    // ── Systems & technology ──
    ['EDC',      'ee dee see'],
    ['ELN',      'ee ell en'],
    ['LIMS',     'limz'],
    ['CTMS',     'see tee em ess'],
    ['SDMS',     'ess dee em ess'],
    ['eCTD',     'ee see tee dee'],
    ['ePRO',     'ee proh'],
    ['ERP',      'ee arr pee'],
    ['API',      'A pee eye'],
    ['ETL',      'ee tee ell'],
    ['SQL',      'sequel'],
    // The client's explicit request: never let the engine attempt "AI"
    // (which it reads as the word "eye" or "II") — always expand it.
    ['AI',       'Artificial Intelligence'],
    ['ML',       'em ell'],
    ['MLOps',    'em ell ops'],
    ['LLM',      'ell ell em'],
    ['GNN',      'gee en en'],
    ['GPU',      'gee pee you'],
    ['SaaS',     'sass'],
    ['RBAC',     'arr-back'],
    ['UI',       'you eye'],
    ['URL',      'you are ell'],
    // ── Science & assays ──
    ['ADMET',    'AD-met'],
    ['ADME',     'AD-mee'],
    ['DMPK',     'dee em pee kay'],
    ['SAR',      'ess A arr'],
    ['QSAR',     'kew-ess-A-arr'],
    ['HTS',      'aitch tee ess'],
    ['uHTS',     'ultra aitch tee ess'],
    ['IC50',     'eye see fifty'],
    ['EC50',     'ee see fifty'],
    ['PCSK9',    'pee see ess kay nine'],
    ['Ki',       'kay eye'],
    ['Kd',       'kay dee'],
    ['PK',       'pee kay'],
    ['PD',       'pee dee'],
    ['MoA',      'em oh A'],
    ['SPR',      'ess pee arr'],
    ['NMR',      'en em arr'],
    ['LC-MS',    'ell see mass spec'],
    ['cryo-EM',  'cry-oh ee em'],
    ['hERG',     'H-erg'],
    ['CYP',      'sip'],
    ['CYP3A4',   'sip three A four'],
    ['P-gp',     'pee glycoprotein'],
    ['BBB',      'bee bee bee'],
    ['CRISPR',   'CRISS-per'],
    ['siRNA',    'ess eye arr en A'],
    ['mRNA',     'em arr en A'],
    ['DNA',      'dee en A'],
    ['RNA',      'arr en A'],
    ['PROTAC',   'PRO-tack'],
    ['PDB',      'pee dee bee'],
    ['GPCR',     'gee pee see arr'],
    ['TPP',      'tee pee pee'],
    ['PoS',      'probability of success'],
    ['NPV',      'en pee vee'],
    ['ROI',      'arr oh eye'],
    ['RWE',      'arr double-you ee'],
    ['RWD',      'arr double-you dee'],
    ['R&D',      'arr and dee'],
    ['CRO',      'see arr oh'],
    ['KOL',      'kay oh ell'],
    ['GOSTAR',   'GO-star'],
    ['GOBIOM',   'GO-bye-om'],
    ['CTOD',     'see tod'],
    ['DiMasi',   'dih-MAH-see'],
    ['AlphaFold','Alpha-Fold'],
    ['in vitro', 'in VEE-troh'],
    ['in vivo',  'in VEE-voh'],
    ['in silico','in SIL-ih-koh'],
    ['de novo',  'day NOH-voh'],
    ['moiety',   'MOY-uh-tee'],
    ['ligand',   'LIG-and'],
    ['assay',    'ASS-say'],      // 'ASS-ay' risked the ay->/aɪ/ reading
    ['analogue', 'ANN-uh-log'],
    ['analog',   'ANN-uh-log'],
    ['pharmacokinetics', 'farma-co-kin-ETT-icks'],
    ['pharmacophore',    'FARMA-co-for'],
    ['cheminformatics',  'kem-informatics'],
    ['lipophilicity',    'lipo-fill-ISS-ity'],
    ['bioavailability',  'bio-availability'],
    ['orthosteric',      'ortho-STAIR-ick'],
    ['allosteric',       'alo-STAIR-ick'],
    ['agonist',   'AG-uh-nist'],
    ['antagonist','an-TAG-uh-nist'],
    ['efficacy',  'EFF-ih-kuh-see'],
    ['excipient', 'ek-SIP-ee-ent'],
    ['epitope',   'EPP-ih-tope'],
    ['isoform',   'EYE-so-form'],
    ['kinase',    'KY-nase'],
    ['protease',  'PRO-tee-ase'],
    ['nucleotide','NEW-clee-oh-tide'],
    ['phenotype', 'FEE-no-type'],
    ['genotype',  'JEE-no-type'],
    ['cohort',    'CO-hort'],
    ['placebo',   'pluh-SEE-bo'],
    ['adverse',   'AD-verse'],
    ['aliquot',   'AL-ih-kwot'],
    ['titre',     'TIE-ter'],
    ['titer',     'TIE-ter']
  ];

  // Longest-first so "CYP3A4" is handled before "CYP", and "in vitro"
  // before "vitro". Built once, at load.
  var LEX_RULES = LEXICON
    .slice()
    .sort(function (a, b) { return b[0].length - a[0].length; })
    .map(function (pair) {
      var term = pair[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // \b does not fire next to '-' or '&', so guard with explicit
      // non-word-ish lookarounds built from character classes that are
      // safe in every browser (no lookbehind — Safari < 16.4).
      // The TRAILING guard allows a hyphen after the term so compounds
      // like "AI-driven" or "FAIR-compliant" are still expanded — the
      // expansion simply becomes "Artificial Intelligence-driven".
      return { re: new RegExp('(^|[^A-Za-z0-9-])' + term + '(?![A-Za-z0-9])', 'g'),
               to: '$1' + pair[1] };
    });

  function preprocessText(text) {
    var out = String(text == null ? '' : text);
    // Normalise typography that engines read aloud awkwardly.
    out = out.replace(/[\u2018\u2019]/g, "'")
             .replace(/[\u201C\u201D]/g, '"')
             .replace(/\u2192/g, ' leads to ')
             .replace(/\s*->\s*/g, ' leads to ')
             .replace(/\u2014/g, ', ')          // em dash -> comma pause
             .replace(/(\d)\s*[\u2013-]\s*(\d)/g, '$1 to $2')  // ranges
             .replace(/\u2013/g, ', ')
             .replace(/&/g, ' and ')
             .replace(/\u00A0/g, ' ');

    // Clinical-phase Roman numerals. Left alone, "Phase III" comes out as
    // "Phase eye-eye-eye" on several engines and "Phase three" on others —
    // the exact inconsistency this course cannot afford, since phases are
    // named in almost every module.
    out = out.replace(/\bPhase\s+IV\b/g,  'Phase four')
             .replace(/\bPhase\s+III\b/g, 'Phase three')
             .replace(/\bPhase\s+II\b/g,  'Phase two')
             .replace(/\bPhase\s+I\b/g,   'Phase one')
             .replace(/\bPhase\s+0\b/g,   'Phase zero');

    // Ranges written across magnitude suffixes or currency symbols
    // ("$100M-$500M", "100K-500K") must become "to" BEFORE the suffixes
    // are expanded, or the hyphen survives into the spoken output.
    out = out.replace(/(\d(?:[.,]\d+)?\s?[KMB%]?)\s*[-\u2013]\s*\$?(\d)/g, '$1 to $2')
             .replace(/[~\u2248]\s*(?=[\d$])/g, 'about ');

    // Magnitude suffixes and currency. Without these, "10.6M+ structures"
    // is read as "ten point six em plus" and "$2.6B" as "dollar two point
    // six bee" — the single most jarring class of mispronunciation in a
    // course full of figures. Order matters: handle the '+' form first.
    out = out.replace(/\$\s?([\d.,]+)\s?([KMB])\b\+?/g, function (m, n, s) {
               var word = s === 'K' ? 'thousand' : (s === 'M' ? 'million' : 'billion');
               return n + ' ' + word + ' dollars' + (/\+/.test(m) ? ' plus' : '');
             })
             .replace(/([\d.,]+)\s?([KMB])\+/g, function (m, n, s) {
               return n + ' ' + (s === 'K' ? 'thousand' : (s === 'M' ? 'million' : 'billion')) + ' plus';
             })
             .replace(/([\d.,]+)\s?([KMB])\b/g, function (m, n, s) {
               return n + ' ' + (s === 'K' ? 'thousand' : (s === 'M' ? 'million' : 'billion'));
             })
             .replace(/\$\s?([\d.,]+)/g, '$1 dollars')
             .replace(/([\d.,]+)\s?%/g, '$1 percent')
             // "PK/PD" and "go/no-go" read better as spoken pauses than as
             // a slash, which some engines vocalise as the word "slash".
             .replace(/([A-Za-z0-9])\/([A-Za-z0-9])/g, '$1 $2');
    for (var i = 0; i < LEX_RULES.length; i++) {
      out = out.replace(LEX_RULES[i].re, LEX_RULES[i].to);
    }

    // ── ALL-CAPS EMPHASIS, not acronyms ──────────────────────────────
    // Slides use full capitals for emphasis ("a TARGET is the biological
    // molecule..."). Many engines spell a capitalised token letter by
    // letter, so those read out as "T-A-R-G-E-T" — which is worse than no
    // emphasis at all. Real acronyms are all handled by the lexicon above
    // and are already lowercase phonetics by this point, so anything still
    // in capitals here with two or more vowels and five or more letters is
    // an ordinary English word being shouted. Those get folded to lower
    // case; genuine short acronyms (DNA, PDB, HTS) are left untouched.
    out = out.replace(/\b[A-Z]{5,}\b/g, function (word) {
      var vowels = word.replace(/[^AEIOU]/g, '').length;
      return vowels >= 2 ? word.charAt(0) + word.slice(1).toLowerCase() : word;
    });

    return out.replace(/\s{2,}/g, ' ').trim();
  }

  /* ================================================================
   * 4. TIMING
   * ================================================================ */
  var WORDS_PER_SEC = 2.45;   // measured for a neural voice at rate 0.92

  function estimateMs(text) {
    var words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    if (!words) return 400;
    return Math.round((words / WORDS_PER_SEC) * 1000) + 900;
  }

  /* ================================================================
   * 5. CHUNKING
   * ================================================================
   * Chromium truncates a single utterance at ~15s with a network voice.
   * Splitting on sentence boundaries (and, for very long sentences, on
   * clause boundaries) keeps every chunk comfortably inside that limit
   * while preserving natural prosody — a chunk always ends where a
   * human would pause anyway.
   */
  var MAX_CHUNK = 180;
  var DOT = '\u0002';   // placeholder for a decimal point during splitting

  function chunkText(text) {
    var t = String(text || '').trim();
    if (!t) return [];
    if (t.length <= MAX_CHUNK) return [t];

    // A '.' between two digits is a decimal point, not a sentence end.
    // Without this guard the splitter cut "2.6 billion dollars" into "2."
    // and "6 billion dollars", which the rejoin then spoke as
    // "two. six billion dollars" — a wrong figure, read aloud, in a course
    // full of figures. Same for version-style numbers such as "21.10".
    var guarded = t.replace(/(\d)\.(\d)/g, '$1' + DOT + '$2');

    var sentences = guarded.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [guarded];
    var chunks = [], buf = '';

    function unguard(x) { return x.split(DOT).join('.'); }
    function flush() { if (buf.trim()) chunks.push(unguard(buf.trim())); buf = ''; }

    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i].trim();
      if (!s) continue;

      if (s.length > MAX_CHUNK) {
        flush();
        // Split an over-long sentence at clause boundaries, then, only
        // if still too long, at the last space before the limit.
        //
        // NOTE: deliberately NOT written as /(?<=[,;:])\s+/. A lookbehind
        // is a *parse-time* SyntaxError in Safari before 16.4, and a
        // literal regex is compiled when the file is parsed — so that one
        // character class would have taken this entire engine offline on
        // older iPads and Macs, silencing the whole course. This does the
        // same job with a marker split that every browser supports.
        var parts = s.replace(/([,;:])\s+/g, '$1\u0001').split('\u0001');
        if (parts.length === 1) parts = [s];      // no clause punctuation
        var sub = '';
        for (var p = 0; p < parts.length; p++) {
          var piece = parts[p];
          while (piece.length > MAX_CHUNK) {
            var cut = piece.lastIndexOf(' ', MAX_CHUNK);
            if (cut < 40) cut = MAX_CHUNK;
            chunks.push(unguard(piece.slice(0, cut).trim()));
            piece = piece.slice(cut).trim();
          }
          if ((sub + ' ' + piece).trim().length > MAX_CHUNK) { if (sub.trim()) chunks.push(unguard(sub.trim())); sub = piece; }
          else sub = (sub ? sub + ' ' : '') + piece;
        }
        if (sub.trim()) chunks.push(unguard(sub.trim()));
        continue;
      }

      if ((buf + ' ' + s).trim().length > MAX_CHUNK) flush();
      buf = (buf ? buf + ' ' : '') + s;
    }
    flush();
    return chunks.length ? chunks : [t];
  }

  /* ================================================================
   * 6. speak()
   * ================================================================
   * Contract kept identical to v2 so no caller needs changing:
   *   speak(text, { muted, fallbackDuration, onUtterance }) -> Promise
   *
   * onUtterance is invoked once per CHUNK, which is what the lip-sync
   * hooks in index.html and each Module N.html already expect (they
   * attach onstart/onboundary listeners to whatever they are handed).
   */
  var hasFailedOverOnce = false;      // at most one voice swap, ever
  var speakSeq = 0;                   // cancels superseded speak() calls

  function speakChunk(chunk, voice, onUtterance) {
    return new Promise(function (resolve) {
      var utter = new SpeechSynthesisUtterance(chunk);
      if (voice) { utter.voice = voice; utter.lang = voice.lang; }
      utter.rate = DELIVERY.rate;
      utter.pitch = DELIVERY.pitch;
      utter.volume = DELIVERY.volume;

      var settled = false, started = false;
      function done(status) {
        if (settled) return;
        settled = true;
        clearTimeout(silenceTimer);
        clearTimeout(hardCap);
        resolve(status);
      }

      utter.onstart    = function () { started = true; };
      utter.onboundary = function () { started = true; };
      utter.onend      = function () { done('ended'); };
      utter.onerror    = function (e) {
        var reason = e && e.error;
        // cancel()/interrupt is ordinary playback control (Pause, Next,
        // Mute, auto-advance) — NOT evidence the voice is broken. v2
        // treated it as breakage and blacklisted working voices.
        if (reason === 'canceled' || reason === 'interrupted') return done('canceled');
        done(started ? 'ended' : 'error');
      };

      // Genuine silent failure: some Mac+Chrome builds accept a network
      // voice and never emit audio or any event at all. 6s of nothing
      // is treated as broken; ordinary network latency is ~1s.
      var silenceTimer = setTimeout(function () {
        if (!started) done('silent');
      }, 6000);

      // Never hang: derived from the text, not a flat 30s.
      var hardCap = setTimeout(function () { done('timeout'); },
                               estimateMs(chunk) * 2 + 8000);

      if (onUtterance) { try { onUtterance(utter); } catch (e) {} }
      try { synth.speak(utter); } catch (e) { done('error'); }
    });
  }

  function speak(rawText, opts) {
    opts = opts || {};
    var mySeq = ++speakSeq;
    var spoken = preprocessText(rawText);

    // Muted, unsupported, or empty: resolve on the caller's timeline so
    // slide pacing stays correct instead of racing ahead in silence.
    if (opts.muted || !SUPPORTED || !spoken) {
      var wait = opts.fallbackDuration;
      if (wait == null) wait = opts.muted ? estimateMs(spoken) : 0;
      return new Promise(function (r) { setTimeout(r, wait); });
    }

    return resolveVoice().then(function (voice) {
      if (mySeq !== speakSeq) return;                 // superseded

      try { synth.cancel(); } catch (e) {}
      // Chromium drops an utterance queued in the same tick as cancel().
      return new Promise(function (r) { setTimeout(r, 90); }).then(function () {
        if (mySeq !== speakSeq) return;

        var chunks = chunkText(spoken);

        function runFrom(i) {
          if (mySeq !== speakSeq) return Promise.resolve();
          if (i >= chunks.length) return Promise.resolve();

          return speakChunk(chunks[i], voice, opts.onUtterance).then(function (status) {
            if (mySeq !== speakSeq) return;
            if (status === 'canceled') return;        // caller took over

            // The chosen voice produced no audio at all. Blacklist it,
            // re-lock to the next best, and replay THIS line from the
            // start so the learner does not lose a sentence. Capped at
            // one swap for the whole course, so there is no cascade.
            if (status === 'silent' && !hasFailedOverOnce && voice) {
              hasFailedOverOnce = true;
              markBroken(voice.name);
              return resolveVoice().then(function (next) {
                if (!next || (voice && next.name === voice.name)) return;
                voice = next;
                return runFrom(0);
              });
            }
            return runFrom(i + 1);
          });
        }
        return runFrom(0);
      });
    })['catch'](function () { /* never reject: playback must continue */ });
  }

  function stop() {
    speakSeq++;
    if (SUPPORTED) { try { synth.cancel(); } catch (e) {} }
  }

  /* ================================================================
   * 7. EXPORT — always defined, even if speech is unavailable, because
   * every module does `window.presentationVoice.synth` at parse time.
   * ================================================================ */
  window.presentationVoice = {
    version: ENGINE_VERSION,
    supported: SUPPORTED,
    synth: synth || { cancel: function () {}, pause: function () {},
                      resume: function () {}, speak: function () {},
                      speaking: false, paused: false },
    getVoice: function () { return lockedVoice; },
    ready: resolveVoice,
    delivery: DELIVERY,
    speak: speak,
    stop: stop,
    estimateMs: estimateMs,
    preprocessText: preprocessText,
    chunkText: chunkText,
    // Escape hatch for support: presentationVoice.reset() then reload.
    reset: function () {
      ls('del', LOCK_KEY); ls('del', FAILED_KEY); ls('del', EVICTED_FLAG);
      lockedVoice = null; hasFailedOverOnce = false;
    }
  };
})();
