/**
 * WebSocket manager for real-time Command Center events.
 */

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8001/ws/live';

export interface LiveEvent {
  event_type: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  data?: Record<string, unknown>;
  timestamp: string;
}

type EventCallback = (event: LiveEvent) => void;
type StatusCallback = (status: 'connected' | 'disconnected' | 'reconnecting') => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private listeners: Set<EventCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 3000;
  private maxReconnectDelay = 30000;
  private shouldReconnect = true;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.shouldReconnect = true;
    this._connect();
  }

  private _connect(): void {
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('🔌 BloodBridge WS Connected');
        this.reconnectDelay = 3000;
        this._notifyStatus('connected');
        this._startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'heartbeat' || data.type === 'pong') return;
          this._notifyListeners(data as LiveEvent);
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onclose = () => {
        this._stopPing();
        this._notifyStatus('disconnected');
        if (this.shouldReconnect) {
          this._scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch (err) {
      this._scheduleReconnect();
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this._notifyStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
      this._connect();
    }, this.reconnectDelay);
  }

  private _startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  }

  private _stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private _notifyListeners(event: LiveEvent): void {
    this.listeners.forEach(cb => cb(event));
  }

  private _notifyStatus(status: 'connected' | 'disconnected' | 'reconnecting'): void {
    this.statusListeners.forEach(cb => cb(status));
  }

  on(callback: EventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  onStatus(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this._stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsManager = new WebSocketManager();
