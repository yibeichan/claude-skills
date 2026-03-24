---
name: bids-format
description: >
  BIDS standard for all data types — MRI, DWI, PET, EEG, MEG, iEEG, fNIRS, behavioral,
  annotations, motion capture, microscopy, physiology, and multi-modal datasets. Covers BIDS
  naming conventions (entities, suffixes, extensions), dataset creation, modality-specific
  conversion tools (heudiconv, dcm2bids, MNE-BIDS, pypet2bids), validation, project directory
  layout (sourcedata, rawdata, derivatives, code, stimuli, phenotype), derivatives organization,
  DataLad version control, multi-experiment projects, and sharing on OpenNeuro.
  Trigger keywords: BIDS dataset, BIDS format, BIDS naming, BIDS entities, BIDS convert,
  organize project, project structure, rawdata, derivatives, sourcedata, phenotype,
  participants.tsv, dataset_description.json, multi-modal BIDS, behavioral data BIDS, EEG BIDS,
  DWI BIDS, PET BIDS, annotation data, research data management, DataLad, OpenNeuro, data sharing.
---

# BIDS Format & Project Organization

BIDS standard for any data type — naming conventions, dataset creation, validation, and project
organization for single-modality through multi-modal datasets.

## When to Use This Skill

- Naming or renaming files to follow BIDS conventions
- Setting up a new BIDS dataset or research project from scratch
- Converting any data (imaging, behavioral, annotations, physiology) into BIDS
- Organizing derivatives and analysis outputs
- Managing multi-modal, multi-experiment, or multi-site projects
- Preparing data for sharing on OpenNeuro or other repositories

## BIDS Naming Conventions

### Filename Structure

Every BIDS filename follows this pattern:

```
sub-<label>[_ses-<label>][_<entity>-<label>]*_<suffix>.<extension>
```

Example: `sub-01_ses-pre_task-rest_run-02_bold.nii.gz`

### Entities (Key-Value Pairs)

Entities appear in a **fixed order**. Not all entities apply to all datatypes.

| Entity | Key | Example | Used in |
|--------|-----|---------|---------|
| Subject | `sub-` | `sub-01` | All (required) |
| Session | `ses-` | `ses-baseline` | All (if multi-session) |
| Task | `task-` | `task-rest` | func, eeg, meg, ieeg, nirs, beh, pet |
| Acquisition | `acq-` | `acq-highres` | anat, func, dwi, perf, pet |
| Contrast agent | `ce-` | `ce-gadolinium` | anat |
| Reconstruction | `rec-` | `rec-magnitude` | anat, pet |
| Phase encoding dir | `dir-` | `dir-AP` | dwi, fmap, perf |
| Run | `run-` | `run-01` | All (if repeated) |
| Echo | `echo-` | `echo-1` | func, fmap (multi-echo) |
| Part | `part-` | `part-mag` | anat, func |
| Recording | `recording-` | `recording-autosampler` | pet (blood), physio |
| Tracer | `trc-` | `trc-FDG` | pet |
| Space | `space-` | `space-MNI152NLin2009cAsym` | Derivatives only |
| Description | `desc-` | `desc-preproc` | Derivatives only |

### Suffixes by Datatype

| Datatype | Common Suffixes |
|----------|----------------|
| `anat/` | `T1w`, `T2w`, `FLAIR`, `T2starw`, `PDw`, `inplaneT1`, `inplaneT2`, `angio`, `defacemask` |
| `func/` | `bold`, `sbref`, `events`, `physio`, `stim` |
| `dwi/` | `dwi`, `sbref` (+ `.bval`, `.bvec` sidecars) |
| `fmap/` | `phasediff`, `magnitude1`, `magnitude2`, `phase1`, `phase2`, `fieldmap`, `epi` |
| `perf/` | `asl`, `m0scan`, `aslcontext` |
| `pet/` | `pet`, `blood` |
| `eeg/` | `eeg`, `channels`, `electrodes`, `coordsystem`, `events` |
| `meg/` | `meg`, `channels`, `coordsystem`, `events` |
| `ieeg/` | `ieeg`, `channels`, `electrodes`, `coordsystem`, `events` |
| `nirs/` | `nirs`, `channels`, `optodes`, `coordsystem`, `events` |
| `beh/` | `beh`, `events` |
| `motion/` | `motion`, `channels` |

