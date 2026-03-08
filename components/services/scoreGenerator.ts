import { Midi } from '@tonejs/midi';
import { ConversionOptions, RawNote, TrackAnalysisData, ChordEvent, AnalysisSection, HybridVoiceRole } from '../../types';
import { analyzeTrack, analyzeTrackSelection, generateAnalysisReport, analyzePreparedNotes } from './midiAnalysis';
import { getFormattedTime, detectChordsAttack, detectChordsSustain } from './midiHarmony';
import { detectChordsArpeggio } from './midiArpeggio';
import { detectChordsHIA } from './analysis/harmonicImplication';
import { generateHIAAuditLog } from './analysis/hiaAuditLog';
import { getStrictPitchName, getIntervalLabel, getRhythmAbbreviation, SPELLING_PREAMBLE, RHYTHM_KEY, getPitchName } from './midiSpelling';
import { getQuantizationTickValue } from './midiTransform';
import { getVoiceLabel } from './midiVoices';

interface VoiceState {
    prevMidi: number | null; 
    isResting: boolean;
}

interface ScoreRow {
    tick: number;
    formattedTime: string;
    isMeasureStart?: boolean;
    measureNumber?: number;
    activeVoicesInMeasure?: number[];
    voices: {
        [voiceIndex: number]: {
            cellContent: string;
            status: 'ATTACK' | 'HOLD' | 'REST_START' | 'REST_CONT' | 'TACET';
        }
    };
    // Dissonance Columns
    bassDissonance?: string;
    upperDissonance?: string;
}

interface DissonanceStep {
    tick: number;
    time: string;
    intervalLabel: string;
    pairLabel: string; // e.g. "(C4, D4)"
    type: 'onset' | 'shift' | 'resolve' | 'release';
}

interface DissonanceChain {
    key: string;
    voices: string;
    steps: DissonanceStep[];
    resolved: boolean;
}

const getName = (idx: number, names: Record<number, string>, midi: Midi, selectedTrackIds: number[], mode: string) => {
    // 1. Check for manual override
    if (names[idx]) return names[idx];
    
    // 2. If Manual Mode, use Track Name
    if (mode === 'manual') {
        const trackId = selectedTrackIds[idx];
        const t = midi.tracks[trackId];
        return t ? t.name : `Track ${trackId}`;
    }
    
    // 3. Fallback to generic voice label (Soprano, Alto, etc.)
    return getVoiceLabel(idx, selectedTrackIds.length);
};

function getHarmonyMethodology(mode: string, section: AnalysisSection): string {
    switch(mode) {
        case 'attack': 
            return `ATTACK: Block chords (simultaneous start). Tolerance: ${section.chordTolerance}.`;
        case 'sustain':
            return `SUSTAIN: Overlapping held notes. Min Duration: ${section.chordMinDuration}.`;
        case 'arpeggio_window':
            return `ARPEGGIO (Time-Based): Chords derived from notes within a ${section.arpeggioWindowVal} window.`;
        case 'hia_v2':
            return `Optional Diagnostic (HIA v2.2): Harmonic Implication with salience weighting and suspension exclusion.`;
        case 'hybrid':
            const conf = section.hybridConfig || { voiceRoles: {}, arpStrategy: 'note_based', arpHistoryCount: 4, arpHistoryTime: '1/2' };
            const strat = conf.arpStrategy === 'note_based' ? `Last ${conf.arpHistoryCount} notes` : `Window ${conf.arpHistoryTime}`;
            return `HYBRID: Advanced weighted scoring (Duration, Beat Position). Strategy: ${strat}.`;
        default: return mode;
    }
}

// Key: "vLow-vHigh", Value: The label of the active dissonance (e.g., "M2")
type DissonanceState = Record<string, string>;

function isDissonantInterval(interval: number, isAgainstBass: boolean): boolean {
    const i = interval % 12;
    // Always Dissonant: m2(1), M2(2), TT(6), m7(10), M7(11)
    if ([1, 2, 6, 10, 11].includes(i)) return true;
    // P4(5): Dissonant against bass, Consonant otherwise
    if (i === 5) return isAgainstBass;
    return false;
}

