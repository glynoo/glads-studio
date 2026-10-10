import { useCallback, useEffect, useRef, useState } from "react";
import { reviewApi } from "../services/reviewApi.js";

export default function useMaterialPool(userId) {
  const [state, setState] = useState({
    caves: [],
    favorites: [],
    projects: [],
    tags: [],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const live = useRef(false);
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await reviewApi.poolState();
      if (live.current) setState(next);
    } catch (reason) {
      if (live.current) setError(reason.message);
    } finally {
      if (live.current) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    live.current = true;
    reload();
    return () => {
      live.current = false;
    };
  }, [reload]);
  async function change(value) {
    const next = await reviewApi.changePool(value);
    if (live.current) setState(next);
    return next;
  }
  return { ...state, error, loading, reload, change, setState };
}
