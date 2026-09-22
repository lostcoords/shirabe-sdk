import { type Client, type ClientMeta, type Options as Options2, type RequestResult, type TDataShape } from './client/index.js';
import type { AcknowledgeAnkiChangesData, AcknowledgeAnkiChangesErrors, AcknowledgeAnkiChangesResponses, ApplyAnkiBatchData, ApplyAnkiBatchErrors, ApplyAnkiBatchResponses, BulkAddSearchData, BulkAddSearchErrors, BulkAddSearchResponses, BulkUpdateCardsData, BulkUpdateCardsErrors, BulkUpdateCardsResponses, CallMcpData, CallMcpErrors, CallMcpResponses, CancelAnkiNoteDeletionData, CancelAnkiNoteDeletionErrors, CancelAnkiNoteDeletionResponses, CancelAnkiReviewUndoData, CancelAnkiReviewUndoErrors, CancelAnkiReviewUndoResponses, CreateDeckData, CreateDeckErrors, CreateDeckResponses, DeleteAnkiMediaFileData, DeleteAnkiMediaFileErrors, DeleteAnkiMediaFileResponses, DeleteCardData, DeleteCardErrors, DeleteCardResponses, DeleteDeckData, DeleteDeckErrors, DeleteDeckResponses, DeleteDictionaryData, DeleteDictionaryErrors, DeleteDictionaryImportData, DeleteDictionaryImportErrors, DeleteDictionaryImportResponses, DeleteDictionaryResponses, DeleteWordNoteData, DeleteWordNoteErrors, DeleteWordNoteResponses, DeliverAnkiChangesData, DeliverAnkiChangesErrors, DeliverAnkiChangesResponses, DownloadAnkiMediaFileData, DownloadAnkiMediaFileErrors, DownloadAnkiMediaFileResponses, DownloadShirabeDictionaryPackData, DownloadShirabeDictionaryPackErrors, DownloadShirabeDictionaryPackResponses, DueQueueData, DueQueueErrors, DueQueueResponses, EndStudySessionData, EndStudySessionErrors, EndStudySessionResponses, FinishAnkiSnapshotData, FinishAnkiSnapshotErrors, FinishAnkiSnapshotResponses, GetAnkiBatchReceiptData, GetAnkiBatchReceiptErrors, GetAnkiBatchReceiptResponses, GetAnkiCardConflictComparisonData, GetAnkiCardConflictComparisonErrors, GetAnkiCardConflictComparisonResponses, GetAnkiCardConflictData, GetAnkiCardConflictErrors, GetAnkiCardConflictResponses, GetAnkiDeliveryReceiptData, GetAnkiDeliveryReceiptErrors, GetAnkiDeliveryReceiptResponses, GetAnkiNoteConflictData, GetAnkiNoteConflictErrors, GetAnkiNoteConflictResponses, GetAnkiNoteDeletionData, GetAnkiNoteDeletionErrors, GetAnkiNoteDeletionResponses, GetAnkiReviewUndoData, GetAnkiReviewUndoErrors, GetAnkiReviewUndoResponses, GetCardData, GetCardErrors, GetCardResponses, GetCurrentDictionaryPackData, GetCurrentDictionaryPackErrors, GetCurrentDictionaryPackResponses, GetDictionaryImportData, GetDictionaryImportErrors, GetDictionaryImportResponses, GetDictionaryPackData, GetDictionaryPackErrors, GetDictionaryPackResponses, GetDictionaryStackData, GetDictionaryStackErrors, GetDictionaryStackResponses, GetForecastData, GetForecastErrors, GetForecastResponses, GetKanjiData, GetKanjiErrors, GetKanjiRadicalData, GetKanjiRadicalErrors, GetKanjiRadicalResponses, GetKanjiResponses, GetMeData, GetMeErrors, GetMeResponses, GetParseOperationData, GetParseOperationErrors, GetParseOperationResponses, GetPreferencesData, GetPreferencesErrors, GetPreferencesResponses, GetReaderHostRulesData, GetReaderHostRulesErrors, GetReaderHostRulesResponses, GetSentenceData, GetSentenceErrors, GetSentenceResponses, GetSettingsData, GetSettingsErrors, GetSettingsResponses, GetStudySessionData, GetStudySessionErrors, GetStudySessionResponses, GetWordData, GetWordErrors, GetWordResponses, GradeCardData, GradeCardErrors, GradeCardResponses, IdentifyWordData, IdentifyWordErrors, IdentifyWordResponses, IdentifyWordsData, IdentifyWordsErrors, IdentifyWordsResponses, IgnoreWordData, IgnoreWordErrors, IgnoreWordResponses, InspectMcpTransportData, InspectMcpTransportErrors, ListAnkiMediaFilesData, ListAnkiMediaFilesErrors, ListAnkiMediaFilesResponses, ListCardsData, ListCardsErrors, ListCardsResponses, ListDecksData, ListDecksErrors, ListDecksResponses, ListDictionariesData, ListDictionariesErrors, ListDictionariesResponses, ListDictionaryImportsData, ListDictionaryImportsErrors, ListDictionaryImportsResponses, ListDictionaryPacksData, ListDictionaryPacksErrors, ListDictionaryPacksResponses, ListKanjiComponentMatchesData, ListKanjiComponentMatchesErrors, ListKanjiComponentMatchesResponses, ListKanjiComponentsData, ListKanjiComponentsErrors, ListKanjiComponentsResponses, ListKanjiData, ListKanjiErrors, ListKanjiRadicalsData, ListKanjiRadicalsErrors, ListKanjiRadicalsResponses, ListKanjiResponses, ListSentencesData, ListSentencesErrors, ListSentencesResponses, ListTagsData, ListTagsErrors, ListTagsResponses, ListWordNotesData, ListWordNotesErrors, ListWordNotesResponses, LookupWordStatesData, LookupWordStatesErrors, LookupWordStatesResponses, OauthDeviceAuthorizationData, OauthDeviceAuthorizationErrors, OauthDeviceAuthorizationResponses, OauthRevokeData, OauthRevokeErrors, OauthRevokeResponses, OauthTokenData, OauthTokenErrors, OauthTokenResponses, PairAnkiProfileData, PairAnkiProfileErrors, PairAnkiProfileResponses, ParseData, ParseErrors, ParseResponses, PrepareAnkiPublicationsData, PrepareAnkiPublicationsErrors, PrepareAnkiPublicationsResponses, RefreshAnkiCollectionSettingsData, RefreshAnkiCollectionSettingsErrors, RefreshAnkiCollectionSettingsResponses, ReplaceDictionaryStackData, ReplaceDictionaryStackErrors, ReplaceDictionaryStackResponses, RequestAnkiNoteDeletionData, RequestAnkiNoteDeletionErrors, RequestAnkiNoteDeletionResponses, RequestAnkiReviewUndoData, RequestAnkiReviewUndoErrors, RequestAnkiReviewUndoResponses, RevokeOwnKeyData, RevokeOwnKeyErrors, RevokeOwnKeyResponses, SaveCardData, SaveCardErrors, SaveCardResponses, SearchData, SearchErrors, SearchResponses, SelectAnkiDeckData, SelectAnkiDeckErrors, SelectAnkiDeckResponses, SetWordStateData, SetWordStateErrors, SetWordStateResponses, StartAnkiSnapshotData, StartAnkiSnapshotErrors, StartAnkiSnapshotResponses, StartStudySessionData, StartStudySessionErrors, StartStudySessionResponses, StudyStatsData, StudyStatsErrors, StudyStatsResponses, UndoLatestReviewData, UndoLatestReviewErrors, UndoLatestReviewResponses, UnlinkAnkiProfileData, UnlinkAnkiProfileErrors, UnlinkAnkiProfileResponses, UnsaveWordData, UnsaveWordErrors, UnsaveWordResponses, UpdateCardData, UpdateCardErrors, UpdateCardResponses, UpdateDeckData, UpdateDeckErrors, UpdateDeckResponses, UpdatePreferencesData, UpdatePreferencesErrors, UpdatePreferencesResponses, UpdateSettingsData, UpdateSettingsErrors, UpdateSettingsResponses, UploadAnkiMediaFileData, UploadAnkiMediaFileErrors, UploadAnkiMediaFileResponses, UpsertWordNoteData, UpsertWordNoteErrors, UpsertWordNoteResponses } from './types.gen.js';
export type Options<TData extends TDataShape = TDataShape, ThrowOnError extends boolean = boolean, TResponse = unknown> = Options2<TData, ThrowOnError, TResponse> & {
    /**
     * You can provide a client instance returned by `createClient()` instead of
     * individual options. This might be also useful if you want to implement a
     * custom client.
     */
    client?: Client;
    /**
     * You can pass arbitrary values through the `meta` object. This can be
     * used to access values that aren't defined as part of the SDK function.
     */
    meta?: keyof ClientMeta extends never ? Record<string, unknown> : ClientMeta;
};
/**
 * Pair a native Anki installation
 *
 * Sync writes require Pro and user:study:write.
 */
