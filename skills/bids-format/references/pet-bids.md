# PET-BIDS

Organizing PET data in BIDS format.

## Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Required Metadata](#required-metadata)
- [Blood Data](#blood-data)
- [Conversion Tools](#conversion-tools)
- [Common Tracers](#common-tracers)

---

## Overview

PET-BIDS was added in BIDS v1.7.0. PET data requires more metadata than other modalities
because reconstruction parameters, tracer information, and timing data are essential for
quantitative analysis.

**Key differences from MRI-BIDS:**
- Many more required JSON sidecar fields
- Blood data (arterial input function) is stored as TSV alongside PET images
- Tracer entity (`trc-`) is part of the filename
- Frame timing must be explicitly specified

## Directory Structure

```
bids_dataset/
├── dataset_description.json
├── participants.tsv
├── sub-01/
│   └── ses-01/
│       ├── anat/
│       │   ├── sub-01_ses-01_T1w.nii.gz
│       │   └── sub-01_ses-01_T1w.json
│       └── pet/
│           ├── sub-01_ses-01_trc-FDG_pet.nii.gz
│           ├── sub-01_ses-01_trc-FDG_pet.json
│           ├── sub-01_ses-01_trc-FDG_recording-autosampler_blood.tsv
│           ├── sub-01_ses-01_trc-FDG_recording-autosampler_blood.json
│           ├── sub-01_ses-01_trc-FDG_recording-manual_blood.tsv
│           └── sub-01_ses-01_trc-FDG_recording-manual_blood.json
```

### Filename Entities for PET

| Entity | Required | Example |
|--------|----------|---------|
| `sub-` | Yes | `sub-01` |
| `ses-` | If multi-session | `ses-baseline` |
| `trc-` | Yes | `trc-FDG`, `trc-raclopride` |
| `rec-` | If multiple reconstructions | `rec-OSEM`, `rec-FBP` |
| `run-` | If multiple runs | `run-01` |

## Required Metadata

PET has extensive required metadata. The JSON sidecar must include:

### Minimal Required Fields

```json
{
    "Manufacturer": "Siemens",
    "ManufacturersModelName": "Biograph mMR",
    "Units": "Bq/mL",
    "TracerName": "Fluorodeoxyglucose",
    "TracerRadionuclide": "F18",
    "InjectedRadioactivity": 370,
    "InjectedRadioactivityUnits": "MBq",
    "InjectedMass": 0.5,
    "InjectedMassUnits": "ug",
    "ModeOfAdministration": "bolus",
    "SpecificRadioactivity": 740,
    "SpecificRadioactivityUnits": "GBq/umol",
    "TimeZero": "10:30:00",
    "ScanStart": 0,
    "InjectionStart": 0,
    "FrameTimesStart": [0, 15, 30, 45, 60, 120, 180, 300, 600, 900, 1200, 1800, 2400, 3000, 3600],
    "FrameDuration": [15, 15, 15, 15, 60, 60, 120, 300, 300, 300, 600, 600, 600, 600, 600],
    "AcquisitionMode": "list mode",
    "ImageDecayCorrected": true,
    "ImageDecayCorrectionTime": 0,
    "ReconMethodName": "3D-OSEM-PSF",
    "ReconMethodParameterLabels": ["subsets", "iterations"],
    "ReconMethodParameterValues": [21, 3],
    "ReconFilterType": "Gaussian",
    "ReconFilterSize": 2,
    "AttenuationCorrection": "MR-based with atlas"
}
```

### Additional Recommended Fields

```json
{
    "BodyPart": "Brain",
    "BodyWeight": 75,
    "BodyWeightUnits": "kg",
    "InstitutionName": "University Hospital",
    "TracerMolecularWeight": 181.26,
    "TracerMolecularWeightUnits": "g/mol",
    "ScatterCorrectionMethod": "single scatter simulation",
    "RandomsCorrectionMethod": "delayed coincidence window",
    "DecayCorrectionFactor": [1.0, 1.001, 1.002]
}
```

## Blood Data

Blood sampling data is stored as TSV files alongside the PET image.

### Autosampler (Continuous) Blood Data

```
# sub-01_ses-01_trc-FDG_recording-autosampler_blood.tsv
time	whole_blood_radioactivity
0	0
5	123.4
10	2456.7
15	5678.9
20	8901.2
30	12345.6
45	15678.9
60	13456.7
90	10234.5
120	8901.2
```

### Manual Blood Samples

```
# sub-01_ses-01_trc-FDG_recording-manual_blood.tsv
time	whole_blood_radioactivity	plasma_radioactivity	metabolite_parent_fraction
300	5678.9	5234.1	0.95
600	4567.8	4123.4	0.88
900	3456.7	3012.3	0.82
1200	2678.9	2345.6	0.75
1800	1890.1	1567.8	0.65
2700	1234.5	1012.3	0.55
3600	890.1	734.5	0.45
```

### Blood Sidecar JSON

```json
{
    "PlasmaAvail": true,
    "WholeBloodAvail": true,
    "MetaboliteAvail": true,
    "MetaboliteMethod": "HPLC",
    "MetaboliteRecoveryCorrectionApplied": true,
    "DispersionCorrected": false,
    "time": {
        "Description": "Time relative to TimeZero",
        "Units": "s"
    },
    "whole_blood_radioactivity": {
        "Description": "Radioactivity concentration in whole blood",
        "Units": "kBq/mL"
    },
    "plasma_radioactivity": {
        "Description": "Radioactivity concentration in plasma",
        "Units": "kBq/mL"
    },
    "metabolite_parent_fraction": {
        "Description": "Fraction of parent compound in plasma",
        "Units": "unitless"
    }
}
```

## Conversion Tools

### pypet2bids

```bash
pip install pypet2bids

# Convert DICOM PET to BIDS
dcm2niix4pet /path/to/pet_dicoms -d /path/to/bids_output \
    --subject 01 --session 01 --tracer FDG
```

### Manual Conversion Steps

1. Convert DICOM to NIfTI with `dcm2niix`
2. Rename following BIDS conventions
3. Create JSON sidecar with all required fields (most won't be in DICOM headers)
4. Format blood data as TSV
5. Validate with `bids-validator`

```python
import json
import subprocess
from pathlib import Path

def convert_pet_to_bids(dicom_dir, bids_root, subject, session, tracer):
    """Convert PET DICOMs to BIDS format."""
    out_dir = Path(bids_root) / f'sub-{subject}' / f'ses-{session}' / 'pet'
    out_dir.mkdir(parents=True, exist_ok=True)

    prefix = f'sub-{subject}_ses-{session}_trc-{tracer}'

    # Step 1: Convert DICOM to NIfTI
    subprocess.run([
        'dcm2niix', '-z', 'y',
        '-f', prefix + '_pet',
        '-o', str(out_dir),
        str(dicom_dir)
    ])

    # Step 2: Edit the JSON sidecar to add PET-specific fields
    json_path = out_dir / f'{prefix}_pet.json'
    with open(json_path) as f:
        sidecar = json.load(f)

    # Add required PET fields (these must come from your study records)
    sidecar.update({
        'Units': 'Bq/mL',
        'TracerName': tracer,
        'TracerRadionuclide': 'F18',  # adjust per tracer
        'InjectedRadioactivity': 370,
        'InjectedRadioactivityUnits': 'MBq',
        # ... add all required fields
    })

    with open(json_path, 'w') as f:
        json.dump(sidecar, f, indent=4)
```

## Common Tracers

| Tracer | `trc-` label | Radionuclide | Common use |
|--------|-------------|-------------|------------|
| [18F]FDG | `FDG` | F18 | Glucose metabolism |
| [11C]Raclopride | `raclopride` | C11 | D2/D3 dopamine receptors |
| [18F]DOPA | `FDOPA` | F18 | Dopamine synthesis |
| [11C]PiB | `PiB` | C11 | Amyloid plaques |
| [18F]Florbetapir | `florbetapir` | F18 | Amyloid plaques |
| [18F]MK6240 | `MK6240` | F18 | Tau tangles |
| [11C]PBR28 | `PBR28` | C11 | TSPO/neuroinflammation |
| [18F]SynVesT-1 | `SynVesT1` | F18 | SV2A/synaptic density |
| [15O]Water | `water` | O15 | Cerebral blood flow |

## Tips

- **Get metadata early**: Many required PET-BIDS fields (injected dose, tracer info, blood data) aren't in DICOM headers. Collect this info at scan time.
- **Frame timing is critical**: `FrameTimesStart` and `FrameDuration` must match the 4th dimension of your NIfTI
- **Validate early**: PET-BIDS has many required fields; validation catches missing ones quickly
- **Blood data format**: Keep blood TSV simple — one measurement per row, time in seconds from `TimeZero`
