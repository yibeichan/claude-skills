---
name: neuro-plotting
description: >
  Publication-quality matplotlib plotting for scientific papers, with deep support for
  cognitive neuroscience. Covers: colorblind-friendly palettes and colormaps, compact figure
  sizing for journal columns, font scaling by figure width, separate colorbar placement,
  clean x-axis labels (no rotation), rcParams for publication DPI/fonts/SVG, headless
  rendering on SLURM/HPC, and savefig wrappers that prevent memory leaks. Also covers
  brain-specific plotting: cortical surface rendering (surfplot, yabplot, nilearn), Yeo-7
  network colors, atlas parcellation heatmaps, transition matrices, and state occupancy
  plots. Use this skill whenever the user is making any matplotlib figure for a paper,
  poster, or presentation — whether it's a bar chart, heatmap, scatter plot, line plot,
  violin plot, or brain map. Use when the user asks about figure DPI, font sizes, colormaps,
  colorbar placement, colorblind-safe colors, journal figure formatting, or matplotlib
  styles. Also use when they mention brain surfaces, Yeo networks, Schaefer parcellations,
  fMRI activation maps, transition matrices, dwell times, or any neuroimaging visualization.
---

# Publication-Quality Scientific Plotting

Standards and patterns for creating clean, consistent, journal-ready figures in
matplotlib. General-purpose plotting conventions (colors, fonts, sizing, colorbars)
with deep support for cognitive neuroscience visualizations (brain surfaces, network
palettes, parcellation heatmaps).

## When to Use This Skill

- Creating or editing any matplotlib figure for a scientific paper, poster, or presentation
- Setting up consistent matplotlib styles across a project's figures
- Choosing colormaps, color palettes, or colorblind-friendly schemes
- Figuring out figure sizes or font sizes for journal submission
- Placing colorbars without overlapping axes
- Formatting axis labels, tick labels, or legends
- Plotting heatmaps, bar charts, scatter plots, violin plots, line plots
- Rendering brain surface maps (cortical/subcortical) from parcellated data
- Plotting transition matrices, state occupancies, dwell times, or dynamic FC results
- Working with Yeo-7 network labels, Schaefer parcellations, or similar brain atlases
- Debugging figure rendering issues on HPC/SLURM (headless, memory leaks, segfaults)

---

## Publication Style Setup

### The `apply_publication_style()` Pattern

Every project should have a single style-configuration function that sets all rcParams
in one place. This prevents font-size drift across scripts and ensures every figure
in the paper looks like it belongs together.

Font sizes should scale with figure size. Smaller figures need smaller fonts to avoid
text dominating the plot. Pick a tier and stay consistent across the project:

| Figure width | Title | Axis labels | Tick labels | Annotations |
|-------------|-------|-------------|-------------|-------------|
| <= 3.5 in (single-col) | 7 | 6 | 5 | 5 |
| 3.5-5.0 in (1.5-col) | 8 | 7 | 6 | 5-6 |
| 5.0-7.0 in (double-col) | 9 | 8 | 7 | 6 |
| > 7.0 in (wide panel) | 10 | 9 | 8 | 7 |

```python
import matplotlib
matplotlib.use("Agg")  # must come before pyplot import for headless environments
import matplotlib.pyplot as plt

def apply_publication_style(figwidth="double"):
    """Call once at script start, before any plt.figure().

    figwidth: "single" (<=3.5in), "1.5" (3.5-5in), "double" (5-7in), "wide" (>7in)
    """
    font_tiers = {
        "single": {"font.size": 6, "figure.titlesize": 7, "axes.titlesize": 7,
                    "axes.labelsize": 6, "xtick.labelsize": 5, "ytick.labelsize": 5},
        "1.5":    {"font.size": 7, "figure.titlesize": 8, "axes.titlesize": 8,
                    "axes.labelsize": 7, "xtick.labelsize": 6, "ytick.labelsize": 6},
        "double": {"font.size": 8, "figure.titlesize": 9, "axes.titlesize": 9,
                    "axes.labelsize": 8, "xtick.labelsize": 7, "ytick.labelsize": 7},
        "wide":   {"font.size": 9, "figure.titlesize": 10, "axes.titlesize": 10,
                    "axes.labelsize": 9, "xtick.labelsize": 8, "ytick.labelsize": 8},
    }
    params = {
        "figure.dpi": 300,
        "axes.facecolor": "white",
        "figure.facecolor": "white",
        "svg.fonttype": "none",  # editable text in Illustrator/Inkscape
    }
    params.update(font_tiers.get(figwidth, font_tiers["double"]))
    plt.rcParams.update(params)
```

