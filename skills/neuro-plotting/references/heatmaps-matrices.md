# Heatmaps and Matrix Plots

Patterns for plotting connectivity matrices, parcellation heatmaps, cosine
similarity matrices, and other 2D data common in neuroimaging analyses.

## Table of Contents

- [Connectivity Matrices](#connectivity-matrices)
- [Cosine Similarity Matrices](#cosine-similarity-matrices)
- [Network-Sorted Heatmaps](#network-sorted-heatmaps)
- [Clustered Heatmaps](#clustered-heatmaps)
- [Annotation Patterns](#annotation-patterns)

---

## Connectivity Matrices

### Symmetric FC Matrix with Network Boundaries

```python
import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.axes_grid1 import make_axes_locatable

def plot_fc_matrix(fc_mat, atlas_df, sort_by_network=True, cmap="RdBu_r",
                   title="Functional Connectivity", ax=None):
    """Plot a parcellation-level FC matrix with network boundaries.

    Parameters
    ----------
    fc_mat : ndarray, shape (N_parcels, N_parcels)
        Symmetric connectivity matrix (e.g., Pearson correlation).
    atlas_df : DataFrame
        Parcel metadata with 'network' and 'label' columns.
    sort_by_network : bool
        If True, reorder rows/cols so network blocks are contiguous.
    """
    from utils.atlas import sort_parcels_by_network

    if ax is None:
        N = fc_mat.shape[0]
        size = max(3.5, N * 0.03 + 2)
        fig, ax = plt.subplots(figsize=(size, size))
    else:
        fig = ax.figure

    if sort_by_network:
        sort_idx, boundaries = sort_parcels_by_network(atlas_df)
        plot_data = fc_mat[np.ix_(sort_idx, sort_idx)]
    else:
        plot_data = fc_mat
        boundaries = []

    # Symmetric color range
    vmax = np.percentile(np.abs(plot_data[~np.eye(plot_data.shape[0], dtype=bool)]), 95)

    im = ax.imshow(plot_data, cmap=cmap, vmin=-vmax, vmax=vmax, interpolation="nearest")

    # Draw network boundaries
    for b in boundaries:
        ax.axhline(b - 0.5, color="black", linewidth=0.3)
        ax.axvline(b - 0.5, color="black", linewidth=0.3)

    ax.set_title(title)
    ax.set_xticks([])
    ax.set_yticks([])

    # Colorbar in separate axes
    divider = make_axes_locatable(ax)
    cax = divider.append_axes("right", size="3%", pad=0.08)
    fig.colorbar(im, cax=cax, label="Correlation (r)")

    return fig, ax
```

### Adding Network Labels to Axes

```python
def add_network_labels(ax, atlas_df, boundaries, network_order, colors=None):
    """Add colored network labels along axes of a connectivity matrix.

    Places labels at the midpoint of each network's block.
    """
    from utils.plot_style import NETWORK_COLORS

    if colors is None:
        colors = NETWORK_COLORS

    midpoints = []
    for i, net in enumerate(network_order):
        start = boundaries[i] if i < len(boundaries) else 0
        end = boundaries[i + 1] if i + 1 < len(boundaries) else atlas_df.shape[0]
        midpoints.append((start + end) / 2)

    ax.set_yticks(midpoints)
    ax.set_yticklabels(network_order)

    # Color the tick labels
    for label, net in zip(ax.get_yticklabels(), network_order):
        label.set_color(colors.get(net, "black"))
```

---

## Cosine Similarity Matrices

For comparing brain patterns (e.g., state centroids) via cosine similarity:

```python
from sklearn.metrics.pairwise import cosine_similarity

def plot_cosine_similarity(patterns, labels=None, ax=None):
    """Plot pairwise cosine similarity between a set of patterns.

    Parameters
    ----------
    patterns : ndarray, shape (K, N_features)
        Each row is a pattern (e.g., brain state centroid).
    labels : list of str
        Labels for each pattern.
    """
    K = patterns.shape[0]
    sim = cosine_similarity(patterns)

    if labels is None:
        labels = [f"State {i}" for i in range(K)]

    if ax is None:
        fig, ax = plt.subplots(figsize=(max(3.5, K * 0.8), max(3, K * 0.7)))
    else:
        fig = ax.figure

    im = ax.imshow(sim, cmap="RdBu_r", vmin=-1, vmax=1)

    # Annotate cells
    for i in range(K):
        for j in range(K):
            color = "white" if abs(sim[i, j]) > 0.7 else "black"
            ax.text(j, i, f"{sim[i, j]:.2f}", ha="center", va="center",
                    color=color, fontsize=plt.rcParams["xtick.labelsize"])

    ax.set_xticks(range(K))
    ax.set_yticks(range(K))
    ax.set_xticklabels(labels)
    ax.set_yticklabels(labels)
    ax.set_title("Cosine similarity")

    divider = make_axes_locatable(ax)
    cax = divider.append_axes("right", size="4%", pad=0.1)
    fig.colorbar(im, cax=cax)

    return fig, ax
```

---

## Network-Sorted Heatmaps

For parcellation-level data (e.g., one value per parcel per state), show as
a heatmap with parcels sorted by network:

```python
def plot_parcel_heatmap(data, atlas_df, row_labels=None, cmap="RdBu_r",
                        title="Parcel Values", figsize=None):
    """Heatmap of values per parcel, sorted by network.

    Parameters
    ----------
    data : ndarray, shape (K, N_parcels) or (N_parcels,)
        Values for each parcel. If 2D, rows are conditions/states.
    atlas_df : DataFrame
        Parcel metadata with 'network' column.
    """
    from utils.atlas import sort_parcels_by_network

    if data.ndim == 1:
        data = data.reshape(1, -1)

    K, N = data.shape
    sort_idx, boundaries = sort_parcels_by_network(atlas_df)
    sorted_data = data[:, sort_idx]

    if figsize is None:
        figsize = (max(7, N * 0.04), max(2, K * 0.4 + 1))

    fig, ax = plt.subplots(figsize=figsize)

    vmax = np.percentile(np.abs(sorted_data), 95)
    im = ax.imshow(sorted_data, cmap=cmap, vmin=-vmax, vmax=vmax,
                   aspect="auto", interpolation="nearest")

    # Network boundary lines (vertical)
    for b in boundaries:
        ax.axvline(b - 0.5, color="black", linewidth=0.3)

    if row_labels is not None:
        ax.set_yticks(range(K))
        ax.set_yticklabels(row_labels)
    ax.set_xlabel("Parcels (sorted by network)")
    ax.set_title(title)

    divider = make_axes_locatable(ax)
    cax = divider.append_axes("right", size="2%", pad=0.08)
    fig.colorbar(im, cax=cax)

    return fig, ax
```

---

## Clustered Heatmaps

When you need hierarchical clustering on both axes (e.g., exploring FC structure
without a predefined atlas ordering):

```python
import seaborn as sns

def plot_clustered_fc(fc_mat, labels=None, method="ward", cmap="RdBu_r",
                      figsize=(5, 5)):
    """Clustered heatmap with dendrograms using seaborn.

    Note: seaborn.clustermap creates its own figure, so this doesn't
    compose easily into multi-panel matplotlib figures. Use for
    standalone exploratory plots.
    """
    vmax = np.percentile(np.abs(fc_mat[~np.eye(fc_mat.shape[0], dtype=bool)]), 95)

    g = sns.clustermap(
        fc_mat,
        cmap=cmap,
        vmin=-vmax, vmax=vmax,
        method=method,
        figsize=figsize,
        xticklabels=labels if labels else False,
        yticklabels=labels if labels else False,
        linewidths=0,
        dendrogram_ratio=0.1,
    )

    g.ax_heatmap.set_xlabel("")
    g.ax_heatmap.set_ylabel("")

    return g
```

**Caveat:** `sns.clustermap` creates its own figure and gridspec, so it doesn't
fit into `plt.subplots` layouts. Use it for exploratory analysis, and switch
to `plot_fc_matrix` with pre-computed clustering order for publication figures.

---

## Annotation Patterns

### Cell Value Annotations

```python
def annotate_heatmap(ax, data, fmt=".2f", threshold=0.7):
    """Add value annotations to an existing heatmap.

    Parameters
    ----------
    threshold : float
        Values above this fraction of the data range use white text.
    """
    data_range = np.nanmax(np.abs(data))
    for i in range(data.shape[0]):
        for j in range(data.shape[1]):
            val = data[i, j]
            if np.isnan(val):
                continue
            color = "white" if abs(val) > data_range * threshold else "black"
            ax.text(j, i, f"{val:{fmt}}", ha="center", va="center",
                    color=color, fontsize=plt.rcParams["xtick.labelsize"])
```

### Significance Overlay

Overlay significance markers (e.g., from permutation testing) on a heatmap:

```python
def overlay_significance(ax, p_values, alpha=0.05, marker="*", correction="fdr"):
    """Mark significant cells on a heatmap.

    Parameters
    ----------
    p_values : ndarray, same shape as the heatmap data
    alpha : float
        Significance threshold.
    correction : str
        "none", "bonferroni", or "fdr".
    """
    if correction == "bonferroni":
        alpha_adj = alpha / p_values.size
    elif correction == "fdr":
        from statsmodels.stats.multitest import multipletests
        flat_p = p_values.flatten()
        reject, _, _, _ = multipletests(flat_p, alpha=alpha, method="fdr_bh")
        sig_mask = reject.reshape(p_values.shape)
    else:
        sig_mask = p_values < alpha

    if correction != "fdr":
        sig_mask = p_values < alpha_adj if correction == "bonferroni" else p_values < alpha

    for i in range(sig_mask.shape[0]):
        for j in range(sig_mask.shape[1]):
            if sig_mask[i, j]:
                ax.text(j, i, marker, ha="center", va="center",
                        color="black", fontsize=plt.rcParams["axes.labelsize"],
                        fontweight="bold")
```
