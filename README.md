# Whetstone

Agent skills that sharpen research workflows — a collection of reusable skills for neuroimaging pipelines and scientific writing.

## Available Skills

| Skill | Install | Description |
|-------|---------|-------------|
| [dicom2fmriprep](skills/dicom2fmriprep/SKILL.md) | `npx @yibeichan/whetstone install dicom2fmriprep` | Full DICOM→BIDS→fMRIPrep pipeline: heudiconv heuristics, BIDS validation fixes, fMRIPrep on SLURM via BABS. |
| [fmri-ssm](skills/fmri-ssm/SKILL.md) | `npx @yibeichan/whetstone install fmri-ssm` | State-space models for fMRI: HMM, SLDS, rSLDS, SNLDS for resting-state, task, and naturalistic designs. |
| [bids-format](skills/bids-format/SKILL.md) | `npx @yibeichan/whetstone install bids-format` | BIDS standard for all data types — naming conventions, dataset creation, multi-modal conversion (heudiconv, MNE-BIDS, pypet2bids), validation, derivatives, project organization, DataLad, sharing. |
| [neuroimaging-qc](skills/neuroimaging-qc/SKILL.md) | `npx @yibeichan/whetstone install neuroimaging-qc` | Evidence-based QC decisions for fMRI, EEG, fNIRS using metrics from fMRIPrep, MRIQC, FreeSurfer. |
| [bidsapp-nidm-standards](skills/bidsapp-nidm-standards/SKILL.md) | `npx @yibeichan/whetstone install bidsapp-nidm-standards` | Standards for creating NIDM-integrated BIDSapps that run through BABS. |
| [neuro-plotting](skills/neuro-plotting/SKILL.md) | `npx @yibeichan/whetstone install neuro-plotting` | Publication-quality matplotlib for neuroscience: colorblind palettes, journal sizing, brain surfaces, transition matrices, heatmaps, multi-panel composition. |
| [scientific-writer](skills/scientific-writer/SKILL.md) | `npx @yibeichan/whetstone install scientific-writer` | Rigorous scientific manuscripts following IMRAD, CONSORT/STROBE/PRISMA guidelines. |

## Installation

Skills are installed to `.claude/skills/` in your current working directory by default.

### Quick Install (Recommended)

Install a specific skill using npx:

```bash
npx @yibeichan/whetstone install bidsapp-nidm-standards
```

Install all skills:

```bash
npx @yibeichan/whetstone install-all
```

List available skills:

```bash
npx @yibeichan/whetstone list
```

### Custom Target Directory

Install to a custom directory:

```bash
npx @yibeichan/whetstone install bidsapp-nidm-standards --target ./my-skills
```

### Overwrite Existing Skills

If a skill already exists, use `--overwrite` to replace it:

```bash
npx @yibeichan/whetstone install bidsapp-nidm-standards --overwrite
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
npx @yibeichan/whetstone uninstall neuroimaging-qc

# Uninstall all skills
npx @yibeichan/whetstone uninstall-all
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