**Why these values:**
- **300 DPI** is the minimum most journals accept; setting it globally means you never forget.
- **Scaled font tiers** keep text proportional to figure area — a 3.5-inch figure with 10 pt labels looks cramped; 5-6 pt breathes.
- **`svg.fonttype: "none"`** keeps text as real glyphs (not paths) so collaborators can edit labels in vector editors.
- **White backgrounds** prevent the grey canvas that matplotlib defaults can produce.

If using seaborn, call `apply_publication_style()` **after** `sns.set_theme()` so your
rcParams take precedence.

### Saving Figures

```python
def savefig(fig, path, dpi=300):
    """Save and close — prevents memory leaks in batch/SLURM jobs."""
    fig.savefig(path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)
```

Always close figures after saving. On HPC jobs that loop over subjects/states, unclosed
figures accumulate and eventually OOM-kill the process. The `savefig` wrapper makes this
automatic.

- Use `.png` for raster, `.svg` for vector.
- Always call `fig.tight_layout()` before saving to avoid clipped labels.

---

## Figure Sizes

Prefer compact figures. Journals shrink large figures to fit columns anyway, so a
figure designed at its final printed size will look sharper than one designed large
and scaled down (where fonts become illegibly small). Start small and only go bigger
if the data genuinely needs space.

| Layout | Size (w x h inches) | When to use |
|--------|---------------------|-------------|
| Single-column | `(3.5, 2.5)` | Most inline figures |
| 1.5-column | `(5.0, 3.0)` | Medium panels, grouped bar charts |
| Double-column / full-width | `(7.0, 4.0)` | Multi-panel composites |
| Wide heatmap | `(10, max(3, K*0.3+1))` | Transition matrices, large grids |
| Brain gallery (cortical + subcortical) | `(8, 3)` per state | Side-by-side brain views |
| Dwell-time grid | `(3*ncols, 2.5*nrows)` | Per-state distribution panels |

Scale height dynamically when the number of rows depends on data (e.g., K states, N networks).

---

## X-Axis Labels: Never Rotate

Rotated x-axis labels are hard to read and look messy. If labels are too long to fit
horizontally, wrap them onto two lines instead:

```python
# Bad: rotated labels
ax.set_xticklabels(labels, rotation=45, ha="right")

# Good: wrap long labels with newlines
wrapped = [lab.replace(" ", "\n") if len(lab) > 10 else lab for lab in labels]
ax.set_xticklabels(wrapped)
```

For network names or condition labels, abbreviate rather than rotate:
- `"SalVentAttn"` -> `"Sal/\nVentAttn"` or just `"SVA"`
- `"Default Mode"` -> `"Default\nMode"` or `"DMN"`

If even wrapping doesn't fit, the figure is probably too narrow — widen it or use
a horizontal bar chart instead.

---

## Colorbars: Always Separate

Never let matplotlib auto-place a colorbar with `plt.colorbar()` — it steals space
from the axes and causes misalignment in multi-panel figures. Instead, create a
dedicated axes for the colorbar:

```python
from mpl_toolkits.axes_grid1 import make_axes_locatable

# Option 1: Adjacent colorbar via axes_grid1
divider = make_axes_locatable(ax)
cax = divider.append_axes("right", size="3%", pad=0.08)
fig.colorbar(im, cax=cax)

# Option 2: Explicit axes in gridspec (best for multi-panel)
fig, axes = plt.subplots(1, 3, figsize=(7, 3),
                         gridspec_kw={"width_ratios": [1, 1, 0.05]})
im = axes[0].imshow(data, cmap="RdBu_r", vmin=-vmax, vmax=vmax)
axes[1].imshow(data2, cmap="RdBu_r", vmin=-vmax, vmax=vmax)
fig.colorbar(im, cax=axes[2])

# Option 3: Single colorbar for an entire row
fig.colorbar(im, ax=axes[:2], location="right", shrink=0.8, pad=0.02)
```

