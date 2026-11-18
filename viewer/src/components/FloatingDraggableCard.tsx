import React, { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

interface FloatingDraggableCardProps {
  /** Initial center-top anchor offset from top of viewport in px */
  initialTop: number;
  /** Optional initial horizontal offset from viewport center in px */
  initialOffsetX?: number;
  /** Width class (e.g., "w-[740px] max-w-[calc(100vw-24px)]") */
  widthClass?: string;
  /** Z-index utility class */
  zIndexClass?: string;
  /** Optional drag handle rendered inside children via render prop */
  children: (dragHandleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    gripIcon: React.ReactNode;
  }) => React.ReactNode;
}

/**
 * Smooth, viewport-clamped draggable floating container using GPU translate3d.
 * Zero layout thrashing and never interferes with Cesium globe panning/zooming.
 */
export default function FloatingDraggableCard({
  initialTop,
  initialOffsetX = 0,
  widthClass = 'w-auto max-w-[calc(100vw-24px)]',
  zIndexClass = 'z-20',
  children,
}: FloatingDraggableCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({
    x: initialOffsetX,
    y: initialTop,
  });
  const dragStateRef = useRef<{
    dragging: boolean;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
  }>({
    dragging: false,
    startClientX: 0,
    startClientY: 0,
    originX: 0,
    originY: 0,
  });

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const ds = dragStateRef.current;
      if (!ds.dragging) return;

      const dx = e.clientX - ds.startClientX;
      const dy = e.clientY - ds.startClientY;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = cardRef.current?.getBoundingClientRect();
      const halfW = (rect?.width ?? 320) / 2;
      const h = rect?.height ?? 60;

      // Keep at least the drag bar cleanly inside the viewport
      const maxX = Math.max(0, vw / 2 - halfW - 8);
      const clampedX = Math.max(-maxX, Math.min(maxX, ds.originX + dx));
      const clampedY = Math.max(54, Math.min(vh - h - 8, ds.originY + dy));

      setPos({ x: clampedX, y: clampedY });
    };

    const onPointerUp = () => {
      dragStateRef.current.dragging = false;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only primary mouse button / touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    dragStateRef.current = {
      dragging: true,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };
  };

  return (
    <div
      ref={cardRef}
      style={{
        left: '50%',
        top: 0,
        transform: `translate3d(calc(-50% + ${pos.x}px), ${pos.y}px, 0)`,
      }}
      className={`fixed ${zIndexClass} ${widthClass} pointer-events-auto select-none`}
    >
      {children({
        onPointerDown: handlePointerDown,
        gripIcon: (
          <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-300 shrink-0" />
        ),
      })}
    </div>
  );
}
