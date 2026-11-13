"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import styles from "./evidence.module.css";
import { useInView } from "./useInView";

/**
 * Evidence: the headline claim printed with the fields that let you check it, plus a plate
 * for each half of the evaluation design.
 *
 * The component's shape — a claim, a verdict, independent sources, a caveat on each — is
 * the shell's and is exactly right here. Only its subject changed: it described a mined
 * prerequisite edge checked against two learner corpora, and it now describes the measured
 * accuracy checked against walk-forward validation and a once-only holdout.
 *
 * Every figure arrives as a prop from `app/page.tsx`, which reads `metrics.json`. The
 * section renders nothing at all when the service is down — see the call site.
 */
export type PlateData = {
  /** The headline, e.g. the holdout accuracy followed by "on sessions it had never seen". */
  claim: string;
  verdict: string;
  verdictKind: "verified" | "mixed";
  /** The sub-line under the verdict. */
  count: string;
  /** The two ends of the comparison drawn as an arrow. */
  from: string;
  to: string;
  /** The fields that make the claim checkable. */
  fields: { label: string; value: string }[];
  /** One plate per half of the evaluation design. */
  sources: {
    id: string;
    name: string;
    figure: string;
    figureLabel: string;
    caption: string;
    caveat: string;
  }[];
};

export function EvidencePlates({
  id,
  plates,
  href = "/dashboard",
}: {
  id?: string;
  plates: PlateData;
  href?: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef);

  return (
    <section ref={sectionRef} id={id} className={`${styles.section} ${inView ? "" : styles.quiet}`} aria-labelledby="evidence-title">
      <header className={styles.header}>
        <Badge variant="eyebrow" dot>
          Evidence
        </Badge>
        <h2 id="evidence-title" className={styles.title}>
          Every number here was measured, and you can check how.
        </h2>
        <p className={styles.lead}>
          The model was chosen on purged walk-forward folds and then measured once, on a window
          it had never seen. Both halves are below, each with the thing that limits it.
        </p>
      </header>

      <div className={styles.grid}>
        <article className={`${styles.plate} ${styles.wide}`} aria-labelledby="evidence-card-title">
          <div className={styles.plateText}>
            <h3 id="evidence-card-title" className={styles.plateTitle}>
              {plates.claim}
            </h3>
            <p className={styles.verdict} data-kind={plates.verdictKind}>
              {plates.verdict}
            </p>
            {plates.count ? <p className={styles.count}>{plates.count}</p> : null}
            <div className={styles.action}>
              <Button asChild variant="secondary" size="sm">
                <Link href={href}>
                  Read the full model card <ArrowUpRight data-icon="inline-end" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
          <div className={styles.figureWrap}>
            <span className={styles.side} aria-hidden>
              {plates.verdict}
            </span>
            <div className={styles.paper}>
              <div className={styles.edge} aria-hidden>
                <span className={styles.node}>{plates.from}</span>
                <svg className={styles.arrow} width="48" height="12" focusable="false" aria-hidden suppressHydrationWarning>
                  <defs>
                    <marker id="evidence-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                      <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
                    </marker>
                  </defs>
                  <line className={styles.arrowPath} x1="0" y1="6" x2="calc(100% - 8px)" y2="6" markerEnd="url(#evidence-arrowhead)" />
                </svg>
                <span className={styles.node}>{plates.to}</span>
              </div>
              <dl className={styles.fields}>
                <div className={styles.fieldRow}>
                  <dt>Final holdout</dt>
                  <dd>
                    {plates.fields.map((f) => (
                      <span key={f.label}>
                        <em>{f.label}</em> {f.value}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </article>

        {plates.sources.map((s) => (
          <article className={styles.plate} key={s.id} aria-labelledby={`evidence-${s.id}`}>
            <div className={styles.figureWrap}>
              <span className={styles.side} aria-hidden>
                Source
              </span>
              <div className={styles.paper}>
                <p className={styles.figure}>{s.figure}</p>
                <p className={styles.figureLabel}>{s.figureLabel}</p>
              </div>
            </div>
            <div className={styles.plateText}>
              <h3 id={`evidence-${s.id}`} className={styles.plateTitle}>
                {s.name}
              </h3>
              <p className={styles.caption}>{s.caption}</p>
              <p className={styles.caveat}>{s.caveat}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
