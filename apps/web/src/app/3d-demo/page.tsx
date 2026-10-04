"use client";

import React, { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import CanvasScene from "../../components/CanvasScene/CanvasScene";
import MagneticCursor from "../../components/MagneticCursor/MagneticCursor";

gsap.registerPlugin(ScrollTrigger);

const workflowSteps = [
  {
    index: "01",
    title: "Map the biological target",
    text: "Start with structural evidence from PDB and define the molecular context that guides each screening decision.",
    accent: "#705d9d",
  },
  {
    index: "02",
    title: "Build compound evidence",
    text: "Connect ChEMBL bioactivity data and ZINC libraries to create an informed candidate space for exploration.",
    accent: "#5f4b88",
  },
  {
    index: "03",
    title: "Prioritize the next experiment",
    text: "Use docking, similarity analysis and ADMET profiling to focus experimental effort on the most promising compounds.",
    accent: "#315c82",
  },
];

const capabilities = [
  ["Structural context", "PDB target exploration and molecular structure retrieval."],
  ["Compound intelligence", "ChEMBL activity evidence and ZINC candidate libraries in one workflow."],
  ["Decision support", "Similarity, docking and ADMET analysis for evidence-based prioritization."],
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs font-bold tracking-[0.18em] uppercase"
      style={{ color: "#705d9d" }}
    >
      {children}
    </p>
  );
}

