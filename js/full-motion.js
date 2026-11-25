// Full motion for everyone. The site plays every animation whatever the visitor's "reduce motion"
// setting (the team's choice, 2026-11-26). Its code still asks the browser about that setting in
// many places: `matchMedia('(prefers-reduced-motion: reduce)')` in the scripts and
// `@media (prefers-reduced-motion: …)` rules in the stylesheets, the deep dive's included. This
// file, loaded first on every page, makes each of those questions answer "no preference": the
// scripts' matchMedia, and every such @media rule once its stylesheet has loaded. Take its
// <script> tag out of a page to honour the setting there again. See EXPLAINED.md.
(function () {
  'use strict';
  // "Reduce" becomes a condition that is never true, "no preference" one that always is.
  const NEVER = '(max-width: -1px)', ALWAYS = '(min-width: 0px)';
  const rewrite = text => String(text)
    .replace(/\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/gi, NEVER)
    .replace(/\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/gi, ALWAYS)
    .replace(/\(\s*prefers-reduced-motion\s*\)/gi, NEVER);
  const asks = text => /prefers-reduced-motion/i.test(String(text));

  const real = window.matchMedia.bind(window);
  window.matchMedia = query => real(asks(query) ? rewrite(query) : query);

  // The stylesheets' rules, inside @media and @supports blocks too.
  function fixRules(rules) {
    for (const rule of rules) {
      if (rule.media && rule.cssRules && asks(rule.media.mediaText)) rule.media.mediaText = rewrite(rule.media.mediaText);
      if (rule.cssRules) fixRules(rule.cssRules);
    }
  }
  function fixSheets() {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }    // another site's sheet (the fonts)
      fixRules(rules);
    }
  }
  fixSheets();
  // Each stylesheet as it arrives (a link's load doesn't bubble, so it is caught on the way down).
  document.addEventListener('load', event => { if (event.target.tagName === 'LINK') fixSheets(); }, true);
  document.addEventListener('DOMContentLoaded', fixSheets);
  window.addEventListener('load', fixSheets);
})();
