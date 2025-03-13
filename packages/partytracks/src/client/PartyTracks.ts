import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  from,
  fromEvent,
  map,
  Observable,
  of,
  ReplaySubject,
  share,
  shareReplay,
  switchMap,
  take,
  tap,
  withLatestFrom
} from "rxjs";
import invariant from "tiny-invariant";

import { History } from "./History";
import { logger } from "./logging";
import { BulkRequestDispatcher, FIFOScheduler } from "./Peer.utils";

import type {
  RenegotiationResponse,
  TrackMetadata,
  TracksResponse
} from "./callsTypes";
import type { Subject } from "rxjs";
import { retryWithBackoff } from "./rxjs-helpers";

export interface PartyTracksConfig {
  apiExtraParams?: string;
  iceServers?: RTCIceServer[];
  /**
   * The part of the pathname in the original request URL that should be replaced.
   * For example, if your proxy path is /api/partytracks/*, the value should be "/api/partytracks"
   */
  prefix?: string;
  maxApiHistory?: number;
  headers?: Headers;
}

export type ApiHistoryEntry =
  | {
      type: "request";
      method: string;
      endpoint: string;
      body: unknown;
    }
  | {
      type: "response";
      endpoint: string;
      body: unknown;
    };

export class PartyTracks {
  history: History<ApiHistoryEntry>;
  peerConnection$: Observable<RTCPeerConnection>;
  session$: Observable<{
    peerConnection: RTCPeerConnection;
    sessionId: string;
  }>;
  #transceiver$: Subject<RTCRtpTransceiver> = new ReplaySubject();
  transceiver$: Observable<RTCRtpTransceiver> =
    this.#transceiver$.asObservable();
  sessionError$: Observable<string>;
  peerConnectionState$: Observable<RTCPeerConnectionState>;
  config: PartyTracksConfig;
  #params: URLSearchParams;

  constructor(config: PartyTracksConfig = {}) {
    this.config = {
      prefix: "/partytracks",
      maxApiHistory: 100,
      ...config
    };
    this.#params = new URLSearchParams(config.apiExtraParams);
    this.history = new History<ApiHistoryEntry>(config.maxApiHistory);
    this.peerConnection$ = new Observable<RTCPeerConnection>((subscribe) => {
      let peerConnection: RTCPeerConnection;
      const setup = () => {
        peerConnection?.close();
        peerConnection = new RTCPeerConnection({
          iceServers: config.iceServers ?? [
            { urls: ["stun:stun.cloudflare.com:3478"] }
          ],
          bundlePolicy: "max-bundle"
        });
        peerConnection.addEventListener("connectionstatechange", () => {
          if (
            peerConnection.connectionState === "failed" ||
            peerConnection.connectionState === "closed"
          ) {
            logger.debug(
              `💥 Peer connectionState is ${peerConnection.connectionState}`
            );
            subscribe.next(setup());
          }
        });

        let iceTimeout = -1;
        peerConnection.addEventListener("iceconnectionstatechange", () => {
          clearTimeout(iceTimeout);
          if (
            peerConnection.iceConnectionState === "failed" ||
            peerConnection.iceConnectionState === "closed"
          ) {
            logger.debug(
              `💥 Peer iceConnectionState is ${peerConnection.iceConnectionState}`
            );
            subscribe.next(setup());
          } else if (peerConnection.iceConnectionState === "disconnected") {
            // TODO: we should start to inspect the connection stats from here on for
            // any other signs of trouble to guide what to do next (instead of just hoping
            // for the best like we do here for now)
            const timeoutSeconds = 7;
            iceTimeout = window.setTimeout(() => {
              if (peerConnection.iceConnectionState === "connected") return;
              logger.debug(
                `💥 Peer iceConnectionState was ${peerConnection.iceConnectionState} for more than ${timeoutSeconds} seconds`
              );
              subscribe.next(setup());
            }, timeoutSeconds * 1000);
          }
        });

        return peerConnection;
      };

      subscribe.next(setup());

      return () => {
        peerConnection.close();
      };
    }).pipe(
      shareReplay({
        bufferSize: 1,
        refCount: true
      })
    );

    this.session$ = this.peerConnection$.pipe(
      // TODO: Convert the promise based session creation here
      // into an observable that will close the session in cleanup
      switchMap((pc) => from(this.createSession(pc))),
      retryWithBackoff(),
      // we want new subscribers to receive the session right away
      shareReplay({
        bufferSize: 1,
        refCount: true
      })
    );

    this.sessionError$ = this.session$.pipe(
      catchError((err) =>
        of(err instanceof Error ? err.message : "Caught non-error")
      ),
      filter((value) => typeof value === "string")
    );

    this.peerConnectionState$ = this.peerConnection$.pipe(
      switchMap((peerConnection) =>
        fromEvent(
          peerConnection,
          "connectionstatechange",
          () => peerConnection.connectionState
        )
      ),
      share()
    );
  }

