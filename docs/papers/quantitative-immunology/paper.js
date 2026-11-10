// One paper's notes: its metadata and its sections, in reading order.
// Page numbers are pages of the PDF linked below, so "Paper, page N" links open it at the right place.
// Register the paper in docs/papers/papers.js.

export default {
  id: "quantitative-immunology",
  title: "Quantitative Immunology for Physicists",
  short: "Quantitative Immunology for Physicists",
  authors: "Grégoire Altan-Bonnet, Thierry Mora and Aleksandra M. Walczak",
  year: 2020,
  journal: "Physics Reports 849, 1–83 (2020)",
  abs: "https://arxiv.org/abs/1907.03891",
  pdf: "https://arxiv.org/pdf/1907.03891v2",
  doi: "https://doi.org/10.1016/j.physrep.2020.01.001",
  summary: "A review of how physics enters immunology, from the rates of single binding events to the co-evolution of viruses and host populations.",
  chapters: [
  {
    n: "I", slug: "01-introduction", title: "Introduction", page: 2,
    blurb: "Why an enemy that is unknown and evolving forces statistical defenses across many scales, and how clonal selection frames adaptive immunity.",
  },
  {
    n: "II", slug: "02-physical-chemistry", title: "Physical chemistry of ligand–receptor interaction", page: 4,
    blurb: "The speed limit on molecular binding, what an energy barrier costs, and how one receptor can recognize many antigens.",
  },
  {
    n: "III", slug: "03-antigen-discrimination", title: "Antigen discrimination", page: 9,
    blurb: "How T cells tell agonists from near-identical look-alikes: kinetic proofreading, adaptive feedback, synapse mechanics, B cell strategies and model reduction.",
  },
  {
    n: "IV", slug: "04-cytokines", title: "Cell-to-cell communication through cytokines", page: 14,
    blurb: "Cytokine signaling as binding equilibria, and how secretion, diffusion and consumption set a screening length that sizes signaling niches.",
  },
  {
    n: "V", slug: "05-cell-fate", title: "Cell fate", page: 20,
    blurb: "Toggle-switch gene circuits behind helper T cell fates, the slow clockwork of blood production, and lymphocytes that time division against death.",
  },
  {
    n: "VI", slug: "06-repertoires", title: "Repertoires", page: 29,
    blurb: "How big a repertoire is and must be, how V(D)J recombination becomes a generation probability, and what that predicts about diversity, clone sizes and chance sharing.",
  },
  {
    n: "VII", slug: "07-lymphocyte-population-dynamics", title: "Lymphocyte population dynamics", page: 37,
    blurb: "Neutral birth–death models of clones, why memory repertoires need antigen-driven expansions, and a model of HIV decay under therapy.",
  },
  {
    n: "VIII", slug: "08-affinity-maturation", title: "Affinity maturation", page: 41,
    blurb: "Germinal centers as evolution on fast-forward: context-dependent hypermutation, selection neither too harsh nor too lenient, and broadly neutralizing antibodies.",
  },
  {
    n: "IX", slug: "09-pathogens-and-hosts", title: "Population dynamics of pathogens and hosts", page: 46,
    blurb: "A simulation of a virus population evolving ahead of host immunity, to use alongside the paper's own text.",
  },
  {
    n: "X", slug: "10-discussion", title: "Discussion", page: 49,
    blurb: "What the review leaves out, why, and where to go next.",
  },
  ],
};
