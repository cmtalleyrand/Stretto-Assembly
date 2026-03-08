import React from 'react';
import { MusicNoteIcon } from './Icons';

export default function Header() {
  return (
    <header className="w-full max-w-5xl mx-auto text-center mb-10">
      <div className="flex items-center justify-center gap-4">
        <div className="bg-brand-primary/20 border border-brand-primary/40 p-3 rounded-2xl shadow-lg backdrop-blur-sm">
          <MusicNoteIcon className="w-8 h-8 text-brand-primary" />
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-brand-accent via-gray-light to-brand-primary">
          Stretto Assembly
        </h1>
      </div>
      <p className="mt-5 text-lg text-gray-200 font-semibold tracking-wide">
        Deterministic stretto discovery, chain generation, implied harmony evaluation.
      </p>
      <p className="text-sm text-gray-400 font-mono mt-1">
        ABC is canonical input; MIDI remains optional for interoperability and export seeding.
      </p>
    </header>
  );
}
