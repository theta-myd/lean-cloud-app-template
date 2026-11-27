@[Shared Repository Rules](./AGENTS.md)

# Antigravity / Gemini Workspace Rules

- **Diagrams (`docs/architecture/`):** When creating or updating `.drawio` / `.drawio.svg` diagrams, use the installed `drawio` skill (`find-shapes.js` via `bun` for official `gcp2` icons, XML repair pass, and `draw.io` Desktop CLI `-x -f svg -e` export so embedded XML stays editable) and visually inspect the rendered output.
- **Google Cloud:** Use the `google-cloud-developer` plugin (`finding-google-skills`, `retrieving-developer-knowledge`, `gcloud`) to ground GCP architecture and Terraform decisions against current official documentation.
- **Response vs. Repository Language:** Reply to the user in the language of their prompt (e.g., Japanese), while authoring repository files in English and keeping `docs/jp/` mirrors synchronized per [AGENTS.md](./AGENTS.md).
- **Commit Attribution:** When committing work co-authored with Gemini (Antigravity), always include a blank line followed by the trailer `Co-authored-by: Gemini (Antigravity) <noreply@google.com>`.
- **Pull Request Attribution:** When creating or updating a Pull Request with Gemini (Antigravity), include `Generated with Gemini (Antigravity)` in the PR description.
