import { useEffect, useState } from "react";
import gerdauLogo from "@/assets/gerdau-logo-white.webp";
import grouLogo from "@/assets/grou-logo.png";
import introBg from "@/assets/intro-bg.png";

export function IntroSplash() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !visible) return null;

  return (
    <div
      onClick={() => {
        setLeaving(true);
        setTimeout(() => setVisible(false), 500);
      }}
      className={`fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-[#020617] px-6 transition-opacity duration-500 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Background image with slow Ken Burns pan/zoom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="absolute inset-0 animate-[introBgPan_22s_ease-in-out_infinite]"
          style={{
            backgroundImage: `url(${introBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        {/* Floating particles overlay */}
        {Array.from({ length: 16 }).map((_, i) => (
          <span
            key={i}
            className="absolute block rounded-full"
            style={{
              width: `${4 + (i % 4) * 2}px`,
              height: `${4 + (i % 4) * 2}px`,
              left: `${(i * 73) % 100}%`,
              top: `${(i * 47) % 100}%`,
              background: "#bcd6ff",
              opacity: 0.55,
              boxShadow: "0 0 14px rgba(140,180,255,0.7)",
              animation: `introParticle ${8 + (i % 5) * 2}s ease-in-out ${i * 0.35}s infinite`,
            }}
          />
        ))}
        {/* Legibility gradient: darker at top/bottom, soft vignette around center */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(2,6,23,0.10) 0%, rgba(2,6,23,0.55) 60%, rgba(2,6,23,0.85) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(2,6,23,0.6) 0%, rgba(2,6,23,0.15) 30%, rgba(2,6,23,0.15) 70%, rgba(2,6,23,0.7) 100%)",
          }}
        />
        {/* Central blur disc for readability behind logos & text */}
        <div
          className="absolute left-1/2 top-1/2 h-[560px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] backdrop-blur-2xl md:h-[680px] md:w-[1100px]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(2,6,23,0.55) 0%, rgba(2,6,23,0.35) 45%, rgba(2,6,23,0) 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, #000 35%, transparent 75%)",
            maskImage:
              "radial-gradient(ellipse at center, #000 35%, transparent 75%)",
          }}
        />
      </div>

      {/* Center glow behind the logos/illustration */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 blur-3xl md:h-[680px] md:w-[680px]"
          style={{
            background:
              "radial-gradient(circle, rgba(140,180,255,0.40), rgba(54,88,193,0.20) 45%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative flex w-full max-w-[92vw] items-center justify-center gap-4 md:gap-14">
        <img
          src={grouLogo}
          alt="Grou"
          className="h-10 w-auto translate-y-[3px] opacity-0 brightness-0 invert drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)] md:h-24 md:translate-y-[7px] animate-[introLogoLeft_900ms_ease-out_200ms_forwards]"
        />
        <div
          className="h-8 w-px bg-white/40 opacity-0 md:h-20 animate-[introDivider_600ms_ease-out_900ms_forwards]"
          aria-hidden
        />
        <img
          src={gerdauLogo}
          alt="Gerdau"
          className="h-14 w-auto max-w-[45vw] object-contain opacity-0 drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)] md:h-32 md:max-w-none animate-[introLogoRight_900ms_ease-out_200ms_forwards]"
        />
      </div>

      <div className="relative mt-12 max-w-3xl text-center opacity-0 animate-[introFadeUp_700ms_ease-out_1000ms_forwards]">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-white/75 drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
          Análise comportamental · Segurança do trabalho
        </p>
        <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)] md:text-4xl">
          Compatibilidade com o cargo{" "}
          <span className="text-[#9ec5ff]">×</span> ocorrências de segurança
        </h1>
      </div>

      <p className="absolute bottom-8 text-[11px] uppercase tracking-widest text-white/70 opacity-0 animate-[introFadeUp_500ms_ease-out_2600ms_forwards]">
        toque para continuar
      </p>

      <style>{`
        @keyframes introBgPan {
          0%, 100% { transform: scale(1.08) translate(0, 0); }
          50%      { transform: scale(1.16) translate(-1.5%, -1%); }
        }
        @keyframes introParticle {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.25; }
          50%      { transform: translateY(-22px) translateX(8px); opacity: 0.85; }
        }
        @keyframes introLogoLeft {
          0% { opacity: 0; transform: translateX(-24px) scale(0.96); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes introLogoRight {
          0% { opacity: 0; transform: translateX(24px) scale(0.96); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes introDivider {
          0% { opacity: 0; transform: scaleY(0); }
          100% { opacity: 1; transform: scaleY(1); }
        }
        @keyframes introFadeUp {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes introFloat {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50% { transform: translateY(-10px) rotate(1deg); }
        }
        .intro-anim svg { width: 100%; height: 100%; overflow: visible; }
        .intro-anim svg > g > g {
          transform-box: fill-box;
          transform-origin: center;
          opacity: 0;
          animation: introItemIn 700ms cubic-bezier(0.22, 1, 0.36, 1) forwards,
                     introItemPulse 4s ease-in-out infinite;
        }
        @keyframes introItemIn {
          0%   { opacity: 0; transform: scale(0.6) translateY(14px) rotate(-6deg); }
          60%  { opacity: 1; transform: scale(1.06) translateY(-2px) rotate(2deg); }
          100% { opacity: 1; transform: scale(1) translateY(0) rotate(0); }
        }
        @keyframes introItemPulse {
          0%, 100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-4px) scale(1.02); }
        }
        .intro-anim svg > g > g:nth-child(1)  { animation-delay: 1500ms, 2400ms; }
        .intro-anim svg > g > g:nth-child(2)  { animation-delay: 1580ms, 2480ms; }
        .intro-anim svg > g > g:nth-child(3)  { animation-delay: 1660ms, 2560ms; }
        .intro-anim svg > g > g:nth-child(4)  { animation-delay: 1740ms, 2640ms; }
        .intro-anim svg > g > g:nth-child(5)  { animation-delay: 1820ms, 2720ms; }
        .intro-anim svg > g > g:nth-child(6)  { animation-delay: 1900ms, 2800ms; }
        .intro-anim svg > g > g:nth-child(7)  { animation-delay: 1980ms, 2880ms; }
        .intro-anim svg > g > g:nth-child(8)  { animation-delay: 2060ms, 2960ms; }
        .intro-anim svg > g > g:nth-child(9)  { animation-delay: 2140ms, 3040ms; }
        .intro-anim svg > g > g:nth-child(10) { animation-delay: 2220ms, 3120ms; }
        .intro-anim svg > g > g:nth-child(11) { animation-delay: 2300ms, 3200ms; }
        .intro-anim svg > g > g:nth-child(12) { animation-delay: 2380ms, 3280ms; }
        .intro-anim svg > g > g:nth-child(13) { animation-delay: 2460ms, 3360ms; }
        .intro-anim svg > g > g:nth-child(14) { animation-delay: 2540ms, 3440ms; }
        .intro-anim svg > g > g:nth-child(15) { animation-delay: 2620ms, 3520ms; }
        .intro-anim svg > g > g:nth-child(16) { animation-delay: 2700ms, 3600ms; }
        .intro-anim svg > g > g:nth-child(17) { animation-delay: 2780ms, 3680ms; }
        .intro-anim svg > g > g:nth-child(18) { animation-delay: 2860ms, 3760ms; }
      `}</style>
    </div>
  );
}