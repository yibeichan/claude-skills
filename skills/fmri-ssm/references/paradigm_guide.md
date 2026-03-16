# Paradigm-Specific Guidance for SSMs in fMRI

## Table of Contents
1. [Resting State](#resting-state)
2. [Task-Based: General Principles](#task-general)
3. [Task-Based: MID (Monetary Incentive Delay)](#mid)
4. [Task-Based: SST (Stop-Signal Task)](#sst)
5. [Task-Based: N-back (Working Memory)](#nback)
6. [Task-Based: Other Common Tasks](#other-tasks)
7. [Naturalistic: Movie/TV Watching](#movie)
8. [Naturalistic: Video Gaming](#gaming)
9. [Cross-Paradigm Considerations](#cross-paradigm)

---

## 1. Resting State {#resting-state}

### What SSMs reveal
Resting-state SSMs identify recurring patterns of brain activity (states) and their temporal
dynamics (transitions, dwell times, sequencing). The dominant finding across the literature is
that resting-state BOLD data visits a small number of recurring functional connectivity patterns,
with dwell times on the order of seconds to tens of seconds.

### Recommended models
**First choice: Gaussian HMM** — The workhorse of resting-state SSM analysis. States are
defined by mean activation and/or functional connectivity patterns.

**When dynamics matter: HMM-MAR** — If you care about how temporal dynamics (spectral content,
directed connectivity) differ between states, not just spatial patterns.

**When K is uncertain: Sticky HDP-HMM** — Learns the number of states from data.

**For continuous dynamics: SLDS** — When you want smooth latent trajectories rather than
discrete state assignments.

### Key considerations

**Number of states:** Most resting-state HMM studies use K=4-12. The "right" K depends on
data quality, scan length, and the granularity of states you care about. Low K (3-5) gives
broad network states (e.g., visual, default mode, frontoparietal). Higher K (8-12) gives
finer sub-states within networks. Above K=12, states often become unstable or very brief.

**Scan length matters:** For a K-state HMM with full covariance on p ROIs, you need roughly
K × p × (p+1)/2 data points for stable covariance estimation. A 10-minute scan at TR=0.8s
gives ~750 TRs. With 100 ROIs and K=6, that's tight. Solutions: use diagonal covariance,
reduce dimensionality (ICA to 15-25 components), or pool across runs/sessions.

**Stationarity within runs:** Most resting-state HMMs assume the transition matrix is
stationary within a run. If you expect non-stationary dynamics (e.g., drowsiness increasing
over the scan), consider time-varying transition probabilities or splitting long runs.

**Eyes-open vs. eyes-closed:** This affects state definitions substantially. Document and
control for it. If mixing, include it as a covariate or analyze separately.

**Drowsiness/arousal:** Participants often become drowsy during long resting scans. This
creates drift in brain state dynamics that is not intrinsic resting-state dynamics. Consider
monitoring arousal (eye tracking, EEG alpha power if available) or using concurrent
physiological recordings. Drowsiness-related states can dominate the HMM if not accounted for.

### Typical pipeline
1. Preprocess with fMRIPrep + XCP-D (see `preprocessing.md`)
2. Parcellate (Schaefer 100-400) or ICA (15-50 components)
3. Z-score each region/component within each run
4. Concatenate runs (respecting run boundaries — reset forward algorithm)
5. Fit Gaussian HMM with K=4-12, full or diagonal covariance
6. Run 50+ random restarts with K-means initialization
7. Model selection via BIC or cross-validated log-likelihood
8. Validate: check state spatial maps, dwell time distributions, test-retest reliability

---

## 2. Task-Based: General Principles {#task-general}

### What SSMs add beyond GLM
Standard GLM analysis asks: "Which regions activate during condition X?" SSMs ask: "What
latent states does the brain traverse during this task, and how do task events influence
state dynamics?" SSMs can reveal: states that don't correspond 1:1 to task conditions
(e.g., preparation, error monitoring, mind-wandering during task), individual differences
in state transition dynamics, and how brain states predict behavior on a trial-by-trial basis.

### Unique considerations for task data

**HRF alignment is critical.** Task events happen at known times. If your SSM should recover
these events, you must account for the HRF delay. See `hrf_modeling.md` for approaches.

**Task structure provides validation.** Unlike resting state, you can check whether inferred
states align with known task conditions. If your 3-state HMM on an N-back task doesn't show
states that correlate with 0-back vs. 2-back blocks, something may be wrong.

**Event-related vs. block design:**
- Block designs: long, sustained states (~15-30s). HRF has time to reach steady state within
  blocks. SSMs are straightforward — states should roughly correspond to blocks.
- Event-related designs: brief events (~1-5s) with variable ISI. Much more challenging for
  SSMs because HRF smears rapid transitions. Deconvolution or HRF-aware modeling is often needed.

**Covariates to consider:**
- Task timing (onsets, durations) — enter into transition model or use for initialization
- Behavioral measures (RT, accuracy) — can be modeled as emissions or used for validation
- Condition type — for IO-HMM, enter as input to transition model
- Block number or run number — for fatigue/learning effects

### Model choice for task data
- **Gaussian HMM**: States = different activation patterns for different task conditions
- **IO-HMM**: Task events drive state transitions (most principled for task data)
- **SLDS with inputs**: Task events influence continuous latent dynamics
- **HMM-MAR**: If you care about how directed connectivity changes with task conditions

---

## 3. MID — Monetary Incentive Delay Task {#mid}

### Task structure
- Cue phase (~2s): signals upcoming reward/loss/neutral trial
- Anticipation phase (variable delay, ~2-4s): waiting for target
- Target phase (~0.5s): button press required
- Feedback phase (~1.5s): outcome displayed
- ITI: variable (~2-8s)

### SSM considerations

**Expected states:** A well-fitting SSM might recover:
- Baseline/rest state (ITI)
- Reward anticipation state (after reward cue, during delay)
- Loss anticipation state (after loss cue)
- Motor preparation/execution state (around target)
- Reward feedback state
- Loss feedback state

**HRF challenge:** MID has rapid phase transitions (cue → anticipation → target → feedback)
within a single trial (~6-10s total). The HRF from the cue is still evolving when feedback
occurs. This overlap makes it very difficult to resolve individual phases with SSMs on BOLD.

**Recommended approaches:**
1. **Phase-level analysis:** Model each trial phase as a separate condition. Use IO-HMM with
   phase onsets (HRF-convolved) as inputs to the transition model.
2. **Condition-level analysis (simpler):** Collapse across trial phases, model reward vs. loss
   vs. neutral as states. Better SNR but loses within-trial dynamics.
3. **Deconvolve first:** If within-trial dynamics are the focus, deconvolve BOLD using known
   trial timing, then fit SSM on deconvolved signal.

**Key covariates:**
- Cue type (reward magnitude: $0, $1, $5 / loss magnitude)
- Anticipation duration (variable delay)
- Behavioral performance (hit/miss)
- Reward prediction error (outcome - expected)

**Regions of interest:** Nucleus accumbens, ventral striatum, vmPFC, anterior insula, VTA.
For parcellated analyses, ensure subcortical regions are included (Schaefer + subcortical,
or Glasser parcellation with subcortex).

---

## 4. SST — Stop-Signal Task {#sst}

### Task structure
- Go trials (~75%): arrow appears, press button matching direction
- Stop trials (~25%): arrow appears, followed by stop signal (auditory/visual) after
  variable stop-signal delay (SSD)
- Successful stop: inhibited response
- Failed stop: button press despite stop signal

### SSM considerations

**Expected states:**
- Baseline/fixation state
- Go processing state (stimulus encoding → response preparation → execution)
- Stop processing state (stop signal detection → response inhibition)
- Error monitoring state (after failed stops)

**Critical issue — SSRT and state timing:** The stop-signal reaction time (SSRT, typically
~200-250ms) is much faster than fMRI resolution. You cannot resolve the go-vs-stop
"race" at the BOLD level. SSMs on SST fMRI data will capture sustained states
(blocks of mostly-go vs. blocks with more stops) rather than trial-level go/stop dynamics.

**Recommended approaches:**
1. **Block-level analysis:** If using a blocked SST design, SSMs can capture different
   states for go-blocks vs. stop-blocks.
2. **Trial-type modeling:** Use IO-HMM where trial type (go, successful stop, failed stop)
   enters as input. States reflect different cognitive modes across trial types.
3. **Post-error dynamics:** Model how the brain state after failed stops differs from
   successful stops — error monitoring and strategic adjustment.

**Key covariates:**
- Trial type (go, successful stop, failed stop)
- SSD (stop-signal delay — varies adaptively)
- RT on go trials (proxy for response caution)
- Previous trial type (post-error slowing context)

**Regions of interest:** Right inferior frontal gyrus, pre-SMA, STN (subthalamic nucleus),
caudate, anterior insula.

---

## 5. N-back — Working Memory Task {#nback}

### Task structure
- Variants: 0-back (control), 1-back, 2-back, sometimes 3-back
- Stimuli: letters, faces, shapes, or other items presented sequentially
- Blocks of same n-back level (~20-30s) alternating, or mixed designs
- Button press for targets (matches) and non-targets

### SSM considerations

**Expected states:**
- Load-dependent states: distinct states for 0-back (vigilance/perceptual matching),
  1-back (simple maintenance), 2-back (active maintenance + updating)
- Within-block states: encoding, maintenance, comparison, response
- Off-task states: mind-wandering, especially during easier conditions

**Advantages for SSMs:** N-back has clear load-dependent effects widely studied with GLM.
SSMs can reveal: how quickly subjects transition into the task state after block onset,
whether subjects maintain the task state throughout the block, and individual differences
in state stability (linked to working memory capacity).

**Recommended approaches:**
1. **Block-level HMM:** Fit Gaussian HMM expecting states to correspond to n-back levels.
   HRF-informed initialization using block onsets + ~5s delay.
2. **IO-HMM with load as input:** Load level enters the transition model. The model
   learns how load affects the probability of being in each state.
3. **Continuous performance monitoring:** Fit HMM and examine when subjects "fall out" of
   the task state — correlate with behavioral accuracy.

**Key covariates:**
- N-back level (0, 1, 2)
- Stimulus type (target vs. non-target)
- Accuracy (correct, error, miss)
- RT
- Block position (first block vs. later blocks — fatigue effects)

**Regions of interest:** DLPFC, posterior parietal cortex (IPS), ACC/pre-SMA, basal ganglia.

---

## 6. Other Common Tasks {#other-tasks}

### Flanker / Stroop / Go-NoGo
Similar considerations to SST. Key SSM interest: how conflict monitoring states emerge
and how post-conflict adjustment unfolds over time. Use IO-HMM with congruency as input.

### Gambling / Decision-Making Tasks
State inference can capture deliberation vs. impulsive choice states, risk assessment states,
and outcome processing states. Key covariate: expected value, risk level, choice RT.

### Social Cognition (Theory of Mind, Empathy)
Tasks often use narratives or videos. Consider naturalistic approaches (Section 7-8)
if stimuli are extended. For brief vignettes, standard task approaches apply.

### Motor Tasks (Finger Tapping, Sequence Learning)
Clean paradigm for SSM validation — motor states have well-characterized neural correlates.
Good test case for new SSM methods. HRF is relatively fast in motor cortex.

---

## 7. Naturalistic: Movie/TV Watching {#movie}

### What makes naturalistic paradigms special for SSMs

1. **Continuous, rich stimulation** — No discrete trials or blocks. Brain states emerge from
   ongoing stimulus processing. SSMs are particularly well-suited because they naturally model
   continuous state evolution.

2. **Shared stimulus across subjects** — All subjects see the same movie. This enables
   inter-subject state alignment: if subjects enter similar states at similar times, the
   states are likely stimulus-driven rather than idiosyncratic.

3. **Ecological validity** — Brain dynamics during movie watching may better reflect
   real-world cognition than artificial tasks.

4. **Long runs** — Movies/shows typically last 10+ minutes, providing more data per run
   than many task designs. This helps estimation, especially for complex models.

### Recommended models

**Gaussian HMM** — Standard first pass. States capture spatial patterns of activation/FC
during different types of content (dialogue, action, emotional scenes).

**HMM-MAR** — Captures changes in temporal dynamics. Useful for distinguishing states with
similar spatial patterns but different spectral content (e.g., sustained attention during
slow dialogue vs. rapid processing during action sequences).

**Hierarchical HMM** — Natural fit for movie paradigms where dynamics operate at multiple
timescales: fast states (seconds, within-scene dynamics) nested within slow states
(minutes, narrative segments).

**IO-HMM with stimulus features** — Use extracted movie features (optical flow, audio energy,
face presence, semantic content) as inputs to model stimulus-driven state transitions.

### Stimulus annotation

For IO-HMM or supervised validation, annotate the stimulus:

| Feature | How to extract | Temporal resolution |
|---------|---------------|-------------------|
| Scene cuts | Shot boundary detection (e.g., PySceneDetect) | Event-level |
| Optical flow | OpenCV/DeepFlow | Frame-level → TR-average |
| Audio energy (RMS) | librosa | Frame-level → TR-average |
| Speech presence | Voice activity detection | Frame-level → TR-average |
| Facial presence | Face detection (MTCNN, RetinaFace) | Frame-level → TR-average |
| Emotional valence | Manual annotation or sentiment models | Scene-level |
| Semantic content | Manual annotation, word embeddings | Varies |

Downsample all features to TR resolution before entering as SSM covariates.

### Key considerations

**Inter-subject consistency:** A hallmark analysis for movie-watching SSMs is inter-subject
state synchrony. If many subjects are in the same state at the same time, those states are
stimulus-driven. Low synchrony may indicate idiosyncratic processing or mind-wandering.

```python
def state_synchrony(all_subjects_states, n_states):
    """Compute inter-subject state synchrony at each time point.
    
    Parameters
    ----------
    all_subjects_states : array, shape (n_subjects, T)
        State assignments per subject
    n_states : int
    
    Returns
    -------
    synchrony : array, shape (T,)
        Proportion of subjects in the modal state at each time point
    """
    T = all_subjects_states.shape[1]
    synchrony = np.zeros(T)
    for t in range(T):
        state_counts = np.bincount(all_subjects_states[:, t], minlength=n_states)
        synchrony[t] = state_counts.max() / all_subjects_states.shape[0]
    return synchrony
```

**HRF for naturalistic:** Generally fit on BOLD directly (Approach 1). Naturalistic stimuli
are continuous, so there is no clear event onset to deconvolve against. States at the BOLD
timescale (5-30 seconds) are the natural unit of analysis and correspond to cognitively
meaningful epochs (scene segments, emotional beats).

**Specific movies/shows with existing benchmarks:**
- Forrest Gump (studyforrest.org): extensive annotations, multi-modal neuroimaging
- The Grand Budapest Hotel: used in multiple HMM studies
- Sherlock (Chen et al., 2017): recall paradigm with event segmentation data
- Friends (sitcom): used in Courtois NeuroMod and other datasets
- Raiders of the Lost Ark: classic for ISC analyses

---

## 8. Naturalistic: Video Gaming {#gaming}

### Unique aspects of gaming for SSMs

1. **Active participation** — Unlike movies, the subject is making decisions and acting.
   Brain states are not purely stimulus-driven but reflect the subject's strategy, attention,
   and motor planning.

2. **Dynamic environments** — Game state changes based on player actions, creating a
   closed-loop system. The SSM ideally models the brain-game feedback loop.

3. **High temporal variability** — Action games have rapid state transitions. Strategy
   games may have sustained deliberation states. The temporal structure depends on genre.

4. **Rich behavioral data** — Button presses, game state, performance metrics are available
   at high temporal resolution, providing excellent covariates and validation targets.

### Recommended approaches

**IO-HMM with game-state features:** Use game telemetry (player position, health, enemies
visible, score changes, difficulty) as inputs to the transition model.

**Behavioral prediction from states:** Fit HMM on brain data, then predict upcoming
button presses or game performance from inferred states. If brain states predict behavior
above chance, they're capturing something meaningful.

**State-action mapping:** For each brain state, characterize the distribution of player
actions. This reveals the cognitive strategies associated with each state.

### Challenges

- **Motion artifacts:** Active gaming involves more head motion than passive viewing.
  Aggressive motion correction is essential. See `preprocessing.md`.
- **Non-stationarity:** Player behavior changes as they learn the game. Consider
  time-varying models or segmenting by game phase (early, mid, late).
- **Controller artifacts:** Button presses and controller movements can cause small head
  movements. Include button-press regressors in confound regression.
- **Variable trial structure:** Unlike traditional tasks, gaming has no fixed trial structure.
  This is both a feature (ecological validity) and a challenge (no ground truth for validation).

---

## 9. Cross-Paradigm Considerations {#cross-paradigm}

### Comparing states across paradigms
If the same subjects do both resting-state and task fMRI, you can ask: do resting-state
brain states recur during task performance? Approach: fit a group HMM on resting data, then
apply it to task data (forward algorithm only, no re-estimation) to see how task-evoked
dynamics map onto the resting-state repertoire.

### Mixed designs (task + rest blocks)
Some designs alternate task blocks with rest blocks (e.g., N-back with interleaved rest).
SSMs naturally capture both the task states and the rest states. This is a powerful design
for validation: the SSM should recover task/rest alternation.

### Transfer learning across paradigms
If you have limited task data but abundant resting data, consider: fit a rich model on
resting data (learning the state repertoire), then apply to task data with task-specific
transition probabilities. This leverages the resting data to define states while allowing
task data to define how states are traversed.