export declare const pairAnkiProfile: <ThrowOnError extends boolean = false>(options: Options<PairAnkiProfileData, ThrowOnError>) => RequestResult<PairAnkiProfileResponses, PairAnkiProfileErrors, ThrowOnError>;
/**
 * Unlink an Anki profile
 *
 * Sync writes require Pro and user:study:write.
 */
export declare const unlinkAnkiProfile: <ThrowOnError extends boolean = false>(options: Options<UnlinkAnkiProfileData, ThrowOnError>) => RequestResult<UnlinkAnkiProfileResponses, UnlinkAnkiProfileErrors, ThrowOnError>;
/**
 * Finish an Anki snapshot epoch
 *
 * Sync writes require Pro and user:study:write.
 */
export declare const finishAnkiSnapshot: <ThrowOnError extends boolean = false>(options: Options<FinishAnkiSnapshotData, ThrowOnError>) => RequestResult<FinishAnkiSnapshotResponses, FinishAnkiSnapshotErrors, ThrowOnError>;
/**
 * Start a new Anki snapshot epoch
 *
 * Sync writes require Pro and user:study:write.
 */
export declare const startAnkiSnapshot: <ThrowOnError extends boolean = false>(options: Options<StartAnkiSnapshotData, ThrowOnError>) => RequestResult<StartAnkiSnapshotResponses, StartAnkiSnapshotErrors, ThrowOnError>;
/**
 * Refresh native Anki settings and daily counters
 */
export declare const refreshAnkiCollectionSettings: <ThrowOnError extends boolean = false>(options: Options<RefreshAnkiCollectionSettingsData, ThrowOnError>) => RequestResult<RefreshAnkiCollectionSettingsResponses, RefreshAnkiCollectionSettingsErrors, ThrowOnError>;
/**
 * Prepare a bounded page of Shirabe-owned note changes
 *
 * Queues unbound notes in selected decks and recomputes bound notes against their published snapshots. Existing creation requests remain unchanged. Retry with the same request_key after a lost response. Continue using the returned after and through until complete, then fetch deliveries. Does not download media.
 */
export declare const prepareAnkiPublications: <ThrowOnError extends boolean = false>(options: Options<PrepareAnkiPublicationsData, ThrowOnError>) => RequestResult<PrepareAnkiPublicationsResponses, PrepareAnkiPublicationsErrors, ThrowOnError>;
/**
 * Select a source Anki deck
 *
 * Sync writes require Pro and user:study:write.
 */
export declare const selectAnkiDeck: <ThrowOnError extends boolean = false>(options: Options<SelectAnkiDeckData, ThrowOnError>) => RequestResult<SelectAnkiDeckResponses, SelectAnkiDeckErrors, ThrowOnError>;
/**
 * Apply a retryable Anki batch
 *
 * Sync writes require Pro and user:study:write.
 */
export declare const applyAnkiBatch: <ThrowOnError extends boolean = false>(options: Options<ApplyAnkiBatchData, ThrowOnError>) => RequestResult<ApplyAnkiBatchResponses, ApplyAnkiBatchErrors, ThrowOnError>;
/**
 * Read a byte range of an immutable Anki batch receipt
 */
export declare const getAnkiBatchReceipt: <ThrowOnError extends boolean = false>(options: Options<GetAnkiBatchReceiptData, ThrowOnError>) => RequestResult<GetAnkiBatchReceiptResponses, GetAnkiBatchReceiptErrors, ThrowOnError>;
/**
 * Read a page of a linked profile's private media manifest
 */
export declare const listAnkiMediaFiles: <ThrowOnError extends boolean = false>(options: Options<ListAnkiMediaFilesData, ThrowOnError>) => RequestResult<ListAnkiMediaFilesResponses, ListAnkiMediaFilesErrors, ThrowOnError>;
/**
 * Upload a media file with an immutable retry key and comparison digest
 */
export declare const uploadAnkiMediaFile: <ThrowOnError extends boolean = false>(options: Options<UploadAnkiMediaFileData, ThrowOnError>) => RequestResult<UploadAnkiMediaFileResponses, UploadAnkiMediaFileErrors, ThrowOnError>;
/**
 * Confirm deletion of unchanged linked media while retaining its private bytes
 */
export declare const deleteAnkiMediaFile: <ThrowOnError extends boolean = false>(options: Options<DeleteAnkiMediaFileData, ThrowOnError>) => RequestResult<DeleteAnkiMediaFileResponses, DeleteAnkiMediaFileErrors, ThrowOnError>;
/**
 * Download private media only if its digest still matches
 */
