// Every paper with notes on this site. To add one, create docs/papers/<id>/ (tools/new_paper.py does it)
// and add its import below. The order here is the order of the paper menu and the home page.
import quantitativeImmunology from "./quantitative-immunology/paper.js";
import wellAdaptedImmuneSystem from "./well-adapted-immune-system/paper.js";

export const PAPERS = [quantitativeImmunology, wellAdaptedImmuneSystem];

export const findPaper = (id) => PAPERS.find((p) => p.id === id);

/** Link to a page of the paper's PDF. */
export const pdfPage = (paper, page) => `${paper.pdf}#page=${page}`;
