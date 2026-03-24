# DataLad Workflows for Research Projects

Version control, collaboration, and reproducibility for BIDS datasets using DataLad.

## Table of Contents

- [Getting Started](#getting-started)
- [Dataset Configurations](#dataset-configurations)
- [Tracking Changes](#tracking-changes)
- [Superdatasets](#superdatasets)
- [Remote Collaboration](#remote-collaboration)
- [RIA Stores](#ria-stores)
- [HPC Workflows](#hpc-workflows)
- [Reproducible Analyses](#reproducible-analyses)

---

## Getting Started

### Install

```bash
pip install datalad
# Also need git-annex
conda install -c conda-forge git-annex
# Or on macOS:
brew install git-annex
```

### Create a BIDS Dataset

```bash
# Create with text2git config (ideal for BIDS)
# Small text files (TSV, JSON, README) → git
# Large binary files (NIfTI, EDF, SNIRF) → git-annex
datalad create -c text2git my-bids-dataset
cd my-bids-dataset

# Add your BIDS files
cp -r /source/of/data/* .
datalad save -m "Initial BIDS dataset: 20 subjects, T1w + resting-state fMRI"
```

### Convert Existing Directory to DataLad

```bash
cd /path/to/existing/bids_dataset
datalad create -f -c text2git .
datalad save -m "Track existing BIDS dataset with DataLad"
```

## Dataset Configurations

| Config | When to use | What it does |
|--------|-------------|-------------|
| `text2git` | BIDS datasets | Text files in git, binaries in annex |
| `yoda` | Analysis projects | Separates code (git) from data (annex), includes a default README |
| (none) | Simple cases | Everything in git-annex |

### YODA for Analysis Projects

```bash
# YODA = YODAs Organizer of Data Analysis
datalad create -c yoda my-analysis

# Structure created:
# my-analysis/
# ├── code/          # tracked in git (editable)
# ├── CHANGELOG.md   # tracked in git
# └── README.md      # tracked in git
# Everything else → git-annex

# Install input data as subdataset
cd my-analysis
datalad clone -d . /path/to/bids_data inputs/data
```

## Tracking Changes

```bash
# Save specific files
datalad save -m "Add events.tsv for sub-01 task-stroop" \
    sub-01/beh/sub-01_task-stroop_events.tsv \
    sub-01/beh/sub-01_task-stroop_events.json

# Save everything
datalad save -m "Complete BIDS conversion for all subjects"

# Check status
datalad status

# View history
git log --oneline

# Undo last save (like git, but also handles annex)
datalad rerun --onto HEAD~1
```

### .gitattributes for BIDS

The `text2git` config handles most cases, but you can customize:

```gitattributes
# Ensure these are always in git (not annex)
*.json annex.largefiles=nothing
*.tsv annex.largefiles=nothing
*.txt annex.largefiles=nothing
*.md annex.largefiles=nothing
*.bvec annex.largefiles=nothing
*.bval annex.largefiles=nothing

# Ensure these are always in annex
*.nii.gz annex.largefiles=anything
*.nii annex.largefiles=anything
*.edf annex.largefiles=anything
*.snirf annex.largefiles=anything
*.fif annex.largefiles=anything
```

## Superdatasets

Link multiple datasets (raw, derivatives, code) into one project:

```bash
# Create top-level project
datalad create -c yoda my-project
cd my-project

# Add raw data as subdataset
datalad clone -d . ria+ssh://server/store#~rawdata inputs/rawdata

# Add derivative datasets
datalad clone -d . ria+ssh://server/store#~fmriprep inputs/fmriprep

# Your analysis code lives in code/
# Your outputs go to the top level

datalad save -m "Set up project with raw + fmriprep inputs"
```

## Remote Collaboration

### GitHub/GitLab as Remote

```bash
# Create repo on GitHub first, then:
datalad siblings add -s github --url git@github.com:user/dataset.git

# Push metadata (git) to GitHub
datalad push --to github

# For large files, set up a special remote (e.g., S3, GIN, OSF)
```

### GIN (G-Node Infrastructure)

```bash
# GIN supports git-annex natively — ideal for neuroimaging
datalad siblings add -s gin --url git@gin.g-node.org:/user/dataset.git
datalad push --to gin  # pushes both git + annex content
```

### OSF

```bash
pip install datalad-osf
datalad osf-credentials  # one-time setup
datalad create-sibling-osf --title "My BIDS Dataset" -s osf
datalad push --to osf
```

## RIA Stores

Remote Indexed Archive — efficient storage for many datasets on shared filesystems or SSH servers.

### Create a RIA Store

```bash
# Local RIA (e.g., on shared lab storage)
datalad create-sibling-ria -s ria-storage \
    ria+file:///shared/lab/ria-store \
    --new-store-ok

# SSH RIA (remote server)
datalad create-sibling-ria -s ria-storage \
    ria+ssh://server.example.com/data/ria-store \
    --new-store-ok

# Push to RIA
datalad push --to ria-storage
```

### Clone from RIA

```bash
# Clone a dataset from RIA store
datalad clone ria+file:///shared/lab/ria-store#~dataset-name local-copy

# Get specific files (data is fetched on demand)
cd local-copy
datalad get sub-01/anat/sub-01_T1w.nii.gz
```

## HPC Workflows

### Working with BABS

BABS integrates with DataLad for HPC pipeline execution. See the `dicom2fmriprep` skill for
full BABS details. Key DataLad steps:

```bash
# 1. Make BIDS dataset a DataLad dataset
cd /path/to/bids
datalad create -f -c text2git .
datalad save -m "BIDS dataset ready for BABS"

# 2. Create container dataset
datalad create -c text2git containers
cd containers
datalad containers-add --url /path/to/container.sif pipeline-name

# 3. BABS handles the rest (init, submit, merge)
```

### Manual HPC Pattern (Without BABS)

```bash
# On login node: clone dataset
datalad clone ria+file:///shared/ria#~mybids /scratch/user/mybids
cd /scratch/user/mybids

# Get only needed subject
datalad get sub-${SUBJECT}/

# Run pipeline
singularity run pipeline.sif ...

# Save results
datalad save -m "Pipeline results for sub-${SUBJECT}"
datalad push --to ria-storage
```

## Reproducible Analyses

### datalad run

Track which commands produced which outputs:

```bash
# Run a command and record its provenance
datalad run -m "Preprocess sub-01" \
    --input inputs/rawdata/sub-01 \
    --output derivatives/preprocessed/sub-01 \
    "python code/preprocess.py --sub 01"

# The command, inputs, and outputs are recorded in git history
# Anyone can reproduce with:
datalad rerun <commit-hash>
```

### datalad containers-run

Same as `run` but uses a tracked container:

```bash
datalad containers-run -m "fMRIPrep sub-01" \
    --container-name fmriprep \
    --input inputs/rawdata/sub-01 \
    --output derivatives/fmriprep/sub-01 \
    "{img} inputs/rawdata derivatives/fmriprep participant --participant-label 01"
```

## Tips

- **Get data on demand**: `datalad get` fetches file content only when needed — clone is lightweight
- **Drop when done**: `datalad drop sub-01/` removes local content but keeps metadata
- **Unlock to edit**: annexed files are read-only; use `datalad unlock file.nii.gz` to edit
- **Check annex status**: `git annex info` shows storage usage
- **Migrate existing projects**: `datalad create -f .` works in any existing directory
