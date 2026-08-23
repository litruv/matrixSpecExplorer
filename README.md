# Matrix Spec Explorer

Browse [Matrix Spec Proposals](https://github.com/matrix-org/matrix-spec-proposals) without getting lost in GitHub. Filter proposals by status, kind, and area, search using operators, and read the proposal markdown alongside the PR discussion.

**Live site:** https://litruv.github.io/matrixSpecExplorer/

## Features

* **Search** with operators: `depends:`, `depended-by:`, `status:`, `kind:`, `area:`, `author:`, `msc:`
* **Filters** for status, kind, and area, with counts
* **Sorting** by newest, oldest, recently updated, most discussed, or title
* **Detail panel** with proposal markdown, dependencies, labels, and PR comments
* **Internal MSC links** with hover previews
* **Resizable** sidebar, list, and detail panels

## Run locally

```bash
git clone https://github.com/litruv/matrixSpecExplorer.git
cd matrixSpecExplorer
python3 -m http.server 8080
```

Then open http://localhost:8080.

The repo includes pre-built data in `js/msc-data.js` and `js/msc-comments.js`, so it works immediately without needing a build step.

## Refresh data

To regenerate MSC metadata and PR comments from GitHub:

```bash
# Recommended, avoids API rate limits
# 5000 req/hr vs GITHUB_TOKEN's cross-repo limits
export MSP_GITHUB_TOKEN=ghp_...
# or: gh auth login

# Optional, parses dependencies from proposal markdown
git clone --depth 1 https://github.com/matrix-org/matrix-spec-proposals.git /tmp/msp-clone

node build-data.js
```

To regenerate only the `/msc/N/` share pages after app changes:

```bash
node build-data.js --share-pages-only
```

### CI behaviour

Pushes to `main` run `--share-pages-only` and deploy the committed `js/msc-data.js` and `js/msc-comments.js`.

The daily schedule and manual "refresh data" runs perform a full API refresh. Add a repo secret called `MSP_GITHUB_TOKEN` using a fine-grained PAT with public repo read access so scheduled builds do not run into GitHub Actions' lower cross-repo rate limits.

The build overwrites:

* `js/msc-data.js` , MSC index, around 1 MB
* `js/msc-comments.js` , PR discussion comments, around 3 MB

Proposal text itself is fetched from GitHub at runtime when you open an MSC.

## Sharing links

Opening an MSC updates the address bar with a shareable URL:

```text
https://litruv.github.io/matrixSpecExplorer/msc/4522/
```

Each MSC also has a static HTML page with Open Graph metadata, so Discord and other chat apps can generate useful previews without running the JavaScript app.

The pages include the proposal title, status, author, and comment count.

You can copy the URL directly from the address bar or use the share button in the detail panel.

Legacy `?msc=4522` and `#msc4522` links still work in the app, but they will not generate rich embeds in chat apps.

## Deploy

The site is completely static and uses GitHub Pages. Deployment is automated through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

* Runs on pushes to `main`
* Rebuilds data from the GitHub API
* Deploys to GitHub Pages
* Runs daily at 06:00 UTC

To deploy your own fork, enable **GitHub Pages** with **GitHub Actions** as the source, then push to `main`.

No secrets are stored in the repo. The workflow uses GitHub's built-in `GITHUB_TOKEN`.

## Project layout

```text
index.html          App shell
css/style.css       Styles
js/app.js           UI and filtering logic
js/msc-data.js      Generated MSC index (do not edit)
js/msc-comments.js  Generated PR comments (do not edit)
build-data.js       Fetches data from GitHub API
```

## License

**Application code:** MIT, see [LICENSE](LICENSE).

**Bundled data:** MSC metadata and PR comments in `js/msc-data.js` and `js/msc-comments.js` are aggregated from the public [matrix-spec-proposals](https://github.com/matrix-org/matrix-spec-proposals) repository on GitHub.

MSC proposals are licensed under Apache 2.0. PR comment text remains © its respective authors. See [NOTICE](NOTICE) for attribution details.
