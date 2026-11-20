// Round two, take 1. See docs/active/design/2026-11-19-campaign-round2/takes.md.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C } from '../brand';
export const Take1: React.FC<{ narrator?: boolean }> = () => <AbsoluteFill style={{ background: C.night }} />;
