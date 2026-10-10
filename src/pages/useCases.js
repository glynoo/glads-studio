import { useEffect, useState } from "react";
import { reviewApi } from "../services/reviewApi.js";

export function useCases() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    reviewApi
      .listCases()
      .then(({ items }) => {
        if (live) {
          setCases(items);
          setError("");
        }
      })
      .catch((reason) => {
        if (live) setError(reason.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  async function refresh() {
    const { items } = await reviewApi.listCases();
    setCases(items);
    setError("");
    return items;
  }

  return { cases, loading, error, refresh };
}
