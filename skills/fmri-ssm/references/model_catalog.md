# Model Catalog: State-Space Models for fMRI

## Table of Contents
1. [Gaussian HMM](#gaussian-hmm)
2. [HMM-MAR / Gaussian-Linear HMM](#hmm-mar)
3. [Factorial HMM](#factorial-hmm)
4. [Input-Output HMM](#io-hmm)
5. [Sticky HMM and HDP-HMM](#sticky-hmm)
6. [HSMM — Hidden Semi-Markov Model](#hsmm)
7. [SLDS — Switching Linear Dynamical System](#slds)
8. [rSLDS — Recurrent Switching Linear Dynamical System](#rslds)
9. [SNLDS — Switching Nonlinear Dynamical System](#snlds)
10. [Hierarchical Extensions](#hierarchical)
11. [Model Comparison Table](#comparison)

---

## 1. Gaussian HMM {#gaussian-hmm}

**Generative model:**
- Discrete hidden state: z_t ∈ {1, ..., K}
- Transition: P(z_t | z_{t-1}) = A[z_{t-1}, z_t]  (K × K transition matrix)
- Emission: y_t | z_t = k ~ N(μ_k, Σ_k)
- Initial state: z_1 ~ π  (K-dimensional probability vector)

**Parameters:** π (initial), A (transitions), {μ_k, Σ_k} for k=1..K

**What it captures in fMRI:**
Each state is a multivariate Gaussian over brain regions — capturing a spatial pattern of
mean activation and inter-regional covariance (functional connectivity). State transitions
capture time-varying shifts in these patterns.

**When to use:**
- Resting-state: identifying recurring brain states defined by FC patterns
- Task data: when states correspond to different activation patterns (different tasks)
- When you believe states differ primarily in mean and/or covariance, not temporal dynamics
- When data is limited (fewer parameters than HMM-MAR)

**When it breaks down:**
- States that differ only in temporal autocorrelation (same mean, same covariance, different
  dynamics) — Gaussian HMM cannot distinguish these
- Very high-dimensional data without dimensionality reduction → Σ_k estimation is unstable
- Very fast state switching at BOLD timescale — HRF blurring conflated with state emissions

**Key practical considerations:**
- Covariance type matters enormously. Full covariance: K × p × (p+1)/2 parameters per state.
  With 100 ROIs and 8 states, that's ~40,000 covariance parameters per state. You need
  substantial data or regularization.
- Diagonal covariance is a common compromise for high-dimensional ROI data.
- Always use multiple random restarts (≥20) and K-means/GMM initialization.

**Python:** `hmmlearn.GaussianHMM`, `ssm.HMM` with `GaussianObservations`

---

## 2. HMM-MAR / Gaussian-Linear HMM {#hmm-mar}

**Generative model:**
- Same discrete hidden state as Gaussian HMM
- Emission is autoregressive: y_t | z_t=k, y_{t-1}, ..., y_{t-p} ~ N(Σ_{l=1}^{p} W_k^{(l)} y_{t-l}, Σ_k)
- Each state has its own set of AR coefficient matrices W_k^{(l)} and noise covariance Σ_k

**Parameters:** π, A, {W_k^{(1)}, ..., W_k^{(p)}, Σ_k} for k=1..K

**What it captures in fMRI:**
Each state represents a distinct *dynamical regime* — not just a spatial pattern but a pattern
of temporal dependencies between regions. Two states might have similar mean activation but
different directed connectivity (region A drives region B in state 1, but B drives A in state 2).

**When to use:**
- Resting-state analyses where you care about time-varying directed connectivity
- When states are expected to differ in spectral content (different oscillatory profiles)
- Naturalistic paradigms where dynamics change with stimulus content (dialogue vs. action scenes)
- When you have sufficient data per state (AR parameters are expensive)

**When it breaks down:**
- Short scans with many states — AR parameter estimation becomes unstable
- High-dimensional data — AR coefficient matrices scale as p × n_features² per state
- When true differences between states are in mean activation, not dynamics (overkill)

**Key practical considerations:**
- AR order p: typical range 1-5 for fMRI. Higher p captures richer dynamics but needs more data.
  p=1 is often sufficient for TR > 1s. For fast TR (< 0.8s), consider p=3-5.
- Total parameters per state: p × n_features² + n_features × (n_features+1)/2. This grows
  fast. With 25 ICA components and p=3: 25² × 3 + 325 = 2,200 parameters per state.
- Dimensionality reduction (ICA, PCA to ~15-50 components) is almost essential.
- The original HMM-MAR toolbox (Vidaurre et al., 2016) was MATLAB-based. Python equivalents:
  `osl-dynamics` (Oxford, actively maintained) or `glhmm` (Vidaurre's newer Python library).

**Python:** `osl-dynamics`, `glhmm`, or custom implementation with `ssm` library

---

## 3. Factorial HMM {#factorial-hmm}

**Generative model:**
- Multiple independent hidden state chains: z_t^{(1)}, z_t^{(2)}, ..., z_t^{(M)}
- Each chain has its own transition matrix: P(z_t^{(m)} | z_{t-1}^{(m)}) = A_m
- Emission depends on all chains: y_t | z_t^{(1)}, ..., z_t^{(M)} ~ N(Σ_m μ_{z_t^{(m)}}^{(m)}, Σ)

**What it captures in fMRI:**
Multiple independent sources of state variation. For example, one chain captures arousal
(high/low), another captures task engagement (on/off), another captures default mode
activity (active/suppressed). The observed BOLD is a combination of all active states.

**When to use:**
- When you believe brain dynamics are driven by multiple independent processes
- Multitask paradigms where subjects do several things simultaneously
- When a standard HMM requires too many states to capture combinatorial structure
  (e.g., 2 binary processes = 4 combined states, but factorial HMM uses 2+2=4 parameters
  instead of 4×4=16 for a standard 4-state HMM transition matrix)

**When it breaks down:**
- When state chains are not actually independent (common in fMRI — arousal and task
  engagement are often correlated)
- Exact inference is intractable — requires variational approximations
- Less commonly used in fMRI literature; fewer validated pipelines

**Python:** Custom implementation needed. Can be built on `ssm` or using variational
inference frameworks (e.g., `pyro`, `numpyro`).

---

## 4. Input-Output HMM {#io-hmm}

**Generative model:**
- Transition depends on external input: P(z_t | z_{t-1}, u_t) ∝ A[z_{t-1}, z_t] × exp(v_k^T u_t)
- Emission can also depend on input: y_t | z_t=k, u_t ~ N(μ_k + B_k u_t, Σ_k)

**What it captures in fMRI:**
How external events (task onsets, stimuli) drive brain state transitions. A task cue might
increase the probability of transitioning to a "task-engaged" state. Stimulus features
(reward magnitude in MID, conflict level in SST) can modulate both transitions and emissions.

**When to use:**
- Task-based paradigms where you want to model how task events trigger state changes
- Naturalistic paradigms where stimulus features (audio energy, visual complexity, semantic
  content) drive brain state dynamics
- When you want to dissociate stimulus-driven from endogenous state transitions

**When it breaks down:**
- Resting state (no external inputs to condition on)
- When the input-state relationship is highly nonlinear (consider rSLDS instead)
- Defining the right input features for naturalistic stimuli is challenging

**Key practical considerations for fMRI:**
- Task regressors should be convolved with HRF before entering as inputs, because the
  BOLD response to a task event is delayed. Alternatively, shift task events by ~5s.
- For naturalistic paradigms, extract stimulus features at the TR resolution (e.g., using
  movie annotation tools, optical flow, audio envelopes).
- The `ssm` library supports input-driven HMMs and SLDS natively.

**Python:** `ssm.HMM` with `InputDrivenObservations` or `InputDrivenTransitions`

---

## 5. Sticky HMM and HDP-HMM {#sticky-hmm}

**Sticky HMM:**
- Standard HMM but the transition matrix has an added self-transition bias:
  A[i,j] ∝ α_j + κ × δ(i,j), where κ > 0 encourages staying in the current state

**HDP-HMM (Hierarchical Dirichlet Process HMM):**
- Bayesian nonparametric extension: K is inferred from data, not fixed
- Uses a hierarchical Dirichlet process prior over the transition matrix
- Sticky variant (sticky HDP-HMM) adds the self-transition bias

**What it captures in fMRI:**
Same as Gaussian HMM, but with better temporal properties. The sticky prior prevents
the unrealistic rapid switching that standard HMMs sometimes exhibit with fMRI data
(where the model alternates states every 1-2 TRs due to noise, not real neural dynamics).

**When to use:**
- Whenever you'd use a Gaussian HMM but want more realistic state durations
- When you're uncertain about K — HDP-HMM can infer it
- Resting-state analyses where state persistence matters for interpretation

**Key practical considerations:**
- The stickiness parameter κ effectively sets a minimum expected dwell time. Tune it
  based on what's physiologically plausible (e.g., states should last at least 3-5 TRs).
- HDP-HMM is computationally more expensive (MCMC sampling). For large datasets,
  truncated variational inference is faster.
- In practice, many groups use standard HMM with post-hoc temporal filtering of the
  state sequence (requiring minimum dwell time) as a simpler alternative to sticky HMMs.

**Python:** `pyhsmm` (Fox et al.), `ssm` (sticky HMM variant)

---

## 6. HSMM — Hidden Semi-Markov Model {#hsmm}

**Generative model:**
- Same discrete hidden states as HMM, but the dwell time has an explicit duration distribution
  D_k(d) instead of the implicit geometric distribution of standard HMMs
- Transition probability: P(z_t | z_{t-1}) only fires at the *end* of a dwell period, which
  is drawn from D_k ~ Poisson(λ_k) or Negative-Binomial or any discrete distribution
- Emission: y_t | z_t = k ~ N(μ_k, Σ_k) (same Gaussian emission as HMM)

**Key difference from HMM:** Standard HMMs have geometric dwell times (probability of leaving
a state is constant at each TR, giving exponentially distributed durations). HSMMs explicitly
model the duration, allowing sub-geometric or super-geometric dwell distributions.

**What it captures in fMRI:**
State duration patterns that are non-geometric — e.g., if cognitive states reliably last
15-30 seconds, a HSMM can capture this preference, while an HMM can only approximate it
via a high self-transition probability (which is a geometric approximation).

**When to use:**
- Task block designs where blocks have a known duration (e.g., 20s, 30s) — HSMM can encode
  duration priors matching the design, which regularizes state estimation
- Resting-state analyses where you have strong prior beliefs about state duration ranges
  (e.g., from prior literature: DMN states last ~10-30s)
- When standard HMM produces dwell-time distributions with poor fit to a geometric assumption
  (check: plot empirical dwell times and compare to fitted geometric — if they diverge, HSMM)
- When you want to separate "transition probability" from "dwell time distribution" as
  independent parameters

**When it breaks down:**
- When dwell times are genuinely geometric (HSMM adds complexity without benefit)
- Short datasets: duration distribution estimation needs more observations per state
- `pyhsmm` is less maintained than `hmmlearn` / `ssm`; expect API quirks

**Key practical considerations:**
- Start with HMM and plot empirical dwell time distributions. If they look geometric,
  stick with HMM. If they are peaked (mode at some finite duration), HSMM is appropriate.
- Poisson duration distribution is a good default: one extra parameter λ_k per state.
- The `ssm` library supports HSMMs natively with `ssm.HSMM`.

**Python:** `pyhsmm.models.HMM` (Bayesian, MCMC), `ssm.HSMM` (EM, preferred)

```python
import ssm
import numpy as np

def fit_hsmm(data_list, K, D, max_duration=50, n_restarts=10, n_iters=100):
    """Fit Hidden Semi-Markov Model using ssm library.

    Parameters
    ----------
    data_list : list of arrays, each (T, D)
    K : int
        Number of states
    D : int
        Observation dimension
    max_duration : int
        Maximum dwell time in TRs to model explicitly. Set to roughly 3-4× your
        expected maximum state duration. Longer max_duration = more computation.

    Returns
    -------
    best_model : ssm.HSMM
    """
    best_model = None
    best_ll = -np.inf

    for restart in range(n_restarts):
        model = ssm.HSMM(
            K=K,
            D=D,
            observations='gaussian',
            transitions='standard',
            transition_kwargs={'max_duration': max_duration},
        )
        lls = model.fit(data_list, method='em', num_iters=n_iters, tolerance=1e-4)
        if lls[-1] > best_ll:
            best_ll = lls[-1]
            best_model = model
            best_lls = lls

    # Inspect inferred duration distributions
    print(f"Best log-likelihood: {best_ll:.2f}")
    for k in range(K):
        # ssm stores duration distribution parameters; access depends on version
        print(f"State {k}: expected dwell = {model.transitions.expected_durations[k]:.1f} TRs")

    return best_model, best_lls
```

---

## 7. SLDS — Switching Linear Dynamical System {#slds}

**Generative model:**
- Discrete switching state: z_t ∈ {1, ..., K}
- Continuous latent state: x_t ∈ R^d
- Switching dynamics: x_t | z_t=k, x_{t-1} ~ N(A_k x_{t-1} + b_k, Q_k)
- Emission: y_t | x_t ~ N(C x_t + d, R)
- Transition: P(z_t | z_{t-1}) = Π[z_{t-1}, z_t]

**Parameters:** Π, {A_k, b_k, Q_k} for k=1..K, C, d, R

**What it captures in fMRI:**
Brain dynamics evolve in a continuous latent space (not directly observed), and this evolution
switches between different linear dynamical regimes. Unlike HMM where each time point is
independently drawn from a state-specific distribution, SLDS captures smooth temporal
evolution that shifts between regimes. The observed BOLD signal is a linear readout of the
latent state, plus noise.

**When to use:**
- When you believe brain dynamics are fundamentally continuous but regime-switching
- When temporal smoothness of the latent trajectory is important
- When the observation dimension (n_regions) is much larger than the latent dimension (d)
  — SLDS provides dimensionality reduction and dynamics simultaneously
- Task paradigms where you expect smooth transitions between cognitive states

**When it breaks down:**
- Within-regime dynamics are truly nonlinear (use rSLDS or SNLDS)
- K is very large — each regime has A_k (d×d), b_k (d), Q_k (d×d) parameters
- Exact inference is intractable; relies on approximations (Laplace-EM, variational, SMC)

**Key practical considerations for fMRI:**
- Latent dimension d: typically 5-20 for parcellated data. Cross-validate.
- The emission matrix C maps from latent space to brain regions — its columns are
  interpretable as spatial modes.
- SLDS can be viewed as a generalization of both HMM (d=0, no continuous latent) and
  linear dynamical system (K=1, single regime).
- For fMRI, the smooth latent trajectory in SLDS may partially absorb HRF smoothing,
  making it somewhat more robust to HRF effects than HMM.

**Python:** `ssm.SLDS` (Linderman lab — primary recommendation)

---

## 7. rSLDS — Recurrent Switching Linear Dynamical System {#rslds}

**Generative model:**
- Same as SLDS, but the discrete state depends on the continuous latent:
  P(z_t | z_{t-1}, x_{t-1}) ∝ Π[z_{t-1}, z_t] × exp(r_k^T x_{t-1})
- The continuous state "recurrently" influences the discrete switching

**What it captures in fMRI:**
The regime switches are driven by the latent brain state itself — when the brain's latent
trajectory crosses a boundary in state space, it switches to a different dynamical regime.
This creates piecewise-linear dynamics with state-dependent switching boundaries.

**When to use:**
- When state transitions are not random but depend on the current brain state
- When you want to discover the "boundaries" in neural state space where dynamics change
- Naturalistic paradigms where transitions are driven by internal state accumulation
  (e.g., gradually increasing engagement until a threshold triggers mind-wandering)
- More principled model of nonlinear dynamics than plain SLDS

**When it breaks down:**
- Very short data — rSLDS has more parameters than SLDS (the recurrence weights r_k)
- When transitions are truly externally driven, not state-dependent (use input-driven SLDS)
- Inference is harder than SLDS; more sensitive to initialization

**Key practical considerations for fMRI:**
- The recurrence boundaries partition the latent space into regions where different dynamics
  apply — these boundaries are scientifically interpretable
- Start with SLDS first. If SLDS fits poorly or you have theoretical reasons to expect
  state-dependent switching, upgrade to rSLDS.
- The `ssm` library provides good implementations with Laplace-EM inference.

**Python:** `ssm.SLDS` with `recurrent=True`

---

## 8. SNLDS — Switching Nonlinear Dynamical System {#snlds}

**Generative model:**
- Same structure as SLDS but dynamics are nonlinear:
  x_t | z_t=k, x_{t-1} ~ N(f_k(x_{t-1}), Q_k)
- f_k can be a neural network, Gaussian process, or other nonlinear function

**What it captures in fMRI:**
The most expressive model in this catalog. Each regime has its own nonlinear dynamics.
Useful when linear dynamics are insufficient to capture the complexity of brain state evolution.

**When to use:**
- Research settings with large datasets where linear dynamics are demonstrably insufficient
- Deep data (many time points per subject) that can support nonlinear function estimation
- When other models show systematic residual structure suggesting nonlinearity

**When it breaks down:**
- Almost always overkill for standard fMRI datasets
- Very data-hungry — nonlinear dynamics functions need much more data to estimate
- Interpretability is reduced (what does a neural network dynamics function mean neurally?)
- Risk of overfitting is high

**Key practical considerations:**
- Use only after demonstrating that SLDS/rSLDS are insufficient
- Regularization is critical — use low-rank dynamics or simple nonlinearities (RBF)
- Consider deep learning approaches like LFADS (Latent Factor Analysis via Dynamical Systems)
  which use neural network dynamics but with structured priors

**Python:** Custom implementation with `ssm` or deep learning frameworks (PyTorch/JAX).
LFADS implementations exist in `lfads-torch` and `autolfads-tf2`.

---

## 9. Hierarchical Extensions {#hierarchical}

### Hierarchical HMM (HHMM)
- Two (or more) levels of hidden states: slow states (superstate) and fast states (substate)
- Superstate governs which set of substates is active
- Superstate transitions happen on a slower timescale

**Use in fMRI:** Naturalistic paradigms where dynamics operate on multiple timescales.
For movie watching: superstates might correspond to narrative segments (minutes), substates
to within-segment dynamics (seconds). For resting state: superstates might capture slow
fluctuations in arousal, substates capture faster network dynamics.

### Hierarchical Group Models
- Subject-level models share a group prior
- Subject-specific parameters are drawn from group distributions
- Enables population-level inference while respecting individual differences

**Use in fMRI:** The standard approach for group-level SSM analysis when you have
enough subjects. Particularly important for clinical comparisons (patient vs. control).
See `references/group_inference.md` for implementation details.

---

## 11. Model Comparison Summary {#comparison}

| Model | Latent type | Dynamics | Parameters (approx.) | Data needs | Compute | fMRI use cases |
|-------|------------|----------|---------------------|------------|---------|----------------|
| Gaussian HMM | Discrete | Markov chain | K²+K×p(p+1)/2 | Low-moderate | Fast (CPU) | Resting FC states, task states |
| HMM-MAR | Discrete | Markov + AR emissions | K²+K×L×p² | Moderate-high | Moderate (CPU) | Directed connectivity dynamics |
| Factorial HMM | Multiple discrete | Independent chains | M×K²+combinatorial | Moderate | Moderate (variational, CPU) | Independent neural processes |
| IO-HMM | Discrete | Input-driven | K²+K×q+K×p² | Moderate | Fast–moderate (CPU) | Task-evoked state dynamics |
| Sticky/HDP-HMM | Discrete (nonpar.) | Persistent Markov | Bayesian (inferred) | Low-moderate | Slow (MCMC); fast (var. EM) | When K is unknown, realistic dwell times |
| HSMM | Discrete | Semi-Markov | K²+K×p(p+1)/2+K | Moderate | Moderate (CPU) | Task blocks, explicit duration priors |
| SLDS | Discrete + continuous | Switching linear | K×d²+d×p | Moderate-high | Moderate; GPU 2–5× speedup | Regime-switching continuous dynamics |
| rSLDS | Discrete + continuous | Recurrent switching | K×d²+K×d+d×p | High | Heavy; GPU 5–10× speedup | State-dependent regime switching |
| SNLDS | Discrete + continuous | Switching nonlinear | K×f_params+d×p | Very high | Very heavy; GPU required | Nonlinear brain dynamics (rare in fMRI) |

Where p = observation dimension, d = latent dimension, K = number of states, L = AR order,
q = input dimension, M = number of factorial chains.

**Compute guidance:**
- **CPU is fine** for hmmlearn-based models on datasets ≤ 50 subjects × 500 TRs
- **GPU recommended** for rSLDS/SNLDS, osl-dynamics DyNeMo, and model-selection sweeps over K
- **dynamax** provides JAX JIT compilation for all models — significant speedup even on CPU; GPU is drop-in
- See `code_templates.md §12` for JAX/GPU setup, `§13` for dynamax modular ("Lego") model building
