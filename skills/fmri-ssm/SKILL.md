---
name: fmri-ssm
description: >
  State-space models (SSMs) for fMRI analysis: HMM, HMM-MAR, sticky/HDP-HMM, IO-HMM,
  SLDS, rSLDS, SNLDS. Covers resting-state, task-based (MID, SST, N-back), and naturalistic
  fMRI (movie, gaming). Python code generation (hmmlearn, ssm, pyhsmm, osl-dynamics, glhmm),
  HRF-aware modeling, fMRIPrep/XCP-D preprocessing, CIFTI/parcellation/ICA, model selection,
  and single-subject + group-level inference. Trigger keywords: HMM on brain data, brain
  state dynamics, dynamic FC, switching dynamics, latent states from BOLD, HRF deconvolution
  for state models, SLDS/rSLDS on neural timeseries, choosing K for fMRI, state-space +
  neuroimaging, task paradigms (MID, SST, N-back, movie-watching) with dynamic/latent-state
  analysis, temporal dynamics beyond standard GLM.
---

# State-Space Modeling for fMRI Data

Full pipeline skill: from preprocessed BOLD data to fitted SSMs and group-level inference,
across paradigms and data formats.

## When to Use This Skill

- User asks about HMMs, brain states, dynamic functional connectivity, or switching dynamics
- User wants to go beyond standard GLM and model temporal brain dynamics
- User specifies a paradigm (resting-state, task, movie-watching) and wants latent-state analysis
- User asks about choosing K (number of states), HRF deconvolution for SSMs, or state persistence
- User wants to fit or compare SSM libraries (hmmlearn, ssm, osl-dynamics, glhmm, pyhsmm)
- User asks about group-level state inference, label-switching, or multi-subject SSMs

---

## How to Use This Skill

1. **Identify paradigm and data format** — determines HRF strategy, model family, and
   covariate structure.
2. **Use the decision tree below** to narrow the model choice.
3. **Read the relevant reference file** for implementation details before generating code.
4. **Use `references/code_templates.md` as the starting point for any code** — templates
   handle common pitfalls (HRF, TR alignment, state ordering, multi-run boundaries).

## Reference Files

Read these before generating code or providing detailed guidance:

| File | When to read |
|------|-------------|
| `references/model_catalog.md` | User asks about a specific model, needs help choosing, or wants to understand model assumptions |
| `references/hrf_modeling.md` | Any question about HRF, temporal blurring, deconvolution, or how hemodynamics affect state inference |
| `references/paradigm_guide.md` | User specifies a paradigm (resting, task, naturalistic) and needs paradigm-specific recommendations |
| `references/preprocessing.md` | Questions about preprocessing before SSM fitting, confound regression, CIFTI handling, parcellation |
| `references/code_templates.md` | When generating Python code for any SSM — always read this first |
| `references/group_inference.md` | User wants to compare states across subjects, conditions, or populations |
| `references/downstream_analysis.md` | User asks about behavioral correlates, reporting, methods section writing, simulation testing, or what to do after fitting the model |

---

## Quick-Reference Decision Tree

### Step 1: What is the paradigm?

**Resting state** → States represent intrinsic brain dynamics. No external timing. HRF is a
nuisance — you are modeling BOLD-level dynamics unless you explicitly deconvolve. Use HMM or
HMM-MAR on parcellated or ICA data.
→ Read `references/paradigm_guide.md § Resting State`

**Task-based (event/block design)** → External task structure provides ground truth for
validation. Key question: are you modeling task-evoked states or residual dynamics beyond the
task? HRF alignment is critical — task events are neural-time but BOLD is delayed 4-6s.
→ Read `references/paradigm_guide.md § Task-Based`

**Naturalistic (movie, TV, gaming)** → Continuous stimulation without discrete trial structure.
States reflect stimulus-driven + endogenous dynamics. Shared stimulus enables inter-subject
state alignment. Typically longer runs, which helps estimation.
→ Read `references/paradigm_guide.md § Naturalistic`

### Step 2: What data format?

| Format | Typical shape | Notes |
|--------|--------------|-------|
| ROI timeseries | (T, n_rois) | Most common. Parcellate first (Schaefer, Gordon, Glasser). |
| ICA components | (T, n_components) | From group ICA (FSL MELODIC, GIFT). Dimensionality-reduced. |
| CIFTI dtseries | (T, n_vertices+n_voxels) | Surface + subcortical. Parcellate or PCA before SSM. |
| Voxel-level NIfTI | (T, n_voxels) | Too high-dimensional for direct SSM. Apply parcellation/ICA/PCA first. |

→ See `references/preprocessing.md § Dimensionality Reduction` for CIFTI and voxel data.

### Step 3: Which model family?

**"I want discrete brain states and their transitions"**
→ HMM family. Gaussian HMM if states differ in mean/FC patterns. HMM-MAR if states differ
in temporal dynamics (autoregressive structure).

**"I want continuous latent dynamics that switch between regimes"**
→ SLDS or rSLDS. States govern a linear dynamical system; latent space is continuous.

