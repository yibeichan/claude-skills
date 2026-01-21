# Claude Skills

A collection of reusable Claude skills for neuroimaging research workflows and scientific writing.

## Available Skills

### [bidsapp-nidm-standards](skills/bidsapp-nidm-standards/SKILL.md)
Standards for creating NIDM-integrated BIDSapps that run through BABS.

**Trigger keywords**: BIDSapp, NIDM, BABS, FreeSurfer, repository structure

**Install**:
```bash
npx @yibeichen/claude-skills install bidsapp-nidm-standards
```

### [neuroimaging-qc](skills/neuroimaging-qc/SKILL.md)
Evidence-based QC decision-making for neuroimaging data (fMRI, EEG, fNIRS, structural MRI). Interpret QC metrics from fMRIPrep, MRIQC, FreeSurfer, MNE-Python, Homer3 to make justified inclusion/exclusion decisions.

**Trigger keywords**: QC, quality control, fMRIPrep, MRIQC, motion, exclusion, subject filtering

**Install**:
```bash
npx @yibeichen/claude-skills install neuroimaging-qc
```

### [scientific-writer](skills/scientific-writer/SKILL.md)
Write rigorous scientific manuscripts following academic standards (IMRAD, citations, figures, CONSORT/STROBE/PRISMA guidelines).

**Trigger keywords**: scientific writing, research papers, grant proposals, literature reviews

**Install**:
```bash
npx @yibeichen/claude-skills install scientific-writer
```

## Installation

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

## Development

See [CLAUDE.md](CLAUDE.md) for development guidelines or [MAINTAINERS.md](MAINTAINERS.md) for adding/updating skills.

## License

MIT