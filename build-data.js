#!/usr/bin/env node
/**
 * Fetches MSC metadata from GitHub and writes js/msc-data.js
 * Run: node build-data.js
 *
 * Uses `gh auth token` if available for higher rate limits.
 */

import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DELAY_MS = 50;
const LOCAL_REPO = process.env.MSP_REPO ?? '/tmp/msp-clone';
const SITE_URL = (process.env.SITE_URL ?? 'https://litruv.github.io/matrixSpecExplorer').replace(/\/$/, '');

const STATUS_LABELS = {
  merged: 'Merged / Approved',
  'spec-pr-review': 'Spec PR in review',
  'spec-pr-missing': 'Spec PR missing',
  'fcp-complete': 'FCP complete',
  fcp: 'Final comment period',
  'proposed-fcp': 'Proposed FCP',
  'in-review': 'In review',
  draft: 'Draft',
  placeholder: 'Placeholder',
  postponed: 'Postponed',
  abandoned: 'Abandoned',
  obsolete: 'Obsolete',
  closed: 'Closed / Rejected',
  unknown: 'Unknown',
};

const PROCESS_LABELS = new Set([
  'merged', 'proposal', 'proposal-in-review', 'proposal-placeholder',
  'proposal-postponed', 'proposal-pr', 'proposed-final-comment-period',
  'final-comment-period', 'finished-final-comment-period',
  'spec-pr-missing', 'spec-pr-in-review', 'disposition-merge',
  'disposition-close', 'disposition-postpone', 'abandoned', 'obsolete',
  'rejected', 'needs-implementation', 'implementation-needs-checking',
  'blocked', 'unresolved-concerns', 'action-required',
]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getGhToken() {
  if (process.env.MSP_GITHUB_TOKEN) return process.env.MSP_GITHUB_TOKEN;
  try {
    return execSync('gh auth token', { encoding: 'utf8' }).trim();
  } catch {
    return process.env.GITHUB_TOKEN ?? null;
  }
}

let cachedGhHeaders = null;

function ghHeaders() {
  if (!cachedGhHeaders) {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'matrixSpecExplorer' };
    const token = getGhToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    cachedGhHeaders = headers;
  }
  return cachedGhHeaders;
}

async function githubFetch(url, options = {}, retries = 3) {
  const res = await fetch(url, { ...options, headers: { ...ghHeaders(), ...options.headers } });

  if ((res.status === 403 || res.status === 429) && retries > 0) {
    const body = await res.text();
    const isRateLimit = /rate limit/i.test(body);
    if (isRateLimit) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
      const reset = parseInt(res.headers.get('x-ratelimit-reset') || '0', 10);
      const waitMs = retryAfter > 0
        ? retryAfter * 1000
        : Math.max(0, reset * 1000 - Date.now()) + 1000;
      const capped = Math.min(waitMs, 5 * 60 * 1000);
      console.warn(`Rate limited (${res.status}), waiting ${Math.ceil(capped / 1000)}s…`);
      await sleep(capped);
      return githubFetch(url, options, retries - 1);
    }
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }

  return res;
}

function parseTitle(raw) {
  const wip = /^\[WIP\]\s*/i.test(raw);
  const cleaned = raw.replace(/^\[WIP\]\s*/i, '').trim();
  const match = cleaned.match(/^MSC(\d+):\s*(.+)$/i);
  if (match) {
    return { number: parseInt(match[1], 10), title: match[2].trim(), wip };
  }
  return { number: null, title: cleaned, wip };
}

function parseBodyMeta(body) {
  const text = body ?? '';
  const authorMatch = text.match(/^Author:\s*@(\w[\w-]*)/im);
  const shepherdMatch = text.match(/^Shepherd:\s*@(\w[\w-]*)/im);
  const dateMatch = text.match(/^Date:\s*(\d{4}-\d{2}-\d{2})/im);
  const renderedMatch = text.match(/\[Rendered\]\((https:\/\/github\.com\/[^)]+)\)/i);
  return {
    author: authorMatch?.[1] ?? null,
    shepherd: shepherdMatch?.[1] ?? null,
    date: dateMatch?.[1] ?? null,
    renderedUrl: renderedMatch?.[1] ?? null,
  };
}

