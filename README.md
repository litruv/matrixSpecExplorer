# Matrix Spec Explorer

Browse [Matrix Spec Proposals](https://github.com/matrix-org/matrix-spec-proposals) without drowning in GitHub. Filter by status, kind, and area; search with operators; read proposal markdown and PR discussion in one place.

**Live site:** https://litruv.github.io/matrixSpecExplorer/

## Features

- **Search** with operators: `depends:`, `depended-by:`, `status:`, `kind:`, `area:`, `author:`, `msc:`
- **Filters** for status (with counts), kind, and area
- **Sort** by newest, oldest, recently updated, most discussed, or title
- **Detail panel** with proposal markdown, dependencies, labels, and PR comments
- **Internal links** between MSCs with hover previews
- **Resizable** sidebar, list, and detail columns

## Run locally

```bash
git clone https://github.com/litruv/matrixSpecExplorer.git
cd matrixSpecExplorer
python3 -m http.server 8080
```

Open http://localhost:8080

The repo includes pre-built data in `js/msc-data.js` and `js/msc-comments.js`, so you can run it immediately without building.

## Refresh data

To regenerate MSC metadata and PR comments from GitHub:

```bash
# Recommended — avoids API rate limits
export GITHUB_TOKEN=ghp_...
# or: gh auth login

# Optional — parses dependencies from proposal markdown
git clone --depth 1 https://github.com/matrix-org/matrix-spec-proposals.git /tmp/msp-clone

node build-data.js
```

This overwrites:

- `js/msc-data.js` — MSC index (~1 MB)
- `js/msc-comments.js` — PR discussion comments (~3 MB)

Proposal text itself is fetched from GitHub at runtime when you open an MSC.

## Sharing links

Discord and other chat apps ignore `#` fragments, so use the per-MSC share URL for rich embeds:

```
https://litruv.github.io/matrixSpecExplorer/msc/4522/
```

These pages are generated at build time with Open Graph metadata (title, status, author, comment count). The in-app URL uses `?msc=4522`; use the share button in the detail panel to copy the embed-friendly link.

## Deploy

The site is static HTML/CSS/JS. GitHub Pages deployment is automated via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

- Runs on push to `main`
- Rebuilds data from the GitHub API
- Deploys to GitHub Pages
- Re-runs daily at 06:00 UTC

To deploy your own fork, enable **GitHub Pages** with **GitHub Actions** as the source, then push to `main`.

No secrets are stored in the repo. The workflow uses GitHub's built-in `GITHUB_TOKEN`.

## Project layout

```
index.html          App shell
css/style.css       Styles
js/app.js           UI and filtering logic
js/msc-data.js      Generated MSC index (do not edit)
js/msc-comments.js  Generated PR comments (do not edit)
build-data.js       Fetches data from GitHub API
```

## License

**Application code:** MIT — see [LICENSE](LICENSE).

**Bundled data:** MSC metadata and PR comments in `js/msc-data.js` and `js/msc-comments.js` are aggregated from public [matrix-spec-proposals](https://github.com/matrix-org/matrix-spec-proposals) on GitHub. MSC proposals are licensed under [Apache 2.0](https://github.com/matrix-org/matrix-spec-proposals/blob/main/LICENSE). PR comment text remains © its respective authors. See [NOTICE](NOTICE) for attribution details.
