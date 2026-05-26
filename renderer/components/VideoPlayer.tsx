'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  src: string | null;
  fadeMs: number;
  muted?: boolean;
  volume?: number;
}

interface Layer {
  src: string | null;
  visible: boolean;
}

export function VideoPlayer({ src, fadeMs, muted = false, volume = 1 }: Props) {
  const [a, setA] = useState<Layer>({ src: null, visible: true });
  const [b, setB] = useState<Layer>({ src: null, visible: false });
  const aRef = useRef<HTMLVideoElement | null>(null);
  const bRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(1, volume));
    if (aRef.current) aRef.current.volume = clamped;
    if (bRef.current) bRef.current.volume = clamped;
  }, [volume]);

  useEffect(() => {
    if (!src) return;

    const visibleLayerSrc = a.visible ? a.src : b.src;
    if (visibleLayerSrc === src) return;

    const targetIsA = !a.visible;
    const targetSetter = targetIsA ? setA : setB;
    const otherSetter = targetIsA ? setB : setA;
    const targetEl = targetIsA ? aRef.current : bRef.current;

    targetSetter({ src, visible: false });

    if (!targetEl) return;

    const ready = () => {
      targetEl.removeEventListener('canplay', ready);
      targetEl.play().catch(() => {});
      targetSetter({ src, visible: true });
      otherSetter((prev) => ({ ...prev, visible: false }));
    };
    targetEl.addEventListener('canplay', ready, { once: true });

    targetEl.src = src;
    if (targetEl.readyState >= 3) ready();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const layerCls = (visible: boolean) =>
    cn(
      'pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity ease-in-out',
      visible ? 'opacity-100' : 'opacity-0',
    );
  const layerStyle = { transitionDuration: `${fadeMs}ms` };

  return (
    <div className="fixed inset-0 bg-black">
      <video
        ref={aRef}
        autoPlay
        loop
        muted={muted || !a.visible}
        playsInline
        className={layerCls(a.visible)}
        style={layerStyle}
      />
      <video
        ref={bRef}
        autoPlay
        loop
        muted={muted || !b.visible}
        playsInline
        className={layerCls(b.visible)}
        style={layerStyle}
      />
    </div>
  );
}
