// MathJax 3 configuration. Loaded as a classic script before MathJax itself.
// Inline maths uses \( ... \), display maths \[ ... \]. Dollar signs are left alone.
window.__mathReady = new Promise((resolve) => {
  window.MathJax = {
    tex: {
      inlineMath: [["\\(", "\\)"]],
      displayMath: [["\\[", "\\]"]],
      tags: "none",
      macros: {
        kon: "k_{\\mathrm{on}}",
        koff: "k_{\\mathrm{off}}",
        KD: "K_{D}",
        kB: "k_{B}",
        kBT: "k_{B}T",
        tauoff: "\\tau_{\\mathrm{off}}",
        rmd: "\\mathrm{d}",
        avg: ["\\left\\langle #1 \\right\\rangle", 1],
        abs: ["\\left| #1 \\right|", 1],
        Pgen: "P_{\\mathrm{gen}}",
        Ppost: "P_{\\mathrm{post}}",
      },
    },
    options: {
      skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code", "button"],
      ignoreHtmlClass: "no-math",
    },
    chtml: { matchFontHeight: false },
    startup: {
      pageReady() {
        return window.MathJax.startup.defaultPageReady().then(resolve, resolve);
      },
    },
  };
});
