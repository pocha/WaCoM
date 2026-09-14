#!/usr/bin/env node
"use strict";

// Expands views/pages/*.html into public/, resolving:
//   <!--#var key="value"-->        page-scoped variables (stripped from output)
//   <!--#include partial="name"--> pulls in views/partials/<name>.html, recursively
//   {{key}}                        substituted from that page's own #var declarations
// No templating engine, no dependencies — same approach as watobot's build-pages.js.

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const PAGES_DIR = path.join(ROOT_DIR, "views", "pages");
const PARTIALS_DIR = path.join(ROOT_DIR, "views", "partials");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

// views/pages/<key> -> public/<value>
const PAGE_MAP = {
  "dashboard.html": "dashboard.html",
  "community-gate-keeping.html": "community/gate-keeping.html",
};

const VAR_RE = /^<!--#var\s+([a-zA-Z0-9_]+)="([^"]*)"-->\n?/;
const INCLUDE_RE = /<!--#include\s+partial="([a-zA-Z0-9_-]+)"-->/g;

function readPartial(name) {
  const file = path.join(PARTIALS_DIR, `${name}.html`);
  if (!fs.existsSync(file)) {
    throw new Error(`Partial not found: ${name} (looked in ${file})`);
  }
  return fs.readFileSync(file, "utf8").replace(/\r?\n$/, "");
}

function resolveIncludes(content, seen) {
  let result = content;
  let guard = 0;
  while (INCLUDE_RE.test(result)) {
    INCLUDE_RE.lastIndex = 0;
    result = result.replace(INCLUDE_RE, (match, name) => {
      if (seen.has(name)) {
        throw new Error(`Circular include detected for partial "${name}"`);
      }
      const nextSeen = new Set(seen);
      nextSeen.add(name);
      return resolveIncludes(readPartial(name), nextSeen);
    });
    guard += 1;
    if (guard > 50) {
      throw new Error("Include resolution did not terminate (possible cycle)");
    }
  }
  return result;
}

function extractVars(content) {
  const vars = {};
  let rest = content;
  let match;
  while ((match = rest.match(VAR_RE))) {
    vars[match[1]] = match[2];
    rest = rest.slice(match[0].length);
  }
  return {vars, rest};
}

function substitutePlaceholders(content, vars) {
  return content.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => (key in vars ? vars[key] : match));
}

function buildPage(pageFile) {
  const srcPath = path.join(PAGES_DIR, pageFile);
  const raw = fs.readFileSync(srcPath, "utf8");
  const {vars, rest} = extractVars(raw);
  const withIncludes = resolveIncludes(rest, new Set());
  const finalHtml = substitutePlaceholders(withIncludes, vars);

  const outRelPath = PAGE_MAP[pageFile];
  if (!outRelPath) {
    throw new Error(`No output mapping for ${pageFile}; add it to PAGE_MAP in build-pages.js`);
  }
  const outPath = path.join(PUBLIC_DIR, outRelPath);
  fs.mkdirSync(path.dirname(outPath), {recursive: true});
  fs.writeFileSync(outPath, finalHtml, "utf8");
  return outRelPath;
}

function main() {
  const written = [];
  for (const pageFile of Object.keys(PAGE_MAP)) {
    const srcPath = path.join(PAGES_DIR, pageFile);
    if (!fs.existsSync(srcPath)) {
      throw new Error(`Missing page template: ${srcPath}`);
    }
    written.push(buildPage(pageFile));
  }
  for (const rel of written) {
    console.log(`built public/${rel}`);
  }
}

main();
