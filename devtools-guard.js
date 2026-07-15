/*
 * DevTools deterrent for the Drug Discovery Course.
 *
 * IMPORTANT — set expectations correctly: this is a deterrent, not a
 * security boundary. Client-side JavaScript can never fully block
 * DevTools or console access; a determined user can always disable
 * JavaScript, use a browser flag, or edit the page before this script
 * runs. What this does is stop the casual, one-click ways a learner
 * might poke at the course: right-click → Inspect, F12, Ctrl+Shift+I,
 * view-source. These are exact, reliable blocks — no guessing involved.
 *
 * Note: an earlier version of this script also tried to *detect*
 * DevTools already being open, by comparing window.outerWidth/Height
 * to innerWidth/Height. That heuristic isn't reliable across every
 * browser/OS/zoom combination — it can misfire and get stuck showing
 * a warning even when DevTools is closed — so it's been removed here.
 * Better to block the entry points cleanly than to guess at open state
 * and risk blocking a learner from their own course.
 */
(function () {
    'use strict';

    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });

    document.addEventListener('keydown', function (e) {
        var key = (e.key || '').toUpperCase();

        // F12
        if (key === 'F12') { e.preventDefault(); return; }

        // Ctrl/Cmd+Shift+I / J / C  (Inspect / Console / Element picker)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'I' || key === 'J' || key === 'C')) {
            e.preventDefault();
            return;
        }

        // Ctrl/Cmd+U (view-source)
        if ((e.ctrlKey || e.metaKey) && key === 'U') {
            e.preventDefault();
            return;
        }
    });
})();