export declare const downloadAnkiMediaFile: <ThrowOnError extends boolean = false>(options: Options<DownloadAnkiMediaFileData, ThrowOnError>) => RequestResult<DownloadAnkiMediaFileResponses, DownloadAnkiMediaFileErrors, ThrowOnError>;
/**
 * Read the current comparison version for an Anki note conflict
 */
export declare const getAnkiNoteConflict: <ThrowOnError extends boolean = false>(options: Options<GetAnkiNoteConflictData, ThrowOnError>) => RequestResult<GetAnkiNoteConflictResponses, GetAnkiNoteConflictErrors, ThrowOnError>;
/**
 * Read the current comparison version for an Anki card conflict
 */
export declare const getAnkiCardConflict: <ThrowOnError extends boolean = false>(options: Options<GetAnkiCardConflictData, ThrowOnError>) => RequestResult<GetAnkiCardConflictResponses, GetAnkiCardConflictErrors, ThrowOnError>;
/**
 * Read a byte range of an immutable Anki card comparison
 */
export declare const getAnkiCardConflictComparison: <ThrowOnError extends boolean = false>(options: Options<GetAnkiCardConflictComparisonData, ThrowOnError>) => RequestResult<GetAnkiCardConflictComparisonResponses, GetAnkiCardConflictComparisonErrors, ThrowOnError>;
/**
 * Request deletion of a note and all its cards in linked Anki
 *
 * Requires every sibling card to be synchronized in selected decks.
 * Cards cannot be edited or reviewed while deletion is pending.
 * Reuse request_key when retrying the same action, including after cancellation.
 * A different key while a request is pending returns a conflict.
 *
 */
export declare const requestAnkiNoteDeletion: <ThrowOnError extends boolean = false>(options: Options<RequestAnkiNoteDeletionData, ThrowOnError>) => RequestResult<RequestAnkiNoteDeletionResponses, RequestAnkiNoteDeletionErrors, ThrowOnError>;
/**
 * Cancel one deletion before it is dispatched to Anki
 *
 * A dispatched request requires reconciliation in the add-on and cannot be cancelled here.
 */
export declare const cancelAnkiNoteDeletion: <ThrowOnError extends boolean = false>(options: Options<CancelAnkiNoteDeletionData, ThrowOnError>) => RequestResult<CancelAnkiNoteDeletionResponses, CancelAnkiNoteDeletionErrors, ThrowOnError>;
/**
 * Read one retained Anki note deletion request
 */
export declare const getAnkiNoteDeletion: <ThrowOnError extends boolean = false>(options: Options<GetAnkiNoteDeletionData, ThrowOnError>) => RequestResult<GetAnkiNoteDeletionResponses, GetAnkiNoteDeletionErrors, ThrowOnError>;
/**
 * Request Undo of a review in linked Anki
 *
 * Requests Undo of the latest delivered Shirabe review without changing its
 * history or schedule. Completion requires confirmation in the add-on.
 * Reuse request_key when retrying the same action, including after cancellation.
 * A different key while a request is pending returns a conflict.
 *
 */
export declare const requestAnkiReviewUndo: <ThrowOnError extends boolean = false>(options: Options<RequestAnkiReviewUndoData, ThrowOnError>) => RequestResult<RequestAnkiReviewUndoResponses, RequestAnkiReviewUndoErrors, ThrowOnError>;
/**
 * Cancel one Undo before it is dispatched to Anki
 *
 * A dispatched request requires reconciliation in the add-on and cannot be cancelled here.
 */
export declare const cancelAnkiReviewUndo: <ThrowOnError extends boolean = false>(options: Options<CancelAnkiReviewUndoData, ThrowOnError>) => RequestResult<CancelAnkiReviewUndoResponses, CancelAnkiReviewUndoErrors, ThrowOnError>;
/**
 * Read one retained Anki review Undo request
 */
export declare const getAnkiReviewUndo: <ThrowOnError extends boolean = false>(options: Options<GetAnkiReviewUndoData, ThrowOnError>) => RequestResult<GetAnkiReviewUndoResponses, GetAnkiReviewUndoErrors, ThrowOnError>;
/**
 * Deliver changes to native Anki
 *
 * Delivery freezes undo for included reviews before returning. It requires user:study:write even when replaying an earlier cursor. Retry the same cursor after a lost response.
 */
export declare const deliverAnkiChanges: <ThrowOnError extends boolean = false>(options: Options<DeliverAnkiChangesData, ThrowOnError>) => RequestResult<DeliverAnkiChangesResponses, DeliverAnkiChangesErrors, ThrowOnError>;
/**
 * Read a byte range of an already dispatched Anki change
 */
export declare const getAnkiDeliveryReceipt: <ThrowOnError extends boolean = false>(options: Options<GetAnkiDeliveryReceiptData, ThrowOnError>) => RequestResult<GetAnkiDeliveryReceiptResponses, GetAnkiDeliveryReceiptErrors, ThrowOnError>;
/**
 * Acknowledge durable Anki changes
 *
 * Sync writes require Pro and user:study:write.
 */
export declare const acknowledgeAnkiChanges: <ThrowOnError extends boolean = false>(options: Options<AcknowledgeAnkiChangesData, ThrowOnError>) => RequestResult<AcknowledgeAnkiChangesResponses, AcknowledgeAnkiChangesErrors, ThrowOnError>;
/**
 * Refuse unsupported MCP SSE sessions
 *
 * Shirabe is stateless and does not expose a standalone SSE stream. MCP
 * Streamable HTTP requires a server without that stream to answer GET with
 * `405 Method Not Allowed`.
 *
 */
export declare const inspectMcpTransport: <ThrowOnError extends boolean = false>(options?: Options<InspectMcpTransportData, ThrowOnError>) => RequestResult<unknown, InspectMcpTransportErrors, ThrowOnError>;
/**
 * Call the Shirabe MCP server
 *
 * Stateless Streamable HTTP endpoint for Shirabe's read-only MCP tools.
 * Dictionary search and Japanese text parsing work anonymously against
 * official dictionaries. OAuth adds the account's saved dictionary setup and,
 * for Pro accounts, accessible private dictionaries.
 *
 */
