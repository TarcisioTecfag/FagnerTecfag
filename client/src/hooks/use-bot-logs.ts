
import { useEffect, useState, useRef } from 'react';

export interface LogEntry {
  message: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  timestamp: string;
}

import { useLogs } from '../components/LogProvider';

export function useBotLogs() {
  const { logs } = useLogs();
  return { logs };
}