**"I want external inputs (task events, stimuli) to drive state transitions"**
→ Input-output HMM or input-driven SLDS.

**"I want hierarchical structure (fast states within slow states)"**
→ Hierarchical HMM or hierarchical SLDS. Useful for naturalistic paradigms.

**"Deep data on few subjects"**
→ Per-subject models with more complex structure (rSLDS, HMM-MAR with many lags).
Cross-validate within-subject using held-out runs or time segments.

**"Many subjects with short scans"**
→ Group-level HMM or concatenation approaches. Simpler models (Gaussian HMM) are more
robust. → See `references/group_inference.md`

→ Full model specs, equations, and breakdown conditions: `references/model_catalog.md`

### Step 4: HRF strategy

The BOLD signal is not a direct readout of neural activity — it's the neural signal convolved
with the HRF, introducing a ~4-6s delay and temporal smoothing.

**Why this matters:** If neural states switch rapidly (<5s), the HRF blurs transitions in BOLD.
A 2-second neural state may appear as a gradual 8-10s transition.

| Situation | Strategy |
|-----------|----------|
| States slow (>10s) | Fit SSM directly on BOLD. Includes most resting-state and block designs. |
| States fast (<10s) + have task timing | Deconvolve first (Wiener/FIR), then fit SSM. Or model HRF within emission. |
| Naturalistic / no explicit timing | Fit on BOLD directly. States at BOLD timescale are interpretable. |

→ Full treatment with code: `references/hrf_modeling.md`

### Step 5: Key parameter decisions

**Number of states (K):** No single right answer. Use:
- BIC (tends to prefer fewer states with fMRI)
- Cross-validated log-likelihood (held-out time segments or runs)
- Free energy (variational methods)
- Stability: fit multiple K values, check state reproducibility across initializations
- Sanity check: states should have interpretable spatial patterns and plausible dwell times

**Covariance structure (Gaussian emissions):**
- Full: captures FC per state, many parameters — needs substantial data or regularization
- Diagonal: fewer parameters, more robust with limited data
- Factor analysis / low-rank: good for high-dimensional data

**Autoregressive order (HMM-MAR):** Typical range 1–5 for TR=0.7–2s. Cross-validate.

**Initialization:** K-means or GMM (much better than random). 20–50 random restarts.

**Stickiness:** If model infers rapid switching (every TR), check for motion artifacts or add
a sticky prior. Sticky HMM adds self-transition bias, discouraging unrealistic rapid switching.

### Step 6: What to do after fitting

**Connect states to behavior or cognition:**
→ Read `references/downstream_analysis.md § Behavioral Correlates`

**Write a methods/results section or prepare figures:**
→ Read `references/downstream_analysis.md § Reporting Checklist` and `§ Required Figures`

**Sanity check — does the pipeline even work?**
→ Run `simulate_and_recover()` from `references/downstream_analysis.md § Simulation Testing`
before trusting real-data results.

---

## Covariates and Confounds

**Regress out before SSM fitting:**
- Head motion parameters (6 or 24-parameter expansion)
- CSF and WM signals (or aCompCor components)
- Use fMRIPrep/XCP-D recommended confound strategy
- Global signal regression: controversial — can introduce anticorrelations

**Covariates that can enter the SSM:**
- Task timing (onsets, durations) → transition model or emission model
- Stimulus features (naturalistic) → emission model covariates
- Subject-level covariates (age, group) → hierarchical prior

→ Full confound strategy: `references/preprocessing.md`

---

## Examples

### Example 1: Resting-state HMM with hmmlearn

User: "I have fMRIPrep-preprocessed resting-state data parcellated to Schaefer-200.
I want to find recurring brain states."

Steps:
1. Read `references/paradigm_guide.md § Resting State` and `references/code_templates.md`
2. Recommend Gaussian HMM (states differ in FC patterns, not dynamics)
3. Suggest K=6-12 with BIC/cross-validation
4. Sticky HMM to avoid TR-level switching
5. Use full covariance if data permits (>300 TRs per state), else diagonal

Key code pattern (from `references/code_templates.md`):
```python
from hmmlearn import hmm

model = hmm.GaussianHMM(
    n_components=K,
    covariance_type="full",  # or "diag" for limited data
    n_iter=100,
    random_state=42
)
# Use K-means init; multiple restarts; pass lengths array for multi-run
model.fit(X, lengths=run_lengths)
```

### Example 2: Task-based SSM with HRF-aware IO-HMM (N-back paradigm)

User: "I have N-back fMRI (0-back, 2-back). I want to model how cognitive load shifts
brain states over time."

Steps:
1. Read `references/paradigm_guide.md § Task-Based` and `references/hrf_modeling.md`
2. Recommend IO-HMM — external task input drives state transitions
3. HRF strategy: convolve task regressors with canonical HRF before using as inputs
4. Read `references/code_templates.md` for IO-HMM template

Key decisions:
- Task input: HRF-convolved indicator for 0-back vs. 2-back condition
- Model: `ssm.HMM` with `InputDrivenTransitions`
- Covariates: regress out motion + CSF/WM before fitting

