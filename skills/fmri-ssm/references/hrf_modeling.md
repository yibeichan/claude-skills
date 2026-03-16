# HRF Modeling for State-Space Models in fMRI

## Table of Contents
1. [The HRF Problem for SSMs](#the-problem)
2. [Approach 1: Fit on BOLD Directly (No Deconvolution)](#bold-direct)
3. [Approach 2: Deconvolve First, Then Fit SSM](#deconvolve-first)
4. [Approach 3: HRF-Informed State Constraints](#hrf-constraints)
5. [Approach 4: Joint HRF-State Estimation](#joint-estimation)
6. [Approach 5: Temporal Basis Sets Within the SSM](#basis-sets)
7. [Decision Framework](#decision-framework)
8. [HRF Variability Across Regions and Subjects](#hrf-variability)
9. [Interaction with TR and Temporal Resolution](#tr-effects)

---

## 1. The HRF Problem for SSMs {#the-problem}

The BOLD signal y(t) is approximately the convolution of underlying neural activity s(t)
with the hemodynamic response function h(t), plus noise:

    y(t) = (s * h)(t) + ε(t) = ∫ s(τ) h(t - τ) dτ + ε(t)

The canonical HRF (double-gamma function) has these key properties:
- **Onset delay**: ~1-2 seconds after neural event
- **Peak**: ~5-6 seconds after neural event
- **Undershoot**: negative deflection at ~10-15 seconds
- **Total duration**: ~25-30 seconds, but main response is within 0-15 seconds
- **Temporal smoothing**: acts as a low-pass filter, attenuating high-frequency neural dynamics

**Impact on SSMs:**

For a discrete state sequence z_1, z_2, ..., z_T at the neural level:
- States shorter than ~5 seconds will not produce a full BOLD response before the next state begins
- Rapid state transitions appear as gradual BOLD transitions (ramp-up/ramp-down artifacts)
- True neural state boundaries are blurred by ~4-6 seconds in the BOLD signal
- An SSM fitted to BOLD will recover BOLD-level states, not neural-level states

This distinction is critical: **BOLD-level states ≠ neural-level states** unless states are
long enough that the HRF fully resolves between transitions (roughly >15 seconds).

For many analyses, BOLD-level states are perfectly fine — they capture recurring patterns in
the observed signal. But if you need to make claims about neural state timing (e.g., "the brain
enters state X exactly when the stimulus appears"), you must account for the HRF.

---

## 2. Approach 1: Fit on BOLD Directly {#bold-direct}

**When this is appropriate:**
- Resting-state analyses where you care about recurring BOLD patterns, not precise neural timing
- Block designs with long blocks (>15s) where HRF has time to reach steady state
- Analyses where state definitions are spatial (FC patterns) rather than temporal
- Most exploratory analyses as a first pass

**How to implement:**
Simply fit the SSM on the preprocessed BOLD timeseries. No special handling needed.

**Interpretation caveats:**
- State onset times are delayed by ~5s relative to neural events
- State durations in the Viterbi path include HRF onset/offset ramps
- Very short states (1-3 TRs) may reflect HRF transition periods, not true neural states
- Dwell time distributions will be biased toward longer durations due to HRF smoothing

**When this goes wrong:**
- Event-related designs with short ITIs (2-4s): successive events overlap in the BOLD response,
  creating a complex mixture that does not cleanly correspond to discrete states
- Rapid state-switching paradigms: the HRF acts as a low-pass filter, attenuating the very
  signal you're trying to detect
- When making precise temporal claims: "state X onsets 200ms before the button press"

```python
# No special HRF handling — just fit on preprocessed BOLD
from hmmlearn import hmm

model = hmm.GaussianHMM(n_components=K, covariance_type='full', n_iter=200)
model.fit(bold_timeseries)  # shape: (T, n_features)
states = model.predict(bold_timeseries)
```

---

## 3. Approach 2: Deconvolve First, Then Fit SSM {#deconvolve-first}

The idea: undo the HRF convolution to recover an estimate of neural-level activity, then fit
the SSM on the deconvolved signal.

### 3a. Wiener Deconvolution

Operates in the frequency domain. Divides the signal spectrum by the HRF spectrum, with
regularization to avoid amplifying noise at frequencies where the HRF has low power.

**Pros:** Fast, simple, works region-by-region
**Cons:** Assumes stationary HRF, amplifies high-frequency noise, assumes global HRF shape

```python
import numpy as np
from scipy.signal import fftconvolve
from nilearn.glm.first_level import spm_hrf

def wiener_deconvolve(bold, tr, snr=5.0):
    """Wiener deconvolution of BOLD signal to estimate neural activity.
    
    Parameters
    ----------
    bold : array, shape (T, n_features)
        Preprocessed BOLD timeseries
    tr : float
        Repetition time in seconds
    snr : float
        Assumed signal-to-noise ratio (regularization). Higher = less regularization.
        Typical range: 2-10. Start with 5.
    
    Returns
    -------
    neural_est : array, shape (T, n_features)
        Estimated neural-level timeseries
    """
    T, p = bold.shape
    
    # Generate canonical HRF sampled at TR
    hrf_duration = 32  # seconds
    hrf_times = np.arange(0, hrf_duration, tr)
    hrf = spm_hrf(tr, oversampling=1)
    # spm_hrf may return fewer or more points than hrf_times — clip to consistent length
    n_hrf = len(hrf_times)
    if len(hrf) >= n_hrf:
        hrf = hrf[:n_hrf]
    else:
        # Pad with zeros if spm_hrf is shorter than hrf_times (e.g., very long TR)
        hrf = np.pad(hrf, (0, n_hrf - len(hrf)))
    
    # Zero-pad HRF to match signal length
    hrf_padded = np.zeros(T)
    hrf_padded[:len(hrf)] = hrf
    
    # Frequency domain
    H = np.fft.fft(hrf_padded)
    H_conj = np.conj(H)
    
    # Wiener filter: H* / (|H|^2 + 1/SNR^2)
    wiener = H_conj / (np.abs(H)**2 + 1.0 / snr**2)
    
    neural_est = np.zeros_like(bold)
    for i in range(p):
        Y = np.fft.fft(bold[:, i])
        S_est = Y * wiener
        neural_est[:, i] = np.real(np.fft.ifft(S_est))
    
    return neural_est

# Usage:
neural_timeseries = wiener_deconvolve(bold_timeseries, tr=0.8, snr=5.0)
model = hmm.GaussianHMM(n_components=K, covariance_type='full', n_iter=200)
model.fit(neural_timeseries)
```

### 3b. FIR (Finite Impulse Response) Deconvolution

Estimates the response at each time point relative to events using a set of time-lagged
regressors. Model-free — makes no assumptions about HRF shape.

**Pros:** Does not assume HRF shape, handles variable HRF across regions
**Cons:** Requires event timing (not applicable to resting state), very noisy estimates,
needs many events for stable estimation

```python
import numpy as np
from nilearn.glm.first_level import FirstLevelModel

def fir_deconvolve(bold_img, events_df, tr, fir_delays=range(0, 20)):
    """FIR deconvolution using nilearn.
    
    Use this when you have task event timing and want to estimate
    neural-level activity without assuming an HRF shape.
    
    Parameters
    ----------
    bold_img : Nifti image
        4D BOLD image
    events_df : DataFrame
        Columns: onset, duration, trial_type
    tr : float
        Repetition time
    fir_delays : range
        FIR delays in scans. range(0, 20) covers 0 to 20×TR seconds.
    
    Returns
    -------
    residuals : array
        Residual timeseries after removing task-evoked response
    """
    fir_model = FirstLevelModel(
        t_r=tr,
        hrf_model='fir',
        fir_delays=list(fir_delays),
        drift_model='cosine',
        high_pass=0.01,
    )
    fir_model.fit(bold_img, events=events_df)

    # Extract masked BOLD data and design matrix
    bold_data = fir_model.masker_.transform(bold_img)  # (T, n_voxels)
    design_mat = fir_model.design_matrices_[0].values  # (T, n_regressors)
    n_regressors = design_mat.shape[1]

    # Reconstruct fitted values: design_matrix @ beta_estimates per regressor
    # (FirstLevelModel has no .predicted attribute — we compute it manually)
    beta_maps = np.zeros((n_regressors, bold_data.shape[1]))
    for i in range(n_regressors):
        contrast = np.zeros(n_regressors)
        contrast[i] = 1.0
        # output_type='effect_size' returns the beta estimate (not t- or z-stat)
        beta_img = fir_model.compute_contrast(contrast, output_type='effect_size')
        beta_maps[i] = beta_img.get_fdata().ravel()[:bold_data.shape[1]]

    fitted = design_mat @ beta_maps   # (T, n_voxels)
    residuals = bold_data - fitted    # non-task-evoked dynamics

    return residuals
```

### 3c. Semi-blind Deconvolution (Paradigm-Free Mapping)

Estimates both neural events and HRF jointly from the BOLD signal without task timing.
Originally proposed by Caballero Gaudes et al. Uses sparsity-promoting priors on neural events.

**Pros:** Works without event timing (applicable to resting state), data-driven
**Cons:** Computationally expensive, requires tuning of sparsity parameter, assumes
neural events are sparse (may not be appropriate for sustained states)

This approach is more research-oriented. Consider using it if:
- You have resting-state data but want neural-level timing
- You have strong reason to believe neural states produce sparse, punctate events

---

## 4. Approach 3: HRF-Informed State Constraints {#hrf-constraints}

For task paradigms, you know when events occur. You can use this knowledge to inform the SSM
without full deconvolution.

### 3a. Initialize states from HRF-shifted task timing

Shift task onsets by the HRF peak delay (~5-6s) and use these shifted onsets to initialize
the state sequence before fitting.

```python
import numpy as np

def task_informed_init(events_df, n_trs, tr, hrf_peak_delay=5.5, n_states=None,
                        hrf_spread_s=4.0):
    """Initialize HMM state sequence from task events, shifted by HRF delay.
    
    Parameters
    ----------
    events_df : DataFrame
        Columns: onset (seconds), duration (seconds), trial_type
    n_trs : int
        Total number of TRs
    tr : float
        Repetition time in seconds
    hrf_peak_delay : float
        Assumed HRF peak delay in seconds
    n_states : int or None
        Number of states. If None, infer from number of unique trial_types + 1 (baseline)
    hrf_spread_s : float
        Extra seconds to extend each state window beyond the event duration, accounting
        for HRF onset/offset ramps. Default 4.0 seconds (≈ 1 TR at TR=2s, or 2 TRs at TR=2s).
    
    Returns
    -------
    init_states : array, shape (n_trs,)
        Initial state labels for each TR
    """
    trial_types = sorted(events_df['trial_type'].unique())
    if n_states is None:
        n_states = len(trial_types) + 1  # +1 for baseline/rest state
    
    type_to_state = {tt: i + 1 for i, tt in enumerate(trial_types)}
    
    init_states = np.zeros(n_trs, dtype=int)  # 0 = baseline
    
    for _, event in events_df.iterrows():
        onset_tr = int(np.round((event['onset'] + hrf_peak_delay) / tr))
        duration_trs = max(1, int(np.round(event['duration'] / tr)))
        
        # Account for HRF spreading: extend state by ~2 TRs for rise/fall
        start_tr = max(0, onset_tr)
        end_tr = min(n_trs, onset_tr + duration_trs + int(np.round(hrf_spread_s / tr)))
        
        state_label = type_to_state.get(event['trial_type'], 0)
        init_states[start_tr:end_tr] = state_label
    
    return init_states
```

### 3b. Constrain transition probabilities using task structure

For block designs, you know approximately when state transitions should occur. Encode this
as informative priors on the transition matrix or by segmenting the data.

---

## 5. Approach 4: Joint HRF-State Estimation {#joint-estimation}

The most principled but most complex approach: estimate the HRF and the state sequence
simultaneously within a unified generative model.

**Model structure:**
- Neural state sequence: z_t^{neural} (at sub-TR resolution if needed)
- State-specific neural activity: s_t = μ_{z_t^{neural}}
- HRF convolution: BOLD_t = Σ_τ s_{t-τ} × h(τ)
- Observation: y_t ~ N(BOLD_t, Σ)

This requires either:
1. Parametric HRF (e.g., double-gamma with free peak time, width) estimated jointly
2. Semi-parametric HRF (basis set with estimated coefficients)
3. Nonparametric HRF estimated via regularized deconvolution within the EM loop

**Existing implementations:**
- Limited off-the-shelf options. Most published work uses custom implementations.
- The `ssm` library can be extended to include HRF convolution in the emission model.
- Wu et al. (2021, NeuroImage) proposed a variational approach for HMM with HRF.

**When to consider this:**
- When precise neural-level state timing is the primary research question
- When you have evidence that HRF varies substantially across states (e.g., different
  brain regions have different HRFs)
- When simpler approaches (deconvolve-then-fit or fit-on-BOLD) give unsatisfying results

**Practical recommendation:**
Unless you have strong methodological expertise, start with simpler approaches (1 or 2)
and only move to joint estimation if there's clear evidence it's needed.

---

## 6. Approach 5: Temporal Basis Sets Within the SSM {#basis-sets}

Instead of a single HRF, use a set of basis functions to flexibly capture the hemodynamic
response within the SSM framework.

**Common basis sets:**
- **Canonical + temporal derivative + dispersion derivative** (SPM's 3-parameter set):
  Captures variations in HRF peak time and width
- **FIR basis set**: Completely flexible, no shape assumptions, but many parameters
- **Fourier basis set**: Captures the HRF in frequency domain
- **FLOBS (FMRIB's Linear Optimal Basis Set)**: Data-driven basis from a large HRF library

**How to integrate with SSM:**
The emission model becomes: y_t | z_t=k ~ N(Σ_b β_k^{(b)} × h_b(t), Σ_k)
where h_b(t) are basis functions and β_k^{(b)} are state-specific weights on each basis.

This is an intermediate approach between "ignore HRF" and "joint estimation" — it
acknowledges HRF variability without full deconvolution.

---

## 7. Decision Framework {#decision-framework}

Use this flowchart to pick your HRF strategy:

```
START
  │
  ├── Is this resting-state data?
  │     ├── YES → Are you interested in neural-level timing?
  │     │           ├── NO → Approach 1 (fit on BOLD directly)
  │     │           └── YES → Approach 2c (semi-blind deconvolution) 
  │     │                     or Approach 1 with careful interpretation
  │     │
  │     └── NO → Continue...
  │
  ├── Is this task-based data?
  │     ├── Block design (blocks > 15s)?
  │     │     └── Approach 1 (BOLD direct) is usually fine
  │     │         Optionally use Approach 3a for initialization
  │     │
  │     ├── Event-related design?
  │     │     ├── Do you need neural-level state timing?
  │     │     │     ├── YES → Approach 2a (Wiener) or 2b (FIR) + SSM
  │     │     │     │         or Approach 4 (joint) if you have expertise
  │     │     │     └── NO → Approach 1 + Approach 3a for initialization
  │     │     │
  │     │     └── Are events closely spaced (ITI < 4s)?
  │     │           └── YES → Approach 2 (deconvolve) is strongly recommended
  │     │                     Overlapping HRFs create complex BOLD patterns
  │     │
  │     └── Mixed design? → Treat like event-related (more conservative)
  │
  └── Is this naturalistic data?
        ├── Continuous stimulation (no discrete events)?
        │     └── Approach 1 (BOLD direct) — states will be BOLD-level
        │         This is the standard approach for movie-watching HMMs
        │
        └── Annotated events available (scene cuts, speech onset)?
              └── Approach 3a with scene/event annotations
                  or Approach 1 if temporal precision isn't critical
```

---

## 8. HRF Variability Across Regions and Subjects {#hrf-variability}

The canonical HRF is an average — real HRFs vary:

**Across brain regions:**
- Visual cortex: faster HRF (peak ~4-5s)
- Prefrontal cortex: slower HRF (peak ~6-7s)
- Subcortical structures: variable, often faster
- This means the same neural event appears at different times in different regions'
  BOLD signals, which can create artifactual lead-lag relationships

**Across subjects:**
- Peak time varies by ~1-2 seconds across healthy adults
- Width varies by ~1-3 seconds
- Older adults tend to have slower, broader HRFs
- Clinical populations (stroke, TBI) may have severely altered hemodynamics

**Implications for SSMs:**
- Regional HRF variability can create spurious state definitions — a "state" might
  simply reflect the HRF catching up in slow regions
- If using deconvolution, consider region-specific HRFs (estimate HRF per ROI from
  task data, or use published region-specific parameters)
- SLDS may be more robust to HRF variability than HMM because the continuous latent
  dynamics can absorb some of the temporal smoothing

---

## 9. Interaction with TR and Temporal Resolution {#tr-effects}

**Fast TR (< 1s, e.g., multiband):**
- Better temporal resolution to resolve HRF shape
- Deconvolution is more effective and stable
- But: also picks up more physiological noise (cardiac, respiratory)
- States can be shorter in TR-units, giving more temporal precision
- Consider higher AR orders in HMM-MAR to capture the richer temporal structure

**Standard TR (1-2s):**
- Most validated TR range for SSM-fMRI literature
- HRF is reasonably sampled (3-6 points across the main response)
- Standard deconvolution approaches work well

**Slow TR (> 2.5s):**
- HRF is poorly sampled — deconvolution is unreliable
- Approach 1 (fit on BOLD directly) is usually the only practical option
- Minimum state duration is effectively 2-3 TRs (5-7.5+ seconds)
- Older datasets with slow TRs are less suitable for fine-grained state analysis