The key idea: the colorbar gets its own axes with explicit size/position, so it
never overlaps or squeezes the main plot. For multi-panel figures that share a
colormap, one shared colorbar is cleaner than one per panel.

---

## Color Palettes for Neuroscience

### Default: Colorblind-Friendly

About 8% of men and 0.5% of women have some form of colour vision deficiency. Every
figure should be readable by everyone. Use colorblind-safe palettes by default, not
as an afterthought.

**For categorical data** (conditions, groups, states), use one of these:

```python
import seaborn as sns

# Best default — 10 distinct, colorblind-safe colors
CB_PALETTE = sns.color_palette("colorblind")

# Alternative: Wong (2011) palette — 8 colors, widely used in science
WONG_PALETTE = [
    "#000000",  # black
    "#E69F00",  # orange
    "#56B4E9",  # sky blue
    "#009E73",  # bluish green
    "#F0E442",  # yellow
    "#0072B2",  # blue
    "#D55E00",  # vermilion
    "#CC79A7",  # reddish purple
]

# Use directly
ax.bar(x, y, color=CB_PALETTE[:len(x)])
```

Only fall back to non-colorblind palettes when there's a strong domain reason (e.g.,
Yeo-7 network colors, which are field-standard).

### Yeo-7 Network Colors (+ Subcortical)

The Yeo 2011 7-network parcellation has canonical colors used across the field. These
are NOT fully colorblind-safe, but they're the field standard for brain network
visualizations. Use them only for network-labeled data; for everything else, prefer
the colorblind palettes above.

```python
NETWORK_COLORS = {
    "Vis":         "#781286",
    "SomMot":      "#4682B4",
    "DorsAttn":    "#00760E",
    "SalVentAttn": "#C43AFA",
    "Limbic":      "#DCF8A4",
    "Cont":        "#E69422",
    "Default":     "#CD3E4E",
    "Subcortical": "#808080",
}

NETWORK_ORDER = [
    "Vis", "SomMot", "DorsAttn", "SalVentAttn",
    "Limbic", "Cont", "Default", "Subcortical",
]
```

Define these once in a shared module and import everywhere. Never redefine in individual
scripts — that's how colors silently diverge between figures.

When using Yeo colors, always add a second visual channel (hatching, markers, linestyle)
to compensate for the colorblind-unfriendly palette.

### State Role Colors (for Transition Topology)

When labeling states by their role in a transition graph (gateway, sink, source):

```python
STATE_ROLE_COLORS = {
    "gateway":      "#E69F00",  # orange (Wong)
    "sink":         "#D55E00",  # vermilion (Wong)
    "source":       "#0072B2",  # blue (Wong)
    "intermediate": "#999999",  # grey
}
```

### Legend Helpers

Build legend handles programmatically rather than relying on plot order:

```python
from matplotlib.patches import Patch

def make_network_legend_handles(networks, colors=NETWORK_COLORS):
    return [Patch(facecolor=colors[n], label=n) for n in networks]

def make_role_legend_handles(roles=STATE_ROLE_COLORS):
    return [Patch(facecolor=c, label=r) for r, c in roles.items()]
```

---

## Colormap Conventions

Choosing the right colormap for your data type matters for interpretability. Prefer
colormaps that are **perceptually uniform** and **colorblind-safe**. All recommendations
below meet both criteria.

| Data type | Colormap | CB-safe? | Notes |
|-----------|----------|----------|-------|
| Brain activation (diverging) | `"RdBu_r"` | yes | Centre at 0; symmetric `vmin/vmax` |
| Brain activation (positive-only) | `"YlOrRd"` | yes | |
| Transition probability (off-diag) | `"YlOrRd"` | yes | |
| Transition probability (full) | `"viridis"` + `LogNorm` | yes | Log scale for sparse matrices |
| Occupancy / recurrence | `"cividis"` | yes | Better than `YlGnBu` for CVD |
| Cosine similarity | `"RdBu_r"` | yes | Centre at 0 |
| Count / confusion matrix | `"viridis"` or `"cividis"` | yes | Normalise rows first |

