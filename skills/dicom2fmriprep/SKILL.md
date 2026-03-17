---
name: dicom2fmriprep
description: Generate scripts for the full fMRI preprocessing pipeline from raw DICOM files through BIDS conversion (heudiconv) to fMRIPrep, including HPC/SLURM execution via BABS. Use this skill whenever someone needs to preprocess fMRI data, convert DICOMs to BIDS, write heudiconv heuristics, run fMRIPrep on a cluster, set up BABS projects, fix BIDS validation errors, or generate any scripts related to the DICOM-to-fMRIPrep pipeline.
---

# fMRI DICOM-to-fMRIPrep Pipeline

This skill helps users generate scripts for the complete fMRI preprocessing pipeline:

```
Raw DICOMs → heudiconv (BIDS conversion) → BIDS validation → fMRIPrep → preprocessed data
                                                                ↑
                                                          (optionally via BABS on HPC)
```

## When to Use This Skill

- Converting unsorted DICOM files to BIDS format
- Writing heudiconv heuristic files from scratch
- Fixing BIDS validation errors
- Running fMRIPrep (locally or on HPC with Singularity)
- Setting up BABS projects for large-scale fMRIPrep on SLURM clusters
- Generating SLURM submission scripts for neuroimaging pipelines

## Pipeline Overview

### Step 1: DICOM to BIDS with heudiconv

heudiconv wraps dcm2niix and handles the full conversion from DICOMs to a BIDS-compliant dataset. The process has two passes:

