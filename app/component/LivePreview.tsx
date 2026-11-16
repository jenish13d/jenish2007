"use client";

import { useEffect, useState } from "react";

type LiveData = {
  connected: boolean;
  live: boolean;
  message?: string;
  videoId?: string | null;
  title?: string;
  description?: string;
  thumbnail?: string | null;
  watchUrl?: string | null;
  embedUrl?: string | null;
  liveChatId?: string | null;
  startedAt?: string | null;
  status?: string;
};

export default function LivePreview() {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);

  async function checkLive() {
    try {
      const response = await fetch("/api/youtube/live", {
        cache: "no-store",
      });

      const result = await response.json();

      setData(result);
    } catch (error) {
      console.error("LIVE PREVIEW ERROR:", error);

      setData({
        connected: false,
        live: false,
        message: "Unable to check live status",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkLive();

    const interval = setInterval(() => {
      checkLive();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[#334155] bg-[#111827]">
      <div className="flex items-center justify-between border-b border-[#334155] px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A78BFA]">
            Live Preview
          </p>

          <h3 className="mt-1 text-sm font-bold text-[#F8FAFC]">
            YouTube Stream
          </h3>
        </div>

        {data?.live && (
          <div className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />

            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
              LIVE
            </span>
          </div>
        )}
      </div>

      <div className="relative aspect-video bg-[#0A0E1F]">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-[#334155] border-t-[#5B8BFF]" />

              <p className="mt-3 text-xs text-[#94A3B8]">
                Checking live status...
              </p>
            </div>
          </div>
        ) : data?.live && data.embedUrl ? (
          <iframe
            src={data.embedUrl}
            title={data.title || "YouTube Live"}
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#334155] bg-[#1E293B]">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M4 7.5C4 6.672 4.672 6 5.5 6H14.5C15.328 6 16 6.672 16 7.5V16.5C16 17.328 15.328 18 14.5 18H5.5C4.672 18 4 17.328 4 16.5V7.5Z"
                    stroke="#A78BFA"
                    strokeWidth="1.7"
                  />

                  <path
                    d="M16 10L20 7.8V16.2L16 14"
                    stroke="#5B8BFF"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <p className="mt-4 text-sm font-semibold text-[#F8FAFC]">
                Creator is offline
              </p>

              <p className="mt-1 text-xs text-[#94A3B8]">
                The live preview will appear automatically when the creator
                goes live.
              </p>
            </div>
          </div>
        )}
      </div>

      {data?.live && (
        <div className="border-t border-[#334155] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-bold text-[#F8FAFC]">
                {data.title || "Live Stream"}
              </h4>

              <p className="mt-1 text-xs text-[#94A3B8]">
                YouTube Live
              </p>
            </div>

            {data.watchUrl && (
              <a
                href={data.watchUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-lg border border-[#334155] bg-[#1E293B] px-3 py-2 text-[11px] font-semibold text-[#C7D2FE] transition hover:border-[#5B8BFF] hover:text-white"
              >
                Watch
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}