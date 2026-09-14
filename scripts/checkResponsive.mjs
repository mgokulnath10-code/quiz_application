#!/usr/bin/env node
/**
 * Responsive-invariant check for the CSS source in src/styles/.
 *
 * IMPORTANT: this reads the CSS *source text*. It does not render a page,
 * so it cannot measure a layout, a viewport, or a computed width. It
 * asserts the structural rules this responsive pass establishes, so that a
 * later edit cannot silently reintroduce the overflow bugs that were fixed
 * by hand. Every check is described in the PASS/FAIL line it prints.
 *
 * Dependency-free: node:fs + node:path only.
 *
 * Exit code 0 when every check passes, 1 when any check fails.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const stylesDir = join(here, "..", "src", "styles");

/* ------------------------------------------------------------------
   The one breakpoint scale the stylesheets are allowed to use. 720 is
   pre-existing in Navbar.css and kept so the tablet range does not
   change; the pass adds 900 and 420.
------------------------------------------------------------------ */

const ALLOWED_BREAKPOINTS = [900, 720, 640, 420];

/* A grid track floor at or above this must be capped with min(100%, …). */
const GRID_FLOOR_LIMIT = 300;

/* A fixed width/min-width at or above this is a layout column, not an
   icon or a decorative box, so it must be overflow-guarded. */
const COLUMN_LIMIT = 200;

/* ------------------------------------------------------------------
   Parsing
------------------------------------------------------------------ */

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function parseDeclarations(body) {
  const decls = new Map();

  // A body containing a brace is a nested rule set or at-rule body, not a
  // declaration list.
  if (body.includes("{")) return decls;

  for (const chunk of body.split(";")) {
    const colon = chunk.indexOf(":");
    if (colon === -1) continue;

    const prop = chunk.slice(0, colon).trim().toLowerCase();
    const value = chunk.slice(colon + 1).trim();

    if (prop) decls.set(prop, value);
  }

  return decls;
}

function walk(block, media, out) {
  let i = 0;

  while (i < block.length) {
    const open = block.indexOf("{", i);
    if (open === -1) break;

    const raw = block.slice(i, open);

    // Drop any brace-less at-rule that came before this prelude
    // (@import, @charset).
    const semi = raw.lastIndexOf(";");
    const prelude = (semi === -1 ? raw : raw.slice(semi + 1)).trim();

    let depth = 1;
    let j = open + 1;

    while (j < block.length && depth > 0) {
      if (block[j] === "{") depth += 1;
      else if (block[j] === "}") depth -= 1;
      j += 1;
    }

    const body = block.slice(open + 1, j - 1);

    if (/^@media\b/i.test(prelude)) {
      walk(body, prelude.replace(/^@media\b/i, "").trim(), out);
    } else if (/^@(keyframes|font-face|supports|layer|property|page)\b/i.test(prelude)) {
      // Not a layout rule set; nothing to inspect.
    } else if (prelude) {
      out.push({ selector: prelude, decls: parseDeclarations(body), media });
    }

    i = j;
  }
}

function parseRules(source) {
  const rules = [];
  walk(stripComments(source), null, rules);
  return rules;
}

/* ------------------------------------------------------------------
   Selector helpers
------------------------------------------------------------------ */

