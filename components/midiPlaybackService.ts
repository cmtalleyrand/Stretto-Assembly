import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

let instrument: Tone.Sampler | Tone.PolySynth | null = null;
let currentPart: Tone.Part | null = null;

const PIANO_SAMPLES = {
    'A0': 'A0.mp3', 'C1': 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3', 'A1': 'A1.mp3',
    'C2': 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3', 'A2': 'A2.mp3',
    'C3': 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3', 'A3': 'A3.mp3',
    'C4': 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', 'A4': 'A4.mp3',
    'C5': 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3', 'A5': 'A5.mp3',
    'C6': 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3', 'A6': 'A6.mp3',
    'C7': 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3', 'A7': 'A7.mp3',
    'C8': 'C8.mp3'
};
const SAMPLE_BASE_URL = "https://tonejs.github.io/audio/salamander/";

async function initializeInstrument(): Promise<Tone.Sampler | Tone.PolySynth> {
  if (instrument) return instrument;

  return new Promise((resolve) => {
      const sampler = new Tone.Sampler({
          urls: PIANO_SAMPLES,
          baseUrl: SAMPLE_BASE_URL,
          onload: () => {
              sampler.toDestination();
              instrument = sampler;
              resolve(sampler);
          },
          onerror: () => {
              createFallbackSynth();
              resolve(instrument!);
          }
      });
      
      setTimeout(() => {
          if (!sampler.loaded) {
              createFallbackSynth();
              resolve(instrument!);
          }
      }, 3000);
  });
}

function createFallbackSynth() {
    if (instrument instanceof Tone.PolySynth) return;
    instrument = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 1.2 },
        volume: -6
    }).toDestination();
}

export async function playTrack(processedMidi: Midi, onEnded: () => void): Promise<void> {
  stopPlayback();
  if (processedMidi.tracks.length === 0) { onEnded(); return; }
  const track = processedMidi.tracks[0];
  if (!track.notes || track.notes.length === 0) { onEnded(); return; }

  const inst = await initializeInstrument();
  await Tone.start();

  Tone.Transport.stop();
  Tone.Transport.position = 0;
  Tone.Transport.bpm.value = processedMidi.header.tempos[0]?.bpm || 120;
  
  currentPart = new Tone.Part(
    (time, note) => {
      if (note.midi !== undefined && !isNaN(note.midi) && note.midi !== null) {
          const pitch = Tone.Frequency(note.midi, "midi").toNote();
          if (pitch && !pitch.includes('NaN')) {
              inst.triggerAttackRelease(pitch, note.duration, time, note.velocity);
          }
      }
    },
    track.notes.map(note => ({
      time: note.time,
      midi: note.midi,
      duration: note.duration,
      velocity: note.velocity,
    }))
  );

  currentPart.loop = false;
  Tone.Transport.on('stop', () => {
    currentPart?.dispose();
    currentPart = null;
    onEnded();
  });

  currentPart.start(0);
  Tone.Transport.start();
  const lastNote = track.notes[track.notes.length - 1];
  const endTime = lastNote.time + lastNote.duration + 1;
  Tone.Transport.scheduleOnce(() => { Tone.Transport.stop(); }, endTime);
}

export async function playSequence(notes: { midi?: number, name?: string, time: number, duration: number, velocity: number }[], onEnded?: () => void) {
    stopPlayback();
    const inst = await initializeInstrument();
    await Tone.start();
    const now = Tone.now();
    let maxTime = 0;

    notes.forEach(n => {
        let pitch: string | null = null;
        if (n.midi !== undefined && !isNaN(n.midi) && n.midi !== null) {
            pitch = Tone.Frequency(n.midi, "midi").toNote();
        } else if (n.name && !n.name.includes(',') && !n.name.includes("'")) {
            // Only fallback to name if it doesn't look like ABC notation
            pitch = n.name;
        }

        if (pitch && !pitch.includes('undefined') && !pitch.includes('NaN')) {
            const time = now + (isNaN(n.time) ? 0 : n.time);
            const dur = isNaN(n.duration) ? 0.5 : n.duration;
            try {
                inst.triggerAttackRelease(pitch, dur, time, n.velocity);
                if ((n.time + n.duration) > maxTime) maxTime = n.time + n.duration;
            } catch (e) { console.warn(`Playback error:`, e); }
        }
    });

    if (onEnded) { setTimeout(onEnded, (maxTime || 1) * 1000 + 500); }
}

export async function playSpecificNotes(notes: { midi?: number, name?: string, duration: number, velocity: number }[]) {
    const inst = await initializeInstrument();
    await Tone.start();
    const now = Tone.now();
    notes.forEach(n => {
        let pitch: string | null = null;
        if (n.midi !== undefined && !isNaN(n.midi) && n.midi !== null) {
            pitch = Tone.Frequency(n.midi, "midi").toNote();
        } else if (n.name && !n.name.includes(',') && !n.name.includes("'")) {
            pitch = n.name;
        }

        if (pitch && !pitch.includes('undefined') && !pitch.includes('NaN')) {
            try { inst.triggerAttackRelease(pitch, n.duration, now, n.velocity); } catch (e) { }
        }
    });
}

export function stopPlayback(): void {
  if (Tone.Transport.state === 'started') {
    Tone.Transport.stop();
    Tone.Transport.cancel(); 
  }
  if (currentPart) {
    currentPart.dispose();
    currentPart = null;
  }
  if (instrument) { instrument.releaseAll(); }
}