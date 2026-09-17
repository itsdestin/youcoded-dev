// Violation fixture: the outgoing challenge hardcodes Connect 4.
declare const lobbyChallenge: (target: string, game: string, code: string) => void;
export const challenge = (target: string, code: string) => lobbyChallenge(target, 'connect-four', code);