  taskScheduler = new FIFOScheduler();
  pushTrackDispatcher = new BulkRequestDispatcher<
    {
      trackName: string;
      transceiver: RTCRtpTransceiver;
    },
    { tracks: TrackMetadata[] }
  >(32);
  pullTrackDispatcher = new BulkRequestDispatcher<
    TrackMetadata,
    {
      trackMap: Map<
        TrackMetadata,
        { resolvedTrack: Promise<MediaStreamTrack>; mid: string }
      >;
    }
  >(32);
  closeTrackDispatcher = new BulkRequestDispatcher<{ mid: string }, unknown>(
    32
  );

  async createSession(peerConnection: RTCPeerConnection) {
    logger.debug("🆕 creating new session");
    const response = await this.fetchWithRecordedHistory(
      `${this.config.prefix}/sessions/new?${this.#params}`,
      { method: "POST" }
    );
    if (response.status > 400) {
      throw new Error("Error creating Calls session");
    }

    try {
      const { sessionId } = (await response.clone().json()) as {
        sessionId: string;
      };
      return { peerConnection, sessionId };
    } catch (error) {
      throw new Error(`${response.status}: ${await response.text()}`);
    }
  }

  async fetchWithRecordedHistory(path: string, requestInit?: RequestInit) {
    this.history.log({
      endpoint: path,
      method: requestInit?.method ?? "get",
      type: "request",
      body:
        typeof requestInit?.body === "string"
          ? JSON.parse(requestInit.body)
          : undefined
    });
    const headers = new Headers(requestInit?.headers);
    const additionalHeaders = this.config.headers;

    if (additionalHeaders) {
      additionalHeaders.forEach((value, key) => {
        headers.append(key, value);
      });
    }

    const response = await fetch(path, {
      ...requestInit,
      headers,
      redirect: "manual"
    });
    // handle Access redirect
    if (response.status === 0) {
      alert("Access session is expired, reloading page.");
      location.reload();
    }
    const responseBody = await response.clone().json();
    this.history.log({
      endpoint: path,
      type: "response",
      body: responseBody
    });
    return response;
  }

