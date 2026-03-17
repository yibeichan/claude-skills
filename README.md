# Claude Skills

A collection of reusable Claude skills for neuroimaging research workflows and scientific writing.

## Available Skills

| Skill | Install | Description |
|-------|---------|-------------|
| [dicom2fmriprep](skills/dicom2fmriprep/SKILL.md) | `npx @yibeichen/claude-skills install dicom2fmriprep` | Full DICOM→BIDS→fMRIPrep pipeline: heudiconv heuristics, BIDS validation fixes, fMRIPrep on SLURM via BABS. |
| [fmri-ssm](skills/fmri-ssm/SKILL.md) | `npx @yibeichen/claude-skills install fmri-ssm` | State-space models for fMRI: HMM, SLDS, rSLDS, SNLDS for resting-state, task, and naturalistic designs. |
| [neuroimaging-qc](skills/neuroimaging-qc/SKILL.md) | `npx @yibeichen/claude-skills install neuroimaging-qc` | Evidence-based QC decisions for fMRI, EEG, fNIRS using metrics from fMRIPrep, MRIQC, FreeSurfer. |
| [bidsapp-nidm-standards](skills/bidsapp-nidm-standards/SKILL.md) | `npx @yibeichen/claude-skills install bidsapp-nidm-standards` | Standards for creating NIDM-integrated BIDSapps that run through BABS. |
| [scientific-writer](skills/scientific-writer/SKILL.md) | `npx @yibeichen/claude-skills install scientific-writer` | Rigorous scientific manuscripts following IMRAD, CONSORT/STROBE/PRISMA guidelines. |

## Installation

Skills are installed to `.claude/skills/` in your current working directory by default.

### Quick Install (Recommended)

Install a specific skill using npx:

```bash
npx @yibeichen/claude-skills install bidsapp-nidm-standards
```

Install all skills:

```bash
npx @yibeichen/claude-skills install-all
```

List available skills:

```bash
npx @yibeichen/claude-skills list
```

### Custom Target Directory

Install to a custom directory:

```bash
npx @yibeichen/claude-skills install bidsapp-nidm-standards --target ./my-skills
```

### Overwrite Existing Skills

If a skill already exists, use `--overwrite` to replace it:

```bash
npx @yibeichen/claude-skills install bidsapp-nidm-standards --overwrite
```

### Python Script (Alternative)

If you don't have npm/node installed, use the Python script:

```bash
# List skills
python install.py --list

# Install a skill
python install.py bidsapp-nidm-standards

# Install all skills
python install.py --all

# Custom target
python install.py scientific-writer --target ./skills
```

### Uninstall Skills

Remove installed skills:

```bash
# Uninstall a specific skill
npx @yibeichen/claude-skills uninstall neuroimaging-qc

# Uninstall all skills
npx @yibeichen/claude-skills uninstall-all
```

Or with Python:

```bash
python install.py --uninstall neuroimaging-qc
python install.py --uninstall-all
```

## Development

See [CLAUDE.md](CLAUDE.md) for development guidelines or [MAINTAINERS.md](MAINTAINERS.md) for adding/updating skills.

## License

MIT