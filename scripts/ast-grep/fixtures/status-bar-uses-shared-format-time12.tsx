// Violation fixture for status-bar-uses-shared-format-time12: the chip keeps its
// own formatTime12 (fires once) and imports the others without it (the file as a
// whole fires once more).
import { formatDayLong } from '../../shared/time-format';

function formatTime12(d: Date): string {
  return d.toLocaleTimeString();
}

export const Chip = ({ d }: { d: Date }) => <span>{formatDayLong(d)} @ {formatTime12(d)}</span>;