export declare const callMcp: <ThrowOnError extends boolean = false>(options: Options<CallMcpData, ThrowOnError>) => RequestResult<CallMcpResponses, CallMcpErrors, ThrowOnError>;
/**
 * Obtain or renew tokens (the OAuth 2.0 token endpoint)
 *
 * The token endpoint (RFC 6749 §3.2), for every way a connected app gets its
 * credentials. Four grants:
 *
 * - `authorization_code`: the redirect flow. Redeem the one-time `code`
 * from the `/oauth/authorize` redirect with the PKCE `code_verifier`.
 * - `refresh_token`: renewal. Trade the refresh token from the last pair for
 * the next one. Refresh tokens are **single-use and rotate**: store the
 * new pair before using it, renew single-flight, and treat
 * `invalid_grant` as "the link is over, reconnect". Presenting a refresh
 * token that was already traded (outside a short retry grace) revokes the
 * whole grant.
 * - `client_credentials`: backend-to-backend access with no user. A
 * confidential client authenticates with HTTP Basic and receives a
 * short-lived token carrying only its registered machine scopes. It never
 * receives a refresh token.
 * - `urn:ietf:params:oauth:grant-type:device_code`: the device flow (RFC
 * 8628). Poll with the `device_code` from `/oauth/device_authorization`
 * every `interval` seconds until the user approves; `authorization_pending`
 * means keep polling.
 *
 * A confidential client (registered with a secret) authenticates on every
 * call: `client_secret` in the body, or HTTP Basic with the client id and
 * secret. A public client sends only `client_id`. Accepts JSON or
 * `application/x-www-form-urlencoded`. No bearer: this is how you get one.
 *
 * Access tokens live thirty days and are sent as `Authorization: Bearer`.
 * Refresh tokens live ninety days from their last use.
 *
 */
export declare const oauthToken: <ThrowOnError extends boolean = false>(options: Options<OauthTokenData, ThrowOnError>) => RequestResult<OauthTokenResponses, OauthTokenErrors, ThrowOnError>;
/**
 * Revoke a grant (RFC 7009)
 *
 * Hand back a token the app holds, of either kind, and the whole grant behind
 * it is over: the user's approval, its access tokens and its refresh tokens.
 * Disconnecting inside an app should call this, or the approval stays on the
 * user's access list until it idles out.
 *
 * Answers `200` whatever it found (RFC 7009 §2.2): an unknown or already
 * revoked token is a revocation with nothing left to do. A token that belongs
 * to another client is left alone.
 *
 * Client authentication as for the token endpoint. No bearer.
 *
 */
export declare const oauthRevoke: <ThrowOnError extends boolean = false>(options: Options<OauthRevokeData, ThrowOnError>) => RequestResult<OauthRevokeResponses, OauthRevokeErrors, ThrowOnError>;
/**
 * Start the device flow (RFC 8628)
 *
 * For a registered client that cannot receive a redirect: a CLI, a console,
 * a TV. Returns a `user_code` to show the user and a `verification_uri` (or
 * `verification_uri_complete`, with the code filled in) for them to open and
 * approve. The client then polls the token endpoint with
 * `grant_type=urn:ietf:params:oauth:grant-type:device_code` every `interval`
 * seconds until the user has approved.
 *
 * `scope` is space-separated and is narrowed to what the client registered
 * for; omitting it asks for the default read set. Client authentication as
 * for the token endpoint. No bearer.
 *
 */
export declare const oauthDeviceAuthorization: <ThrowOnError extends boolean = false>(options: Options<OauthDeviceAuthorizationData, ThrowOnError>) => RequestResult<OauthDeviceAuthorizationResponses, OauthDeviceAuthorizationErrors, ThrowOnError>;
/**
 * Search
 *
 * Searches the caller's dictionary stack using the same tokenizer, ranking,
 * filters, and dictionary preferences as the website's
 * dictionary search. For example, Sudachi tokenization lets 食べている find
 * 食べる by its lemma.
 *
 * The response contains Shirabe's preferred segmentation of the query. Every
 * segment contains its ranked word-card matches; every match merges word,
 * name, and encyclopedia entries by canonical form. Use `include` to add kanji
 * details or example sentences to each match. The website's sentence, grammar,
 * and people search pages are not part of this operation.
 *
 * Put `#key:value` filters in `query`, send them in `filters`, or use both.
 * The two sets are merged. `limit` caps the ranked matches in each segment.
 * Each match's `id` can be passed to `GET /api/v1/words/{id}`.
 *
 * This read uses POST because it accepts a structured JSON body and depends on
 * the API key owner's preferences, so it is not edge-cacheable.
 *
 */
export declare const search: <ThrowOnError extends boolean = false>(options: Options<SearchData, ThrowOnError>) => RequestResult<SearchResponses, SearchErrors, ThrowOnError>;
/**
 * Identify a word
 *
 * Finds dictionary expressions beginning at one UTF-16 position in surrounding
 * text. This is the popup counterpart to search: it uses the caller's active
 * dictionary stack and returns overlapping spans rather than one segmentation
 * of the complete text.
 *
 * `target.endOffset` is an optional boundary hint from the caller. A matching span is
 * ranked first, but Shirabe still returns other dictionary-bearing spans that
 * begin at `target.startOffset`. No caller tokenization or dictionary override is
 * accepted. This operation does not apply contextual JEV sense ranking.
 *
 */
export declare const identifyWord: <ThrowOnError extends boolean = false>(options: Options<IdentifyWordData, ThrowOnError>) => RequestResult<IdentifyWordResponses, IdentifyWordErrors, ThrowOnError>;
/**
 * Parse Japanese text
 *
 * Returns one preferred segmentation for every item in `texts`. Shirabe uses
 * the caller's active dictionary stack, including private dictionaries, when
 * choosing useful word boundaries. It does not return alternative parses or
 * definitions; send a token to `POST /api/v1/words/identify` when the user
 * asks for its dictionary card.
 *
 * Offsets are UTF-16 and map directly to browser text nodes. Add
 * `Prefer: respond-async` to queue the same operation and poll the URL in the
 * `Location` header. The request and completed result shapes are identical in
 * synchronous and asynchronous use. `results` follows the same order as
 * `texts`, and each result repeats its submitted text.
 *
 */
export declare const parse: <ThrowOnError extends boolean = false>(options: Options<ParseData, ThrowOnError>) => RequestResult<ParseResponses, ParseErrors, ThrowOnError>;
/**
 * Get a queued parse
 *
 * Poll the parse operation URL returned by `POST /api/v1/parse`.
 */
export declare const getParseOperation: <ThrowOnError extends boolean = false>(options: Options<GetParseOperationData, ThrowOnError>) => RequestResult<GetParseOperationResponses, GetParseOperationErrors, ThrowOnError>;
/**
 * Remove a word from the owner's reviews
 *
 * Trashes every card the word holds, a word can carry a card per meaning, and
 * removing them one id at a time is N requests that can half-finish, or race a
 * save landing in between.
 *
 * Recoverable, like `DELETE /api/v1/srs/cards/{id}` and the bulk `delete` action:
 * the cards go to the trash and a scheduled sweep purges them later.
 *
 */
