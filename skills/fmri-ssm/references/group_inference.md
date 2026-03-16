# Group-Level Inference for SSMs in fMRI

## Table of Contents
1. [When Single-Subject vs. Group Models](#when-to-use)
2. [Approach 1: Concatenation (Group HMM)](#concatenation)
3. [Approach 2: Two-Stage (Fit per Subject, Aggregate)](#two-stage)
4. [Approach 3: Hierarchical Bayesian Models](#hierarchical)
5. [State Alignment Across Subjects](#alignment)
6. [Comparing Groups (Clinical, Behavioral)](#group-comparison)
7. [Deep Data vs. Wide Data Strategies](#deep-vs-wide)
8. [Statistical Testing on SSM-Derived Metrics](#stats)

---

## 1. When Single-Subject vs. Group Models {#when-to-use}

**Single-subject models (fit each subject independently):**
- Deep data: many runs or long scans per subject (>30 min total per subject)
- When individual differences in state structure are the focus
- When subjects may have genuinely different numbers of states
- Precision medicine / individual-level inference

**Group models (pool across subjects):**
- Shallow data: short scans, few runs per subject (<15 min total)
- When you want to define common states shared across subjects
- When group-level transition dynamics are the primary question
- Standard clinical comparison designs (patients vs. controls)

**Hybrid: group-defined states, subject-specific dynamics**
- Define states from group model, then estimate subject-specific transition matrices
- Good balance for most studies

---

## 2. Approach 1: Concatenation (Group HMM) {#concatenation}

The simplest group approach: concatenate all subjects' data and fit a single HMM.
The model learns states shared across all subjects.

```python
"""Group HMM via concatenation."""
import numpy as np
from hmmlearn import hmm

def fit_group_hmm_concat(subject_data, K, covariance_type='full',
                          n_restarts=50, n_iter=200):
    """Fit a single HMM on concatenated multi-subject data.
    
    Parameters
    ----------
    subject_data : dict
        {subject_id: list_of_run_arrays} where each array is (T, n_features)
    K : int
        Number of states
    
    Returns
    -------
    group_model : fitted HMM
    subject_states : dict of {subject_id: list_of_state_arrays}
    """
    # Concatenate all runs from all subjects
    all_data = []
    all_lengths = []
    subject_run_map = []  # track which segment belongs to which subject/run
    
    for sub_id, runs in subject_data.items():
        for run_idx, run_data in enumerate(runs):
            all_data.append(run_data)
            all_lengths.append(run_data.shape[0])
            subject_run_map.append((sub_id, run_idx))
    
    data_concat = np.vstack(all_data)
    print(f"Total data: {data_concat.shape[0]} TRs from {len(subject_data)} subjects")
    
    # Z-score globally (or per-subject — see note below)
    data_concat = (data_concat - data_concat.mean(axis=0)) / data_concat.std(axis=0)
    
    # Fit group HMM (inline; see code_templates.md for the full fit_gaussian_hmm helper)
    from hmmlearn import hmm
    from sklearn.cluster import KMeans
    best_model = None
    best_score = -np.inf
    for restart in range(n_restarts):
        model = hmm.GaussianHMM(
            n_components=K, covariance_type=covariance_type,
            n_iter=n_iter, tol=1e-4, random_state=42 + restart,
        )
        if restart == 0:
            km = KMeans(n_clusters=K, random_state=42, n_init=10).fit(data_concat)
            model.means_init = km.cluster_centers_
        try:
            model.fit(data_concat, lengths=all_lengths)
            score = model.score(data_concat, lengths=all_lengths)
            if score > best_score:
                best_score = score
                best_model = model
        except Exception:
            continue
    group_model = best_model
    
    # Decode per subject
    states = group_model.predict(data_concat, all_lengths)
    subject_states = {}
    offset = 0
    for (sub_id, run_idx), length in zip(subject_run_map, all_lengths):
        if sub_id not in subject_states:
            subject_states[sub_id] = []
        subject_states[sub_id].append(states[offset:offset + length])
        offset += length
    
    return group_model, subject_states


# IMPORTANT: Z-scoring considerations
# Option A: Global z-score (above) — treats all subjects as coming from same distribution
#   Good when subjects are similar (same scanner, similar demographics)
#   Bad when there are systematic between-subject differences in signal level
#
# Option B: Per-subject z-score — normalize each subject's data independently
#   Good when between-subject variability in signal level is a nuisance
#   Bad when between-subject differences in mean activation are meaningful
#
# Recommendation: Per-subject z-scoring is usually safer for group HMMs
def zscore_per_subject(subject_data):
    """Z-score each subject's data independently."""
    for sub_id in subject_data:
        all_runs = np.vstack(subject_data[sub_id])
        mu = all_runs.mean(axis=0)
        sigma = all_runs.std(axis=0)
        sigma[sigma < 1e-6] = 1.0  # avoid division by zero
        subject_data[sub_id] = [(run - mu) / sigma for run in subject_data[sub_id]]
    return subject_data
```

**Limitations of concatenation:**
- Assumes all subjects share the same state definitions AND transition dynamics
- Subjects with more data have more influence on state definitions
- Cannot capture individual differences in state structure
- Large datasets: concatenating 100+ subjects creates very large matrices

---

## 3. Approach 2: Two-Stage (Fit per Subject, Aggregate) {#two-stage}

Fit individual subject models, then align states across subjects and aggregate statistics.

```python
"""Two-stage group analysis: fit per-subject, then align and aggregate."""
import numpy as np
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import cdist

def fit_per_subject(subject_data, K, **hmm_kwargs):
    """Stage 1: Fit HMM to each subject independently."""
    subject_models = {}
    subject_states = {}
    
    for sub_id, runs in subject_data.items():
        data_concat = np.vstack(runs)
        lengths = [r.shape[0] for r in runs]
        
        # Z-score within subject
        data_concat = (data_concat - data_concat.mean(0)) / data_concat.std(0)
        
        model, score, _ = fit_gaussian_hmm(
            data_concat, lengths, K, **hmm_kwargs
        )
        
        subject_models[sub_id] = model
        states = model.predict(data_concat, lengths)
        
        # Split states back into runs
        subject_states[sub_id] = []
        offset = 0
        for length in lengths:
            subject_states[sub_id].append(states[offset:offset + length])
            offset += length
        
        print(f"Subject {sub_id}: LL={score:.1f}")
    
    return subject_models, subject_states


def align_subjects_to_reference(subject_models, subject_data, reference_sub=None):
    """Stage 2: Align state labels across subjects using Hungarian algorithm.

    Parameters
    ----------
    subject_models : dict of {sub_id: fitted_model}
    subject_data : dict of {sub_id: list_of_run_arrays}
        Raw data per subject (needed to score models when reference_sub is None)
    reference_sub : str or None
        Subject to use as reference. If None, use the subject with highest LL.
    """
    sub_ids = list(subject_models.keys())

    if reference_sub is None:
        # Use subject with best model fit as reference
        scores = {s: subject_models[s].score(
            np.vstack(subject_data[s]),
            [r.shape[0] for r in subject_data[s]]
        ) for s in sub_ids}
        reference_sub = max(scores, key=scores.get)
    
    ref_means = subject_models[reference_sub].means_
    alignments = {reference_sub: {k: k for k in range(ref_means.shape[0])}}
    
    for sub_id in sub_ids:
        if sub_id == reference_sub:
            continue
        
        target_means = subject_models[sub_id].means_
        cost = cdist(ref_means, target_means, metric='correlation')
        row_ind, col_ind = linear_sum_assignment(cost)
        
        alignments[sub_id] = {col: row for row, col in zip(row_ind, col_ind)}
        
        # Report alignment quality
        match_cost = cost[row_ind, col_ind].mean()
        print(f"Subject {sub_id}: mean alignment cost = {match_cost:.3f}")
    
    return alignments, reference_sub


def aggregate_metrics(subject_states, subject_models, alignments, tr):
    """Stage 3: Compute group-level metrics from aligned subject results.
    
    Returns per-subject metrics that can be used for group statistics.
    """
    K = subject_models[list(subject_models.keys())[0]].n_components
    
    metrics = {}
    for sub_id in subject_states:
        alignment = alignments[sub_id]
        
        # Re-label states using alignment
        aligned_states = []
        for run_states in subject_states[sub_id]:
            aligned = np.array([alignment[s] for s in run_states])
            aligned_states.append(aligned)
        all_states = np.concatenate(aligned_states)
        
        # Fractional occupancy
        frac_occ = np.array([(all_states == k).sum() / len(all_states) for k in range(K)])
        
        # Mean dwell time per state
        mean_dwell = {}
        for k in range(K):
            dwells = []
            for run_states in aligned_states:
                current = 0
                for t in range(1, len(run_states)):
                    if run_states[t] == run_states[t-1] == k:
                        current += 1
                    elif run_states[t-1] == k:
                        dwells.append((current + 1) * tr)
                        current = 0
                    else:
                        current = 0
            mean_dwell[k] = np.mean(dwells) if dwells else 0
        
        # Transition rates (number of transitions per minute)
        total_time = len(all_states) * tr / 60  # minutes
        n_transitions = np.sum(np.diff(all_states) != 0)
        transition_rate = n_transitions / total_time
        
        metrics[sub_id] = {
            'fractional_occupancy': frac_occ,
            'mean_dwell_time': mean_dwell,
            'transition_rate': transition_rate,
        }
    
    return metrics
```

---

## 4. Approach 3: Hierarchical Bayesian Models {#hierarchical}

The most principled approach: subject parameters are drawn from group-level priors.

```python
"""Hierarchical HMM using pyhsmm (Bayesian approach).

This learns both group-level state definitions and subject-specific variations.
The Dirichlet prior on transitions links subjects together.
"""
import pyhsmm
import pyhsmm.basic.distributions as distributions

def fit_hierarchical_hmm(subject_data, K, alpha_a0=1.0, alpha_b0=1.0):
    """Fit hierarchical Bayesian HMM with shared state definitions.
    
    Uses MCMC sampling — slower but provides uncertainty estimates.
    """
    n_features = subject_data[list(subject_data.keys())[0]][0].shape[1]
    
    obs_distns = [
        distributions.Gaussian(
            mu_0=np.zeros(n_features),
            sigma_0=np.eye(n_features),
            kappa_0=0.1,
            nu_0=n_features + 2,
        )
        for _ in range(K)
    ]
    
    model = pyhsmm.models.WeakLimitStickyHDPHMM(
        kappa=50,  # stickiness
        alpha_a_0=alpha_a0,
        alpha_b_0=alpha_b0,
        gamma_a_0=1.0,
        gamma_b_0=1.0,
        init_state_concentration=1.0,
        obs_distns=obs_distns,
    )
    
    # Add each subject's data as a separate sequence
    for sub_id, runs in subject_data.items():
        for run_data in runs:
            model.add_data(run_data)
    
    # MCMC sampling
    n_samples = 500
    n_burnin = 200
    
    for i in range(n_samples):
        model.resample_model()
        if i >= n_burnin and i % 10 == 0:
            print(f"Sample {i}: {model.num_states()} active states")
    
    return model
```

**For a more scalable hierarchical approach, consider `glhmm`:**

```python
"""Hierarchical HMM using glhmm (Vidaurre's library).

Supports group-level inference with subject-specific transition matrices.
"""
from glhmm import glhmm        # import the class directly (not 'from glhmm import glhmm as gl')
from glhmm import preproc

def fit_group_glhmm(subject_data, K):
    """Fit group-level HMM allowing subject-specific transitions."""

    # Prepare data
    all_data = []
    T_list = []
    for sub_id in sorted(subject_data.keys()):
        for run in subject_data[sub_id]:
            all_data.append(run)
            T_list.append(run.shape[0])

    data_concat = np.vstack(all_data)
    indices = preproc.build_indices(T_list)

    model = glhmm(
        K=K,
        covtype='full',
        model_mean='state',
        model_beta='no',
    )

    model.train(data_concat, indices=indices, maxiter=200)

    return model
```

---

## 5. State Alignment Across Subjects {#alignment}

When fitting per-subject models, states are arbitrarily labeled. Alignment is needed.

**Hungarian algorithm** (shown above): optimal 1-to-1 assignment based on state similarity.
Works when all subjects have the same K and similar states.

**K-means on state parameters:** Cluster all subjects' state means into K clusters. Each
cluster defines a group state, and subjects' states are assigned to the nearest cluster.

**Correlation-based alignment:** Compute spatial correlation between each subject's state
means and a reference set. Assign based on maximum correlation.

**When alignment fails:** If subjects genuinely have different state structures (different K
or qualitatively different states), forced alignment is inappropriate. Strategies:

1. **Correlation-based alignment with a quality threshold.** Compute the max correlation
   between each subject's state and the reference. If the best match is below r = 0.5,
   flag that subject's state as "unaligned" and exclude it from group averages for that state.

2. **Reduce K.** Often alignment failure signals over-fitting. Try K-1 or K-2; finer
   distinctions may be subject-specific and unreliable at the group level.

3. **K-means on pooled state means.** Cluster all subjects' K state means together into K
   clusters (or use the silhouette score to find the optimal group K). Each cluster is a
   group state; subjects whose state mean falls in a cluster are "aligned" to that state.

4. **Treat as separate analyses.** When populations genuinely differ (e.g., controls vs.
   patients with vastly altered dynamics), fit separate group models rather than forcing
   alignment. Compare models by BIC or by the interpretability of aligned vs. separate fits.

5. **HDP-HMM alignment.** If using HDP-HMM (where K varies by subject), align only the
   shared "active" states using the mode K across subjects. For subjects with extra states,
   treat the extras as subject-specific and exclude from group comparisons. Cap the group K
   at the minimum K seen across subjects to avoid extrapolation.

---

## 6. Comparing Groups {#group-comparison}

### SSM-derived metrics for group comparison

| Metric | Description | Statistical test |
|--------|-------------|-----------------|
| Fractional occupancy | Proportion of time in each state | t-test or Wilcoxon per state |
| Mean dwell time | Average duration of state visits | t-test or Wilcoxon per state |
| Transition probability | A[i,j] matrix | Permutation test on matrix elements |
| Transition rate | Total transitions per minute | t-test |
| State-specific FC | Covariance matrix per state | Network-based statistic, NBS |
| Switching entropy | Entropy of the transition matrix | t-test |

### Example: patient vs. control comparison

```python
"""Compare SSM metrics between two groups."""
from scipy import stats

def compare_groups(metrics_group1, metrics_group2, K, alpha=0.05, 
                    correction='fdr'):
    """Compare SSM-derived metrics between two groups.
    
    Parameters
    ----------
    metrics_group1, metrics_group2 : list of dicts
        Each dict has 'fractional_occupancy', 'mean_dwell_time', 'transition_rate'
    K : int
        Number of states
    correction : str
        'bonferroni' or 'fdr' for multiple comparison correction
    """
    results = {}
    p_values = []
    
    # Fractional occupancy per state
    for k in range(K):
        occ1 = [m['fractional_occupancy'][k] for m in metrics_group1]
        occ2 = [m['fractional_occupancy'][k] for m in metrics_group2]
        
        stat, p = stats.mannwhitneyu(occ1, occ2, alternative='two-sided')
        results[f'frac_occ_state{k}'] = {
            'group1_mean': np.mean(occ1), 'group2_mean': np.mean(occ2),
            'U': stat, 'p': p
        }
        p_values.append(p)
    
    # Dwell time per state
    for k in range(K):
        dwell1 = [m['mean_dwell_time'][k] for m in metrics_group1]
        dwell2 = [m['mean_dwell_time'][k] for m in metrics_group2]
        
        stat, p = stats.mannwhitneyu(dwell1, dwell2, alternative='two-sided')
        results[f'dwell_state{k}'] = {
            'group1_mean': np.mean(dwell1), 'group2_mean': np.mean(dwell2),
            'U': stat, 'p': p
        }
        p_values.append(p)
    
    # Transition rate
    rate1 = [m['transition_rate'] for m in metrics_group1]
    rate2 = [m['transition_rate'] for m in metrics_group2]
    stat, p = stats.mannwhitneyu(rate1, rate2, alternative='two-sided')
    results['transition_rate'] = {
        'group1_mean': np.mean(rate1), 'group2_mean': np.mean(rate2),
        'U': stat, 'p': p
    }
    p_values.append(p)
    
    # Multiple comparison correction
    from statsmodels.stats.multitest import multipletests
    reject, p_corrected, _, _ = multipletests(p_values, method='fdr_bh')
    
    # Attach corrected p-values
    for i, key in enumerate(results):
        results[key]['p_corrected'] = p_corrected[i]
        results[key]['significant'] = reject[i]
    
    return results
```

---

## 7. Deep Data vs. Wide Data Strategies {#deep-vs-wide}

### Deep data (few subjects, many runs/long scans)
- Example: 5 subjects, each with 10 hours of scanning (Midnight Scan Club, MyConnectome)
- Strategy: fit rich per-subject models (HMM-MAR, rSLDS, many states)
- Cross-validate within-subject (train on 80% of runs, test on 20%)
- Compare subjects qualitatively — each subject gets a full characterization
- Can detect rare or idiosyncratic states that group models would miss

### Wide data (many subjects, short scans)
- Example: 1000 subjects from UK Biobank, each with 6 min of resting-state
- Strategy: group-level HMM or concatenation approach with simple model (Gaussian HMM)
- K=4-8 is typical — not enough per-subject data for more
- Power is in between-subject comparisons, not within-subject dynamics
- Use diagonal covariance or low-dimensional features to keep parameter count manageable

### Mixed strategies
- Fit group model on all subjects to define states
- Then, for each subject, fix state definitions and estimate only the transition matrix
  and initial state distribution (fewer parameters, estimable from short scans)
- This gives subject-specific dynamics with group-defined states

```python
def refit_transitions_per_subject(group_model, subject_data):
    """Fix emission parameters from group model, refit transitions per subject.
    
    This is the hybrid approach: group-defined states, subject-specific dynamics.
    """
    from hmmlearn import hmm
    
    K = group_model.n_components
    subject_transitions = {}
    
    for sub_id, runs in subject_data.items():
        data = np.vstack(runs)
        lengths = [r.shape[0] for r in runs]
        
        # Create new model with fixed emissions
        sub_model = hmm.GaussianHMM(
            n_components=K,
            covariance_type=group_model.covariance_type,
            n_iter=100,
            params='st',  # only update startprob and transmat
            init_params='',  # don't reinitialize anything
        )
        
        # Copy fixed emissions from group model
        sub_model.means_ = group_model.means_.copy()
        sub_model.covars_ = group_model.covars_.copy()
        sub_model.startprob_ = group_model.startprob_.copy()
        sub_model.transmat_ = group_model.transmat_.copy()
        
        sub_model.fit(data, lengths=lengths)
        subject_transitions[sub_id] = sub_model.transmat_.copy()
    
    return subject_transitions
```

---

## 8. Statistical Testing on SSM-Derived Metrics {#stats}

### Permutation testing (recommended for SSM-derived statistics)

SSM-derived metrics (dwell times, transition probabilities) often violate assumptions of
parametric tests. Permutation testing is distribution-free and appropriate.

```python
def permutation_test_groups(metric_group1, metric_group2, n_permutations=10000,
                             random_state=42):
    """Two-sample permutation test.
    
    Parameters
    ----------
    metric_group1, metric_group2 : array-like
        Per-subject metric values
    
    Returns
    -------
    observed_diff : float
    p_value : float (two-sided)
    """
    rng = np.random.RandomState(random_state)
    
    g1 = np.array(metric_group1)
    g2 = np.array(metric_group2)
    all_data = np.concatenate([g1, g2])
    n1 = len(g1)
    
    observed_diff = g1.mean() - g2.mean()
    
    perm_diffs = np.zeros(n_permutations)
    for i in range(n_permutations):
        perm = rng.permutation(all_data)
        perm_diffs[i] = perm[:n1].mean() - perm[n1:].mean()
    
    p_value = np.mean(np.abs(perm_diffs) >= np.abs(observed_diff))
    
    return observed_diff, p_value
```

### Effect sizes

Always report effect sizes alongside p-values:
- Cohen's d for mean differences
- Eta-squared for ANOVA-style comparisons
- For transition matrices: Frobenius norm of the difference matrix

### Confounds in group comparisons

When comparing clinical groups, control for:
- Head motion (mean FD) — correlates with many SSM metrics
- Scan length (if variable) — affects estimation quality
- Age, sex — standard demographic confounds
- Scanner/site (for multi-site studies) — use as covariate or ComBat harmonization
