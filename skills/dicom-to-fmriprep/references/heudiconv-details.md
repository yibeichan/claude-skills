# heudiconv Detailed Reference

## Table of Contents
- [SeqInfo Fields](#seqinfo-fields)
- [Advanced Heuristic Patterns](#advanced-heuristic-patterns)
- [IntendedFor Population](#intendedfor-population)
- [Optional Heuristic Functions](#optional-heuristic-functions)
- [CLI Reference](#cli-reference)
- [Troubleshooting](#troubleshooting)

## SeqInfo Fields

Every `s` object in `seqinfo` has these 28 fields:

| Field | Type | Description |
|-------|------|-------------|
| `total_files_till_now` | int | Cumulative file count |
| `example_dcm_file` | str | Path to example DICOM |
| `series_id` | str | Unique series identifier |
| `dcm_dir_name` | str | DICOM directory name |
| `series_files` | int | Number of files in series |
| `unspecified` | - | Reserved |
| `dim1` | int | First dimension (x) |
| `dim2` | int | Second dimension (y) |
| `dim3` | int | Third dimension (slices) |
| `dim4` | int | Fourth dimension (volumes/timepoints) |
| `TR` | float | Repetition time (seconds) |
| `TE` | float | Echo time (ms) |
| `protocol_name` | str | Scanner protocol name |
| `is_motion_corrected` | bool | MoCo series flag |
| `is_derived` | bool | Derived/secondary series |
| `patient_id` | str | Patient identifier |
| `study_description` | str | Study description |
| `referring_physician_name` | str | Referring physician |
| `series_description` | str | Series description |
| `sequence_name` | str | Pulse sequence name |
| `image_type` | tuple | DICOM ImageType |
| `accession_number` | str | Accession number |
| `patient_age` | str | Patient age |
| `patient_sex` | str | Patient sex |
| `date` | str | Acquisition date |
| `series_uid` | str | Series instance UID |
| `time` | str | Acquisition time |
| `custom` | dict | Custom fields from `custom_seqinfo` |

## Advanced Heuristic Patterns

### Multi-Echo fMRI

```python
func_me_echo1 = create_key(
    'sub-{subject}/{session}/func/sub-{subject}_{session}_task-rest_echo-1_bold'
)
func_me_echo2 = create_key(
    'sub-{subject}/{session}/func/sub-{subject}_{session}_task-rest_echo-2_bold'
)
func_me_echo3 = create_key(
    'sub-{subject}/{session}/func/sub-{subject}_{session}_task-rest_echo-3_bold'
)

for s in seqinfo:
    if 'multiecho' in s.protocol_name.lower() and not s.is_motion_corrected:
        if abs(s.TE - 12.0) < 1:
            info[func_me_echo1].append(s.series_id)
        elif abs(s.TE - 28.0) < 1:
            info[func_me_echo2].append(s.series_id)
        elif abs(s.TE - 44.0) < 1:
            info[func_me_echo3].append(s.series_id)
```

### Magnitude and Phase Fieldmaps

```python
fmap_mag1 = create_key('sub-{subject}/{session}/fmap/sub-{subject}_{session}_magnitude1')
fmap_mag2 = create_key('sub-{subject}/{session}/fmap/sub-{subject}_{session}_magnitude2')
fmap_phase = create_key('sub-{subject}/{session}/fmap/sub-{subject}_{session}_phasediff')

for s in seqinfo:
    if 'field_map' in s.protocol_name.lower():
        if s.TE < 10 and 'M' in s.image_type:
            info[fmap_mag1] = [s.series_id]
        elif s.TE > 10 and 'M' in s.image_type:
            info[fmap_mag2] = [s.series_id]
        elif 'P' in s.image_type:
            info[fmap_phase] = [s.series_id]
```

### Spin-Echo Fieldmaps (pepolar)

```python
fmap_se_ap = create_key('sub-{subject}/{session}/fmap/sub-{subject}_{session}_dir-AP_epi')
fmap_se_pa = create_key('sub-{subject}/{session}/fmap/sub-{subject}_{session}_dir-PA_epi')

for s in seqinfo:
    if 'spinecho' in s.protocol_name.lower() or 'sefield' in s.protocol_name.lower():
        if 'AP' in s.protocol_name or 'j-' in s.protocol_name:
            info[fmap_se_ap] = [s.series_id]
        elif 'PA' in s.protocol_name or 'j' in s.protocol_name:
            info[fmap_se_pa] = [s.series_id]
```

### T2w Anatomical

```python
t2w = create_key('sub-{subject}/{session}/anat/sub-{subject}_{session}_T2w')

for s in seqinfo:
    if 't2' in s.protocol_name.lower() and 'spc' in s.sequence_name.lower():
        info[t2w].append(s.series_id)
```

### Single-Session Studies

Omit `{session}` from all templates:

```python
t1w = create_key('sub-{subject}/anat/sub-{subject}_T1w')
func = create_key('sub-{subject}/func/sub-{subject}_task-rest_run-{item:02d}_bold')
```

## IntendedFor Population

Use `POPULATE_INTENDED_FOR_OPTS` in your heuristic to automatically link fieldmaps to their target scans:

```python
POPULATE_INTENDED_FOR_OPTS = {
    'matching_parameters': ['ImagingVolume', 'Shims'],
    'criterion': 'Closest'
}
```

Or run after conversion:
```bash
heudiconv --command populate-intended-for --files /path/to/bids_dataset
```

**`matching_parameters`** options: `'ImagingVolume'`, `'Shims'`, `'Force'`
**`criterion`** options: `'Closest'` (nearest in time), `'First'`

## Optional Heuristic Functions

### `filter_dicom(dcm_data)`
Return `True` to **exclude** a DICOM from consideration:
```python
def filter_dicom(dcm_data):
    """Exclude localizers and scouts."""
    if 'localizer' in dcm_data.SeriesDescription.lower():
        return True
    return False
```

### `filter_files(fl)`
Return `True` to **keep** a file path:
```python
def filter_files(fl):
    """Only process .dcm files."""
    return fl.endswith('.dcm')
```

### `infotoids(seqinfos, outdir)`
Override automatic subject/session/locator extraction:
```python
def infotoids(seqinfos, outdir):
    return {
        'locator': 'my_study',
        'session': None,
        'subject': None  # uses default extraction
    }
```

### `custom_seqinfo(wrapper, series_files)`
Add custom fields accessible via `s.custom`:
```python
def custom_seqinfo(wrapper, series_files):
    from heudiconv.dicoms import parse_private_csa_header
    csa = parse_private_csa_header(wrapper, 'series')
    return {'slice_timing': csa.get('MosaicRefAcqTimes', '')}
```

## CLI Reference

### Key Flags

| Flag | Description |
|------|-------------|
| `--files` | DICOM files/directories/tarballs |
| `-d, --dicom_dir_template` | Path template with `{subject}`, `{session}` |
| `-o, --outdir` | Output directory |
| `-f, --heuristic` | Heuristic name or path to .py file |
| `-s, --subjects` | Subject ID(s) |
| `-ss, --ses` | Session label |
| `-c, --converter` | `dcm2niix` or `none` |
| `-b, --bids` | Enable BIDS output |
| `--minmeta` | Exclude dcmstack metadata from sidecars |
| `--overwrite` | Overwrite existing files |
| `-g, --grouping` | `studyUID` (default), `accession_number`, `all`, `custom` |
| `--dcmconfig` | JSON config for dcm2niix options |
| `-q, --queue` | `SLURM` for batch submission |

### Batch Processing

```bash
# Multiple subjects
heudiconv --files /path/to/dicoms/{subject}/*/*/*.dcm \
    -o /path/to/bids -f heuristic.py \
    -s sub01 sub02 sub03 \
    -c dcm2niix -b --minmeta

# Using dicom_dir_template for organized DICOMs
heudiconv -d '/data/dicoms/{subject}/{session}/*/*.dcm' \
    -o /path/to/bids -f heuristic.py \
    -s sub01 -ss ses01 ses02 \
    -c dcm2niix -b --minmeta
```

## Troubleshooting

### "No DICOMs found" or empty dicominfo.tsv
- Check the `--files` glob pattern matches actual DICOM paths
- Try a broader glob: `--files /path/to/dicoms/`
- Verify DICOMs aren't compressed (decompress first)

### Duplicate series in output
- Siemens MoCo series: filter with `not s.is_motion_corrected`
- Derived reconstructions: filter with `not s.is_derived`
- Check `image_type` for `'ORIGINAL'` vs `'DERIVED'`

### Session mixing errors
- Don't combine multiple sessions in one DICOM folder
- Use `-g accession_number` if studyUID grouping fails

### Large JSON sidecars
- Always use `--minmeta` to prevent dcmstack metadata bloat

### "Template must be a valid format string"
- Check that all `create_key()` calls have non-empty template strings
- Ensure no `None` templates

### ReproIn Convention
If DICOMs were named following ReproIn at scan time, use the built-in ReproIn heuristic:
```bash
heudiconv --files /path/to/dicoms/ -o /path/to/bids -f reproin -c dcm2niix -b --minmeta
```
