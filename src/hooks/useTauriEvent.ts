import { useEffect } from "react";
import { listenEvent, TAURI_EVENTS } from "../lib/tauri/events";

export function useTauriEvent<T>(
  event: (typeof TAURI_EVENTS)[keyof typeof TAURI_EVENTS],
  handler: (payload: T) => void,
) {
  useEffect(() => {
    let unlisten: () => void = () => {};
    void listenEvent<T>(event, handler).then((cleanup) => { unlisten = cleanup; });
    return () => unlisten();
  }, [event, handler]);
}
