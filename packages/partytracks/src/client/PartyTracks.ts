import {
  catchError,
  combineLatest,
  concat,
  distinctUntilChanged,
  filter,
  fromEvent,
  map,
  Observable,
  of,
  ReplaySubject,
  shareReplay,
  skip,
  switchMap,
  take,
  tap,
  withLatestFrom,
  forkJoin
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
import { fromFetch } from "./fromFetch";

export interface PartyTracksConfig {
  /**
   * Additional query parameters to append to all API requests.
   * For example, "userId=123&roomId=456"
   */
  apiExtraParams?: string;
  /**
   * Custom ICE servers to use for WebRTC connections.
   * If not provided, ICE servers will be fetched from the `/partytracks/generate-ice-servers` endpoint.
   */
  iceServers?: RTCIceServer[];
  /**
   * The part of the pathname in the original request URL that should be replaced.
   * For example, if your proxy path is /api/partytracks/*, the value should be "/api/partytracks"
   *
   * You can also provide a full URL to enable cross-domain connections:
   * For example, "https://api.example.com/partytracks" to connect to a different host.
   */
  prefix?: string;
  /**
   * Maximum number of API history entries to retain for debugging purposes.
   * Defaults to 100.
   */
  maxApiHistory?: number;
  /**
   * Custom headers to include in all API requests made by PartyTracks.
   * These headers will be appended to any existing headers for each request.
   */
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
  /**
   Useful for logging/debugging purposes.
   */
  history: History<ApiHistoryEntry>;
  /**
   An observable of the active peerConnection. If the active peerConnection
   is disrupted, a new one will be created and emitted
   */
  peerConnection$: Observable<RTCPeerConnection>;
  /**
   An observable of the active peerConnection and its associated sessionId.
   This flows from the peerConnection$, and will emit with the new peerConnection
   and a new sessionId when the peerConnection changes.
   */
  session$: Observable<{
    peerConnection: RTCPeerConnection;
    sessionId: string;
  }>;
  #transceiver$: Subject<RTCRtpTransceiver> = new ReplaySubject();
  /**
   Emits transceivers each time they are added  to the peerConnection.
   */
  transceiver$: Observable<RTCRtpTransceiver> =
    this.#transceiver$.asObservable();
  sessionError$: Observable<string>;
  /**
   An observable of the peerConnection's connectionState.
   */
  peerConnectionState$: Observable<RTCPeerConnectionState>;
  #config: PartyTracksConfig;
  #params: URLSearchParams;

  constructor(config: PartyTracksConfig = {}) {
    this.#config = {
      prefix: "/partytracks",
      maxApiHistory: 100,
      ...config
    };

    this.#params = new URLSearchParams(config.apiExtraParams);
    this.history = new History<ApiHistoryEntry>(config.maxApiHistory);
    this.session$ = makePeerConnectionSessionCombo({
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        this.#fetchWithRecordedHistory(input, init),
      params: this.#params,
      iceServers: this.#config.iceServers,
      prefix: this.#config.prefix ?? "/partytracks"
    });

    this.peerConnection$ = this.session$.pipe(
      map(({ peerConnection }) => peerConnection)
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
      shareReplay({ refCount: true, bufferSize: 1 })
    );
  }

  #taskScheduler = new FIFOScheduler();
  #pushTrackDispatcher = new BulkRequestDispatcher<
    {
      trackName: string;
      transceiver: RTCRtpTransceiver;
    },
    { tracks: TrackMetadata[] }
  >(32);
  #pullTrackDispatcher = new BulkRequestDispatcher<
    TrackMetadata,
    {
      trackMap: Map<
        TrackMetadata,
        { resolvedTrack: Promise<MediaStreamTrack>; mid: string }
      >;
    }
  >(32);
  #closeTrackDispatcher = new BulkRequestDispatcher<{ mid: string }, unknown>(
    32
  );

  async #fetchWithRecordedHistory(
    path: RequestInfo | URL,
    requestInit?: RequestInit
  ) {
    this.history.log({
      endpoint: path.toString(),
      method: requestInit?.method ?? "get",
      type: "request",
      body:
        typeof requestInit?.body === "string"
          ? JSON.parse(requestInit.body)
          : undefined
    });
    const headers = new Headers(requestInit?.headers);
    const additionalHeaders = this.#config.headers;

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
      endpoint: path.toString(),
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
    return new Observable<TrackMetadata>((subscriber) => {
      logger.debug("📤 pushing track ", trackName);
      this.#pushTrackDispatcher
        .doBulkRequest({ trackName, transceiver }, (tracks) =>
          this.#taskScheduler.schedule(async () => {
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
            const response = await this.#fetchWithRecordedHistory(
              `${this.#config.prefix}/sessions/${sessionId}/tracks/new?${this.#params}`,
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
              await signalingStateIsStable(peerConnection);
            }

            return {
              tracks: response.tracks
            };
          })
        )
        .then(({ tracks }) => {
          const trackData = tracks.find((t) => t.mid === transceiver.mid);
          if (trackData) {
            // we wait for the transceiver to start sending data before we emit
            // the track metadata to ensure that the track will be able to be
            // pulled before making the metadata available to anyone else.
            const cancelWait = waitForTransceiverToSendData(transceiver, () => {
              subscriber.next({
                ...trackData,
                sessionId,
                location: "remote"
              });
            });

            subscriber.add(() => {
              cancelWait();
              if (transceiver.mid) {
                logger.debug("🔚 Closing pushed track ", trackName);
                this.#closeTrackInBulk(
                  peerConnection,
                  transceiver.mid,
                  sessionId
                );
              }
            });
          } else {
            subscriber.error(new Error("Missing TrackData"));
          }
        })
        .catch((err) => subscriber.error(err));
    }).pipe(retryWithBackoff());
  }

  /**
   Pushes a track to the Realtime SFU. If the sourceTrack$ emits a new
   track after the initial one, the new track will replace the old one
   on the transceiver. Same with sendEncodings$, the initial values will
   be applied, and subsequent emissions will be applied.

   Additionally, if the peerConnection is disrupted and session$ emits
   a new peerConnection/sessionId combo, the track will be re-pushed,
   and will emit new TrackMetadata
   */
  push(
    sourceTrack$: Observable<MediaStreamTrack>,
    options: {
      sendEncodings$?: Observable<RTCRtpEncodingParameters[]>;
    } = {}
  ): Observable<TrackMetadata> {
    const track$ = sourceTrack$.pipe(
      shareReplay({ refCount: true, bufferSize: 1 })
    );
    const sendEncodings$ = (options.sendEncodings$ ?? of([])).pipe(
      shareReplay({ refCount: true, bufferSize: 1 })
    );
    // we want a single id for this connection, but we need to wait for
    // the first track to show up before we can proceed, so we
    const stableId$ = track$.pipe(
      take(1),
      map(() => crypto.randomUUID())
    );

    const transceiver$ = combineLatest([stableId$, this.session$]).pipe(
      withLatestFrom(track$),
      withLatestFrom(sendEncodings$),
      map(([[[stableId, session], track], sendEncodings]) => {
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

    const subsequentSendEncodings$ = concat(
      of(undefined),
      sendEncodings$.pipe(skip(1))
    );

    return combineLatest([
      pushedTrackData$,
      transceiver$,
      track$,
      subsequentSendEncodings$
    ]).pipe(
      tap(([_trackData, { transceiver }, track, sendEncodings]) => {
        if (transceiver.sender.transport !== null) {
          logger.debug("♻︎ replacing track");
          transceiver.sender.replaceTrack(track);
        }

        if (sendEncodings) {
          const parameters = transceiver.sender.getParameters();
          transceiver.sender.setParameters({
            ...parameters,
            encodings: sendEncodings
          });
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
    // make it a new object since we will us it later as key in a Map
    trackMetadata = { ...trackMetadata };
    return new Observable<{
      track: MediaStreamTrack;
      trackMetadata: TrackMetadata;
    }>((subscriber) => {
      logger.debug("📥 pulling track ", trackMetadata.trackName);
      this.#pullTrackDispatcher
        .doBulkRequest(trackMetadata, (tracks) =>
          this.#taskScheduler.schedule(async () => {
            const newTrackResponse: TracksResponse =
              await this.#fetchWithRecordedHistory(
                `${this.#config.prefix}/sessions/${sessionId}/tracks/new?${this.#params}`,
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
                await this.#fetchWithRecordedHistory(
                  `${this.#config.prefix}/sessions/${sessionId}/renegotiate?${this.#params}`,
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
                await signalingStateIsStable(peerConnection);
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
                subscriber.next({ track, trackMetadata });
                subscriber.add(() => {
                  logger.debug(
                    "🔚 Closing pulled track ",
                    trackMetadata.trackName,
                    peerConnection
                  );
                  this.#closeTrackInBulk(
                    peerConnection,
                    trackInfo.mid,
                    sessionId
                  );
                });
              })
              .catch((err) => subscriber.error(err));
          } else {
            subscriber.error(new Error("Missing Track Info"));
          }
          return trackMetadata.trackName;
        });
    }).pipe(retryWithBackoff());
  }

  /**
   Pulls a track from the Realtime SFU. If trackData$ emits new TrackMetadata
   or if the peerConnection is disrupted and session$ emits a new
   peerConnection/sessionId combo, the track will be re-pulled, and will emit
   a new MediaStreamTrack.
  */
  pull(
    trackData$: Observable<TrackMetadata>,
    options: {
      simulcast?: {
        preferredRid$: Observable<string | undefined>;
      };
    } = {}
  ): Observable<MediaStreamTrack> {
    const preferredRid$ = options.simulcast?.preferredRid$ ?? of(undefined);

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
      )
    );

    const subsequentPreferredRid$ = concat(
      of(undefined),
      preferredRid$.pipe(skip(1))
    );

    return combineLatest([
      pulledTrack$,
      this.session$,
      subsequentPreferredRid$
    ]).pipe(
      tap(
        ([
          { track, trackMetadata },
          { peerConnection, sessionId },
          preferredRid
        ]) => {
          if (preferredRid === undefined) return;
          logger.log(
            `🔧 Updating preferredRid (${preferredRid}) for trackName ${trackMetadata.trackName}`
          );
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
          this.#fetchWithRecordedHistory(
            `${this.#config.prefix}/sessions/${sessionId}/tracks/update?${this.#params}`,
            { method: "PUT", body: JSON.stringify(request) }
          );
        }
      ),
      map(([{ track }]) => track),
      shareReplay({
        refCount: true,
        bufferSize: 1
      })
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
      logger.log("Bailing a closing track because connection is closed");
      return;
    }
    this.#closeTrackDispatcher.doBulkRequest({ mid }, (mids) =>
      this.#taskScheduler.schedule(async () => {
        // No need to renegotiate and close track if the peerConnection
        // is already closed.
        if (peerConnection.connectionState === "closed") {
          logger.log("Bailing a closing track because connection is closed");
          return;
        }
        transceiver.stop();
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
        const response = await this.#fetchWithRecordedHistory(
          `${this.#config.prefix}/sessions/${sessionId}/tracks/close?${this.#params}`,
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