function getDissonanceCellContent(
    activeNotes: RawNote[], 
    state: DissonanceState, 
    activePairsOut: Set<string>,
    filter: 'bass' | 'other' | 'all',
    dissonanceTracker: Map<string, DissonanceChain>,
    completedChains: DissonanceChain[],
    currentTime: string,
    currentTick: number,
    voiceNames: Record<number, string>,
    midi: Midi,
    selectedTrackIds: number[],
    mode: string,
    ppq: number,
    ts: { numerator: number, denominator: number }
): string {
    if (activeNotes.length < 2) return "";

    const sorted = [...activeNotes].sort((a,b) => a.midi - b.midi);
    const bass = sorted[0];
    const bassVoiceIdx = bass.voiceIndex ?? -1;

    const outputParts: string[] = [];
    const compactTime = getFormattedTime(currentTick, ppq, ts.numerator, ts.denominator);
    
    // Check all pairs
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            const n1 = sorted[i];
            const n2 = sorted[j];
            const v1 = n1.voiceIndex ?? -1;
            const v2 = n2.voiceIndex ?? -1;
            
            const vMin = Math.min(v1, v2);
            const vMax = Math.max(v1, v2);
            const key = `${vMin}-${vMax}`;
            
            activePairsOut.add(key);

            const isBassPair = (v1 === bassVoiceIdx || v2 === bassVoiceIdx);
            
            if (filter === 'bass' && !isBassPair) continue;
            if (filter === 'other' && isBassPair) continue;

            const interval = Math.abs(n1.midi - n2.midi);
            const isDiss = isDissonantInterval(interval, isBassPair);
            const label = getIntervalLabel(interval);
            const pairLabel = `(${getStrictPitchName(n1.midi)},${getStrictPitchName(n2.midi)})`;

            const prevLabel = state[key];

            if (isDiss) {
                // If it's a NEW dissonance type for this pair
                if (prevLabel !== label) {
                   outputParts.push(`**${label}** ${pairLabel}`);
                   state[key] = label;
                   
                   // Update Logic
                   if (!dissonanceTracker.has(key)) {
                       // ONSET
                       dissonanceTracker.set(key, {
                           key,
                           voices: `${getName(vMin, voiceNames, midi, selectedTrackIds, mode)} & ${getName(vMax, voiceNames, midi, selectedTrackIds, mode)}`,
                           resolved: false,
                           steps: [{
                               tick: currentTick,
                               time: compactTime,
                               intervalLabel: label,
                               pairLabel,
                               type: 'onset'
                           }]
                       });
                   } else {
                       // SHIFT (Dissonance -> Different Dissonance)
                       const chain = dissonanceTracker.get(key)!;
                       // Only add step if time advanced or it's a significant change
                       const lastStep = chain.steps[chain.steps.length-1];
                       if (lastStep.intervalLabel !== label) {
                           chain.steps.push({
                               tick: currentTick,
                               time: compactTime,
                               intervalLabel: label,
                               pairLabel,
                               type: 'shift'
                           });
                       }
                   }
                }
            } else {
                // Consonant
                if (prevLabel) {
                    // RESOLUTION
                    outputParts.push(`*${prevLabel}→${label}* ${pairLabel}`);
                    delete state[key];
                    
                    if (dissonanceTracker.has(key)) {
                        const chain = dissonanceTracker.get(key)!;
                        chain.steps.push({
                            tick: currentTick,
                            time: compactTime,
                            intervalLabel: label,
                            pairLabel,
                            type: 'resolve'
                        });
                        chain.resolved = true;
                        completedChains.push(chain);
                        dissonanceTracker.delete(key);
                    }
                }
            }
        }
    }

    return outputParts.join(', ');
}