function parseDependencies(text = '') {
  const deps = new Set();
  const depSection = text.match(/##\s*Dependencies[\s\S]*?(?=\n##\s|\n$)/i);
  const scope = depSection ? depSection[0] : text;
  for (const match of scope.matchAll(/MSC(\d+)/gi)) {
    deps.add(parseInt(match[1], 10));
  }
  return [...deps].sort((a, b) => a - b);
}

function deriveStatus(item) {
  const labels = item.labels.map((l) => l.name);
  const merged = item.pull_request?.merged_at;

  if (labels.includes('merged') || merged) return 'merged';
  if (labels.includes('proposal-postponed') || labels.includes('disposition-postpone')) return 'postponed';
  if (labels.includes('abandoned')) return 'abandoned';
  if (labels.includes('obsolete')) return 'obsolete';
  if (labels.includes('rejected') || labels.includes('disposition-close')) return 'closed';
  if (labels.includes('final-comment-period')) return 'fcp';
  if (labels.includes('proposed-final-comment-period')) return 'proposed-fcp';
  if (labels.includes('finished-final-comment-period')) return 'fcp-complete';
  if (labels.includes('spec-pr-in-review')) return 'spec-pr-review';
  if (labels.includes('spec-pr-missing')) return 'spec-pr-missing';
  if (item.draft) return 'draft';
  if (labels.includes('proposal-placeholder')) return 'placeholder';
  if (labels.includes('proposal-in-review') || labels.includes('proposal')) return 'in-review';
  return 'unknown';
}

function categorizeLabels(labels) {
  const area = [];
  const kind = [];
  const type = [];
  const milestone = [];
  const process = [];
  const other = [];

  for (const name of labels) {
    if (name.startsWith('A-')) area.push(name.slice(2));
    else if (name.startsWith('kind:')) kind.push(name.slice(5));
    else if (name.startsWith('T-')) type.push(name.slice(2));
    else if (name.startsWith('M-') || name === 'matrix-2.0') milestone.push(name);
    else if (PROCESS_LABELS.has(name)) process.push(name);
    else other.push(name);
  }

  return { area, kind, type, milestone, process, other };
}

async function fetchIssuesForState(state) {
  const all = [];
  let url = `https://api.github.com/repos/matrix-org/matrix-spec-proposals/issues?labels=proposal&state=${state}&per_page=100&sort=updated&direction=desc`;

  while (url) {
    const res = await githubFetch(url);
    const batch = await res.json();
    all.push(...batch);
    console.log(`  ${state}: ${all.length}`);

    const link = res.headers.get('link');
    url = null;
    if (link) {
      const next = link.split(',').find((part) => part.includes('rel="next"'));
      if (next) url = next.match(/<([^>]+)>/)?.[1] ?? null;
    }

    await sleep(DELAY_MS);
  }

  return all;
}

async function fetchAllIssues() {
  const open = await fetchIssuesForState('open');
  const closed = await fetchIssuesForState('closed');
  const byNumber = new Map();
  for (const item of [...open, ...closed]) byNumber.set(item.number, item);
  return [...byNumber.values()];
}

async function fetchDraftPullNumbers() {
  const drafts = new Set();
  let url = 'https://api.github.com/repos/matrix-org/matrix-spec-proposals/pulls?state=open&per_page=100';

  while (url) {
    const res = await githubFetch(url);
    const batch = await res.json();
    for (const pr of batch) {
      if (pr.draft) drafts.add(pr.number);
    }

    const link = res.headers.get('link');
    url = null;
    if (link) {
      const next = link.split(',').find((part) => part.includes('rel="next"'));
      if (next) url = next.match(/<([^>]+)>/)?.[1] ?? null;
    }

    await sleep(DELAY_MS);
  }

  return drafts;
}

function parseLocalMarkdownDeps() {
  const depsByNumber = new Map();
  const proposalsDir = join(LOCAL_REPO, 'proposals');

  let files;
  try {
    files = readdirSync(proposalsDir).filter((f) => f.endsWith('.md'));
  } catch {
    console.warn(`  No local repo at ${LOCAL_REPO} — skipping markdown dependency parse`);
    console.warn('  Clone with: git clone --depth 1 https://github.com/matrix-org/matrix-spec-proposals.git /tmp/msp-clone');
    return depsByNumber;
  }

  console.log(`Parsing dependencies from ${files.length} local proposal files…`);
  for (const file of files) {
    const numMatch = file.match(/^(\d+)-/);
    if (!numMatch) continue;
    const num = parseInt(numMatch[1], 10);
    const text = readFileSync(join(proposalsDir, file), 'utf8');
    const deps = parseDependencies(text);
    if (deps.length) depsByNumber.set(num, deps);
  }

  return depsByNumber;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadExistingMscData() {
  const src = readFileSync(new URL('./js/msc-data.js', import.meta.url), 'utf8');
  const json = src.replace(/^[\s\S]*?const MSC_INDEX = /, '').replace(/;\s*$/, '');
  return JSON.parse(json);
}

function loadExistingComments() {
  const src = readFileSync(new URL('./js/msc-comments.js', import.meta.url), 'utf8');
  const json = src.replace(/^[\s\S]*?const MSC_COMMENTS = /, '').replace(/;\s*$/, '');
  return JSON.parse(json);
}

function sharePagesOnly() {
  console.log('Regenerating share pages from committed data files…');
  const payload = loadExistingMscData();
  const commentsByPr = loadExistingComments();
  generateSharePages(payload.mscs, commentsByPr);
  console.log(`Done (${payload.mscs.length} MSCs, data from ${payload.fetchedAt})`);
}

function rewriteAssetPaths(html) {
  return html
    .replace(/href="css\//g, 'href="../../css/')
    .replace(/src="js\//g, 'src="../../js/');
}

function generateSharePages(mscs, commentsByPr) {
  const mscRoot = new URL('./msc/', import.meta.url);
  rmSync(mscRoot, { recursive: true, force: true });

  const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const bodyMatch = indexHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) throw new Error('index.html is missing a <body>');
  const appBody = rewriteAssetPaths(bodyMatch[1]);

  const ogImage = `${SITE_URL}/og.svg`;

  for (const msc of mscs) {
    const dir = new URL(`./msc/${msc.number}/`, import.meta.url);
    mkdirSync(dir, { recursive: true });

    const displayTitle = `${msc.wip ? '[WIP] ' : ''}${msc.title}`;
    const title = `MSC${msc.number}: ${displayTitle}`;
    const status = STATUS_LABELS[msc.status] ?? msc.status;
    const parts = [status, `@${msc.author}`];
    if (msc.dependencies.length) parts.push(`${msc.dependencies.length} deps`);
    const comments = commentsByPr[String(msc.pr)]?.length ?? 0;
    if (comments) parts.push(`${comments} comments`);
    const description = parts.join(' · ');
    const pageUrl = `${SITE_URL}/msc/${msc.number}/`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Matrix Spec Explorer">
  <meta property="og:title" content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(description)}">
  <meta property="og:url" content="${escHtml(pageUrl)}">
  <meta property="og:image" content="${escHtml(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(description)}">
  <meta name="twitter:image" content="${escHtml(ogImage)}">
  <link rel="canonical" href="${escHtml(pageUrl)}">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github-dark.min.css">
  <link rel="stylesheet" href="../../css/style.css">
</head>
<body>
${appBody}
</body>
</html>
`;

    writeFileSync(new URL('./index.html', dir), html);
  }

  console.log(`Wrote ${mscs.length} MSC share pages under msc/`);
}

async function main() {
  if (process.argv.includes('--share-pages-only')) {
    sharePagesOnly();
    return;
  }

  const token = getGhToken();
  if (process.env.GITHUB_TOKEN && !process.env.MSP_GITHUB_TOKEN && token === process.env.GITHUB_TOKEN) {
    console.warn('Warning: GITHUB_TOKEN has low cross-repo rate limits. Set MSP_GITHUB_TOKEN for data refresh.');
  }
  console.log(token ? 'Using authenticated GitHub API' : 'Using unauthenticated GitHub API (rate limits apply)');

  const existing = (() => {
    try {
      return loadExistingMscData();
    } catch {
      return null;
    }
  })();
  const existingComments = (() => {
    try {
      return loadExistingComments();
    } catch {
      return {};
    }
  })();
  const lastFetched = existing?.fetchedAt ? new Date(existing.fetchedAt) : null;

  console.log('Fetching MSC issues from GitHub…');
  const allItems = await fetchAllIssues();

  const openCount = allItems.filter((i) => i.state === 'open').length;
  console.log(`Fetching draft status for ${openCount} open PRs (batched)…`);
  const draftSet = await fetchDraftPullNumbers();
  console.log(`  found ${draftSet.size} drafts`);

  const markdownDeps = parseLocalMarkdownDeps();

  const mscs = allItems.map((item) => {
    const { number: mscNum, title, wip } = parseTitle(item.title);
    const meta = parseBodyMeta(item.body);
    const labelNames = item.labels.map((l) => l.name);
    const categories = categorizeLabels(labelNames);
    const draft = draftSet.has(item.number);
    const status = deriveStatus({ ...item, draft, labels: item.labels });
    const number = mscNum ?? item.number;

    const bodyDeps = parseDependencies(item.body ?? '');
    const fileDeps = markdownDeps.get(number) ?? [];
    const dependencies = [...new Set([...bodyDeps, ...fileDeps])].sort((a, b) => a - b);

    return {
      number,
      pr: item.number,
      title,
      wip,
      status,
      state: item.state,
      mergedAt: item.pull_request?.merged_at ?? null,
      createdAt: meta.date ?? item.created_at.slice(0, 10),
      updatedAt: item.updated_at.slice(0, 10),
      author: meta.author ?? item.user.login,
      shepherd: meta.shepherd,
      url: item.html_url,
      renderedUrl: meta.renderedUrl,
      dependencies,
      labels: labelNames,
      ...categories,
    };
  });

  mscs.sort((a, b) => b.number - a.number);

  console.log('Fetching PR discussion comments…');
  const commentsByPr = await fetchAllComments(mscs, existingComments, lastFetched);

  const payload = {
    fetchedAt: new Date().toISOString(),
    count: mscs.length,
    mscs,
  };

  const out = `// Auto-generated by build-data.js — do not edit\n// Run: node build-data.js\n\nconst MSC_INDEX = ${JSON.stringify(payload, null, 2)};\n`;
  writeFileSync(new URL('./js/msc-data.js', import.meta.url), out);
  console.log(`Wrote js/msc-data.js (${mscs.length} MSCs)`);

  const commentsOut = `// Auto-generated by build-data.js — do not edit\n\nconst MSC_COMMENTS = ${JSON.stringify(commentsByPr, null, 2)};\n`;
  writeFileSync(new URL('./js/msc-comments.js', import.meta.url), commentsOut);
  console.log(`Wrote js/msc-comments.js (${Object.keys(commentsByPr).length} MSCs with comments)`);

  generateSharePages(mscs, commentsByPr);
}

async function fetchIssueComments(issueNumber) {
  const comments = [];
  let url = `https://api.github.com/repos/matrix-org/matrix-spec-proposals/issues/${issueNumber}/comments?per_page=100`;

  while (url) {
    const res = await githubFetch(url);
    const batch = await res.json();
    comments.push(...batch.map((c) => ({
      author: c.user.login,
      date: c.created_at.slice(0, 10),
      body: c.body,
      url: c.html_url,
    })));

    const link = res.headers.get('link');
    url = null;
    if (link) {
      const next = link.split(',').find((part) => part.includes('rel="next"'));
      if (next) url = next.match(/<([^>]+)>/)?.[1] ?? null;
    }
  }

  return comments;
}

async function fetchAllComments(mscs, existingComments = {}, lastFetched = null) {
  const commentsByPr = { ...existingComments };
  const needsFetch = lastFetched
    ? mscs.filter((msc) => {
      if (!existingComments[String(msc.pr)]) return true;
      return new Date(`${msc.updatedAt}T00:00:00Z`) >= lastFetched;
    })
    : mscs;

  if (lastFetched && needsFetch.length < mscs.length) {
    console.log(`  incremental: fetching comments for ${needsFetch.length}/${mscs.length} MSCs`);
  }

  const batchSize = 5;

  for (let i = 0; i < needsFetch.length; i += batchSize) {
    const batch = needsFetch.slice(i, i + batchSize);
    for (const msc of batch) {
      try {
        const comments = await fetchIssueComments(msc.pr);
        if (comments.length) commentsByPr[msc.pr] = comments;
        else delete commentsByPr[msc.pr];
      } catch (err) {
        console.warn(`  skipped comments for PR #${msc.pr}: ${err.message}`);
      }
    }

    console.log(`  comments: ${Math.min(i + batchSize, needsFetch.length)}/${needsFetch.length}`);
    if (i + batchSize < needsFetch.length) await sleep(DELAY_MS);
  }

  return commentsByPr;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