function waitForTransceiverToSendData(
  transceiver: RTCRtpTransceiver,
  onDataSent: () => void
): () => void {
  let delay = 1; // Start at 5ms
  let checks = 0;
  const maxDelay = 100; // Max delay of 100ms
  let timeoutId: number | undefined;
  let cancelled = false;

  const checkStats = async () => {
    if (cancelled) return;
    checks++;

    try {
      const stats = await transceiver.sender.getStats();
      let dataFound = false;
      stats.forEach((stat) => {
        if (stat.type === "outbound-rtp" && stat.bytesSent > 0) {
          dataFound = true;
        }
      });

      if (dataFound && !cancelled) {
        onDataSent();
        return;
      } else if (dataFound) {
        return;
      }
    } catch (error) {
      // Stats might not be available yet, continue checking
    }

    delay = Math.min(delay * 1.1, maxDelay); // Exponential backoff with max cap
    timeoutId = window.setTimeout(checkStats, delay);
  };

  checkStats();

  // Return cleanup function
  return () => {
    cancelled = true;
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  };
}

async function signalingStateIsStable(peerConnection: RTCPeerConnection) {
  if (peerConnection.signalingState !== "stable") {
    const connected = new Promise((res, rej) => {
      // timeout after 5s
      const timeout = setTimeout(() => {
        peerConnection.removeEventListener(
          "signalingstatechange",
          signalingStateChangeHandler
        );
        rej(new Error("Signaling State did not stabilize within 5 seconds"));
      }, 5000);
      const signalingStateChangeHandler = () => {
        if (peerConnection.signalingState === "stable") {
          peerConnection.removeEventListener(
            "signalingstatechange",
            signalingStateChangeHandler
          );
          clearTimeout(timeout);
          res(undefined);
        }
      };
      peerConnection.addEventListener(
        "signalingstatechange",
        signalingStateChangeHandler
      );
    });

    await connected;
  }
}

