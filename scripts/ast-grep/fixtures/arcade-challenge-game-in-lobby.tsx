// Violation fixture: a lobby that always joins Connect 4.
declare const join: (code: string, game: string) => void;
export const Accept = () => <button onClick={() => join('x', 'connect-four')}>Accept</button>;
