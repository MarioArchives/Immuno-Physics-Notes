// One paper's notes: its metadata and its sections, in reading order.
// Page numbers are pages of the PDF linked below, so "Paper, page N" links open it at the right place.

export default {
  id: "well-adapted-immune-system",
  title: "How a well-adapted immune system is organized",
  short: "A well-adapted immune system",
  authors: "Andreas Mayer, Vijay Balasubramanian, Thierry Mora and Aleksandra M. Walczak",
  year: 2015,
  journal: "PNAS 112, 5950–5955 (2015)",
  abs: "https://doi.org/10.1073/pnas.1421827112",
  pdf: "https://arxiv.org/pdf/1407.6888v1",
  doi: "https://doi.org/10.1073/pnas.1421827112",
  summary: "What receptor repertoire minimizes the expected cost of infections from a known mix of pathogens, why cross-reactivity breaks it into a sparse set of clones, and how competition for antigens can reach it.",
  // The paper's sections are not numbered; page links open the arXiv preprint, which is free to read.
  numbered: false,
  pdfName: "preprint",
  chapters: [
    {
      n: "1", slug: "01-introduction", title: "Introduction", page: 1,
      blurb: "What a receptor repertoire has to do, the few general features the theory keeps, and what it predicts.",
    },
    {
      n: "2", slug: "02-cost-of-infection", title: "The cost of an infection", page: 2,
      blurb: "Coverage, the random time to first recognition, and the expected harm that a repertoire should minimize.",
    },
    {
      n: "3", slug: "03-flatter-than-the-threats", title: "More uniform than the threats", page: 3,
      blurb: "Without cross-reactivity the optimum has a closed form: receptors scale as a power of threat below one, with cutoffs for costs that saturate.",
    },
    {
      n: "4", slug: "04-cross-reactivity", title: "Cross-reactivity and sparse repertoires", page: 4,
      blurb: "Cross-reactivity collapses the optimum onto a few well-spaced clones that tile shape space, so two people can be equally protected by different receptors.",
    },
    {
      n: "5", slug: "05-competition", title: "Reaching the optimum by competition", page: 6,
      blurb: "Clones that proliferate on antigen and compete for it settle on the optimal repertoire, with the expected cost as a Lyapunov function.",
    },
    {
      n: "6", slug: "06-discussion", title: "Discussion", page: 7,
      blurb: "Testing the predictions, sensory systems that face the same coverage problem, ecological competition, and bacterial CRISPR immunity.",
    },
  ],
};
