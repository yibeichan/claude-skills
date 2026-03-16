# Downstream Analysis: Behavioral Correlates and Reporting

## Table of Contents
1. [From SSM Metrics to Neuroscience](#from-metrics)
2. [Correlating SSM Metrics with Behavior](#behavioral-correlates)
3. [Mixed-Effects Models with SSM Metrics](#mixed-effects)
4. [Decoding Behavior from State Sequences](#decoding)
5. [Simulation and Recovery Testing](#simulation)
6. [Reporting Checklist (Methods + Results)](#reporting)
7. [Required Figures](#figures)

---

## 1. From SSM Metrics to Neuroscience {#from-metrics}

Fitting an SSM is not the end of the analysis — it produces a set of per-subject metrics
that must then be related to behavior, cognition, or clinical variables.

**The SSM metrics you typically carry forward:**

| Metric | Shape | Meaning |
|--------|-------|---------|
| Fractional occupancy (FO) | (n_subjects, K) | Proportion of time each subject spends in each state |
| Mean dwell time | (n_subjects, K) | Average duration of state visits in seconds |
| Transition probability | (n_subjects, K, K) | A[i,j]: probability of moving from state i to state j |
| Transition rate | (n_subjects,) | Total transitions per minute — measure of flexibility |
| Switching entropy | (n_subjects,) | Entropy of the transition matrix — higher = more random switching |
| State-specific FC | (n_subjects, K, p, p) | Functional connectivity pattern per state per subject |

**Critical design decision before analysis:**
Decide which metrics are your primary outcomes (pre-register if possible). Running all metrics
and reporting only significant ones inflates false-positive rate severely — each K-state model
produces 2K + K² + 1 metrics per subject.

---

## 2. Correlating SSM Metrics with Behavior {#behavioral-correlates}

### 2a. Simple correlation with behavioral outcome

```python
"""Correlate per-subject SSM metrics with behavioral outcomes.

Behavioral outcomes: reaction time, accuracy, questionnaire scores (anxiety,
depression, IQ), or clinical severity scores.
"""
import numpy as np
from scipy import stats
from statsmodels.stats.multitest import multipletests


def correlate_metrics_with_behavior(ssm_metrics, behavior, K,
                                     metric='fractional_occupancy',
                                     correction='fdr_bh', alpha=0.05):
    """Spearman correlation between SSM metrics and a behavioral variable.

    Parameters
    ----------
    ssm_metrics : dict
        Output of aggregate_metrics() from group_inference.md.
        Keys are subject IDs; values have 'fractional_occupancy', 'mean_dwell_time', etc.
    behavior : dict
        {subject_id: behavioral_value} — e.g., mean RT, anxiety score.
        Must cover the same subjects as ssm_metrics.
    K : int
        Number of states
    metric : str
        'fractional_occupancy' or 'mean_dwell_time'
    correction : str
        Multiple comparison correction: 'fdr_bh', 'bonferroni', or 'none'

    Returns
    -------
    results : dict keyed by state index with r, p, p_corrected, significant
    """
    sub_ids = [s for s in ssm_metrics if s in behavior]
    beh_values = np.array([behavior[s] for s in sub_ids])

    raw_p = []
    raw_r = []

    for k in range(K):
        if metric == 'fractional_occupancy':
            metric_values = np.array([ssm_metrics[s]['fractional_occupancy'][k]
                                       for s in sub_ids])
        elif metric == 'mean_dwell_time':
            metric_values = np.array([ssm_metrics[s]['mean_dwell_time'][k]
                                       for s in sub_ids])

        r, p = stats.spearmanr(metric_values, beh_values)
        raw_r.append(r)
        raw_p.append(p)

    if correction != 'none':
        reject, p_corrected, _, _ = multipletests(raw_p, method=correction, alpha=alpha)
    else:
        p_corrected = raw_p
        reject = [p < alpha for p in raw_p]

    results = {}
    for k in range(K):
        results[k] = {
            'r': raw_r[k],
            'p': raw_p[k],
            'p_corrected': p_corrected[k],
            'significant': reject[k],
        }
        sig = '*' if reject[k] else ''
        print(f"State {k}: r={raw_r[k]:.3f}, p={raw_p[k]:.4f}, "
              f"p_corrected={p_corrected[k]:.4f} {sig}")

    return results


def correlate_transition_with_behavior(ssm_metrics, behavior, K,
                                        correction='fdr_bh'):
    """Correlate each transition probability A[i,j] with behavior.

    The transition matrix has K*(K-1) off-diagonal elements (the diagonals
    are determined by the rest). Only test off-diagonal elements.
    """
    sub_ids = [s for s in ssm_metrics if s in behavior]
    beh_values = np.array([behavior[s] for s in sub_ids])

    pairs = [(i, j) for i in range(K) for j in range(K) if i != j]
    raw_r, raw_p = [], []

    for (i, j) in pairs:
        trans_values = np.array([ssm_metrics[s]['transition_matrix'][i, j]
                                  for s in sub_ids])
        r, p = stats.spearmanr(trans_values, beh_values)
        raw_r.append(r)
        raw_p.append(p)

    _, p_corrected, _, _ = multipletests(raw_p, method=correction)

    results = {}
    for idx, (i, j) in enumerate(pairs):
        results[(i, j)] = {'r': raw_r[idx], 'p': raw_p[idx],
                            'p_corrected': p_corrected[idx]}

    return results
```

### 2b. Controlling for confounds (partial correlation)

Always control for head motion and scan length — both correlate with SSM metrics and
are not of scientific interest.

```python
from sklearn.linear_model import LinearRegression


def partial_correlate(ssm_metric_values, behavior_values, confound_matrix):
    """Compute partial Spearman correlation between metric and behavior,
    after removing variance explained by confounds from both variables.

    Parameters
    ----------
    ssm_metric_values : array, shape (n_subjects,)
    behavior_values : array, shape (n_subjects,)
    confound_matrix : array, shape (n_subjects, n_confounds)
        Typical confounds: mean FD, age, sex (one-hot), scan length

    Returns
    -------
    r_partial, p_partial : float
    """
    def residualize(y, X):
        reg = LinearRegression().fit(X, y)
        return y - reg.predict(X)

    metric_resid = residualize(ssm_metric_values, confound_matrix)
    behav_resid = residualize(behavior_values, confound_matrix)

    r, p = stats.spearmanr(metric_resid, behav_resid)
    return r, p


# Example: control for mean FD and age
# confounds = np.column_stack([mean_fd_per_subject, age_per_subject])
# r, p = partial_correlate(frac_occ[:, k], rt_values, confounds)
```

### 2c. Group difference in metrics (patient vs. control)

See `group_inference.md §6` for the full `compare_groups()` function.
Key principle: always report effect size (Cohen's d) alongside p-value.

```python
def cohens_d(group1_values, group2_values):
    """Cohen's d effect size for two independent groups."""
    n1, n2 = len(group1_values), len(group2_values)
    pooled_std = np.sqrt(
        ((n1 - 1) * np.var(group1_values, ddof=1) +
         (n2 - 1) * np.var(group2_values, ddof=1)) / (n1 + n2 - 2)
    )
    return (np.mean(group1_values) - np.mean(group2_values)) / pooled_std
```

---

## 3. Mixed-Effects Models with SSM Metrics {#mixed-effects}

For within-subject designs (multiple conditions per subject) or multi-site data,
a linear mixed-effects model is more appropriate than a simple correlation.

```python
"""Linear mixed-effects model: SSM metric ~ condition + confounds + (1|subject).

Example: N-back task — does fractional occupancy of a 'task-engaged' state
differ between 0-back and 2-back conditions?
"""
import pandas as pd
import statsmodels.formula.api as smf


def lme_ssm_by_condition(ssm_metrics_per_run, behavioral_df, K):
    """Fit LME predicting SSM metric from condition, with random subject intercept.

    Parameters
    ----------
    ssm_metrics_per_run : list of dicts
        Each dict: {'subject': str, 'condition': str,
                    'fractional_occupancy': array (K,), 'mean_fd': float}
    behavioral_df : not used here — condition info is in ssm_metrics_per_run
    K : int

    Returns
    -------
    lme_results : dict keyed by state index
    """
    rows = []
    for entry in ssm_metrics_per_run:
        for k in range(K):
            rows.append({
                'subject': entry['subject'],
                'condition': entry['condition'],
                'mean_fd': entry['mean_fd'],
                'frac_occ': entry['fractional_occupancy'][k],
                'state': k,
            })
    df = pd.DataFrame(rows)

    lme_results = {}
    for k in range(K):
        df_k = df[df['state'] == k].copy()
        # Random intercept per subject; condition as fixed effect; FD as covariate
        model = smf.mixedlm(
            'frac_occ ~ C(condition) + mean_fd',
            df_k,
            groups=df_k['subject']
        )
        result = model.fit(reml=True)
        lme_results[k] = result
        print(f"\nState {k}:")
        print(result.summary().tables[1])

    return lme_results
```

---

## 4. Decoding Behavior from State Sequences {#decoding}

Instead of correlating summary metrics, you can ask: *does the state sequence at time t
predict what the subject is doing or experiencing?*

### 4a. Predict trial outcome from state at stimulus onset

```python
"""Decode trial-level behavior (hit/miss, fast/slow RT) from state at stimulus onset."""
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import roc_auc_score
import numpy as np


def decode_trial_outcome(state_seq, events_df, tr, K,
                          outcome_col='response', hrf_delay_s=5.0):
    """Predict trial outcome from brain state at (stimulus onset + HRF delay).

    Parameters
    ----------
    state_seq : array, shape (T,)
        Viterbi state sequence for one run
    events_df : DataFrame
        Columns: onset (s), duration (s), trial_type, <outcome_col>
    tr : float
    K : int
        Number of states (for one-hot encoding)
    outcome_col : str
        Column in events_df with binary outcome (1=hit, 0=miss)
    hrf_delay_s : float
        Shift stimulus onset by this many seconds to account for HRF delay

    Returns
    -------
    auc : float (cross-validated)
    """
    X, y = [], []
    for _, trial in events_df.iterrows():
        onset_tr = int(np.round((trial['onset'] + hrf_delay_s) / tr))
        onset_tr = np.clip(onset_tr, 0, len(state_seq) - 1)

        # One-hot encode state
        state_onehot = np.zeros(K)
        state_onehot[state_seq[onset_tr]] = 1.0
        X.append(state_onehot)
        y.append(trial[outcome_col])

    X, y = np.array(X), np.array(y)
    if len(np.unique(y)) < 2:
        print("Only one class present — cannot decode.")
        return np.nan

    clf = LogisticRegression(max_iter=500, solver='lbfgs')
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    aucs = []
    for train, test in cv.split(X, y):
        clf.fit(X[train], y[train])
        prob = clf.predict_proba(X[test])[:, 1]
        aucs.append(roc_auc_score(y[test], prob))

    auc = np.mean(aucs)
    print(f"Cross-validated AUC: {auc:.3f} (chance = 0.50)")
    return auc
```

### 4b. State sequence as predictor in a GLM

If you have continuous behavioral ratings (e.g., moment-to-moment arousal from a naturalistic
paradigm), you can regress the state time-course directly onto the behavioral signal:

```python
def state_behavioral_regression(state_probs, behavioral_signal, tr):
    """Regress posterior state probabilities onto a continuous behavioral signal.

    Parameters
    ----------
    state_probs : array, shape (T, K)
        Posterior state probabilities from forward-backward smoother
    behavioral_signal : array, shape (T,)
        Continuous behavioral rating (arousal, attention, engagement) at TR resolution
    tr : float

    Returns
    -------
    betas : array, shape (K,)
        Regression weight for each state
    r_squared : float
    """
    from sklearn.linear_model import Ridge
    from sklearn.metrics import r2_score

    # Normalize behavioral signal
    beh = (behavioral_signal - behavioral_signal.mean()) / behavioral_signal.std()

    # Ridge regression (regularization important when states are correlated)
    reg = Ridge(alpha=1.0)
    reg.fit(state_probs, beh)
    betas = reg.coef_
    r_sq = r2_score(beh, reg.predict(state_probs))

    print(f"R² = {r_sq:.3f}")
    for k, b in enumerate(betas):
        print(f"  State {k}: β = {b:.3f}")

    return betas, r_sq
```

---

## 5. Simulation and Recovery Testing {#simulation}

**Always test your pipeline on simulated data before applying it to real fMRI.**
A simulation test answers: *can my pipeline recover the true states when I know the answer?*
If recovery fails on clean simulated data, it will fail worse on real data.

```python
"""Simulate BOLD data from a known HMM and verify recovery."""
import numpy as np
from hmmlearn import hmm


def simulate_and_recover(K=4, T=600, D=20, tr=2.0, n_runs=4,
                           covariance_type='full', n_restarts=30):
    """
    1. Define a ground-truth HMM with known parameters.
    2. Simulate BOLD-like data from it.
    3. Fit an HMM on the simulated data.
    4. Measure parameter recovery accuracy.

    Parameters
    ----------
    K : int
        True number of states
    T : int
        TRs per run
    D : int
        Number of brain regions
    tr : float
        Repetition time (used only for dwell-time printout)

    Returns
    -------
    recovery : dict with 'mean_recovery' (mean spatial correlation between
               true and recovered state means, after Hungarian alignment)
    """
    from sklearn.cluster import KMeans
    from scipy.optimize import linear_sum_assignment
    from scipy.spatial.distance import cdist

    rng = np.random.RandomState(0)

    # --- Define ground-truth model ---
    true_means = rng.randn(K, D)
    # Well-separated means
    true_means = true_means / np.linalg.norm(true_means, axis=1, keepdims=True) * 3.0

    true_covs = np.array([0.5 * np.eye(D) for _ in range(K)])  # spherical for simplicity

    # Sticky-ish transition matrix
    true_transmat = np.full((K, K), 0.05 / (K - 1))
    np.fill_diagonal(true_transmat, 0.95)

    true_startprob = np.ones(K) / K

    # --- Simulate data ---
    gen_model = hmm.GaussianHMM(n_components=K, covariance_type='full')
    gen_model.startprob_ = true_startprob
    gen_model.transmat_ = true_transmat
    gen_model.means_ = true_means
    gen_model.covars_ = true_covs

    all_data, all_lengths, true_states_all = [], [], []
    for _ in range(n_runs):
        obs, states = gen_model.sample(T)
        all_data.append(obs)
        all_lengths.append(T)
        true_states_all.append(states)

    data_concat = np.vstack(all_data)

    # --- Fit recovered model ---
    best_model = None
    best_score = -np.inf
    for restart in range(n_restarts):
        model = hmm.GaussianHMM(
            n_components=K, covariance_type=covariance_type,
            n_iter=200, random_state=restart,
        )
        if restart == 0:
            model.means_init = KMeans(n_clusters=K, n_init=10,
                                       random_state=0).fit(data_concat).cluster_centers_
        try:
            model.fit(data_concat, lengths=all_lengths)
            s = model.score(data_concat, lengths=all_lengths)
            if s > best_score:
                best_score = s
                best_model = model
        except Exception:
            continue

    # --- Measure recovery (Hungarian-matched spatial correlation) ---
    cost = cdist(true_means, best_model.means_, metric='correlation')
    row_ind, col_ind = linear_sum_assignment(cost)
    matched_corr = 1 - cost[row_ind, col_ind]

    print(f"State mean recovery (spatial correlation per state):")
    for i, (true_k, rec_k) in enumerate(zip(row_ind, col_ind)):
        print(f"  True state {true_k} → Recovered state {rec_k}: r = {matched_corr[i]:.3f}")
    print(f"Mean recovery: {matched_corr.mean():.3f}  (>0.9 = good, >0.8 = acceptable)")

    # --- Check state duration recovery ---
    recovered_dwell = 1.0 / (1.0 - np.diag(best_model.transmat_[col_ind][:, col_ind]))
    true_dwell = 1.0 / (1.0 - np.diag(true_transmat))
    print(f"\nDwell time recovery (TRs):")
    for k in range(K):
        print(f"  State {k}: true={true_dwell[k]:.1f}, recovered={recovered_dwell[k]:.1f}")

    return {
        'mean_recovery': matched_corr.mean(),
        'per_state_recovery': matched_corr,
        'alignment': dict(zip(row_ind.tolist(), col_ind.tolist())),
    }
```

**Minimum recovery thresholds before trusting real-data results:**
- Mean spatial correlation > 0.85 → state patterns are recoverable
- Transition matrix within 10% of true values → dynamics are recoverable
- If recovery is poor at your intended K, reduce K or increase data quantity

---

## 6. Reporting Checklist (Methods + Results) {#reporting}

### Methods section — minimum required information

```
□ Model family and software
  e.g., "We fitted a K-state Gaussian HMM with full covariance to parcellated
  BOLD timeseries using hmmlearn v0.3.0 / dynamax v0.1.4 / ssm v0.0.1."

□ K selection procedure
  e.g., "K was selected by BIC across K=2–15, with 30 random restarts per K.
  Final model used K=8, initialized with K-means."
  OR: "K was selected by leave-one-run-out cross-validated log-likelihood."

□ Initialization and restarts
  e.g., "50 random restarts with K-means initialization of state means;
  the model with the highest log-likelihood was retained."

□ Run boundary handling
  e.g., "Runs were concatenated and the lengths parameter was passed to
  the HMM to reset the forward algorithm at run boundaries."

□ HRF strategy
  e.g., "SSM was fitted directly to preprocessed BOLD (approach 1 — BOLD-direct).
  State timing should be interpreted at the BOLD timescale (delayed ~5s from neural events)."
  OR: "Task regressors were convolved with the canonical SPM HRF before use as IO-HMM inputs."

□ Confound regression
  e.g., "24-parameter motion model (6 motion params + derivatives + quadratics)
  plus top 5 aCompCor components were regressed from BOLD prior to SSM fitting."

□ Motion scrubbing
  e.g., "TRs with framewise displacement > 0.5mm and their two following TRs
  were censored; runs with >25% censored TRs were excluded."

□ Parcellation / dimensionality
  e.g., "Schaefer-200 cortical parcellation + Tian-16 subcortical (216 ROIs total)."

□ State alignment (if multi-subject)
  e.g., "State labels were aligned across subjects using the Hungarian algorithm
  on state mean activation patterns (Euclidean correlation distance)."

□ Statistical testing approach
  e.g., "Group differences in fractional occupancy were tested with Mann-Whitney U,
  FDR-corrected across K states (Benjamini-Hochberg)."
```

### Results section — minimum required reporting

```
□ K selection: report BIC/CV curve across K values (or cite stability analysis)
□ State stability: report mean matched spatial correlation across random splits
  (ideally > 0.85; report value explicitly)
□ Motion check: report mean FD per group; confirm no state correlates with FD > 0.3
□ Per-state metrics: fractional occupancy (mean ± SD across subjects), mean dwell time
□ Transition matrix: report or visualize full K×K matrix
□ State spatial patterns: brain maps for each state (mean activation or FC pattern)
□ Effect size: always report Cohen's d or Spearman r alongside p-values
□ Multiple comparison correction: report method and corrected p-values
```

---

## 7. Required Figures {#figures}

A complete SSM paper typically includes these figures. Code uses utilities from
`code_templates.md §9` for visualization.

```python
"""Figure generation checklist — call these after fitting and decoding."""
import numpy as np
import matplotlib.pyplot as plt


def make_all_ssm_figures(model, state_seq, state_probs, dwell_times,
                          means, tr, run_boundaries, roi_labels=None,
                          group_metrics=None, behavior=None):
    """Generate the standard figure set for an SSM paper.

    Figures produced:
    1. State time-course (example subject)
    2. Transition matrix heatmap
    3. State spatial maps (top ROIs per state)
    4. Dwell time distributions
    5. Fractional occupancy (group-level bar plot with error bars)
    6. Behavioral correlation scatter (if behavior provided)
    """
    K = model.n_components

    # --- Figure 1: State time-course ---
    fig1, ax = plt.subplots(figsize=(14, 2))
    T = len(state_seq)
    times = np.arange(T) * tr
    cmap = plt.cm.Set2
    colors = [cmap(k / K) for k in range(K)]
    for t in range(T - 1):
        ax.axvspan(times[t], times[t + 1], color=colors[state_seq[t]], alpha=0.8)
    for b in run_boundaries[1:]:
        ax.axvline(b * tr, color='black', linewidth=1.5, linestyle='--', alpha=0.6)
    ax.set_xlabel('Time (s)')
    ax.set_title('State time-course (example subject)')
    ax.set_yticks([])
    fig1.tight_layout()

    # --- Figure 2: Transition matrix ---
    fig2, ax2 = plt.subplots(figsize=(5, 4))
    im = ax2.imshow(model.transmat_, cmap='Blues', vmin=0, vmax=1)
    for i in range(K):
        for j in range(K):
            ax2.text(j, i, f'{model.transmat_[i, j]:.2f}', ha='center', va='center',
                     color='white' if model.transmat_[i, j] > 0.5 else 'black', fontsize=9)
    ax2.set_xticks(range(K))
    ax2.set_yticks(range(K))
    ax2.set_xticklabels([f'S{k+1}' for k in range(K)])
    ax2.set_yticklabels([f'S{k+1}' for k in range(K)])
    ax2.set_xlabel('To state')
    ax2.set_ylabel('From state')
    plt.colorbar(im, ax=ax2)
    fig2.tight_layout()

    # --- Figure 3: Dwell time distributions ---
    fig3, ax3 = plt.subplots(figsize=(8, 4))
    for k in range(K):
        dwells_sec = np.array(dwell_times[k]) * tr
        if len(dwells_sec) > 0:
            ax3.hist(dwells_sec, bins=20, alpha=0.5,
                     label=f'S{k+1} (μ={dwells_sec.mean():.1f}s)', density=True)
    ax3.set_xlabel('Dwell time (s)')
    ax3.set_ylabel('Density')
    ax3.legend(fontsize=8)
    fig3.tight_layout()

    # --- Figure 4: Group fractional occupancy ---
    if group_metrics is not None:
        sub_ids = list(group_metrics.keys())
        fo_matrix = np.array([group_metrics[s]['fractional_occupancy'] for s in sub_ids])
        fig4, ax4 = plt.subplots(figsize=(6, 4))
        means_fo = fo_matrix.mean(axis=0)
        sems_fo = fo_matrix.std(axis=0) / np.sqrt(len(sub_ids))
        ax4.bar(range(K), means_fo, yerr=sems_fo, color=[colors[k] for k in range(K)],
                capsize=4)
        ax4.set_xticks(range(K))
        ax4.set_xticklabels([f'S{k+1}' for k in range(K)])
        ax4.set_ylabel('Fractional occupancy')
        ax4.set_title(f'Group mean FO (n={len(sub_ids)})')
        fig4.tight_layout()

    # --- Figure 5: Behavioral correlation scatter (optional) ---
    if behavior is not None:
        sub_ids_beh = [s for s in group_metrics if s in behavior]
        fo = np.array([group_metrics[s]['fractional_occupancy'] for s in sub_ids_beh])
        beh = np.array([behavior[s] for s in sub_ids_beh])

        fig5, axes5 = plt.subplots(1, K, figsize=(4 * K, 4))
        for k in range(K):
            ax = axes5[k] if K > 1 else axes5
            ax.scatter(fo[:, k], beh, alpha=0.6, color=colors[k])
            # Trend line
            m, b = np.polyfit(fo[:, k], beh, 1)
            xline = np.linspace(fo[:, k].min(), fo[:, k].max(), 50)
            ax.plot(xline, m * xline + b, 'k--', linewidth=1)
            from scipy.stats import spearmanr
            r, p = spearmanr(fo[:, k], beh)
            ax.set_title(f'S{k+1}: r={r:.2f}, p={p:.3f}')
            ax.set_xlabel(f'FO state {k+1}')
            ax.set_ylabel('Behavior')
        fig5.tight_layout()

    return {'timecourse': fig1, 'transmat': fig2, 'dwell': fig3}
```

**Figure checklist for a complete paper:**

| Figure | Required | Notes |
|--------|----------|-------|
| State time-course (example subject) | Yes | Show run boundaries |
| State spatial maps (brain maps) | Yes | Use nilearn `plot_stat_map` or surface plots |
| Transition matrix | Yes | K×K heatmap with values |
| Dwell time distributions | Recommended | Histogram per state |
| Group fractional occupancy | Yes (if group study) | Bar plot, mean ± SEM |
| BIC / CV curve for K selection | Yes | Show all K values tested |
| Behavioral correlation scatter | Yes (if behavior) | One panel per state |
| Motion check (FD vs. state) | Recommended | Show r values |
| State stability plot | Recommended | Across-split reproducibility |
