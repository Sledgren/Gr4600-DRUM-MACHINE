# GR4600 Development Guardrails

This workspace is for a clean-room GR4600 drum machine. Keep the product identity,
workflow, hardware-style interface, and original GlitchRealm sounds/assets, but do
not copy proprietary source code, comments, asset names, artwork, samples, or file
structure from any third-party drum machine, DAW, sampler, plugin, or website.

## Mandatory Code Hygiene Rules

- Do not use, search for, paste, rewrite, or adapt proprietary code from existing
  DAWs, samplers, drum machines, plugins, or browser music apps.
- Do not reference removed or disputed source trees, filenames, comments, mascots,
  sample names, or branded assets.
- Audio processing code must be written natively from scratch using standard Web
  Audio APIs, or must use permissive open-source libraries with MIT, Apache 2.0,
  BSD, ISC, or similarly compatible licenses.
- If a third-party open-source library is added, document its name, license, source
  URL, and the exact feature it supports before using it.
- Avoid large, highly specific generated blocks that could mirror proprietary
  algorithms. Prefer small, modular, standard audio and UI components.
- Keep comments and UI wording in English unless the user explicitly asks
  otherwise.
- Use only user-owned, newly created, generated, public-domain, or properly
  licensed audio/image assets.
- Preserve GR4600 naming and GlitchRealm branding, but do not imitate third-party
  trademarks, logos, mascot art, or product skins exactly.

## Clean-Room Implementation Rules

- Build GR4600 features from functional concepts only: pads, tracks, step
  sequencing, piano roll, sample slicing, pitch, stretch, mixer, EQ, export,
  stems, templates, and project save/load are allowed as general ideas.
- Implement behavior through original code in the current clean-room app files.
- Do not import old `src/` trees, disputed drum kits, disputed mascot images, or
  files with third-party branded sample names.
- When replacing a feature, remove stale code paths instead of hiding them.
- Before packaging, scan the release folder and zip for old/disputed source paths,
  comments, asset names, and brand names.

## Verification Before Release

Before making a release zip, run checks equivalent to the commands below. Keep
the private disputed-term checklist outside the public repository and use it for
the scan pattern.

```sh
node --check "outputs/gr4600-clean-room 4/app.js"
rg -n "<private disputed terms pattern>" "outputs/gr4600-clean-room 4"
find "outputs/gr4600-clean-room 4" -type f \( -path "*/legacy-src/*" -o -path "*/third-party-kit/*" -o -name "<private-disputed-file-pattern>" \) -print
unzip -t "outputs/gr4600-clean-room-v*.zip"
```

All scans must be clean before publishing or uploading.
