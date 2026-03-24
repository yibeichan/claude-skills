# Modality-Specific Conversion Guides

Detailed instructions for converting raw data into BIDS format for each supported modality.

## Table of Contents

- [MRI (Anatomical, Functional, DWI, Fieldmaps, ASL)](#mri)
- [EEG](#eeg)
- [MEG](#meg)
- [iEEG](#ieeg)
- [fNIRS](#fnirs)
- [PET](#pet)
- [Behavioral](#behavioral)
- [Motion Capture](#motion-capture)
- [Microscopy](#microscopy)
- [Physiology](#physiology)

---

## MRI

### Tools

| Tool | Strengths | Install |
|------|-----------|---------|
| **heudiconv** | Flexible heuristic-based, handles complex protocols | `pip install heudiconv` |
| **dcm2bids** | Config-file based, simpler for straightforward datasets | `pip install dcm2bids` |
| **BIDScoin** | GUI-based, good for non-programmers | `pip install bidscoin` |

### heudiconv (Recommended)

See the `dicom2fmriprep` skill for full heudiconv details. The same approach works for all
MRI modalities — just add keys for each datatype in the heuristic:

```python
def infotodict(seqinfo):
    # Anatomical
    t1w = create_key('sub-{subject}/{session}/anat/sub-{subject}_{session}_T1w')
    t2w = create_key('sub-{subject}/{session}/anat/sub-{subject}_{session}_T2w')
    flair = create_key('sub-{subject}/{session}/anat/sub-{subject}_{session}_FLAIR')

    # Functional
    bold_rest = create_key(
        'sub-{subject}/{session}/func/sub-{subject}_{session}_task-rest_bold'
    )
    bold_task = create_key(
        'sub-{subject}/{session}/func/sub-{subject}_{session}_task-TASKNAME_run-{item:02d}_bold'
    )

    # Diffusion
    dwi_ap = create_key(
        'sub-{subject}/{session}/dwi/sub-{subject}_{session}_dir-AP_dwi'
    )
    dwi_pa = create_key(
        'sub-{subject}/{session}/dwi/sub-{subject}_{session}_dir-PA_dwi'
    )

    # Fieldmaps
    fmap_ap = create_key(
        'sub-{subject}/{session}/fmap/sub-{subject}_{session}_dir-AP_epi'
    )
    fmap_pa = create_key(
        'sub-{subject}/{session}/fmap/sub-{subject}_{session}_dir-PA_epi'
    )

    # Perfusion (ASL)
    asl = create_key(
        'sub-{subject}/{session}/perf/sub-{subject}_{session}_asl'
    )
    m0scan = create_key(
        'sub-{subject}/{session}/perf/sub-{subject}_{session}_m0scan'
    )

    info = {
        t1w: [], t2w: [], flair: [],
        bold_rest: [], bold_task: [],
        dwi_ap: [], dwi_pa: [],
        fmap_ap: [], fmap_pa: [],
        asl: [], m0scan: []
    }

    for s in seqinfo:
        if s.is_motion_corrected or s.is_derived:
            continue

        # Match by protocol_name — adapt to your scanner
        pn = s.protocol_name.lower()

        # Anatomical
        if 'mprage' in pn or 't1w' in pn and s.dim3 >= 160:
            info[t1w].append(s.series_id)
        elif 't2w' in pn or 't2_space' in pn:
            info[t2w].append(s.series_id)
        elif 'flair' in pn:
            info[flair].append(s.series_id)

        # Functional
        elif 'rest' in pn and s.dim4 > 50:
            info[bold_rest].append(s.series_id)
        elif 'task' in pn and s.dim4 > 50:
            info[bold_task].append(s.series_id)

        # DWI
        elif ('dti' in pn or 'dwi' in pn or 'diff' in pn):
            if 'ap' in pn:
                info[dwi_ap].append(s.series_id)
            elif 'pa' in pn:
                info[dwi_pa].append(s.series_id)
            else:
                info[dwi_ap].append(s.series_id)  # default

        # Fieldmaps
        elif 'distortion' in pn or 'sefield' in pn or 'topup' in pn:
            if 'ap' in pn:
                info[fmap_ap] = [s.series_id]
            elif 'pa' in pn:
                info[fmap_pa] = [s.series_id]

        # ASL
        elif 'asl' in pn or 'pcasl' in pn:
            info[asl].append(s.series_id)
        elif 'm0' in pn:
            info[m0scan].append(s.series_id)

    return info
```

### dcm2bids

Configuration-file approach — good for simpler protocols:

```json
{
    "descriptions": [
        {
            "datatype": "anat",
            "suffix": "T1w",
            "criteria": {
                "SeriesDescription": "*MPRAGE*",
                "ImageType": ["ORIGINAL", "PRIMARY", "M", "ND"]
            }
        },
        {
            "datatype": "dwi",
            "suffix": "dwi",
            "custom_entities": "dir-AP",
            "criteria": {
                "SeriesDescription": "*DWI*AP*"
            }
        },
        {
            "datatype": "func",
            "suffix": "bold",
            "custom_entities": "task-rest",
            "criteria": {
                "SeriesDescription": "*REST*",
                "ImageType": ["ORIGINAL", "PRIMARY", "M", "MB", "ND"]
            },
            "sidecar_changes": {
                "TaskName": "rest"
            }
        },
        {
            "datatype": "perf",
            "suffix": "asl",
            "criteria": {
                "SeriesDescription": "*pCASL*"
            }
        }
    ]
}
```

```bash
# Run conversion
dcm2bids -d /path/to/dicoms -p 01 -s 01 -c config.json -o /path/to/bids
```

---

## EEG

### MNE-BIDS

```python
import mne
from mne_bids import write_raw_bids, BIDSPath

# Read raw EEG data (supports .edf, .bdf, .vhdr, .set, .fif, etc.)
raw = mne.io.read_raw_edf('sub01_task-rest.edf', preload=False)

# Set channel types if needed
raw.set_channel_types({'EOG1': 'eog', 'EOG2': 'eog', 'ECG': 'ecg'})

# Create BIDS path
bids_path = BIDSPath(
    subject='01',
    session='01',
    task='rest',
    datatype='eeg',
    root='/path/to/bids_dataset'
)

# Write to BIDS (creates directory structure, sidecars, everything)
write_raw_bids(
    raw,
    bids_path=bids_path,
    format='BrainVision',  # Recommended output format for EEG-BIDS
    overwrite=True
)
```

### Adding Events

```python
import numpy as np
import mne
from mne_bids import write_raw_bids, BIDSPath

raw = mne.io.read_raw_brainvision('sub01.vhdr')
events, event_id = mne.events_from_annotations(raw)

# Write with events
write_raw_bids(
    raw,
    bids_path=bids_path,
    events=events,
    event_id=event_id,
    overwrite=True
)
```

### Resulting Structure

```
bids_dataset/
├── sub-01/
│   └── ses-01/
│       └── eeg/
│           ├── sub-01_ses-01_task-rest_eeg.vhdr
│           ├── sub-01_ses-01_task-rest_eeg.vmrk
│           ├── sub-01_ses-01_task-rest_eeg.eeg
│           ├── sub-01_ses-01_task-rest_eeg.json
│           ├── sub-01_ses-01_task-rest_channels.tsv
│           ├── sub-01_ses-01_task-rest_electrodes.tsv
│           ├── sub-01_ses-01_task-rest_coordsystem.json
│           └── sub-01_ses-01_task-rest_events.tsv
```

### EEG Sidecar Fields

Key fields in the `_eeg.json`:

```json
{
    "TaskName": "rest",
    "SamplingFrequency": 1000,
    "PowerLineFrequency": 60,
    "EEGReference": "FCz",
    "SoftwareFilters": {
        "HighpassFilter": {"CutoffFrequency": 0.1}
    },
    "EEGPlacementScheme": "10-20",
    "Manufacturer": "BrainProducts",
    "ManufacturersModelName": "actiCHamp Plus",
    "CapManufacturer": "EasyCap",
    "RecordingType": "continuous"
}
```

---

## MEG

### MNE-BIDS

```python
import mne
from mne_bids import write_raw_bids, BIDSPath

raw = mne.io.read_raw_fif('sub01_task-rest_meg.fif')

bids_path = BIDSPath(
    subject='01', task='rest', datatype='meg',
    root='/path/to/bids_dataset'
)

write_raw_bids(raw, bids_path=bids_path, overwrite=True)
```

### Resulting Structure

```
bids_dataset/
├── sub-01/
│   └── meg/
│       ├── sub-01_task-rest_meg.fif
│       ├── sub-01_task-rest_meg.json
│       ├── sub-01_task-rest_channels.tsv
│       ├── sub-01_task-rest_coordsystem.json
│       └── sub-01_task-rest_events.tsv
```

---

## iEEG

### MNE-BIDS

```python
import mne
from mne_bids import write_raw_bids, BIDSPath

raw = mne.io.read_raw_edf('sub01_task-visual_ieeg.edf')
raw.set_channel_types({ch: 'ecog' for ch in raw.ch_names})  # or 'seeg'

bids_path = BIDSPath(
    subject='01', task='visual', datatype='ieeg',
    root='/path/to/bids_dataset'
)

write_raw_bids(raw, bids_path=bids_path, overwrite=True)
```

### Electrode Coordinates

iEEG requires electrode coordinate files:

```
sub-01/ieeg/
├── sub-01_task-visual_ieeg.edf
├── sub-01_task-visual_ieeg.json
├── sub-01_space-MNI152NLin2009aSym_electrodes.tsv
├── sub-01_space-MNI152NLin2009aSym_coordsystem.json
└── sub-01_task-visual_channels.tsv
```

**electrodes.tsv**:

```
name	x	y	z	size	material
LA1	-30.5	-12.3	-15.2	2.0	platinum
LA2	-27.1	-14.8	-14.6	2.0	platinum
```

---

## fNIRS

### MNE-BIDS (via MNE-NIRS)

```python
import mne
from mne_bids import write_raw_bids, BIDSPath

# Read SNIRF file (preferred format for fNIRS-BIDS)
raw = mne.io.read_raw_snirf('sub01_task-tapping.snirf')

bids_path = BIDSPath(
    subject='01', task='tapping', datatype='nirs',
    root='/path/to/bids_dataset'
)

write_raw_bids(raw, bids_path=bids_path, overwrite=True)
```

### Resulting Structure

```
bids_dataset/
├── sub-01/
│   └── nirs/
│       ├── sub-01_task-tapping_nirs.snirf
│       ├── sub-01_task-tapping_nirs.json
│       ├── sub-01_task-tapping_channels.tsv
│       ├── sub-01_task-tapping_optodes.tsv
│       ├── sub-01_task-tapping_coordsystem.json
│       └── sub-01_task-tapping_events.tsv
```

---

## PET

### Manual Conversion

PET-BIDS requires specific metadata not available from DICOM alone. Work with your PET physicist.

```
sub-01/
└── pet/
    ├── sub-01_trc-FDG_pet.nii.gz
    ├── sub-01_trc-FDG_pet.json
    ├── sub-01_trc-FDG_recording-autosampler_blood.tsv
    └── sub-01_trc-FDG_recording-autosampler_blood.json
```

### Required PET JSON Fields

```json
{
    "Manufacturer": "Siemens",
    "ManufacturersModelName": "Biograph mMR",
    "TracerName": "Fluorodeoxyglucose",
    "TracerRadionuclide": "F18",
    "InjectedRadioactivity": 370,
    "InjectedRadioactivityUnits": "MBq",
    "InjectedMass": 0.5,
    "InjectedMassUnits": "ug",
    "ModeOfAdministration": "bolus",
    "FrameTimesStart": [0, 60, 120, 180],
    "FrameDuration": [60, 60, 60, 60],
    "Units": "Bq/mL",
    "AttenuationCorrection": "MR-based",
    "ReconMethodName": "OSEM",
    "ReconMethodParameterLabels": ["subsets", "iterations"],
    "ReconMethodParameterValues": [21, 3]
}
```

### Blood Data

```
# sub-01_trc-FDG_recording-autosampler_blood.tsv
time	whole_blood_radioactivity	plasma_radioactivity
0	0	0
30	5234.1	4987.2
60	12456.3	11234.5
```

---

## Behavioral

### Standalone Behavioral (No Imaging)

For tasks collected outside the scanner:

```python
import pandas as pd
import json
from pathlib import Path

# Your behavioral data
data = pd.DataFrame({
    'onset': [0.0, 2.5, 5.0, 7.5],
    'duration': [0.5, 0.5, 0.5, 0.5],
    'trial_type': ['congruent', 'incongruent', 'congruent', 'incongruent'],
    'response_time': [0.432, 0.567, 0.389, 0.612],
    'accuracy': [1, 1, 1, 0],
    'stimulus': ['red_red', 'red_blue', 'blue_blue', 'blue_red']
})

# Write events file
out_dir = Path('bids_dataset/sub-01/beh')
out_dir.mkdir(parents=True, exist_ok=True)

data.to_csv(out_dir / 'sub-01_task-stroop_events.tsv', sep='\t', index=False)

# Write sidecar JSON
sidecar = {
    "TaskName": "stroop",
    "TaskDescription": "Color-word Stroop task with manual response",
    "trial_type": {
        "LongName": "Trial type",
        "Description": "Congruency condition",
        "Levels": {
            "congruent": "Word and ink color match",
            "incongruent": "Word and ink color differ"
        }
    },
    "response_time": {
        "LongName": "Response time",
        "Description": "Time from stimulus onset to button press",
        "Units": "s"
    },
    "accuracy": {
        "LongName": "Response accuracy",
        "Levels": {
            "0": "Incorrect or no response",
            "1": "Correct response"
        }
    }
}

with open(out_dir / 'sub-01_task-stroop_events.json', 'w') as f:
    json.dump(sidecar, f, indent=4)
```

### Continuous Behavioral Recordings

For continuous data (eye-tracking, physiological measures during behavior):

```
sub-01/beh/
├── sub-01_task-reading_beh.tsv.gz       # Continuous recording
├── sub-01_task-reading_beh.json
├── sub-01_task-reading_events.tsv       # Discrete events
└── sub-01_task-reading_events.json
```

---

## Motion Capture

```
sub-01/
└── motion/
    ├── sub-01_task-walking_tracksys-IMU_motion.tsv.gz
    ├── sub-01_task-walking_tracksys-IMU_motion.json
    └── sub-01_task-walking_tracksys-IMU_channels.tsv
```

### motion.json

```json
{
    "TaskName": "walking",
    "SamplingFrequency": 100,
    "TrackingSystemName": "Xsens MVN",
    "RecordingDuration": 300,
    "RotationOrder": "ZXY",
    "RotationRule": "left-hand"
}
```

---

## Physiology (During Imaging)

Physiological recordings during MRI (cardiac, respiratory):

```
sub-01/ses-01/func/
├── sub-01_ses-01_task-rest_bold.nii.gz
├── sub-01_ses-01_task-rest_recording-cardiac_physio.tsv.gz
├── sub-01_ses-01_task-rest_recording-cardiac_physio.json
├── sub-01_ses-01_task-rest_recording-respiratory_physio.tsv.gz
└── sub-01_ses-01_task-rest_recording-respiratory_physio.json
```

### physio.json

```json
{
    "SamplingFrequency": 400,
    "StartTime": -2.5,
    "Columns": ["cardiac", "trigger"],
    "cardiac": {
        "Description": "Cardiac pulse signal from pulse oximeter",
        "Units": "mV"
    }
}
```
