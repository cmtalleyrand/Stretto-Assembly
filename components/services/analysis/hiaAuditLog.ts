import { ChordEvent } from '../../../types';
import { AuditLogStep, AuditCandidate, AuditInputNote, AuditFactor } from './hia/hiaDefs';

const VOICES = ['S', 'A', 'T', 'B'];

function getVoiceCode(idx: number): string {
    if (idx === 0) return 'S';
    if (idx === 1) return 'A';
    if (idx === 2) return 'T';
    if (idx === 3) return 'B';
    return `V${idx+1}`;
}

function formatDuration(quarters: number): string {
    if (Math.abs(quarters - 4.0) < 0.05) return "1/1";
    if (Math.abs(quarters - 3.0) < 0.05) return "1/2.";
    if (Math.abs(quarters - 2.0) < 0.05) return "1/2";
    if (Math.abs(quarters - 1.5) < 0.05) return "1/4.";
    if (Math.abs(quarters - 1.0) < 0.05) return "1/4";
    if (Math.abs(quarters - 0.75) < 0.05) return "1/8.";
    if (Math.abs(quarters - 0.5) < 0.05) return "1/8";
    if (Math.abs(quarters - 0.25) < 0.05) return "1/16";
    return quarters.toFixed(2);
}

function formatHeaderTime(str: string): string {
    return str.replace('M', 'Measure ').replace('B', 'Beat ');
}

function formatFactorLine(f: AuditFactor, sign: string): string {
    const safeName = f.noteName || "Unknown";
    return `- ${sign} ${safeName} (${f.label}) : ${f.value.toFixed(2)}`;
}

function formatWinningChordBlock(cand: AuditCandidate): string {
    let out = `**Winning Chord: ${cand.name}**\n`;
    
    out += `\n**Chord Notes (Evidence)**\n`;
    if (cand.evidenceBreakdown.length > 0) {
        cand.evidenceBreakdown.forEach(f => out += `${formatFactorLine(f, '+')}\n`);
    }
    out += `= **${cand.evidenceTotal.toFixed(2)}**\n`;

    out += `\n**Non Chord Notes (Penalty)**\n`;
    if (cand.penaltyBreakdown.length > 0) {
        cand.penaltyBreakdown.forEach(f => out += `${formatFactorLine(f, '-')}\n`);
    } else {
        out += `(None)\n`;
    }
    out += `= **-${cand.penaltyTotal.toFixed(2)}**\n`;

    out += `\n**Quality Modifiers** (Applied to Evidence)\n`;
    out += `- Base Quality: 0.90\n`;
    cand.qualityLog.forEach(log => {
        if (log !== "Base 1.0" && log !== "Base 0.9") out += `- ${log}\n`;
    });
    out += `= **${cand.qualityScore.toFixed(2)}**\n`;

    out += `\n**Step Calculation:**\n`;
    out += `Score = (Evidence * Quality) - Penalty\n`;
    out += `Score = (${cand.evidenceTotal.toFixed(2)} * ${cand.qualityScore.toFixed(2)}) - ${cand.penaltyTotal.toFixed(2)}\n`;
    out += `**Step Score:** ${cand.stepScore.toFixed(2)}\n`;
    out += `**Path Accumulation:** ${cand.finalScore.toFixed(2)}\n`;

    return out;
}

function formatRunnersUp(candidates: AuditCandidate[]): string {
    if (!candidates || candidates.length === 0) return "";
    let out = `\n### Runners Up (Alternatives)\n\n`;
    out += `Rank | Chord | Total | Step | Quality | Evid | Pen\n`;
    out += `--- | --- | --- | --- | --- | --- | ---\n`;
    
    candidates.forEach((c, i) => {
        out += `${i+1} | ${c.name} | ${c.finalScore.toFixed(2)} | ${c.stepScore.toFixed(2)} | ${c.qualityScore.toFixed(2)} | ${c.evidenceTotal.toFixed(2)} | -${c.penaltyTotal.toFixed(2)}\n`;
    });
    return out;
}