export declare const unsaveWord: <ThrowOnError extends boolean = false>(options: Options<UnsaveWordData, ThrowOnError>) => RequestResult<UnsaveWordResponses, UnsaveWordErrors, ThrowOnError>;
/**
 * Save a word as an SRS card
 *
 * Creates an SRS review card for a word in the API key owner's deck, the
 * `/api/v1` twin of saving from the website. Identity is (deck, front, reading),
 * so re-saving a word you already have is idempotent. `rating` is accepted
 * only for an existing card whose scheduled review is currently due; early,
 * repeated, and save-plus-first-grade submissions are rejected. Subject to
 * the plan's saved-card limit.
 *
 */
export declare const saveCard: <ThrowOnError extends boolean = false>(options: Options<SaveCardData, ThrowOnError>) => RequestResult<SaveCardResponses, SaveCardErrors, ThrowOnError>;
/**
 * Grade an SRS card
 *
 * Submits a review grade (1=Again, 2=Hard, 3=Good, 4=Easy) for one of the
 * API key owner's cards, advancing its FSRS schedule. Include sessionId to
 * grade the next card of an API session and record its Undo identity. Without
 * sessionId, this is a standalone dictionary or reader review.
 *
 */
export declare const gradeCard: <ThrowOnError extends boolean = false>(options: Options<GradeCardData, ThrowOnError>) => RequestResult<GradeCardResponses, GradeCardErrors, ThrowOnError>;
/**
 * Start an ordered study session
 *
 * Starts the owner's API study session, replacing any previous API session
 * without ending a browser session. A session expires at the next study-day
 * boundary. Pass its sessionId with reviews and Undo requests.
 * Omit deckId to study all eligible decks; selecting a linked Anki parent
 * includes its linked descendants. Cards follow captured Anki display settings
 * and daily limits. Fetch this session after each grade to receive the next card.
 *
 */
export declare const startStudySession: <ThrowOnError extends boolean = false>(options: Options<StartStudySessionData, ThrowOnError>) => RequestResult<StartStudySessionResponses, StartStudySessionErrors, ThrowOnError>;
/**
 * End an API study session
 *
 * Ends the session without undoing reviews or affecting a browser session. Repeating the request is harmless.
 */
export declare const endStudySession: <ThrowOnError extends boolean = false>(options: Options<EndStudySessionData, ThrowOnError>) => RequestResult<EndStudySessionResponses, EndStudySessionErrors, ThrowOnError>;
/**
 * Read an ordered study session
 *
 * Returns the next eligible card, counts and Undo identity. Previously
 * gathered Anki cards retain their relative order after grading. Changes from
 * another client, deck settings or card edits can rebuild the queue.
 * Grade the returned card using its current revision and this sessionId.
 *
 */
export declare const getStudySession: <ThrowOnError extends boolean = false>(options: Options<GetStudySessionData, ThrowOnError>) => RequestResult<GetStudySessionResponses, GetStudySessionErrors, ThrowOnError>;
/**
 * Undo the most recent review
 *
 * With sessionId, undoes the specified review only if it is the session's
 * latest review and the session has not expired or ended. Without sessionId,
 * the review must be a standalone review and the owner's latest in the current
 * study day. A review sent to Anki requires the Anki review-undo resources.
 * Restores its prior
 * card schedule and removes that review. Retain reviewId from each grade
 * response to walk back earlier grades in order. A stale or repeated request
 * never undoes a different review.
 *
 */
export declare const undoLatestReview: <ThrowOnError extends boolean = false>(options: Options<UndoLatestReviewData, ThrowOnError>) => RequestResult<UndoLatestReviewResponses, UndoLatestReviewErrors, ThrowOnError>;
/**
 * Set a word's learning state
 *
 * Sets a word's state for the API key owner. `retired` parks it as learned
 * (out of review, still counted toward knowledge); `reviewing` brings it into
 * the SRS rotation. Find-or-creates the word's card, state IS the card, there
 * is no separate word-state record. Retiring is ungated; `reviewing` a
 * brand-new word is subject to the plan's saved-card limit.
 *
 */
export declare const setWordState: <ThrowOnError extends boolean = false>(options: Options<SetWordStateData, ThrowOnError>) => RequestResult<SetWordStateResponses, SetWordStateErrors, ThrowOnError>;
/**
 * Batch-read word states
 *
 * Returns the API key owner's learning state for each requested word in one
 * round-trip, for re-colouring a page (e.g. a subtitle cue changing) without
 * re-parsing.
 *
 */
export declare const lookupWordStates: <ThrowOnError extends boolean = false>(options: Options<LookupWordStatesData, ThrowOnError>) => RequestResult<LookupWordStatesResponses, LookupWordStatesErrors, ThrowOnError>;
/**
 * List the owner's decks
 *
 * The API key owner's decks with per-deck card counts, for rendering a deck
 * picker or discovering a `deckId` to pass to the save endpoints.
 *
 */
export declare const listDecks: <ThrowOnError extends boolean = false>(options?: Options<ListDecksData, ThrowOnError>) => RequestResult<ListDecksResponses, ListDecksErrors, ThrowOnError>;
/**
 * Create a deck
 *
 * Creates a new deck. Writing personal SRS data requires Pro.
 */
export declare const createDeck: <ThrowOnError extends boolean = false>(options: Options<CreateDeckData, ThrowOnError>) => RequestResult<CreateDeckResponses, CreateDeckErrors, ThrowOnError>;
/**
 * Delete a deck
 *
 * Permanently removes one of the owner's decks (and its cards); requires Pro.
 */
export declare const deleteDeck: <ThrowOnError extends boolean = false>(options: Options<DeleteDeckData, ThrowOnError>) => RequestResult<DeleteDeckResponses, DeleteDeckErrors, ThrowOnError>;
/**
 * Update a deck
 *
 * Renames or reconfigures one of the owner's decks. Only the given fields change; requires Pro.
 */
export declare const updateDeck: <ThrowOnError extends boolean = false>(options: Options<UpdateDeckData, ThrowOnError>) => RequestResult<UpdateDeckResponses, UpdateDeckErrors, ThrowOnError>;
/**
 * List the owner's saved cards
 *
 * The API key owner's cards, paginated with an opaque cursor and filterable
 * by `deck`, `state`, an exact `lemma` (+ `reading`), or a `q` text search.
 *
 * A word can hold a card per meaning, so `lemma` is how you list every card a
 * word holds: `q` cannot answer that, since it matches substrings and searches
 * the meaning text too.
 *
 */
export declare const listCards: <ThrowOnError extends boolean = false>(options?: Options<ListCardsData, ThrowOnError>) => RequestResult<ListCardsResponses, ListCardsErrors, ThrowOnError>;
/**
 * Bulk-update the owner's cards
 *
 * Apply one lifecycle / deck action to many of the owner's
 * cards at once (docs/srs.md §9). Scoped to the caller: ids that aren't the
 * owner's are ignored. `cardAction` names the operation (`action` is reserved).
 *
 * `delete` soft-deletes into the trash (recoverable) and `restore` brings those
 * back; **`purge` is the permanent destroy** and cascades the cards' review
 * history. `reset` returns cards to new but keeps their `Review` rows.
 *
 */
