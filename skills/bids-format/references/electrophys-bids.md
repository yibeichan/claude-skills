# Electrophysiology BIDS: EEG, MEG, iEEG, fNIRS

Detailed guide for organizing electrophysiology data in BIDS format using MNE-BIDS.

## Table of Contents

- [MNE-BIDS Overview](#mne-bids-overview)
- [EEG-BIDS](#eeg-bids)
- [MEG-BIDS](#meg-bids)
- [iEEG-BIDS](#ieeg-bids)
- [fNIRS-BIDS](#fnirs-bids)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

---

## MNE-BIDS Overview

MNE-BIDS is the recommended tool for all electrophysiology BIDS conversions.

```bash
pip install mne-bids
# For fNIRS support:
pip install mne-nirs
```

### Core API

```python
from mne_bids import (
    write_raw_bids,      # Write raw data to BIDS
    read_raw_bids,       # Read BIDS dataset back
    BIDSPath,            # Construct BIDS-compliant paths
    make_dataset_description,  # Create dataset_description.json
    print_dir_tree,      # Print directory structure
    get_entity_vals,     # List subjects/sessions/tasks in dataset
)
```

### BIDSPath

```python
from mne_bids import BIDSPath

bids_path = BIDSPath(
    subject='01',
    session='01',        # Optional
    task='rest',
    acquisition=None,    # Optional: e.g., 'highres'
    run='01',            # Optional
    processing=None,     # Optional: for derivatives
    recording=None,      # Optional: e.g., 'filtered'
    space=None,          # Optional: for derivatives
    description=None,    # Optional: for derivatives
    datatype='eeg',      # 'eeg', 'meg', 'ieeg', 'nirs'
    suffix='eeg',        # Usually matches datatype
    root='/path/to/bids'
)

# Get the full path
print(bids_path.fpath)
# /path/to/bids/sub-01/ses-01/eeg/sub-01_ses-01_task-rest_run-01_eeg.vhdr
```

---

## EEG-BIDS

### Supported Input Formats

| Format | Extension | Reader |
|--------|-----------|--------|
| BrainVision | `.vhdr` | `mne.io.read_raw_brainvision()` |
| European Data Format | `.edf` | `mne.io.read_raw_edf()` |
| BioSemi | `.bdf` | `mne.io.read_raw_bdf()` |
| EEGLAB | `.set` | `mne.io.read_raw_eeglab()` |
| Neuroscan | `.cnt` | `mne.io.read_raw_cnt()` |
| EGI/MFF | `.mff` | `mne.io.read_raw_egi()` |

### Recommended Output Format

**BrainVision** (`.vhdr` + `.vmrk` + `.eeg`) is the recommended output format because:
- Open, well-documented format
- Supported by all major EEG software
- Handles all BIDS requirements

```python
write_raw_bids(raw, bids_path=bids_path, format='BrainVision', overwrite=True)
```

**EDF** is also acceptable:
```python
write_raw_bids(raw, bids_path=bids_path, format='EDF', overwrite=True)
```

### Complete EEG Example

```python
import mne
from mne_bids import write_raw_bids, BIDSPath, make_dataset_description

# 1. Read raw data
raw = mne.io.read_raw_brainvision('original_data/sub01.vhdr', preload=False)

# 2. Fix channel types (important! MNE defaults everything to EEG)
raw.set_channel_types({
    'EOG1': 'eog',
    'EOG2': 'eog',
    'ECG': 'ecg',
    'EMG': 'emg'
})

# 3. Set montage (electrode positions)
montage = mne.channels.make_standard_montage('standard_1020')
raw.set_montage(montage, on_missing='warn')

# 4. Set measurement date if missing
from datetime import datetime, timezone
raw.set_meas_date(datetime(2025, 1, 15, tzinfo=timezone.utc))

# 5. Get events from annotations or stimulus channel
events, event_id = mne.events_from_annotations(raw)

# 6. Write to BIDS
bids_path = BIDSPath(
    subject='01', session='01', task='oddball',
    datatype='eeg', root='bids_dataset'
)

write_raw_bids(
    raw,
    bids_path=bids_path,
    events=events,
    event_id=event_id,
    format='BrainVision',
    overwrite=True
)

# 7. Create dataset description
make_dataset_description(
    path='bids_dataset',
    name='Auditory Oddball EEG Study',
    dataset_type='raw',
    authors=['Author A', 'Author B']
)
```

### EEG-Specific Sidecar Requirements

**Required fields** in `_eeg.json`:
- `TaskName`
- `EEGReference` (e.g., "FCz", "average", "linked mastoids")
- `SamplingFrequency`
- `PowerLineFrequency` (50 or 60 Hz)
- `SoftwareFilters` (if any online filters applied)

**Recommended fields**:
- `EEGPlacementScheme` (e.g., "10-20", "10-10", "custom")
- `Manufacturer`
- `ManufacturersModelName`
- `CapManufacturer`
- `CapManufacturersModelName`

### Electrodes and Coordinate Systems

MNE-BIDS handles electrode files automatically from the montage:

- `_electrodes.tsv` — electrode positions (name, x, y, z)
- `_coordsystem.json` — coordinate system definition

```json
{
    "EEGCoordinateSystem": "CapTrak",
    "EEGCoordinateUnits": "m",
    "EEGCoordinateSystemDescription": "Based on 10-20 standard montage"
}
```

---

## MEG-BIDS

### Supported Formats

| System | Format | Reader |
|--------|--------|--------|
| Elekta/MEGIN | `.fif` | `mne.io.read_raw_fif()` |
| CTF | `.ds` | `mne.io.read_raw_ctf()` |
| BTi/4D | directory | `mne.io.read_raw_bti()` |
| KIT | `.sqd` | `mne.io.read_raw_kit()` |

### MEG Example

```python
import mne
from mne_bids import write_raw_bids, BIDSPath

raw = mne.io.read_raw_fif('sub01_ses01_task-rest_meg.fif', preload=False)

bids_path = BIDSPath(
    subject='01', session='01', task='rest',
    datatype='meg', root='bids_dataset'
)

# MNE-BIDS preserves the native format for MEG
write_raw_bids(raw, bids_path=bids_path, overwrite=True)
```

### MEG-Specific Requirements

- `_coordsystem.json` must specify head coil positions
- Empty-room recordings: use `task-noise` and link via `AssociatedEmptyRoom` in sidecar
- Fine calibration and crosstalk files for Elekta systems

```python
# Writing empty room data
bids_path_er = BIDSPath(
    subject='emptyroom', session='20250115', task='noise',
    datatype='meg', root='bids_dataset'
)
write_raw_bids(raw_er, bids_path=bids_path_er, overwrite=True)
```

---

## iEEG-BIDS

### Special Requirements

iEEG has unique requirements compared to scalp EEG:

1. **Electrode coordinates are mandatory** (not optional like scalp EEG)
2. **Coordinate system must reference a brain space** (MNI, native T1w, etc.)
3. **Channel type must distinguish**: `ecog` (surface) vs. `seeg` (depth)

### iEEG Example

```python
import mne
import numpy as np
from mne_bids import write_raw_bids, BIDSPath

raw = mne.io.read_raw_edf('patient01_ieeg.edf', preload=False)

# Set channel types based on electrode type
ecog_chs = ['G1', 'G2', 'G3', 'G4']  # Grid electrodes
seeg_chs = ['D1', 'D2', 'D3', 'D4']  # Depth electrodes
raw.set_channel_types({ch: 'ecog' for ch in ecog_chs})
raw.set_channel_types({ch: 'seeg' for ch in seeg_chs})

# Set electrode positions (from localization procedure)
# These must be in a recognized coordinate system
ch_pos = {
    'G1': [-0.030, -0.012, 0.045],
    'G2': [-0.027, -0.015, 0.043],
    # ... etc
}
montage = mne.channels.make_dig_montage(ch_pos=ch_pos, coord_frame='mri')
raw.set_montage(montage)

bids_path = BIDSPath(
    subject='01', task='visual', datatype='ieeg',
    root='bids_dataset'
)

write_raw_bids(raw, bids_path=bids_path, overwrite=True)
```

### Coordinate Systems for iEEG

| System | When to use |
|--------|-------------|
| `ACPC` | Aligned to anterior/posterior commissure |
| `ScanRAS` | Scanner-based RAS coordinates |
| `MNI152NLin2009aSym` | Normalized MNI space |
| `individual` | Native T1w space (provide T1w path) |

---

## fNIRS-BIDS

### SNIRF Format

BIDS recommends SNIRF (`.snirf`) as the standard format for fNIRS data.

```python
import mne
from mne_bids import write_raw_bids, BIDSPath

# Read SNIRF (or convert from other formats first)
raw = mne.io.read_raw_snirf('sub01_task-tapping.snirf')

bids_path = BIDSPath(
    subject='01', task='tapping', datatype='nirs',
    root='bids_dataset'
)

write_raw_bids(raw, bids_path=bids_path, overwrite=True)
```

### Converting from Homer3 / NIRx

```python
import mne

# NIRx format
raw = mne.io.read_raw_nirx('path/to/nirx_folder/')

# Then write to BIDS as usual
write_raw_bids(raw, bids_path=bids_path, overwrite=True)
```

### fNIRS-Specific Files

- `_optodes.tsv` — source and detector positions
- `_channels.tsv` — channel definitions with source-detector pairs
- `_coordsystem.json` — optode coordinate system

---

## Common Patterns

### Batch Conversion

```python
from pathlib import Path
import mne
from mne_bids import write_raw_bids, BIDSPath, make_dataset_description

source_dir = Path('raw_eeg_files')
bids_root = Path('bids_dataset')

# Map original filenames to BIDS entities
subjects = {
    'participant_001.vhdr': ('01', '01'),
    'participant_002.vhdr': ('02', '01'),
    # ... (subject, session)
}

for fname, (sub, ses) in subjects.items():
    raw = mne.io.read_raw_brainvision(source_dir / fname, preload=False)

    bids_path = BIDSPath(
        subject=sub, session=ses, task='rest',
        datatype='eeg', root=bids_root
    )

    write_raw_bids(raw, bids_path=bids_path, format='BrainVision', overwrite=True)

make_dataset_description(path=bids_root, name='My EEG Study', dataset_type='raw')
```

### Reading BIDS Data Back

```python
from mne_bids import read_raw_bids, BIDSPath

bids_path = BIDSPath(
    subject='01', session='01', task='rest',
    datatype='eeg', root='bids_dataset'
)

raw = read_raw_bids(bids_path)
# All metadata (channel types, montage, events) are restored from BIDS sidecars
```

### Listing Dataset Contents

```python
from mne_bids import get_entity_vals, print_dir_tree

# List all subjects
subjects = get_entity_vals('bids_dataset', 'subject')
print(f"Subjects: {subjects}")

# List all tasks
tasks = get_entity_vals('bids_dataset', 'task')
print(f"Tasks: {tasks}")

# Print directory tree
print_dir_tree('bids_dataset')
```

---

## Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| "Channel type not recognized" | Set channel types explicitly with `raw.set_channel_types()` |
| Missing montage/electrode positions | Set montage: `raw.set_montage(montage)` |
| Events not written | Pass `events` and `event_id` to `write_raw_bids()` |
| Wrong sampling frequency in sidecar | Check raw.info['sfreq'] before writing |
| Measurement date missing | Set with `raw.set_meas_date()` |
| File format not supported | Convert to a supported format first using MNE |
| Validator warns about missing fields | Edit the generated JSON sidecars to add required fields |

### Validating Electrophysiology BIDS

```bash
# The standard BIDS validator works for all modalities
bids-validator /path/to/bids_dataset

# Common warnings for electrophysiology:
# - Missing PowerLineFrequency → add to _eeg.json
# - Missing EEGReference → add to _eeg.json
# - Coordinate system not recognized → check coordsystem.json
```
