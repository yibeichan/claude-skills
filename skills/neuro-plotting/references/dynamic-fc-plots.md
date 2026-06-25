# Dynamic Functional Connectivity Plots

Patterns for visualizing results from dynamic FC / brain state analyses:
transition matrices, state occupancy, dwell times, and temporal state sequences.

## Table of Contents

- [Transition Matrices](#transition-matrices)
- [State Occupancy Bar Charts](#state-occupancy-bar-charts)
- [Dwell Time Distributions](#dwell-time-distributions)
- [Temporal State Sequences](#temporal-state-sequences)
- [Group Comparison Layouts](#group-comparison-layouts)

---

## Transition Matrices

Transition matrices show the probability of moving from state i to state j.
The diagonal (self-transitions) is usually dominant, so off-diagonal structure
is what matters.

### Basic Transition Matrix

```python
import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.axes_grid1 import make_axes_locatable

def plot_transition_matrix(trans_mat, state_labels=None, ax=None, cmap="YlOrRd",
                           annotate=True, fmt=".2f", title="Transition Probability"):
    """Plot a K x K transition probability matrix.

    Parameters
    ----------
    trans_mat : ndarray, shape (K, K)
        Row-normalized transition probabilities (rows sum to 1).
    state_labels : list of str, optional
        Labels for each state. Defaults to ["State 0", "State 1", ...].
    annotate : bool
        Whether to print values in cells.
    """
    K = trans_mat.shape[0]
    if state_labels is None:
        state_labels = [f"State {i}" for i in range(K)]

    if ax is None:
        fig, ax = plt.subplots(figsize=(max(3.5, K * 0.8 + 1), max(3, K * 0.7 + 1)))
    else:
        fig = ax.figure

    im = ax.imshow(trans_mat, cmap=cmap, vmin=0, vmax=trans_mat.max())

    if annotate:
        for i in range(K):
            for j in range(K):
                val = trans_mat[i, j]
                color = "white" if val > trans_mat.max() * 0.7 else "black"
                ax.text(j, i, f"{val:{fmt}}", ha="center", va="center",
                        color=color, fontsize=plt.rcParams["xtick.labelsize"])

    ax.set_xticks(range(K))
    ax.set_yticks(range(K))
    ax.set_xticklabels(state_labels)
    ax.set_yticklabels(state_labels)
    ax.set_xlabel("To state")
    ax.set_ylabel("From state")
    ax.set_title(title)

    # Separate colorbar axes
    divider = make_axes_locatable(ax)
    cax = divider.append_axes("right", size="4%", pad=0.1)
    fig.colorbar(im, cax=cax)

    return fig, ax
```

### Log-Scaled Transition Matrix

For sparse matrices where most off-diagonal values are near zero:

```python
from matplotlib.colors import LogNorm

def plot_transition_matrix_log(trans_mat, state_labels=None, ax=None):
    """Log-scaled transition matrix for sparse transitions."""
    K = trans_mat.shape[0]
    if state_labels is None:
        state_labels = [f"State {i}" for i in range(K)]

    if ax is None:
        fig, ax = plt.subplots(figsize=(max(3.5, K * 0.8 + 1), max(3, K * 0.7 + 1)))
    else:
        fig = ax.figure

    # Replace zeros with small value for log scale
    plot_data = trans_mat.copy()
    plot_data[plot_data == 0] = np.nan

    im = ax.imshow(plot_data, cmap="viridis",
                   norm=LogNorm(vmin=np.nanmin(plot_data[plot_data > 0]),
                                vmax=np.nanmax(plot_data)))

    ax.set_xticks(range(K))
    ax.set_yticks(range(K))
    ax.set_xticklabels(state_labels)
    ax.set_yticklabels(state_labels)
    ax.set_xlabel("To state")
    ax.set_ylabel("From state")
    ax.set_title("Transition Probability (log scale)")

    divider = make_axes_locatable(ax)
    cax = divider.append_axes("right", size="4%", pad=0.1)
    fig.colorbar(im, cax=cax, label="P(transition)")

    return fig, ax
```

### Side-by-Side Group Comparison

```python
def plot_transition_comparison(trans_a, trans_b, labels_a="Group A", labels_b="Group B",
                               state_labels=None, diff=True):
    """Side-by-side transition matrices with optional difference panel."""
    ncols = 3 if diff else 2
    width_ratios = [1, 1, 1.15] if diff else [1, 1.15]

    fig, axes = plt.subplots(1, ncols, figsize=(3.5 * ncols, 3.5),
                             gridspec_kw={"width_ratios": width_ratios})

    vmax_shared = max(trans_a.max(), trans_b.max())

    plot_transition_matrix(trans_a, state_labels, ax=axes[0],
                          title=labels_a, cmap="YlOrRd")
    plot_transition_matrix(trans_b, state_labels, ax=axes[1],
                          title=labels_b, cmap="YlOrRd")

    if diff:
        diff_mat = trans_b - trans_a
        vmax_diff = np.percentile(np.abs(diff_mat), 95)
        im = axes[2].imshow(diff_mat, cmap="RdBu_r", vmin=-vmax_diff, vmax=vmax_diff)
        axes[2].set_title(f"{labels_b} - {labels_a}")
        K = trans_a.shape[0]
        if state_labels is None:
            state_labels = [f"State {i}" for i in range(K)]
        axes[2].set_xticks(range(K))
        axes[2].set_yticks(range(K))
        axes[2].set_xticklabels(state_labels)
        axes[2].set_yticklabels(state_labels)

        divider = make_axes_locatable(axes[2])
        cax = divider.append_axes("right", size="4%", pad=0.1)
        fig.colorbar(im, cax=cax, label="Difference")

    fig.tight_layout()
    return fig, axes
```

---

## State Occupancy Bar Charts

State occupancy (fractional occupancy) = fraction of time spent in each state.

### Basic Occupancy

```python
def plot_state_occupancy(occupancies, state_labels=None, colors=None, ax=None,
                         ylabel="Fractional occupancy"):
    """Bar chart of state occupancies.

    Parameters
    ----------
    occupancies : array-like, shape (K,)
        Fraction of time in each state (should sum to ~1.0).
    """
    K = len(occupancies)
    if state_labels is None:
        state_labels = [f"State {i}" for i in range(K)]
    if colors is None:
        import seaborn as sns
        colors = sns.color_palette("colorblind", K)

    if ax is None:
        fig, ax = plt.subplots(figsize=(max(3.5, K * 0.6), 2.5))
    else:
        fig = ax.figure

    bars = ax.bar(range(K), occupancies, color=colors, edgecolor="black", linewidth=0.5)
    ax.set_xticks(range(K))
    ax.set_xticklabels(state_labels)
    ax.set_ylabel(ylabel)
    ax.set_ylim(0, max(occupancies) * 1.15)

    # Add value labels on bars
    for bar, val in zip(bars, occupancies):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.005,
                f"{val:.2f}", ha="center", va="bottom",
                fontsize=plt.rcParams["xtick.labelsize"])

    return fig, ax
```

### Group Comparison with Error Bars

```python
def plot_occupancy_comparison(occ_a, occ_b, sem_a, sem_b,
                              labels=("Group A", "Group B"),
                              state_labels=None, colors=None):
    """Grouped bar chart comparing occupancy between two groups."""
    K = len(occ_a)
    if state_labels is None:
        state_labels = [f"State {i}" for i in range(K)]
    if colors is None:
        colors = ["#56B4E9", "#E69F00"]  # Wong blue + orange

    fig, ax = plt.subplots(figsize=(max(3.5, K * 1.0), 2.5))
    x = np.arange(K)
    width = 0.35

    ax.bar(x - width / 2, occ_a, width, yerr=sem_a, label=labels[0],
           color=colors[0], edgecolor="black", linewidth=0.5, capsize=2)
    ax.bar(x + width / 2, occ_b, width, yerr=sem_b, label=labels[1],
           color=colors[1], edgecolor="black", linewidth=0.5, capsize=2)

    ax.set_xticks(x)
    ax.set_xticklabels(state_labels)
    ax.set_ylabel("Fractional occupancy")
    ax.legend(frameon=False)

    return fig, ax
```

### Adding Significance Stars

```python
def add_significance_bracket(ax, x1, x2, y, p_value, height=0.02):
    """Add a significance bracket between two bars.

    Parameters
    ----------
    x1, x2 : float
        X positions of the two bars to compare.
    y : float
        Y position of the bracket (usually max bar height + offset).
    p_value : float
        The p-value to convert to stars.
    """
    stars = "n.s."
    if p_value < 0.001:
        stars = "***"
    elif p_value < 0.01:
        stars = "**"
    elif p_value < 0.05:
        stars = "*"

    ax.plot([x1, x1, x2, x2], [y, y + height, y + height, y],
            color="black", linewidth=0.8)
    ax.text((x1 + x2) / 2, y + height, stars, ha="center", va="bottom",
            fontsize=plt.rcParams["xtick.labelsize"])
```

---

## Dwell Time Distributions

Dwell time = duration of consecutive visits to a state. Usually plotted as
distributions (violin, box, or strip plots) rather than single values.

### Violin Plot Grid

```python
import seaborn as sns

def plot_dwell_times(dwell_dict, state_labels=None, colors=None,
                     ylabel="Dwell time (TRs)", ncols=4):
    """Grid of violin plots, one per state.

    Parameters
    ----------
    dwell_dict : dict
        {state_idx: array_of_dwell_times} for each state.
    """
    K = len(dwell_dict)
    if state_labels is None:
        state_labels = {i: f"State {i}" for i in range(K)}
    if colors is None:
        colors = sns.color_palette("colorblind", K)

    nrows = int(np.ceil(K / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(3 * ncols, 2.5 * nrows),
                             squeeze=False)

    for idx, (state_k, dwells) in enumerate(sorted(dwell_dict.items())):
        row, col = divmod(idx, ncols)
        ax = axes[row, col]

        parts = ax.violinplot(dwells, positions=[0], showmedians=True, showextrema=False)
        for pc in parts["bodies"]:
            pc.set_facecolor(colors[idx])
            pc.set_alpha(0.7)
        parts["cmedians"].set_color("black")

        ax.set_title(state_labels.get(state_k, f"State {state_k}"))
        ax.set_ylabel(ylabel if col == 0 else "")
        ax.set_xticks([])

    # Hide unused axes
    for idx in range(K, nrows * ncols):
        row, col = divmod(idx, ncols)
        axes[row, col].axis("off")

    fig.tight_layout()
    return fig, axes
```

### Grouped Dwell Time Comparison (Raincloud)

For comparing dwell time distributions between groups, a raincloud plot
(half-violin + strip + box) gives the most information:

```python
import pandas as pd

def plot_dwell_raincloud(dwell_df, x="state", y="dwell_time", hue="group",
                         colors=None):
    """Raincloud plot for group-level dwell time comparison.

    Parameters
    ----------
    dwell_df : DataFrame
        Long-format with columns: state, dwell_time, group, subject.
    """
    if colors is None:
        colors = ["#56B4E9", "#E69F00"]

    states = sorted(dwell_df[x].unique())
    K = len(states)
    fig, ax = plt.subplots(figsize=(max(3.5, K * 1.2), 3.0))

    # Half-violin + strip (using seaborn)
    sns.violinplot(data=dwell_df, x=x, y=y, hue=hue, split=True,
                   inner="quart", palette=colors, ax=ax, linewidth=0.5, cut=0)
    # Overlay strip for individual points (small alpha)
    sns.stripplot(data=dwell_df, x=x, y=y, hue=hue, dodge=True,
                  palette=colors, ax=ax, size=1.5, alpha=0.3, jitter=True)

    # Remove duplicate legend entries from stripplot
    handles, labels = ax.get_legend_handles_labels()
    ax.legend(handles[:2], labels[:2], frameon=False)
    ax.set_ylabel("Dwell time (TRs)")

    return fig, ax
```

---

## Temporal State Sequences

Showing the temporal sequence of state assignments (e.g., for a single subject
or run) as a color-coded strip.

### State Sequence Strip

```python
def plot_state_sequence(state_seq, colors=None, ax=None, ylabel="State",
                        xlabel="Time (TRs)"):
    """Color-coded strip showing state assignments over time.

    Parameters
    ----------
    state_seq : array-like, shape (T,)
        State index at each time point.
    """
    K = len(np.unique(state_seq))
    if colors is None:
        import seaborn as sns
        colors = sns.color_palette("colorblind", K)

    if ax is None:
        fig, ax = plt.subplots(figsize=(7, 0.5))
    else:
        fig = ax.figure

    from matplotlib.colors import ListedColormap
    cmap = ListedColormap(colors[:K])

    ax.imshow(state_seq.reshape(1, -1), aspect="auto", cmap=cmap,
              interpolation="nearest", vmin=0, vmax=K - 1)
    ax.set_yticks([])
    ax.set_xlabel(xlabel)

    return fig, ax
```

### Multi-Subject Carpet Plot

```python
def plot_state_carpet(state_matrix, subject_labels=None, colors=None):
    """Carpet plot of state sequences for multiple subjects.

    Parameters
    ----------
    state_matrix : ndarray, shape (n_subjects, T)
        State assignments for each subject.
    """
    n_sub, T = state_matrix.shape
    K = len(np.unique(state_matrix))
    if colors is None:
        import seaborn as sns
        colors = sns.color_palette("colorblind", K)

    from matplotlib.colors import ListedColormap
    cmap = ListedColormap(colors[:K])

    fig, ax = plt.subplots(figsize=(7, max(2, n_sub * 0.15)))
    ax.imshow(state_matrix, aspect="auto", cmap=cmap, interpolation="nearest",
              vmin=0, vmax=K - 1)
    ax.set_xlabel("Time (TRs)")
    ax.set_ylabel("Subject")

    if subject_labels is not None:
        ax.set_yticks(range(n_sub))
        ax.set_yticklabels(subject_labels)
    else:
        ax.set_yticks([])

    return fig, ax
```

---

## Group Comparison Layouts

### Full Dynamic FC Summary Figure

A common multi-panel figure for a dynamic FC paper:

```python
def plot_dfc_summary(trans_mats, occupancies, state_brain_imgs,
                     state_labels, group_labels=("Group A", "Group B")):
    """Multi-panel summary: brain maps + occupancy + transition matrices.

    Layout:
        Row 0: Brain maps for each state
        Row 1: Occupancy comparison + transition matrices for each group
    """
    K = len(state_labels)

    fig = plt.figure(figsize=(7.0, 5.0))
    gs = fig.add_gridspec(2, K + 2, height_ratios=[1, 1.2],
                          hspace=0.3, wspace=0.3)

    # Row 0: brain state maps
    for k in range(K):
        ax = fig.add_subplot(gs[0, k])
        ax.imshow(state_brain_imgs[k])
        ax.set_title(state_labels[k])
        ax.axis("off")

    # Row 1 left: occupancy comparison
    ax_occ = fig.add_subplot(gs[1, :K])
    # ... fill with grouped bar chart

    # Row 1 right: transition matrices
    for g, trans in enumerate(trans_mats):
        ax_tm = fig.add_subplot(gs[1, K + g])
        plot_transition_matrix(trans, state_labels, ax=ax_tm,
                              title=group_labels[g])

    return fig
```

This is a skeleton — adapt dimensions and layout to your specific K and number
of groups. The key principle is using `gridspec` for precise control over panel
sizes rather than relying on `plt.subplots` alone.
