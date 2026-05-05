import { useEffect, useState } from "react";

export function useStatsData<T>(url: string): { data: T | null; loading: boolean; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url, tick]);

  return { data, loading, refetch: () => setTick((t) => t + 1) };
}

export function periodToDates(period: string): { dateFrom: string; dateTo: string } {
  if (period.startsWith("custom|")) {
    const parts = period.split("|");
    return { 
       dateFrom: parts[1] || "2000-01-01", 
       dateTo: parts[2] || new Date().toISOString().slice(0, 10) 
    };
  }
  if (period === "all") {
    return { dateFrom: "2000-01-01", dateTo: new Date().toISOString().slice(0, 10) };
  }
  const days = parseInt(period) || 14;
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: fmt(from), dateTo: fmt(to) };
}