export declare const bulkUpdateCards: <ThrowOnError extends boolean = false>(options: Options<BulkUpdateCardsData, ThrowOnError>) => RequestResult<BulkUpdateCardsResponses, BulkUpdateCardsErrors, ThrowOnError>;
/**
 * Delete (un-save) a card
 *
 * Moves one of the API key owner's cards to recoverable trash. Use the bulk
 * card operation with `cardAction=purge` for permanent removal. Requires SRS
 * entitlement, like every card mutation (docs/srs.md §10).
 *
 */
export declare const deleteCard: <ThrowOnError extends boolean = false>(options: Options<DeleteCardData, ThrowOnError>) => RequestResult<DeleteCardResponses, DeleteCardErrors, ThrowOnError>;
/**
 * Get one card
 *
 * Full detail for one of the API key owner's cards.
 */
export declare const getCard: <ThrowOnError extends boolean = false>(options: Options<GetCardData, ThrowOnError>) => RequestResult<GetCardResponses, GetCardErrors, ThrowOnError>;
/**
 * Edit a card
 *
 * Edit the card's definition or resolve a definition-drift flag (`refresh` to
 * take the dictionary's current text, `keepMine` to keep yours). Whether a card
 * follows a dictionary entry is derived from its word, not set here. Every
 * mutation of an owned card requires SRS entitlement (a lapsed subscriber is
 * read-only, docs/srs.md §10).
 *
 */
export declare const updateCard: <ThrowOnError extends boolean = false>(options: Options<UpdateCardData, ThrowOnError>) => RequestResult<UpdateCardResponses, UpdateCardErrors, ThrowOnError>;
/**
 * The study queue
 *
 * Eligible due and new cards within daily limits. Linked decks use their
 * captured Anki display settings. This is a stateless snapshot; start a session
 * at POST /api/v1/srs/sessions to preserve mixed order between grades.
 * `counts` reports the totals available, not just this batch.
 *
 */
export declare const dueQueue: <ThrowOnError extends boolean = false>(options?: Options<DueQueueData, ThrowOnError>) => RequestResult<DueQueueResponses, DueQueueErrors, ThrowOnError>;
/**
 * The owner's study stats
 *
 * Streak, totals, accuracy, and SRS-stage distribution, the /api/v1 twin of the
 * website's /stats page.
 *
 */
export declare const studyStats: <ThrowOnError extends boolean = false>(options?: Options<StudyStatsData, ThrowOnError>) => RequestResult<StudyStatsResponses, StudyStatsErrors, ThrowOnError>;
/**
 * Get the owner's FSRS study settings
 *
 * The API key owner's study settings (docs/srs.md §4, §7).
 */
export declare const getSettings: <ThrowOnError extends boolean = false>(options?: Options<GetSettingsData, ThrowOnError>) => RequestResult<GetSettingsResponses, GetSettingsErrors, ThrowOnError>;
/**
 * Update the owner's FSRS study settings
 *
 * Partial patch, only the keys sent change. Values are validated (retention
 * 0.70–0.97, cutoff 0–23, a real IANA timezone, easy days with ≥ 1 normal);
 * a bad value is rejected with 400. Updating SRS settings requires Pro.
 *
 */
export declare const updateSettings: <ThrowOnError extends boolean = false>(options: Options<UpdateSettingsData, ThrowOnError>) => RequestResult<UpdateSettingsResponses, UpdateSettingsErrors, ThrowOnError>;
/**
 * Review forecast (due-counts per day)
 *
 * Due-counts per study day for the next `days` (default 30, capped 90), split
 * young (stability < 21d) vs mature, with overdue folded into today (docs/srs.md §8).
 *
 */
export declare const getForecast: <ThrowOnError extends boolean = false>(options?: Options<GetForecastData, ThrowOnError>) => RequestResult<GetForecastResponses, GetForecastErrors, ThrowOnError>;
/**
 * List the owner's notes
 *
 * The owner's personal notes on words. Pass `text` (and optionally `reading`)
 * to fetch the note(s) for one word.
 *
 */
export declare const listWordNotes: <ThrowOnError extends boolean = false>(options?: Options<ListWordNotesData, ThrowOnError>) => RequestResult<ListWordNotesResponses, ListWordNotesErrors, ThrowOnError>;
/**
 * Create or update a note
 *
 * Upserts the note for a word, keyed by (text, reading). Requires Pro.
 */
export declare const upsertWordNote: <ThrowOnError extends boolean = false>(options: Options<UpsertWordNoteData, ThrowOnError>) => RequestResult<UpsertWordNoteResponses, UpsertWordNoteErrors, ThrowOnError>;
/**
 * Delete a note
 *
 * Removes one of the owner's notes. Requires Pro.
 */
export declare const deleteWordNote: <ThrowOnError extends boolean = false>(options: Options<DeleteWordNoteData, ThrowOnError>) => RequestResult<DeleteWordNoteResponses, DeleteWordNoteErrors, ThrowOnError>;
/**
 * Ignore a word (blacklist)
 *
 * Marks a word "don't study," so bulk seeds / clones skip it (docs/srs.md
 * §13b). No card is created. Requires SRS entitlement.
 *
 */
export declare const ignoreWord: <ThrowOnError extends boolean = false>(options: Options<IgnoreWordData, ThrowOnError>) => RequestResult<IgnoreWordResponses, IgnoreWordErrors, ThrowOnError>;
/**
 * Add a search's words to a deck
 *
 * Bulk-seeds the words matching a search query into a deck (new or existing),
 * skipping ones you already have as a card, marked known, or ignored
 * (docs/srs.md §13b). Word results only; capped at 5000. Requires SRS
 * entitlement.
 *
 */