export function generateHIAAuditLog(chords: ChordEvent[]): string {
    if (!chords || chords.length === 0) return "";

    // --- PART 1: SUMMARY TABLE ---
    let report = `Optional Diagnostic: HIA v2.2 Audit Summary\n\n`;
    report += `| Time | Winning Chord | Step Score | Path Score | Top Alternatives |\n`;
    report += `| :--- | :--- | :--- | :--- | :--- |\n`;

    chords.forEach((c) => {
        if (!c.debugInfo) return;
        let step: AuditLogStep | null = null;
        try {
            step = JSON.parse(c.debugInfo);
        } catch (e) {
            report += `| ${c.formattedTime} | ERR | - | - | - |\n`;
            return;
        }
        if (!step) return;
        const winner = step.winner;
        const alts = step.runnersUp.slice(0, 3).map(r => `${r.name} (${r.stepScore.toFixed(1)})`).join(', ');
        
        report += `| ${step.formattedTime} | **${winner.name}** | ${winner.stepScore.toFixed(2)} | ${winner.finalScore.toFixed(2)} | ${alts || '(None)'} |\n`;
    });

    report += `\n\n--------------------------------------------------\n\n`;
    report += `DETAILED DECISION TRACE\n\n`;

    // --- PART 2: DETAILED LOG ---
    let lastReportedScore = 0;

    chords.forEach((c, idx) => {
        if (!c.debugInfo) return;

        let step: AuditLogStep | null = null;
        try {
            step = JSON.parse(c.debugInfo);
        } catch (e) {
            report += `[ERR] Could not parse debug info for ${c.formattedTime}\n`;
            return;
        }

        if (!step) return;

        report += `\n## ${formatHeaderTime(step.formattedTime)}\n\n`;
        
        report += `### Context\n`;
        report += `**Previous Chord:** ${step.prevChord}\n`;
        
        // Show how much score was added while the previous chord was held
        const accumulatedInHold = step.winner.pathScore - lastReportedScore;
        if (idx > 0 && accumulatedInHold > 0.01) {
            report += `**Incoming Path Score:** ${step.winner.pathScore.toFixed(2)} (+${accumulatedInHold.toFixed(2)} accumulated during hold)\n`;
        } else {
            report += `**Incoming Path Score:** ${step.winner.pathScore.toFixed(2)}\n`;
        }
        report += `\n`;

        report += `### Inputs\n\n`;
        report += `Voc & Onset | Note | Dur | Met | Appr | Decay | Final Sal | Flags\n`;
        report += `----|------|------|------|------|------|------|-------\n`;
        
        if (step.inputs.length === 0) {
            report += `(No active inputs)\n`;
        } else {
            step.inputs.forEach((n: AuditInputNote) => {
                const vLabel = getVoiceCode(n.voiceIndex);
                const vocOnset = `${vLabel}: ${n.onsetFormatted}`;
                const safeName = n.name || "???";
                const dur = formatDuration(n.durationQuarters);
                const met = n.metricWeight.toFixed(1);
                const appr = n.approachModifier.toFixed(2); 
                const decay = n.decay.toFixed(2);
                const score = n.finalSalience.toFixed(2);
                
                let flags = "";
                if (n.isExcluded) flags = n.exclusionReason || "Excluded";
                else if (n.isSuspension) flags = "**Susp**";
                
                report += `${vocOnset} | ${safeName} | ${dur} | ${met} | ${appr} | ${decay} | ${score} | ${flags}\n`;
            });
        }
        report += `\n`;

        report += `### Winner Selection\n\n`;
        report += formatWinningChordBlock(step.winner);
        lastReportedScore = step.winner.finalScore;
        
        report += formatRunnersUp(step.runnersUp);
        report += `\n`;
        report += `***\n`;
    });

    return report;
}