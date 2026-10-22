# FORMA v1.1 CI boundary

The approved export is commit 52dbd9191ca3bab73d952de868c466eec0f73dac.
approved-artifacts.json pins every public file, including all images and cached chunks.
check-artifacts.mjs independently reconstructs that manifest from immutable Git objects,
compares it with the committed manifest, then checks the complete working inventory and bytes.
Changing an image and its manifest together fails. CI never writes an approval manifest.
Preparation image evidence is also compared with the approved snapshot.

Install only this package: npm ci --prefix .github/ci --ignore-scripts.
Run preflight before installation, and check-dependencies.mjs afterwards.
The complete dependency allowlist is parse5 8.0.0 and entities 6.0.1.
No native image decoder is installed or invoked by either CI job.

../tools is the independent offline preparation package, retaining its existing lockfile
and pixel comparison tooling. Do not install or run it in ordinary CI. Its current
libheif remains below the security floor; future image preparation needs patched,
isolated tooling and separate approval. CI does not rerun codec-quality comparisons.
Existing images and quality reports are pinned, not re-encoded.

The text-only assembler preserves the old generator's deterministic HTML/CSS/Flight
transforms and reuses approved image records. Verification retains resource, link,
HTTP, hydration, CSS, source-preservation and budget checks.

Trust boundary: a repository author can edit workflow/checker code or change the pinned
approval commit. Such changes require explicit owner review; in-repository CI cannot
protect its own policy against an administrator rewriting that policy. Updating images
requires a separately reviewed preparation report, new baseline and manifest; never
accept automatically refreshed hashes.
