/**
 * Converts MathML to Office Math Markup Language (OMML) for Microsoft Word (.docx).
 * LibreOffice, Google Docs, Apple Pages, and MS Word all natively parse OMML.
 */

export const OMML_NAMESPACE =
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ';

const NARY = /^[∑∏∐∫-∳⋀-⋃⨀-⨆⨉⨌-⨑]$/;
const INTEGRAL = /^[∫-∳⨌-⨑]$/;

const ACCENTS: Record<string, string> = {
  "^": "̂",
  "ˆ": "̂",
  "~": "̃",
  "˜": "̃",
  "→": "⃗",
  "⃗": "⃗",
  "˙": "̇",
  ".": "̇",
  "¨": "̈",
  "´": "́",
  "`": "̀",
  "ˋ": "̀",
  "ˇ": "̌",
  "˘": "̆",
};

const INVISIBLE = /[⁡-⁤]/g;

function xmlText(text: string): string {
  return text
    .replace(INVISIBLE, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const MATH_FONT =
  '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>';

function run(text: string, style?: "p" | "b" | "bi" | "i", plain = false): string {
  const clean = xmlText(text);
  if (!clean) return "";

  const properties = plain
    ? "<m:rPr><m:nor/></m:rPr>"
    : style
      ? `<m:rPr><m:sty m:val="${style}"/></m:rPr>`
      : "";

  return `<m:r>${properties}${MATH_FONT}<m:t xml:space="preserve">${clean}</m:t></m:r>`;
}

function elements(node: Element): Element[] {
  return Array.from(node.children);
}

function tag(node: Element): string {
  return node.localName.toLowerCase();
}

function textOf(node: Element): string {
  return (node.textContent ?? "").replace(INVISIBLE, "").trim();
}

function argument(name: string, node: Element | undefined): string {
  return `<m:${name}>${node ? convert(node) : ""}</m:${name}>`;
}

function nary(
  symbol: string,
  lower: Element | undefined,
  upper: Element | undefined,
  body: Element | undefined,
  limitsBelow: boolean,
): string {
  const properties = [
    `<m:chr m:val="${xmlText(symbol)}"/>`,
    `<m:limLoc m:val="${limitsBelow && !INTEGRAL.test(symbol) ? "undOvr" : "subSup"}"/>`,
    ...(lower ? [] : ['<m:subHide m:val="1"/>']),
    ...(upper ? [] : ['<m:supHide m:val="1"/>']),
  ].join("");

  return (
    `<m:nary><m:naryPr>${properties}</m:naryPr>` +
    argument("sub", lower) +
    argument("sup", upper) +
    argument("e", body) +
    "</m:nary>"
  );
}

function fraction(num: Element | undefined, den: Element | undefined): string {
  return `<m:f><m:fPr/><m:num>${num ? convert(num) : ""}</m:num><m:den>${den ? convert(den) : ""}</m:den></m:f>`;
}

function rad(degree: Element | undefined, base: Element | undefined): string {
  return degree
    ? `<m:rad><m:radPr/><m:deg>${convert(degree)}</m:deg><m:e>${base ? convert(base) : ""}</m:e></m:rad>`
    : `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:e>${base ? convert(base) : ""}</m:e></m:rad>`;
}

function delimiter(openChar: string, closeChar: string, body: string): string {
  return (
    `<m:d><m:dPr><m:begChr m:val="${xmlText(openChar)}"/><m:endChr m:val="${xmlText(closeChar)}"/><m:grow m:val="1"/></m:dPr>` +
    `<m:e>${body}</m:e></m:d>`
  );
}

export function convert(node: Element): string {
  const t = tag(node);

  if (t === "math" || t === "mrow") {
    return elements(node).map(convert).join("");
  }

  if (t === "mi") {
    const text = textOf(node);
    const style = [...text].length > 1 ? "p" : undefined;
    return run(text, style);
  }

  if (t === "mn") {
    return run(textOf(node), "p");
  }

  if (t === "mo") {
    const text = textOf(node);
    if (NARY.test(text)) {
      return run(text);
    }
    return run(text, "p");
  }

  if (t === "mtext") {
    return run(textOf(node), "p", true);
  }

  if (t === "mfrac") {
    const children = elements(node);
    return fraction(children[0], children[1]);
  }

  if (t === "msqrt") {
    return rad(undefined, elements(node)[0]);
  }

  if (t === "mroot") {
    const children = elements(node);
    return rad(children[1], children[0]);
  }

  if (t === "msup") {
    const children = elements(node);
    return `<m:sSup><m:sSupPr/><m:e>${children[0] ? convert(children[0]) : ""}</m:e><m:sup>${children[1] ? convert(children[1]) : ""}</m:sup></m:sSup>`;
  }

  if (t === "msub") {
    const children = elements(node);
    return `<m:sSub><m:sSubPr/><m:e>${children[0] ? convert(children[0]) : ""}</m:e><m:sub>${children[1] ? convert(children[1]) : ""}</m:sub></m:sSub>`;
  }

  if (t === "msubsup") {
    const children = elements(node);
    return (
      `<m:sSubSup><m:sSubSupPr/>` +
      `<m:e>${children[0] ? convert(children[0]) : ""}</m:e>` +
      `<m:sub>${children[1] ? convert(children[1]) : ""}</m:sub>` +
      `<m:sup>${children[2] ? convert(children[2]) : ""}</m:sup>` +
      `</m:sSubSup>`
    );
  }

  if (t === "mtable") {
    const rows = elements(node).filter((c) => tag(c) === "mtr");
    const ommlRows = rows
      .map((row) => {
        const cells = elements(row).filter((c) => tag(c) === "mtd");
        return `<m:mr>${cells.map((c) => `<m:e>${convert(c)}</m:e>`).join("")}</m:mr>`;
      })
      .join("");
    return `<m:m><m:mPr/>${ommlRows}</m:m>`;
  }

  if (t === "mfenced") {
    const open = node.getAttribute("open") ?? "(";
    const close = node.getAttribute("close") ?? ")";
    const body = elements(node).map(convert).join("");
    return delimiter(open, close, body);
  }

  return elements(node).map(convert).join("");
}

export function mathMlToOmml(mathMlString: string): string | null {
  try {
    if (typeof DOMParser === "undefined") {
      return null;
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(mathMlString, "application/xml");
    const root = doc.querySelector("math");
    if (!root) return null;
    const inner = convert(root);
    return `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${inner}</m:oMath>`;
  } catch {
    return null;
  }
}