**Pass 1 — Reconnaissance** (discover what's in the DICOMs):
```bash
heudiconv \
    --files /path/to/dicoms/{subject}/*/*/*.dcm \
    -o /path/to/bids_output \
    -f convertall \
    -s SUBJECT_ID \
    -c none
```
This produces `.heudiconv/{subject}/info/dicominfo.tsv` — a table of every DICOM series with metadata (dimensions, TR, protocol name, etc.). The user needs this to write their heuristic.

**Pass 2 — Convert** (apply the heuristic):
```bash
heudiconv \
    --files /path/to/dicoms/{subject}/*/*/*.dcm \
    -o /path/to/bids_output \
    -f /path/to/heuristic.py \
    -s SUBJECT_ID \
    -ss SESSION_LABEL \
    -c dcm2niix -b --minmeta --overwrite
```

#### Writing a Heuristic File

The heuristic maps DICOM series to BIDS filenames. Always ask the user to share their `dicominfo.tsv` first — it tells you exactly what series exist and how to match them.

```python
import os

def create_key(template, outtype=('nii.gz',), annotation_classes=None):
    if template is None or not template:
        raise ValueError("Template must be a valid format string")
    return (template, outtype, annotation_classes)

def infotodict(seqinfo):
    """Map DICOM series to BIDS filenames based on series metadata."""

    # Define BIDS keys — adjust paths based on what the dataset contains
    t1w = create_key('sub-{subject}/{session}/anat/sub-{subject}_{session}_T1w')
    func_rest = create_key(
        'sub-{subject}/{session}/func/sub-{subject}_{session}_task-rest_run-{item:02d}_bold'
    )
    func_task = create_key(
        'sub-{subject}/{session}/func/sub-{subject}_{session}_task-TASKNAME_run-{item:02d}_bold'
    )
    fmap_ap = create_key('sub-{subject}/{session}/fmap/sub-{subject}_{session}_dir-AP_epi')
    fmap_pa = create_key('sub-{subject}/{session}/fmap/sub-{subject}_{session}_dir-PA_epi')
    dwi = create_key('sub-{subject}/{session}/dwi/sub-{subject}_{session}_dir-AP_dwi')

    info = {t1w: [], func_rest: [], func_task: [], fmap_ap: [], fmap_pa: [], dwi: []}

    for s in seqinfo:
        # Filter out motion-corrected and derived series
        if s.is_motion_corrected or s.is_derived:
            continue

        # Match by protocol_name, dimensions, TR — adapt to your scanner's naming
        if 'mprage' in s.protocol_name.lower() and s.dim3 >= 160:
            info[t1w].append(s.series_id)
        elif 'rest' in s.protocol_name.lower() and s.dim4 > 50:
            info[func_rest].append(s.series_id)
        elif 'task' in s.protocol_name.lower() and s.dim4 > 50:
            info[func_task].append(s.series_id)
        elif 'distortion' in s.protocol_name.lower() and 'AP' in s.protocol_name:
            info[fmap_ap] = [s.series_id]
        elif 'distortion' in s.protocol_name.lower() and 'PA' in s.protocol_name:
            info[fmap_pa] = [s.series_id]
        elif 'dti' in s.protocol_name.lower() or 'dwi' in s.protocol_name.lower():
            info[dwi].append(s.series_id)

    return info
```

**Key matching fields from `seqinfo`**: `protocol_name`, `series_description`, `sequence_name`, `dim1`-`dim4`, `TR`, `TE`, `image_type`, `is_motion_corrected`, `is_derived`.

**Important heuristic rules:**
- Use `.append()` for series that may have multiple runs (BOLD, DWI)
- Use `= [s.series_id]` for single-occurrence series (T1w, fieldmaps)
- Always filter `is_motion_corrected` and `is_derived` for functional data
- Use `.lower()` on protocol names — scanner naming is inconsistent
- For single-session studies, omit `{session}` from templates entirely

For the complete SeqInfo field reference and advanced patterns (multi-echo, IntendedFor population, ReproIn), see `references/heudiconv-details.md`.

### Step 2: BIDS Validation

After conversion, validate the dataset. Present the user with options:

**Option A — CLI validator** (recommended for scripted workflows):
```bash
# Install
npm install -g bids-validator
# or: pip install bids-validator

# Run
bids-validator /path/to/bids_dataset
```

**Option B — Web validator** (good for quick checks, no install):
Direct users to https://bids-standard.github.io/bids-validator/

**Common BIDS fixes the skill should help generate scripts for:**
- Missing `dataset_description.json` → generate it
- Misnamed files → rename script
- Missing sidecar JSON fields (e.g., `TaskName` for func, `IntendedFor` for fieldmaps) → patch script
- Extra files that aren't BIDS-compliant → add to `.bidsignore`

### Step 3: fMRIPrep

#### Running Locally with Singularity

```bash
# Build the image (do this once)
singularity build /path/to/fmriprep-<VERSION>.sif docker://nipreps/fmriprep:<VERSION>

# Pre-fetch TemplateFlow templates (required for offline HPC nodes)
export TEMPLATEFLOW_HOME=/path/to/templateflow
python -c "
from templateflow.api import get
get(['MNI152NLin2009cAsym', 'MNI152NLin6Asym', 'OASIS30ANTs', 'fsaverage', 'fsaverage5', 'fsaverage6', 'fsLR'])
"

# Run fMRIPrep
export SINGULARITYENV_FS_LICENSE=$HOME/.freesurfer.txt
export SINGULARITYENV_TEMPLATEFLOW_HOME="/templateflow"

singularity run --cleanenv \
    -B ${BIDS_DIR}:/data:ro \
    -B ${OUTPUT_DIR}:/out \
    -B ${WORK_DIR}:/work \
    -B ${TEMPLATEFLOW_HOME}:/templateflow \
    /path/to/fmriprep-<VERSION>.sif \
    /data /out participant \
    --participant-label ${SUBJECT} \
    -w /work \
    --output-spaces MNI152NLin2009cAsym:res-2 \
    --fs-license-file /opt/freesurfer/license.txt \
    --nthreads ${SLURM_CPUS_PER_TASK:-8} \
    --omp-nthreads 8 \
    --mem_mb 30000 \
    --skip-bids-validation \
    --notrack
```

#### Commonly Forgotten Flags

Always ask the user about these and help them decide:

| Flag | What it does | When to use |
|------|-------------|-------------|
| `--output-spaces` | Where to resample results | Always specify explicitly. Common: `MNI152NLin2009cAsym:res-2`. Add `MNI152NLin6Asym:res-2` if ICA-AROMA needed later |
| `--fs-license-file` | FreeSurfer license path | Always required. Free from https://surfer.nmr.mgh.harvard.edu/registration.html |
| `--fs-no-reconall` | Skip FreeSurfer surfaces | Saves hours; use when surfaces aren't needed |
| `--cifti-output 91k` | Output CIFTI dense timeseries | For HCP-style surface+volume analyses |
| `--dummy-scans N` | Discard initial volumes | When auto-detection isn't appropriate |
| `--fd-spike-threshold` | Motion outlier threshold | Default 0.5mm; stricter = 0.2mm |
| `--use-syn-sdc warn` | Fieldmap-less distortion correction | When no fieldmaps available |
| `--ignore fieldmaps` | Skip fieldmap correction | When fieldmaps are bad/unusable |
| `--anat-only` | Only anatomical processing | For running FreeSurfer first, then func later |
| `--low-mem` | Reduce memory at cost of disk I/O | When memory-constrained |

#### Resource Guidelines

| Scenario | CPUs | Memory | Walltime | Disk (work) |
|----------|------|--------|----------|-------------|
| With FreeSurfer | 4-8 | 30 GB | 12-24h | 15-30 GB/sub |
| Without FreeSurfer | 4-8 | 16 GB | 1-4h | 5-15 GB/sub |
| Anat-only | 2-4 | 12 GB | 6-16h | 10-20 GB/sub |

For detailed fMRIPrep flags, troubleshooting, and output structure, see `references/fmriprep-details.md`.

### Step 4 (Optional): Large-Scale Processing with BABS

BABS (BIDS App Bootstrap) automates large-scale fMRIPrep runs on SLURM clusters with DataLad-based provenance tracking.

#### BABS Workflow

```
1. Prepare inputs (BIDS as DataLad dataset + Singularity container as DataLad dataset)
2. Write configuration YAML
3. babs init → creates project
4. babs check-setup --job-test → verify everything works
5. babs submit --count N → submit jobs
6. babs status → monitor
7. babs merge → collect results
```

#### Preparing Inputs

```bash
# 1. Make BIDS dataset a DataLad dataset (if not already)
cd /path/to/bids_dataset
datalad create -f -D "My BIDS dataset" .

# 2. Create container DataLad dataset
singularity build fmriprep-24.1.1.sif docker://nipreps/fmriprep:24.1.1
datalad create -D "fMRIPrep container" fmriprep-container
cd fmriprep-container
datalad containers-add --url /full/path/to/fmriprep-24.1.1.sif fmriprep-24-1-1
```

#### Configuration YAML

Help the user fill in this template by asking about their cluster setup:

```yaml
input_datasets:
    BIDS:
        required_files:
            - "func/*_bold.nii*"
            - "anat/*_T1w.nii*"
        is_zipped: false
        origin_url: "/path/to/bids_datalad_dataset"
        path_in_babs: inputs/data/BIDS

cluster_resources:
    interpreting_shell: "/bin/bash"
    hard_memory_limit: 32G
    temporary_disk_space: 200G
    number_of_cpus: "6"
    hard_runtime_limit: "24:00:00"
    customized_text: |
        #SBATCH -p YOUR_PARTITION
        #SBATCH --nodes=1
        #SBATCH --ntasks=1

script_preamble: |
    source "${CONDA_PREFIX}"/bin/activate babs
    module load singularity

job_compute_space: "${TMPDIR}"

singularity_args:
    - --cleanenv

bids_app_args:
    $SUBJECT_SELECTION_FLAG: "--participant-label"
    -w: "$BABS_TMPDIR"
    --fs-license-file: "/path/to/license.txt"
    --output-spaces: "MNI152NLin2009cAsym:res-2"
    --force-bbr: ""
    --n_cpus: "6"
    --mem-mb: "30000"
    --skip-bids-validation: ""
    --notrack: ""

zip_foldernames:
    fmriprep: "24-1-1"
    freesurfer: "24-1-1"

alert_log_messages:
    stdout:
        - "fMRIPrep failed"
        - "Cannot allocate memory"
        - "Excessive topologic defect encountered"
```

**When asking the user about cluster config, help them decide:**
- **Partition**: ask what's available on their cluster (`sinfo -s`)
- **Memory**: 32G is safe default; 16G if `--fs-no-reconall`
- **CPUs**: 4-8 is typical; diminishing returns beyond 16
- **Walltime**: 24h with FreeSurfer, 6h without
- **Temp disk**: 200G is generous; 100G usually enough
- **Modules**: what module system they use (`module avail singularity`)

#### Running BABS

```bash
# Initialize project
babs init \
    --container_ds /path/to/fmriprep-container \
    --container_name fmriprep-24-1-1 \
    --container_config /path/to/config.yaml \
    --processing_level subject \
    --queue slurm \
    /path/to/my_babs_project

# Verify setup (always do this first!)
babs check-setup /path/to/my_babs_project --job-test

# Submit jobs (start small to verify)
babs submit /path/to/my_babs_project --count 2

# Check status
babs status /path/to/my_babs_project

# Once all jobs succeed, merge results
babs merge /path/to/my_babs_project

# Clone output for downstream use
datalad clone \
    ria+file:///path/to/my_babs_project/output_ria#~data \
    my_fmriprep_outputs
```

For the full BABS YAML reference, advanced configurations (anat-only + ingressed FreeSurfer workflow, multi-session handling), see `references/babs-details.md`.

## Guiding New Users

Many users will be new to this pipeline. Don't assume they know the tools — walk them through it step by step. Start every interaction by understanding where they are:

1. **Assess their starting point**: Ask what they have (raw DICOMs? already in BIDS? already ran fMRIPrep but need HPC scaling?). Don't dump the whole pipeline on someone who only needs one step.
2. **Gather their data details before generating anything**:
   - How are the DICOMs organized? (flat directory, by subject, by session?)
   - What scanner and modalities? (Siemens/GE/Philips, T1w, BOLD, fieldmaps, DWI?)
   - How many subjects and sessions?
   - Where will they run fMRIPrep — local machine or HPC cluster?
   - If HPC: what scheduler (SLURM), what partitions, what's their scratch space?
3. **Explain each step as you go**: Briefly tell them *why* each step matters (e.g., "heudiconv's first pass doesn't convert anything — it just catalogs your DICOM series so we can write the mapping rules"). Users who understand the reasoning can troubleshoot on their own later.
4. **Generate one stage at a time**: Don't produce all scripts at once. Generate the heudiconv heuristic first, have them run the reconnaissance pass, share the `dicominfo.tsv`, then refine the heuristic together. Move to BIDS validation only after conversion works.
5. **Offer to explain unfamiliar concepts**: Terms like "BIDS", "heuristic file", "DataLad dataset", "RIA store" may be new. Define them naturally when they first come up.

## Generating Scripts

When generating scripts, follow these principles:

1. **Generate modular scripts**: separate scripts for each pipeline stage so users can run/debug independently
2. **Include error handling**: check for missing files, validate outputs
3. **Add comments**: explain what each section does, especially heudiconv matching logic
4. **Make paths configurable**: use variables at the top of scripts, not hardcoded paths
5. **Support both bash and Python**: generate whichever the user prefers

### Recommended script structure:
```
scripts/
├── 01_dicom_to_bids.sh        # heudiconv conversion
├── heuristic.py                # heudiconv heuristic file
├── 02_validate_bids.sh         # BIDS validation + fixes
├── 03_run_fmriprep.sh          # fMRIPrep (local) or BABS setup
└── 04_check_outputs.sh         # verify fMRIPrep outputs
```

## Common Pitfalls

- **Not filtering MoCo series**: Siemens scanners duplicate BOLD as motion-corrected series. Always check `is_motion_corrected`.
- **Missing `--minmeta` in heudiconv**: Without it, JSON sidecars balloon with dcmstack metadata.
- **TemplateFlow on offline nodes**: Pre-fetch templates on the login node before submitting jobs.
- **FreeSurfer license**: Forgetting to set it up is the #1 fMRIPrep failure. Always verify the path.
- **Mixing fMRIPrep versions**: Process the entire dataset with one version. Don't mix.
- **Not running `babs check-setup --job-test`**: Always test before bulk submission.
- **Killing `babs submit`**: Never interrupt it mid-run — job IDs won't be captured.

## References

- `references/heudiconv-details.md` — Full SeqInfo fields, advanced heuristic patterns, multi-echo, IntendedFor
- `references/fmriprep-details.md` — Complete flag reference, output structure, confounds, troubleshooting
- `references/babs-details.md` — Full YAML schema, advanced workflows (anat-only + ingressed-fs), consuming results
