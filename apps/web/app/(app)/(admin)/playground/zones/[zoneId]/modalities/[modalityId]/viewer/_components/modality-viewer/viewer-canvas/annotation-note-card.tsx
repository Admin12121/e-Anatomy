import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  ViewerAnnotation,
  ViewerStructure,
} from "@/lib/playground/types";
import { cn } from "@/lib/utils";

import { clamp } from "../utils";
import type { PlacedAnnotationLabel } from "./annotation-layout";
import { VIEWER_ANNOTATION_INTERACTION_PROPS } from "./helpers";
import styles from "./annotation-note-card.module.css";

type AnnotationNoteCardProps = {
  annotation: ViewerAnnotation;
  label: PlacedAnnotationLabel;
  onHoverChange: (hovered: boolean, pointerType: string) => void;
  onSelect: () => void;
  stageHeight: number;
  stageWidth: number;
  structure: ViewerStructure;
  visible: boolean;
};

const MAX_CARD_HEIGHT = 400;
// The popup is a preview; the full explanation opens in the sidebar.
const BODY_PREVIEW_HEIGHT = 168;
const MORE_BAR_HEIGHT = 34;
const SAFE_GAP = 10;
const RESERVED_TOP = 64;
const LABEL_RENDER_PADDING = 4;
const SHIFT_OFFSET = 6;

