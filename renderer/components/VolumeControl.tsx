'use client';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  muted: boolean;
  volume: number;
  onMutedChange: (muted: boolean) => void;
  onVolumeChange: (volume: number) => void;
}

export function VolumeControl({ muted, volume, onMutedChange, onVolumeChange }: Props) {
  return (
    <div className="absolute right-46 top-10 z-10 flex items-center gap-2 rounded-md bg-black/55 px-2 py-1 text-white">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onMutedChange(!muted)}
        aria-label={muted ? 'Увімкнути звук' : 'Вимкнути звук'}
        className="h-8 w-8 p-0 text-white hover:bg-white/10"
      >
        {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
      </Button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => {
          const v = Number(e.target.value);
          onVolumeChange(v);
          if (v > 0 && muted) onMutedChange(false);
          if (v === 0) onMutedChange(true);
        }}
        aria-label="Гучність"
        className="h-1 w-28 cursor-pointer accent-white"
      />
    </div>
  );
}
