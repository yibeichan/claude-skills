# Python Code Templates for SSMs on fMRI Data

## Table of Contents
1. [Gaussian HMM with hmmlearn](#gaussian-hmm)
2. [Gaussian HMM with ssm library](#gaussian-hmm-ssm)
3. [Sticky HMM](#sticky-hmm)
4. [HMM-MAR with osl-dynamics](#hmm-mar)
5. [Input-Output HMM](#io-hmm)
6. [SLDS with ssm library](#slds)
7. [rSLDS with ssm library](#rslds)
8. [Model Selection (choosing K)](#model-selection)
9. [State Visualization](#visualization)
10. [Reproducibility and Initialization](#reproducibility)
11. [Model Diagnostics: Detecting Pathological Fits](#diagnostics)
12. [JAX-Based HMM for GPU Acceleration](#jax-gpu)
13. [dynamax: Lego-Style Custom SSMs](#dynamax)

All code assumes preprocessed, parcellated timeseries. See `preprocessing.md` for
how to get from raw fMRIPrep outputs to the data matrices used here.

---

## 1. Gaussian HMM with hmmlearn {#gaussian-hmm}

The simplest and most widely used SSM for fMRI. Start here unless you have
specific reasons to use a more complex model.

```python
"""Gaussian HMM for fMRI using hmmlearn.

Fits a K-state HMM with Gaussian emissions on parcellated BOLD timeseries.
Includes multiple random restarts, K-means initialization, and run-boundary handling.
"""
import numpy as np
from hmmlearn import hmm
from sklearn.cluster import KMeans

def fit_gaussian_hmm(data, lengths, K, covariance_type='full',
                      n_restarts=50, n_iter=200, random_state=42):
    """Fit Gaussian HMM with multiple random restarts.
    
    Parameters
    ----------
    data : array, shape (total_T, n_features)
        Concatenated BOLD timeseries across runs
    lengths : list of int
        Number of TRs per run (for run boundary handling)
    K : int
        Number of hidden states
    covariance_type : str
        'full', 'diag', 'tied', or 'spherical'
    n_restarts : int
        Number of random restarts (take best log-likelihood)
    n_iter : int
        Max EM iterations per restart
    random_state : int
        Base random seed
    
    Returns
    -------
    best_model : GaussianHMM
        Fitted model with highest log-likelihood
    best_score : float
        Log-likelihood of best model
    all_scores : list
        Log-likelihoods from all restarts
    """
    best_model = None
    best_score = -np.inf
    all_scores = []
    
    for restart in range(n_restarts):
        model = hmm.GaussianHMM(
            n_components=K,
            covariance_type=covariance_type,
            n_iter=n_iter,
            tol=1e-4,
            random_state=random_state + restart,
            init_params='stmc',  # initialize all parameters
            verbose=False,
        )
        
        # K-means initialization for means (much better than random)
        if restart == 0:
            kmeans = KMeans(n_clusters=K, random_state=random_state, n_init=10)
            kmeans.fit(data)
            model.means_init = kmeans.cluster_centers_
        
        try:
            model.fit(data, lengths=lengths)
            score = model.score(data, lengths=lengths)
            all_scores.append(score)
            
            if score > best_score:
                best_score = score
                best_model = model
        except Exception as e:
            all_scores.append(np.nan)
            continue
    
    n_converged = sum(1 for s in all_scores if not np.isnan(s))
    print(f"Converged: {n_converged}/{n_restarts}")
    print(f"Best log-likelihood: {best_score:.2f}")
    print(f"Score range: {np.nanmin(all_scores):.2f} to {np.nanmax(all_scores):.2f}")
    
    return best_model, best_score, all_scores


def extract_state_info(model, data, lengths):
    """Extract state sequence, dwell times, and transition matrix.
    
    Returns
    -------
    results : dict with keys:
        'states': state sequence
        'state_probs': posterior state probabilities
        'dwell_times': dict mapping state -> list of dwell durations (in TRs)
        'fractional_occupancy': proportion of time in each state
        'transition_matrix': estimated transition matrix
        'means': state means, shape (K, n_features)
        'covariances': state covariances
    """
    states = model.predict(data, lengths=lengths)
    state_probs = model.predict_proba(data, lengths=lengths)
    
    # Compute dwell times (respecting run boundaries)
    dwell_times = {k: [] for k in range(model.n_components)}
    offset = 0
    for length in lengths:
        run_states = states[offset:offset + length]
        current_state = run_states[0]
        current_dwell = 1
        for t in range(1, length):
            if run_states[t] == current_state:
                current_dwell += 1
            else:
                dwell_times[current_state].append(current_dwell)
                current_state = run_states[t]
                current_dwell = 1
        dwell_times[current_state].append(current_dwell)  # last dwell
        offset += length
    
    # Fractional occupancy
    frac_occ = np.array([(states == k).sum() / len(states) 
                          for k in range(model.n_components)])
    
    return {
        'states': states,
        'state_probs': state_probs,
        'dwell_times': dwell_times,
        'fractional_occupancy': frac_occ,
        'transition_matrix': model.transmat_,
        'means': model.means_,
        'covariances': model.covars_,
    }
```

---

## 2. Gaussian HMM with ssm library {#gaussian-hmm-ssm}

The `ssm` library (Linderman lab) provides a unified API for HMMs, SLDS, and rSLDS.
Useful when you want to compare model families within the same framework.

```python
"""Gaussian HMM using the ssm library (Linderman et al.)

Install: pip install ssm  (or from GitHub: pip install git+https://github.com/lindermanlab/ssm)
"""
import ssm
import numpy as np

def fit_hmm_ssm(data_list, K, D=None, n_restarts=20, n_iters=200):
    """Fit Gaussian HMM using ssm library.
    
    Parameters
    ----------
    data_list : list of arrays
        Each array is (T_run, D) for one run. Do NOT concatenate — ssm
        handles multiple sequences natively.
    K : int
        Number of states
    D : int or None
        Observation dimension (inferred from data if None)
    
    Returns
    -------
    best_model : ssm.HMM
    best_lls : list of float
        Log-likelihood per EM iteration for best run
    """
    if D is None:
        D = data_list[0].shape[1]
    
    best_model = None
    best_ll = -np.inf
    
    for restart in range(n_restarts):
        model = ssm.HMM(
            K=K,
            D=D,
            observations='gaussian',  # or 'diagonal_gaussian', 'studentst'
            transitions='standard',    # or 'sticky'
        )
        
        lls = model.fit(
            data_list,
            method='em',
            num_iters=n_iters,
            tolerance=1e-4,
        )
        
        final_ll = lls[-1]
        if final_ll > best_ll:
            best_ll = final_ll
            best_model = model
            best_lls = lls
    
    print(f"Best log-likelihood: {best_ll:.2f}")
    return best_model, best_lls


def decode_states_ssm(model, data_list):
    """Get most likely state sequences and posterior probabilities."""
    all_states = []
    all_posteriors = []
    
    for data in data_list:
        # Viterbi (most likely sequence)
        states = model.most_likely_states(data)
        all_states.append(states)
        
        # Posterior probabilities
        posteriors = model.expected_states(data)[0]  # (T, K)
        all_posteriors.append(posteriors)
    
    return all_states, all_posteriors
```

---

## 3. Sticky HMM {#sticky-hmm}

Adds self-transition bias to prevent unrealistically rapid state switching.

```python
"""Sticky HMM using ssm library."""
import ssm

def fit_sticky_hmm(data_list, K, D, kappa=100, n_restarts=20, n_iters=200):
    """Fit sticky HMM.
    
    Parameters
    ----------
    kappa : float
        Stickiness parameter. Higher = longer dwell times.
        kappa=0 is standard HMM. kappa=100-1000 is typical for fMRI.
        Rule of thumb: set kappa so expected dwell time is ~5-10 TRs.
    """
    best_model = None
    best_ll = -np.inf
    
    for restart in range(n_restarts):
        model = ssm.HMM(
            K=K,
            D=D,
            observations='gaussian',
            transitions='sticky',
            transition_kwargs={'kappa': kappa},
        )
        
        lls = model.fit(data_list, method='em', num_iters=n_iters)
        
        if lls[-1] > best_ll:
            best_ll = lls[-1]
            best_model = model
    
    # Check effective dwell times
    trans_mat = np.exp(best_model.transitions.log_Ps)
    expected_dwell = 1.0 / (1.0 - np.diag(trans_mat))
    print(f"Expected dwell times (TRs): {expected_dwell}")
    
    return best_model
```

---

## 4. HMM-MAR with osl-dynamics {#hmm-mar}

```python
"""HMM-MAR using osl-dynamics (Oxford's toolbox for dynamic brain analysis).

Install: pip install osl-dynamics
This is the Python successor to the MATLAB HMM-MAR toolbox (Vidaurre et al.).
"""
from osl_dynamics.models.hmm import Config, Model
from osl_dynamics.data import Data
import numpy as np

def fit_hmm_mar(data_files, K, n_channels, sequence_length=200,
                 n_ar_lags=3, learn_means=True, learn_covariances=True,
                 n_epochs=40, batch_size=64):
    """Fit HMM-MAR using osl-dynamics.
    
    Parameters
    ----------
    data_files : list of str or list of arrays
        Paths to numpy files or arrays, each (T, n_channels)
    K : int
        Number of states
    n_channels : int
        Number of brain regions / ICA components
    sequence_length : int
        Length of sequences for training (segments of the timeseries)
    n_ar_lags : int
        Number of autoregressive lags (typically 1-5 for fMRI)
    learn_means : bool
        Whether states have different means
    learn_covariances : bool
        Whether states have different covariances
    """
    # Prepare data
    data = Data(data_files, store_dir='/tmp/osl_dynamics_data')
    data.prepare({
        'tde_pca': {'n_embeddings': n_ar_lags * 2 + 1, 'n_pca_components': n_channels},
        'standardize': {},
    })
    
    # Configure model
    config = Config(
        n_states=K,
        n_channels=n_channels,
        sequence_length=sequence_length,
        learn_means=learn_means,
        learn_covariances=learn_covariances,
        batch_size=batch_size,
        learning_rate=0.01,
        n_epochs=n_epochs,
    )
    
    model = Model(config)
    model.random_state_time_course_initialization(data, n_init=5, n_epochs=2)
    history = model.fit(data)
    
    # Get state time courses
    alpha = model.get_alpha(data)  # list of (T, K) arrays — state probabilities
    
    return model, alpha, history


# Alternative: using glhmm (Vidaurre's newer library)
def fit_glhmm(data_list, K, ar_order=3):
    """Fit Gaussian-Linear HMM using glhmm.

    Install: pip install glhmm
    Note: import the class directly — 'from glhmm import glhmm as gl' followed by
    'gl.glhmm(...)' is a double-level call and will raise AttributeError.
    """
    from glhmm import glhmm       # imports the glhmm *class* from the glhmm *package*
    from glhmm import preproc

    # Stack data
    data_concat = np.vstack(data_list)
    T_list = [d.shape[0] for d in data_list]
    indices = preproc.build_indices(T_list)

    # Instantiate directly — glhmm is the class, not a submodule
    model = glhmm(
        K=K,
        covtype='full',
        model_mean='state',
        model_beta='state',
        ar_order=ar_order,
    )
    model.train(data_concat, indices=indices, maxiter=200)

    # Decode
    vpath = model.decode(data_concat, indices=indices)

    return model, vpath
```

---

## 5. Input-Output HMM {#io-hmm}

For task-based fMRI where external events drive state transitions.

```python
"""Input-Output HMM using ssm library.

Task events enter as inputs that modulate either transitions or emissions.
"""
import ssm
import numpy as np
from nilearn.glm.first_level import spm_hrf

def prepare_task_inputs(events_df, n_trs, tr, hrf_convolve=True):
    """Convert task events to input matrix for IO-HMM.
    
    Parameters
    ----------
    events_df : DataFrame
        Columns: onset, duration, trial_type
    n_trs : int
        Total number of TRs
    tr : float
        Repetition time
    hrf_convolve : bool
        Whether to convolve inputs with HRF. Set True when fitting on BOLD
        (so inputs align with BOLD timing). Set False if fitting on deconvolved data.
    
    Returns
    -------
    inputs : array, shape (n_trs, n_conditions)
        One column per trial_type
    condition_names : list of str
    """
    trial_types = sorted(events_df['trial_type'].unique())
    n_conditions = len(trial_types)
    
    # Build stimulus timecourse at TR resolution
    inputs = np.zeros((n_trs, n_conditions))
    
    for i, tt in enumerate(trial_types):
        events = events_df[events_df['trial_type'] == tt]
        for _, event in events.iterrows():
            onset_tr = int(np.round(event['onset'] / tr))
            dur_trs = max(1, int(np.round(event['duration'] / tr)))
            end_tr = min(n_trs, onset_tr + dur_trs)
            inputs[onset_tr:end_tr, i] = 1.0
    
    if hrf_convolve:
        hrf = spm_hrf(tr, oversampling=1)
        for i in range(n_conditions):
            # mode='same' preserves array length T (mode='full' would return T+len(hrf)-1)
            convolved = np.convolve(inputs[:, i], hrf, mode='same')
            inputs[:, i] = convolved
    
    return inputs, trial_types


def fit_io_hmm(data_list, inputs_list, K, n_features, n_inputs,
                input_driven='transitions', n_restarts=20):
    """Fit input-output HMM.
    
    Parameters
    ----------
    data_list : list of arrays
        Each (T, n_features)
    inputs_list : list of arrays
        Each (T, n_inputs) — task inputs for each run
    K : int
        Number of states
    input_driven : str
        'transitions': inputs affect state switching probabilities
        'observations': inputs affect emission means
        'both': inputs affect both
    """
    if input_driven == 'transitions':
        transitions = 'inputdriven'
        observations = 'gaussian'
    elif input_driven == 'observations':
        transitions = 'standard'
        # ssm does not have a built-in 'input_driven_obs' observation class as of v0.0.1.
        # For input-modulated emissions, subclass ssm.observations.GaussianObservations
        # and override the log_likelihoods() method to add B_k @ u_t to the mean.
        # See: https://github.com/lindermanlab/ssm/blob/master/ssm/observations.py
        observations = 'gaussian'   # placeholder — customise as needed
    elif input_driven == 'both':
        transitions = 'inputdriven'
        observations = 'gaussian'   # replace with custom class for input-driven emissions
    
    best_model = None
    best_ll = -np.inf
    
    for restart in range(n_restarts):
        model = ssm.HMM(
            K=K,
            D=n_features,
            M=n_inputs,
            observations='gaussian',
            transitions=transitions,
        )
        
        lls = model.fit(
            data_list,
            inputs=inputs_list,
            method='em',
            num_iters=200,
        )
        
        if lls[-1] > best_ll:
            best_ll = lls[-1]
            best_model = model
    
    return best_model
```

---

## 6. SLDS with ssm library {#slds}

```python
"""Switching Linear Dynamical System using ssm library."""
import ssm
import numpy as np

def fit_slds(data_list, K, D, latent_dim, 
              n_restarts=10, n_iters=100):
    """Fit SLDS.
    
    Parameters
    ----------
    data_list : list of arrays
        Each (T, D) observation timeseries
    K : int
        Number of discrete switching states
    D : int
        Observation dimension
    latent_dim : int
        Continuous latent state dimension (typically 5-15 for fMRI)
    
    Returns
    -------
    best_model : ssm.SLDS
    q : variational posterior
    """
    best_model = None
    best_elbo = -np.inf
    
    for restart in range(n_restarts):
        model = ssm.SLDS(
            N=D,             # observation dimension
            K=K,             # number of discrete states
            D=latent_dim,    # latent dimension
            emissions='gaussian_orthog',  # orthogonal emission matrix
            dynamics='gaussian',
            transitions='standard',  # or 'recurrent' for rSLDS
        )
        
        # Fit with Laplace-EM
        elbos = model.fit(
            data_list,
            method='laplace_em',
            variational_posterior='structured_meanfield',
            num_iters=n_iters,
            initialize=True,
        )
        
        if elbos[-1] > best_elbo:
            best_elbo = elbos[-1]
            best_model = model
            best_elbos = elbos
    
    print(f"Best ELBO: {best_elbo:.2f}")
    return best_model, best_elbos


def decode_slds(model, data_list):
    """Decode latent states from fitted SLDS."""
    all_discrete_states = []
    all_continuous_states = []
    
    for data in data_list:
        # Most likely discrete states
        z = model.most_likely_states(data)
        all_discrete_states.append(z)
        
        # Posterior mean of continuous states
        q = model.approximate_posterior(
            data,
            method='laplace_em',
            variational_posterior='structured_meanfield',
            num_iters=50,
        )
        x = q.mean_continuous_states[0]  # (T, latent_dim)
        all_continuous_states.append(x)
    
    return all_discrete_states, all_continuous_states
```

---

## 7. rSLDS with ssm library {#rslds}

```python
"""Recurrent SLDS — discrete states depend on continuous latent state."""
import ssm

def fit_rslds(data_list, K, D, latent_dim, n_restarts=10, n_iters=100):
    """Fit rSLDS.
    
    The key difference from SLDS: transitions='recurrent', meaning
    P(z_t | z_{t-1}, x_{t-1}) depends on the continuous state x.
    """
    best_model = None
    best_elbo = -np.inf
    
    for restart in range(n_restarts):
        model = ssm.SLDS(
            N=D,
            K=K,
            D=latent_dim,
            emissions='gaussian_orthog',
            dynamics='gaussian',
            transitions='recurrent',  # This makes it recurrent
        )
        
        elbos = model.fit(
            data_list,
            method='laplace_em',
            variational_posterior='structured_meanfield',
            num_iters=n_iters,
            initialize=True,
        )
        
        if elbos[-1] > best_elbo:
            best_elbo = elbos[-1]
            best_model = model
    
    return best_model
```

---

## 8. Model Selection — Choosing K {#model-selection}

```python
"""Model selection utilities for SSMs on fMRI data."""
import numpy as np
from sklearn.model_selection import KFold

def select_K_bic(data, lengths, K_range=range(2, 16), covariance_type='full',
                  n_restarts=30):
    """Select K using BIC (Bayesian Information Criterion).
    
    BIC = -2 * log_likelihood + n_params * log(n_samples)
    Lower BIC is better.
    """
    from hmmlearn import hmm
    
    results = {}
    T, p = data.shape
    
    for K in K_range:
        model, score, _ = fit_gaussian_hmm(
            data, lengths, K, covariance_type=covariance_type,
            n_restarts=n_restarts
        )
        
        # Count parameters
        n_params = (K - 1)  # initial state
        n_params += K * (K - 1)  # transition matrix
        n_params += K * p  # means
        if covariance_type == 'full':
            n_params += K * p * (p + 1) // 2  # covariances
        elif covariance_type == 'diag':
            n_params += K * p
        
        bic = -2 * score + n_params * np.log(T)
        aic = -2 * score + 2 * n_params
        
        results[K] = {
            'log_likelihood': score,
            'bic': bic,
            'aic': aic,
            'n_params': n_params,
            'model': model,
        }
        print(f"K={K}: LL={score:.1f}, BIC={bic:.1f}, AIC={aic:.1f}, params={n_params}")
    
    best_K_bic = min(results, key=lambda k: results[k]['bic'])
    best_K_aic = min(results, key=lambda k: results[k]['aic'])
    print(f"\nBest K by BIC: {best_K_bic}")
    print(f"Best K by AIC: {best_K_aic}")
    
    return results, best_K_bic


def select_K_crossval(data_runs, K_range=range(2, 16), n_folds=None,
                       covariance_type='full', n_restarts=20):
    """Select K using cross-validated log-likelihood on held-out runs.
    
    Parameters
    ----------
    data_runs : list of arrays
        One array per fMRI run, shape (T_run, n_features)
    K_range : range
        K values to test
    n_folds : int or None
        If None, use leave-one-run-out
    """
    from hmmlearn import hmm
    
    n_runs = len(data_runs)
    if n_folds is None:
        n_folds = n_runs  # leave-one-run-out
    
    results = {}
    
    for K in K_range:
        fold_scores = []
        
        kf = KFold(n_splits=min(n_folds, n_runs), shuffle=False)
        run_indices = np.arange(n_runs)
        
        for train_idx, test_idx in kf.split(run_indices):
            # Concatenate training runs
            train_data = np.vstack([data_runs[i] for i in train_idx])
            train_lengths = [data_runs[i].shape[0] for i in train_idx]
            
            # Concatenate test runs
            test_data = np.vstack([data_runs[i] for i in test_idx])
            test_lengths = [data_runs[i].shape[0] for i in test_idx]
            
            # Fit on train
            model, _, _ = fit_gaussian_hmm(
                train_data, train_lengths, K,
                covariance_type=covariance_type,
                n_restarts=n_restarts
            )
            
            # Score on test
            test_score = model.score(test_data, test_lengths)
            # Normalize by number of test time points
            fold_scores.append(test_score / test_data.shape[0])
        
        mean_score = np.mean(fold_scores)
        std_score = np.std(fold_scores)
        results[K] = {'mean_cv_ll': mean_score, 'std_cv_ll': std_score}
        print(f"K={K}: CV log-lik = {mean_score:.4f} ± {std_score:.4f}")
    
    best_K = max(results, key=lambda k: results[k]['mean_cv_ll'])
    print(f"\nBest K by CV: {best_K}")
    
    return results, best_K


def state_stability_analysis(data, lengths, K, n_splits=10, n_restarts=30):
    """Check if states are reproducible across random splits and initializations.
    
    Fits the model on random 50/50 splits of the data and measures how
    similar the inferred states are. Stable states should be recoverable
    across splits.
    """
    from scipy.optimize import linear_sum_assignment
    from scipy.spatial.distance import cdist
    
    all_means = []
    
    for split in range(n_splits):
        rng = np.random.RandomState(split)
        # Random split of time points (within runs)
        split_data_list = []
        split_lengths = []
        offset = 0
        for length in lengths:
            run_data = data[offset:offset + length]
            mid = length // 2
            if rng.random() > 0.5:
                split_data_list.append(run_data[:mid])
            else:
                split_data_list.append(run_data[mid:])
            split_lengths.append(split_data_list[-1].shape[0])
            offset += length
        
        split_data = np.vstack(split_data_list)
        model, _, _ = fit_gaussian_hmm(
            split_data, split_lengths, K,
            n_restarts=n_restarts
        )
        all_means.append(model.means_)
    
    # Compare all pairs of splits using Hungarian algorithm
    similarities = []
    for i in range(n_splits):
        for j in range(i + 1, n_splits):
            cost = cdist(all_means[i], all_means[j], metric='correlation')
            row_ind, col_ind = linear_sum_assignment(cost)
            matched_corr = 1 - cost[row_ind, col_ind].mean()
            similarities.append(matched_corr)
    
    print(f"State stability (mean matched correlation): {np.mean(similarities):.3f} ± {np.std(similarities):.3f}")
    print(f"Values > 0.8 suggest stable states; < 0.5 suggests instability")
    
    return similarities
```

---

## 9. State Visualization {#visualization}

```python
"""Visualization utilities for SSM results on fMRI data."""
import numpy as np
import matplotlib.pyplot as plt

def plot_state_timecourse(states, tr, run_boundaries=None, ax=None, 
                           state_colors=None, title='State timecourse'):
    """Plot the inferred state sequence over time."""
    if ax is None:
        fig, ax = plt.subplots(figsize=(14, 2))
    
    T = len(states)
    K = len(np.unique(states))
    times = np.arange(T) * tr
    
    if state_colors is None:
        cmap = plt.cm.Set2
        state_colors = [cmap(i / K) for i in range(K)]
    
    for t in range(T - 1):
        ax.axvspan(times[t], times[t + 1], color=state_colors[states[t]], alpha=0.8)
    
    if run_boundaries is not None:
        for b in run_boundaries:
            ax.axvline(b * tr, color='black', linewidth=2, linestyle='--', alpha=0.5)
    
    ax.set_xlim(0, times[-1])
    ax.set_xlabel('Time (s)')
    ax.set_title(title)
    ax.set_yticks([])
    
    return ax


def plot_state_spatial_maps(means, roi_labels=None, n_top_regions=10):
    """Plot the top activated regions for each state."""
    K, p = means.shape
    
    fig, axes = plt.subplots(1, K, figsize=(4 * K, 6))
    if K == 1:
        axes = [axes]
    
    for k in range(K):
        ax = axes[k]
        state_mean = means[k]
        
        # Top positive and negative regions
        top_pos = np.argsort(state_mean)[-n_top_regions:][::-1]
        top_neg = np.argsort(state_mean)[:n_top_regions]
        top_idx = np.concatenate([top_pos, top_neg])
        
        values = state_mean[top_idx]
        if roi_labels is not None:
            labels = [roi_labels[i] for i in top_idx]
        else:
            labels = [f'ROI {i}' for i in top_idx]
        
        colors = ['#e74c3c' if v > 0 else '#3498db' for v in values]
        ax.barh(range(len(values)), values, color=colors)
        ax.set_yticks(range(len(values)))
        ax.set_yticklabels(labels, fontsize=8)
        ax.set_title(f'State {k + 1}')
        ax.axvline(0, color='black', linewidth=0.5)
    
    plt.tight_layout()
    return fig


def plot_transition_matrix(transmat, ax=None):
    """Plot transition probability matrix as heatmap."""
    if ax is None:
        fig, ax = plt.subplots(figsize=(6, 5))
    
    K = transmat.shape[0]
    im = ax.imshow(transmat, cmap='Blues', vmin=0, vmax=1)
    
    for i in range(K):
        for j in range(K):
            ax.text(j, i, f'{transmat[i, j]:.2f}', ha='center', va='center',
                    color='white' if transmat[i, j] > 0.5 else 'black', fontsize=10)
    
    ax.set_xticks(range(K))
    ax.set_yticks(range(K))
    ax.set_xticklabels([f'State {k+1}' for k in range(K)])
    ax.set_yticklabels([f'State {k+1}' for k in range(K)])
    ax.set_xlabel('To state')
    ax.set_ylabel('From state')
    ax.set_title('Transition matrix')
    plt.colorbar(im, ax=ax)
    
    return ax


def plot_dwell_time_distributions(dwell_times, tr, ax=None):
    """Plot dwell time distributions for each state."""
    K = len(dwell_times)
    if ax is None:
        fig, ax = plt.subplots(figsize=(8, 4))
    
    for k in range(K):
        dwells_sec = np.array(dwell_times[k]) * tr
        if len(dwells_sec) > 0:
            ax.hist(dwells_sec, bins=20, alpha=0.5, label=f'State {k+1} '
                    f'(mean={dwells_sec.mean():.1f}s)', density=True)
    
    ax.set_xlabel('Dwell time (seconds)')
    ax.set_ylabel('Density')
    ax.set_title('Dwell time distributions')
    ax.legend()
    
    return ax
```

---

## 10. Reproducibility and Initialization {#reproducibility}

```python
"""Best practices for reproducible SSM fitting on fMRI data."""
import numpy as np
import json

def save_ssm_config(filepath, **kwargs):
    """Save SSM configuration for reproducibility."""
    config = {
        'model_type': kwargs.get('model_type', 'gaussian_hmm'),
        'K': kwargs.get('K'),
        'covariance_type': kwargs.get('covariance_type', 'full'),
        'n_restarts': kwargs.get('n_restarts', 50),
        'n_iter': kwargs.get('n_iter', 200),
        'random_seed': kwargs.get('random_seed', 42),
        'parcellation': kwargs.get('parcellation', 'schaefer200'),
        'confound_strategy': kwargs.get('confound_strategy', 'moderate'),
        'hrf_strategy': kwargs.get('hrf_strategy', 'bold_direct'),
        'tr': kwargs.get('tr'),
        'preprocessing': kwargs.get('preprocessing', 'fmriprep+xcpd'),
        'notes': kwargs.get('notes', ''),
    }
    with open(filepath, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"Config saved to {filepath}")


def align_state_labels(reference_means, target_means):
    """Align state labels between two models using Hungarian algorithm.
    
    Use when comparing states across subjects or between runs.
    """
    from scipy.optimize import linear_sum_assignment
    from scipy.spatial.distance import cdist
    
    cost = cdist(reference_means, target_means, metric='correlation')
    row_ind, col_ind = linear_sum_assignment(cost)
    
    label_mapping = {col: row for row, col in zip(row_ind, col_ind)}
    return label_mapping
```

---

## 11. Model Diagnostics: Detecting Pathological Fits {#diagnostics}

Before reporting SSM results, always run these checks. Pathological fits produce
scientifically meaningless states that can appear statistically significant.

```python
"""Diagnostics for detecting common HMM failure modes on fMRI data."""
import numpy as np


def diagnose_hmm_fit(model, state_seq, confounds, fd, tr,
                     dominant_state_threshold=0.70,
                     min_dwell_trs=2,
                     motion_corr_threshold=0.30):
    """Run a battery of diagnostics on a fitted HMM.

    Parameters
    ----------
    model : fitted HMM (hmmlearn GaussianHMM or similar)
    state_seq : array, shape (T,)
        Viterbi state sequence
    confounds : array, shape (T, n_confounds)
        Confound matrix (motion params, WM/CSF, etc.)
    fd : array, shape (T,)
        Framewise displacement per TR
    tr : float
        Repetition time in seconds
    dominant_state_threshold : float
        Warn if any state occupies more than this fraction of TRs
    min_dwell_trs : int
        Warn if mean dwell time is below this many TRs
    motion_corr_threshold : float
        Warn if any state's occurrence correlates with FD above this value

    Returns
    -------
    report : dict
        Diagnostic results with 'warnings' list
    """
    K = model.n_components
    T = len(state_seq)
    warnings = []

    # --- 11a. Motion-driven state detection ---
    fd_clean = np.nan_to_num(fd, nan=0.0)
    motion_corrs = {}
    for k in range(K):
        state_indicator = (state_seq == k).astype(float)
        r = np.corrcoef(state_indicator, fd_clean)[0, 1]
        motion_corrs[k] = r
        if abs(r) > motion_corr_threshold:
            warnings.append(
                f"State {k}: |r|={abs(r):.2f} with framewise displacement "
                f"(threshold {motion_corr_threshold}). May be motion-driven."
            )

    # --- 11b. Dominant state pathology ---
    frac_occ = np.array([(state_seq == k).sum() / T for k in range(K)])
    dominant_states = np.where(frac_occ > dominant_state_threshold)[0]
    for k in dominant_states:
        warnings.append(
            f"State {k} dominates: {frac_occ[k]:.1%} of TRs. "
            f"Model may have collapsed — check BIC at lower K."
        )

    # --- 11c. Per-TR switching (too-fast switching) ---
    dwell_times = {k: [] for k in range(K)}
    current_state = state_seq[0]
    current_dwell = 1
    for t in range(1, T):
        if state_seq[t] == current_state:
            current_dwell += 1
        else:
            dwell_times[current_state].append(current_dwell)
            current_state = state_seq[t]
            current_dwell = 1
    dwell_times[current_state].append(current_dwell)

    mean_dwell = {k: np.mean(dwell_times[k]) if dwell_times[k] else 0 for k in range(K)}
    fast_states = [k for k, d in mean_dwell.items() if d < min_dwell_trs]
    for k in fast_states:
        warnings.append(
            f"State {k}: mean dwell = {mean_dwell[k]:.1f} TRs "
            f"(< {min_dwell_trs} TR minimum). "
            f"Solutions: add sticky prior, reduce K, check preprocessing."
        )

    # --- 11d. State-confound correlation check ---
    confound_corrs = {}
    for k in range(K):
        state_indicator = (state_seq == k).astype(float)
        corrs = [np.corrcoef(state_indicator, confounds[:, j])[0, 1]
                 for j in range(confounds.shape[1])]
        max_corr = np.max(np.abs(corrs))
        confound_corrs[k] = max_corr
        if max_corr > motion_corr_threshold:
            warnings.append(
                f"State {k}: max |r|={max_corr:.2f} with confound regressors. "
                f"Consider re-running with that confound removed from the data."
            )

    report = {
        'fractional_occupancy': frac_occ,
        'mean_dwell_times_trs': mean_dwell,
        'mean_dwell_times_sec': {k: v * tr for k, v in mean_dwell.items()},
        'motion_correlations': motion_corrs,
        'confound_correlations': confound_corrs,
        'warnings': warnings,
    }

    if warnings:
        print(f"=== {len(warnings)} diagnostic warning(s) ===")
        for w in warnings:
            print(f"  WARNING: {w}")
    else:
        print("All diagnostics passed.")

    return report
```

**Quick interpretation guide:**

| Warning | Likely cause | Fix |
|---------|-------------|-----|
| State correlates with FD | Motion artifact state | Tighter scrubbing; check if state disappears after removing high-motion subjects |
| Dominant state (>70%) | Model collapsed to trivial solution | Lower K; check for degenerate covariance; more restarts |
| Mean dwell < 2 TRs | Noise-driven rapid switching | Add sticky prior (`kappa`); or post-hoc apply minimum dwell-time filter |
| High confound correlation | Confound leakage | Revisit confound strategy; ensure confound regression happened before SSM fitting |

---

## 12. JAX-Based HMM for GPU Acceleration {#jax-gpu}

Use `ssm` with JAX for GPU-accelerated inference. The API is identical to the CPU version —
JAX handles device dispatch automatically.

```python
"""GPU-accelerated HMM using the ssm library with JAX backend.

Install:
    pip install jax jaxlib          # CPU JAX
    # For GPU (CUDA 12):
    pip install "jax[cuda12]" -f https://storage.googleapis.com/jax-releases/jax_cuda_releases.html
    pip install ssm                 # Linderman lab ssm (uses JAX internally for some operations)

When GPU acceleration matters:
    - >50 subjects or >1000 TRs/subject
    - rSLDS / SNLDS (Laplace-EM is computationally heavy)
    - Model selection sweeps over K (embarrassingly parallel)
    All code in this file runs on CPU — GPU is a drop-in speedup.
"""
import jax
import jax.numpy as jnp
import numpy as np
import ssm


def check_jax_device():
    """Report which device JAX is using."""
    backend = jax.default_backend()
    devices = jax.devices()
    print(f"JAX backend: {backend}")
    print(f"Available devices: {devices}")
    if backend == 'cpu':
        print("NOTE: Running on CPU. For GPU, install jax[cuda12] and ensure CUDA is available.")
    return backend


def fit_hmm_jax(data_list, K, D=None, n_restarts=20, n_iters=200):
    """Fit Gaussian HMM using ssm with JAX acceleration.

    Parameters
    ----------
    data_list : list of np.ndarray, each (T, D)
        Multiple runs / subjects. ssm handles variable-length sequences natively.
    K : int
        Number of states
    D : int or None
        Observation dimension (inferred from data if None)

    Notes
    -----
    ssm uses JAX for its core computations (forward-backward, EM updates).
    If JAX is configured to use a GPU, inference runs on GPU automatically.
    Convert data to float32 (vs float64) for faster GPU computation.
    """
    check_jax_device()

    if D is None:
        D = data_list[0].shape[1]

    # Convert to float32 for GPU efficiency (float64 is slower on most GPUs)
    data_list_f32 = [d.astype(np.float32) for d in data_list]

    best_model = None
    best_ll = -np.inf

    for restart in range(n_restarts):
        model = ssm.HMM(
            K=K,
            D=D,
            observations='gaussian',
            transitions='standard',
        )
        lls = model.fit(
            data_list_f32,
            method='em',
            num_iters=n_iters,
            tolerance=1e-4,
        )
        if lls[-1] > best_ll:
            best_ll = lls[-1]
            best_model = model
            best_lls = lls

    print(f"Best log-likelihood: {best_ll:.2f}")
    return best_model, best_lls


def fit_rslds_gpu(data_list, K, D, latent_dim, n_restarts=5, n_iters=100):
    """Fit rSLDS on GPU — most useful model to GPU-accelerate (Laplace-EM is heavy).

    rSLDS runtime scales as O(T × D² × latent_dim) per iteration.
    For large datasets (T > 10000, D > 50), GPU gives 5-10× speedup.
    """
    check_jax_device()
    data_f32 = [d.astype(np.float32) for d in data_list]

    best_model = None
    best_elbo = -np.inf

    for restart in range(n_restarts):
        model = ssm.SLDS(
            N=D,
            K=K,
            D=latent_dim,
            emissions='gaussian_orthog',
            dynamics='gaussian',
            transitions='recurrent',
        )
        elbos = model.fit(
            data_f32,
            method='laplace_em',
            variational_posterior='structured_meanfield',
            num_iters=n_iters,
            initialize=True,
        )
        if elbos[-1] > best_elbo:
            best_elbo = elbos[-1]
            best_model = model

    return best_model


# --- DyNeMo (osl-dynamics): GPU-native deep generative model ---
#
# DyNeMo is a variational recurrent neural network that learns dynamic
# network modes from BOLD data. It requires a GPU for practical runtimes.
#
# Install: pip install osl-dynamics tensorflow  (or jax-based version)
#
# Key use case: when HMM-MAR underfits and you need a more expressive model
# for naturalistic / resting-state data with complex temporal dynamics.
#
# from osl_dynamics.models.dynemo import Config, Model
# config = Config(
#     n_modes=K,
#     n_channels=n_rois,
#     sequence_length=200,
#     inference_n_units=64,
#     inference_normalization='layer',
#     model_n_units=64,
#     model_normalization='layer',
#     learn_means=False,
#     learn_covariances=True,
#     batch_size=16,
#     learning_rate=0.01,
#     n_epochs=50,
# )
# model = Model(config)
# model.compile()
# history = model.fit(data)
# alpha = model.get_alpha(data)  # (T, K) mixing coefficients
```

**GPU recommendation summary:**

| Scenario | Recommendation |
|----------|---------------|
| hmmlearn, standard Gaussian HMM | CPU is fine; hmmlearn has no JAX/GPU path |
| ssm Gaussian HMM, <50 subjects | CPU is fine |
| ssm / dynamax HMM, >50 subjects or >1000 TRs | GPU recommended |
| ssm rSLDS / SNLDS | GPU strongly recommended; 5-10× speedup |
| dynamax custom SSM with jit | GPU recommended; jit alone gives large speedup |
| osl-dynamics DyNeMo | GPU required for practical training |
| Model selection sweeps (many K values) | Parallelize across GPUs or use batch jobs |

---

## 13. dynamax: Lego-Style Custom SSMs {#dynamax}

`dynamax` (probml / Murphy lab) is a **JAX-native** SSM library built around a modular,
composable design. Instead of picking from a fixed menu of model types, you assemble your
model from independent, swappable pieces — like Lego bricks:

```
Your model = InitialComponent  +  TransitionComponent  +  EmissionComponent
```

Each component can be swapped independently without touching the others. This makes it
trivial to, e.g., test Gaussian vs. diagonal-Gaussian emissions with the same sticky
transition model, or compare standard vs. input-driven transitions with identical emissions.

All inference (EM, Viterbi, forward-backward, Kalman filter/smoother) runs under JAX JIT,
giving GPU acceleration and fast CPU execution automatically.

```
Install: pip install dynamax   (requires jax jaxlib)
Docs:    https://probml.github.io/dynamax/
```

### 13a. The Lego pieces available in dynamax

```
dynamax.hidden_markov_model
├── Transitions
│   ├── StandardTransitions          # unconstrained K×K matrix
│   ├── StickyTransitions             # adds κ self-transition bias (= sticky HMM)
│   └── (subclass AbstractTransitions for custom)
│
├── Emissions
│   ├── GaussianEmissions             # full-covariance Gaussian — standard choice for fMRI
│   ├── DiagonalGaussianEmissions     # diagonal covariance — for high-dimensional data
│   ├── LowRankGaussianEmissions      # low-rank + diagonal — balances FC and parameters
│   ├── SphericalGaussianEmissions    # isotropic — minimal parameters
│   ├── GaussianMixtureEmissions      # mixture-of-Gaussians per state (multi-modal)
│   └── (subclass AbstractEmissions for custom HRF-aware emissions, AR emissions, etc.)
│
└── Initial
    └── StandardInitialDistribution   # learnable π vector

dynamax.linear_gaussian_ssm
├── LinearGaussianSSM                 # standard LGSSM with Kalman filter/smoother
└── LinearGaussianConjugateSSM        # conjugate priors — EM with closed-form M-step
```

### 13b. Drop-in Gaussian HMM (baseline)

```python
"""Standard Gaussian HMM with dynamax — equivalent to hmmlearn but JAX-native."""
import jax.numpy as jnp
import jax.random as jr
from dynamax.hidden_markov_model import GaussianHMM


def fit_gaussian_hmm_dynamax(data_list, K, n_restarts=20, n_iters=100, seed=0):
    """Fit Gaussian HMM using dynamax EM.

    Parameters
    ----------
    data_list : list of np.ndarray, each (T, D)
        Multiple runs — dynamax handles variable lengths via a list.
    K : int
        Number of states
    n_restarts : int
        Number of random restarts (take best final log-likelihood)
    n_iters : int
        Max EM iterations per restart

    Returns
    -------
    best_params : dynamax parameter pytree
    best_lls : array of log-likelihoods per EM iteration
    model : GaussianHMM instance (for inference calls)
    """
    import numpy as np
    D = data_list[0].shape[1]

    # dynamax expects a single 2D array for single-sequence fitting,
    # or use jax.vmap / a loop for multiple sequences.
    # For multi-run fMRI, fit on concatenated data (pass lengths separately for scoring).
    emissions = jnp.array(np.vstack(data_list))

    model = GaussianHMM(num_states=K, emission_dim=D)

    best_params = None
    best_ll = -jnp.inf

    for restart in range(n_restarts):
        key = jr.PRNGKey(seed + restart)

        # K-means initialization on first restart, random otherwise
        init_method = "kmeans" if restart == 0 else "prior"
        params, props = model.initialize(key, method=init_method, emissions=emissions)

        params, lls = model.fit_em(params, props, emissions, num_iters=n_iters)

        if lls[-1] > best_ll:
            best_ll = lls[-1]
            best_params = params
            best_lls = lls

    print(f"Best final log-likelihood: {best_ll:.2f}")
    return best_params, best_lls, model


def decode_dynamax(model, params, emissions_jnp):
    """Viterbi decoding and posterior smoothing with dynamax."""
    # Most likely state sequence (Viterbi)
    most_likely_states = model.posterior_mode(params, emissions_jnp)

    # Posterior state probabilities (forward-backward smoother)
    posterior = model.smoother(params, emissions_jnp)
    smoothed_probs = posterior.smoothed_probs  # (T, K)

    return most_likely_states, smoothed_probs
```

### 13c. Swapping the emission component (the Lego idea)

```python
"""Replace Gaussian with DiagonalGaussian or LowRankGaussian — same training code."""
from dynamax.hidden_markov_model import (
    GaussianHMM,
    DiagonalGaussianHMM,
    LowRankGaussianHMM,
)
import jax.random as jr
import jax.numpy as jnp


def compare_emission_types(emissions_jnp, K, rank=5, seed=0):
    """Fit three HMMs that differ only in emission covariance structure.

    This is the Lego principle: swap one brick (emission), keep everything else.
    Use BIC to decide which covariance structure the data supports.

    Parameters
    ----------
    emissions_jnp : jax array, shape (T, D)
    K : int
        Number of states
    rank : int
        Rank for LowRankGaussianHMM (ignored for other types)
    """
    T, D = emissions_jnp.shape
    key = jr.PRNGKey(seed)

    results = {}

    emission_models = {
        # Full covariance: captures all pairwise FC per state
        # Parameters per state: D*(D+1)/2 — expensive for large D
        'full':     GaussianHMM(num_states=K, emission_dim=D),

        # Diagonal covariance: ignores FC, only models per-region variance
        # Parameters per state: D — use when D is large or data is limited
        'diagonal': DiagonalGaussianHMM(num_states=K, emission_dim=D),

        # Low-rank + diagonal: rank-r approximation to FC + independent noise
        # Parameters per state: D*rank + D — good middle ground for parcellated data
        'low_rank': LowRankGaussianHMM(num_states=K, emission_dim=D, emission_rank=rank),
    }

    for name, model in emission_models.items():
        k1, k2 = jr.split(jr.fold_in(key, hash(name) % 2**31))
        params, props = model.initialize(k1, method="kmeans", emissions=emissions_jnp)
        params, lls = model.fit_em(params, props, emissions_jnp, num_iters=100)

        final_ll = float(lls[-1])
        # Count parameters for BIC
        n_transition = K * (K - 1)
        n_emission = {
            'full':     K * D * (D + 1) // 2,
            'diagonal': K * D,
            'low_rank': K * (D * rank + D),
        }[name]
        n_params = n_transition + n_emission + (K - 1)  # +initial
        bic = -2 * final_ll + n_params * jnp.log(T)

        results[name] = {'ll': final_ll, 'bic': float(bic), 'params': params, 'model': model}
        print(f"{name:10s}: LL={final_ll:.1f}  BIC={float(bic):.1f}  n_params={n_params}")

    best = min(results, key=lambda x: results[x]['bic'])
    print(f"\nBest emission type by BIC: {best}")
    return results


# Swap the TRANSITION component instead:
# Standard → Sticky, keeping the same GaussianHMM emissions
from dynamax.hidden_markov_model import GaussianHMM
# The sticky prior is set via transition_matrix_stickiness at initialization:
#
# params, props = model.initialize(
#     key,
#     transition_matrix=jnp.full((K, K), 1.0/K),     # starting point
# )
# Then in props, set the stickiness concentration:
# props.transitions.transition_matrix_concentration = ...
# props.transitions.transition_matrix_stickiness = 50.0  # κ (higher = stickier)
#
# See: GaussianHMM(..., transition_matrix_stickiness=50.0) constructor kwarg.
```

### 13d. Custom emission model — HRF-aware Gaussian emissions

```python
"""Build a custom emission class that absorbs HRF smoothing in its mean structure.

The Lego design lets you subclass AbstractEmissions and plug it into any dynamax HMM
without touching the transition or initial components.

This is a sketch — fill in the HRF convolution matrix H and adapt for your data.
"""
import jax.numpy as jnp
import jax
from dynamax.hidden_markov_model.models import HMM
from dynamax.hidden_markov_model.emissions import GaussianEmissions


class HRFGaussianEmissions(GaussianEmissions):
    """Gaussian emissions whose mean is HRF-convolved neural activity.

    Each state has a neural mean μ_k. The observed emission mean is H @ μ_k,
    where H is the T×T lower-triangular Toeplitz HRF convolution matrix.
    This bakes the HRF into the emission model rather than preprocessing.

    Parameters
    ----------
    hrf_matrix : jax array, shape (T, T)
        Pre-computed HRF convolution matrix (lower-triangular Toeplitz).
        Build with: scipy.linalg.toeplitz(hrf, np.zeros(T)) clipped to (T, T).
    """

    def __init__(self, num_states, emission_dim, hrf_matrix, **kwargs):
        super().__init__(num_states, emission_dim, **kwargs)
        self.hrf_matrix = hrf_matrix  # (T, T) fixed — not learned

    def log_likelihoods(self, emissions, inputs, params, **kwargs):
        # Convolve each state mean with HRF before computing Gaussian likelihood
        # params.means: (K, D)
        # hrf_matrix @ params.means.T would give (T, K, D) — reshape as needed
        convolved_means = jnp.einsum('td,kd->tk', self.hrf_matrix, params.means)
        # convolved_means: (T, K) for D=1, or extend to (T, K, D) for multivariate
        # ... then evaluate N(emissions[t] | convolved_means[t,k], Sigma_k)
        # Full implementation depends on your HRF matrix structure.
        raise NotImplementedError("Fill in the multivariate Gaussian log-likelihood here.")


# Usage pattern:
# hrf_matrix = build_hrf_toeplitz(hrf_kernel, T=n_trs)
# emission_component = HRFGaussianEmissions(K, D, hrf_matrix)
# model = HMM(num_states=K, initial_component=...,
#              transition_component=..., emission_component=emission_component)
```

### 13e. Linear Gaussian SSM (Kalman filter) for smooth latent dynamics

```python
"""LGSSM with dynamax — useful when you want continuous latent dynamics without discrete switching.

Think of it as SLDS with K=1 (single regime). Use it as a baseline before fitting SLDS/rSLDS.
"""
import jax.numpy as jnp
import jax.random as jr
from dynamax.linear_gaussian_ssm import LinearGaussianSSM


def fit_lgssm_fmri(bold_data, state_dim=10, n_iters=100, seed=0):
    """Fit a Linear Gaussian SSM (Kalman filter model) to BOLD data.

    Learns a low-dimensional latent trajectory that best explains the BOLD signal.
    No discrete switching — use this as a baseline or for smooth dynamics analyses.

    Parameters
    ----------
    bold_data : array, shape (T, D)
        Preprocessed, parcellated BOLD timeseries
    state_dim : int
        Latent state dimension (typically 5–20 for parcellated fMRI)

    Returns
    -------
    params : fitted LGSSM parameters
    posterior : smoothed posterior (means, covariances, marginal_loglik)
    """
    T, D = bold_data.shape
    emissions = jnp.array(bold_data)

    model = LinearGaussianSSM(state_dim=state_dim, emission_dim=D)
    params, props = model.initialize(jr.PRNGKey(seed))
    params, lls = model.fit_em(params, props, emissions, num_iters=n_iters)

    # Smooth the latent trajectory
    posterior = model.smoother(params, emissions)
    latent_means = posterior.smoothed_means      # (T, state_dim)
    latent_covs  = posterior.smoothed_covariances  # (T, state_dim, state_dim)
    marginal_ll  = posterior.marginal_loglik

    print(f"Final marginal log-likelihood: {float(marginal_ll):.2f}")
    print(f"Emission matrix shape: {params.emissions.weights.shape}")  # (D, state_dim)

    return params, posterior
```

### 13f. When to use dynamax vs. ssm vs. hmmlearn

| Situation | Best choice |
|-----------|------------|
| Quickest path to a working Gaussian HMM | `hmmlearn` |
| Need rSLDS, SNLDS, or input-driven SLDS | `ssm` |
| Want to experiment with different emission/transition types rapidly | **`dynamax`** |
| Want to build a custom emission (e.g., HRF-aware, AR, mixture) | **`dynamax`** (subclass) |
| Want Kalman filter / LGSSM as a baseline | **`dynamax`** |
| Need JAX JIT + GPU for large-scale inference | **`dynamax`** or `ssm` |
| Group-level HMM with neuroimaging-specific features | `glhmm` |
| Deep generative model (DyNeMo) | `osl-dynamics` |
