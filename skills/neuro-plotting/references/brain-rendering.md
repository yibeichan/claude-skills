# Brain Surface Rendering for Publication Figures

Detailed guide for rendering cortical surface maps and subcortical volumes from
parcellated neuroimaging data. Covers headless rendering on HPC, atlas setup,
and compositing into matplotlib figures.

## Table of Contents

- [Headless Setup for HPC/SLURM](#headless-setup)
- [surfplot (Recommended)](#surfplot)
- [yabplot Workflow](#yabplot-workflow)
- [nilearn Alternative](#nilearn-alternative)
- [Atlas Management](#atlas-management)
- [Compositing Brain Views into Figures](#compositing)
- [Color Range Consistency](#color-range-consistency)
- [Troubleshooting](#troubleshooting)

---

## Headless Setup

Brain rendering libraries (pyvista, vtk, yabplot) need a display context. On HPC
nodes there's no display, so you need a software renderer. This setup **must** happen
before importing any rendering library.

### Using yabplot

```python
from utils.viz_yabplot import setup_yabplot_headless
setup_yabplot_headless()   # sets OSMesa or Xvfb, pv.OFF_SCREEN = True

import yabplot as yab      # safe to import AFTER headless setup
```

### Using pyvista Directly

```python
import pyvista as pv
pv.OFF_SCREEN = True
pv.start_xvfb()  # or set VTK_DEFAULT_RENDER_WINDOW_OFFSCREEN=1 in environment
```

### Using nilearn

nilearn's `plot_surf_stat_map` uses matplotlib by default (no VTK needed), so it
works headless without extra setup. For interactive 3D views, nilearn uses plotly.

**Import order matters.** If you import pyvista or vtk before setting up headless
rendering, you'll get segfaults or blank images. Structure your imports like:

```python
# 1. Headless setup
setup_yabplot_headless()

# 2. Now safe to import rendering libraries
import yabplot as yab
import pyvista as pv
```

---

## surfplot (Recommended)

surfplot builds on brainspace and matplotlib to produce publication-ready cortical
surface figures with minimal code. It's the best option when you need multi-view
layouts (lateral + medial) with clean aesthetics and no VTK dependency for the final
figure output.

### Basic Usage

```python
from surfplot import Plot
from neuromaps.datasets import fetch_fslr

# Fetch fsLR-32k surfaces (standard for HCP/fMRIPrep CIFTI output)
surfaces = fetch_fslr()

# Create a plot with lateral + medial views for both hemispheres
p = Plot(
    surf_lh=surfaces["inflated"],
    surf_rh=surfaces["inflated"],
    views=["lateral", "medial"],
    size=(400, 200),  # per-view size in pixels
    zoom=1.2,
)

# Add a statistical map layer
p.add_layer(
    data={"left": stat_map_lh, "right": stat_map_rh},
    cmap="RdBu_r",
    color_range=(-vmax, vmax),
)

fig = p.build()
fig.savefig("brain.png", dpi=300, bbox_inches="tight")
plt.close(fig)
```

### Adding Outlines (Parcellation Boundaries)

```python
from neuromaps.datasets import fetch_fslr
from surfplot.utils import add_fslr_medial_wall

# Load Schaefer parcellation on fsLR
p.add_layer(
    data={"left": parcel_lh, "right": parcel_rh},
    cmap="tab20",
    as_outline=True,       # draw boundaries, not filled regions
    cbar=False,
)
```

### Multi-Layer Figures

surfplot supports stacking layers — e.g., activation map + parcellation outline +
significance mask:

```python
p.add_layer(stat_data, cmap="RdBu_r", color_range=(-3, 3))
p.add_layer(sig_mask, cmap="Greys", as_outline=True, cbar=False)
```

### Key Advantages Over Other Tools

- No VTK/pyvista dependency for final rendering (outputs matplotlib figures)
- Built-in multi-view layouts (lateral, medial, dorsal, ventral, anterior, posterior)
- Clean integration with neuromaps for fetching standard surfaces and parcellations
- Figures are native matplotlib, so compositing with other panels is straightforward

### Headless Compatibility

surfplot uses matplotlib for rendering, so it works headless with just
`matplotlib.use("Agg")`. No VTK/OSMesa setup needed (unlike yabplot/pyvista).

---

## yabplot Workflow

yabplot renders parcellated brain data onto cortical surfaces and subcortical volumes.
The workflow has three stages: load labels, render, composite.

### Stage 1: Load Parcel Labels

```python
from utils.viz_yabplot import load_parcel_labels

labels_df = load_parcel_labels("atlas-4S156Parcels")
# Returns DataFrame with columns: parcel_index, label, network, hemisphere
```

The atlas name should match what your preprocessing pipeline used (e.g., Schaefer 100/200/400,
4S156Parcels, Glasser360).

### Stage 2: Render Brain Pattern

```python
from utils.viz_yabplot import render_brain_pattern

# Compute symmetric color range from 95th percentile across ALL patterns
vmax = np.percentile(np.abs(all_patterns), 95)
color_range = (-vmax, vmax)

cortical_img, subcortical_img = render_brain_pattern(
    pattern,          # 1D array, one value per parcel
    labels_df,        # from load_parcel_labels
    "atlas-4S156Parcels",
    color_range,      # (vmin, vmax) tuple
    cmap="RdBu_r",
)
```

Both return numpy arrays (RGBA images) suitable for `ax.imshow()`.

### Stage 3: Composite into Matplotlib

```python
fig, axes = plt.subplots(1, 2, figsize=(10, 4),
                         gridspec_kw={"width_ratios": [2.5, 1.5]})

axes[0].imshow(cortical_img)
axes[0].set_title(f"State {k} — cortical")
axes[0].axis("off")

axes[1].imshow(subcortical_img)
axes[1].set_title(f"State {k} — subcortical")
axes[1].axis("off")

fig.tight_layout()
savefig(fig, f"figures/state_{k}_brain.png")
```

### Multi-State Gallery

When rendering multiple states, compute the color range once from all patterns:

```python
all_patterns = np.stack([patterns[k] for k in range(K)])
vmax = np.percentile(np.abs(all_patterns), 95)
color_range = (-vmax, vmax)

for k in range(K):
    cortical, subcortical = render_brain_pattern(
        patterns[k], labels_df, atlas_name, color_range, cmap="RdBu_r"
    )
    # ... composite and save
```

This ensures colors are comparable across states.

---

## nilearn Alternative

If yabplot isn't available, nilearn provides similar functionality:

### Surface Plots

```python
from nilearn import plotting, surface, datasets

fsaverage = datasets.fetch_surf_fsaverage()

# For parcellated data, you need to map parcels back to vertices
# (depends on your atlas; Schaefer parcellations have nilearn support)

plotting.plot_surf_stat_map(
    fsaverage.pial_left,
    stat_map=vertex_data_left,
    hemi="left",
    view="lateral",
    cmap="RdBu_r",
    symmetric_cbar=True,
    threshold=0.01,
    bg_map=fsaverage.sulc_left,
    output_file="figures/brain_lateral.png",
    dpi=300,
)
```

### Glass Brain (Volume Space)

```python
plotting.plot_glass_brain(
    nifti_stat_map,
    display_mode="lyrz",
    colorbar=True,
    cmap="RdBu_r",
    output_file="figures/glass_brain.png",
    dpi=300,
)
```

---

## Atlas Management

### Building Atlas Files

Some rendering tools require pre-built atlas meshes. Build once per atlas:

```bash
# Example for yabplot
python tools/build_schaefer100_cortical.py
python tools/build_4s156_subcortical.py
```

These create mesh files that the rendering functions look up by atlas name.

### Atlas Metadata

Load parcel metadata (labels, network assignments, hemisphere) for sorting and coloring:

```python
from utils.atlas import load_atlas_metadata, sort_parcels_by_network

atlas_df = load_atlas_metadata("atlas-4S156Parcels")
sort_idx, boundaries = sort_parcels_by_network(atlas_df)
```

`sort_idx` reorders parcels so networks are grouped together.
`boundaries` marks where each network starts (for drawing grid lines on heatmaps).

---

## Color Range Consistency

The single most common mistake in multi-panel brain figures is using different color
ranges for different panels. This makes visual comparison impossible.

**Rule: compute color limits once from all data, then pass to every rendering call.**

```python
# Good: one range for everything
vmax = np.percentile(np.abs(np.concatenate(all_data)), 95)

# Bad: per-panel normalization
for data in all_data:
    vmax = np.max(np.abs(data))  # different for each panel!
```

The 95th percentile is a good default — it clips extreme outliers without losing
dynamic range. Use 99th if your data is well-behaved, or manually set limits if
you need exact thresholds for statistical significance.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Segfault on `import yabplot` | VTK needs display context | Call `setup_yabplot_headless()` before import |
| Blank/black brain image | Off-screen rendering not enabled | Set `pv.OFF_SCREEN = True` before rendering |
| Atlas file not found | Haven't built atlas meshes | Run the `build_*` scripts once |
| Colors differ between states | Per-panel color normalization | Compute `color_range` once from all states |
| Very slow rendering | Software rendering on CPU | Expected on HPC; ~5-10s per view is normal |
| Memory error with many states | Figures not closed | Use `savefig()` wrapper that calls `plt.close()` |
| Brain appears rotated/flipped | Coordinate system mismatch | Check if atlas is in MNI152 vs fsaverage space |
| Cortical image has border/padding | matplotlib `imshow` padding | Use `ax.axis("off")` and `bbox_inches="tight"` |
