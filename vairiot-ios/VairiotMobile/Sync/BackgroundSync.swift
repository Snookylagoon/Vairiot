import BackgroundTasks
import Foundation
import os

/// Drains the offline queues while the app is in the background, so field work
/// captured offline reaches the server without the app being reopened.
///
/// The identifier must be listed under `BGTaskSchedulerPermittedIdentifiers`
/// and the `processing` background mode enabled (project.yml → Info.plist).
/// iOS decides when the task actually runs (typically when the device is idle
/// and connected); it is a safety net, not a schedule.
enum BackgroundSync {

    static let taskIdentifier = "com.vairiot.mobile.sync"

    private static let logger = Logger(subsystem: "com.vairiot.mobile", category: "BackgroundSync")

    /// Must be called before the app finishes launching (VairiotApp.init).
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
            guard let task = task as? BGProcessingTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(task)
        }
    }

    /// Asks iOS for a background run. Call when the app leaves the foreground
    /// with work still queued. Re-submitting replaces the earlier request.
    @MainActor
    static func scheduleIfNeeded() {
        guard SyncManager.shared.pendingCount > 0 else { return }
        let request = BGProcessingTaskRequest(identifier: taskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Simulator and Low Power Mode refuse background tasks; foreground
            // and reconnect syncs still run.
            logger.info("Background sync not scheduled: \(error.localizedDescription)")
        }
    }

    private static func handle(_ task: BGProcessingTask) {
        let work = Task { @MainActor in
            let outcome = await SyncManager.shared.syncNow()
            scheduleIfNeeded()
            task.setTaskCompleted(success: outcome != .retry)
        }
        // Out of time: cancelling aborts the in-flight request (URLError.cancelled
        // -> network failure -> the row stays queued), then the Task completes.
        task.expirationHandler = { work.cancel() }
    }
}