export declare const bulkAddSearch: <ThrowOnError extends boolean = false>(options: Options<BulkAddSearchData, ThrowOnError>) => RequestResult<BulkAddSearchResponses, BulkAddSearchErrors, ThrowOnError>;
/**
 * Identify which word each parsed token is
 *
 * Answers which dictionary word each token is, as a ranked list of candidates
 * rather than a verdict. This is the call to make when a reader taps a word.
 *
 * **This is not `POST /api/v1/search`, and the difference is the point.**
 * Search matches a string a PERSON typed: fuzzy, paginated, and with no idea
 * what the word was doing in a sentence. These are tokens a MACHINE produced,
 * and they carry the two things a spelling cannot tell you: 開いた read
 * ヒライタ is ひらく and read アイタ is あく, and きみ read as a pronoun is 君
 * rather than the grain the spelling happens to be filed under.
 *
 * **A word is ranked, never filtered. Grammar is filtered.** Where a token is a
 * particle, an auxiliary or a conjunction, its part of speech is not a hint to
 * rank with, it is the identification: `は` comes back as the topic marker
 * alone, not with 歯, 葉, 刃 and 派 behind it, all of which its class had
 * already ruled out. A content token still offers every word its spelling can
 * name, which is where the list earns its length.
 *
 * **Nothing has to be stored for this to keep working.** An id is our decision
 * about which word a token is, so it moves when we get better at deciding; the
 * token does not move. Keep the parse token and ask again whenever a reader
 * taps. You will get whatever we know today. Reparse when `stackFingerprint`
 * changes if your application needs boundaries from the current dictionary
 * stack.
 *
 * Batched because a page has many words and a round trip is expensive. Not
 * paginated, deliberately: a candidate list is short by nature, and you asked
 * about specific tokens rather than browsing.
 *
 */
export declare const identifyWords: <ThrowOnError extends boolean = false>(options: Options<IdentifyWordsData, ThrowOnError>) => RequestResult<IdentifyWordsResponses, IdentifyWordsErrors, ThrowOnError>;
/**
 * Get a word
 *
 * Returns full detail for one word, addressed by its headword slug
 * (`猫`, `私-わたくし`, `開く-ひらく-1202650`). The `word` card merges every
 * source in the API key owner's active dictionary stack with complete senses.
 * Use `?include=sentences` to add up to 20 preview sentences. Use
 * `/api/v1/sentences` when you need filtering or pagination.
 *
 * The reading disambiguator may be written in either kana script, so a
 * caller holding a morphological analyser's katakana reading looks a word
 * up without converting first: `私-ワタクシ` resolves to the same entry as
 * `私-わたくし`.
 *
 * This answers "show me this selected word". Use `POST /api/v1/identify` to
 * determine which word begins at a position in text, or `POST /api/v1/search`
 * to search without a known position.
 *
 */
export declare const getWord: <ThrowOnError extends boolean = false>(options: Options<GetWordData, ThrowOnError>) => RequestResult<GetWordResponses, GetWordErrors, ThrowOnError>;
/**
 * Search example sentences
 *
 * Searches ready official sentence corpora using the website's behavior.
 * Japanese words include linked inflections and dictionary forms, Japanese
 * phrases match the complete phrase, and non-Japanese text searches selected
 * translations. Provide either `query` or `filter[wordId]`.
 *
 * Personal sentence banks, mining, and i+1 recommendations belong to Study
 * and are not included here.
 *
 */
export declare const listSentences: <ThrowOnError extends boolean = false>(options?: Options<ListSentencesData, ThrowOnError>) => RequestResult<ListSentencesResponses, ListSentencesErrors, ThrowOnError>;
/**
 * Get a sentence
 *
 * Returns one official-corpus sentence by the stable ID returned from sentence search.
 */
export declare const getSentence: <ThrowOnError extends boolean = false>(options: Options<GetSentenceData, ThrowOnError>) => RequestResult<GetSentenceResponses, GetSentenceErrors, ThrowOnError>;
/**
 * List the dictionary code definitions
 *
 * Resolves every coded field the API emits (parts of speech, misc, field,
 * dialect, name-type) to a human label and description in the requested
 * language selected by `Accept-Language`. Cache it once and resolve
 * `{ code }` values client-side.
 *
 */
export declare const listTags: <ThrowOnError extends boolean = false>(options?: Options<ListTagsData, ThrowOnError>) => RequestResult<ListTagsResponses, ListTagsErrors, ThrowOnError>;
/**
 * List available dictionaries
 *
 * Resolves dictionary slugs used across lookup results and source filters to
 * names, content kinds, languages, capabilities, and attribution. Personal
 * uploads are included when the key carries the user:dictionary:read scope.
 *
 */
export declare const listDictionaries: <ThrowOnError extends boolean = false>(options?: Options<ListDictionariesData, ThrowOnError>) => RequestResult<ListDictionariesResponses, ListDictionariesErrors, ThrowOnError>;
/**
 * Remove access to a personal dictionary
 *
 * Removes the dictionary from the account and its dictionary stack. Shared content may be retained for another entitled account.
 */
export declare const deleteDictionary: <ThrowOnError extends boolean = false>(options: Options<DeleteDictionaryData, ThrowOnError>) => RequestResult<DeleteDictionaryResponses, DeleteDictionaryErrors, ThrowOnError>;
/**
 * Get the account's dictionary stack
 *
 * Returns enabled dictionaries in lookup order. Language order within each source controls definition order.
 */
export declare const getDictionaryStack: <ThrowOnError extends boolean = false>(options?: Options<GetDictionaryStackData, ThrowOnError>) => RequestResult<GetDictionaryStackResponses, GetDictionaryStackErrors, ThrowOnError>;
/**
 * Replace the account's dictionary stack
 *
 * Replaces dictionary order, definition-language order, and reveal behavior together.
 */
export declare const replaceDictionaryStack: <ThrowOnError extends boolean = false>(options: Options<ReplaceDictionaryStackData, ThrowOnError>) => RequestResult<ReplaceDictionaryStackResponses, ReplaceDictionaryStackErrors, ThrowOnError>;
/**
 * List personal dictionary imports
 */
export declare const listDictionaryImports: <ThrowOnError extends boolean = false>(options?: Options<ListDictionaryImportsData, ThrowOnError>) => RequestResult<ListDictionaryImportsResponses, ListDictionaryImportsErrors, ThrowOnError>;
/**
 * Delete a queued or failed personal dictionary import
 */
export declare const deleteDictionaryImport: <ThrowOnError extends boolean = false>(options: Options<DeleteDictionaryImportData, ThrowOnError>) => RequestResult<DeleteDictionaryImportResponses, DeleteDictionaryImportErrors, ThrowOnError>;
/**
 * Get a personal dictionary import
 */
export declare const getDictionaryImport: <ThrowOnError extends boolean = false>(options: Options<GetDictionaryImportData, ThrowOnError>) => RequestResult<GetDictionaryImportResponses, GetDictionaryImportErrors, ThrowOnError>;
/**
 * List offline dictionary packs available to the account
 *
 * Returns the structured account dictionary stack and the shared base pack
 * plus every membership-gated personal overlay available offline. A missing or
 * stale personal overlay is built after the request and returns 202 with its
 * slug in `pendingPacks`.
 *
 */
export declare const listDictionaryPacks: <ThrowOnError extends boolean = false>(options?: Options<ListDictionaryPacksData, ThrowOnError>) => RequestResult<ListDictionaryPacksResponses, ListDictionaryPacksErrors, ThrowOnError>;
/**
 * Get the current offline dictionary pack manifest
 *
 * Public, cacheable metadata for the compressed EN/ES dictionary pack used by
 * Shirabe Reader. `downloadUrl` may point directly at the public R2 bucket or
 * at the Rails development fallback. Clients verify `sha256` before importing.
 *
 */
