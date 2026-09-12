"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./homepage-templates.module.css";

type GalleryState = { canScroll: boolean; index: number };

export function HomepageTemplateGallery({ children, labels }: { children: ReactNode; labels: string[] }) {
  const galleryRef = useRef<HTMLDivElement>(null);
  const galleryId = useId();
  const hintId = useId();
  const [position, setPosition] = useState<GalleryState>({ canScroll: false, index: 0 });

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;

    let frame = 0;
    const measure = () => {
      const items = Array.from(gallery.children) as HTMLElement[];
      const maxScroll = Math.max(0, gallery.scrollWidth - gallery.clientWidth);
      const firstLeft = items[0]?.getBoundingClientRect().left ?? 0;
      let index = 0;
      let distance = Infinity;

      items.forEach((item, itemIndex) => {
        const target = Math.min(maxScroll, item.getBoundingClientRect().left - firstLeft);
        const delta = Math.abs(gallery.scrollLeft - target);
        if (delta < distance) {
          index = itemIndex;
          distance = delta;
        }
      });

      setPosition((current) => current.canScroll === (maxScroll > 2) && current.index === index
        ? current
        : { canScroll: maxScroll > 2, index });
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(gallery);
    for (const item of gallery.children) observer.observe(item);
    gallery.addEventListener("scroll", scheduleMeasure, { passive: true });
    scheduleMeasure();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      gallery.removeEventListener("scroll", scheduleMeasure);
    };
  }, []);

  function goTo(index: number) {
    const gallery = galleryRef.current;
    const first = gallery?.children[0];
    const item = gallery?.children[Math.max(0, Math.min(labels.length - 1, index))];
    if (!gallery || !first || !item || !position.canScroll) return;

    const left = Math.min(
      gallery.scrollWidth - gallery.clientWidth,
      item.getBoundingClientRect().left - first.getBoundingClientRect().left,
    );
    gallery.scrollTo({
      left,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!position.canScroll || event.target !== event.currentTarget) return;
    const indexes: Record<string, number> = {
      ArrowLeft: position.index - 1,
      ArrowRight: position.index + 1,
      Home: 0,
      End: labels.length - 1,
    };
    if (!(event.key in indexes)) return;
    event.preventDefault();
    goTo(indexes[event.key]);
  }

  return (
    <div className={styles.galleryFrame}>
      <div className={styles.galleryControls} hidden={!position.canScroll}>
        <div className={styles.galleryGuide}>
          <p id={hintId}>左右滑动，找到适合你的阅读节奏</p>
          <span className={styles.galleryPosition} aria-live="polite" aria-atomic="true">
            <span className={styles.galleryCount}>{position.index + 1} / {labels.length}</span>
            {labels[position.index]}
          </span>
        </div>
        <div className={styles.galleryArrows}>
          <button
            type="button"
            aria-label="查看上一种版式"
            aria-controls={galleryId}
            disabled={!position.canScroll || position.index === 0}
            onClick={() => goTo(position.index - 1)}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="查看下一种版式"
            aria-controls={galleryId}
            disabled={!position.canScroll || position.index === labels.length - 1}
            onClick={() => goTo(position.index + 1)}
          >
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={galleryRef}
        id={galleryId}
        className={styles.gallery}
        role="group"
        aria-label="三种现有简历版式示例"
        aria-describedby={position.canScroll ? hintId : undefined}
        tabIndex={position.canScroll ? 0 : undefined}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