function makePeerConnectionSessionCombo(options: {
  iceServers?: RTCIceServer[];
  prefix: string;
  fetch: typeof fetch;
  params: URLSearchParams;
}): Observable<{
  peerConnection: RTCPeerConnection;
  sessionId: string;
}> {
  return forkJoin({
    sessionId: fromFetch(`${options.prefix}/sessions/new?${options.params}`, {
      method: "POST",
      fetcher: options.fetch,
      selector: (res) => res.json().then(({ sessionId }) => sessionId)
    }),
    iceServers: options.iceServers
      ? of(options.iceServers)
      : fromFetch(`${options.prefix}/generate-ice-servers`, {
          selector: (res) =>
            res.json().then(({ iceServers }) => iceServers as RTCIceServer[])
        })
  }).pipe(
    switchMap(
      ({ sessionId, iceServers }) =>
        new Observable<{
          sessionId: string;
          peerConnection: RTCPeerConnection;
        }>((subscriber) => {
          let iceTimeout = -1;
          const peerConnection = new RTCPeerConnection({
            iceServers,
            bundlePolicy: "max-bundle"
          });

          const reconnect = (message: string) => {
            logger.log(`💥 ${message}`);
            // emitting error will trigger new sessionId, new ice server
            // credentials and a new peerConnection to be made
            subscriber.error(new Error(message));
          };

          subscriber.add(() => peerConnection.close());
          peerConnection.addEventListener("connectionstatechange", () => {
            logger.log(
              "PeerConnection connectionstatechange: ",
              peerConnection.connectionState
            );
            if (
              peerConnection.connectionState === "failed" ||
              peerConnection.connectionState === "closed"
            ) {
              reconnect(
                `PeerConnection connectionState ${peerConnection.connectionState}`
              );
            }
          });

          peerConnection.addEventListener("iceconnectionstatechange", () => {
            logger.log(
              "PeerConnection iceconnectionstatechange: ",
              peerConnection.iceConnectionState
            );
            clearTimeout(iceTimeout);
            if (
              peerConnection.iceConnectionState === "failed" ||
              peerConnection.iceConnectionState === "closed"
            ) {
              reconnect(
                `💥 Peer iceConnectionState is ${peerConnection.iceConnectionState}`
              );
            } else if (peerConnection.iceConnectionState === "disconnected") {
              // TODO: we should start to inspect the connection stats from here on for
              // any other signs of trouble to guide what to do next (instead of just hoping
              // for the best like we do here for now)
              const timeoutSeconds = 7;
              iceTimeout = window.setTimeout(() => {
                if (peerConnection.iceConnectionState === "connected") return;
                reconnect(
                  `💥 Peer iceConnectionState was ${peerConnection.iceConnectionState} for more than ${timeoutSeconds} seconds`
                );
              }, timeoutSeconds * 1000);
            }
          });

          subscriber.next({ peerConnection, sessionId });
        })
    ),
    retryWithBackoff({
      backoffFactor: 1.1
    }),
    shareReplay({
      refCount: true,
      bufferSize: 1
    })
  );
}
