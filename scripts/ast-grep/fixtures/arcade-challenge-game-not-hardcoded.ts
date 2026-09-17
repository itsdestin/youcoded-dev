// Violation fixture: the outgoing challenge hardcodes Connect 4.
declare const lobbyChallenge: (target: string, game: string, code: string) => void;
export const challenge = (target: string, code: string) => lobbyChallenge(target, 'connect-four', code);
// Fix round 2, 2026-09-16: the same hardcode through a member-form call.
declare const api: { lobbyChallenge: (target: string, game: string, code: string) => void };
export const challengeViaApi = (target: string, code: string) => api.lobbyChallenge(target, 'connect-four', code);
