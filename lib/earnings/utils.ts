export const PLATFORM_FEE = 0.1;

export type Submission = {
  id: string;
  creator_id: string;
  interaction_type: string;
  sender_name: string | null;
  message: string | null;
  amount: number | null;
  payment_status: string | null;
  status: string | null;
  created_at: string;
};

export type DayData = {
  label: string;
  total: number;
  receive: number;
};

export type EarningsTotals = {
  totalEarnings: number;
  platformFee: number;
  creatorReceive: number;
  totalSupports: number;
};

export const money = (value: number) => `\u20B9${Math.round(value).toLocaleString("en-IN")}`;

export function getCycleStart(date: Date): Date {
  const anchor = new Date("2026-10-07T00:00:00");
  const target = new Date(date);

  const diff =
    target.getTime() - anchor.getTime();

  const days = Math.floor(
    diff / (1000 * 60 * 60 * 24)
  );

  const cycles = Math.floor(days / 15);

  const start = new Date(anchor);
  start.setDate(
    anchor.getDate() + cycles * 15
  );

  start.setHours(0, 0, 0, 0);

  return start;
}

export function getCycleEnd(start: Date): Date {
  const end = new Date(start);
  end.setDate(start.getDate() + 14);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getCycleByOffset(offset: number = 0, referenceDate: Date = new Date()) {
  const currentStart = getCycleStart(referenceDate);
  const start = new Date(currentStart);
  start.setDate(currentStart.getDate() - offset * 15);
  start.setHours(0, 0, 0, 0);
  const end = getCycleEnd(start);
  return {
    offset,
    start,
    end,
    isCurrent: offset === 0,
    label: `${formatDate(start)} - ${formatDate(end)}`,
  };
}

export function isCompleted(item: {
  payment_status?: string | null;
  status?: string | null;
}): boolean {
  const payment = String(
    item.payment_status || ""
  ).toLowerCase();

  const status = String(
    item.status || ""
  ).toLowerCase();

  return (
    payment === "paid" ||
    payment === "success" ||
    payment === "successful" ||
    payment === "completed" ||
    status === "paid" ||
    status === "success" ||
    status === "successful" ||
    status === "completed"
  );
}

export function calculateEarningsTotals(submissions: {
  amount?: number | null;
  payment_status?: string | null;
  status?: string | null;
}[]): EarningsTotals {
  const completed = submissions.filter(isCompleted);

  const totalEarnings = completed.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const platformFee = Math.round(totalEarnings * PLATFORM_FEE);
  const creatorReceive = totalEarnings - platformFee;
  const totalSupports = completed.length;

  return {
    totalEarnings,
    platformFee,
    creatorReceive,
    totalSupports,
  };
}

export function calculateCycleProgress(
  cycleStart: Date,
  isCurrentCycle: boolean,
  today: Date = new Date()
): { currentDay: number; progress: number } {
  const currentDay = isCurrentCycle
    ? Math.min(
        15,
        Math.max(
          1,
          Math.floor(
            (today.getTime() - cycleStart.getTime()) /
              (1000 * 60 * 60 * 24)
          ) + 1
        )
      )
    : 15;

  const progress = isCurrentCycle ? (currentDay / 15) * 100 : 100;

  return { currentDay, progress };
}

export function aggregateDailyEarnings(
  completedTransactions: { created_at?: string; amount?: number | null }[],
  cycleStart: Date
): DayData[] {
  const result: DayData[] = [];

  for (let i = 0; i < 15; i++) {
    const day = new Date(cycleStart);

    day.setDate(
      cycleStart.getDate() + i
    );

    const nextDay = new Date(day);

    nextDay.setDate(
      day.getDate() + 1
    );

    const dayTransactions = completedTransactions.filter((item) => {
      if (!item.created_at) return false;
      const created = new Date(item.created_at);

      return (
        created >= day &&
        created < nextDay
      );
    });

    const total = dayTransactions.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    result.push({
      label: formatShortDate(day),
      total,
      receive: total * 0.9,
    });
  }

  return result;
}

export function interactionName(type: string): string {
  const names: Record<string, string> = {
    text: "Text",
    audio: "Voice Message",
    soundboard: "Soundboard",
    stickers: "AI Sticker",
    spin_wheel: "Spin Wheel",
    tasks: "Task",
  };

  return names[type] || type;
}

export function aggregateInteractionBreakdown(
  completedTransactions: { interaction_type?: string; amount?: number | null }[]
): Record<string, { count: number; totalAmount: number; label: string }> {
  const breakdown: Record<string, { count: number; totalAmount: number; label: string }> = {};

  for (const item of completedTransactions) {
    const type = item.interaction_type || "unknown";
    if (!breakdown[type]) {
      breakdown[type] = {
        count: 0,
        totalAmount: 0,
        label: interactionName(type),
      };
    }
    breakdown[type].count += 1;
    breakdown[type].totalAmount += Number(item.amount || 0);
  }

  return breakdown;
}
