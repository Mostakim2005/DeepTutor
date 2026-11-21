import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedExportMessage } from "@/lib/export";

export interface ExportSelectionStats {
  total: number;
  userCount: number;
  assistantCount: number;
  selectedCount: number;
  selectedUserCount: number;
  selectedAssistantCount: number;
  thinkingCount: number;
  toolCallCount: number;
  tableCount: number;
  sourceCount: number;
  artifactCount: number;
}

export interface UseExportSelectionResult {
  selectedIds: Set<string | number>;
  expandedPreviewIds: Set<string | number>;
  stats: ExportSelectionStats;
  handleSelectAll: () => void;
  handleSelectNone: () => void;
  handleSelectOnlyUser: () => void;
  handleSelectOnlyAssistant: () => void;
  handleInvertSelection: () => void;
  handleToggleMessage: (index: number, id: string | number, shiftKey: boolean) => void;
  togglePreview: (id: string | number) => void;
}

export function useExportSelection(
  normalizedList: NormalizedExportMessage[],
  open: boolean,
  onOpenFocus?: () => void,
  initialSelectedIds?: Array<string | number>,
): UseExportSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(() => {
    if (initialSelectedIds && initialSelectedIds.length > 0) {
      return new Set(initialSelectedIds);
    }
    return new Set(normalizedList.map((m) => m.id));
  });
  const [expandedPreviewIds, setExpandedPreviewIds] = useState<Set<string | number>>(
    new Set(),
  );
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // The modal stays mounted while closed, so a selection made in one
  // conversation would otherwise leak into the next one and export nothing.
  // Reseed only on the closed -> open transition, never on every render,
  // otherwise the user could not deselect anything.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    if (initialSelectedIds && initialSelectedIds.length > 0) {
      setSelectedIds(new Set(initialSelectedIds));
    } else {
      setSelectedIds(new Set(normalizedList.map((m) => m.id)));
    }
    setLastClickedIndex(null);
    setExpandedPreviewIds(new Set());
    onOpenFocus?.();
  }, [open, normalizedList, initialSelectedIds, onOpenFocus]);

  const stats = useMemo<ExportSelectionStats>(() => {
    let userCount = 0;
    let assistantCount = 0;
    let selectedCount = 0;
    let selectedUserCount = 0;
    let selectedAssistantCount = 0;
    let thinkingCount = 0;
    let toolCallCount = 0;
    let tableCount = 0;
    let sourceCount = 0;
    let artifactCount = 0;

    for (const m of normalizedList) {
      const isSelected = selectedIds.has(m.id);
      if (m.role === "user") {
        userCount++;
        if (isSelected) selectedUserCount++;
      } else {
        assistantCount++;
        if (isSelected) selectedAssistantCount++;
      }

      if (isSelected) {
        selectedCount++;
        if (m.thinking) thinkingCount++;
        if (m.toolCalls) toolCallCount += m.toolCalls.length;
        if (m.tables) tableCount += m.tables.length;
        if (m.sources) sourceCount += m.sources.length;
        if (m.artifacts) artifactCount += m.artifacts.length;
      }
    }

    return {
      total: normalizedList.length,
      userCount,
      assistantCount,
      selectedCount,
      selectedUserCount,
      selectedAssistantCount,
      thinkingCount,
      toolCallCount,
      tableCount,
      sourceCount,
      artifactCount,
    };
  }, [normalizedList, selectedIds]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(normalizedList.map((m) => m.id)));
  }, [normalizedList]);

  const handleSelectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleSelectOnlyUser = useCallback(() => {
    setSelectedIds(
      new Set(normalizedList.filter((m) => m.role === "user").map((m) => m.id)),
    );
  }, [normalizedList]);

  const handleSelectOnlyAssistant = useCallback(() => {
    setSelectedIds(
      new Set(normalizedList.filter((m) => m.role === "assistant").map((m) => m.id)),
    );
  }, [normalizedList]);

  const handleInvertSelection = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set<string | number>();
      for (const m of normalizedList) {
        if (!prev.has(m.id)) {
          next.add(m.id);
        }
      }
      return next;
    });
  }, [normalizedList]);

  const handleToggleMessage = useCallback(
    (index: number, id: string | number, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);

        if (shiftKey && lastClickedIndex !== null) {
          const start = Math.min(lastClickedIndex, index);
          const end = Math.max(lastClickedIndex, index);
          const shouldSelect = !prev.has(id);

          for (let i = start; i <= end; i++) {
            const item = normalizedList[i];
            if (item) {
              if (shouldSelect) next.add(item.id);
              else next.delete(item.id);
            }
          }
        } else if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }

        return next;
      });

      setLastClickedIndex(index);
    },
    [lastClickedIndex, normalizedList],
  );

  const togglePreview = useCallback((id: string | number) => {
    setExpandedPreviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return {
    selectedIds,
    expandedPreviewIds,
    stats,
    handleSelectAll,
    handleSelectNone,
    handleSelectOnlyUser,
    handleSelectOnlyAssistant,
    handleInvertSelection,
    handleToggleMessage,
    togglePreview,
  };
}