**Avoid:** `"jet"`, `"rainbow"`, `"hot"`, `"hsv"` — these are not perceptually uniform
and fail badly for colorblind viewers. If you see `jet` in existing code, replace it.

**Key principle:** diverging data (positive and negative values around zero) needs a
diverging colormap centered at zero. Sequential data (counts, probabilities) needs a
sequential colormap. Getting this wrong misleads readers.

For diverging colormaps, compute symmetric limits:
```python
vmax = np.percentile(np.abs(data), 95)
im = ax.imshow(data, cmap="RdBu_r", vmin=-vmax, vmax=vmax)
```

The 95th percentile avoids letting outliers wash out the color range.

---

## Typography in Figures

- **Axes titles**: sentence case, no trailing period (`"Recurrence score"`)
- **State labels**: `k=N` inline; `State N` in axis labels
- **Units**: always include — `"Dwell time (s)"`, `"Time (TRs)"`, `"Z-score"`

---

## Accessibility

1. **Colorblind-safe palettes first.** (See Color Palettes section above.)
2. **Dual encoding**: colour AND shape/linestyle for every categorical distinction.
   Scatter: vary marker shape. Lines: vary linestyle. Readable in greyscale.
3. **Minimum font sizes**: 5 pt absolute minimum; scale with figure size per font tier table.

---

## Dynamic FC Plots (Transition Matrices, Occupancy, Dwell Times)

For dynamic functional connectivity analyses, see `references/dynamic-fc-plots.md` for
complete plotting functions. Quick patterns:

- **Transition matrices**: Use `YlOrRd` for probabilities, `LogNorm` for sparse matrices,
  `RdBu_r` centered at 0 for difference matrices. Always create a separate colorbar axes.
- **State occupancy**: Grouped bar charts with error bars. Use Wong palette colors for groups.
  Add significance brackets with `add_significance_bracket()`.
- **Dwell times**: Violin or raincloud plots per state. Grid layout with `ncols=4`.
- **State sequences**: Color-coded strips via `imshow` with `ListedColormap`. Carpet plots
  for multi-subject comparisons.

---

## Heatmaps and Connectivity Matrices

For parcellation-level heatmaps and FC matrices, see `references/heatmaps-matrices.md`.
Key principles:

- Sort parcels by network so block structure is visible
- Draw thin black lines at network boundaries (`ax.axhline`, `ax.axvline`)
- Use symmetric color range for correlation-based data (`RdBu_r`, centered at 0)
- Overlay significance with FDR correction for statistical maps
- Use `sns.clustermap` only for exploration — switch to manual ordering for publication

---

## Multi-Panel Figure Composition

For complex multi-panel layouts, see `references/multi-panel-composition.md`. Key patterns:

- Use `gridspec` (not `plt.subplots`) when panels have different sizes
- Use `subgridspec` for nested layouts (e.g., brain maps row + metrics row)
- Panel labels: bold uppercase **A**, **B**, **C** at top-left, 1-2 pt larger than axis labels
- Shared colorbars: always via explicit `cax` in gridspec, never auto-placed

---

## Brain Surface Rendering

For detailed guidance on rendering cortical and subcortical brain maps (using surfplot,
yabplot, nilearn, or pyvista), including headless/HPC setup and atlas management, see
`references/brain-rendering.md`.

Quick pattern for surfplot (recommended for publication-quality cortical surfaces):

```python
from surfplot import Plot
from neuromaps.datasets import fetch_fslr

surfaces = fetch_fslr()
p = Plot(surfaces["inflated"], views=["lateral", "medial"],
         size=(400, 200), zoom=1.2)
p.add_layer(stat_map_lh, stat_map_rh, cmap="RdBu_r",
            color_range=(-vmax, vmax))
fig = p.build()
fig.savefig("brain_surface.png", dpi=300, bbox_inches="tight")
```

