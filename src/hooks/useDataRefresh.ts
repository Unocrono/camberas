import { useCallback, useEffect, useState } from "react";

// Simple event-based system for data refresh notifications
type RefreshEventType = "races" | "distances" | "checkpoints" | "registrations" | "results" | "all";

const listeners: Map<RefreshEventType | "all", Set<() => void>> = new Map();

// Subscribe to refresh events
export const subscribeToRefresh = (eventType: RefreshEventType, callback: () => void) => {
  if (!listeners.has(eventType)) {
    listeners.set(eventType, new Set());
  }
  listeners.get(eventType)!.add(callback);
  
  // Also add to "all" listeners
  if (!listeners.has("all")) {
    listeners.set("all", new Set());
  }
  
  // Return unsubscribe function
  return () => {
    listeners.get(eventType)?.delete(callback);
  };
};

// Trigger refresh for a specific event type
export const triggerRefresh = (eventType: RefreshEventType) => {
  // Notify specific listeners
  listeners.get(eventType)?.forEach((callback) => callback());
  // Also notify "all" listeners
  if (eventType !== "all") {
    listeners.get("all")?.forEach((callback) => callback());
  }
};

// Hook to listen for refresh events
export const useDataRefresh = (
  eventTypes: RefreshEventType[],
  onRefresh: () => void
) => {
  useEffect(() => {
    const unsubscribes = eventTypes.map((eventType) =>
      subscribeToRefresh(eventType, onRefresh)
    );

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [eventTypes, onRefresh]);
};

// Hook to trigger refresh with a simple API
export const useRefreshTrigger = () => {
  const refresh = useCallback((eventType: RefreshEventType) => {
    triggerRefresh(eventType);
  }, []);

  return { refresh };
};
