# BABS Detailed Reference

## Table of Contents
- [Full YAML Configuration Schema](#full-yaml-configuration-schema)
- [Advanced Workflows](#advanced-workflows)
- [CLI Command Reference](#cli-command-reference)
- [Consuming Results](#consuming-results)
- [Troubleshooting](#troubleshooting)

## Full YAML Configuration Schema

### `input_datasets`

```yaml
input_datasets:
    DATASET_NAME:                    # User-chosen key (e.g., "BIDS", "FreeSurfer")
        required_files:              # Glob patterns — subjects missing these are skipped
            - "func/*_bold.nii*"
            - "anat/*_T1w.nii*"
        is_zipped: false             # true for zipped derivative inputs
        origin_url: "/path/to/datalad/dataset"
        path_in_babs: inputs/data/BIDS
        # For zipped inputs only:
        unzipped_path_containing_subject_dirs: "freesurfer"
```

The **first listed dataset** becomes the positional BIDS input argument to the container.

### `cluster_resources`

| Key | SLURM Translation | Example |
|-----|-------------------|---------|
| `interpreting_shell` | `#!VALUE` | `/bin/bash` or `/bin/bash -l` |
| `hard_memory_limit` | `#SBATCH --mem=VALUE` | `32G` |
| `temporary_disk_space` | `#SBATCH --tmp=VALUE` | `200G` |
| `number_of_cpus` | `#SBATCH --cpus-per-task=VALUE` | `"6"` |
| `hard_runtime_limit` | `#SBATCH --time=VALUE` | `"24:00:00"` |
| `customized_text` | Copied verbatim | See below |

```yaml
cluster_resources:
    interpreting_shell: "/bin/bash"
    hard_memory_limit: 32G
    temporary_disk_space: 200G
    number_of_cpus: "6"
    hard_runtime_limit: "24:00:00"
    customized_text: |
        #SBATCH -p all
        #SBATCH --nodes=1
        #SBATCH --ntasks=1
        #SBATCH --propagate=NONE
```

### `script_preamble`

Bash commands run before the container. Use `|` for multiline. Do NOT quote commands.

```yaml
script_preamble: |
    source "${CONDA_PREFIX}"/bin/activate babs
    module load singularity
    export TEMPLATEFLOW_HOME=/shared/templateflow
```

### `job_compute_space`

Ephemeral scratch directory. Should auto-clean after job finishes.

```yaml
job_compute_space: "${TMPDIR}"
# Or a specific path:
job_compute_space: "/scratch/${USER}/babs_tmp"
```

### `singularity_args`

```yaml
singularity_args:
    - --cleanenv
    - --writable-tmpfs
    # Add --nv for GPU workloads
```

### `bids_app_args`

```yaml
bids_app_args:
    $SUBJECT_SELECTION_FLAG: "--participant-label"  # BABS special variable
    -w: "$BABS_TMPDIR"          # BABS placeholder for temp workspace
    --fs-license-file: "/path/to/license.txt"  # Auto-bound into container
    --output-spaces: "MNI152NLin2009cAsym:res-2"
    --force-bbr: ""             # Flag without value (empty string, Null, or NULL)
    --cifti-output: "91k"
    --n_cpus: "6"               # Quote numeric values
    --mem-mb: "30000"
    --skip-bids-validation: ""
    --notrack: ""
    -v: '-v'                    # Double verbose: -v -v
```

**Rules:**
- Do NOT include `--participant-label` or `--bids-filter-file` directly — BABS handles these via `$SUBJECT_SELECTION_FLAG`
- Use `$BABS_TMPDIR` for working directory (`-w`)
- Use `$SLURM_CPUS_PER_TASK` as env var in script_preamble if needed
- BABS auto-adds `--bids-filter-file` for fMRIPrep with multi-session data
- FreeSurfer license path is auto-bound into container at `/SGLR/FREESURFER_HOME/license.txt`
- BABS handles `$TEMPLATEFLOW_HOME` if the env var is set when running `babs init`

### `zip_foldernames`

Controls how outputs are zipped per subject. Version string becomes part of the zip filename.

**Legacy output layout** (fMRIPrep < 21.0):
```yaml
zip_foldernames:
    fmriprep: "24-1-1"       # → sub-XX_fmriprep-24-1-1.zip
    freesurfer: "24-1-1"     # → sub-XX_freesurfer-24-1-1.zip
```

**BIDS output layout** (fMRIPrep >= 21.0, with `all_results_in_one_zip`):
```yaml
all_results_in_one_zip: true
zip_foldernames:
    fmriprep_anat: "24-1-1"  # Single zip with everything
```

When `all_results_in_one_zip: true`, only ONE foldername is allowed.

### `imported_files` (optional)

Copy external files into the DataLad dataset (useful for custom config files):

```yaml
imported_files:
    - original_path: "/path/to/custom_config.yaml"
      analysis_path: "code/custom_config.yaml"
```

### `alert_log_messages` (optional)

Patterns to flag in failed job logs:

```yaml
alert_log_messages:
    stdout:
        - "fMRIPrep failed"
        - "Cannot allocate memory"
        - "Excessive topologic defect encountered"
        - "mris_curvature_stats: Could not open file"
        - "Numerical result out of range"
```

## Advanced Workflows

### Anat-Only + Ingressed FreeSurfer (Two-Stage Pipeline)

For large datasets, split fMRIPrep into two stages to optimize resources:

**Stage 1: Anat-only** (long walltime, low CPU)

```yaml
input_datasets:
    BIDS:
        required_files:
            - "anat/*_T1w.nii*"
        is_zipped: false
        origin_url: "/path/to/bids"
        path_in_babs: inputs/data/BIDS

cluster_resources:
    interpreting_shell: "/bin/bash"
    hard_memory_limit: 12G
    number_of_cpus: "2"
    hard_runtime_limit: "24:00:00"
    customized_text: |
        #SBATCH -p long
        #SBATCH --nodes=1

bids_app_args:
    $SUBJECT_SELECTION_FLAG: "--participant-label"
    -w: "$BABS_TMPDIR"
    --anat-only: ""
    --fs-license-file: "/path/to/license.txt"
    --output-spaces: "MNI152NLin2009cAsym:res-2"
    --notrack: ""

all_results_in_one_zip: true
zip_foldernames:
    fmriprep_anat: "24-1-1"
```

**Stage 2: Func with ingressed FreeSurfer** (shorter walltime, more CPU)

```yaml
input_datasets:
    BIDS:
        required_files:
            - "func/*_bold.nii*"
            - "anat/*_T1w.nii*"
        is_zipped: false
        origin_url: "/path/to/bids"
        path_in_babs: inputs/data/BIDS
    FreeSurfer:
        required_files:
            - "*fmriprep_anat*.zip"
        is_zipped: true
        origin_url: "/path/to/stage1_babs_project/output_ria"
        unzipped_path_containing_subject_dirs: "fmriprep_anat"
        path_in_babs: inputs/data/freesurfer

cluster_resources:
    interpreting_shell: "/bin/bash"
    hard_memory_limit: 30G
    number_of_cpus: "6"
    hard_runtime_limit: "8:00:00"
    customized_text: |
        #SBATCH -p normal
        #SBATCH --nodes=1

bids_app_args:
    $SUBJECT_SELECTION_FLAG: "--participant-label"
    -w: "$BABS_TMPDIR"
    --fs-subjects-dir: "inputs/data/freesurfer/freesurfer"
    --fs-license-file: "/path/to/license.txt"
    --output-spaces: "MNI152NLin2009cAsym:res-2"
    --force-bbr: ""
    --n_cpus: "6"
    --mem-mb: "28000"
    --notrack: ""

all_results_in_one_zip: true
zip_foldernames:
    fmriprep_func: "24-1-1"
```

### Multi-Session Processing

For multi-session data, use `--processing_level session` in `babs init`. BABS will:
- Process each session independently
- Auto-generate `--bids-filter-file` for fMRIPrep
- Create per-session output zips

```bash
babs init \
    --container_ds /path/to/fmriprep-container \
    --container_name fmriprep-24-1-1 \
    --container_config config.yaml \
    --processing_level session \
    --queue slurm \
    /path/to/my_babs_project
```

### Filtering Subjects

```bash
# Via CSV file during init
babs init ... --list_sub_file subjects.csv

# CSV format (subject-level):
# sub_id
# sub-01
# sub-02

# CSV format (session-level):
# sub_id,ses_id
# sub-01,ses-01
# sub-01,ses-02

# Via --select during submit
babs submit --select sub-01 ses-01 --select sub-02 ses-01

# Via inclusion file during submit
babs submit --inclusion-file my_subjects.csv
```

### Throttling Jobs

Limit simultaneous SLURM array tasks to avoid overwhelming the cluster:

```bash
babs init ... --throttle 10  # Max 10 concurrent jobs
```

## CLI Command Reference

### `babs init`
```bash
babs init \
    --container_ds PATH \
    --container_name NAME \
    --container_config YAML \
    --processing_level {subject,session} \
    --queue slurm \
    [--list_sub_file CSV] \
    [--keep_if_failed] \
    [--throttle N] \
    PROJECT_ROOT
```

### `babs check-setup`
```bash
babs check-setup [PROJECT_ROOT] [--job-test]
```
Always run with `--job-test` before bulk submission.

### `babs submit`
```bash
babs submit [PROJECT_ROOT] \
    [--count N] \
    [--select SUB [SES]] \
    [--inclusion-file CSV] \
    [--skip-running-jobs]
```
`--count`, `--select`, and `--inclusion-file` are mutually exclusive.

**WARNING**: Never kill `babs submit` while running.

### `babs status`
```bash
babs status [PROJECT_ROOT]
```

### `babs merge`
```bash
babs merge [PROJECT_ROOT] [--chunk-size 2000]
```
If merge fails, manually remove `merge_ds/` before retrying.

### `babs sync-code`
```bash
babs sync-code [PROJECT_ROOT] [-m "message"]
```

### `babs update-input-data`
```bash
babs update-input-data [PROJECT_ROOT] [--dataset-name BIDS]
```

## Consuming Results

After `babs merge`:

```bash
# Clone the output dataset
datalad clone \
    ria+file:///absolute/path/to/my_babs_project/output_ria#~data \
    my_outputs

cd my_outputs

# Get specific subject's results
datalad get sub-01_fmriprep-24-1-1.zip
unzip sub-01_fmriprep-24-1-1.zip

# Get all results
datalad get .
```

### Project Structure After Init

```
my_babs_project/
├── analysis/
│   ├── code/
│   │   ├── participant_job.sh      # Generated SLURM script
│   │   └── processing_inclusion.csv
│   ├── inputs/
│   │   └── data/
│   │       └── BIDS/              # Cloned input dataset
│   └── containers/
│       └── fmriprep-24-1-1.sif
└── output_ria/                     # RIA store for results
```

## Troubleshooting

### `babs init` fails
- Check all paths are absolute
- Verify container DataLad dataset was created correctly
- Use `--keep_if_failed` and run `babs check-setup` to diagnose

### `babs check-setup --job-test` fails
- Check `script_preamble` — are modules available?
- Verify Singularity/Apptainer is loadable
- Check SLURM partition exists (`sinfo -s`)
- Check FreeSurfer license path
- Look at the job log in `analysis/logs/`

### Jobs fail immediately
- Check `cluster_resources` — enough memory/time?
- Verify `job_compute_space` exists and is writable
- Check `singularity_args` — `--cleanenv` is usually needed

### `babs merge` fails
- Remove `merge_ds/` directory and retry
- Check that successful jobs actually completed (not just submitted)
- Try with `--chunk-size 500` for very large datasets

### DataLad issues
```bash
# If input dataset isn't a DataLad dataset:
cd /path/to/bids
datalad create -f -D "BIDS dataset" .

# If container dataset has issues:
datalad containers-list  # verify container is registered
```
