"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./homepage-experience.module.css";

export function HomepageExperience({ children, className }: { children: ReactNode; className: string }) {
  const rootRef = useRef<HTMLElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const visited = new WeakSet<HTMLElement>();
    const animations = new Map<HTMLElement, Animation>();
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('nav[aria-label="首页内容导航"] a[href^="#"]'));
    const sections = links.map((link) => ({ link, section: root.querySelector<HTMLElement>(link.hash) }));
    let frame = 0;

    function reveal(element: HTMLElement) {
      if (visited.has(element)) return;
      visited.add(element);
      if (preference.matches || typeof element.animate !== "function" || element.contains(document.activeElement)) return;
      // Content stays visible without JavaScript or animation support.
      const animation = element.animate([
        { opacity: 0, transform: "translateY(16px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], {
        duration: 520,
        delay: Math.min(Number(element.dataset.revealDelay) || 0, 160),
        easing: "cubic-bezier(.2,.65,.25,1)",
        fill: "backwards",
      });
      animations.set(element, animation);
      animation.onfinish = () => animations.delete(element);
    }

    const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal(entry.target as HTMLElement);
        observer?.unobserve(entry.target);
      }
    }, { threshold: 0, rootMargin: "0px 0px -24px 0px" }) : null;

    for (const target of targets) {
      const bounds = target.getBoundingClientRect();
      if (bounds.top < window.innerHeight && bounds.bottom > 0) visited.add(target);
      else observer?.observe(target);
    }

    function updateReadingPosition() {
      frame = 0;
      if (!root) return;
      const distance = Math.max(1, root.scrollHeight - window.innerHeight);
      const progress = Math.max(0, Math.min(1, (window.scrollY - root.offsetTop) / distance));
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${progress})`;
      let current: HTMLAnchorElement | undefined;
      for (const { link, section } of sections) {
        if (section && section.getBoundingClientRect().top <= 180) current = link;
      }
      for (const { link } of sections) {
        if (link === current) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    }

    function scheduleUpdate() {
      if (!frame) frame = window.requestAnimationFrame(updateReadingPosition);
    }

    function stopForReducedMotion() {
      if (!preference.matches) return;
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
    }

    function revealFocusedContent(event: FocusEvent) {
      if (!(event.target instanceof HTMLElement)) return;
      let element = event.target.closest<HTMLElement>("[data-reveal]");
      while (element && root?.contains(element)) {
        visited.add(element);
        animations.get(element)?.cancel();
        animations.delete(element);
        observer?.unobserve(element);
        element = element.parentElement?.closest<HTMLElement>("[data-reveal]") ?? null;
      }
    }

    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleUpdate) : null;
    resizeObserver?.observe(root);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    preference.addEventListener("change", stopForReducedMotion);
    root.addEventListener("focusin", revealFocusedContent);
    updateReadingPosition();

    return () => {
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      preference.removeEventListener("change", stopForReducedMotion);
      root.removeEventListener("focusin", revealFocusedContent);
      for (const animation of animations.values()) animation.cancel();
    };
  }, []);

  return <main ref={rootRef} className={className}>
    <div className={styles.readingTrack} aria-hidden="true"><div ref={progressRef} className={styles.readingProgress} /></div>
    {children}
  </main>;
}
