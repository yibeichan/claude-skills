# Multi-Panel Figure Composition

Patterns for building complex multi-panel figures for journal publications.
Covers gridspec layouts, nested grids, panel labeling, shared axes, and
common neuroscience figure layouts.

## Table of Contents

- [GridSpec Basics](#gridspec-basics)
- [Nested GridSpec](#nested-gridspec)
- [Panel Labels (A, B, C)](#panel-labels)
- [Shared Axes and Colorbars](#shared-axes-and-colorbars)
- [Common Neuroscience Layouts](#common-neuroscience-layouts)
- [Insets](#insets)

---

## GridSpec Basics

For anything beyond a simple grid, use `gridspec` directly instead of
`plt.subplots`. It gives precise control over relative sizes and spacing.

```python
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

fig = plt.figure(figsize=(7.0, 5.0))
gs = fig.add_gridspec(2, 3, width_ratios=[2, 1, 1], height_ratios=[1, 1.5],
                      hspace=0.35, wspace=0.3)

ax_brain = fig.add_subplot(gs[0, :])    # full width brain map
ax_bar   = fig.add_subplot(gs[1, 0])    # occupancy bars
ax_mat   = fig.add_subplot(gs[1, 1])    # transition matrix
ax_cbar  = fig.add_subplot(gs[1, 2])    # dedicated colorbar
```

**Key parameters:**
- `width_ratios` / `height_ratios`: relative sizes (not absolute inches)
- `hspace` / `wspace`: spacing as fraction of average subplot size
- Spanning: `gs[0, :]` spans all columns; `gs[:, 0]` spans all rows

---

## Nested GridSpec

When different regions of the figure need their own internal layout:

```python
fig = plt.figure(figsize=(7.0, 6.0))

# Outer grid: 2 rows
outer = fig.add_gridspec(2, 1, height_ratios=[1, 1.5], hspace=0.3)

# Top row: brain maps (4 states side by side)
inner_top = outer[0].subgridspec(1, 4, wspace=0.05)
brain_axes = [fig.add_subplot(inner_top[0, i]) for i in range(4)]

# Bottom row: 2 panels with different widths
inner_bot = outer[1].subgridspec(1, 3, width_ratios=[2, 1, 0.05], wspace=0.3)
ax_heatmap = fig.add_subplot(inner_bot[0, 0])
ax_bars    = fig.add_subplot(inner_bot[0, 1])
ax_cbar    = fig.add_subplot(inner_bot[0, 2])
```

This avoids fighting with `plt.subplots` when panels have different sizes.

---

## Panel Labels

Journal figures need (A), (B), (C) labels. Place them consistently:

```python
def add_panel_labels(fig, axes, labels=None, fontsize=10, fontweight="bold",
                     x_offset=-0.05, y_offset=1.05):
    """Add panel labels (A, B, C, ...) to figure axes.

    Parameters
    ----------
    axes : list of Axes
        The axes to label (in order).
    labels : list of str, optional
        Custom labels. Defaults to A, B, C, ...
    x_offset, y_offset : float
        Position relative to each axes' top-left corner (in axes coords).
    """
    if labels is None:
        labels = [chr(65 + i) for i in range(len(axes))]

    for ax, label in zip(axes, labels):
        ax.text(x_offset, y_offset, label, transform=ax.transAxes,
                fontsize=fontsize, fontweight=fontweight, va="bottom", ha="right")
```

**Conventions:**
- Bold, uppercase letters: **A**, **B**, **C**
- Position: top-left of each panel, slightly outside the axes
- Font size: 1-2 pt larger than axis labels (typically 9-10 pt)
- Use `transform=ax.transAxes` so position is relative to each panel

---

## Shared Axes and Colorbars

### Shared Y-Axis Across a Row

```python
fig, axes = plt.subplots(1, 3, figsize=(7, 2.5), sharey=True)
axes[0].set_ylabel("Dwell time (TRs)")
# Only leftmost axis gets the ylabel; tick labels auto-hidden on others
```

### Single Colorbar for Multiple Panels

```python
# Option 1: fig.colorbar with ax= list (auto-steals space)
fig.colorbar(im, ax=axes.tolist(), location="right", shrink=0.8, pad=0.02)

# Option 2 (preferred): explicit cbar axes in gridspec
fig = plt.figure(figsize=(7, 3))
gs = fig.add_gridspec(1, 4, width_ratios=[1, 1, 1, 0.04], wspace=0.05)
for i in range(3):
    ax = fig.add_subplot(gs[0, i])
    im = ax.imshow(data[i], cmap="RdBu_r", vmin=-vmax, vmax=vmax)
cax = fig.add_subplot(gs[0, 3])
fig.colorbar(im, cax=cax)
```

Option 2 is always preferred — explicit control, no surprise resizing.

### Aligned Colorbars in Multi-Row Figures

```python
fig = plt.figure(figsize=(7, 5))
gs = fig.add_gridspec(2, 3, width_ratios=[1, 1, 0.04])

for row in range(2):
    for col in range(2):
        ax = fig.add_subplot(gs[row, col])
        im = ax.imshow(data[row][col], cmap="RdBu_r", vmin=-vmax, vmax=vmax)

    cax = fig.add_subplot(gs[row, 2])
    fig.colorbar(im, cax=cax)
```

---

## Common Neuroscience Layouts

### Layout 1: Brain States + Metrics

Top row: brain surface maps; Bottom row: occupancy bars + transition matrix.

```
+-------+-------+-------+-------+
| Brain | Brain | Brain | Brain |  (Row 0: state brain maps)
|  k=0  |  k=1  |  k=2  |  k=3  |
+-------+-------+---+---+-------+
|  Occupancy Bars   | Trans Mat |  (Row 1: summary metrics)
+-------------------+-----------+
```

```python
fig = plt.figure(figsize=(7.0, 4.5))
gs = fig.add_gridspec(2, 4, height_ratios=[1, 1], hspace=0.35, wspace=0.3)

brain_axes = [fig.add_subplot(gs[0, i]) for i in range(4)]
ax_occ = fig.add_subplot(gs[1, :2])
ax_trans = fig.add_subplot(gs[1, 2:])
```

### Layout 2: Group Comparison Panel

```
+-------+-------+
| FC(A) | FC(B) |  (Row 0: connectivity matrices per group)
+-------+-------+
| Diff  | Stats |  (Row 1: difference map + significance)
+-------+-------+
```

```python
fig = plt.figure(figsize=(7.0, 6.0))
gs = fig.add_gridspec(2, 3, width_ratios=[1, 1, 0.04], hspace=0.35, wspace=0.3)

ax_fc_a = fig.add_subplot(gs[0, 0])
ax_fc_b = fig.add_subplot(gs[0, 1])
cax_fc  = fig.add_subplot(gs[0, 2])
ax_diff = fig.add_subplot(gs[1, 0])
ax_stat = fig.add_subplot(gs[1, 1])
cax_diff = fig.add_subplot(gs[1, 2])
```

### Layout 3: Supplementary Multi-State Gallery

For supplementary figures with many states (K > 6):

```python
K = 10
ncols = 4
nrows = int(np.ceil(K / ncols))

fig = plt.figure(figsize=(3.5 * ncols, 3.0 * nrows))
gs = fig.add_gridspec(nrows, ncols + 1, width_ratios=[1] * ncols + [0.04],
                      hspace=0.3, wspace=0.2)

for k in range(K):
    row, col = divmod(k, ncols)
    ax = fig.add_subplot(gs[row, col])
    ax.imshow(brain_imgs[k])
    ax.set_title(f"State {k}")
    ax.axis("off")

# Shared colorbar
cax = fig.add_subplot(gs[:, ncols])
fig.colorbar(mappable, cax=cax)
```

---

## Insets

For small plots embedded within a larger panel (e.g., a zoomed-in region,
a mini distribution):

```python
# Inset axes within an existing axes
from mpl_toolkits.axes_grid1.inset_locator import inset_axes

ax_inset = inset_axes(ax_main,
                      width="30%", height="30%",  # relative to parent
                      loc="upper right",
                      borderpad=1)
ax_inset.plot(x_zoom, y_zoom)
ax_inset.set_xlim(x_lo, x_hi)

# Or with explicit position (in axes coordinates)
ax_inset = ax_main.inset_axes([0.65, 0.65, 0.3, 0.3])  # [x, y, w, h]
```

Use insets sparingly — they work well for zoomed regions or small summary
statistics, but can make figures cluttered if overused.