### Naming Rules

- Labels are **alphanumeric only** — no spaces, underscores, or special characters in values
- Entities are separated by underscores: `sub-01_task-rest_bold.nii.gz`
- Entity order is fixed — don't rearrange (sub → ses → task → acq → ce → rec → dir → run → echo → part → suffix)
- Every data file needs a JSON sidecar with the same name (except `.json` extension)
- TSV files also get JSON sidecars describing their columns

## BIDS Data Types

BIDS supports **14 data types**:

| Datatype | Directory | What goes here |
|----------|-----------|---------------|
| Anatomical MRI | `anat/` | T1w, T2w, FLAIR, PD, angio |
| Functional MRI | `func/` | BOLD, events.tsv, physio |
| Diffusion MRI | `dwi/` | DWI, bval, bvec |
| Fieldmaps | `fmap/` | Phase-diff, pepolar, fieldmap |
| Perfusion (ASL) | `perf/` | ASL, M0scan |
| PET | `pet/` | PET images, blood data |
| EEG | `eeg/` | Scalp EEG recordings |
| MEG | `meg/` | MEG recordings |
| iEEG | `ieeg/` | Intracranial EEG, electrode coords |
| fNIRS | `nirs/` | Near-infrared spectroscopy |
| Motion capture | `motion/` | Motion tracking data |
| Microscopy | `micr/` | Microscopy images |
| MR Spectroscopy | `mrs/` | MRS data |
| Behavioral | `beh/` | Behavioral-only tasks (no imaging) |

**Key insight**: `beh/` is for standalone behavioral data (no concurrent imaging). Behavioral data
*during* imaging (e.g., button presses during fMRI) goes in `func/` as `_events.tsv`.

## Project Directory Layout

```
my-project/
├── dataset_description.json    # Required: project metadata
├── README                      # Required: human-readable description
├── CHANGES                     # Optional: version history
├── LICENSE                     # Recommended: data license
├── participants.tsv            # Required: subject demographics
├── participants.json           # Required: column descriptions
├── sourcedata/                 # Raw unprocessed data (DICOMs, raw EEG, etc.)
│   └── sub-01/                 # Not required to be BIDS-formatted
├── sub-01/
│   ├── ses-01/                 # Optional session level
│   │   ├── anat/
│   │   ├── func/
│   │   ├── dwi/
│   │   ├── eeg/
│   │   ├── beh/
│   │   └── ...
│   └── sub-01_sessions.tsv
├── phenotype/                  # Questionnaires, clinical scores, assessments
│   ├── depression_scores.tsv
│   └── depression_scores.json
├── stimuli/                    # Shared stimulus files
├── code/                       # Analysis scripts, pipelines
└── derivatives/                # Pipeline outputs (each a BIDS derivative dataset)
    ├── fmriprep/
    │   ├── dataset_description.json
    │   └── sub-01/
    ├── qsiprep/
    └── custom-analysis/
```

### When to Use `sourcedata/` vs Project Root

| Approach | When to use |
|----------|-------------|
| Root = BIDS raw, `sourcedata/` holds originals | Most common. DICOMs/raw files in `sourcedata/`, converted BIDS at root |
| `rawdata/` + `sourcedata/` both as subdirs | Multi-experiment projects or multiple BIDS datasets |
| Root = BIDS raw, no `sourcedata/` | Small projects where originals stored elsewhere |

## Multi-Modal Dataset Example

