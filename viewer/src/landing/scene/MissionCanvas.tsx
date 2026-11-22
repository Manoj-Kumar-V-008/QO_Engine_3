import { useEffect, useRef, useState } from 'react';
import type { LandingDataBundle } from '../data/loadLandingData';
import type { ScheduleMethod } from '../../types/engine';
import { MissionScene, type SceneVariant } from './MissionScene';

interface MissionCanvasProps {
  data: LandingDataBundle;
  variant: SceneVariant;
  mode?: ScheduleMethod;
  progressRef?: { current: number };
  onFail?: () => void;
  className?: string;
  ariaLabel: string;
}

export default function MissionCanvas({
  data,
  variant,
  mode = 'qslice',
  progressRef,
  onFail,
  className = '',
  ariaLabel,
}: MissionCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<MissionScene | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: MissionScene | null = null;
    try {
      scene = new MissionScene({
        host,
        labelHost: labelRef.current,
        data,
        variant,
        mode,
        progressRef,
        onWebGLFailure: () => {
          setFailed(true);
          onFail?.();
        },
      });
      sceneRef.current = scene;
    } catch (error) {
      console.error('QOE3 landing scene failed to initialise', error);
      setFailed(true);
      onFail?.();
    }

    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, variant]);

  useEffect(() => {
    sceneRef.current?.setMode(mode);
  }, [mode]);

  if (failed) {
    return null;
  }

  return (
    <div
      className={`q-mission-canvas ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      <div ref={hostRef} className="q-mission-canvas__webgl" />
      <div ref={labelRef} className="q-mission-canvas__labels" aria-hidden="true" />
    </div>
  );
}