Quick pattern for yabplot:

```python
# Headless setup — MUST come before any pyvista/yabplot import
from utils.viz_yabplot import setup_yabplot_headless
setup_yabplot_headless()

from utils.viz_yabplot import load_parcel_labels, render_brain_pattern

labels_df = load_parcel_labels("atlas-4S156Parcels")
vmax = np.percentile(np.abs(all_patterns), 95)
cortical_img, subcortical_img = render_brain_pattern(
    pattern, labels_df, "atlas-4S156Parcels", (-vmax, vmax), cmap="RdBu_r"
)
```

Then composite into matplotlib:
```python
fig, axes = plt.subplots(1, 2, figsize=(10, 4),
                         gridspec_kw={"width_ratios": [2.5, 1.5]})
axes[0].imshow(cortical_img); axes[0].axis("off")
axes[1].imshow(subcortical_img); axes[1].axis("off")
savefig(fig, out_path)
```

---

## Atlas Metadata and Network Sorting

When plotting parcellation-level data (heatmaps, connectivity matrices), sort parcels
by network so the block structure is visible:

```python
from utils.atlas import load_atlas_metadata, sort_parcels_by_network

atlas_df = load_atlas_metadata("atlas-4S156Parcels")
sort_idx, boundaries = sort_parcels_by_network(atlas_df)

# Reorder matrix rows/columns by network
sorted_matrix = matrix[np.ix_(sort_idx, sort_idx)]

# Draw network boundaries
for b in boundaries:
    ax.axhline(b, color="k", linewidth=0.5)
    ax.axvline(b, color="k", linewidth=0.5)
```

---

## Common Pitfalls

| Problem | Solution |
|---------|----------|
| Blank figure on SLURM / HPC | `matplotlib.use("Agg")` before importing pyplot (or use `apply_publication_style()`) |
| Memory leak in batch jobs | Always `plt.close(fig)` after saving — use the `savefig` wrapper |
| Network colors differ between scripts | Import from one shared module; never redefine |
| Font sizes inconsistent | All sizes from `apply_publication_style()`; don't override per-script |
| Wrong DPI in saved file | Set DPI in `savefig()`, not in `plt.show()` |
| Seaborn theme overrides your style | Call `apply_publication_style()` after `sns.set_theme()` |
| SVG text rendered as paths | Set `svg.fonttype: "none"` (the style function handles this) |
| Brain rendering segfaults on HPC | Call headless setup before any pyvista/vtk import; or use surfplot (no VTK needed) |
| Color range differs between panels | Compute `vmin/vmax` once from all data, pass to every panel |
| Axis labels clipped in saved file | Use `bbox_inches="tight"` in `savefig` |
| Rotated x-axis labels | Never rotate — wrap text to two lines or abbreviate instead |
| Colorbar overlapping axes | Create a separate `cax` for the colorbar; never use bare `plt.colorbar()` |
| Colorblind-unfriendly palette | Use `seaborn "colorblind"` or Wong palette; reserve Yeo-7 for network plots only |
| `jet` or `rainbow` colormap | Replace with `viridis`, `cividis`, or `RdBu_r` — always perceptually uniform |

---

## Project Setup Checklist

When setting up plotting for a new neuroscience project:

1. Create `utils/plot_style.py` with `apply_publication_style()`, color constants, and `savefig()`
2. Define project-specific constants (TR, atlas name, condition colors) in the same module
3. If rendering brain surfaces, create `utils/viz_brain.py` with headless setup and rendering functions
4. If using parcellated data, create `utils/atlas.py` for metadata loading and network sorting
5. Every plotting script imports from these modules — no local redefinitions

This structure ensures that changing a color, font size, or DPI propagates to every
figure in the project automatically.

---

## Quick Reference: Imports Template

```python
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from utils.plot_style import (
    apply_publication_style, savefig,
    NETWORK_COLORS, NETWORK_ORDER,
)

apply_publication_style()

# ... your plotting code ...
# fig = plt.figure(figsize=(7.0, 5.0))
# ...
# savefig(fig, "figures/my_figure.png")
```