export function generateGeminiScore(midi: Midi, selectedTrackIds: number[], options: ConversionOptions, contextText: string = ''): { report: string, auditLog: string | null } {
    const ppq = midi.header.ppq;
    const ts = options.timeSignature;
    const ticksPerMeasure = ppq * ts.numerator * (4 / ts.denominator);

    // 1. Prepare Global Data
    let globalAnalysis: TrackAnalysisData;

    if (options.voiceAssignmentMode === 'manual') {
        globalAnalysis = analyzeTrackSelection(midi, selectedTrackIds, options);
    } else {
        const tempMidi = midi.clone();
        tempMidi.tracks = [];
        const combinedTrack = tempMidi.addTrack();
        selectedTrackIds.forEach(id => {
            const t = midi.tracks[id];
            if(t) t.notes.forEach(n => combinedTrack.addNote(n));
        });
        globalAnalysis = analyzeTrack(tempMidi, 0, options);
    }

    const allNotes = globalAnalysis.notesRaw.sort((a,b) => a.ticks - b.ticks);
    const globalVoiceCount = globalAnalysis.voiceCount;
    
    // 2. Build Output Header
    let fullOutput = SPELLING_PREAMBLE + "\n" + RHYTHM_KEY + "\n";
    fullOutput += `\nGEMINI ANALYSIS REPORT\n`;
    if (contextText) fullOutput += `CONTEXT:\n${contextText}\n\n`;
    fullOutput += `Voice Strategy: ${options.voiceAssignmentMode === 'manual' ? 'Manual (Tracks)' : 'Auto (Density)'}\n`;
    fullOutput += `Global Voice Map:\n`;
    for(let i=0; i<globalVoiceCount; i++) {
        fullOutput += ` - Index ${i}: ${getName(i, options.voiceNames, midi, selectedTrackIds, options.voiceAssignmentMode)}\n`;
    }
    fullOutput += `--------------------------------------------------\n`;

    let auditLogOutput = "";

    // 3. Process Per Section
    options.sections.forEach(section => {
        const sectionStartTick = (section.startMeasure - 1) * ticksPerMeasure;
        const sectionEndTick = section.endMeasure * ticksPerMeasure;
        
        const sectionNotes = allNotes.filter(n => n.ticks >= sectionStartTick && n.ticks < sectionEndTick);
        
        fullOutput += `\n### SECTION: ${section.name} (Meas ${section.startMeasure}-${section.endMeasure})\n`;
        fullOutput += `Harmony Logic: ${getHarmonyMethodology(section.harmonyMode, section)}\n`;
        if (section.ignorePassingMotion) fullOutput += `* Passing motion filtering is ACTIVE.\n`;

        if (sectionNotes.length === 0) {
            fullOutput += `\n(No notes found in this range)\n`;
            return;
        }

        const toleranceTicks = getQuantizationTickValue(section.chordTolerance, ppq);
        const minDurTicks = getQuantizationTickValue(section.chordMinDuration, ppq);

        let sectionChords: ChordEvent[] = [];
        
        if (section.harmonyMode === 'hia_v2') {
             sectionChords = detectChordsHIA(sectionNotes, ppq, ts.numerator, ts.denominator);
        } else if (section.harmonyMode === 'attack') {
            sectionChords = detectChordsAttack(sectionNotes, ppq, ts.numerator, ts.denominator, toleranceTicks, minDurTicks, section.ignorePassingMotion);
        } else if (section.harmonyMode === 'sustain') {
            sectionChords = detectChordsSustain(sectionNotes, ppq, ts.numerator, ts.denominator, minDurTicks, section.ignorePassingMotion);
        } else if (section.harmonyMode === 'arpeggio_window') {
            const allArpRoles: Record<number, HybridVoiceRole> = {};
            for(let i=0; i<globalAnalysis.voiceCount; i++) allArpRoles[i] = 'arpeggio';
            sectionChords = detectChordsArpeggio(sectionNotes, ppq, ts.numerator, ts.denominator, minDurTicks, allArpRoles, 'time_based', section.arpeggioWindowVal || '1/2');
        } else if (section.harmonyMode === 'hybrid') {
            const config = section.hybridConfig || { voiceRoles: {}, arpStrategy: 'note_based', arpHistoryCount: 4, arpHistoryTime: '1/2' };
            const historyParam = config.arpStrategy === 'note_based' ? config.arpHistoryCount : config.arpHistoryTime;
            sectionChords = detectChordsArpeggio(sectionNotes, ppq, ts.numerator, ts.denominator, minDurTicks, config.voiceRoles, config.arpStrategy, historyParam);
        }

        const sectionAnalysisData = analyzePreparedNotes(
            sectionNotes, section.name, ppq, [ts.numerator, ts.denominator], options.tempo, globalAnalysis.voiceCount
        );

        sectionAnalysisData.chordsSustain = [];
        sectionAnalysisData.chordsAttack = [];
        if (section.harmonyMode === 'hia_v2') sectionAnalysisData.chordsSustain = sectionChords;
        else if (section.harmonyMode === 'sustain') sectionAnalysisData.chordsSustain = sectionChords;
        else if (section.harmonyMode === 'attack') sectionAnalysisData.chordsAttack = sectionChords;
        else sectionAnalysisData.chordsHybrid = sectionChords;

        // Determine column structure based on ACTIVE voices in this section
        const activeVoiceIndices = Array.from(new Set(sectionNotes.map(n => n.voiceIndex ?? 0))).sort((a,b) => a-b);
        const sectionVoiceCount = activeVoiceIndices.length;
        const showDissonanceColumns = sectionVoiceCount > 1;
        const splitDissonanceColumns = sectionVoiceCount > 3;

        const completedChains: DissonanceChain[] = [];

        // 1. GENERATE SCORE TABLE
        fullOutput += `\n**Contrapuntal Score Table**\n`;
        fullOutput += generateScoreTable(
            sectionNotes, activeVoiceIndices, ppq, ts, options.voiceNames,
            sectionAnalysisData.bestKeyPrediction?.root || 0,
            sectionEndTick, sectionVoiceCount, showDissonanceColumns, splitDissonanceColumns,
            completedChains, midi, selectedTrackIds, options.voiceAssignmentMode
        );
        
        // 2. HARMONY REPORT
        fullOutput += `\n**Harmonic Analysis**\n`;
        fullOutput += generateAnalysisReport(sectionAnalysisData, section.pitchStatsMode);

        // 3. SEPARATE AUDIT LOG GENERATION
        // We do NOT append this to fullOutput. It goes to auditLogOutput.
        if (section.debugLogging && section.harmonyMode === 'hia_v2') {
             auditLogOutput += `\n### SECTION: ${section.name}\n`;
             auditLogOutput += generateHIAAuditLog(sectionChords);
        }
        
        // 4. DISSONANCE LOG (CHAIN FORMAT)
        if (completedChains.length > 0) {
            fullOutput += `\n**Dissonance Resolution Log**\n`;
            
            // Determine max columns needed based on chain length
            let maxSteps = 0;
            completedChains.forEach(c => {
                // Steps include onset -> ... -> resolution
                // Number of dissonance phases = steps.length - 1
                const dissPhases = c.steps.length - 1;
                if (dissPhases > maxSteps) maxSteps = dissPhases;
            });

            // Build Header
            let header = `| Voices |`;
            let separator = `| :--- |`;
            for(let i=1; i<=maxSteps; i++) {
                header += ` Diss ${i} |`;
                separator += ` :--- |`;
            }
            header += ` Resolve |`;
            separator += ` :--- |`;
            
            fullOutput += header + "\n" + separator + "\n";
            
            // Sort by start time
            completedChains.sort((a,b) => a.steps[0].tick - b.steps[0].tick);

            completedChains.forEach(chain => {
                let row = `| ${chain.voices} |`;
                
                // Dissonance Phases (All steps except last)
                const phases = chain.steps.slice(0, -1);
                phases.forEach(step => {
                    row += ` ${step.time} **${step.intervalLabel}** ${step.pairLabel} |`;
                });
                
                // Fill empty columns if chain is shorter than max
                for(let i=phases.length; i<maxSteps; i++) {
                    row += ` - |`;
                }
                
                // Resolution (Last step)
                const res = chain.steps[chain.steps.length - 1];
                if (res.type === 'resolve') {
                    row += ` ${res.time} *${res.intervalLabel}* ${res.pairLabel} |`;
                } else {
                    row += ` ${res.time} *Rest* |`;
                }
                
                fullOutput += row + "\n";
            });
        } else {
            fullOutput += `\n(No resolved dissonances detected in this section)\n`;
        }
        
        fullOutput += `\n--------------------------------------------------\n`;
    });

    return { 
        report: fullOutput, 
        auditLog: auditLogOutput.trim() || null 
    };
}

