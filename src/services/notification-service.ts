/**
 * Notification service.
 *
 * Thin wrapper over `perry/system.notificationSend` that:
 *   - Surfaces a single `send(title, body)` method.
 *   - Silently drops notifications when the user has disabled them in
 *     the config (no need to plumb that through every caller).
 *   - Routes failures through the same explainer the rest of the app
 *     uses, so the UI can show a uniform toast.
 */
import { notificationSend } from 'perry/system';
import { explainFsError } from '../platform/index.js';
import type { ConfigService } from './config-service.js';

export class NotificationService {
    constructor(private readonly config: ConfigService) {}

    /**
     * Send a local notification. No-op if the user disabled them.
     *
     * Returns true if the notification was dispatched, false if it was
     * dropped because the user opted out.
     */
    send(title: string, body: string): boolean {
        if (!this.config.snapshot().notifications) {
            return false;
        }
        try {
            notificationSend(title, body);
            return true;
        } catch (err) {
            console.error('notification failed:', explainFsError(err));
            return false;
        }
    }
}
