// Round two, take 2. See docs/active/design/2026-11-19-campaign-round2/takes.md.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C } from '../brand';
export const Take2: React.FC<{ narrator?: boolean }> = () => <AbsoluteFill style={{ background: C.night }} />;