export declare const getCurrentDictionaryPack: <ThrowOnError extends boolean = false>(options?: Options<GetCurrentDictionaryPackData, ThrowOnError>) => RequestResult<GetCurrentDictionaryPackResponses, GetCurrentDictionaryPackErrors, ThrowOnError>;
/**
 * Download an immutable Shirabe dictionary pack
 *
 * Public development fallback for the base pack named by the current
 * manifest. Production manifests may point directly to public object storage.
 *
 */
export declare const downloadShirabeDictionaryPack: <ThrowOnError extends boolean = false>(options: Options<DownloadShirabeDictionaryPackData, ThrowOnError>) => RequestResult<DownloadShirabeDictionaryPackResponses, DownloadShirabeDictionaryPackErrors, ThrowOnError>;
/**
 * Get an immutable dictionary pack
 *
 * Downloads an immutable personal-dictionary overlay available to the
 * authenticated account. The public Shirabe base pack has its own route.
 *
 */
export declare const getDictionaryPack: <ThrowOnError extends boolean = false>(options: Options<GetDictionaryPackData, ThrowOnError>) => RequestResult<GetDictionaryPackResponses, GetDictionaryPackErrors, ThrowOnError>;
/**
 * Get browser-reader host parsing rules
 *
 * Public, versioned data describing supported host patterns and parser selectors. It never contains executable code.
 */
export declare const getReaderHostRules: <ThrowOnError extends boolean = false>(options?: Options<GetReaderHostRulesData, ThrowOnError>) => RequestResult<GetReaderHostRulesResponses, GetReaderHostRulesErrors, ThrowOnError>;
/**
 * API key owner profile and limits
 *
 * Returns the profile, the limits this key is held to, and
 * dictionary preferences for the user that owns the API key. All of it is
 * covered by user:profile:read.
 *
 */
export declare const getMe: <ThrowOnError extends boolean = false>(options?: Options<GetMeData, ThrowOnError>) => RequestResult<GetMeResponses, GetMeErrors, ThrowOnError>;
/**
 * Revoke the credential this request was made with
 *
 * Cuts off the credential the request arrived on, immediately and
 * permanently: a personal API key, or for an app, the whole OAuth grant its
 * access token belongs to. An OAuth client should prefer
 * `POST /api/v1/oauth/revoke` (RFC 7009), which takes the token in the body;
 * this exists so a client holding nothing but an access token can still let
 * go, and so an API key can revoke itself.
 *
 * Needs no scope. A credential proves it is itself by being the one on the
 * request, and gating this would let a narrow one be handed out and never
 * taken back.
 *
 * Revocation is soft and terminal: it stops working at once and cannot be
 * restored. Reconnect (or mint a new key) to come back. A second call
 * answers 401, because by then it can no longer authenticate.
 *
 */
export declare const revokeOwnKey: <ThrowOnError extends boolean = false>(options?: Options<RevokeOwnKeyData, ThrowOnError>) => RequestResult<RevokeOwnKeyResponses, RevokeOwnKeyErrors, ThrowOnError>;
/**
 * Get the API key owner's reader preferences
 */
export declare const getPreferences: <ThrowOnError extends boolean = false>(options?: Options<GetPreferencesData, ThrowOnError>) => RequestResult<GetPreferencesResponses, GetPreferencesErrors, ThrowOnError>;
/**
 * Update the API key owner's reader preferences
 *
 * A partial update, send only the fields you want to change.
 *
 * `sentenceLanguages` (ordered, `ja` = immersion) and `sentenceTranslation` (show|hover|hide) are separate axes governing example sentences.
 *
 */
export declare const updatePreferences: <ThrowOnError extends boolean = false>(options: Options<UpdatePreferencesData, ThrowOnError>) => RequestResult<UpdatePreferencesResponses, UpdatePreferencesErrors, ThrowOnError>;
/**
 * Browse the kanji index
 *
 * Returns the KANJIDIC index that backs the website's `/kanji`
 * page, grouped by `groupBy`. Without a group filter, each group contains a
 * small preview. Pass `filter[group]` to paginate one complete group. For
 * example, `?groupBy=kanken&filter[group]=2` returns level-2 kanji.
 *
 * JLPT and Kanken grouping include characters ranked by those systems. Stroke,
 * radical, and frequency grouping include every available KANJIDIC character.
 * The dictionary data is versioned, so this endpoint is safe to cache.
 *
 */
export declare const listKanji: <ThrowOnError extends boolean = false>(options?: Options<ListKanjiData, ThrowOnError>) => RequestResult<ListKanjiResponses, ListKanjiErrors, ThrowOnError>;
/**
 * List radicals
 *
 * Returns radicals (部首) and their displayed forms using the website's grouping.
 */
export declare const listKanjiRadicals: <ThrowOnError extends boolean = false>(options?: Options<ListKanjiRadicalsData, ThrowOnError>) => RequestResult<ListKanjiRadicalsResponses, ListKanjiRadicalsErrors, ThrowOnError>;
/**
 * Get a radical
 *
 * Returns one radical and a cursor-paginated list of all KANJIDIC characters that use it.
 */
export declare const getKanjiRadical: <ThrowOnError extends boolean = false>(options: Options<GetKanjiRadicalData, ThrowOnError>) => RequestResult<GetKanjiRadicalResponses, GetKanjiRadicalErrors, ThrowOnError>;
/**
 * List kanji components
 *
 * Returns the component glyphs available for component-based kanji discovery.
 */
export declare const listKanjiComponents: <ThrowOnError extends boolean = false>(options?: Options<ListKanjiComponentsData, ThrowOnError>) => RequestResult<ListKanjiComponentsResponses, ListKanjiComponentsErrors, ThrowOnError>;
/**
 * Find kanji by components
 *
 * Returns kanji containing every requested component, plus components that
 * can still narrow the current selection.
 *
 */
export declare const listKanjiComponentMatches: <ThrowOnError extends boolean = false>(options?: Options<ListKanjiComponentMatchesData, ThrowOnError>) => RequestResult<ListKanjiComponentMatchesResponses, ListKanjiComponentMatchesErrors, ThrowOnError>;
/**
 * Look up a kanji
 *
 * Returns the KANJIDIC character. Use `include` for dictionary-aware compounds
 * and the optional relationships shown by the website.
 *
 */
export declare const getKanji: <ThrowOnError extends boolean = false>(options: Options<GetKanjiData, ThrowOnError>) => RequestResult<GetKanjiResponses, GetKanjiErrors, ThrowOnError>;
//# sourceMappingURL=sdk.gen.d.ts.map