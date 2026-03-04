# Skill & Plugin Migration Guide

Playbook for migrating skills from Claude Code plugins (`~/.claude/plugins/`) into the
project's local `.claude/skills/` directory. Produces fully self-contained skills with no
external dependencies.

---

## Background

Claude Code plugins install skills into two locations:

| Location                                                    | Purpose                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `~/.claude/plugins/marketplaces/<vendor>/plugins/<plugin>/` | Local clone of the upstream GitHub repo; used for discovery and updates      |
| `~/.claude/plugins/cache/<vendor>/<plugin>/<version>/`      | Version-pinned installed copy; **this is what Claude Code loads at runtime** |

`installed_plugins.json` at `~/.claude/plugins/` maps each plugin to its cache path.
The marketplace copy gets overwritten on sync — never edit it as a primary source.

When migrating to project-local skills, the goal is to copy from the **cache** (runtime
source of truth) into `.claude/skills/` and eliminate all external path dependencies.

---

## Migration Process

### 1. Inventory the skill

```
find ~/.claude/plugins/cache/<vendor>/<plugin>/<version>/skills/<skill-name> -type f | sort
```

Note every file: SKILL.md, references/, examples/, scripts/, assets/. Also check for
cross-skill dependencies — files referenced from SKILL.md that live in a _different_
skill's directory.

### 2. Create the local directory structure

```
mkdir -p .claude/skills/<skill-name>/references
mkdir -p .claude/skills/<skill-name>/examples   # if needed
mkdir -p .claude/skills/<skill-name>/scripts     # if needed
```

### 3. Copy all files

Copy from the cache path, not marketplaces. Include cross-skill dependencies by copying
them into the skill's own directory (typically `references/`).

### 4. Fix path references

Search for and replace all external path patterns in every copied file:

| Pattern to find                                                | Replace with                                         |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| `${CLAUDE_PLUGIN_ROOT}/skills/<skill-name>/references/`        | `references/`                                        |
| `${CLAUDE_PLUGIN_ROOT}/skills/<skill-name>/examples/`          | `examples/`                                          |
| `${CLAUDE_PLUGIN_ROOT}/skills/<other-skill>/references/<file>` | `references/<file>` (after copying the file locally) |
| Any absolute path containing `~/.claude/plugins/`              | Relative path                                        |

Project-level skills use **relative paths** from the skill directory — no special
variables needed.

### 5. Check for orphaned files

After copying, verify that every file in the skill directory is referenced from SKILL.md.
Files that exist but aren't referenced are invisible to Claude and should either get a
reference added or be removed.

```
# Find all resource files
find .claude/skills/<skill-name> -type f -not -name SKILL.md | sort

# For each, check it's referenced
grep -l "<filename>" .claude/skills/<skill-name>/SKILL.md
```

### 6. Verify no external dependencies remain

Run this across all files in the skill directory:

```
grep -r 'CLAUDE_PLUGIN_ROOT\|\${.*}\|/\.claude/plugins\|/cache/\|/marketplaces/' \
  .claude/skills/<skill-name>/
```

Expected result: no matches.

### 7. Verify all referenced files exist

Extract file references from SKILL.md and confirm each resolves locally:

```
grep -oE '(references|examples|scripts)/[^ )`"]+' .claude/skills/<skill-name>/SKILL.md | \
  sort -u | while read f; do
    [ -f ".claude/skills/<skill-name>/$f" ] && echo "OK: $f" || echo "MISSING: $f"
  done
```

### 8. Confirm skill appears in Claude Code

After saving, the skill should appear in the skill list within Claude Code. If both the
plugin and local versions exist, there may be duplicates until the plugin is removed.

---

## Things to Watch For

**Cross-skill dependencies:** A skill may reference files from a sibling skill's
directory (e.g., `repair-skill` loading `create-skill/references/script-patterns.md`).
Copy these files into the migrating skill's own `references/` to make it self-contained.

**`${CLAUDE_PLUGIN_ROOT}` variable:** Only works within the plugin system. Project-level
skills must use relative paths instead. Search all files — not just SKILL.md — since
reference files can also contain cross-references.

**`Task` vs `Agent` tool naming:** Some older plugin skills reference "Task tool" for
spawning subagents. The correct Claude Code tool name is `Agent`. Fix these during
migration. Similarly, `allowed-tools` may list `Task` instead of `Agent`.

**Orphaned resource files:** Plugin skills sometimes ship files that aren't referenced
from SKILL.md. Decide whether to add a reference (if the file is useful) or skip copying
it (if it's truly unused).

**`allowed-tools` completeness:** If the skill invokes other skills, `Skill` must be in
`allowed-tools`. If it spawns agents, `Agent` must be listed. Audit during migration.

**Duplicate skills after migration:** Both the plugin version and local version will be
active until the plugin is uninstalled. The local copy takes precedence for project-scoped
work, but the plugin copy still appears in the global skill list.

**Marketplace sync overwrites:** Never rely on edits to the `marketplaces/` folder — they
get overwritten when the marketplace syncs from GitHub. The `cache/` folder persists until
the plugin is updated or reinstalled.

---

## Migrations Completed

| Skill           | Source plugin                | Files                                   | Cross-deps                               | Notes                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ---------------------------- | --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `improve-skill` | claude-skills@Claudest 0.2.1 | 4 (SKILL.md + 2 references + 1 example) | None                                     | Fixed 3 `CLAUDE_PLUGIN_ROOT` paths, fixed `Task`→`Agent` in allowed-tools and body, added `Skill` to allowed-tools, removed body routing guidance, added negative trigger to description, added Phase 2b exit condition, collapsed code block to prose                                                                                            |
| `repair-skill`  | claude-skills@Claudest 0.2.1 | 9 (SKILL.md + 6 references + 1 example) | `script-patterns.md` from `create-skill` | Fixed 4 `CLAUDE_PLUGIN_ROOT` paths, copied cross-skill dependency locally, added missing reference pointer for orphaned `audit-calibration.md`. Post-migration repair: extracted 7 dimension specs to `references/audit-dimensions.md`, moved report template to `examples/sample-report.txt`, added reasoning to audit sub-items (383→113 lines) |
| `create-skill`  | claude-skills@Claudest 0.2.1 | 7 (SKILL.md + 3 references + 3 scripts) | None                                     | Fixed 6 `CLAUDE_PLUGIN_ROOT` paths to relative, fixed 2 `Task`→`Agent` tool refs, changed `python3` to `uv run` for script invocations, added PEP 723 inline metadata (`pyyaml` dep) to `validate_skill.py` and `package_skill.py`                                                                                                                |

---

## Project Skills Directory (current state)

```
.claude/skills/
├── antislop/          — AI writing pattern detection
├── art/               — Visual content system
├── create-skill/      — Skill & command generator (migrated from plugin)
├── frontend-slides/   — HTML presentation builder
├── improve-skill/     — Skill effectiveness analysis (migrated from plugin)
└── repair-skill/      — Skill structural audit (migrated from plugin)
```