export default function Demo3DPage() {
  const pageRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const heroItems = pageRef.current?.querySelectorAll<HTMLElement>("[data-hero-item]");
    if (heroItems?.length) {
      gsap.fromTo(
        heroItems,
        { y: 28, opacity: 0, filter: "blur(8px)" },
        { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.85, stagger: 0.12, ease: "power3.out", delay: 0.18 }
      );
    }

    pageRef.current?.querySelectorAll<HTMLElement>(".scene-reveal").forEach((element) => {
      gsap.fromTo(
        element,
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.85,
          ease: "power3.out",
          scrollTrigger: { trigger: element, start: "top 84%", once: true },
        }
      );
    });
  }, { scope: pageRef });

  return (
    <main ref={pageRef} id="scroll-container" className="relative isolate overflow-x-clip text-[#34274c]" style={{ cursor: "none" }}>
      <MagneticCursor />
      <CanvasScene />

      <section id="overview" className="relative z-10 flex min-h-screen flex-col overflow-hidden">
        <nav className="flex items-center justify-between px-6 py-6 md:px-10 md:py-7">
          <Link href="#overview" className="flex items-center gap-3" aria-label="BioMolExplorer overview">
            <span
              className="grid h-9 w-9 place-items-center rounded-full text-base font-bold text-white shadow-lg"
              style={{ background: "linear-gradient(135deg, #47366d, #9686de)", boxShadow: "0 0 20px rgba(150,134,222,0.3)" }}
            >
              B
            </span>
            <span className="text-base font-semibold tracking-tight text-[#34274c]/90 md:text-lg">BioMolExplorer</span>
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            {[
              ["Workflow", "#workflow"],
              ["Research", "#research"],
              ["Access", "#access"],
            ].map(([label, href]) => (
              <a key={href} href={href} data-magnetic className="text-sm font-medium text-[#34274c]/60 transition-colors hover:text-[#34274c]">
                {label}
              </a>
            ))}
          </div>

          <Link
            href="/login"
            data-magnetic
            className="rounded-full px-4 py-2 text-sm font-semibold transition-all hover:bg-white/30 md:px-5"
            style={{ border: "1px solid rgba(71,54,109,0.32)", background: "rgba(255,255,255,0.2)" }}
          >
            Sign in
          </Link>
        </nav>

        <div className="flex flex-1 items-center px-6 pb-24 pt-8 md:px-12 md:pt-0">
          <div className="max-w-2xl" style={{ perspective: "1000px" }}>
            <div
              data-hero-item
              className="mb-7 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold tracking-[0.14em] uppercase"
              style={{ border: "1px solid rgba(71,54,109,0.25)", background: "rgba(255,255,255,0.24)", color: "#47366d" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
              Neurodegenerative drug discovery
            </div>

            <h1 data-hero-item className="mb-7 text-6xl font-black leading-[0.9] tracking-[-0.055em] md:text-8xl lg:text-[7.2rem]">
              <span className="block bg-gradient-to-b from-[#34274c] to-[#5d506f] bg-clip-text text-transparent">Molecular clarity</span>
              <span className="block bg-gradient-to-r from-[#47366d] via-[#705d9d] to-[#9686de] bg-clip-text text-transparent">for the next discovery.</span>
            </h1>

            <p data-hero-item className="max-w-xl text-base font-light leading-relaxed text-[#34274c]/70 md:text-lg">
              BioMolExplorer connects biological targets, compound evidence, molecular docking and ADMET profiling to help researchers prioritize the next therapeutic hypothesis.
            </p>

            <div data-hero-item className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                data-magnetic
                className="rounded-full px-7 py-3.5 text-sm font-bold text-white transition-transform hover:scale-105"
                style={{ background: "linear-gradient(135deg, #47366d, #9686de)", boxShadow: "0 0 38px rgba(150,134,222,0.3)" }}
              >
                Start exploring →
              </Link>
              <a href="#workflow" data-magnetic className="rounded-full border border-[#47366d]/20 bg-white/20 px-7 py-3.5 text-sm font-semibold text-[#34274c]/85 transition-colors hover:bg-white/35">
                Explore the workflow
              </a>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-center text-[0.63rem] font-medium tracking-[0.18em] text-[#34274c]/50 uppercase">
          <span>Scroll to follow the workflow</span>
          <span className="h-12 w-px bg-gradient-to-b from-[#b9afea]/70 to-transparent" />
        </div>
        <div className="absolute bottom-8 right-7 hidden text-[0.63rem] font-medium tracking-[0.16em] text-[#34274c]/45 uppercase md:block">Move · scroll to travel</div>
      </section>

      <section id="workflow" className="relative z-10 flex min-h-screen items-center px-6 py-24 md:px-12">
        <div className="ml-auto w-full max-w-5xl">
          <div className="scene-reveal max-w-xl">
            <SectionLabel>One connected workflow</SectionLabel>
            <h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.04em] md:text-6xl">
              Evidence in.<br />
              <span className="bg-gradient-to-r from-[#47366d] to-[#705d9d] bg-clip-text text-transparent">Better decisions out.</span>
            </h2>
            <p className="mt-6 text-base leading-relaxed text-[#34274c]/70">
              Move from target context to candidate prioritization without losing the biological rationale behind each decision.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3 md:gap-5">
            {workflowSteps.map((step) => (
              <article
                key={step.index}
                className="scene-reveal group rounded-3xl p-6 transition duration-300 hover:-translate-y-2"
                style={{ border: "1px solid rgba(71,54,109,0.16)", background: "linear-gradient(145deg, rgba(246,244,248,0.74), rgba(222,220,227,0.58))", backdropFilter: "blur(12px)", boxShadow: "0 18px 45px rgba(71,54,109,0.1)" }}
              >
                <p className="text-xs font-bold tracking-[0.16em]" style={{ color: step.accent }}>{step.index}</p>
                <h3 className="mt-10 text-xl font-bold tracking-[-0.025em]">{step.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-[#34274c]/68">{step.text}</p>
                <div className="mt-8 h-px w-full origin-left bg-gradient-to-r from-[#9686de] to-transparent transition-transform duration-500 group-hover:scale-x-110" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="research" className="relative z-10 flex min-h-screen items-center px-6 py-24 md:px-12">
        <div className="w-full max-w-2xl">
          <div className="scene-reveal">
            <SectionLabel>Built for focused research</SectionLabel>
            <h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.04em] md:text-6xl">
              Follow the evidence.<br />
              <span className="text-[#34274c]/68">Prioritize with purpose.</span>
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#34274c]/70">
              Neurodegenerative research requires a clear path from molecular data to an experimentally useful short list. BioMolExplorer keeps that path connected.
            </p>
          </div>

          <div className="scene-reveal mt-10 divide-y divide-[#47366d]/12 rounded-3xl border border-[#47366d]/15 bg-[#f1eff4]/65 px-6 shadow-[0_18px_45px_rgba(71,54,109,0.1)] backdrop-blur-sm">
            {capabilities.map(([title, description], index) => (
              <div key={title} className="grid gap-2 py-5 sm:grid-cols-[2.2rem_1fr] sm:gap-5">
                <span className="font-mono text-sm" style={{ color: "#705d9d" }}>0{index + 1}</span>
                <div>
                  <h3 className="font-bold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[#34274c]/65">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="access" className="relative z-10 flex min-h-screen items-center justify-center px-6 py-24 text-center md:px-12">
        <div className="scene-reveal max-w-4xl">
          <SectionLabel>Ready to continue?</SectionLabel>
          <h2 className="mt-5 text-5xl font-black leading-[0.98] tracking-[-0.05em] md:text-8xl">
            Turn molecular evidence<br />into the next experiment.
          </h2>
          <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-[#34274c]/70">
            Access your research workspace and continue building an evidence-driven path toward new neurodegenerative therapies.
          </p>
          <Link
            href="/login"
            data-magnetic
            className="mt-10 inline-flex rounded-full px-9 py-4 text-sm font-bold text-white transition-transform hover:scale-105"
            style={{ background: "linear-gradient(135deg, #47366d, #705d9d, #9686de)", boxShadow: "0 0 55px rgba(150,134,222,0.3)" }}
          >
            Sign in to your workspace →
          </Link>
          <p className="mt-14 text-xs tracking-[0.16em] text-[#34274c]/40 uppercase">BioMolExplorer · molecular research workflow</p>
        </div>
      </section>
    </main>
  );
}
