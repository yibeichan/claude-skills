# Preprocessing fMRI Data for State-Space Modeling

## Table of Contents
1. [fMRIPrep Output Structure](#fmriprep-outputs)
2. [XCP-D Denoising for SSMs](#xcpd)
3. [Confound Strategy](#confounds)
4. [Dimensionality Reduction](#dim-reduction)
5. [Parcellation](#parcellation)
6. [CIFTI Surface-Based Processing](#cifti)
7. [ICA-Based Approaches](#ica)
8. [Temporal Filtering](#filtering)
9. [Data Quality Checks Before SSM Fitting](#qc)
10. [Preparing the Data Matrix](#data-matrix)

---

## 1. fMRIPrep Output Structure {#fmriprep-outputs}

fMRIPrep produces minimally preprocessed data with extensive metadata. Key outputs for SSMs:

**BOLD data (choose one):**
- `*_space-MNI152NLin6Asym_res-2_desc-preproc_bold.nii.gz` — volumetric, MNI space
- `*_space-fsLR_den-91k_bold.dtseries.nii` — CIFTI surface (preferred for surface analyses)
- `*_space-T1w_desc-preproc_bold.nii.gz` — native T1w space (for subject-specific parcellations)

**Confounds file:**
- `*_desc-confounds_timeseries.tsv` — all computed confounds (100+ columns)
- Use selectively — do NOT regress out everything

**Brain masks:**
- `*_space-MNI152NLin6Asym_res-2_desc-brain_mask.nii.gz`

**Transforms (for custom parcellation):**
- `*_from-MNI152NLin6Asym_to-T1w_mode-image_xfm.h5` (and reverse)

---

## 2. XCP-D Denoising for SSMs {#xcpd}

XCP-D applies denoising strategies to fMRIPrep outputs. For SSM analyses, the key choices are:

**Recommended pipeline:** `36P` or `acompcor` denoising strategy

**36P strategy:**
- 6 motion parameters + their temporal derivatives + quadratic terms (24 motion regressors)
- Mean WM signal + derivative + quadratic (4 regressors)
- Mean CSF signal + derivative + quadratic (4 regressors)
- Mean global signal + derivative + quadratic (4 regressors) — CONTROVERSIAL, see below

**aCompCor strategy (alternative):**
- Top 5 aCompCor components from WM + CSF
- 6 motion parameters + temporal derivatives
- Avoids global signal regression

**Global signal regression (GSR) — the controversy for SSMs:**
GSR removes variance shared across all brain regions. This:
- Removes global arousal/drowsiness fluctuations (often desirable for resting-state SSMs)
- But introduces mathematical anticorrelations between regions
- These anticorrelations can create artifactual "anticorrelated" states in HMMs
- **Recommendation:** Run analyses both with and without GSR. If your states change
  dramatically, the GSR-sensitive states may be artifacts.

**XCP-D output for SSMs:**
```
xcp_d/sub-01/func/
  sub-01_task-rest_space-MNI152NLin6Asym_res-2_desc-denoised_bold.nii.gz
  sub-01_task-rest_space-fsLR_den-91k_desc-denoised_bold.dtseries.nii
  sub-01_task-rest_desc-confounds_timeseries.tsv  # residual confounds
```

---

## 3. Confound Strategy {#confounds}

### Minimum recommended confounds (if not using XCP-D)

```python
import pandas as pd

def load_confounds_for_ssm(confounds_file, strategy='moderate'):
    """Load fMRIPrep confounds appropriate for SSM analysis.
    
    Parameters
    ----------
    confounds_file : str
        Path to *_desc-confounds_timeseries.tsv
    strategy : str
        'minimal': 6 motion + WM + CSF (12 regressors)
        'moderate': 24 motion + aCompCor top 5 (~29 regressors)
        'aggressive': 36P (36 regressors, includes GSR)
    """
    df = pd.read_csv(confounds_file, sep='\t')
    
    # Motion parameters (always include)
    motion_cols = ['trans_x', 'trans_y', 'trans_z', 'rot_x', 'rot_y', 'rot_z']
    
    if strategy == 'minimal':
        confound_cols = motion_cols + ['csf', 'white_matter']
        
    elif strategy == 'moderate':
        motion_derivs = [f'{c}_derivative1' for c in motion_cols]
        motion_power2 = [f'{c}_power2' for c in motion_cols]
        motion_deriv_power2 = [f'{c}_derivative1_power2' for c in motion_cols]
        acompcor = [c for c in df.columns if c.startswith('a_comp_cor_')][:5]
        confound_cols = motion_cols + motion_derivs + motion_power2 + motion_deriv_power2 + acompcor
        
    elif strategy == 'aggressive':
        confound_cols = [c for c in df.columns if any(c.startswith(p) for p in 
                        ['trans_', 'rot_', 'csf', 'white_matter', 'global_signal'])]
        # Keep only the 36P set
        confound_cols = [c for c in confound_cols if not c.startswith('a_comp_cor')]
    
    confounds = df[confound_cols].values
    # Handle NaN in first row (derivatives)
    confounds = np.nan_to_num(confounds, nan=0.0)
    
    return confounds, confound_cols
```

### Motion scrubbing / censoring

High-motion time points can create artifactual states. Two approaches:

**Approach A: Scrub before fitting (recommended)**
Remove high-motion TRs (framewise displacement > 0.5mm) and their neighbors. For the
remaining gaps, use this strategy based on gap size:

- **Short gaps (1–2 consecutive censored TRs):** Linearly interpolate across the gap so
  the HMM sees a continuous sequence without an abrupt discontinuity. Interpolated TRs
  do not contribute real dynamics but prevent boundary artifacts.
- **Longer gaps (≥3 consecutive censored TRs):** Treat as a run boundary — pass the gap
  endpoints as separate segments in the `lengths` array. Do NOT interpolate across long
  gaps; the interpolated signal would be fabricated.

**Approach B: Flag and verify after fitting**
Fit the SSM on all data, then check if any states correlate with framewise displacement.
If a state's occupancy correlates with FD > 0.3, it's likely motion-driven.

```python
def identify_high_motion_trs(confounds_file, fd_threshold=0.5, n_before=0, n_after=2):
    """Identify TRs to censor due to high motion.
    
    Returns boolean mask: True = keep, False = censor.
    """
    df = pd.read_csv(confounds_file, sep='\t')
    fd = df['framewise_displacement'].values
    fd[0] = 0  # First TR has no FD
    
    censor = fd > fd_threshold
    
    # Expand censoring to neighbors
    censor_expanded = censor.copy()
    for i in range(len(censor)):
        if censor[i]:
            start = max(0, i - n_before)
            end = min(len(censor), i + n_after + 1)
            censor_expanded[start:end] = True
    
    keep_mask = ~censor_expanded
    pct_removed = 100 * censor_expanded.sum() / len(censor_expanded)
    print(f"Censoring {censor_expanded.sum()}/{len(censor)} TRs ({pct_removed:.1f}%)")
    
    if pct_removed > 25:
        print("WARNING: >25% of data censored. Consider excluding this run.")
    
    return keep_mask
```

---

## 4. Dimensionality Reduction {#dim-reduction}

### When to reduce dimensions
- ROI timeseries from fine parcellations (>100 ROIs): full-covariance HMMs may need reduction
- ICA with many components (>50): consider selecting or reducing
- CIFTI / voxel-level data: always reduce before SSM fitting
- Rule of thumb: n_features should be at most T / (10 × K) for stable full-covariance estimation

### PCA

```python
from sklearn.decomposition import PCA

def reduce_dimensions_pca(bold_data, n_components=None, variance_explained=0.95):
    """PCA dimensionality reduction for SSM input.
    
    Parameters
    ----------
    bold_data : array, shape (T, n_features)
    n_components : int or None
        Fixed number of components. If None, use variance_explained.
    variance_explained : float
        Target cumulative variance explained (used if n_components is None)
    """
    if n_components is not None:
        pca = PCA(n_components=n_components)
    else:
        pca = PCA(n_components=variance_explained)
    
    reduced = pca.fit_transform(bold_data)
    print(f"Reduced {bold_data.shape[1]} features to {reduced.shape[1]} components")
    print(f"Cumulative variance explained: {pca.explained_variance_ratio_.sum():.3f}")
    
    return reduced, pca
```

### Recommended preprocessing order before dimensionality reduction

Apply steps in this order to avoid introducing artifacts:
1. **Confound regression** — regress out motion, WM/CSF signals, aCompCor components
2. **Z-score per region** — zero mean and unit variance across time (per ROI)
3. **PCA or ICA** — after z-scoring, so PCA components reflect variance structure, not scale

Reversing steps 2 and 3 (PCA before z-scoring) can bias components toward high-variance
regions (e.g., large subcortical structures), not the most informative regions.

### Which dimensionality reduction for which model?

| Model | Recommended approach | Typical n_components |
|-------|---------------------|---------------------|
| Gaussian HMM (full cov) | PCA or parcellation | 15-50 |
| Gaussian HMM (diag cov) | Parcellation alone is fine | 50-400 |
| HMM-MAR | ICA or PCA (mandatory) | 15-25 |
| SLDS/rSLDS | PCA or parcellation | 20-50 (observation), 5-15 (latent) |

---

## 5. Parcellation {#parcellation}

### Common parcellation atlases

| Atlas | Resolutions | Space | Notes |
|-------|------------|-------|-------|
| Schaefer | 100, 200, 300, 400, 500, 600, 800, 1000 | MNI, fsLR | Most popular for HMMs. Comes with 7- and 17-network labels. |
| Gordon | 333 parcels | MNI, fsLR | Good community detection-based parcellation |
| Glasser (HCP-MMP) | 360 parcels | fsLR (surface) | Multimodal parcellation, surface-based |
| AAL | 90/116 regions | MNI | Older, anatomical. Still used but Schaefer preferred. |
| Harvard-Oxford | 48/96 regions | MNI | Probabilistic, anatomical |
| Tian (subcortical) | 16/32/50 scales | MNI | Pair with Schaefer for subcortical coverage |

### Parcellating with nilearn

```python
from nilearn import datasets, maskers
import numpy as np

def parcellate_bold(bold_file, atlas='schaefer', n_rois=200, tr=2.0,
                     confounds=None, standardize='zscore_sample'):
    """Extract parcellated timeseries from BOLD data.

    Parameters
    ----------
    bold_file : str
        Path to preprocessed BOLD NIfTI file
    atlas : str
        'schaefer', 'gordon', 'aal', 'harvard_oxford'
    n_rois : int
        Number of ROIs (for Schaefer)
    tr : float
        Repetition time in seconds. Required when high_pass is set — nilearn uses
        it to convert the high_pass frequency cutoff to a scan-count cutoff.
    confounds : array or None
        Confound matrix to regress out during extraction
    standardize : str
        'zscore_sample' recommended for SSMs (zero mean, unit variance per region)
    """
    if atlas == 'schaefer':
        atlas_data = datasets.fetch_atlas_schaefer_2018(
            n_rois=n_rois, resolution_mm=2
        )
        labels_img = atlas_data.maps
    elif atlas == 'gordon':
        atlas_data = datasets.fetch_atlas_gordon_2016()
        labels_img = atlas_data.maps
    
    masker = maskers.NiftiLabelsMasker(
        labels_img=labels_img,
        standardize=standardize,
        detrend=True,
        high_pass=0.01,  # Remove very slow drift (requires t_r to be set)
        t_r=tr,          # REQUIRED when high_pass is set; without it filtering is silently skipped
        memory='nilearn_cache',
    )
    
    timeseries = masker.fit_transform(bold_file, confounds=confounds)
    print(f"Extracted timeseries: {timeseries.shape} (TRs × ROIs)")
    
    return timeseries, masker

def add_subcortical(cortical_ts, bold_file, confounds=None):
    """Add subcortical ROIs (Tian atlas) to cortical parcellation."""
    # Tian subcortical atlas — 16-parcel scale
    tian = datasets.fetch_atlas_tian_2020(resolution=2)
    masker_sub = maskers.NiftiLabelsMasker(
        labels_img=tian.maps,
        standardize='zscore_sample',
        detrend=True,
    )
    subcort_ts = masker_sub.fit_transform(bold_file, confounds=confounds)
    combined = np.hstack([cortical_ts, subcort_ts])
    print(f"Combined: {combined.shape} ({cortical_ts.shape[1]} cortical + {subcort_ts.shape[1]} subcortical)")
    return combined
```

---

## 6. CIFTI Surface-Based Processing {#cifti}

CIFTI files (.dtseries.nii) contain surface vertices (L/R cortex) + subcortical voxels in a
single file. This is the preferred format for HCP-style analyses and preserves cortical
topology better than volumetric approaches.

### Loading CIFTI data

```python
import nibabel as nib
import numpy as np

def load_cifti_timeseries(cifti_file):
    """Load a CIFTI dtseries file and return timeseries + metadata."""
    img = nib.load(cifti_file)
    data = img.get_fdata()  # shape: (T, n_greyordinates)
    
    # Get brain model information
    axes = [img.header.get_axis(i) for i in range(img.ndim)]
    brain_axis = axes[1]  # BrainModelAxis
    
    # Identify structures
    structures = {}
    for name, indices, model in brain_axis.iter_structures():
        structures[str(name)] = {
            'indices': indices,
            'n_vertices': len(range(indices.start, indices.stop)),
        }
    
    print(f"CIFTI shape: {data.shape}")
    for name, info in structures.items():
        print(f"  {name}: {info['n_vertices']} greyordinates")
    
    return data, img, structures

def parcellate_cifti(cifti_file, dlabel_file):
    """Parcellate CIFTI timeseries using a dlabel parcellation.
    
    Parameters
    ----------
    cifti_file : str
        Path to .dtseries.nii
    dlabel_file : str
        Path to .dlabel.nii parcellation (e.g., Schaefer on fsLR)
    
    Returns
    -------
    parcellated : array, shape (T, n_parcels)
    """
    bold_img = nib.load(cifti_file)
    bold_data = bold_img.get_fdata()  # (T, n_greyordinates)
    
    label_img = nib.load(dlabel_file)
    labels = label_img.get_fdata().squeeze()  # (n_greyordinates,)
    
    unique_labels = np.unique(labels)
    unique_labels = unique_labels[unique_labels > 0]  # remove background
    
    parcellated = np.zeros((bold_data.shape[0], len(unique_labels)))
    for i, label in enumerate(unique_labels):
        mask = labels == label
        parcellated[:, i] = bold_data[:, mask].mean(axis=1)
    
    # Z-score each parcel
    parcellated = (parcellated - parcellated.mean(axis=0)) / parcellated.std(axis=0)
    
    print(f"Parcellated CIFTI: {parcellated.shape}")
    return parcellated
```

### Workbench command-line tools for CIFTI

```bash
# Parcellate CIFTI using wb_command (fast, handles structures correctly)
wb_command -cifti-parcellate \
    sub-01_bold.dtseries.nii \
    Schaefer2018_200Parcels_17Networks.dlabel.nii \
    COLUMN \
    sub-01_bold_parcellated.ptseries.nii

# Smooth on surface before parcellation (recommended: 4-6mm FWHM)
wb_command -cifti-smoothing \
    sub-01_bold.dtseries.nii \
    4 4 COLUMN \
    sub-01_bold_smoothed.dtseries.nii \
    -left-surface sub-01.L.midthickness.32k_fs_LR.surf.gii \
    -right-surface sub-01.R.midthickness.32k_fs_LR.surf.gii
```

---

## 7. ICA-Based Approaches {#ica}

### When to use ICA instead of parcellation
- When you want data-driven spatial features (not constrained by atlas boundaries)
- When you expect the relevant signals to be spatially distributed/overlapping
- When using HMM-MAR (ICA components are the standard input)
- When the number of meaningful dimensions is unknown

### Group ICA with FSL MELODIC

```bash
# Run group ICA (typically 15-50 components for SSM input)
melodic -i bold_files_list.txt \
    -o group_ica_output \
    --dim=25 \
    --tr=0.8 \
    --Oall \
    --report
```

### Extracting subject-level ICA timeseries (dual regression)

```bash
# Dual regression: project group ICA maps onto individual data
dual_regression \
    group_ica_output/melodic_IC.nii.gz \
    1 \   # variance normalization
    -1 \  # no permutation testing
    output_dir \
    bold_files_list.txt
```

### Using nilearn for ICA

```python
from nilearn.decomposition import CanICA

def run_group_ica(bold_files, n_components=25, random_state=42):
    """Run group ICA on multiple subjects using nilearn."""
    canica = CanICA(
        n_components=n_components,
        memory='nilearn_cache',
        memory_level=2,
        threshold=3.,
        n_init=10,
        random_state=random_state,
    )
    canica.fit(bold_files)
    
    # Extract timeseries for each subject
    all_timeseries = []
    for bold_file in bold_files:
        ts = canica.transform([bold_file])[0]  # (T, n_components)
        all_timeseries.append(ts)
    
    return all_timeseries, canica
```

---

## 8. Temporal Filtering {#filtering}

### High-pass filtering
fMRIPrep applies cosine drift regressors (default: 128s cutoff). XCP-D may apply additional
filtering. For SSMs, slow drift removal is important — otherwise, slow drift can be
mistaken for a "state."

**Recommended:** High-pass filter at 0.01 Hz (100s period) or use cosine regressors.
Do NOT use aggressive high-pass (>0.03 Hz) as this can remove real slow state dynamics.

### Low-pass filtering
Generally NOT recommended for SSMs. Low-pass filtering removes the high-frequency information
that distinguishes states. Exception: if you have very fast TR (<0.5s) and want to remove
cardiac/respiratory aliasing, a gentle low-pass at 0.2 Hz may help.

### Band-pass filtering
Some resting-state analyses use 0.01-0.1 Hz bandpass. This is standard for FC analyses
but overly aggressive for SSMs — it removes fast transitions that SSMs are designed to detect.
**Recommendation:** Use 0.01 Hz high-pass only, no low-pass, unless you have specific reasons.

---

## 9. Data Quality Checks Before SSM Fitting {#qc}

Run these checks BEFORE fitting any SSM:

```python
def pre_ssm_quality_checks(timeseries, confounds_file, tr):
    """Quality checks for SSM input data.
    
    Parameters
    ----------
    timeseries : array, shape (T, n_features)
    confounds_file : str
    tr : float
    """
    import matplotlib.pyplot as plt
    
    T, p = timeseries.shape
    df = pd.read_csv(confounds_file, sep='\t')
    
    # 1. Check for NaN/Inf
    n_nan = np.isnan(timeseries).sum()
    n_inf = np.isinf(timeseries).sum()
    print(f"NaN values: {n_nan}, Inf values: {n_inf}")
    assert n_nan == 0 and n_inf == 0, "Data contains NaN or Inf — fix preprocessing"
    
    # 2. Check temporal SNR per region
    tsnr = timeseries.mean(axis=0) / timeseries.std(axis=0)
    low_tsnr = (tsnr < 20).sum()
    print(f"Regions with tSNR < 20: {low_tsnr}/{p}")
    if low_tsnr > p * 0.1:
        print("WARNING: >10% of regions have low tSNR")
    
    # 3. Check motion
    fd = df['framewise_displacement'].values
    fd[0] = 0
    mean_fd = fd.mean()
    pct_high = 100 * (fd > 0.5).sum() / len(fd)
    print(f"Mean FD: {mean_fd:.3f} mm, TRs with FD>0.5mm: {pct_high:.1f}%")
    if mean_fd > 0.3:
        print("WARNING: High mean motion — consider excluding")
    
    # 4. Check variance across regions (detect dead regions)
    region_var = timeseries.var(axis=0)
    dead_regions = (region_var < 1e-6).sum()
    print(f"Dead regions (near-zero variance): {dead_regions}")
    
    # 5. Check for extreme outliers
    z_scores = np.abs((timeseries - timeseries.mean(0)) / timeseries.std(0))
    extreme_trs = (z_scores > 5).any(axis=1).sum()
    print(f"TRs with extreme outliers (|z|>5): {extreme_trs}/{T}")
    
    # 6. Scan length adequacy
    min_trs_per_state_k8 = 8 * 50  # rough: 50 TRs per state for K=8
    print(f"Total TRs: {T} ({T*tr/60:.1f} minutes)")
    print(f"Rough max K for stable estimation (full cov): ~{T // 50}")
    
    return {
        'tsnr': tsnr, 'mean_fd': mean_fd, 'pct_high_motion': pct_high,
        'dead_regions': dead_regions, 'extreme_trs': extreme_trs,
    }
```

---

## 10. Preparing the Data Matrix {#data-matrix}

### Final assembly for SSM fitting

```python
def prepare_ssm_input(bold_files, confounds_files, parcellation='schaefer200',
                       standardize=True, concat_runs=True, tr=None):
    """Full pipeline from fMRIPrep outputs to SSM-ready data matrix.
    
    Returns
    -------
    data : array or list of arrays
        If concat_runs: single array (total_T, n_features) with run_boundaries
        If not: list of arrays, one per run
    run_boundaries : list of int
        TR indices where runs start (for resetting HMM forward algorithm)
    """
    all_runs = []
    run_boundaries = [0]
    
    for bold_file, confounds_file in zip(bold_files, confounds_files):
        # 1. Load confounds
        confounds, _ = load_confounds_for_ssm(confounds_file, strategy='moderate')
        
        # 2. Parcellate (with confound regression built in)
        ts, masker = parcellate_bold(
            bold_file, atlas='schaefer', n_rois=200,
            confounds=confounds, standardize='zscore_sample'
        )
        
        # 3. Quality check
        qc = pre_ssm_quality_checks(ts, confounds_file, tr)
        
        all_runs.append(ts)
        run_boundaries.append(run_boundaries[-1] + ts.shape[0])
    
    if concat_runs:
        data = np.vstack(all_runs)
        print(f"Concatenated: {data.shape}")
        if standardize:
            data = (data - data.mean(axis=0)) / data.std(axis=0)
        return data, run_boundaries[:-1]  # exclude last boundary
    else:
        return all_runs, run_boundaries[:-1]
```

### Handling run boundaries in HMMs

When concatenating runs, you MUST tell the HMM where run boundaries are. Otherwise it will
try to model transitions from the end of run N to the start of run N+1, which are not
real transitions.

```python
# hmmlearn supports this via the 'lengths' parameter
lengths = [run.shape[0] for run in all_runs]
data_concat = np.vstack(all_runs)

model = hmm.GaussianHMM(n_components=K, n_iter=200)
model.fit(data_concat, lengths=lengths)

# For prediction, also pass lengths
states = model.predict(data_concat, lengths=lengths)
```

For the `ssm` library, fit on a list of timeseries instead:
```python
import ssm

model = ssm.HMM(K, D, observations='gaussian')
model.fit([run for run in all_runs])  # pass list of arrays
```
