import React from 'react';

interface TouchSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  suffix?: string;
  decimals?: number;
  ariaLabel: string;
  className?: string;
  style?: React.CSSProperties;
  numberStyle?: React.CSSProperties;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const decimalsForStep = (step: number) => {
  const text = String(step);
  if (!text.includes('.')) return 0;
  return text.split('.')[1].length;
};

const snapToStep = (value: number, min: number, max: number, step: number) => {
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(clamp(snapped, min, max).toFixed(decimalsForStep(step)));
};

export const TouchSlider: React.FC<TouchSliderProps> = ({
  value,
  min,
  max,
  step,
  onChange,
  suffix,
  decimals,
  ariaLabel,
  className,
  style,
  numberStyle,
}) => {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const draggingRef = React.useRef(false);
  const dragValueRef = React.useRef<number | null>(null);
  const [dragValue, setDragValue] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState<string | null>(null);
  const displayDecimals = decimals ?? decimalsForStep(step);
  const activeValue = dragValue ?? value;
  const percent = max === min ? 0 : ((activeValue - min) / (max - min)) * 100;

  const commit = React.useCallback((next: number) => {
    onChange(snapToStep(next, min, max, step));
  }, [max, min, onChange, step]);

  const readValueFromClientX = React.useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const ratio = rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
    return snapToStep(min + ratio * (max - min), min, max, step);
  }, [max, min, step, value]);

  const updateDragFromClientX = React.useCallback((clientX: number) => {
    const next = readValueFromClientX(clientX);
    dragValueRef.current = next;
    setDragValue(next);
  }, [readValueFromClientX]);

  const commitDrag = React.useCallback(() => {
    const next = dragValueRef.current;
    draggingRef.current = false;
    dragValueRef.current = null;
    setDragValue(null);
    if (next !== null) onChange(next);
  }, [onChange]);

  const cancelDrag = React.useCallback(() => {
    draggingRef.current = false;
    dragValueRef.current = null;
    setDragValue(null);
  }, []);

  const browserHasPointerEvents = () => typeof window !== 'undefined' && 'PointerEvent' in window;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateDragFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateDragFromClientX(event.clientX);
  };

  const finishPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    commitDrag();
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (browserHasPointerEvents()) return;
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (!touch) return;
    event.preventDefault();
    draggingRef.current = true;
    updateDragFromClientX(touch.clientX);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (browserHasPointerEvents() || !draggingRef.current) return;
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (!touch) return;
    event.preventDefault();
    updateDragFromClientX(touch.clientX);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (browserHasPointerEvents() || !draggingRef.current) return;
    event.preventDefault();
    commitDrag();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = value - step;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = value + step;
    if (event.key === 'PageDown') next = value - step * 10;
    if (event.key === 'PageUp') next = value + step * 10;
    if (event.key === 'Home') next = min;
    if (event.key === 'End') next = max;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  const handleNumberInput = (raw: string) => {
    setDraft(raw);
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    const next = Number(raw);
    if (Number.isFinite(next)) commit(next);
  };

  return (
    <div className={`touch-slider ${className ?? ''}`} style={style}>
      <div
        ref={trackRef}
        className="touch-slider-track"
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={activeValue}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={cancelDrag}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={cancelDrag}
        onKeyDown={handleKeyDown}
      >
        <span className="touch-slider-rail" />
        <span className="touch-slider-fill" style={{ width: `${percent}%` }} />
        <span className="touch-slider-thumb" style={{ left: `${percent}%` }} />
      </div>
      <div className="range-number-wrap" style={numberStyle}>
        <input
          className="range-number"
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft ?? activeValue.toFixed(displayDecimals)}
          onInput={(event) => handleNumberInput((event.target as HTMLInputElement).value)}
          onBlur={() => setDraft(null)}
          aria-label={`${ariaLabel} value`}
        />
        {suffix && <span className="range-number-suffix">{suffix}</span>}
      </div>
    </div>
  );
};

export default TouchSlider;
