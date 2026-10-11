"use client";

import { useEffect, useRef, useState } from 'react';

type Props = { src: string; label: string; variant: 'hero' | 'about' };
const BLEND_SECONDS = 0.6;

/** Keep the original encoded films; blend decoded layers instead of recompressing. */
export function HomeFilm({ src, label, variant }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const films = useRef<Array<HTMLVideoElement | null>>([]);
  const active = useRef(0);
  const [loaded, setLoaded] = useState(variant === 'hero');
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => { setReduced(motion.matches); };
    const updateVisibility = () => setHidden(document.hidden);
    updateMotion(); updateVisibility();
    motion.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    const near = new IntersectionObserver(entries => { if (entries[0].isIntersecting) setLoaded(true); }, { rootMargin: '200px' });
    const onScreen = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting), { threshold: 0.01 });
    if (root.current) { near.observe(root.current); onScreen.observe(root.current); }
    return () => { near.disconnect(); onScreen.disconnect(); motion.removeEventListener('change', updateMotion); document.removeEventListener('visibilitychange', updateVisibility); };
  }, []);

  useEffect(() => {
    const pair = films.current;
    const running = loaded && visible && !hidden && !failed && !reduced;
    let cancelled = false;
    let frame = 0;
    let blend: { next: number; started: number | null } | null = null;
    const normalize = () => pair.forEach((video, index) => { if (video) { video.style.opacity = index === active.current ? '1' : '0'; video.style.zIndex = index === active.current ? '1' : '0'; } });
    normalize();
    // A cached/early media error can precede React hydration and its handler.
    if (pair.some(video => video?.error)) {
      pair.forEach(video => video?.pause()); setFailed(true); return;
    }
    if (!running) { pair.forEach(video => video?.pause()); return; }
    const current = pair[active.current];
    if (!current) return;
    const blocked = () => { if (!cancelled) { pair.forEach(video => video?.pause()); } };
    void current.play().catch(blocked);
    const tick = (now: number) => {
      if (cancelled) return;
      const outgoing = pair[active.current];
      if (!outgoing || !Number.isFinite(outgoing.duration)) { frame = requestAnimationFrame(tick); return; }
      const end = outgoing.duration;
      if (!blend && outgoing.currentTime >= end - BLEND_SECONDS) {
        const next = 1 - active.current;
        const incoming = pair[next];
        if (incoming) {
          blend = { next, started: null };
          incoming.currentTime = 0;
          incoming.style.opacity = '0'; incoming.style.zIndex = '2';
          void incoming.play().then(() => { if (!cancelled && blend) blend.started = performance.now(); }).catch(blocked);
        }
      }
      // Hold the last frame if the next decoder is still buffering.
      if (outgoing.currentTime >= end - 0.04) outgoing.pause();
      if (blend?.started !== null && blend?.started !== undefined) {
        const progress = Math.min(1, (now - blend.started) / (BLEND_SECONDS * 1000));
        const incoming = pair[blend.next];
        if (incoming) incoming.style.opacity = String(progress);
        if (progress >= 1) {
          outgoing.pause(); outgoing.style.opacity = '0'; outgoing.style.zIndex = '0';
          active.current = blend.next; blend = null; normalize();
          outgoing.currentTime = 0;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(frame); pair.forEach(video => video?.pause()); normalize(); };
  }, [loaded, visible, hidden, reduced, failed]);

  return <div ref={root} className={`home-film home-film--${variant}`} aria-label={`${label} film`}>
    {[0, 1].map(index => <video key={index} ref={element => { films.current[index] = element; }}
      className="home-film__layer" src={loaded ? src : undefined} muted playsInline
      preload={loaded ? 'auto' : 'none'} aria-hidden="true" disablePictureInPicture
      style={{ opacity: index === 0 ? 1 : 0 }} onError={() => setFailed(true)} />)}
    {failed ? <div className="home-film__fallback"><span>ALTURA</span><p>Video unavailable</p></div> : null}
  </div>;
}