  #pushTrackInBulk(
    peerConnection: RTCPeerConnection,
    transceiver: RTCRtpTransceiver,
    sessionId: string,
    trackName: string
  ): Observable<TrackMetadata> {
    return new Observable<TrackMetadata>((subscribe) => {
      let pushedTrackPromise: Promise<unknown>;
      // we're doing this in a timeout so that we can bail if the observable
      // is unsubscribed from immediately after subscribing. This will prevent
      // React's StrictMode from causing extra API calls to push/pull tracks.
      const timeout = setTimeout(() => {
        logger.debug("📤 pushing track ", trackName);
        pushedTrackPromise = this.pushTrackDispatcher
          .doBulkRequest({ trackName, transceiver }, (tracks) =>
            this.taskScheduler.schedule(async () => {
              // create an offer
              const offer = await peerConnection.createOffer();
              // And set the offer as the local description
              await peerConnection.setLocalDescription(offer);

              const requestBody = {
                sessionDescription: {
                  sdp: offer.sdp,
                  type: "offer"
                },
                tracks: tracks.map(({ trackName, transceiver }) => ({
                  trackName,
                  mid: transceiver.mid,
                  location: "local"
                }))
              };
              const response = await this.fetchWithRecordedHistory(
                `${this.config.prefix}/sessions/${sessionId}/tracks/new?${this.#params}`,
                {
                  method: "POST",
                  body: JSON.stringify(requestBody)
                }
              ).then((res) => res.json() as Promise<TracksResponse>);
              invariant(response.tracks !== undefined);
              if (!response.errorCode) {
                await peerConnection.setRemoteDescription(
                  new RTCSessionDescription(response.sessionDescription)
                );
                await peerConnectionIsConnected(peerConnection);
              }

              return {
                tracks: response.tracks
              };
            })
          )
          .then(({ tracks }) => {
            const trackData = tracks.find((t) => t.mid === transceiver.mid);
            if (trackData) {
              subscribe.next({
                ...trackData,
                sessionId,
                location: "remote"
              });
            } else {
              subscribe.error(new Error("Missing TrackData"));
            }
          })
          .catch((err) => subscribe.error(err));
      });

      return () => {
        clearTimeout(timeout);
        pushedTrackPromise?.then(() => {
          this.taskScheduler.schedule(async () => {
            if (transceiver.mid) {
              logger.debug("🔚 Closing pushed track ", trackName);
              this.#closeTrackInBulk(
                peerConnection,
                transceiver.mid,
                sessionId
              );
            }
          });
        });
      };
    }).pipe(retryWithBackoff());
  }

  push(
    track$: Observable<MediaStreamTrack>,
    options: {
      sendEncodings?: RTCRtpEncodingParameters[];
    } = {}
  ): Observable<TrackMetadata> {
    const { sendEncodings } = options;
    // we want a single id for this connection, but we need to wait for
    // the first track to show up before we can proceed, so we
    const stableId$ = track$.pipe(
      take(1),
      map(() => crypto.randomUUID())
    );

    const transceiver$ = combineLatest([stableId$, this.session$]).pipe(
      withLatestFrom(track$),
      map(([[stableId, session], track]) => {
        const transceiver = session.peerConnection.addTransceiver(track, {
          direction: "sendonly",
          sendEncodings
        });
        logger.debug("🌱 creating transceiver!");
        this.#transceiver$.next(transceiver);
        return {
          transceiver,
          stableId,
          session
        };
      }),
      shareReplay({
        refCount: true,
        bufferSize: 1
      })
    );

    const pushedTrackData$ = transceiver$.pipe(
      switchMap(
        ({ session: { peerConnection, sessionId }, transceiver, stableId }) =>
          this.#pushTrackInBulk(
            peerConnection,
            transceiver,
            sessionId,
            stableId
          )
      )
    );

    return combineLatest([pushedTrackData$, transceiver$, track$]).pipe(
      tap(([_trackData, { transceiver }, track]) => {
        if (transceiver.sender.transport !== null) {
          logger.debug("♻︎ replacing track");
          transceiver.sender.replaceTrack(track);
        }
      }),
      map(([trackData]) => {
        const cleanedTrackData = { ...trackData };
        // explicitly remove mid since it
        // cannot be used by anyone else
        // biome-ignore lint/performance/noDelete: <explanation>
        delete cleanedTrackData.mid;
        return cleanedTrackData;
      }),
      shareReplay({
        refCount: true,
        bufferSize: 1
      })
    );
  }

  #pullTrackInBulk(
    peerConnection: RTCPeerConnection,
    sessionId: string,
    trackMetadata: TrackMetadata
  ): Observable<{
    track: MediaStreamTrack;
    trackMetadata: TrackMetadata;
  }> {
    let mid = "";
    return new Observable<{
      track: MediaStreamTrack;
      trackMetadata: TrackMetadata;
    }>((subscribe) => {
      let pulledTrackPromise: Promise<unknown>;
      // we're doing this in a timeout so that we can bail if the observable
      // is unsubscribed from immediately after subscribing. This will prevent
      // React's StrictMode from causing extra API calls to push/pull tracks.
      const timeout = setTimeout(() => {
        logger.debug("📥 pulling track ", trackMetadata.trackName);
        pulledTrackPromise = this.pullTrackDispatcher
          .doBulkRequest(trackMetadata, (tracks) =>
            this.taskScheduler.schedule(async () => {
              const newTrackResponse: TracksResponse =
                await this.fetchWithRecordedHistory(
                  `${this.config.prefix}/sessions/${sessionId}/tracks/new?${this.#params}`,
                  {
                    method: "POST",
                    body: JSON.stringify({
                      tracks
                    })
                  }
                ).then((res) => res.json() as Promise<TracksResponse>);
              if (newTrackResponse.errorCode) {
                throw new Error(newTrackResponse.errorDescription);
              }
              invariant(newTrackResponse.tracks);
              const trackMap = tracks.reduce((acc, track) => {
                const pulledTrackData = newTrackResponse.tracks?.find(
                  (t) =>
                    t.trackName === track.trackName &&
                    t.sessionId === track.sessionId
                );

                if (pulledTrackData?.mid) {
                  acc.set(track, {
                    mid: pulledTrackData.mid,
                    resolvedTrack: resolveTransceiver(
                      peerConnection,
                      (t) => t.mid === pulledTrackData.mid
                    ).then((transceiver) => {
                      this.#transceiver$.next(transceiver);
                      return transceiver.receiver.track;
                    })
                  });
                }

                return acc;
              }, new Map<TrackMetadata, { resolvedTrack: Promise<MediaStreamTrack>; mid: string }>());

              if (newTrackResponse.requiresImmediateRenegotiation) {
                await peerConnection.setRemoteDescription(
                  new RTCSessionDescription(newTrackResponse.sessionDescription)
                );
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);

                const renegotiationResponse =
                  await this.fetchWithRecordedHistory(
                    `${this.config.prefix}/sessions/${sessionId}/renegotiate?${this.#params}`,
                    {
                      method: "PUT",
                      body: JSON.stringify({
                        sessionDescription: {
                          type: "answer",
                          sdp: peerConnection.currentLocalDescription?.sdp
                        }
                      })
                    }
                  ).then((res) => res.json() as Promise<RenegotiationResponse>);
                if (renegotiationResponse.errorCode) {
                  throw new Error(renegotiationResponse.errorDescription);
                } else {
                  await peerConnectionIsConnected(peerConnection);
                }
              }

              return { trackMap };
            })
          )
          .then(({ trackMap }) => {
            const trackInfo = trackMap.get(trackMetadata);

            if (trackInfo) {
              trackInfo.resolvedTrack
                .then((track) => {
                  mid = trackInfo.mid;
                  subscribe.next({ track, trackMetadata });
                })
                .catch((err) => subscribe.error(err));
            } else {
              subscribe.error(new Error("Missing Track Info"));
            }
            return trackMetadata.trackName;
          });
      });

      return () => {
        clearTimeout(timeout);
        pulledTrackPromise?.then((trackName) => {
          if (mid) {
            logger.debug("🔚 Closing pulled track ", trackName);
            this.#closeTrackInBulk(peerConnection, mid, sessionId);
          }
        });
      };
    }).pipe(retryWithBackoff());
  }

  pull(
    trackData$: Observable<TrackMetadata>,
    options: {
      simulcast?: {
        preferredRid$: Observable<string>;
      };
    } = {}
  ): Observable<MediaStreamTrack> {
    const preferredRid$ = options.simulcast?.preferredRid$ ?? of("");

    const pulledTrack$ = combineLatest([
      this.session$,
      trackData$.pipe(
        // only necessary when pulling a track that was pushed locally to avoid
        // re-pulling when pushed track transceiver replaces track
        distinctUntilChanged((x, y) => JSON.stringify(x) === JSON.stringify(y))
      )
    ]).pipe(
      withLatestFrom(preferredRid$),
      switchMap(
        ([[{ peerConnection, sessionId }, trackData], preferredRid]) => {
          return this.#pullTrackInBulk(
            peerConnection,
            sessionId,
            preferredRid
              ? { ...trackData, simulcast: { preferredRid } }
              : trackData
          );
        }
      ),
      shareReplay({
        refCount: true,
        bufferSize: 1
      })
    );

    return combineLatest([pulledTrack$, this.session$, preferredRid$]).pipe(
      tap(
        ([
          { track, trackMetadata },
          { peerConnection, sessionId },
          preferredRid
        ]) => {
          logger.log(
            `🔧 Updating preferredRid (${preferredRid}) for trackName ${trackMetadata.trackName}`
          );
          if (!preferredRid) return;
          const transceiver = peerConnection
            .getTransceivers()
            .find((t) => t.receiver.track === track);
          if (!transceiver) return;
          const request = {
            tracks: [
              {
                ...trackMetadata,
                mid: transceiver.mid,
                simulcast: { preferredRid }
              }
            ]
          };
          this.fetchWithRecordedHistory(
            `${this.config.prefix}/sessions/${sessionId}/tracks/update?${this.#params}`,
            { method: "PUT", body: JSON.stringify(request) }
          );
        }
      ),
      map(([{ track }]) => track)
    );
  }

  async #closeTrackInBulk(
    peerConnection: RTCPeerConnection,
    mid: string,
    sessionId: string
  ) {
    const transceiver = peerConnection
      .getTransceivers()
      .find((t) => t.mid === mid);
    if (
      peerConnection.connectionState !== "connected" ||
      transceiver === undefined
    ) {
      return;
    }
    transceiver.stop();
    this.closeTrackDispatcher.doBulkRequest({ mid }, (mids) =>
      this.taskScheduler.schedule(async () => {
        // create an offer
        const offer = await peerConnection.createOffer();
        // And set the offer as the local description
        await peerConnection.setLocalDescription(offer);
        const requestBody = {
          tracks: mids,
          sessionDescription: {
            sdp: peerConnection.localDescription?.sdp,
            type: "offer"
          },
          force: false
        };
        const response = await this.fetchWithRecordedHistory(
          `${this.config.prefix}/sessions/${sessionId}/tracks/close?${this.#params}`,
          {
            method: "PUT",
            body: JSON.stringify(requestBody)
          }
        ).then((res) => res.json() as Promise<TracksResponse>);
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(response.sessionDescription)
        );
      })
    );
  }
}

