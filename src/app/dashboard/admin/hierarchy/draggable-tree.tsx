"use client";

import React, { useRef, useState, type MouseEvent } from "react";

// Horizontal click-drag to pan a wide org tree (ported from Clinic 2).
export function DraggableTree({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const startDragging = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !containerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeft(containerRef.current.scrollLeft);
  };
  const stopDragging = () => setIsDragging(false);
  const onDrag = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    containerRef.current.scrollLeft = scrollLeft - walk;
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={startDragging}
      onMouseLeave={stopDragging}
      onMouseUp={stopDragging}
      onMouseMove={onDrag}
      className={`w-full overflow-x-auto pb-10 pt-6 custom-scrollbar ${
        isDragging ? "cursor-grabbing select-none" : "cursor-grab"
      }`}
    >
      <div className="flex min-w-max flex-col items-center px-8">{children}</div>
    </div>
  );
}