A single subject with MRI, EEG, behavioral, and phenotype data:

```
my-multimodal-study/
├── dataset_description.json
├── participants.tsv
├── participants.json
├── phenotype/
│   ├── anxiety_scores.tsv              # Subject-level questionnaire
│   └── anxiety_scores.json
├── stimuli/
│   └── task-emotionreg_stimuli.csv
├── sub-01/
│   └── ses-01/
│       ├── anat/
│       │   ├── sub-01_ses-01_T1w.nii.gz
│       │   └── sub-01_ses-01_T1w.json
│       ├── func/
│       │   ├── sub-01_ses-01_task-emotionreg_bold.nii.gz
│       │   ├── sub-01_ses-01_task-emotionreg_bold.json
│       │   └── sub-01_ses-01_task-emotionreg_events.tsv   # In-scanner behavior
│       ├── dwi/
│       │   ├── sub-01_ses-01_dir-AP_dwi.nii.gz
│       │   ├── sub-01_ses-01_dir-AP_dwi.bval
│       │   └── sub-01_ses-01_dir-AP_dwi.bvec
│       ├── eeg/
│       │   ├── sub-01_ses-01_task-emotionreg_eeg.vhdr     # Same task, separate session
│       │   ├── sub-01_ses-01_task-emotionreg_eeg.json
│       │   ├── sub-01_ses-01_task-emotionreg_channels.tsv
│       │   └── sub-01_ses-01_task-emotionreg_events.tsv
│       └── beh/
│           ├── sub-01_ses-01_task-stroop_events.tsv        # Standalone behavioral
│           └── sub-01_ses-01_task-stroop_events.json
```

## Required Top-Level Files

### dataset_description.json

```json
{
    "Name": "My Research Project",
    "BIDSVersion": "1.9.0",
    "DatasetType": "raw",
    "License": "CC BY 4.0",
    "Authors": ["Last, First M.", "Last2, First2"],
    "Acknowledgements": "Funding: NIH R01-XX12345",
    "GeneratedBy": [{"Name": "heudiconv", "Version": "1.1.0"}]
}
```

For **derivatives**, use `"DatasetType": "derivative"` and add `SourceDatasets` and `GeneratedBy`.

### participants.tsv / participants.json

```
participant_id	age	sex	group	handedness
sub-01	28	M	control	right
sub-02	32	F	patient	left
```

The sidecar JSON describes each column with `Description`, `Units`, and/or `Levels`.

## Modality-Specific Conversion Tools

| Data type | Tool | Reference |
|-----------|------|-----------|
| MRI (DICOM→NIfTI) | heudiconv / dcm2bids | `dicom2fmriprep` skill, `references/modality-conversions.md` |
| EEG / MEG / iEEG / fNIRS | MNE-BIDS | `references/electrophys-bids.md` |
| PET | pypet2bids / manual | `references/pet-bids.md` |
| Behavioral | Manual / custom script | TSV + JSON sidecars (see below) |
| Phenotype / Annotations | Manual | TSV + JSON in `phenotype/` |

## Behavioral and Annotation Data

### Standalone Behavioral Tasks (`beh/`)

```
sub-01/beh/
├── sub-01_task-stroop_beh.tsv       # Continuous recordings
├── sub-01_task-stroop_beh.json
├── sub-01_task-stroop_events.tsv    # Discrete events (onset, duration, trial_type, ...)
└── sub-01_task-stroop_events.json
```

### Events During Imaging

Place `_events.tsv` in the same directory as the imaging file. Required columns: `onset`, `duration`.

```
onset	duration	trial_type	response_time	accuracy
0.0	0.5	target	0.432	1
2.5	0.5	nontarget	0.567	1
```

### Where Annotations Go

| Annotation type | Where it goes | Format |
|----------------|---------------|--------|
| Trial-level behavioral coding | `_events.tsv` (extra columns) | TSV |
| Subject-level scores/ratings | `phenotype/` | TSV + JSON |
| Video/audio annotations | `_events.tsv` with timestamps | TSV |
| Clinical assessments | `phenotype/` | TSV + JSON |

