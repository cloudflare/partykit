import PartySocket from "partysocket";

type CardId = "raw" | "stock" | "fixed";

const cards: Record<
  CardId,
  {
    el: HTMLElement;
    log: HTMLElement;
    status: HTMLElement;
    summary: HTMLElement;
  }
> = {
  raw: getCard("raw"),
  stock: getCard("stock"),
  fixed: getCard("fixed")
};

function getCard(id: CardId) {
  const el = document.getElementById(`card-${id}`)!;
  return {
    el,
    log: el.querySelector("[data-log]") as HTMLElement,
    status: el.querySelector("[data-status]") as HTMLElement,
    summary: el.querySelector("[data-summary]") as HTMLElement
  };
}

function append(id: CardId, line: string) {
  const ts = new Date().toISOString().slice(11, 23);
  const card = cards[id];
  if (card.log.textContent === "(no events yet)") {
    card.log.textContent = "";
  }
  card.log.textContent += `${ts}  ${line}\n`;
  card.log.scrollTop = card.log.scrollHeight;
}

function setStatus(id: CardId, label: string, kind: "ok" | "warn" | "err") {
  cards[id].status.textContent = label;
  cards[id].status.className = `badge ${kind}`;
}

function setSummary(id: CardId, text: string) {
  cards[id].summary.textContent = text;
}

const roomInput = document.getElementById("room") as HTMLInputElement;
const secondsInput = document.getElementById("seconds") as HTMLInputElement;

const sockets: Record<CardId, PartySocket | null> = {
  raw: null,
  stock: null,
  fixed: null
};

// RawAlarm uses a plain HTTP fetch (no websocket). We poll its
// snapshot endpoint to surface what alarm() observed across the
// dev-server restart. This is closer to how a "raw" DO would be
// observed in practice and avoids re-implementing partyserver's
// hibernation handshake by hand.
function getRoom() {
  return roomInput.value || "default-room";
}

function connect(id: "stock" | "fixed", party: string, room: string) {
  if (sockets[id]) {
    sockets[id]!.close();
  }
  setStatus(id, "connecting", "warn");
  const ws = new PartySocket({
    host: location.host,
    party,
    room,
    minUptime: 1000,
    maxRetries: Infinity,
    maxReconnectionDelay: 2000
  });
  ws.addEventListener("open", () => {
    setStatus(id, "open", "ok");
    append(id, "ws open");
  });
  ws.addEventListener("close", (e) => {
    setStatus(id, "closed", "warn");
    append(id, `ws close (${e.code} ${e.reason || ""})`);
  });
  ws.addEventListener("error", (e) => {
    setStatus(id, "error", "err");
    append(id, `ws error ${(e as ErrorEvent).message ?? ""}`);
  });
  ws.addEventListener("message", (e) => {
    let msg: Record<string, unknown> | null = null;
    try {
      msg = JSON.parse(e.data) as Record<string, unknown>;
    } catch {
      append(id, `← ${String(e.data).slice(0, 200)}`);
      return;
    }
    append(id, `← ${JSON.stringify(msg)}`);
    if (msg.type === "snapshot") {
      setSummary(id, summarizeSnapshot(msg));
    } else if (msg.type === "connected") {
      const ctxName = msg.ctxIdName as string | undefined;
      const partyName = msg.partyName as string | null;
      setSummary(
        id,
        `ctx.id.name=${ctxName ?? "undefined"}, this.name=${partyName ?? "(throws)"}`
      );
    }
  });
  sockets[id] = ws;
}

function summarizeSnapshot(msg: Record<string, unknown>): string {
  const obs =
    (msg.observations as { source: string; ctxIdName?: string }[]) ?? [];
  const fetches = obs.filter((o) => o.source === "fetch").length;
  const alarms = obs.filter((o) => o.source === "alarm").length;
  const lastAlarm = [...obs].reverse().find((o) => o.source === "alarm");
  const lastFetch = [...obs].reverse().find((o) => o.source === "fetch");
  return (
    `obs=${obs.length} (fetch=${fetches}, alarm=${alarms})` +
    (lastFetch
      ? ` | lastFetch.ctxIdName=${lastFetch.ctxIdName ?? "undefined"}`
      : "") +
    (lastAlarm
      ? ` | lastAlarm.ctxIdName=${lastAlarm.ctxIdName ?? "undefined"}`
      : "") +
    ` | storedPsName=${(msg.storedPsName as string | undefined) ?? "undefined"}`
  );
}

async function refreshRaw() {
  const room = getRoom();
  setStatus("raw", "fetching", "warn");
  try {
    const res = await fetch(`/raw/${encodeURIComponent(room)}?snapshot=1`);
    if (!res.ok) {
      setStatus("raw", `http ${res.status}`, "err");
      return;
    }
    setStatus("raw", "ok", "ok");
    const data = (await res.json()) as {
      ctxIdName: string | undefined;
      observations: {
        source: string;
        ctxIdName?: string;
        storedPsName?: string;
      }[];
    };
    append("raw", `← ${JSON.stringify(data).slice(0, 400)}`);
    const fetches = data.observations.filter(
      (o) => o.source === "fetch"
    ).length;
    const alarms = data.observations.filter((o) => o.source === "alarm").length;
    const lastAlarm = [...data.observations]
      .reverse()
      .find((o) => o.source === "alarm");
    setSummary(
      "raw",
      `ctx.id.name(now)=${data.ctxIdName ?? "undefined"}, obs=${data.observations.length} ` +
        `(fetch=${fetches}, alarm=${alarms})` +
        (lastAlarm
          ? ` | lastAlarm.ctxIdName=${lastAlarm.ctxIdName ?? "undefined"}`
          : "")
    );
  } catch (e) {
    setStatus("raw", "fetch failed", "err");
    append("raw", `error ${(e as Error).message}`);
  }
}

async function scheduleRaw(inSeconds: number) {
  const room = getRoom();
  await fetch(
    `/raw/${encodeURIComponent(room)}?schedule=${encodeURIComponent(String(inSeconds))}`
  );
  append("raw", `→ schedule(${inSeconds}s)`);
  await refreshRaw();
}

document.getElementById("schedule-all")!.addEventListener("click", async () => {
  const seconds = Number(secondsInput.value || "0");
  await scheduleRaw(seconds);
  for (const id of ["stock", "fixed"] as const) {
    sockets[id]?.send(JSON.stringify({ type: "schedule", inSeconds: seconds }));
    append(id, `→ schedule(${seconds}s)`);
  }
});

document.getElementById("snapshot-all")!.addEventListener("click", async () => {
  await refreshRaw();
  for (const id of ["stock", "fixed"] as const) {
    sockets[id]?.send(JSON.stringify({ type: "snapshot" }));
    append(id, `→ snapshot`);
  }
});

function reconnectAll() {
  const room = getRoom();
  connect("stock", "stock-alarm", room);
  connect("fixed", "fixed-alarm", room);
  refreshRaw();
}

roomInput.addEventListener("change", () => reconnectAll());
reconnectAll();