async function resolveTransceiver(
  peerConnection: RTCPeerConnection,
  compare: (t: RTCRtpTransceiver) => boolean,
  timeout = 5000
) {
  return new Promise<RTCRtpTransceiver>((resolve, reject) => {
    setTimeout(reject, timeout);
    const handler = () => {
      const transceiver = peerConnection.getTransceivers().find(compare);
      if (transceiver) {
        resolve(transceiver);
        peerConnection.removeEventListener("track", handler);
      }
    };

    peerConnection.addEventListener("track", handler);
  });
}

async function peerConnectionIsConnected(peerConnection: RTCPeerConnection) {
  if (peerConnection.connectionState !== "connected") {
    const connected = new Promise((res, rej) => {
      // timeout after 5s
      const timeout = setTimeout(() => {
        peerConnection.removeEventListener(
          "connectionstatechange",
          connectionStateChangeHandler
        );
        rej();
      }, 5000);
      const connectionStateChangeHandler = () => {
        if (peerConnection.connectionState === "connected") {
          peerConnection.removeEventListener(
            "connectionstatechange",
            connectionStateChangeHandler
          );
          clearTimeout(timeout);
          res(undefined);
        }
      };
      peerConnection.addEventListener(
        "connectionstatechange",
        connectionStateChangeHandler
      );
    });

    await connected;
  }
}
