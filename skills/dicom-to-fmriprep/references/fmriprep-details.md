# fMRIPrep Detailed Reference

## Table of Contents
- [Complete Flag Reference](#complete-flag-reference)
- [Output Structure](#output-structure)
- [Confounds Reference](#confounds-reference)
- [SLURM Script Template](#slurm-script-template)
- [Troubleshooting](#troubleshooting)

## Complete Flag Reference

### Input/Output
| Flag | Description |
|------|-------------|
| `bids_dir` | Positional: path to BIDS dataset |
| `output_dir` | Positional: path for derivatives |
| `analysis_level` | `participant` (subject-level) |
| `--participant-label` | Subject IDs without `sub-` prefix |
| `--task-id` | Process only specific task |
| `--bids-filter-file` | JSON for custom BIDS input filtering |
| `-w, --work-dir` | Working directory (keep for crash recovery) |
| `--skip-bids-validation` | Skip BIDS validation (use only after manual validation) |

### Output Spaces
| Flag | Description |
|------|-------------|
| `--output-spaces` | Space-delimited list of output spaces |

Common spaces:
- `MNI152NLin2009cAsym` — Default volumetric template (most common)
- `MNI152NLin2009cAsym:res-2` — Same, at 2mm resolution
- `MNI152NLin6Asym:res-2` — FSL's MNI (required for ICA-AROMA post-processing)
- `fsaverage` / `fsaverage5` / `fsaverage6` — FreeSurfer surface spaces
- `fsnative` — Subject's native surface
- `T1w` — Subject's native anatomical space

### FreeSurfer
| Flag | Description |
|------|-------------|
| `--fs-license-file` | Path to FreeSurfer license.txt |
| `--fs-no-reconall` | Skip FreeSurfer surface reconstruction (saves hours) |
| `--fs-subjects-dir` | Reuse existing FreeSurfer recon-all output |

### Distortion Correction
| Flag | Description |
|------|-------------|
| `--ignore fieldmaps` | Skip fieldmap-based SDC |
| `--use-syn-sdc warn` | Enable fieldmap-less SyN SDC as fallback |
| `--force-syn-sdc` | Force SyN SDC even with fieldmaps |

### Skull Stripping
| Flag | Description |
|------|-------------|
| `--skull-strip-template` | Template for brain extraction (default: `OASIS30ANTs`) |
| `--skull-strip-t1w` | `auto`, `skip`, or `force` (default: `force`) |
| `--skull-strip-fixed-seed` | Reproducible skull stripping |

### Resource Control
| Flag | Description |
|------|-------------|
| `--nthreads` / `--nprocs` / `--n-cpus` | Max total threads |
| `--omp-nthreads` | Max threads per process |
| `--mem-mb` / `--mem` | Memory limit in MB |
| `--low-mem` | Trade disk I/O for lower memory usage |

### Quality & Scans
| Flag | Description |
|------|-------------|
| `--dummy-scans N` | Override auto non-steady-state detection |
| `--fd-spike-threshold` | FD threshold for motion outliers (default: 0.5mm) |
| `--dvars-spike-threshold` | DVARS outlier threshold (default: 1.5) |
| `--bold2anat-dof` | BOLD-to-T1w registration DOF: 6, 9, or 12 (default: 6) |

### Other
| Flag | Description |
|------|-------------|
| `--cifti-output 91k` | Output CIFTI dense timeseries |
| `--anat-only` | Only anatomical workflows |
| `--random-seed N` | For reproducibility |
| `--notrack` | Disable usage tracking |
| `--force-bbr` | Force boundary-based registration |
| `--ignore slicetiming` | Skip slice timing correction |

**Note:** `--use-aroma` was removed in fMRIPrep 23.1.0. Use [fmripost-aroma](https://github.com/nipreps/fmripost-aroma) instead.

## Output Structure

```
<output_dir>/
├── dataset_description.json
├── sub-<label>.html                    # Visual QC report (open in browser!)
├── sub-<label>/
│   ├── anat/
│   │   ├── *_desc-preproc_T1w.nii.gz          # Preprocessed T1w
│   │   ├── *_desc-brain_mask.nii.gz            # Brain mask
│   │   ├── *_dseg.nii.gz                       # Tissue segmentation
│   │   ├── *_label-{CSF,GM,WM}_probseg.nii.gz # Probability maps
│   │   ├── *_from-MNI*_to-T1w_xfm.h5          # MNI→native transform
│   │   ├── *_from-T1w_to-MNI*_xfm.h5          # Native→MNI transform
│   │   └── *_hemi-{L,R}_{pial,white,midthickness}.surf.gii  # Surfaces
│   └── func/
│       ├── *_space-<space>_desc-preproc_bold.nii.gz  # Preprocessed BOLD
│       ├── *_space-<space>_desc-brain_mask.nii.gz     # BOLD brain mask
│       ├── *_desc-confounds_timeseries.tsv            # Confounds
│       ├── *_desc-confounds_timeseries.json           # Confounds metadata
│       ├── *_from-boldref_to-T1w_xfm.txt             # BOLD→T1w transform
│       ├── *_bold.dtseries.nii                        # CIFTI (if --cifti-output)
│       └── *_space-T1w_desc-aparcaseg_dseg.nii.gz    # Parcellation in BOLD space
└── sourcedata/
    └── freesurfer/                     # FreeSurfer recon-all output
        └── sub-<label>/
```

## Confounds Reference

The `*_desc-confounds_timeseries.tsv` contains:

### Motion Parameters
- `trans_x`, `trans_y`, `trans_z` — Translation (mm)
- `rot_x`, `rot_y`, `rot_z` — Rotation (radians)
- Each has `_derivative1`, `_power2`, `_derivative1_power2` variants (24-parameter expansion)

### Global Signals
- `csf`, `white_matter`, `global_signal` (+ derivative/power variants)

### Quality Metrics
- `framewise_displacement` — Head motion summary (mm)
- `rmsd` — Root mean squared deviation
- `dvars`, `std_dvars` — Intensity change metrics

### Noise Components
- `a_comp_cor_XX` — Anatomical CompCor components
- `t_comp_cor_XX` — Temporal CompCor components
- `cosine_XX` — High-pass filter (DCT basis set)

### Outlier Indicators
- `non_steady_state_outlier_XX` — Initial volume flags
- `motion_outlier_XX` — Spike regressors for high-motion volumes

### Recommended Confound Strategies
- **Minimal**: 6 motion parameters + FD
- **Standard**: 24 motion parameters + aCompCor (top 5) + cosines
- **Aggressive**: 24 motion + aCompCor + spike regressors + global signal

## SLURM Script Template

```bash
#!/bin/bash
#SBATCH --job-name=fmriprep
#SBATCH --time=24:00:00
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --tmp=200G
#SBATCH --output=log/fmriprep-%A-%a.out
#SBATCH --error=log/fmriprep-%A-%a.err

# ---- Configuration ----
BIDS_DIR="/path/to/bids"
OUTPUT_DIR="/path/to/output"
WORK_DIR="/tmp/fmriprep_work_${SLURM_ARRAY_TASK_ID}"
FMRIPREP_SIF="/path/to/fmriprep-24.1.1.sif"
TEMPLATEFLOW_HOME="$HOME/.cache/templateflow"
FS_LICENSE="$HOME/.freesurfer.txt"

# ---- Setup ----
mkdir -p ${WORK_DIR} ${OUTPUT_DIR} log

export SINGULARITYENV_FS_LICENSE=${FS_LICENSE}
export SINGULARITYENV_TEMPLATEFLOW_HOME="/templateflow"

# Get subject ID from participants.tsv using array index
SUBJECT=$(sed -n -E "$((${SLURM_ARRAY_TASK_ID} + 1))s/sub-(\S*)\>.*/\1/gp" \
    ${BIDS_DIR}/participants.tsv)

echo "Processing sub-${SUBJECT} on $(hostname) at $(date)"

# ---- Run fMRIPrep ----
singularity run --cleanenv \
    -B ${BIDS_DIR}:/data:ro \
    -B ${OUTPUT_DIR}:/out \
    -B ${WORK_DIR}:/work \
    -B ${TEMPLATEFLOW_HOME}:/templateflow \
    ${FMRIPREP_SIF} \
    /data /out participant \
    --participant-label ${SUBJECT} \
    -w /work \
    --output-spaces MNI152NLin2009cAsym:res-2 \
    --fs-license-file /opt/freesurfer/license.txt \
    --nthreads ${SLURM_CPUS_PER_TASK} \
    --omp-nthreads $(( SLURM_CPUS_PER_TASK - 1 )) \
    --mem_mb 30000 \
    --skip-bids-validation \
    --notrack

EXIT_CODE=$?

# ---- Cleanup ----
rm -rf ${WORK_DIR}

echo "Finished sub-${SUBJECT} with exit code ${EXIT_CODE} at $(date)"
exit ${EXIT_CODE}
```

Submit: `sbatch --array=1-N fmriprep.slurm` where N = number of subjects.

## Troubleshooting

### "recon-all is already running"
Stale lock files from a crashed run. Remove them:
```bash
rm <fs-subjects-dir>/sub-*/scripts/IsRunning.*
```

### fMRIPrep hangs or freezes
Usually a memory issue. Try:
- Increase `--mem-mb`
- Use `--low-mem`
- Reduce `--omp-nthreads`

### "insufficient length of BOLD data"
Too few volumes after discarding non-steady-state frames:
- Use `--dummy-scans 0` to override
- Or `--ignore slicetiming`
- Check if the run is just too short

### TemplateFlow download failures on HPC
Compute nodes often lack internet. Pre-fetch on login node:
```bash
export TEMPLATEFLOW_HOME=/shared/templateflow
python -c "from templateflow.api import get; get(['MNI152NLin2009cAsym', 'MNI152NLin6Asym', 'OASIS30ANTs', 'fsaverage'])"
```
Then bind-mount in Singularity.

### Out of memory
- Increase SLURM `--mem`
- Use `--low-mem` flag
- Use `--fs-no-reconall` if surfaces aren't needed
- Reduce `--omp-nthreads`

### Race conditions with parallel runs
Never run multiple fMRIPrep instances writing to the same output directory simultaneously. Use one subject per container instance (SLURM array jobs handle this).

### Crash recovery
fMRIPrep can resume if the working directory (`-w`) is preserved. Rerun the exact same command.

### QC before fMRIPrep
Run MRIQC first to catch bad data before spending hours on fMRIPrep:
```bash
singularity run mriqc.sif /data /out participant --participant-label ${SUBJECT}
```
