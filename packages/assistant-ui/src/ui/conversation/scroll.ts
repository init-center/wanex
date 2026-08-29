import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from "react";

const NEAR_LATEST_THRESHOLD_PX = 64;

export interface ConversationScrollOwnershipOptions {
  readonly sessionKey: string;
  readonly canonicalRevision: string;
  readonly transientRevision?: string;
}

export interface ConversationScrollOwnership {
  readonly viewportRef: RefObject<HTMLDivElement | null>;
  readonly contentRef: RefObject<HTMLDivElement | null>;
  readonly showJumpToLatest: boolean;
  readonly handleScroll: (event: ReactUIEvent<HTMLDivElement>) => void;
  readonly jumpToLatest: () => void;
  readonly prepareForHistoryPrepend: () => void;
  readonly cancelHistoryPrepend: () => void;
}

export function useConversationScrollOwnership({
  sessionKey,
  canonicalRevision,
  transientRevision,
}: ConversationScrollOwnershipOptions): ConversationScrollOwnership {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const activeSessionKey = useRef<string | undefined>(undefined);
  const followLatest = useRef(true);
  const prependAnchor = useRef<{
    readonly scrollHeight: number;
    readonly scrollTop: number;
  } | undefined>(undefined);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const updateJumpVisibility = useCallback((visible: boolean) => {
    setShowJumpToLatest((current) => current === visible ? current : visible);
  }, []);

  const maintainScrollPosition = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    if (followLatest.current) {
      viewport.scrollTop = viewport.scrollHeight;
      updateJumpVisibility(false);
      return;
    }
    updateJumpVisibility(!isNearLatest(viewport));
  }, [updateJumpVisibility]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    if (activeSessionKey.current !== sessionKey) {
      activeSessionKey.current = sessionKey;
      followLatest.current = true;
      viewport.scrollTop = viewport.scrollHeight;
      updateJumpVisibility(false);
      return;
    }
    if (prependAnchor.current !== undefined) {
      const anchor = prependAnchor.current;
      prependAnchor.current = undefined;
      followLatest.current = false;
      viewport.scrollTop =
        anchor.scrollTop + (viewport.scrollHeight - anchor.scrollHeight);
      updateJumpVisibility(!isNearLatest(viewport));
      return;
    }
    maintainScrollPosition();
  }, [canonicalRevision, maintainScrollPosition, sessionKey, transientRevision, updateJumpVisibility]);

  useEffect(() => {
    const content = contentRef.current;
    if (content === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => maintainScrollPosition());
    observer.observe(content);
    return () => observer.disconnect();
  }, [maintainScrollPosition, sessionKey]);

  const handleScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    const nearLatest = isNearLatest(event.currentTarget);
    followLatest.current = nearLatest;
    updateJumpVisibility(!nearLatest);
  }, [updateJumpVisibility]);

  const jumpToLatest = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    followLatest.current = true;
    viewport.scrollTop = viewport.scrollHeight;
    updateJumpVisibility(false);
  }, [updateJumpVisibility]);

  const prepareForHistoryPrepend = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    prependAnchor.current = {
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
    };
  }, []);

  const cancelHistoryPrepend = useCallback(() => {
    prependAnchor.current = undefined;
  }, []);

  return {
    viewportRef,
    contentRef,
    showJumpToLatest,
    handleScroll,
    jumpToLatest,
    prepareForHistoryPrepend,
    cancelHistoryPrepend,
  };
}

function isNearLatest(viewport: HTMLDivElement): boolean {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <=
    NEAR_LATEST_THRESHOLD_PX;
}