export function AnnotationNoteCard({
  annotation,
  label,
  onHoverChange,
  onSelect,
  stageHeight,
  stageWidth,
  structure,
  visible,
}: AnnotationNoteCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [naturalHeight, setNaturalHeight] = useState(240);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const element = cardRef.current;

    if (!element) {
      return;
    }

    const measure = () => {
      const header = element.querySelector<HTMLElement>("[data-note-header]");
      const subtitle = element.querySelector<HTMLElement>(
        "[data-note-subtitle]",
      );
      const body = element.querySelector<HTMLElement>("[data-note-body]");
      const bodyHeight = body?.scrollHeight ?? 0;
      const clipped = bodyHeight > BODY_PREVIEW_HEIGHT;
      const measured =
        10 +
        (header?.offsetHeight ?? 0) +
        (subtitle?.offsetHeight ?? 0) +
        Math.min(bodyHeight, BODY_PREVIEW_HEIGHT) +
        (clipped ? MORE_BAR_HEIGHT : 0);

      // ResizeObserver drives subsequent measurements; this initial synchronous
      // measurement avoids a visible card jump on first hover.
      setNaturalHeight(Math.max(96, measured));
      setClipped(clipped);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    const body = element.querySelector<HTMLElement>("[data-note-body]");
    if (body) {
      observer.observe(body);
    }

    return () => observer.disconnect();
  }, [annotation.id, structure.id]);

  const geometry = useMemo(() => {
    const positionY = clamp(label.y - LABEL_RENDER_PADDING, 0, stageHeight);
    const labelEndY = clamp(label.y + label.height, 0, stageHeight);
    const requestedHeight = Math.min(
      Math.max(96, naturalHeight),
      MAX_CARD_HEIGHT,
    );
    const roomBelow = stageHeight - positionY;
    const roomAbove = Math.max(0, labelEndY - RESERVED_TOP);

    let vertical: "above" | "below" = "below";
    let maxHeight = requestedHeight;

    if (roomBelow > requestedHeight + SAFE_GAP) {
      vertical = "below";
    } else if (roomAbove > requestedHeight + SAFE_GAP) {
      vertical = "above";
    } else {
      vertical = roomAbove > roomBelow ? "above" : "below";
      maxHeight = Math.max(
        96,
        Math.min(
          requestedHeight,
          Math.max(roomBelow, roomAbove) - SAFE_GAP,
        ),
      );
    }

    const renderedHeight = Math.min(naturalHeight, maxHeight);
    const top =
      vertical === "above"
        ? clamp(
            labelEndY - renderedHeight + SHIFT_OFFSET,
            SAFE_GAP,
            Math.max(SAFE_GAP, stageHeight - renderedHeight - SAFE_GAP),
          )
        : clamp(
            positionY + 1,
            SAFE_GAP,
            Math.max(SAFE_GAP, stageHeight - renderedHeight - SAFE_GAP),
          );
    // The information card replaces only the text side of the active rail.
    // Its inner edge is pinned to the label tick (`-|`) so it never covers the
    // anatomical leader running from the scan to the rail.
    const preferredWidth = clamp(stageWidth * 0.22, 240, 360);
    const outwardAvailable =
      label.sideResolved === "right"
        ? Math.max(0, stageWidth - label.tickX - SAFE_GAP)
        : Math.max(0, label.tickX - SAFE_GAP);
    const width = Math.max(
      1,
      Math.min(preferredWidth, outwardAvailable, stageWidth - SAFE_GAP * 2),
    );
    const left =
      label.sideResolved === "right"
        ? clamp(label.tickX, SAFE_GAP, Math.max(SAFE_GAP, stageWidth - width - SAFE_GAP))
        : clamp(label.tickX - width, SAFE_GAP, Math.max(SAFE_GAP, stageWidth - width - SAFE_GAP));
    const style: CSSProperties = { left, maxHeight, top, width };

    return { style, vertical };
  }, [label, naturalHeight, stageHeight, stageWidth]);

  const title = annotation.titleOverride || structure.title;
  const description =
    structure.shortDescription || structure.longDescription || annotation.note;
  const learningPoints = structure.learningPoints.filter(
    (point) => !point.startsWith("interaction:"),
  );

  return (
    <article
      ref={cardRef}
      {...VIEWER_ANNOTATION_INTERACTION_PROPS}
      data-note-card=""
      className={cn(
        styles.card,
        visible && styles.visible,
      )}
      style={{
        ...geometry.style,
        borderColor: label.color,
      }}
      onPointerEnter={(event) => onHoverChange(true, event.pointerType)}
      onPointerLeave={(event) => onHoverChange(false, event.pointerType)}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        window.setTimeout(onSelect, 0);
      }}
    >
      {geometry.vertical === "below" ? (
        <header className={styles.header} data-note-header>
          <span>{title}</span>
          {structure.accessLevel === "subscription" ? (
            <span className={styles.lock} aria-label="Subscription content">
              🔒
            </span>
          ) : null}
        </header>
      ) : null}

      {structure.latinName ? (
        <div className={styles.subtitle} data-note-subtitle>
          <span className={styles.glyph}>◔</span>
          <em>{structure.latinName}</em>
        </div>
      ) : null}

      <div className={styles.bodyFrame}>
      <div
        className={styles.body}
        data-note-body
        style={{ maxHeight: BODY_PREVIEW_HEIGHT }}
      >
        {description ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {description}
          </ReactMarkdown>
        ) : (
          <p>{title}</p>
        )}

        {learningPoints.length > 0 ? (
          <>
            <div className={styles.learningHeading}>Anatomical relations</div>
            <ul>
              {learningPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </>
        ) : null}

        {annotation.note && annotation.note !== description ? (
          <div className={styles.note}>{annotation.note}</div>
        ) : null}
      </div>
      {clipped ? <div aria-hidden="true" className={styles.fade} /> : null}
      </div>

      {clipped ? (
        <div className={styles.moreBar}>
          <button
            type="button"
            className={styles.more}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
          >
            Show more
          </button>
        </div>
      ) : null}

      {geometry.vertical === "above" ? (
        <header
          className={cn(styles.header, styles.bottomHeader)}
          data-note-header
        >
          <span>{title}</span>
          {structure.accessLevel === "subscription" ? (
            <span className={styles.lock} aria-label="Subscription content">
              🔒
            </span>
          ) : null}
        </header>
      ) : null}
    </article>
  );
}
