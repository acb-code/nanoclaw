---
name: add-pdf-reader
description: Add a pdf-reader CLI to the agent container for extracting text and metadata from PDFs. Installs poppler-utils and a bash wrapper (pdf-reader extract/fetch/info/list) so the agent can read PDFs of any length, not just those small enough for the Read tool.
---

# Add PDF Reader

Claude Code's `Read` tool handles PDFs natively up to 10 pages per call (20 with the `pages` param). Beyond that — and for bulk grep/ingest workflows — the agent needs a way to dump PDF text to stdout. This skill installs `poppler-utils` and a thin bash CLI (`pdf-reader`) that wraps `pdftotext` and `pdfinfo` with extract / fetch / info / list subcommands.

Scope:

- Text extraction (any length) via `pdftotext`
- URL fetch + extract in one command
- Metadata and page-count inspection via `pdfinfo`
- Recursive PDF listing in the workspace tree
- Does **not** add OCR (scanned/image-only PDFs remain out of scope)
- Does **not** add PDF creation or form handling

## Phase 1: Pre-flight

### Check if already applied

```bash
test -d container/skills/pdf-reader && echo "already applied — skip to Phase 3" || echo "not applied"
```

## Phase 2: Apply code changes

### Pick a remote that has the branch

The code lives on a `skill/pdf-reader` branch. It is maintained on the fork that owns this skill set — for most installs, `origin` (your own fork) or `upstream` (the NanoClaw fork you track for updates).

```bash
git remote -v
```

If neither remote has the branch, add the fork that publishes it (adjust the URL to wherever it lives):

```bash
git remote add upstream https://github.com/qwibitai/nanoclaw.git
```

### Merge the skill branch

```bash
git fetch origin skill/pdf-reader || git fetch upstream skill/pdf-reader
git merge origin/skill/pdf-reader 2>/dev/null || git merge upstream/skill/pdf-reader
```

This merges in:

- `container/skills/pdf-reader/pdf-reader` — the bash CLI
- `container/skills/pdf-reader/SKILL.md` — agent-side instructions
- `container/Dockerfile` — adds `poppler-utils` and installs the CLI to `/usr/local/bin/pdf-reader`

If the merge reports conflicts in `container/Dockerfile`, resolve by keeping both sets of system deps (other skills may have added their own apt packages) and preserving the `COPY skills/pdf-reader/pdf-reader /usr/local/bin/pdf-reader` + `RUN chmod +x` lines.

## Phase 3: Rebuild container and restart

The merge adds a new apt package (`poppler-utils`) and a new file baked into the image. A container rebuild is required.

```bash
./container/build.sh
```

Restart the service:

```bash
# macOS (launchd)
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Linux (systemd)
systemctl --user restart nanoclaw
```

## Phase 4: Verify

### Check the CLI is installed

Run a one-shot container to confirm `pdf-reader` resolves:

```bash
docker run --rm --entrypoint pdf-reader nanoclaw-agent:latest help
```

Expect the usage block listing `extract`, `fetch`, `info`, `list`.

### End-to-end in a group

Send a PDF to a registered group (requires a channel with attachment support — e.g. `/add-telegram-attachments`). The incoming message will include a `[Document: sources/…pdf]` or `[Document: attachments/…pdf]` reference. Ask the agent to summarize the PDF. The agent should:

1. Call `pdf-reader info sources/<name>.pdf` to check page count
2. Call `pdf-reader extract sources/<name>.pdf` (optionally with `--layout` or `--pages N-M`) for content longer than the Read tool's limit

### Check logs

```bash
tail -50 logs/nanoclaw.log
```

Look for the agent's bash invocations of `pdf-reader extract` / `pdf-reader info`.

## Troubleshooting

### `pdf-reader: command not found` inside the container

The container wasn't rebuilt after the merge. Re-run `./container/build.sh` and restart the service.

### Empty output from `pdf-reader extract`

The PDF has no embedded text layer (scanned or image-only). `pdftotext` can't help — OCR is out of scope for this skill. Consider a follow-up `add-pdf-ocr` skill using `tesseract` + `pdftoppm`, or fall back to the `Read` tool page-by-page.

### `pdf-reader fetch` fails with "Downloaded file is not a valid PDF"

The URL returned HTML (a login page, an error page, or a redirect that needs auth). Download via `curl` manually to inspect, or save the PDF to the workspace directly and use `pdf-reader extract`.

## Removal

```bash
git revert --no-edit <merge-commit-sha>
./container/build.sh
```

Then restart the service.

## Design notes

- **Why poppler-utils over Python libs.** `pdftotext` is a single binary, already prebuilt for Debian, runs fast on huge PDFs, and handles the 95% case (text extraction) without pulling in a Python runtime.
- **Why a bash wrapper.** Centralizes flag handling (`--layout`, `--pages N-M`) and adds URL fetch with header validation so the agent doesn't have to reinvent that each call. Also makes the skill self-documenting via `pdf-reader help`.
- **OCR intentionally excluded.** Tesseract + `pdftoppm` would roughly double the container's image size and is only needed for scanned documents. Keep this skill thin; add OCR as a separate skill when a real use case appears.