### Example 3: Naturalistic fMRI with rSLDS (movie-watching)

User: "I have movie-watching fMRI from 50 subjects. I want continuous latent dynamics
that switch between regimes, not just discrete states."

Steps:
1. Read `references/paradigm_guide.md § Naturalistic` and `references/model_catalog.md § rSLDS`
2. Recommend rSLDS — latent space with state-dependent switching boundaries
3. Start with SLDS first; upgrade if SLDS fits poorly
4. Group-level inference: `references/group_inference.md`

Key considerations:
- Fit on BOLD directly (naturalistic = slow states, HRF less critical)
- Use `ssm.SLDS(recurrent=True)` with Laplace-EM
- Shared stimulus across subjects enables inter-subject state alignment

---

## Common Pitfalls

1. **Fitting SSMs to raw data.** Always preprocess fully first (fMRIPrep + XCP-D with
   appropriate denoising).

2. **Ignoring HRF when interpreting fast states.** States lasting 2-3 TRs in BOLD ≠
   2-3 second neural events. Acknowledge the BOLD timescale.

3. **Too many states for the data.** Rule of thumb: ≥50-100 time points per state for
   stable full-covariance Gaussian HMM. A 5-min scan (~300 TRs) cannot reliably support
   a 12-state model with 100 ROIs.

4. **Naive multi-run concatenation.** The state at end of run 1 has no temporal relation
   to start of run 2. Pass `lengths` array to reset the forward algorithm at run boundaries.

5. **State label switching across subjects.** HMMs are invariant to state relabeling. Use
   Hungarian algorithm on emission parameters or fit a group model to align labels.

6. **Motion-driven states.** High-motion time points create artifactual states. Scrub/censor
   before fitting; verify states don't correlate with framewise displacement.

7. **Circular analysis.** Don't select K on full data then refit and report. Use proper
   cross-validation or a held-out set.

---

## Python Library Landscape

| Library | Models | GPU/JAX | Best for | Limitations |
|---------|--------|---------|----------|-------------|
| `hmmlearn` | Gaussian HMM, GMM-HMM | No | Simple API, well-tested | No AR emissions, no SLDS |
| `ssm` (Linderman) | HMM, HSMM, SLDS, rSLDS, SNLDS, input-driven | Yes (JAX) | Most complete SSM library | Less mature; some models need JAX |
| `dynamax` (probml) | HMM, LGSSM, custom SSMs | Yes (JAX-native) | **Modular Lego design** — swap emission/transition/initial independently; full JAX JIT | Newer; no rSLDS/SNLDS out of box |
| `pyhsmm` | HMM, sticky HMM, HDP-HMM | No | Bayesian nonparametric (auto-selects K) | Slower, less maintained |
| `brainiak` | HMM, HTFA | No | Neuro-specific, fMRI-designed | Limited model variety |
| `glhmm` (Vidaurre) | Gaussian-Linear HMM (≈ HMM-MAR) | Roadmap | Group-level neuroimaging | Newer, less documentation |
| `osl-dynamics` | HMM, DyNeMo | Yes (TF/JAX) | Oxford successor to HMM-MAR toolbox | GPU required for DyNeMo |
| `nilearn` | (not SSMs) | — | Preprocessing, parcellation, connectivity | No SSM fitting |

→ Working code examples for each library: `references/code_templates.md`

---

## Language & Compute Environment

**This skill is Python-first.** All code targets Python ≥ 3.10 with the library versions
in each template. The `ssm` library (Linderman lab) provides a JAX backend that runs on
GPU transparently — the same API works on CPU or GPU.

**GPU acceleration — recommended, not required:**

| Scenario | Recommendation |
|----------|---------------|
| Standard Gaussian HMM, ≤ 50 subjects | CPU is fine (hmmlearn is fast) |
| ssm / dynamax HMM, > 50 subjects or > 1000 TRs/subject | GPU recommended |
| rSLDS / SNLDS (Laplace-EM) | GPU strongly recommended — 5–10× speedup |
| dynamax custom SSM with JIT | GPU recommended; JIT gives 10–100× speedup even on CPU |
| DyNeMo (osl-dynamics) | GPU required for practical training |
| Model selection sweeps over K | Parallelize across GPUs or HPC jobs |

All code in `references/code_templates.md` runs on CPU. GPU is a drop-in speedup.
See `references/code_templates.md §12` (JAX/GPU) and `§13` (dynamax Lego models).

**JAX note:** Install JAX before importing `ssm` for GPU support:
```bash
# CPU-only JAX (default)
pip install jax jaxlib ssm

# GPU (CUDA 12)
pip install "jax[cuda12]" -f https://storage.googleapis.com/jax-releases/jax_cuda_releases.html
pip install ssm
```

**Julia:** For Bayesian HMM inference with full MCMC uncertainty, `Turing.jl` and
`StateSpaceModels.jl` are excellent alternatives with richer posterior sampling than
Python's `pyhsmm`. Recommend if the user is already in the Julia ecosystem or needs
calibrated credible intervals on transition probabilities.