function generateScoreTable(
    notes: RawNote[], 
    activeVoiceIndices: number[], 
    ppq: number, 
    ts: {numerator:number, denominator:number}, 
    voiceNames: Record<number, string>, 
    keyRoot: number,
    sectionEndTick: number,
    totalVoiceCount: number,
    showDissonance: boolean,
    splitDissonance: boolean,
    completedChains: DissonanceChain[],
    midi: Midi,
    selectedTrackIds: number[],
    mode: string
): string {
    const voices: Record<number, RawNote[]> = {};
    activeVoiceIndices.forEach(v => voices[v] = []);
    notes.forEach(n => { const v = n.voiceIndex ?? 0; if (voices[v]) voices[v].push(n); });

    const ticksPerMeasure = ppq * ts.numerator * (4 / ts.denominator);
    const timePoints = new Set<number>();
    const ticksPerBeat = ppq * (4 / ts.denominator);
    let t = notes.length > 0 ? notes[0].ticks : 0;
    t = Math.floor(t / ticksPerBeat) * ticksPerBeat;
    while(t < sectionEndTick) { timePoints.add(t); t += ticksPerBeat; }
    notes.forEach(n => timePoints.add(n.ticks));
    
    // Add Measure boundaries explicitly
    for(let mTick = 0; mTick < sectionEndTick; mTick += ticksPerMeasure) {
        if(mTick >= (notes[0]?.ticks || 0)) timePoints.add(mTick);
    }
    
    const validTicks = Array.from(timePoints).filter(t => t < sectionEndTick).sort((a,b) => a - b);
    
    // Pre-calculate active voices per measure
    const measureActivity = new Map<number, Set<number>>();
    notes.forEach(n => {
        const m = Math.floor(n.ticks / ticksPerMeasure) + 1;
        if (!measureActivity.has(m)) measureActivity.set(m, new Set());
        measureActivity.get(m)!.add(n.voiceIndex ?? 0);
    });

    const scoreRows: ScoreRow[] = [];
    const dissonanceState: DissonanceState = {};
    const dissonanceTracker = new Map<string, DissonanceChain>(); 
    
    let lastMeasure = -1;

    validTicks.forEach(tick => {
        const currentMeasure = Math.floor(tick / ticksPerMeasure) + 1;
        const activeInThisMeasure = measureActivity.get(currentMeasure) || new Set();

        // Check for Measure Boundary to insert Header Row
        if (currentMeasure !== lastMeasure) {
            const activeNames = Array.from(activeInThisMeasure).sort((a,b)=>a-b).map(v => getName(v, voiceNames, midi, selectedTrackIds, mode));
            scoreRows.push({
                tick, formattedTime: '', isMeasureStart: true, measureNumber: currentMeasure, 
                activeVoicesInMeasure: Array.from(activeInThisMeasure),
                voices: {}
            });
            lastMeasure = currentMeasure;
        }

        const currentTime = getFormattedTime(tick, ppq, ts.numerator, ts.denominator);
        const rowData: ScoreRow = {
            tick, formattedTime: currentTime, voices: {}, bassDissonance: '', upperDissonance: ''
        };

        let rowHasContent = false;

        activeVoiceIndices.forEach(v => {
            if (!activeInThisMeasure.has(v)) {
                // Tacet - Empty Cell (Strict formatting)
                rowData.voices[v] = { cellContent: "", status: 'TACET' };
            } else {
                const voiceNotes = voices[v];
                const startingNote = voiceNotes.find(n => Math.abs(n.ticks - tick) < 0.1); 
                const holdingNote = voiceNotes.find(n => n.ticks < tick && (n.ticks + n.durationTicks) > tick);

                if (startingNote) {
                    const durAbbr = getRhythmAbbreviation(startingNote.durationTicks, ppq);
                    const pName = getPitchName(startingNote.midi, keyRoot);
                    rowData.voices[v] = { cellContent: `**${pName}** (${durAbbr})`, status: 'ATTACK' };
                    rowHasContent = true;
                } else if (holdingNote) {
                    rowData.voices[v] = { cellContent: `-`, status: 'HOLD' };
                } else {
                    rowData.voices[v] = { cellContent: `z`, status: 'REST_CONT' };
                }
            }
        });

        // 2. Dissonance Logic
        const activeAtMoment = notes.filter(n => n.ticks <= tick && (n.ticks + n.durationTicks) > tick);
        const activePairs = new Set<string>();
        
        if (showDissonance && activeAtMoment.length >= 2) {
             const commonArgs = [dissonanceTracker, completedChains, currentTime, tick, voiceNames, midi, selectedTrackIds, mode, ppq, ts] as const;
             
             if (splitDissonance) {
                 rowData.bassDissonance = getDissonanceCellContent(activeAtMoment, dissonanceState, activePairs, 'bass', ...commonArgs);
                 rowData.upperDissonance = getDissonanceCellContent(activeAtMoment, dissonanceState, activePairs, 'other', ...commonArgs);
                 if (rowData.bassDissonance || rowData.upperDissonance) rowHasContent = true;
             } else {
                 rowData.bassDissonance = getDissonanceCellContent(activeAtMoment, dissonanceState, activePairs, 'all', ...commonArgs);
                 if (rowData.bassDissonance) rowHasContent = true;
             }
        }

        // Cleanup Stale
        Object.keys(dissonanceState).forEach(key => {
            if (!activePairs.has(key)) {
                delete dissonanceState[key];
                if (dissonanceTracker.has(key)) {
                    const chain = dissonanceTracker.get(key)!;
                    chain.steps.push({
                        tick: tick, time: getFormattedTime(tick, ppq, ts.numerator, ts.denominator),
                        intervalLabel: 'Rest', pairLabel: '', type: 'release'
                    });
                    chain.resolved = false;
                    completedChains.push(chain);
                    dissonanceTracker.delete(key);
                }
            }
        });

        if (rowHasContent) scoreRows.push(rowData);
    });

    let output = "| Time |";
    let separator = "| :--- |";
    activeVoiceIndices.forEach(i => {
        output += ` ${getName(i, voiceNames, midi, selectedTrackIds, mode)} |`;
        separator += " :--- |";
    });
    
    if (showDissonance) {
        if (splitDissonance) {
            output += " Bass Diss. | Upper Diss. |";
            separator += " :--- | :--- |";
        } else {
            output += " Intervals |";
            separator += " :--- |";
        }
    }
    
    output += "\n" + separator + "\n";

    scoreRows.forEach(row => {
        if (row.isMeasureStart) {
            // Header Row - ensure clean formatting, no pipes in content
            const activeV = row.activeVoicesInMeasure?.map(v => getName(v, voiceNames, midi, selectedTrackIds, mode)).join(', ') || 'None';
            output += `| **Measure ${row.measureNumber}** (Active: ${activeV}) |`;
            // Fill rest with empty cells
            for(let i=0; i < activeVoiceIndices.length; i++) output += " |";
            if (showDissonance) output += splitDissonance ? " | |" : " |";
            output += "\n";
        } else {
            let line = `| ${row.formattedTime} |`;
            activeVoiceIndices.forEach(i => {
                const v = row.voices[i];
                const content = v ? v.cellContent : ""; 
                line += ` ${content} |`;
            });
            
            if (showDissonance) {
                if (splitDissonance) {
                    line += ` ${row.bassDissonance || ''} | ${row.upperDissonance || ''} |`;
                } else {
                    line += ` ${row.bassDissonance || ''} |`;
                }
            }
            output += line + "\n";
        }
    });
    return output;
}