### Phenotype Directory

For questionnaires and subject-level data beyond demographics. Each TSV needs `participant_id`
as the first column:

```
participant_id	bdi_total	bdi_cognitive	bdi_somatic
sub-01	12	5	7
sub-02	28	14	14
```

## Organizing Derivatives

Every pipeline output is its own BIDS derivative dataset with a `dataset_description.json`.

```
derivatives/
├── fmriprep/           # fMRI preprocessing
├── qsiprep/            # DWI preprocessing
├── freesurfer/         # Surface reconstruction
├── mriqc/              # Quality metrics
├── xcpd/               # Post-processing (confound regression, parcellation)
├── mne-preprocess/     # EEG/MEG preprocessing
├── first-level/        # Subject-level statistical maps
└── group-analysis/     # Group-level results
```

**Derivative naming**: `sub-XX_[entities]_space-<label>_desc-<label>_<suffix>.<ext>`

The `desc-` entity distinguishes processing variants (e.g., `desc-preproc`, `desc-filtered`).

## DataLad for Version Control

```bash
# Create dataset (text2git: text files in git, binaries in git-annex)
datalad create -c text2git my-project

# Save changes
datalad save -m "Add raw BIDS data for sub-01"

# Superdataset linking rawdata + derivatives
datalad create -c text2git my-project
datalad clone -d . <url-to-rawdata> inputs/rawdata
datalad clone -d . <url-to-derivatives> derivatives/fmriprep
```

For full DataLad workflows (RIA stores, collaboration, HPC), see `references/datalad-workflows.md`.

## BIDS Validation

```bash
# CLI validator
pip install bids-validator  # or: npm install -g bids-validator
bids-validator /path/to/dataset
```

**Common fixes:** missing `dataset_description.json`, missing sidecar JSONs, unexpected files
(add to `.bidsignore`), wrong entity ordering in filenames.

## Sharing and Archiving

**Before sharing checklist:**
- [ ] Deface anatomical images (`pydeface`, `mri_deface`)
- [ ] Remove `sourcedata/`, dates from sidecars, identifiable free-text
- [ ] Validate with `bids-validator`
- [ ] Add `LICENSE` and complete `dataset_description.json`

| Repository | Data types | Notes |
|-----------|------------|-------|
| OpenNeuro | All BIDS | Largest BIDS repo. Upload: `openneuro upload /path/to/dataset` |
| GIN | All BIDS | Git-annex native, good for DataLad |
| Dandi | Neurophysiology | NWB format preferred |
| OSF / Zenodo | Any | General-purpose, DOI minting |

## Common Pitfalls

- **Wrong entity order**: entities must follow the fixed order (sub → ses → task → acq → ... → suffix)
- **Behavioral data in wrong place**: `beh/` = standalone; during-scan → `_events.tsv` in imaging dir
- **Missing JSON sidecars**: every data file and TSV needs a sidecar
- **Inconsistent subject IDs**: same `sub-XX` everywhere including `phenotype/` TSVs
- **Forgetting `phenotype/`**: questionnaires go at project level, not in subject directories
- **Not defacing before sharing**: anatomical MRIs contain identifiable facial features
- **Mixing raw and derived**: keep derivatives in `derivatives/`, never modify raw data

## References

- `references/modality-conversions.md` — Detailed conversion guides for each modality (MRI, EEG, MEG, PET, behavioral, physio)
- `references/electrophys-bids.md` — EEG/MEG/iEEG/fNIRS with MNE-BIDS: formats, code, batch conversion
- `references/pet-bids.md` — PET-specific BIDS: required metadata, blood data, tracers
- `references/datalad-workflows.md` — DataLad: RIA stores, superdatasets, HPC workflows, reproducibility
