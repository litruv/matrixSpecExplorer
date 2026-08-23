# Matrix Spec Explorer

A better way to browse [Matrix Spec Proposals](https://github.com/matrix-org/matrix-spec-proposals) without digging through GitHub all day. Filter and search MSCs, browse proposal details, and read the PR discussion in the same place.

**Live site:** https://litruv.github.io/matrixSpecExplorer/

## Features

* **Search** with operators: `depends:`, `depended-by:`, `status:`, `kind:`, `area:`, `author:`, `msc:`
* **Filter** by status, kind, and area, with status counts
* **Favourite** MSCs, saved in your browser with `localStorage`, with their own sidebar filter
* **Sort** by newest, oldest, recently updated, most discussed, or title
* **Read proposals** in the detail panel, including dependencies, labels, and PR comments
* GitHub-flavoured markdown support, including images, quotes, tables, and task lists
* **Internal MSC links** with hover previews
* **Shareable URLs** using `/msc/N/`, with Open Graph metadata for Discord and other chat apps
* **Resizable** sidebar, list, and detail columns

## Run locally

```bash
git clone https://github.com/litruv/matrixSpecExplorer.git
cd matrixSpecExplorer
python3 -m http.server 8080
```

Then open http://localhost:8080.

The repo includes pre-built `js/msc-data.js` and `js/msc-comments.js`, so you can just clone it and run it.

Proposal text is fetched from GitHub when you open an MSC.

## Refresh data

To pull fresh MSC metadata and PR comments from GitHub:

```bash
# Recommended, avoids API rate limits
# 5000 req/hr vs GITHUB_TOKEN's cross-repo limits
export MSP_GITHUB_TOKEN=ghp_...

# or: gh auth login

# Optional, used to parse dependencies from proposal markdown
git clone --depth 1 https://github.com/matrix-org/matrix-spec-proposals.git /tmp/msp-clone

node build-data.js
```

This regenerates:

* `js/msc-data.js`, the MSC index, around 1 MB
* `js/msc-comments.js`, PR discussion comments, around 3 MB

It also generates the individual share pages under `msc/`. Those aren't committed and are generated during builds.

If you've only changed the app and just need to rebuild the share pages:

```bash
node build-data.js --share-pages-only
```

That doesn't make any GitHub API calls.

## Sharing links

Opening an MSC updates the URL to something like:

```text
https://litruv.github.io/matrixSpecExplorer/msc/4522/
```

Discord and similar apps don't run the site's JavaScript when generating embeds. Each MSC therefore gets its own static HTML page with Open Graph metadata for the title, status, author, and comment count.

Copy the URL from the address bar or use the share button in the detail panel.

Old `?msc=4522` and `#msc4522` links still open the correct MSC, but they won't produce rich embeds.

## Deploy

It's a static HTML, CSS, and JS site. GitHub Pages deployment is handled by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

| Trigger                  | What happens                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Push to `main`           | Runs `build-data.js --share-pages-only`, with no GitHub API calls                                 |
| Daily at 06:00 UTC       | Runs a full `build-data.js` refresh and falls back to the committed data if GitHub rate-limits it |
| Manual workflow dispatch | Rebuilds share pages by default. Enable **Fetch fresh MSC data** to do a full refresh             |

To deploy your own fork, enable **GitHub Pages** with **GitHub Actions** as the source, then push to `main`.

For reliable scheduled refreshes, add an `MSP_GITHUB_TOKEN` repo secret using a fine-grained PAT with public repo read access. Nothing else needs a secret.

## Project layout

```text
index.html          App shell
og.svg              Default Open Graph image

css/style.css       Styles

js/app.js           UI and filtering logic
js/msc-data.js      Generated MSC index (do not edit)
js/msc-comments.js  Generated PR comments (do not edit)

build-data.js       Fetches GitHub data and writes share pages

msc/                Generated per-MSC pages for link previews (gitignored)

.github/workflows/  Pages deployment
```

Runtime dependencies are loaded from CDNs:

* [marked](https://marked.js.org/)
* [DOMPurify](https://github.com/cure53/DOMPurify)
* [highlight.js](https://highlightjs.org/)
* [Lucide](https://lucide.dev/)

## License

**Application code:** MIT, see [LICENSE](LICENSE).

**Bundled data:** MSC metadata and PR comments in `js/msc-data.js` and `js/msc-comments.js` are aggregated from the public [matrix-spec-proposals](https://github.com/matrix-org/matrix-spec-proposals) repository on GitHub.

MSC proposals are licensed under [Apache 2.0](https://github.com/matrix-org/matrix-spec-proposals/blob/main/LICENSE). PR comment text remains © its respective authors. See [NOTICE](NOTICE) for attribution details.