function selectorParts(selector) {
  return selector
    .split(",")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function tokensOf(selector) {
  return (selector.match(/[.#]?[A-Za-z_][\w-]*/g) || []).map((t) =>
    t.toLowerCase()
  );
}

/* True when every class/tag token in `guard` also appears in `target`,
   i.e. the guard selector also applies to the element the target selects
   (".quiz-result-card" guards ".quiz-result-card.quiz-result-wide"). */
function guardCovers(guard, target) {
  const targetTokens = new Set(tokensOf(target));
  const guardTokens = tokensOf(guard);

  return guardTokens.length > 0 && guardTokens.every((t) => targetTokens.has(t));
}

function isHundredPercent(value) {
  return /^100%(;)?$/.test((value || "").trim());
}

function pxValue(value) {
  const match = /^([0-9.]+)px$/.exec((value || "").trim());

  return match ? Number(match[1]) : null;
}

/* ------------------------------------------------------------------
   Load the stylesheets
------------------------------------------------------------------ */

const files = readdirSync(stylesDir)
  .filter((name) => name.endsWith(".css"))
  .sort();

const byFile = new Map();

for (const file of files) {
  const source = readFileSync(join(stylesDir, file), "utf8");

  byFile.set(file, parseRules(source));
}

const allRules = [];

for (const [file, rules] of byFile) {
  for (const rule of rules) allRules.push({ file, ...rule });
}

/* ------------------------------------------------------------------
   The checks. Each returns an array of violation strings.
------------------------------------------------------------------ */

const checks = [
  {
    name: "grid-floor",
    description:
      `no bare minmax(Npx, …) floor at or above ${GRID_FLOOR_LIMIT}px ` +
      "(must be min(100%, Npx) so a narrow container collapses instead of overflowing)",
    run() {
      const out = [];

      for (const { file, selector, decls } of allRules) {
        const columns = decls.get("grid-template-columns");
        if (!columns) continue;

        for (const match of columns.matchAll(/minmax\(\s*([0-9.]+)px/g)) {
          const floor = Number(match[1]);

          if (floor >= GRID_FLOOR_LIMIT) {
            out.push(
              `${file}: ${selector} — minmax(${floor}px, …) needs the ` +
                `min(100%, ${floor}px) form`
            );
          }
        }
      }

      return out;
    },
  },
  {
    name: "row-wrap",
    description:
      "every display:flex space-between row declares flex-wrap:wrap or has a mobile rule",
    run() {
      const out = [];

      for (const { file, selector, decls } of allRules) {
        const display = (decls.get("display") || "").trim();

        if (!/^(inline-)?flex$/.test(display)) continue;

        if (!(decls.get("justify-content") || "").includes("space-between")) {
          continue;
        }

        if ((decls.get("flex-wrap") || "").includes("wrap")) continue;

        const hasMobileRule = byFile
          .get(file)
          .some(
            (rule) =>
              rule.media &&
              selectorParts(rule.selector).includes(selector.trim())
          );

        if (!hasMobileRule) {
          out.push(
            `${file}: ${selector} — space-between row with neither ` +
              "flex-wrap: wrap nor a media-query rule"
          );
        }
      }

      return out;
    },
  },
  {
    name: "width-guard",
    description:
      `every fixed width of ${COLUMN_LIMIT}px or more is paired with max-width: 100%`,
    run() {
      const out = [];

      for (const { file, selector, decls } of allRules) {
        const width = pxValue(decls.get("width"));

        if (width === null || width < COLUMN_LIMIT) continue;

        if (isHundredPercent(decls.get("max-width"))) continue;

        const guarded = byFile.get(file).some((rule) => {
          if (!isHundredPercent(rule.decls.get("max-width"))) return false;

          return selectorParts(rule.selector).some((part) =>
            selectorParts(selector).every((own) => guardCovers(part, own))
          );
        });

        if (!guarded) {
          out.push(
            `${file}: ${selector} — width: ${width}px with no ` +
              "max-width: 100% guard"
          );
        }
      }

      return out;
    },
  },
  {
    name: "min-width-guard",
    description:
      `every min-width of ${COLUMN_LIMIT}px or more uses the min(Npx, 100%) form`,
    run() {
      const out = [];

      for (const { file, selector, decls } of allRules) {
        const minWidth = pxValue(decls.get("min-width"));

        if (minWidth === null || minWidth < COLUMN_LIMIT) continue;

        out.push(
          `${file}: ${selector} — min-width: ${minWidth}px can force a ` +
            `narrow row wide; use min(${minWidth}px, 100%)`
        );
      }

      return out;
    },
  },
  {
    name: "no-symptom-hiding",
    description:
      "no overflow-x: hidden (or shorthand) on html/body/#root/:root/*",
    run() {
      const out = [];
      const banned = /^(html|body|:root|#root|\*)$/;

      for (const { file, selector, decls } of allRules) {
        const parts = selectorParts(selector).map((p) => p.toLowerCase());

        if (!parts.some((p) => banned.test(p))) continue;

        const value = `${decls.get("overflow-x") || ""} ${
          decls.get("overflow") || ""
        }`;

        if (value.includes("hidden")) {
          out.push(
            `${file}: ${selector} — clipping the page hides the overflow ` +
              "instead of fixing it"
          );
        }
      }

      return out;
    },
  },
  {
    name: "nav-quiz-mobile-coverage",
    description:
      ".navbar-inner, .quiz-topbar and .quiz-footer each have a mobile rule",
    run() {
      const required = [
        ["Navbar.css", ".navbar-inner"],
        ["Quiz.css", ".quiz-topbar"],
        ["Quiz.css", ".quiz-footer"],
      ];

      const out = [];

      for (const [file, selector] of required) {
        const rules = byFile.get(file) || [];

        const covered = rules.some(
          (rule) =>
            rule.media && selectorParts(rule.selector).includes(selector)
        );

        if (!covered) {
          out.push(`${file}: ${selector} has no media-query rule`);
        }
      }

      return out;
    },
  },
  {
    name: "stylesheet-breakpoints",
    description:
      "every stylesheet that lays out a horizontal flex row has a media query",
    run() {
      const out = [];

      for (const [file, rules] of byFile) {
        const hasHorizontalRow = rules.some((rule) => {
          const display = (rule.decls.get("display") || "").trim();

          if (!/^(inline-)?flex$/.test(display)) return false;

          const direction = (rule.decls.get("flex-direction") || "row").trim();

          return direction === "row" || direction === "row-reverse";
        });

        if (!hasHorizontalRow) continue;

        if (!rules.some((rule) => rule.media)) {
          out.push(
            `${file} lays out a flex row but has no media query at all`
          );
        }
      }

      return out;
    },
  },
  {
    name: "breakpoint-scale",
    description: `only these breakpoints are used: ${ALLOWED_BREAKPOINTS.join(", ")}`,
    run() {
      const out = [];

      for (const { file, selector, media } of allRules) {
        if (!media) continue;

        if (/min-width/i.test(media)) {
          out.push(`${file}: ${selector} — ${media} is not a max-width step`);
          continue;
        }

        const widths = [...media.matchAll(/max-width:\s*([0-9.]+)px/g)].map(
          (m) => Number(m[1])
        );

        if (widths.length === 0) {
          out.push(`${file}: ${selector} — unreadable media query ${media}`);
          continue;
        }

        for (const width of widths) {
          if (!ALLOWED_BREAKPOINTS.includes(width)) {
            out.push(
              `${file}: ${selector} — ad-hoc breakpoint ${width}px is not ` +
                `in {${ALLOWED_BREAKPOINTS.join(", ")}}`
            );
          }
        }
      }

      return out;
    },
  },
  {
    name: "long-text-wrapping",
    description:
      ".badge has a wrapping override and .data-table td may break long tokens",
    run() {
      const out = [];

      const badgeWrap = allRules.some(({ selector, decls }) => {
        const targetsBadge = selectorParts(selector).some((part) =>
          tokensOf(part).includes(".badge")
        );

        return (
          targetsBadge && (decls.get("white-space") || "").includes("normal")
        );
      });

      if (!badgeWrap) {
        out.push(
          "no rule gives .badge white-space: normal for the rows that " +
            "render database/user text"
        );
      }

      const cellWrap = allRules.some(({ selector, decls }) => {
        const targetsCell = selectorParts(selector).some(
          (part) => part === ".data-table td"
        );

        return (
          targetsCell &&
          Boolean(decls.get("overflow-wrap") || decls.get("word-break"))
        );
      });

      if (!cellWrap) {
        out.push(
          ".data-table td has no overflow-wrap rule for dynamic cell text"
        );
      }

      return out;
    },
  },
  {
    name: "touch-target",
    description:
      "a mobile rule gives .btn a min-height of at least 44px (.btn-sm carries .btn too)",
    run() {
      const out = [];

      const bumped = allRules.some(({ media, selector, decls }) => {
        if (!media) return false;

        const targetsBtn = selectorParts(selector).some((part) =>
          tokensOf(part).includes(".btn")
        );

        if (!targetsBtn) return false;

        const minHeight = pxValue(decls.get("min-height"));

        return minHeight !== null && minHeight >= 44;
      });

      if (!bumped) {
        out.push(
          "no media-query rule raises .btn (and therefore .btn-sm) to a " +
            "44px touch target"
        );
      }

      return out;
    },
  },
];

/* ------------------------------------------------------------------
   Run
------------------------------------------------------------------ */

let failed = 0;

console.log(
  "Responsive-invariant check — CSS source only, NOT a rendered layout."
);
console.log(`Stylesheets read: ${files.join(", ")}`);
console.log("");

for (const check of checks) {
  const violations = check.run();

  if (violations.length === 0) {
    console.log(`PASS  ${check.name.padEnd(26)} ${check.description}`);
    continue;
  }

  failed += 1;

  console.log(
    `FAIL  ${check.name.padEnd(26)} ${check.description} ` +
      `(${violations.length} violation${violations.length === 1 ? "" : "s"})`
  );

  for (const violation of violations) console.log(`        - ${violation}`);
}

console.log("");

if (failed > 0) {
  console.log(`${failed} of ${checks.length} checks FAILED.`);
  process.exit(1);
}

console.log(`All ${checks.length} checks passed.`);
